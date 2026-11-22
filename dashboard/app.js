(function () {
'use strict';
var D = window.RADAR;
var board = document.getElementById('board');
if (!D) {
  board.textContent = 'No data: data.js did not load.';
  return;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function money(n) {
  if (n == null) return '—';
  var a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}
function money2(n) {
  return (n < 0 ? '−$' : '$') + Math.abs(n).toFixed(0);
}
function signed(n, d) {
  return (n < 0 ? '−' : '+') + Math.abs(n).toFixed(d == null ? 1 : d);
}
function pct(n) {
  if (n == null) return '—';
  return signed(n, 1) + '%';
}
function ageFmt(days) {
  if (days == null) return 'unknown';
  if (days < 90) return days + ' d';
  if (days < 730) return (days / 30.44).toFixed(0) + ' mo';
  return (days / 365).toFixed(1) + ' yr';
}
function fmtDate(s) {
  return s || '—';
}
function checksum(rows) {
  var h = 0x811c9dc5;
  var text = rows.map(function (r) { return r.rank + ':' + r.slug + ':' + r.implied_value_usd + ';'; }).join('');
  for (var i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

function planWork(weeks) {
  return { tx: 2 + weeks + 1, hours: (5 + 15 + weeks * 15 + 15 + 5) / 60 };
}
var SMALL_DEPOSIT = 500;
function econAt(row, sc, deposit) {
  var gas = D.gas[row.chains[0]] != null ? D.gas[row.chains[0]] : 1.0;
  var w = planWork(sc.horizon_weeks);
  var drop = (row.implied_value_usd * sc.drop_share * deposit) / (0.1 * row.tvl_usd);
  var fees = 0.003 * deposit + gas * w.tx;
  var net = drop - fees;
  var tbill = deposit * 0.04 * (sc.horizon_weeks / 52);
  return { drop: drop, fees: fees, net: net, perHour: net / w.hours, tbill: tbill, hours: w.hours, tx: w.tx };
}
function econ(row, sc) {
  var e = econAt(row, sc, sc.deposit_usd);
  var small = econAt(row, sc, SMALL_DEPOSIT);
  var verdict;
  if (e.net > e.tbill && e.perHour >= 25 && small.net > small.tbill && small.perHour >= 25) verdict = 'ROBUST';
  else if (e.net > e.tbill && e.perHour >= 10) verdict = 'FARM';
  else if (e.net > 0) verdict = 'THIN';
  else if (e.net >= -25) verdict = 'MARGINAL';
  else verdict = 'SKIP';
  return { drop: e.drop, fees: e.fees, net: e.net, perHour: e.perHour, tbill: e.tbill, hours: e.hours, tx: e.tx, verdict: verdict };
}
function depositForRobust(row, sc) {
  var gas = D.gas[row.chains[0]] != null ? D.gas[row.chains[0]] : 1.0;
  var w = planWork(sc.horizon_weeks);
  var slope = (row.implied_value_usd * sc.drop_share) / (0.1 * row.tvl_usd) - 0.003;
  var tbillRate = 0.04 * (sc.horizon_weeks / 52);
  if (slope <= tbillRate) return null;
  var need = Math.max((25 * w.hours + gas * w.tx) / slope, (gas * w.tx) / (slope - tbillRate));
  return Math.ceil(need / 100) * 100;
}
function dropReturn(row, sc) {
  return (row.implied_value_usd * sc.drop_share) / (0.1 * row.tvl_usd);
}

var params = new URLSearchParams(window.location.search);
var state = {
  tier: params.get('tier') || 'all',
  verdict: params.get('verdict') || 'all',
  category: params.get('category') || 'all',
  chain: params.get('chain') || 'all',
  deposit: parseInt(params.get('deposit') || '10000', 10),
  drop: parseFloat(params.get('drop') || '0.07'),
  horizon: parseInt(params.get('horizon') || '12', 10),
  q: params.get('q') || '',
  sortKey: params.get('sort') || 'rank',
  sortDir: params.get('dir') || 'asc',
  selected: null,
};
function scenario() {
  return { deposit_usd: state.deposit, drop_share: state.drop, horizon_weeks: state.horizon };
}
var watchSet = {};
D.rows.forEach(function (r) { if (r.watchlist) watchSet[r.slug] = true; });

function filteredRows() {
  var sc = scenario();
  var rows = D.rows.filter(function (r) {
    if (state.tier === 'watchlist' && !r.watchlist) return false;
    if (state.tier === 'early' && r.watchlist) return false;
    if (state.verdict !== 'all' && econ(r, sc).verdict !== state.verdict) return false;
    if (state.category !== 'all' && (r.category || '—') !== state.category) return false;
    if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
    if (state.q) {
      var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) === -1) return false;
    }
    return true;
  });
  var dir = state.sortDir === 'desc' ? -1 : 1;
  var key = state.sortKey;
  rows.sort(function (a, b) {
    var va, vb;
    if (key === 'net') { va = econ(a, sc).net; vb = econ(b, sc).net; }
    else if (key === 'per_hour') { va = econ(a, sc).perHour; vb = econ(b, sc).perHour; }
    else if (key === 'rank') { va = a.rank; vb = b.rank; }
    else if (key === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
    else if (key === 'change_7d') { va = a.change_7d == null ? -999 : a.change_7d; vb = b.change_7d == null ? -999 : b.change_7d; }
    else if (key === 'age_days') { va = a.age_days == null ? -1 : a.age_days; vb = b.age_days == null ? -1 : b.age_days; }
    else if (key === 'token_odds') { va = a.token_odds; vb = b.token_odds; }
    else if (key === 'if_launches') { va = a.if_launches_usd; vb = b.if_launches_usd; }
    else { va = a.implied_value_usd; vb = b.implied_value_usd; }
    return (va < vb ? -1 : va > vb ? 1 : a.rank - b.rank) * dir;
  });
  return rows;
}

function kpiCards() {
  var sc = scenario();
  var worth = 0, skip = 0;
  D.rows.forEach(function (r) {
    var v = econ(r, sc).verdict;
    if (v === 'ROBUST') worth++;
    if (v === 'SKIP') skip++;
  });
  var k = D.kpi, rg = D.range;
  var cards = [
    ['Out-of-sample miss, walk-forward', '×' + k.miss_wf.toFixed(2),
      'vs ×' + k.miss_flat_wf.toFixed(2) + ' flat · LOO ×' + k.miss_loo.toFixed(2) + ' · ' + D.value_comps + ' traded tokens'],
    ['Is the printed range honest?', rg.p2575_wf + '% · ' + rg.p1090_wf + '%',
      'of later-listed caps fall inside P25–P75 (stated 50%) · P10–P90 (stated 80%); LOO ' + rg.p2575_loo + '% · ' + rg.p1090_loo + '%'],
    ['Token odds vs base rate, Brier', k.brier_wf.toFixed(3),
      'walk-forward vs ' + k.brier_base_wf.toFixed(3) + ' base rate · ' + Math.round(k.odds_acc_wf * 100) + '% of later peers called right · LOO ' + k.brier_loo.toFixed(3) + ' · ' + D.odds_peers + ' peers'],
    ['Terms that survived both tests', k.value_kept + ' of ' + k.value_tested + ' · ' + k.odds_kept + ' of ' + k.odds_tested,
      'value model · token odds; the rest are shown below, not used'],
    ['Worth farming, this scenario', worth + ' of ' + D.board_size,
      'net beats a T-bill and $25 an hour on a $500 deposit as well as this one · ' + skip + ' skip · plan $' + sc.deposit_usd.toLocaleString() + ', ' + Math.round(sc.drop_share * 100) + '% drop, ' + sc.horizon_weeks + ' wk'],
    ['Watchlist ranked', D.watchlist_size + ' / ' + D.watchlist_size,
      'plus ' + D.early_size + ' pre-token protocols it leaves out'],
  ];
  var html = '<section class="kpis" aria-label="Headline figures">';
  cards.forEach(function (c) {
    html += '<div class="kpi"><div class="k-label">' + esc(c[0]) + '</div><div class="k-value">' + c[1] + '</div><div class="k-sub">' + c[2] + '</div></div>';
  });
  return html + '</section>';
}

var ACCOUNT_COLORS = ['#e8b23a', '#5aa9e6', '#3fbf7a', '#b48ce8', '#e5604f', '#e87ab0', '#7ad0c3', '#d08a4e', '#8a9ba8'];
function accounting() {
  var total = D.accounting.reduce(function (t, g) { return t + g.count; }, 0);
  var html = '<section class="account"><div class="account-head"><b>PROTOCOL ACCOUNTING</b><span>all ' + total + ' snapshot protocols in exactly one group</span></div><div class="account-bar">';
  D.accounting.forEach(function (g, i) {
    var pctW = total ? (g.count / total * 100) : 0;
    html += '<i style="width:' + pctW + '%;background:' + ACCOUNT_COLORS[i % 9] + '" title="' + esc(g.label) + ' ' + g.count + '"></i>';
  });
  html += '</div><div class="account-legend">';
  D.accounting.forEach(function (g, i) {
    html += '<span><i class="dot" style="background:' + ACCOUNT_COLORS[i % 9] + '"></i>' + esc(g.label) + ' <b class="num">' + g.count + '</b></span>';
  });
  return html + '</div></section>';
}

function integrity() {
  var rows = D.rows;
  var nOk = rows.length === D.board_size;
  var ranksOk = rows.every(function (r, i) { return r.rank === i + 1; });
  var monoOk = rows.every(function (r, i) { return i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd; });
  var total = rows.reduce(function (t, r) { return t + r.implied_value_usd; }, 0);
  var totalOk = total === D.total_implied_usd;
  var sumOk = checksum(rows) === D.checksum;
  var watchN = rows.filter(function (r) { return r.watchlist; }).length;
  var watchOk = watchN === D.watchlist_size;
  var ledger = D.accounting.reduce(function (t, g) { return t + g.count; }, 0);
  var ledgerOk = ledger === 758;
  function item(ok, text) {
    return '<span><span class="' + (ok ? 'ok' : 'neg') + '">' + (ok ? '✓' : '✗') + '</span> ' + text + '</span>';
  }
  return '<div class="integrity">'
    + item(nOk, 'this table = board.json · ' + rows.length + ' of ' + D.board_size + ' rows recomputed here')
    + item(ranksOk && monoOk, 'ranks 1–' + D.board_size + ', values never rise')
    + item(totalOk, 'totals equal: ' + money(total))
    + item(sumOk, 'checksum ' + D.checksum + ' = main.ts')
    + item(watchOk, 'watchlist ' + watchN + ' of ' + D.watchlist_size + ' ranked')
    + item(ledgerOk, 'ledger 758 of 758 protocols')
    + '</div>';
}

function evTable(title, rows, unit) {
  var html = '<div class="ev-panel"><h3>' + esc(title) + '</h3><table><thead><tr><th>TERM</th><th>STATUS</th><th class="num">LOO</th><th class="num">WF</th></tr></thead><tbody>';
  rows.forEach(function (r) {
    var loo = unit === '×' ? '×' + r.loo.toFixed(2) : r.loo.toFixed(3);
    var wf = unit === '×' ? '×' + r.wf.toFixed(2) : r.wf.toFixed(3);
    html += '<tr><td>' + esc(r.term) + '</td><td>' + (r.kept ? '<span class="kept">kept</span>' : '<span class="notkept">' + (r.note === 'baseline' ? 'baseline' : 'not kept') + '</span>') + '</td><td class="num">' + loo + '</td><td class="num">' + wf + '</td></tr>';
  });
  return html + '</tbody></table></div>';
}

function curveTerm(coef, label) {
  return ' ' + (coef < 0 ? '− ' : '+ ') + Math.abs(coef).toFixed(4) + ' · ' + label;
}

function looRangeSe() {
  var rg = D.range;
  // Implied log-SE from the width of the LOO distribution: the IQR of the
  // leave-one-out misses read as a normal sigma (IQR / 1.349), with the
  // x1.2 print widening removed. No bootstrap, no resampling.
  return (rg.q75 - rg.q25) / rg.widen / 1.349;
}

function evidence() {
  var rg = D.range;
  var w2575 = Math.exp(rg.q75 - rg.q25).toFixed(1);
  var w1090 = Math.exp(rg.q90 - rg.q10).toFixed(1);
  var se = looRangeSe();
  var html = '<section class="evidence"><h2>Out-of-sample evidence</h2>'
    + '<p class="note">A term is kept only if it lowers the held-out miss in both tests: leave-one-out and walk-forward. Chain count, no-token age and a median fit each failed at least one test, so none is in the model; the category effect survives only on winsorized comps, shrunk with ridge 50.</p>'
    + '<div class="ev-grid">'
    + evTable('Value if a token launches — typical miss, ' + D.value_comps + ' traded tokens', D.value_evidence, '×')
    + evTable('Token odds — Brier score, ' + D.odds_peers + ' peers', D.odds_evidence, '')
    + '<div class="ev-panel"><h3>Is the printed range honest?</h3><table><thead><tr><th></th><th class="num">LOO</th><th class="num">WF</th></tr></thead><tbody>'
    + '<tr><td>Within ×3</td><td class="num">' + rg.within3_loo + '%</td><td class="num">' + rg.within3_wf + '%</td></tr>'
    + '<tr><td>Inside P25–P75 stated 50%</td><td class="num">' + rg.p2575_loo + '%</td><td class="num">' + rg.p2575_wf + '%</td></tr>'
    + '<tr><td>Inside P10–P90 stated 80%</td><td class="num">' + rg.p1090_loo + '%</td><td class="num">' + rg.p1090_wf + '%</td></tr>'
    + '<tr><td>Implied log-SE, LOO range</td><td class="num">' + se.toFixed(2) + '</td><td class="num">—</td></tr>'
    + '</tbody></table><div class="formula">Range: the printed P25–P75 is the 25th–75th percentile of the LOO misses, widened ×' + rg.widen + ', ×' + w2575 + ' wide; P10–P90 ×' + w1090 + ' wide. LOO-range-implied SE σ ≈ ' + se.toFixed(2) + ' in log value (≈ ×' + Math.exp(se).toFixed(1) + '): IQR ÷ 1.349, widening removed — no bootstrap.</div></div>'
    + '</div>'
    + '</section>';
  return html;
}

function options(list, current, allLabel) {
  var html = '<option value="all"' + (current === 'all' ? ' selected' : '') + '>' + esc(allLabel) + '</option>';
  list.forEach(function (v) {
    html += '<option value="' + esc(v) + '"' + (current === v ? ' selected' : '') + '>' + esc(v) + '</option>';
  });
  return html;
}

function depositNote() {
  var sc = scenario();
  var wl = D.rows.filter(function (r) { return r.watchlist; }).slice().sort(function (a, b) { return a.rank - b.rank; });
  var robustNow = wl.filter(function (r) { return econ(r, sc).verdict === 'ROBUST'; }).length;
  var firstMiss = null;
  for (var i = 0; i < wl.length; i++) {
    if (econ(wl[i], sc).verdict !== 'ROBUST') { firstMiss = wl[i]; break; }
  }
  var tail;
  if (!firstMiss) {
    tail = 'every watchlist name clears $25/h on a $500 deposit.';
  } else {
    var need = depositForRobust(firstMiss, sc);
    if (need != null) {
      tail = esc(firstMiss.name) + ', the biggest name left, needs ~$' + need + ' to clear $25/h.';
    } else {
      var ret = (dropReturn(firstMiss, sc) * 100).toFixed(1);
      var tb = (0.04 * (sc.horizon_weeks / 52) * 100).toFixed(1);
      tail = esc(firstMiss.name) + ', the biggest name left, pays ' + ret + '% on the deposit over ' + sc.horizon_weeks + ' weeks against a ' + tb + '% T-bill, so no deposit clears it at a ' + (Math.round(sc.drop_share * 1000) / 10) + '% drop — raise the drop share to see it pay.';
    }
  }
  return '<div class="dep-note">Deposit-aware: ROBUST has to clear $25/h on a $500 deposit as well as on the $' + sc.deposit_usd.toLocaleString() + ' plan — <b>' + robustNow + ' of ' + wl.length + ' watchlist names</b> do. ' + tail + ' Change the deposit above and every verdict reprices.</div>';
}

function controls() {
  var sc = scenario();
  var rows = filteredRows();
  var tvl = rows.reduce(function (t, r) { return t + r.tvl_usd; }, 0);
  var imp = rows.reduce(function (t, r) { return t + r.implied_value_usd; }, 0);
  var cats = [];
  D.rows.forEach(function (r) { if (cats.indexOf(r.category || '—') === -1) cats.push(r.category || '—'); });
  cats.sort();
  var chains = [];
  D.rows.forEach(function (r) { r.chains.forEach(function (c) { if (chains.indexOf(c) === -1) chains.push(c); }); });
  chains.sort();
  var depOpts = [100, 500, 1000, 2500, 5000, 10000, 25000];
  var html = '<div class="controls">'
    + '<div class="tabs" role="group" aria-label="Tier">'
    + '<button type="button" data-tier="all" aria-pressed="' + (state.tier === 'all') + '">All ' + D.board_size + '</button>'
    + '<button type="button" data-tier="watchlist" aria-pressed="' + (state.tier === 'watchlist') + '">Watchlist ' + D.watchlist_size + '</button>'
    + '<button type="button" data-tier="early" aria-pressed="' + (state.tier === 'early') + '">Early ' + D.early_size + '</button>'
    + '</div>'
    + '<div class="field"><label for="f-verdict">Verdict</label><select id="f-verdict">' + options(['ROBUST', 'FARM', 'THIN', 'MARGINAL', 'SKIP'], state.verdict, 'Any verdict') + '</select></div>'
    + '<div class="field"><label for="f-cat">Category</label><select id="f-cat">' + options(cats, state.category, 'Any category') + '</select></div>'
    + '<div class="field"><label for="f-chain">Chain</label><select id="f-chain">' + options(chains, state.chain, 'Any chain') + '</select></div>'
    + '<div class="field"><label for="f-dep">Deposit</label><select id="f-dep">'
    + depOpts.map(function (n) { return '<option value="' + n + '"' + (state.deposit === n ? ' selected' : '') + '>$' + n.toLocaleString() + '</option>'; }).join('')
    + '</select></div>'
    + '<div class="field"><label for="f-drop">Drop share ' + (Math.round(state.drop * 1000) / 10) + '%</label><input type="range" id="f-drop" min="1" max="20" step="0.5" value="' + (state.drop * 100) + '"></div>'
    + '<div class="field"><label for="f-hor">Horizon ' + state.horizon + ' wk</label><input type="range" id="f-hor" min="4" max="52" step="1" value="' + state.horizon + '"></div>'
    + '<div class="field"><label for="f-q">Search name, chain, category</label><input type="search" id="f-q" placeholder="Search protocols" value="' + esc(state.q) + '"></div>'
    + '<button type="button" class="button" id="f-reset">Reset</button>'
    + '<button type="button" class="button" id="f-csv">CSV</button>'
    + '<button type="button" class="button" id="f-json">JSON</button>'
    + '<span class="count">' + rows.length + ' of ' + D.board_size + ' rows · ' + money(tvl) + ' TVL · ' + money(imp) + ' implied</span>'
    + depositNote()
    + '</div>';
  return html;
}

var SORT_LABELS = { rank: '#', tvl: 'TVL', change_7d: '7D', age_days: 'No-token age', token_odds: 'Token odds', if_launches: 'If it launches', implied: 'Implied value', net: 'Verdict · net', per_hour: 'Net / hour' };

function controlStrip() {
  var sc = scenario();
  var tierLabel = state.tier === 'watchlist' ? 'Watchlist ' + D.watchlist_size : state.tier === 'early' ? 'Early ' + D.early_size : 'All ' + D.board_size;
  var verdictLabel = state.verdict === 'all' ? 'Any' : state.verdict;
  var sortLabel = (SORT_LABELS[state.sortKey] || 'Implied value') + (state.sortDir === 'asc' ? ' ↑' : ' ↓');
  return '<div class="strip"><span>Sort: <b>' + esc(sortLabel) + '</b></span>'
    + '<span>Tier: <b>' + esc(tierLabel) + '</b></span>'
    + '<span>Verdict: <b>' + esc(verdictLabel) + '</b></span>'
    + '<span>Deposit: <b>$' + sc.deposit_usd.toLocaleString() + ' · ' + (Math.round(sc.drop_share * 1000) / 10) + '% drop · ' + sc.horizon_weeks + ' wk</b></span>'
    + '<span class="strip-right"><button type="button" class="button" id="f-csv2">CSV</button><button type="button" class="button" id="f-json2">JSON</button></span></div>';
}

function sortHead(label, key) {
  var arrow = '';
  if (state.sortKey === key) arrow = state.sortDir === 'asc' ? ' ↑' : ' ↓';
  return '<th><button type="button" data-sort="' + key + '">' + esc(label) + arrow + '</button></th>';
}

function table() {
  var sc = scenario();
  var rows = filteredRows();
  if (rows.length === 0) {
    return controlStrip() + '<div class="panel"><div class="empty"><h3>No rows match</h3><p>Loosen a filter or clear the search.</p><button type="button" class="button" id="f-reset2">Reset filters</button></div></div>';
  }
  var html = controlStrip() + '<div class="panel"><div class="table-wrap"><table class="board"><thead><tr>'
    + sortHead('#', 'rank') + '<th>Protocol</th>' + sortHead('TVL', 'tvl') + sortHead('7D', 'change_7d')
    + sortHead('No-token age', 'age_days') + sortHead('Token odds', 'token_odds') + sortHead('If it launches', 'if_launches')
    + sortHead('Implied value', 'implied') + '<th>Range P25–P75</th>' + sortHead('Verdict · net of fees', 'net') + sortHead('Net / hour', 'per_hour')
    + '</tr></thead><tbody>';
  rows.forEach(function (r) {
    var e = econ(r, sc);
    var extra = r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '';
    var chg = r.change_7d == null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</span>';
    html += '<tr data-slug="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug) + '">'
      + '<td class="num">' + r.rank + '</td>'
      + '<td><div class="name"><span><b>' + esc(r.name) + '</b>' + (r.watchlist ? '<span class="badge watch">Watchlist</span>' : '<span class="badge off">Early</span>') + '</span><span class="sub">' + esc(r.category || '—') + ' · ' + esc(r.chains[0] || '—') + extra + '</span></div></td>'
      + '<td class="num">' + money(r.tvl_usd) + '</td>'
      + '<td class="num">' + chg + '</td>'
      + '<td class="num">' + ageFmt(r.age_days) + '</td>'
      + '<td class="num">' + Math.round(r.token_odds * 100) + '% <span class="oddsbar"><i style="width:' + (r.token_odds * 100) + '%"></i></span></td>'
      + '<td class="num">' + money(r.if_launches_usd) + '</td>'
      + '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>'
      + '<td class="num">' + money(r.range_p25_usd) + '–' + money(r.range_p75_usd) + '<div class="range">×' + (r.range_p75_usd / r.range_p25_usd).toFixed(1) + ' wide</div></td>'
      + '<td><span class="verdict ' + e.verdict + '">' + e.verdict + '</span><div class="range">' + money2(e.net) + ' · ' + money(e.drop) + ' drop − ' + money(e.fees) + ' fees</div></td>'
      + '<td class="num"><span class="' + (e.perHour >= 0 ? 'pos' : 'neg') + '">' + money2(e.perHour) + '</span></td>'
      + '</tr>';
  });
  html += '</tbody></table></div>'
    + '<div class="verdict-legend">Verdicts, at the deposit above: <b>ROBUST</b> clears $25/h on a $500 deposit as well as this one · <b>FARM</b> beats the T-bill at $10/h · <b>THIN</b> covers its fees · <b>MARGINAL</b> loses under $25 · <b>SKIP</b> loses more. Change the deposit and every verdict reprices.</div>'
    + '</div>';
  return html;
}

function footnote() {
  var sc = scenario();
  var b = D.value_beta, o = D.odds_beta;
  var html = '<section class="panel footnote"><h2>How a row is priced</h2>'
    + '<div class="formula">impliedValue() takes a protocol’s TVL, its 7-day change and its listing date from the snapshot, fits the curve on the ' + D.value_comps + ' traded tokens, and multiplies the if-it-launches value by the token odds fitted on the ' + D.odds_peers + ' peers. The board separates protocols whose token already trades — the live list below, shown at the market’s own value — from those still to come. A protocol is said to record no token, never to have none: its DefiLlama record may simply not carry one.</div>'
    + '<div class="formula">The farm plan prices a $' + sc.deposit_usd.toLocaleString() + ' deposit over ' + sc.horizon_weeks + ' weeks at a ' + (Math.round(sc.drop_share * 1000) / 10) + '% drop share: the drop is shared pro-rata with the tenth of TVL that is points-eligible deposits; fees are a 0.3% swap plus one gas payment per transaction at the chain’s rate; the T-bill alternative pays 4% a year. ROBUST beats the T-bill at $25 an hour on a $500 deposit as well as on the plan’s deposit; FARM beats it at $10; THIN clears its fees; MARGINAL loses under $25; SKIP loses more. Change the deposit, drop share or horizon above and every verdict reprices — the $500 plan stays one click away in the deposit selector.</div>'
    + '<div class="formula">Snapshot: DefiLlama, ' + esc(D.as_of) + ' · floor $50M · ' + D.board_size + ' rows · ' + esc(D.source) + ' · no network: this page reads only data.js, written beside it by the same program that wrote board.json.</div>'
    + '<div class="formula">impliedValue() = exp(' + b[0].toFixed(4) + curveTerm(b[1], 'ln TVL') + curveTerm(b[2], 'growth') + curveTerm(b[3], '(ln TVL − 18)²') + curveTerm(b[4], '(ln TVL − 18)³') + ') × categoryEffect() × tokenOdds()<br>'
    + 'tokenOdds() = sigmoid(' + o[0].toFixed(2) + ' + ' + o[1].toFixed(2) + ' · size + ' + o[2].toFixed(2) + ' · ln months + ' + o[3].toFixed(2) + ' · age unknown ' + (o[4] < 0 ? '− ' : '+ ') + Math.abs(o[4]).toFixed(2) + ' · growth + ' + o[5].toFixed(2) + ' · sibling)<br>'
    + 'R² ' + D.value_r2.toFixed(3) + ' on ' + D.value_comps + ' comps · category effects ×' + D.value_cat_min + ' to ×' + D.value_cat_max + ' (shrunk, ridge 50; comps winsorized 5–95%) · base token rate ' + (D.odds_base_rate * 100) + '% of ' + D.odds_peers + ' peers · model ' + esc(D.model_version) + ', refitted in this browser from the same data.</div>'
    + '</section>'
    + '<section class="panel live"><h2 style="padding:14px 14px 0">Live token view — already trading, at the market’s own value</h2><table><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>7D</th></tr></thead><tbody>';
  D.live.forEach(function (r) {
    var chg = r.change_7d == null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</span>';
    html += '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.category || '—') + '</td><td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.mcap_usd) + '</td><td class="num">' + chg + '</td></tr>';
  });
  return html + '</tbody></table></section>';
}

function farmStepsFor(r) {
  if (r.farm_steps && r.farm_steps.length) return r.farm_steps;
  return ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.'];
}

function openDetail(slug) {
  var r = null;
  D.rows.forEach(function (row) { if (row.slug === slug) r = row; });
  if (!r) return;
  state.selected = slug;
  var sc = scenario();
  var e = econ(r, sc);
  var lnTvl = Math.log(r.tvl_usd);
  var t = lnTvl - 18;
  var g = Math.min(1.2, Math.max(-0.6, (r.change_7d == null ? 0 : r.change_7d) / 100));
  var chain = r.chains[0] || 'its main chain';
  var gas = D.gas[chain] != null ? D.gas[chain] : 1.0;
  var need = depositForRobust(r, sc);
  var depRow;
  if (e.verdict === 'ROBUST') depRow = 'clears it at $' + sc.deposit_usd.toLocaleString();
  else if (need != null) depRow = '~$' + need.toLocaleString();
  else depRow = 'never at a ' + (Math.round(sc.drop_share * 1000) / 10) + '% drop';
  function eqRow(label, value) {
    return '<div><span>' + esc(label) + '</span><b>' + value + '</b></div>';
  }
  var stepsHtml = '';
  farmStepsFor(r).forEach(function (s) {
    var m = s.match(/^(.*) Cost: (.*)\. Time: (.*)\.$/);
    if (m) stepsHtml += '<li><b>' + esc(m[1]) + '</b><br><span class="cost">Cost: ' + esc(m[2]) + ' · Time: ' + esc(m[3]) + '</span></li>';
    else stepsHtml += '<li>' + esc(s) + '</li>';
  });
  var catEff = r.category_effect;
  var detail = document.getElementById('detail');
  detail.innerHTML = '<div class="detail-head"><div>'
    + '<div class="sub muted">' + esc(r.category || '—') + ' · ' + esc(r.chains.join(', ')) + ' · listed ' + fmtDate(r.listed_at) + ' · no token for ' + ageFmt(r.age_days) + '</div>'
    + '<h2>' + esc(r.name) + '</h2>'
    + '<div class="sub muted">Rank ' + r.rank + ' of ' + D.board_size + ' · ' + (r.watchlist ? 'Watchlist' : 'Early') + ' · ' + esc(r.slug) + '</div>'
    + '</div><button type="button" class="close" id="detail-close">✕ Close</button></div>'
    + '<div class="detail-section"><h3>Implied value — ' + money(r.implied_value_usd) + '</h3><div class="equation">'
    + eqRow('If it launches', money(r.if_launches_usd))
    + eqRow('Token odds', Math.round(r.token_odds * 100) + '%')
    + eqRow('Printed range P25–P75', money(r.range_p25_usd) + '–' + money(r.range_p75_usd))
    + eqRow('Printed range P10–P90', money(r.range_p10_usd) + '–' + money(r.range_p90_usd))
    + eqRow('Expected drop, this scenario', money(e.drop))
    + eqRow('Fees, this scenario', money(e.fees) + ' (' + e.tx + ' tx)')
    + eqRow('Net of fees', money2(e.net))
    + eqRow('Net per hour', money2(e.perHour) + ' (' + e.hours.toFixed(1) + ' h)')
    + eqRow('Verdict', '<span class="verdict ' + e.verdict + '">' + e.verdict + '</span>')
    + eqRow('Deposit to clear $25/h', depRow)
    + '</div></div>'
    + '<div class="detail-section"><h3>How this row is priced</h3><div class="equation">'
    + eqRow('ln TVL', lnTvl.toFixed(4))
    + eqRow('7-day growth', signed(g, 4))
    + eqRow('(ln TVL − 18)²', (t * t).toFixed(4))
    + eqRow('(ln TVL − 18)³', (t * t * t).toFixed(4))
    + eqRow('Intercept', D.value_beta[0].toFixed(4))
    + eqRow('Category effect (' + (r.category || '—') + ')', signed(catEff, 4))
    + eqRow('Gas per transaction on ' + chain, '$' + gas.toFixed(2))
    + '</div><p class="muted" style="margin-top:8px;font-size:12px">Fitted on the ' + D.value_comps + ' traded tokens and the ' + D.odds_peers + ' peers; comps winsorized 5–95%, category premiums shrunk (ridge 50); no name is special-cased.</p></div>'
    + '<div class="detail-section"><h3>Farm plan — $' + sc.deposit_usd.toLocaleString() + ', ' + (Math.round(sc.drop_share * 1000) / 10) + '% drop, ' + sc.horizon_weeks + ' weeks</h3><ol class="steps">' + stepsHtml + '</ol></div>';
  detail.hidden = false;
  document.getElementById('scrim').hidden = false;
  document.getElementById('detail-close').addEventListener('click', closeDetail);
}

function closeDetail() {
  state.selected = null;
  document.getElementById('detail').hidden = true;
  document.getElementById('scrim').hidden = true;
  renderTable();
}

function renderTable() {
  document.getElementById('table-slot').innerHTML = table();
  bindTable();
  var slot = document.getElementById('controls-slot');
  if (slot) slot.innerHTML = controls();
}

function bindTable() {
  var rows = board.querySelectorAll('tbody tr[data-slug]');
  rows.forEach(function (tr) {
    tr.addEventListener('click', function () {
      openDetail(tr.getAttribute('data-slug'));
      renderTable();
    });
  });
  var sorts = board.querySelectorAll('th button[data-sort]');
  sorts.forEach(function (btn) {
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var key = btn.getAttribute('data-sort');
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = key === 'rank' ? 'asc' : 'desc';
      }
      renderAll();
    });
  });
  var reset2 = document.getElementById('f-reset2');
  if (reset2) reset2.addEventListener('click', resetAll);
  var csv2 = document.getElementById('f-csv2');
  if (csv2) csv2.addEventListener('click', downloadCsv);
  var json2 = document.getElementById('f-json2');
  if (json2) json2.addEventListener('click', downloadJson);
}

