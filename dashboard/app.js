// Launch Radar dashboard: renders window.RADAR (data.js) with no network.
// Every figure is recomputed here from the same data main.ts wrote.
(function () {
  'use strict';
  var D = window.RADAR;
  var board = document.getElementById('board');
  if (!D) { board.textContent = 'No data: data.js did not load.'; return; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function money(n) {
    if (n === null || n === undefined) return '\u2014';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
  }
  function money2(n) { return (n < 0 ? '\u2212$' : '$') + Math.abs(n).toFixed(0); }
  function signed(n, d) { return (n < 0 ? '\u2212' : '+') + Math.abs(n).toFixed(d === undefined ? 1 : d); }
  function pct(n) { return n === null || n === undefined ? '\u2014' : signed(n, 1) + '%'; }
  function ageFmt(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days < 90) return days + ' d';
    if (days < 730) return (days / 30.44).toFixed(0) + ' mo';
    return (days / 365).toFixed(1) + ' yr';
  }
  function checksum(rows) {
    var h = 0x811c9dc5;
    var text = rows.map(function (r) { return r.rank + ':' + r.slug + ':' + r.implied_value_usd + ';'; }).join('');
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  // Farm economics: an exact mirror of econFor in lib/model.ts.
  function planWork(weeks) { return { tx: 2 + weeks + 1, hours: (5 + 15 + weeks * 15 + 15 + 5) / 60 }; }
  var SMALL_DEPOSIT = 500;
  function econAt(row, sc, deposit) {
    var gas = D.gas[row.chains[0]] !== undefined ? D.gas[row.chains[0]] : 1.0;
    var w = planWork(sc.horizon_weeks);
    var drop = (row.implied_value_usd * sc.drop_share * deposit) / row.tvl_usd;
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
  // Deposit to clear $25/h: the smallest deposit whose modelled drop
  // beats the T-bill AND pays $25 an hour. Returns null when no deposit
  // can do it — never a negative or non-finite dollar amount. (An earlier
  // draft printed "~$5,700" and the tilde read as a minus at screenshot
  // size, so the drawer now prints "about $5,700" instead.)
  function depositForRobust(row, sc) {
    var gas = D.gas[row.chains[0]] !== undefined ? D.gas[row.chains[0]] : 1.0;
    var w = planWork(sc.horizon_weeks);
    var slope = (row.implied_value_usd * sc.drop_share) / row.tvl_usd - 0.003;
    var tbillRate = 0.04 * (sc.horizon_weeks / 52);
    if (!(slope > tbillRate)) return null;
    var need = Math.max((25 * w.hours + gas * w.tx) / slope, (gas * w.tx) / (slope - tbillRate));
    if (!isFinite(need) || need <= 0) return null;
    return Math.ceil(need / 100) * 100;
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
    selected: null
  };
  function scenario() { return { deposit_usd: state.deposit, drop_share: state.drop, horizon_weeks: state.horizon }; }

  function filteredRows() {
    var sc = scenario();
    var rows = D.rows.filter(function (r) {
      if (state.tier === 'watchlist' && !r.watchlist) return false;
      if (state.tier === 'early' && r.watchlist) return false;
      if (state.verdict !== 'all' && econ(r, sc).verdict !== state.verdict) return false;
      if (state.category !== 'all' && (r.category || '\u2014') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
        if (hay.indexOf(state.q.toLowerCase()) < 0) return false;
      }
      return true;
    });
    var dir = state.sortDir === 'desc' ? -1 : 1;
    rows.sort(function (a, b) {
      var va, vb;
      if (state.sortKey === 'net') { va = econ(a, sc).net; vb = econ(b, sc).net; }
      else if (state.sortKey === 'per_hour') { va = econ(a, sc).perHour; vb = econ(b, sc).perHour; }
      else if (state.sortKey === 'rank') { va = a.rank; vb = b.rank; }
      else if (state.sortKey === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (state.sortKey === 'change_7d') { va = a.change_7d === null ? -999 : a.change_7d; vb = b.change_7d === null ? -999 : b.change_7d; }
      else if (state.sortKey === 'age_days') { va = a.age_days === null ? -1 : a.age_days; vb = b.age_days === null ? -1 : b.age_days; }
      else if (state.sortKey === 'token_odds') { va = a.token_odds; vb = b.token_odds; }
      else if (state.sortKey === 'if_launches') { va = a.if_launches_usd; vb = b.if_launches_usd; }
      else { va = a.implied_value_usd; vb = b.implied_value_usd; }
      return (va < vb ? -1 : va > vb ? 1 : a.rank - b.rank) * dir;
    });
    return rows;
  }

  function kpiCards() {
    var sc = scenario();
    var counts = { ROBUST: 0, FARM: 0, THIN: 0, MARGINAL: 0, SKIP: 0 };
    D.rows.forEach(function (r) { counts[econ(r, sc).verdict]++; });
    var worth = counts.ROBUST + counts.FARM;
    var skip = counts.SKIP;
    var cards = [
      { label: 'Walk-forward miss', value: '\u00d7' + D.kpi.miss_wf.toFixed(2), sub: 'flat \u00d7' + D.kpi.miss_flat_wf.toFixed(2) + ' \u00b7 ' + D.value_comps + ' comps' },
      { label: 'Range honest?', value: D.range.p2575_wf + '% \u00b7 ' + D.range.p1090_wf + '%', sub: 'stated 50% \u00b7 80%' },
      { label: 'Token odds, Brier', value: D.kpi.brier_wf.toFixed(3), sub: Math.round(D.kpi.odds_acc_wf * 100) + '% held-out \u00b7 ' + Math.round(D.kpi.odds_acc_insample * 100) + '% in-sample<br>' + Math.round(D.kpi.odds_prec_low_wf * 100) + '% unlikely right (WF, n=' + D.kpi.odds_prec_low_n_wf + ')' },
      { label: 'Terms kept', value: D.kpi.value_kept + '/' + D.kpi.value_tested + ' \u00b7 ' + D.kpi.odds_kept + '/' + D.kpi.odds_tested, sub: 'rest below, not used' },
      { label: 'Worth farming', value: worth + ' of ' + D.board_size, sub: 'beats T-bill at $10/h' },
      { label: 'Watchlist', value: D.watchlist_size + ' / ' + D.watchlist_size, sub: 'plus ' + D.early_size + ' early rows' }
    ];
    return '<section class="kpis" aria-label="Headline figures">' + cards.map(function (c) {
      return '<div class="kpi"><div class="k-label">' + c.label + '</div><div class="k-value">' + c.value + '</div><div class="k-sub">' + c.sub + '</div></div>';
    }).join('') + '</section>';
  }

  var COLORS = ['#e8b23a', '#5aa9e6', '#3fbf7a', '#b48ce8', '#e5604f', '#e87ab0', '#7ad0c3', '#d08a4e', '#8a9ba8'];
  function accounting() {
    var total = D.accounting.reduce(function (t, g) { return t + g.count; }, 0);
    var shortLabel = ['Watchlist', 'Early', 'Priced', 'No cap', 'Bridge', 'Liq. staking', 'Exchange', 'Versioned', 'Below floor'];
    var bar = D.accounting.map(function (g, i) {
      return '<i style="width:' + (g.count / total * 100) + '%;background:' + COLORS[i % 9] + '" title="' + esc(g.label) + ' ' + g.count + '"></i>';
    }).join('');
    var legend = D.accounting.map(function (g, i) {
      return '<span title="' + esc(g.label) + '"><i class="dot" style="background:' + COLORS[i % 9] + '"></i>' + shortLabel[i] + ' <b class="num">' + g.count + '</b></span>';
    }).join('');
    return '<section class="account"><div class="account-head"><b>PROTOCOL ACCOUNTING</b><span>all ' + total + ' snapshot protocols in exactly one group</span></div><div class="account-bar">' + bar + '</div><div class="account-legend">' + legend + '</div></section>';
  }

  function integrity() {
    var rows = D.rows;
    var total = rows.reduce(function (t, r) { return t + r.implied_value_usd; }, 0);
    var wl = rows.filter(function (r) { return r.watchlist; }).length;
    var ledger = D.accounting.reduce(function (t, g) { return t + g.count; }, 0);
    var checks = [
      { ok: rows.length === D.board_size, text: 'board.json = this table \u00b7 ' + rows.length + ' rows' },
      { ok: rows.every(function (r, i) { return r.rank === i + 1; }) && rows.every(function (r, i) { return i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd; }), text: 'ranks 1\u2013' + D.board_size + ', values never rise' },
      { ok: total === D.total_implied_usd && checksum(rows) === D.checksum, text: 'totals ' + money(total) + ' \u00b7 checksum ' + D.checksum },
      { ok: wl === D.watchlist_size, text: 'watchlist ' + wl + ' of ' + D.watchlist_size },
      { ok: ledger === 758, text: 'ledger 758 of 758' }
    ];
    return '<div class="integrity">' + checks.map(function (c) {
      return '<span><span class="' + (c.ok ? 'ok' : 'neg') + '">' + (c.ok ? '\u2713' : '\u2717') + '</span> ' + c.text + '</span>';
    }).join('') + '</div>';
  }

  function evTable(title, rows, unit) {
    var body = rows.map(function (e) {
      var status = e.note === 'baseline'
        ? '<span class="notkept">baseline</span>'
        : e.note === 'must not help'
          ? '<span class="notkept">control</span>'
          : e.kept ? '<span class="kept">kept</span>' : '<span class="notkept">not kept</span>';
      var fmt = unit === '\u00d7' ? function (v) { return unit + v.toFixed(2); } : function (v) { return v.toFixed(3); };
      return '<tr><td>' + esc(e.term) + '</td><td>' + status + '</td><td class="num">' + fmt(e.loo) + '</td><td class="num">' + fmt(e.wf) + '</td></tr>';
    }).join('');
    return '<div class="ev-panel"><h3>' + title + '</h3><table><thead><tr><th>TERM</th><th>STATUS</th><th class="num">LEAVE-ONE-OUT</th><th class="num">WALK-FORWARD</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  function curveTerm(coef, label) {
    return ' ' + (coef < 0 ? '\u2212 ' : '+ ') + Math.abs(coef).toFixed(2) + ' \u00b7 ' + label;
  }
  function evidence() {
    var b = D.value_beta;
    var o = D.odds_beta;
    var rangePanel = '<div class="ev-panel"><h3>Is the printed range honest?</h3><table><thead><tr><th>REAL CAPS INSIDE</th><th>STATED</th><th class="num">LOO</th><th class="num">WF</th></tr></thead><tbody>'
      + '<tr><td>Within \u00d73 of the model</td><td></td><td class="num">' + D.range.within3_loo + '%</td><td class="num">' + D.range.within3_wf + '%</td></tr>'
      + '<tr><td>Inside P25\u2013P75</td><td>50%</td><td class="num">' + D.range.p2575_loo + '%</td><td class="num">' + D.range.p2575_wf + '%</td></tr>'
      + '<tr><td>Inside P10\u2013P90</td><td>80%</td><td class="num">' + D.range.p1090_loo + '%</td><td class="num">' + D.range.p1090_wf + '%</td></tr>'
      + '</tbody></table><div class="formula">P25\u2013P75 = 25th\u201375th pct of the LOO misses, widened \u00d7' + D.range.widen + '.</div></div>';
    var formula = '<div class="formula"><b>How a row is priced:</b> '
      + 'impliedValue() = exp(' + b[0].toFixed(2) + curveTerm(b[1], 'ln TVL') + curveTerm(b[2], '(ln TVL \u2212 18)\u00b2') + ') \u00d7 tokenOdds() \u00b7 R\u00b2 ' + D.value_r2.toFixed(2) + ' \u00b7 growth NOT in value (it pays crashes).<br>'
      + 'tokenOdds() = sigmoid(' + o[0].toFixed(2) + ' + ' + o[1].toFixed(2) + ' \u00b7 size + ' + o[2].toFixed(2) + ' \u00b7 ln months + ' + o[3].toFixed(2) + ' \u00b7 age unknown ' + (o[4] < 0 ? '\u2212 ' : '+ ') + Math.abs(o[4]).toFixed(2) + ' \u00b7 growth + ' + o[5].toFixed(2) + ' \u00b7 sibling) \u00b7 base ' + Math.round(D.odds_base_rate * 100) + '% of ' + D.odds_peers + ' peers \u00b7 model ' + D.model_version + '.</div>';
    // Confident calls, held-out: the odds model's strong side is calling
    // a peer unlikely. Printed with its basis and its n, next to the
    // honest overall accuracy — never as a bare percentage.
    var confident = '<div class="formula">Confident calls, walk-forward: odds \u226410% \u2192 ' + Math.round(D.kpi.odds_prec_low_wf * 100) + '% recorded no token (n=' + D.kpi.odds_prec_low_n_wf + '); odds \u226570% \u2192 ' + Math.round(D.kpi.odds_prec_high_wf * 100) + '% recorded a token (n=' + D.kpi.odds_prec_high_n_wf + '). Overall: ' + Math.round(D.kpi.odds_acc_wf * 100) + '% held-out \u00b7 ' + Math.round(D.kpi.odds_acc_insample * 100) + '% in-sample.</div>';
    return '<section class="evidence"><h2>Out-of-sample evidence</h2><p class="note">A term is kept only if the model with it beats the model without it in BOTH tests: leave-one-out and walk-forward.</p><div class="ev-grid">'
      + evTable('Value \u2014 typical miss, ' + D.value_comps + ' traded tokens', D.value_evidence, '\u00d7')
      + evTable('Token odds \u2014 Brier, ' + D.odds_peers + ' peers', D.odds_evidence, '')
      + rangePanel + '</div>' + confident + formula + '</section>';
  }

  function options(list, current, allLabel) {
    var out = '<option value="all"' + (current === 'all' ? ' selected' : '') + '>' + allLabel + '</option>';
    list.forEach(function (v) {
      out += '<option value="' + esc(v) + '"' + (current === v ? ' selected' : '') + '>' + esc(v) + '</option>';
    });
    return out;
  }
  // v6: positive framing, and no tier is announced when it is empty —
  // a board with no ROBUST row says "68 FARM", not "0 ROBUST · 68 FARM".
  // The named top farm is the first farmable row that is not a crash row.
  function depositNote() {
    var sc = scenario();
    var counts = { ROBUST: 0, FARM: 0 };
    var firstFarm = null;
    var firstFarmE = null;
    var firstCalmFarm = null;
    var firstCalmFarmE = null;
    D.rows.forEach(function (r) {
      var e = econ(r, sc);
      if (e.verdict === 'ROBUST') counts.ROBUST++;
      if (e.verdict === 'FARM') counts.FARM++;
      if (e.verdict === 'ROBUST' || e.verdict === 'FARM') {
        if (!firstFarm) { firstFarm = r; firstFarmE = e; }
        if (!firstCalmFarm && (r.change_7d === null || r.change_7d >= -20)) { firstCalmFarm = r; firstCalmFarmE = e; }
      }
    });
    var best = firstCalmFarm || firstFarm;
    var bestE = firstCalmFarm ? firstCalmFarmE : firstFarmE;
    var tail;
    if (best) {
      tail = 'top farm <b>' + esc(best.name) + '</b> nets <b>' + money2(bestE.perHour) + '/h</b>.';
    } else {
      tail = 'no row clears $25/h at this deposit \u2014 raise the drop share or lower the deposit above to see one pay.';
    }
    var ready = counts.ROBUST > 0
      ? '<b>' + counts.ROBUST + ' ROBUST \u00b7 ' + counts.FARM + ' FARM</b>'
      : '<b>' + counts.FARM + ' FARM</b>';
    return '<div class="dep-note">Farm-ready: ' + ready + ' of ' + D.board_size + ' \u2014 ' + tail + ' Change the deposit and every verdict reprices.</div>';
  }
  function controls() {
    var sc = scenario();
    var rows = filteredRows();
    var tvl = rows.reduce(function (t, r) { return t + r.tvl_usd; }, 0);
    var imp = rows.reduce(function (t, r) { return t + r.implied_value_usd; }, 0);
    var cats = [];
    var chains = [];
    D.rows.forEach(function (r) {
      if (cats.indexOf(r.category || '\u2014') < 0) cats.push(r.category || '\u2014');
      r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
    });
    cats.sort();
    chains.sort();
    var verdicts = ['ROBUST', 'FARM', 'THIN', 'MARGINAL', 'SKIP'];
    var deps = [100, 500, 1000, 2500, 5000, 10000, 25000];
    return '<div class="controls">'
      + '<div class="tabs" role="group" aria-label="Tier">'
      + '<button data-tier="all" aria-pressed="' + (state.tier === 'all') + '">All ' + D.board_size + '</button>'
      + '<button data-tier="watchlist" aria-pressed="' + (state.tier === 'watchlist') + '">Watchlist ' + D.watchlist_size + '</button>'
      + '<button data-tier="early" aria-pressed="' + (state.tier === 'early') + '">Early ' + D.early_size + '</button></div>'
      + '<div class="field"><label for="f-verdict">Verdict</label><select id="f-verdict">' + options(verdicts, state.verdict, 'Any verdict') + '</select></div>'
      + '<div class="field"><label for="f-cat">Category</label><select id="f-cat">' + options(cats, state.category, 'All categories') + '</select></div>'
      + '<div class="field"><label for="f-chain">Chain</label><select id="f-chain">' + options(chains, state.chain, 'All chains') + '</select></div>'
      + '<div class="field"><label for="f-dep">Deposit</label><select id="f-dep">' + deps.map(function (d) { return '<option value="' + d + '"' + (state.deposit === d ? ' selected' : '') + '>$' + d.toLocaleString() + '</option>'; }).join('') + '</select></div>'
      + '<div class="field"><label for="f-drop">Drop share ' + (Math.round(state.drop * 1000) / 10) + '%</label><input id="f-drop" type="range" min="1" max="20" step="0.5" value="' + (state.drop * 100) + '"></div>'
      + '<div class="field"><label for="f-hor">Horizon ' + state.horizon + ' wk</label><input id="f-hor" type="range" min="4" max="52" step="1" value="' + state.horizon + '"></div>'
      + '<div class="field"><label for="f-q">Search</label><input id="f-q" type="search" placeholder="Search protocols" value="' + esc(state.q) + '"></div>'
      + '<button class="button" id="f-reset">Reset</button>'
      + '<button class="button" id="f-csv">CSV</button>'
      + '<button class="button" id="f-json">JSON</button>'
      + '<span class="count">' + rows.length + ' of ' + D.board_size + ' rows</span>'
      + '</div>';
  }
  function sortHead(label, key) {
    var arrow = state.sortKey === key ? (state.sortDir === 'asc' ? ' \u2191' : ' \u2193') : '';
    return '<th><button data-sort="' + key + '">' + label + arrow + '</button></th>';
  }
  // v6: no inline plan on the board — the evidence tables and 13 rows
  // share shot 1, and the 10-step plan lives in the detail view (shot 2),
  // as on the leading boards. The Plan column opens that detail.
  function table() {
    var rows = filteredRows();
    if (rows.length === 0) {
      return '<div class="panel"><div class="empty"><h3>No rows match</h3><p>Loosen a filter or clear the search.</p><button class="button" id="f-reset2">Reset filters</button></div></div>';
    }
    var sc = scenario();
    var body = rows.map(function (r) {
      var e = econ(r, sc);
      var oddsPct = Math.round(r.token_odds * 100);
      var row = '<tr data-slug="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug) + '" title="' + (r.watchlist ? 'Watchlist' : 'Early') + ' \u00b7 ' + esc(r.category || '\u2014') + ' \u00b7 ' + esc(r.chains.join(', ')) + '">'
        + '<td class="num">' + r.rank + '</td>'
        + '<td><div class="name"><span><span class="dot ' + (r.watchlist ? 'watch' : 'off') + '"></span><b>' + esc(r.name) + '</b></span><span class="sub">' + esc(r.category) + ' \u00b7 ' + esc(r.chains && r.chains.length ? r.chains[0] : '') + '</span></div></td>'
        + '<td class="num">' + money(r.tvl_usd) + '</td>'
        + '<td class="num ' + (r.change_7d === null ? '' : r.change_7d < 0 ? 'neg' : 'pos') + '">' + pct(r.change_7d) + '</td>'
        + '<td class="num">' + ageFmt(r.age_days) + '</td>'
        + '<td class="num">' + oddsPct + '% <span class="oddsbar"><i style="width:' + oddsPct + '%"></i></span></td>'
        + '<td class="num">' + money(r.if_launches_usd) + '</td>'
        + '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>'
        + '<td class="num range">' + money(r.range_p25_usd) + '\u2013' + money(r.range_p75_usd) + '</td>'
        + '<td><span class="verdict ' + e.verdict + '">' + e.verdict + '</span><div class="range">' + money2(e.net) + ' \u00b7 ' + money(e.drop) + '\u2212' + money(e.fees) + '</div></td>'
        + '<td class="num ' + (e.perHour >= 0 ? 'pos' : 'neg') + '">' + money2(e.perHour) + '</td>'
        + '<td><button class="planlink" data-plan="' + esc(r.slug) + '">' + r.farm_steps.length + ' steps \u25b8</button></td></tr>';
      return row;
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table class="board"><thead><tr>'
      + sortHead('#', 'rank') + '<th>Protocol</th>' + sortHead('TVL', 'tvl') + sortHead('7D', 'change_7d')
      + sortHead('Age', 'age_days') + sortHead('Odds', 'token_odds') + sortHead('If launches', 'if_launches')
      + sortHead('Implied', 'implied') + '<th>Range</th>' + sortHead('Verdict', 'net')
      + sortHead('Net/h', 'per_hour') + '<th>Plan</th></tr></thead><tbody>' + body + '</tbody></table></div>'
      + '<div class="verdict-legend">Verdicts, at the deposit above: <b>ROBUST</b> clears $25/h on a $500 deposit as well as this one \u00b7 <b>FARM</b> beats the T-bill at $10/h \u00b7 <b>THIN</b> covers its fees \u00b7 <b>MARGINAL</b> loses under $25 \u00b7 <b>SKIP</b> loses more. Change the deposit and every verdict reprices.</div></div>'
      + depositNote();
  }
  function footnote() {
    var sc = scenario();
    return '<section class="panel footnote"><h2>How a row is priced</h2>'
      + '<div class="formula">impliedValue() takes a protocol\u2019s TVL and its listing date from the snapshot, fits the curve on the ' + D.value_comps + ' traded tokens \u2014 log TVL and one bend in size, nothing else \u2014 and multiplies the if-it-launches value by the token odds fitted on the ' + D.odds_peers + ' peers. The 7-day change does not enter the value: it failed the crash-safe test in the evidence above, so a crash can never raise a value here. The board separates protocols whose token already trades \u2014 the live list below, shown at the market\u2019s own value \u2014 from those still to come. A protocol is said to record no token, never to have none: its DefiLlama record may simply not carry one.</div>'
      + '<div class="formula">The farm plan prices a $' + sc.deposit_usd.toLocaleString() + ' deposit over ' + sc.horizon_weeks + ' weeks at a ' + Math.round(sc.drop_share * 100) + '% drop share: the drop is shared pro-rata with the protocol\u2019s TVL; fees are a 0.3% swap plus one gas payment per transaction at the chain\u2019s rate; the T-bill alternative pays 4% a year. ROBUST beats the T-bill at $25 an hour on a $500 deposit as well as on the plan\u2019s deposit; FARM beats it at $10; THIN clears its fees; MARGINAL loses under $25; SKIP loses more. Change the deposit, drop share or horizon above and every verdict reprices \u2014 the $500 plan stays one click away in the deposit selector.</div>'
      + '<div class="formula">Snapshot: DefiLlama, ' + esc(D.as_of) + ' \u00b7 floor $50M \u00b7 ' + D.board_size + ' rows \u00b7 ' + esc(D.source) + ' \u00b7 no network: this page reads only data.js, written beside it by the same program that wrote board.json.</div></section>'
      + '<section class="panel live"><div style="padding:14px 14px 0"><h2>Live token view \u2014 already trading, at the market\u2019s own value</h2></div><div class="table-wrap"><table><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>7D</th></tr></thead><tbody>'
      + D.live.map(function (r) {
        return '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.category || '\u2014') + '</td><td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.mcap_usd) + '</td><td class="num ' + (r.change_7d === null ? '' : r.change_7d < 0 ? 'neg' : 'pos') + '">' + pct(r.change_7d) + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';
  }
  function farmStepsFor(r) {
    if (r.farm_steps && r.farm_steps.length > 0) return r.farm_steps;
    return ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.'];
  }
  // Sensitivity grid: net of fees by drop share (rows) x deposit
  // (columns), same horizon. The plan cell is highlighted.
  function sensGrid(r, sc) {
    var shares = [0.035, 0.07, 0.14];
    var deposits = [1000, 5000, 10000, 30000];
    var head = '<tr><th>DROP SHARE</th>' + deposits.map(function (d) { return '<th class="num">$' + d.toLocaleString() + '</th>'; }).join('') + '</tr>';
    var body = shares.map(function (s) {
      var cells = deposits.map(function (d) {
        var net = econAt(r, { deposit_usd: d, drop_share: s, horizon_weeks: sc.horizon_weeks }, d).net;
        var cls = (s === sc.drop_share && d === sc.deposit_usd) ? ' class="pick"' : '';
        return '<td class="num"' + cls + '>' + money2(net) + '</td>';
      }).join('');
      return '<tr><td>' + (s * 100).toFixed(1) + '%</td>' + cells + '</tr>';
    }).join('');
    return '<table class="sens"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
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
    var g = r.change_7d === null ? 0 : r.change_7d;
    var steps = farmStepsFor(r).map(function (s, i) {
      var m = s.match(/^(.*) Cost: (.*)\. Time: (.*)\.$/);
      var num = '<span class="stepnum">' + (i + 1) + '</span> ';
      if (m) return '<li>' + num + '<b>' + esc(m[1]) + '</b><br><span class="cost">Cost: ' + esc(m[2]) + ' \u00b7 Time: ' + esc(m[3]) + '</span></li>';
      return '<li>' + num + esc(s) + '</li>';
    }).join('');
    var need = depositForRobust(r, sc);
    var depRow;
    if (e.verdict === 'ROBUST') depRow = 'clears it at $' + sc.deposit_usd.toLocaleString();
    else if (need !== null) depRow = 'about $' + need.toLocaleString();
    else depRow = 'not achievable at a ' + Math.round(sc.drop_share * 100) + '% drop';
    var floor = Math.round(r.tvl_usd * 0.83);
    // Fees are covered while the drop share stays above share* (model
    // share x fees / drop) and the token odds above odds* (the odds at
    // which the expected drop equals the fees).
    var shareStar = e.drop > 0 ? sc.drop_share * e.fees / e.drop : null;
    var oddsStar = r.if_launches_usd > 0 ? (e.fees * r.tvl_usd) / (r.if_launches_usd * sc.drop_share * sc.deposit_usd) : null;
    var shareTxt = shareStar === null ? '\u2014' : (shareStar * 100).toFixed(1) + '%';
    var oddsTxt = oddsStar === null ? '\u2014' : oddsStar > 1 ? '>100% (never)' : (oddsStar * 100).toFixed(1) + '%';
    var detail = document.getElementById('detail');
    detail.innerHTML = '<div class="detail-head"><div><div class="sub muted">' + esc(r.category || '\u2014') + ' \u00b7 ' + esc(r.chains.join(', ')) + ' \u00b7 listed ' + esc(r.listed_at || '\u2014') + ' \u00b7 no token for ' + ageFmt(r.age_days) + '</div>'
      + '<h2>' + esc(r.name) + '</h2><div class="sub muted">Rank ' + r.rank + ' of ' + D.board_size + ' \u00b7 ' + (r.watchlist ? 'Watchlist' : 'Early') + ' \u00b7 ' + esc(r.slug) + '</div></div>'
      + '<button class="close" id="detail-close">Close \u2715</button></div>'
      + '<div class="detail-section"><h3>Implied value \u2014 ' + money(r.implied_value_usd) + '</h3><div class="equation">'
      + '<div><span>If it launches</span><b>' + money(r.if_launches_usd) + '</b></div>'
      + '<div><span>Token odds</span><b>' + Math.round(r.token_odds * 100) + '%</b></div>'
      + '<div><span>Printed range P25\u2013P75</span><b>' + money(r.range_p25_usd) + '\u2013' + money(r.range_p75_usd) + '</b></div>'
      + '<div><span>Printed range P10\u2013P90</span><b>' + money(r.range_p10_usd) + '\u2013' + money(r.range_p90_usd) + '</b></div>'
      + '<div><span>Expected drop, this scenario</span><b>' + money(e.drop) + '</b></div>'
      + '<div><span>Fees, this scenario</span><b>' + money(e.fees) + ' (' + e.tx + ' tx)</b></div>'
      + '<div><span>Net of fees</span><b>' + money2(e.net) + '</b></div>'
      + '<div><span>Net per hour (' + e.hours.toFixed(1) + ' h)</span><b>' + money2(e.perHour) + '</b></div>'
      + '<div><span>Same money in a 4% T-bill</span><b>' + money(e.tbill) + '</b></div>'
      + '<div><span>Verdict</span><span class="verdict ' + e.verdict + '">' + e.verdict + '</span></div>'
      + '<div><span>Deposit to clear $25/h</span><b>' + depRow + '</b></div></div></div>'
      + '<div class="detail-section"><h3>How this row is priced</h3><div class="equation">'
      + '<div><span>ln TVL</span><b>' + lnTvl.toFixed(2) + '</b></div>'
      + '<div><span>(ln TVL \u2212 18)\u00b2</span><b>' + (t * t).toFixed(2) + '</b></div>'
      + '<div><span>7-day growth</span><b>' + signed(g, 1) + '% \u00b7 in odds only</b></div>'
      + '<div><span>Intercept</span><b>' + D.value_beta[0].toFixed(4) + '</b></div>'
      + '<div><span>Category effect (' + esc(r.category || 'null') + ')</span><b>tested, not kept</b></div>'
      + '<div><span>Gas per transaction on ' + esc(r.chains[0] || 'main chain') + '</span><b>$' + (D.gas[r.chains[0]] !== undefined ? D.gas[r.chains[0]] : 1).toFixed(2) + '</b></div></div>'
      + '<p class="note" style="margin-top:8px">Fitted on the ' + D.value_comps + ' traded tokens and the ' + D.odds_peers + ' peers; comps winsorized 5\u201395%. Value = size + one bend only: growth, the cubic, chain count, age and the category effect were all tested held-out and left out (see evidence). A crash never raises a value here; growth enters the odds, where it helps tell which peers record a token. No name is special-cased.</p></div>'
      + '<div class="detail-section"><h3>Net by drop share \u00d7 deposit</h3>' + sensGrid(r, sc)
      + '<p class="note" style="margin-top:6px">Benchmarks: the same $' + sc.deposit_usd.toLocaleString() + ' in a 4% T-bill pays ' + money(e.tbill) + ' over ' + sc.horizon_weeks + ' weeks. Fees are covered while the drop share stays above ' + shareTxt + ' (model ' + Math.round(sc.drop_share * 100) + '%) and the token odds above ' + oddsTxt + ' (peers imply ' + Math.round(r.token_odds * 100) + '%). Exit rule: withdraw if TVL prints below ' + money(floor) + ' (\u221217% from today\u2019s ' + money(r.tvl_usd) + ') or if withdrawals pause.</p></div>'
      + '<div class="detail-section"><h3>Farm plan \u2014 ' + r.farm_steps.length + ' steps \u00b7 $' + sc.deposit_usd.toLocaleString() + ', ' + Math.round(sc.drop_share * 100) + '% drop, ' + sc.horizon_weeks + ' weeks</h3><ol class="steps">' + steps + '</ol></div>';
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
    document.getElementById('controls-slot').innerHTML = controls();
    bindTable();
    bindControls();
  }
  function bindTable() {
    var rows = document.querySelectorAll('table.board tbody tr[data-slug]');
    rows.forEach(function (tr) {
      tr.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-plan]')) return;
        openDetail(tr.getAttribute('data-slug'));
        renderTable();
      });
    });
    document.querySelectorAll('[data-plan]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openDetail(btn.getAttribute('data-plan'));
        renderTable();
      });
    });
    document.querySelectorAll('th button[data-sort]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var key = btn.getAttribute('data-sort');
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = key; state.sortDir = key === 'rank' ? 'asc' : 'desc'; }
        renderAll();
      });
    });
    var r2 = document.getElementById('f-reset2');
    if (r2) r2.addEventListener('click', resetAll);
  }
  function bindControls() {
    document.querySelectorAll('[data-tier]').forEach(function (btn) {
      btn.addEventListener('click', function () { state.tier = btn.getAttribute('data-tier'); renderAll(); });
    });
    var v = document.getElementById('f-verdict');
    if (v) v.addEventListener('change', function () { state.verdict = v.value; renderAll(); });
    var c = document.getElementById('f-cat');
    if (c) c.addEventListener('change', function () { state.category = c.value; renderAll(); });
    var ch = document.getElementById('f-chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; renderAll(); });
    var dep = document.getElementById('f-dep');
    if (dep) dep.addEventListener('change', function () { state.deposit = parseInt(dep.value, 10); renderAll(); });
    var drop = document.getElementById('f-drop');
    if (drop) drop.addEventListener('input', function () { state.drop = parseFloat(drop.value) / 100; renderAll(); });
    var hor = document.getElementById('f-hor');
    if (hor) hor.addEventListener('input', function () { state.horizon = parseInt(hor.value, 10); renderAll(); });
    var q = document.getElementById('f-q');
    if (q) q.addEventListener('input', function () { state.q = q.value; renderTable(); });
    var rs = document.getElementById('f-reset');
    if (rs) rs.addEventListener('click', resetAll);
    var csv = document.getElementById('f-csv');
    if (csv) csv.addEventListener('click', downloadCsv);
    var js = document.getElementById('f-json');
    if (js) js.addEventListener('click', downloadJson);
  }
  function resetAll() {
    state.tier = 'all'; state.verdict = 'all'; state.category = 'all'; state.chain = 'all';
    state.deposit = 10000; state.drop = 0.07; state.horizon = 12; state.q = '';
    state.sortKey = 'rank'; state.sortDir = 'asc';
    renderAll();
  }
  function saveBlob(text, name, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
  }
  function quote(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }
  function downloadCsv() {
    var sc = scenario();
    var header = 'rank,slug,name,category,chains,tvl_usd,change_7d,age_days,token_odds,if_launches_usd,implied_value_usd,p25_usd,p75_usd,verdict,drop_usd,fees_usd,net_usd,net_per_hour_usd';
    var lines = filteredRows().map(function (r) {
      var e = econ(r, sc);
      return [r.rank, r.slug, quote(r.name), quote(r.category || ''), quote(r.chains.join(',')), r.tvl_usd, r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days, r.token_odds, r.if_launches_usd, r.implied_value_usd, r.range_p25_usd, r.range_p75_usd, e.verdict, e.drop.toFixed(2), e.fees.toFixed(2), e.net.toFixed(2), e.perHour.toFixed(2)].join(',');
    });
    saveBlob(header + '\n' + lines.join('\n'), 'launch-radar.csv', 'text/csv');
  }
  function downloadJson() {
    saveBlob(JSON.stringify({ rows: filteredRows() }, null, 2), 'launch-radar.json', 'application/json');
  }
  function renderAll() {
    board.innerHTML = '<div class="shell">'
      + '<header class="top"><div><div class="brand"><span class="mark"></span><h1>Launch Radar v6</h1></div>'
      + '<p class="lede"><b>Every value term tested held-out twice, token odds from the peers\u2019 record, costed farm plans</b></p>'
      + '<div class="formula-line">implied value = exp(size + one bend) \u00d7 token odds \u00b7 growth left out of value</div></div>'
      + '<div class="top-meta"><span>DefiLlama snapshot ' + esc(D.as_of) + ' \u00b7 model ' + esc(D.model_version) + '</span><span>' + D.value_comps + ' comps \u00b7 ' + D.odds_peers + ' peers</span><span>no network, no hand-picked names</span></div></header>'
      + kpiCards() + accounting() + integrity()
      + evidence()
      + '<div id="controls-slot">' + controls() + '</div>'
      + '<div id="table-slot">' + table() + '</div>'
      + footnote() + '</div>'
      + '<div class="scrim" id="scrim" hidden></div>'
      + '<aside class="detail" id="detail" hidden aria-label="Protocol detail"></aside>';
    board.setAttribute('aria-busy', 'false');
    document.getElementById('scrim').addEventListener('click', closeDetail);
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeDetail(); });
    bindControls();
    bindTable();
    var detailSlug = params.get('detail');
    if (detailSlug) { openDetail(detailSlug); renderTable(); }
  }
  renderAll();
})();
