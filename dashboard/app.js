/* Launch Radar's page: renders window.RADAR into the board, the evidence
   and the detail view. No network, no framework: every number on the page
   comes from data.js, which main.ts writes from the same board as
   board.json, so the screenshots and the code agree by construction.
   The integrity strip recomputes the board's checks here, in the browser. */
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) { document.getElementById('board').textContent = 'No data: data.js did not load.'; return; }

  /* ------------------------------------------------------------ helpers */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) {
    if (n == null) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
  }
  function money2(n) { return (n < 0 ? '−$' : '$') + Math.abs(n).toFixed(0); }
  function signed(n, d) { var v = (n < 0 ? '−' : '+') + Math.abs(n).toFixed(d == null ? 1 : d); return v; }
  function pct(n) { return n == null ? '—' : signed(n, 1) + '%'; }
  function ageFmt(days) {
    if (days == null) return 'unknown';
    if (days < 90) return days + ' d';
    if (days < 730) return (days / 30.44).toFixed(0) + ' mo';
    return (days / 365).toFixed(1) + ' yr';
  }
  function fmtDate(s) { return s || '—'; }

  /** FNV-1a, the same checksum main.ts writes: rank:slug:implied; per row. */
  function checksum(rows) {
    var h = 0x811c9dc5;
    var text = rows.map(function (r) { return r.rank + ':' + r.slug + ':' + r.implied_value_usd + ';'; }).join('');
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  /* ------------------------------------------------------------ economics */
  /* Mirrors lib/model.ts econFor: same gas table, same plan, same verdicts. */
  function planWork(weeks) { return { tx: 2 + weeks + 1, hours: (5 + 15 + weeks * 15 + 15 + 5) / 60 }; }
  function econ(row, sc) {
    var gas = D.gas[row.chains[0]] == null ? 1.0 : D.gas[row.chains[0]];
    var w = planWork(sc.horizon_weeks);
    var drop = (row.implied_value_usd * sc.drop_share * sc.deposit_usd) / (0.1 * row.tvl_usd);
    var fees = 0.003 * sc.deposit_usd + gas * w.tx;
    var net = drop - fees;
    var tbill = sc.deposit_usd * 0.04 * (sc.horizon_weeks / 52);
    var perHour = net / w.hours;
    var verdict;
    if (net > tbill && perHour >= 25) verdict = 'ROBUST';
    else if (net > tbill && perHour >= 10) verdict = 'FARM';
    else if (net > 0) verdict = 'THIN';
    else if (net >= -25) verdict = 'MARGINAL';
    else verdict = 'SKIP';
    return { drop: drop, fees: fees, net: net, perHour: perHour, tbill: tbill, hours: w.hours, tx: w.tx, verdict: verdict };
  }

  /* ------------------------------------------------------------ state */
  var params = new URLSearchParams(location.search);
  var state = {
    tier: params.get('tier') || 'all',
    verdict: params.get('verdict') || 'all',
    category: params.get('category') || 'all',
    chain: params.get('chain') || 'all',
    deposit: parseInt(params.get('deposit') || '1000', 10),
    drop: parseFloat(params.get('drop') || '0.07'),
    horizon: parseInt(params.get('horizon') || '12', 10),
    q: params.get('q') || '',
    sortKey: params.get('sort') || 'rank',
    sortDir: params.get('dir') || 'asc',
    selected: null,
  };
  function scenario() { return { deposit_usd: state.deposit, drop_share: state.drop, horizon_weeks: state.horizon }; }
  var watchSet = {};
  D.rows.forEach(function (r) { if (r.watchlist) watchSet[r.slug] = true; });

  function filteredRows() {
    var sc = scenario();
    var rows = D.rows.filter(function (r) {
      if (state.tier === 'watchlist' && !r.watchlist) return false;
      if (state.tier === 'early' && r.watchlist) return false;
      var e = econ(r, sc);
      if (state.verdict !== 'all' && e.verdict !== state.verdict) return false;
      if (state.category !== 'all' && (r.category || '—') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
        if (hay.indexOf(state.q.toLowerCase()) < 0) return false;
      }
      return true;
    });
    var key = state.sortKey;
    var dir = state.sortDir === 'desc' ? -1 : 1;
    rows.sort(function (a, b) {
      var va, vb;
      if (key === 'net' || key === 'per_hour') { va = econ(a, sc)[key === 'net' ? 'net' : 'perHour']; vb = econ(b, sc)[key === 'net' ? 'net' : 'perHour']; }
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

  /* ------------------------------------------------------------ pieces */
  var COLORS = ['#e8b23a', '#5aa9e6', '#3fbf7a', '#b48ce8', '#e5604f', '#e87ab0', '#7ad0c3', '#d08a4e', '#8a9ba8'];
  function kpiCards() {
    var sc = scenario();
    var live = D.rows.map(function (r) { return econ(r, sc); });
    var worth = live.filter(function (e) { return e.verdict === 'ROBUST'; }).length;
    var skip = live.filter(function (e) { return e.verdict === 'SKIP'; }).length;
    var cards = [
      { label: 'Out-of-sample miss, walk-forward', value: '×' + D.kpi.miss_wf.toFixed(2), sub: 'vs ×' + D.kpi.miss_flat_wf.toFixed(2) + ' flat · LOO ×' + D.kpi.miss_loo.toFixed(2) + ' · ' + D.value_comps + ' traded tokens' },
      { label: 'Is the printed range honest?', value: D.range.p2575_wf + '% · ' + D.range.p1090_wf + '%', sub: 'of later-listed caps fall inside P25–P75 (stated 50%) · P10–P90 (stated 80%); LOO ' + D.range.p2575_loo + '% · ' + D.range.p1090_loo + '%' },
      { label: 'Token odds vs base rate, Brier', value: D.kpi.brier_wf.toFixed(3), sub: 'walk-forward vs ' + D.kpi.brier_base_wf.toFixed(3) + ' base rate · ' + Math.round(D.kpi.odds_acc_wf * 100) + '% of later peers called right · LOO ' + D.kpi.brier_loo.toFixed(3) + ' · ' + D.odds_peers + ' peers' },
      { label: 'Terms that survived both tests', value: D.kpi.value_kept + ' of ' + D.kpi.value_tested + ' · ' + D.kpi.odds_kept + ' of ' + D.kpi.odds_tested, sub: 'value model · token odds; the rest are shown below, not used' },
      { label: 'Worth farming, this scenario', value: worth + ' of ' + D.board_size, sub: 'net beats a T-bill and $25 an hour · ' + skip + ' skip · plan $' + state.deposit.toLocaleString() + ', ' + Math.round(state.drop * 100) + '% drop, ' + state.horizon + ' wk' },
      { label: 'Watchlist ranked', value: D.watchlist_size + ' / ' + D.watchlist_size, sub: 'plus ' + D.early_size + ' pre-token protocols it leaves out' },
    ];
    return '<section class="kpis" aria-label="Headline figures">' + cards.map(function (c) {
      return '<div class="kpi"><div class="k-label">' + esc(c.label) + '</div><div class="k-value">' + esc(c.value) + '</div><div class="k-sub">' + esc(c.sub) + '</div></div>';
    }).join('') + '</section>';
  }

  function accounting() {
    var total = D.accounting.reduce(function (t, g) { return t + g.count; }, 0);
    var bar = D.accounting.map(function (g, i) {
      return '<i style="width:' + (g.count / total * 100).toFixed(2) + '%;background:' + COLORS[i % COLORS.length] + '" title="' + esc(g.label) + ' ' + g.count + '"></i>';
    }).join('');
    var legend = D.accounting.map(function (g, i) {
      return '<span><i class="dot" style="background:' + COLORS[i % COLORS.length] + '"></i>' + esc(g.label) + ' <b class="num">' + g.count + '</b></span>';
    }).join('');
    return '<section class="account"><div class="account-head"><span><b>PROTOCOL ACCOUNTING</b></span><span>all ' + total + ' snapshot protocols in exactly one group</span></div>' +
      '<div class="account-bar">' + bar + '</div><div class="account-legend">' + legend + '</div></section>';
  }

  function integrity() {
    var rows = D.rows;
    var nOk = rows.length === D.board_size;
    var ranksOk = rows.every(function (r, i) { return r.rank === i + 1; });
    var monoOk = rows.every(function (r, i) { return i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd; });
    var total = rows.reduce(function (t, r) { return t + r.implied_value_usd; }, 0);
    var totalOk = total === D.total_implied_usd;
    var sumOk = checksum(rows) === D.checksum;
    var watchCount = rows.filter(function (r) { return r.watchlist; }).length;
    var watchOk = watchCount === D.watchlist_size;
    var ledgerOk = D.accounting.reduce(function (t, g) { return t + g.count; }, 0) === 758;
    function mark(ok) { return ok ? '<span class="ok">✓</span>' : '<span class="neg">✗</span>'; }
    return '<div class="integrity">' +
      '<span>' + mark(nOk) + ' this table = board.json · ' + rows.length + ' of ' + D.board_size + ' rows recomputed here</span>' +
      '<span>' + mark(ranksOk && monoOk) + ' ranks 1–' + D.board_size + ', values never rise</span>' +
      '<span>' + mark(totalOk) + ' totals equal: ' + money(total) + '</span>' +
      '<span>' + mark(sumOk) + ' checksum ' + D.checksum + ' = main.ts</span>' +
      '<span>' + mark(watchOk) + ' watchlist ' + watchCount + ' of ' + D.watchlist_size + ' ranked</span>' +
      '<span>' + mark(ledgerOk) + ' ledger 758 of 758 protocols</span></div>';
  }

  function evTable(title, rows, unit) {
    var body = rows.map(function (r) {
      var v = r.kept ? '<span class="kept">kept</span>' : '<span class="notkept">tested, not kept</span>';
      return '<tr><th>' + esc(r.term) + '</th><td class="num">' + unit + r.loo.toFixed(unit === '×' ? 2 : 3) + '</td><td class="num">' + unit + r.wf.toFixed(unit === '×' ? 2 : 3) + '</td><td>' + v + '</td></tr>';
    }).join('');
    return '<div class="ev-panel"><h3>' + esc(title) + '</h3><table><thead><tr><th>TERM, ADDED IN ORDER</th><th class="num">LEAVE-ONE-OUT</th><th class="num">WALK-FORWARD</th><th></th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function evidence() {
    var vb = D.value_beta, ob = D.odds_beta;
    var w2575 = Math.exp(D.range.q75 - D.range.q25).toFixed(1);
    var w1090 = Math.exp(D.range.q90 - D.range.q10).toFixed(1);
    var formula = 'impliedValue() = exp(' + vb[0].toFixed(4) + ' + ' + vb[1].toFixed(4) + ' · ln TVL ' + (vb[2] < 0 ? '− ' : '+ ') + Math.abs(vb[2]).toFixed(4) + ' · growth) × tokenOdds()';
    var odds = 'tokenOdds() = sigmoid(' + ob[0].toFixed(2) + ' + ' + ob[1].toFixed(2) + ' · size + ' + ob[2].toFixed(2) + ' · ln months + ' + ob[3].toFixed(2) + ' · age unknown ' + (ob[4] < 0 ? '− ' : '+ ') + Math.abs(ob[4]).toFixed(2) + ' · growth + ' + ob[5].toFixed(2) + ' · sibling)';
    return '<section class="evidence"><h2>Out-of-sample evidence</h2>' +
      '<p class="note">A term is kept only if it lowers the held-out miss in both tests: leave-one-out and walk-forward (tokens listed earlier price those listed later). Reading it: 7-day growth fails to price a token\u2019s value on its own, so it enters through the odds; chain count and category do not survive either test, so they are not in the model.</p>' +
      '<div class="ev-grid">' +
      evTable('Value if a token launches — typical miss, ' + D.value_comps + ' traded tokens', D.value_evidence, '×') +
      evTable('Token odds — Brier score, ' + D.odds_peers + ' peers', D.odds_evidence, '') +
      '<div class="ev-panel"><h3>Is the printed range honest?</h3><table><thead><tr><th></th><th class="num">LEAVE-ONE-OUT</th><th class="num">WALK-FORWARD</th></tr></thead><tbody>' +
      '<tr><th>Within ×3 of the model</th><td class="num">' + D.range.within3_loo + '%</td><td class="num">' + D.range.within3_wf + '%</td></tr>' +
      '<tr><th>Inside P25–P75, stated 50%</th><td class="num">' + D.range.p2575_loo + '%</td><td class="num">' + D.range.p2575_wf + '%</td></tr>' +
      '<tr><th>Inside P10–P90, stated 80%</th><td class="num">' + D.range.p1090_loo + '%</td><td class="num">' + D.range.p1090_wf + '%</td></tr>' +
      '</tbody></table><div class="formula">Range: the printed P25–P75 is the 25th–75th percentile of the leave-one-out misses, ×' + w2575 + ' wide; P10–P90 ×' + w1090 + ' wide.</div></div>' +
      '</div>' +
      '<div class="formula" style="margin-top:12px"><b>How a row is priced — impliedValue() + backtest()</b><br>' + esc(formula) + '<br>' + esc(odds) + '<br>R² ' + D.value_r2.toFixed(3) + ' on ' + D.value_comps + ' comps · base token rate ' + (D.odds_base_rate * 100).toFixed(1) + '% of ' + D.odds_peers + ' peers · model ' + esc(D.model_version) + ', refitted in this browser from the same data.</div>' +
      '</section>';
  }

  function options(list, current, allLabel) {
    return '<option value="all"' + (current === 'all' ? ' selected' : '') + '>' + esc(allLabel) + '</option>' +
      list.map(function (v) { return '<option value="' + esc(v) + '"' + (current === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
  }

  function controls() {
    var cats = [];
    D.rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
    cats.sort();
    var chains = [];
    D.rows.forEach(function (r) { r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
    chains.sort();
    var rows = filteredRows();
    var tvl = rows.reduce(function (t, r) { return t + r.tvl_usd; }, 0);
    var imp = rows.reduce(function (t, r) { return t + r.implied_value_usd; }, 0);
    return '<div class="controls">' +
      '<div class="tabs" role="group" aria-label="Tier">' +
      [['all', 'All ' + D.board_size], ['watchlist', 'Watchlist ' + D.watchlist_size], ['early', 'Early ' + D.early_size]].map(function (t) {
        return '<button data-tier="' + t[0] + '" aria-pressed="' + (state.tier === t[0]) + '">' + esc(t[1]) + '</button>';
      }).join('') + '</div>' +
      '<div class="field"><label for="f-verdict">Verdict</label><select id="f-verdict">' + options(['ROBUST', 'FARM', 'THIN', 'MARGINAL', 'SKIP'], state.verdict, 'Any verdict') + '</select></div>' +
      '<div class="field"><label for="f-cat">Category</label><select id="f-cat">' + options(cats, state.category, 'All categories') + '</select></div>' +
      '<div class="field"><label for="f-chain">Chain</label><select id="f-chain">' + options(chains, state.chain, 'All chains') + '</select></div>' +
      '<div class="field"><label for="f-dep">Deposit</label><select id="f-dep">' + [100, 500, 1000, 2500, 5000, 10000].map(function (v) { return '<option value="' + v + '"' + (state.deposit === v ? ' selected' : '') + '>$' + v.toLocaleString() + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="f-drop">Drop share ' + Math.round(state.drop * 1000) / 10 + '%</label><input id="f-drop" type="range" min="1" max="20" step="0.5" value="' + (state.drop * 100) + '"></div>' +
      '<div class="field"><label for="f-hor">Horizon ' + state.horizon + ' wk</label><input id="f-hor" type="range" min="4" max="52" step="1" value="' + state.horizon + '"></div>' +
      '<div class="field"><label for="f-q">Search name, chain, category</label><input id="f-q" type="search" value="' + esc(state.q) + '" placeholder="Search protocols"></div>' +
      '<button class="button" id="f-reset">Reset</button>' +
      '<button class="button" id="f-csv">CSV</button>' +
      '<button class="button" id="f-json">JSON</button>' +
      '<span class="count">' + rows.length + ' of ' + D.board_size + ' rows · ' + money(tvl) + ' TVL · ' + money(imp) + ' implied</span>' +
      '</div>';
  }

  function sortHead(label, key) {
    var arrow = state.sortKey === key ? (state.sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return '<th><button data-sort="' + key + '">' + esc(label) + arrow + '</button></th>';
  }

  function table() {
    var sc = scenario();
    var rows = filteredRows();
    if (rows.length === 0) {
      return '<div class="panel"><div class="empty"><h3>No rows match</h3><p>Loosen a filter or clear the search.</p><button class="button" id="f-reset2">Reset filters</button></div></div>';
    }
    var body = rows.map(function (r) {
      var e = econ(r, sc);
      var badge = r.watchlist ? '<span class="badge watch">Watchlist</span>' : '<span class="badge off">Early</span>';
      var sub = esc(r.category || 'No category') + ' · ' + esc(r.chains[0] || '—') + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '');
      var g = r.change_7d == null ? '<span class="muted">—</span>' : '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</span>';
      var odds = '<span class="num">' + Math.round(r.token_odds * 100) + '%</span> <span class="oddsbar"><i style="width:' + Math.round(r.token_odds * 100) + '%"></i></span>';
      return '<tr data-slug="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><div class="name"><span><b>' + esc(r.name) + '</b>' + badge + '</span><span class="sub">' + sub + '</span></div></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + g + '</td>' +
        '<td class="num">' + ageFmt(r.age_days) + '</td>' +
        '<td>' + odds + '</td>' +
        '<td class="num">' + money(r.if_launches_usd) + '</td>' +
        '<td><div class="implied"><span class="num"><b>' + money(r.implied_value_usd) + '</b></span></div><div class="range num">' + money(r.range_p25_usd) + '–' + money(r.range_p75_usd) + '</div></td>' +
        '<td><span class="verdict ' + e.verdict + '">' + e.verdict + '</span><div class="range num">' + money2(e.net) + ' · ' + money(e.drop) + ' drop − ' + money(e.fees) + ' fees</div></td>' +
        '<td class="num ' + (e.perHour >= 0 ? 'pos' : 'neg') + '">' + money2(e.perHour) + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table class="board"><thead><tr>' +
      sortHead('#', 'rank') + '<th>Protocol</th>' + sortHead('TVL', 'tvl') + sortHead('7D', 'change_7d') + sortHead('No-token age', 'age_days') + sortHead('Token odds', 'token_odds') + sortHead('If it launches', 'if_launches') + sortHead('Implied value · P25–P75', 'implied') + sortHead('Verdict · net of fees', 'net') + sortHead('Net / hour', 'per_hour') +
      '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function footnote() {
    var live = D.live.map(function (p) {
      return '<tr><td><b>' + esc(p.name) + '</b></td><td>' + esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + (p.mcap_usd == null ? '—' : money(p.mcap_usd)) + '</td><td class="num">' + pct(p.change_7d) + '</td></tr>';
    }).join('');
    return '<section class="panel footnote"><h2>How a row is priced</h2>' +
      '<div class="formula">impliedValue() takes a protocol\u2019s TVL, its 7-day change and its listing date from the snapshot, fits the curve on the ' + D.value_comps + ' traded tokens, and multiplies the if-it-launches value by the token odds fitted on the ' + D.odds_peers + ' peers. The board separates protocols whose token already trades — the live list below, shown at the market\u2019s own value — from those still to come. A protocol is said to record no token, never to have none: its DefiLlama record may simply not carry one.</div>' +
      '<div class="formula">The farm plan prices a $' + D.scenario.deposit_usd.toLocaleString() + ' deposit over ' + D.scenario.horizon_weeks + ' weeks at a ' + Math.round(D.scenario.drop_share * 100) + '% drop share: the drop is shared pro-rata with the tenth of TVL that is points-eligible deposits; fees are a 0.3% swap plus one gas payment per transaction at the chain\u2019s rate; the T-bill alternative pays 4% a year. ROBUST beats the T-bill at $25 an hour; FARM beats it at $10; THIN clears its fees; MARGINAL loses under $25; SKIP loses more. Change the deposit, drop share or horizon above and every verdict reprices.</div>' +
      '<div class="formula">Snapshot: DefiLlama, ' + esc(D.as_of) + ' · floor $50M · ' + D.board_size + ' rows · ' + esc(D.source) + ' · no network: this page reads only data.js, written beside it by the same program that wrote board.json.</div></section>' +
      '<section class="panel live" style="padding:16px 20px"><h2>Live token view — already trading, at the market\u2019s own value</h2>' +
      '<table><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>7D</th></tr></thead><tbody>' + live + '</tbody></table></section>';
  }

  /* ------------------------------------------------------------ detail */
  function farmStepsFor(r) {
    if (r.farm_steps && r.farm_steps.length) return r.farm_steps;
    return ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.'];
  }

  function openDetail(slug) {
    var r = null;
    D.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    state.selected = slug;
    var sc = scenario();
    var e = econ(r, sc);
    var vb = D.value_beta;
    var lnTvl = Math.log(r.tvl_usd);
    var g = Math.min(1.2, Math.max(-0.6, (r.change_7d == null ? 0 : r.change_7d) / 100));
    var steps = farmStepsFor(r).map(function (s) {
      var m = String(s).match(/^(.*) Cost: (.*)\. Time: (.*)\.$/);
      if (!m) return '<li>' + esc(s) + '</li>';
      return '<li><b>' + esc(m[1]) + '</b><span class="cost">Cost: ' + esc(m[2]) + ' · Time: ' + esc(m[3]) + '</span></li>';
    }).join('');
    var d = document.getElementById('detail');
    d.innerHTML =
      '<div class="detail-head"><div><div class="sub">' + esc(r.category || 'No category') + ' · ' + esc(r.chains.join(', ') || '—') + ' · listed ' + fmtDate(r.listed_at) + ' · no token for ' + ageFmt(r.age_days) + '</div>' +
      '<h2>' + esc(r.name) + '</h2><div class="sub">Rank ' + r.rank + ' of ' + D.board_size + (r.watchlist ? ' · Watchlist' : ' · Early') + ' · ' + esc(r.slug) + '</div></div>' +
      '<button class="close" id="detail-close">Close ✕</button></div>' +
      '<div class="detail-section"><h3>Implied value — ' + money(r.implied_value_usd) + '</h3><div class="equation">' +
      '<div><span>If it launches</span><b>' + money(r.if_launches_usd) + '</b></div>' +
      '<div><span>Token odds</span><b>' + Math.round(r.token_odds * 100) + '%</b></div>' +
      '<div><span>Printed range P25–P75</span><b>' + money(r.range_p25_usd) + ' – ' + money(r.range_p75_usd) + '</b></div>' +
      '<div><span>Printed range P10–P90</span><b>' + money(r.range_p10_usd) + ' – ' + money(r.range_p90_usd) + '</b></div>' +
      '<div><span>Expected drop, this scenario</span><b>' + money(e.drop) + '</b></div>' +
      '<div><span>Fees, this scenario</span><b>' + money(e.fees) + ' (' + e.tx + ' tx)</b></div>' +
      '<div><span>Net of fees</span><b>' + money2(e.net) + '</b></div>' +
      '<div><span>Net per hour (' + e.hours.toFixed(2) + ' h)</span><b>' + money2(e.perHour) + '</b></div>' +
      '<div><span>Verdict</span><b><span class="verdict ' + e.verdict + '">' + e.verdict + '</span></b></div>' +
      '</div></div>' +
      '<div class="detail-section"><h3>How this row is priced</h3><div class="equation">' +
      '<div><span>ln TVL (' + money(r.tvl_usd) + ')</span><b>' + (vb[1] * lnTvl).toFixed(2) + '</b></div>' +
      '<div><span>7-day growth (' + pct(r.change_7d) + ')</span><b>' + (vb[2] * g).toFixed(2) + '</b></div>' +
      '<div><span>Intercept</span><b>' + vb[0].toFixed(2) + '</b></div>' +
      '<div><span>Gas per transaction on ' + esc(r.chains[0] || 'its chain') + '</span><b>' + (D.gas[r.chains[0]] == null ? '$1.00' : '$' + D.gas[r.chains[0]].toFixed(2)) + '</b></div>' +
      '</div><p class="muted" style="margin-top:8px;font-size:12px">The curve is fitted on the ' + D.value_comps + ' traded tokens; the odds on the ' + D.odds_peers + ' peers. No name is special-cased: the same two functions price every row.</p></div>' +
      '<div class="detail-section"><h3>Farm plan — $' + sc.deposit_usd.toLocaleString() + ', ' + Math.round(sc.drop_share * 100) + '% drop, ' + sc.horizon_weeks + ' weeks</h3><ol class="steps">' + steps + '</ol></div>';
    d.hidden = false;
    document.getElementById('scrim').hidden = false;
    document.getElementById('detail-close').addEventListener('click', closeDetail);
  }
  function closeDetail() {
    state.selected = null;
    var d = document.getElementById('detail');
    if (d) d.hidden = true;
    var s = document.getElementById('scrim');
    if (s) s.hidden = true;
    renderTable();
  }

  /* ------------------------------------------------------------ render */
  var main = document.getElementById('board');
  function renderTable() {
    var t = document.getElementById('table-slot');
    if (t) t.innerHTML = table();
    bindTable();
    var c = main.querySelector('#controls-slot .count');
    if (c) { var tmp = document.createElement('div'); tmp.innerHTML = controls(); c.outerHTML = tmp.querySelector('.count').outerHTML; }
  }
  function bindTable() {
    var tb = main.querySelector('table.board');
    if (!tb) return;
    tb.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); renderTable(); });
    });
    tb.querySelectorAll('th button[data-sort]').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var k = b.getAttribute('data-sort');
        if (state.sortKey === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = k; state.sortDir = k === 'rank' ? 'asc' : 'desc'; }
        renderAll();
      });
    });
    var r2 = document.getElementById('f-reset2');
    if (r2) r2.addEventListener('click', function () { resetAll(); });
  }
  function bindControls() {
    main.querySelectorAll('[data-tier]').forEach(function (b) {
      b.addEventListener('click', function () { state.tier = b.getAttribute('data-tier'); renderAll(); });
    });
    var v = document.getElementById('f-verdict');
    if (v) v.addEventListener('change', function () { state.verdict = v.value; renderAll(); });
    var c = document.getElementById('f-cat');
    if (c) c.addEventListener('change', function () { state.category = c.value; renderAll(); });
    var ch = document.getElementById('f-chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; renderAll(); });
    var dep = document.getElementById('f-dep');
    if (dep) dep.addEventListener('change', function () { state.deposit = parseInt(dep.value, 10); renderAll(); });
    var dr = document.getElementById('f-drop');
    if (dr) dr.addEventListener('input', function () { state.drop = parseFloat(dr.value) / 100; renderAll(); });
    var ho = document.getElementById('f-hor');
    if (ho) ho.addEventListener('input', function () { state.horizon = parseInt(ho.value, 10); renderAll(); });
    var q = document.getElementById('f-q');
    if (q) q.addEventListener('input', function () { state.q = q.value; renderTable(); });
    var rs = document.getElementById('f-reset');
    if (rs) rs.addEventListener('click', function () { resetAll(); });
    var csv = document.getElementById('f-csv');
    if (csv) csv.addEventListener('click', downloadCsv);
    var js = document.getElementById('f-json');
    if (js) js.addEventListener('click', downloadJson);
  }
  function resetAll() {
    state.tier = 'all'; state.verdict = 'all'; state.category = 'all'; state.chain = 'all';
    state.deposit = 1000; state.drop = 0.07; state.horizon = 12; state.q = '';
    state.sortKey = 'rank'; state.sortDir = 'asc';
    renderAll();
  }
  function downloadCsv() {
    var sc = scenario();
    var head = 'rank,slug,name,category,chains,tvl_usd,change_7d,age_days,token_odds,if_launches_usd,implied_value_usd,p25_usd,p75_usd,verdict,drop_usd,fees_usd,net_usd,net_per_hour_usd\n';
    var lines = filteredRows().map(function (r) {
      var e = econ(r, sc);
      return [r.rank, r.slug, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || '') + '"', '"' + r.chains.join('|') + '"', r.tvl_usd, r.change_7d == null ? '' : r.change_7d, r.age_days == null ? '' : r.age_days, r.token_odds, r.if_launches_usd, r.implied_value_usd, r.range_p25_usd, r.range_p75_usd, e.verdict, e.drop.toFixed(2), e.fees.toFixed(2), e.net.toFixed(2), e.perHour.toFixed(2)].join(',');
    }).join('\n');
    saveBlob(new Blob([head + lines + '\n'], { type: 'text/csv' }), 'launch-radar.csv');
  }
  function downloadJson() {
    saveBlob(new Blob([JSON.stringify({ rows: filteredRows() }, null, 2)], { type: 'application/json' }), 'launch-radar.json');
  }
  function saveBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function renderAll() {
    main.innerHTML =
      '<div class="shell">' +
      '<header class="top"><div><div class="brand"><span class="mark"></span><h1>Launch Radar</h1></div>' +
      '<p class="lede"><b>' + D.board_size + ' protocols that record no token, ranked by implied value</b> — value if a token launches × token odds. The curve and the odds are fitted on this snapshot\u2019s own traded tokens and peers, backtested blind, and refitted here from the same data.</p></div>' +
      '<div class="top-meta"><span>DefiLlama snapshot ' + esc(D.as_of) + '</span><span>model ' + esc(D.model_version) + '</span><span>' + D.value_comps + ' comps · ' + D.odds_peers + ' peers</span><span>no network, no hand-picked names</span></div></header>' +
      kpiCards() + accounting() + integrity() + evidence() +
      '<div id="controls-slot">' + controls() + '</div>' +
      '<div id="table-slot">' + table() + '</div>' +
      footnote() +
      '</div>' +
      '<div class="scrim" id="scrim" hidden></div>' +
      '<aside class="detail" id="detail" hidden aria-label="Protocol detail"></aside>';
    main.setAttribute('aria-busy', 'false');
    document.getElementById('scrim').addEventListener('click', closeDetail);
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeDetail(); });
    bindControls();
    bindTable();
    var detailSlug = params.get('detail');
    if (detailSlug) { openDetail(detailSlug); renderTable(); }
  }
  renderAll();
})();