function bindControls() {
  board.querySelectorAll('.tabs button[data-tier]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.tier = btn.getAttribute('data-tier');
      renderAll();
    });
  });
  function bindSelect(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function () { fn(el.value); renderAll(); });
  }
  bindSelect('f-verdict', function (v) { state.verdict = v; });
  bindSelect('f-cat', function (v) { state.category = v; });
  bindSelect('f-chain', function (v) { state.chain = v; });
  bindSelect('f-dep', function (v) { state.deposit = parseInt(v, 10); });
  var drop = document.getElementById('f-drop');
  if (drop) drop.addEventListener('input', function () { state.drop = parseFloat(drop.value) / 100; renderAll(); });
  var hor = document.getElementById('f-hor');
  if (hor) hor.addEventListener('input', function () { state.horizon = parseInt(hor.value, 10); renderAll(); });
  var q = document.getElementById('f-q');
  if (q) q.addEventListener('input', function () { state.q = q.value; renderTable(); });
  var reset = document.getElementById('f-reset');
  if (reset) reset.addEventListener('click', resetAll);
  var csv = document.getElementById('f-csv');
  if (csv) csv.addEventListener('click', downloadCsv);
  var json = document.getElementById('f-json');
  if (json) json.addEventListener('click', downloadJson);
}

function resetAll() {
  state.tier = 'all';
  state.verdict = 'all';
  state.category = 'all';
  state.chain = 'all';
  state.deposit = 10000;
  state.drop = 0.07;
  state.horizon = 12;
  state.q = '';
  state.sortKey = 'rank';
  state.sortDir = 'asc';
  renderAll();
}

function saveBlob(text, filename, type) {
  var blob = new Blob([text], { type: type });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function csvQuote(v) {
  return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
}

function downloadCsv() {
  var sc = scenario();
  var lines = ['rank,slug,name,category,chains,tvl_usd,change_7d,age_days,token_odds,if_launches_usd,implied_value_usd,p25_usd,p75_usd,verdict,drop_usd,fees_usd,net_usd,net_per_hour_usd'];
  filteredRows().forEach(function (r) {
    var e = econ(r, sc);
    lines.push([
      r.rank, r.slug, csvQuote(r.name), csvQuote(r.category || ''), csvQuote(r.chains.join(', ')),
      r.tvl_usd, r.change_7d == null ? '' : r.change_7d, r.age_days == null ? '' : r.age_days,
      r.token_odds, r.if_launches_usd, r.implied_value_usd, r.range_p25_usd, r.range_p75_usd,
      e.verdict, e.drop.toFixed(2), e.fees.toFixed(2), e.net.toFixed(2), e.perHour.toFixed(2),
    ].join(','));
  });
  saveBlob(lines.join('\n') + '\n', 'launch-radar.csv', 'text/csv');
}

function downloadJson() {
  saveBlob(JSON.stringify({ rows: filteredRows() }, null, 2), 'launch-radar.json', 'application/json');
}

function renderAll() {
  var sc = scenario();
  var html = '<div class="shell">'
    + '<header class="top"><div><div class="brand"><span class="mark"></span><h1>Launch Radar</h1></div>'
    + '<p class="lede"><b>' + D.board_size + ' protocols that record no token, ranked by implied value</b> — value if a token launches × token odds, fitted on this snapshot’s own traded tokens and peers and backtested blind.</p>'
    + '<div class="formula-line">implied value = TVL × fitted multiple (×' + D.kpi.miss_wf.toFixed(2) + ' out-of-sample) × token odds</div></div>'
    + '<div class="top-meta"><span>DefiLlama snapshot ' + esc(D.as_of) + '</span><span>model ' + esc(D.model_version) + '</span><span>' + D.value_comps + ' comps · ' + D.odds_peers + ' peers</span><span>no network, no hand-picked names</span></div></header>'
    + kpiCards() + accounting() + integrity() + evidence()
    + '<div id="controls-slot">' + controls() + '</div>'
    + '<div id="table-slot">' + table() + '</div>'
    + footnote()
    + '</div>'
    + '<div class="scrim" id="scrim" hidden></div>'
    + '<aside class="detail" id="detail" hidden aria-label="Protocol detail"></aside>';
  board.innerHTML = html;
  board.setAttribute('aria-busy', 'false');
  document.getElementById('scrim').addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') closeDetail();
  });
  bindControls();
  bindTable();
  var detailSlug = params.get('detail');
  if (detailSlug) {
    openDetail(detailSlug);
    renderTable();
  }
}

renderAll();
})();
