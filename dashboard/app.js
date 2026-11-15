/* Launch Radar: reads window.RADAR (data.js) and renders the board. No network.
   One model prices board + detail: value = 10^a x TVL^b (TVL in dollars) x category x growth
   x seasoning x sibling. Slice/net are recomputed from the same row at the chosen capital. */
(function(){'use strict';
var D=window.RADAR||null;
var app=document.getElementById('app');
function dash(v){return v===null||v===undefined||v===''||(typeof v==='number'&&!isFinite(v))?'—':v}
function usd(n){if(n===null||n===undefined||!isFinite(n))return'—';var a=Math.abs(n);if(a>=1e9)return'$'+(n/1e9).toFixed(2)+'B';if(a>=1e6)return'$'+(n/1e6).toFixed(1)+'M';if(a>=1e3)return'$'+Math.round(n/1e3)+'K';return'$'+Math.round(n)}
function usd2(n){if(n===null||n===undefined||!isFinite(n))return'—';var s=n<0?'-':'';n=Math.abs(n);return s+'$'+(n>=100?n.toFixed(0):n.toFixed(2))}
function pct(n){if(n===null||n===undefined||!isFinite(n))return'—';return(n>0?'+':'')+n.toFixed(1)+'%'}
function age(d){if(d===null||d===undefined)return'—';if(d>=365)return(d/365).toFixed(1)+'y';return Math.round(d)+'d'}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function el(t,c,h){var n=document.createElement(t);if(c)n.className=c;if(h!==undefined)n.innerHTML=h;return n}
function M(){return D&&D.model||{}}
function catF(r){var f=M().category_factors||{};return f[r.category]||1}
function growF(r){var g=r.change_7d;g=g===null||g===undefined?0:Math.max(-60,Math.min(120,g));return Math.min(1+0.5*g/100,M().growth_cap||1.4)}
function seasF(r){var m=M(),a=r.age_days===null||r.age_days===undefined?365:r.age_days;var lo=m.seasoning_min||0.7,hi=m.seasoning_max||1.2,dd=m.seasoning_days||1095;return lo+(Math.min(Math.max(a,0),dd)/dd)*(hi-lo)}
function sibF(r){return (r.badges||[]).indexOf('SIBLING')>=0?(M().sibling_factor||1.35):1}
function baseOf(r){return Math.pow(10,M().a||7)*Math.pow(Math.max(r.tvl_usd,1),M().b||0.5)}
function parts(r){var b=baseOf(r),c=catF(r),g=growF(r),s=seasF(r),sb=sibF(r);return{base:b,cat:c,growth:g,season:s,sib:sb,implied:Math.max(1,Math.round(b*c*g*s*sb))}}
function sliceAt(r,cap){return cap/Math.max(r.tvl_usd,1)*(M().slice_share||0.10)*r.implied_value_usd}
function netAt(r,cap){var sl=sliceAt(r,cap);var opp=cap*(M().tbill_pct||4)/100*(r.hold_weeks||8)/52;var net=sl-(r.fees_usd||0)-(r.gas_usd||0)-opp;return{slice:sl,opp:opp,net:net,per:net/Math.max(r.hours||1,0.1)}}
function pct100(v){if(v===null||v===undefined||!isFinite(v))return'—';return(v*100).toFixed(1)+'%'}
function verdictOf(nph){if(!isFinite(nph))return'—';return nph>=5?'FARM':(nph>=0?'THIN':'SKIP')}
function capLbl(c){return c>=1000?'$'+(c/1000)+'K':'$'+c}
var S={tab:'board',q:'',cat:'all',chain:'all',tier:'all',verdict:'all',minTvl:0,capital:1000,sort:'rank',dir:1,sel:null};
if(!D||!D.rows||!D.rows.length){app.innerHTML='<div class="shell"><p class="note">No radar data loaded — data.js is missing or empty.</p></div>';app.setAttribute('aria-busy','false');return}
var ROWS=D.rows.slice(),LIVE=D.live||[],C=D.counts||{},BT=D.backtest||{};
/* Compute each row's multiplier breakdown ONCE at load; board, detail, scatter and rail all read the same stored fields. */
ROWS.forEach(function(r){r._p=parts(r)});
var WD=null;
function whiskDom(){if(!WD){var lo=1e18,hi=0;ROWS.forEach(function(r){if(r.p10&&isFinite(r.p10))lo=Math.min(lo,r.p10);if(r.p90&&isFinite(r.p90))hi=Math.max(hi,r.p90)});if(hi<=lo){lo=1e5;hi=1e10}WD=[Math.log10(lo)-0.15,Math.log10(hi)+0.15]}return WD}
function uniq(a){return Array.from(new Set(a)).sort()}
function filtered(){
  var q=S.q.trim().toLowerCase();
  return ROWS.filter(function(r){
    if(S.cat!=='all'&&r.category!==S.cat)return false;
    if(S.chain!=='all'&&(r.chains||[]).indexOf(S.chain)<0)return false;
    if(S.tier!=='all'&&(r.badges||[]).indexOf(S.tier)<0)return false;
    if(S.minTvl&&r.tvl_usd<S.minTvl)return false;
    if(S.verdict!=='all'&&verdictOf(netAt(r,S.capital).per)!==S.verdict)return false;
    if(q){var h=[r.name,r.slug,r.category,(r.chains||[]).join(' ')].join(' ').toLowerCase();if(h.indexOf(q)<0)return false}
    return true;
  });
}
function sorted(list){var k=S.sort,d=S.dir;
  return list.slice().sort(function(a,b){var av,bv;
    if(k==='name'){av=a.name.toLowerCase();bv=b.name.toLowerCase()}
    else if(k==='tvl'){av=a.tvl_usd;bv=b.tvl_usd}
    else if(k==='ch7'){av=a.change_7d===null?-1e9:a.change_7d;bv=b.change_7d===null?-1e9:b.change_7d}
    else if(k==='age'){av=a.age_days===null?1e9:a.age_days;bv=b.age_days===null?1e9:b.age_days}
    else if(k==='implied'){av=a.implied_value_usd;bv=b.implied_value_usd}
    else if(k==='slice'){av=sliceAt(a,S.capital);bv=sliceAt(b,S.capital)}
    else if(k==='net'){av=netAt(a,S.capital).per;bv=netAt(b,S.capital).per}
    else{av=a.rank;bv=b.rank}
    if(av<bv)return-d;if(av>bv)return d;return a.rank-b.rank;});
}
function badges(r){var h='';(r.badges||[]).forEach(function(b){h+='<span class="badge '+(b==='WATCHLIST'?'wl':b==='EARLY'?'er':'sb')+'">'+b+'</span>'});return h}
function whisk(r){var d=whiskDom(),lo=Math.log10(Math.max(r.p10||r.implied_value_usd/2,1)),hi=Math.log10(Math.max(r.p90||r.implied_value_usd*2,1)),v=Math.log10(Math.max(r.implied_value_usd,1));
  var mn=d[0],mx=d[1];function X(x){return((x-mn)/(mx-mn))*100}
  var a=Math.max(0,X(lo)),b=Math.min(100,X(hi)),c=Math.max(0,Math.min(100,X(v)));
  return '<span class="whisk" title="P10 '+usd(r.p10)+' – P90 '+usd(r.p90)+'"><i style="left:'+a.toFixed(1)+'%;width:'+Math.max(1,b-a).toFixed(1)+'%"></i><em style="left:'+a.toFixed(1)+'%"></em><em style="left:'+b.toFixed(1)+'%"></em><b style="left:'+c.toFixed(1)+'%"></b></span>'}
function header(){
  var h=el('header','top');
  h.innerHTML='<span class="logo"></span><h1>Launch Radar</h1><span class="sub">DefiLlama snapshot '+esc(D.as_of||'—')+' · '+esc(C.protocols||'—')+' protocols · model '+esc(M().version||'—')+'</span>'+
  '<span class="badges"><span class="pill ok">Watchlist <b>'+esc(C.watchlist||'—')+'/'+esc(C.watchlist||'—')+'</b> on board</span>'+
  '<span class="pill">Page = board.json <b>'+esc(C.ranked||'—')+'/'+esc(C.ranked||'—')+' rows</b></span>'+
  '<span class="leg"><span><i style="color:var(--grn)">■</i> <b>FARM</b></span><span><i style="color:var(--amb)">■</i> <b>THIN</b></span><span><i style="color:var(--red)">■</i> <b>SKIP</b></span></span></span>';
  return h;
}
function hero(){
  var n=C.ranked||ROWS.length;
  var s=el('section','hero');
  s.innerHTML='<h2>'+n+' protocols record no token. Here is what each launch would be worth, and what farming it costs.</h2>'+
  '<p>Every value is read off the fitted curve — <b>no name is hand-picked</b> and one function prices every row. “Records no token” is DefiLlama’s record, not proof that none exists. A launch is worth farming only if the slice it pays beats its fees, gas and the T-bill yield on the same capital.</p>';
  return s;
}
function methodCard(){
  var m=M(),bt=BT.loo||{},ts=BT.timesplit||{};
  var best=(D.farm_next&&D.farm_next[0])||null;
  var c=el('section','card');
  c.innerHTML='<h3>How a launch is priced</h3>'+
  '<div class="formula">value = 10<sup>'+esc(m.a)+' </sup>× TVL<sup>'+esc(m.b)+'</sup> (TVL in dollars)<br>× category × growth × seasoning × sibling</div>'+
  '<table class="bt"><tr><th>Blind check</th><th>Model</th><th>Flat</th></tr>'+
  '<tr><td>Leave-one-out, median miss</td><td class="num">×'+esc(bt.median_miss)+'</td><td class="num">×'+esc(bt.flat_median_miss)+'</td></tr>'+
  '<tr><td>Time-split, median miss</td><td class="num">×'+esc(ts.median_miss)+'</td><td class="num">×'+esc(ts.flat_median_miss)+'</td></tr>'+
  '<tr><td>Within 3× of real cap</td><td class="num">'+pct100(bt.within3)+'</td><td class="num">'+pct100(bt.flat_within3)+'</td></tr>'+
  '<tr><td>Within 10× of real cap</td><td class="num">'+pct100(bt.within10)+'</td><td class="num">—</td></tr></table>'+
  '<p class="best">Best net per hands-on hour on the watchlist: '+(best?'<b>'+esc(best.name)+' +'+esc(best.per_hour)+' /h</b>':'—')+' · R² '+esc(m.r2)+' on '+esc(m.n_families)+' traded families · b 95% CI ['+esc((BT.bootstrap_b_ci||[])[0])+', '+esc((BT.bootstrap_b_ci||[])[1])+']</p>';
  return c;
}
function scatter(){
  var c=el('section','card scatter');
  var W=640,H=236,pl=44,pr=10,pt=10,pb=26;
  var xs=[],ys=[];
  ROWS.forEach(function(r){xs.push(r.tvl_usd);ys.push(r.implied_value_usd);if(r.p10)ys.push(r.p10);if(r.p90)ys.push(r.p90)});
  LIVE.forEach(function(r){xs.push(r.tvl_usd);if(r.mcap_usd)ys.push(r.mcap_usd)});
  var x0=Math.floor(Math.log10(Math.min.apply(null,xs))-0.2),x1=Math.ceil(Math.log10(Math.max.apply(null,xs))+0.2);
  var y0=Math.floor(Math.log10(Math.min.apply(null,ys))-0.2),y1=Math.ceil(Math.log10(Math.max.apply(null,ys))+0.2);
  function X(v){return pl+(Math.log10(v)-x0)/(x1-x0)*(W-pl-pr)}
  function Y(v){return pt+(y1-Math.log10(v))/(y1-y0)*(H-pt-pb)}
  function tick(v){if(v>=1e9)return'$'+(v/1e9)+'B';if(v>=1e6)return'$'+(v/1e6)+'M';return'$'+(v/1e3)+'K'}
  var hw=0.5*(ROWS.reduce(function(s,r){return s+Math.log10(Math.max(r.p90||r.implied_value_usd*2,1)/Math.max(r.p10||r.implied_value_usd/2,1))},0)/ROWS.length);
  var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Log-log scatter: traded tokens as teal dots, board rows as amber dots, fitted line and P10 to P90 band">';
  var i;
  for(i=x0;i<=x1;i++){var gx=X(Math.pow(10,i));s+='<line x1="'+gx+'" y1="'+pt+'" x2="'+gx+'" y2="'+(H-pb)+'" stroke="#1c2822"/><text x="'+gx+'" y="'+(H-8)+'" fill="#6b7f72" font-size="9" text-anchor="middle">'+tick(Math.pow(10,i))+'</text>'}
  for(i=y0;i<=y1;i++){var gy=Y(Math.pow(10,i));s+='<line x1="'+pl+'" y1="'+gy+'" x2="'+(W-pr)+'" y2="'+gy+'" stroke="#1c2822"/><text x="'+(pl-4)+'" y="'+(gy+3)+'" fill="#6b7f72" font-size="9" text-anchor="end">'+tick(Math.pow(10,i))+'</text>'}
  s+='<text x="'+(W/2)+'" y="'+(H-0)+'" fill="#6b7f72" font-size="9" text-anchor="middle"></text>';
  var a=M().a||7,b=M().b||0.5;
  function fitY(tvl){return Math.pow(10,a)*Math.pow(Math.max(tvl,1),b)}
  var xA=Math.pow(10,x0),xB=Math.pow(10,x1);
  s+='<polygon points="'+X(xA)+','+Y(fitY(xA)*Math.pow(10,hw))+' '+X(xB)+','+Y(fitY(xB)*Math.pow(10,hw))+' '+X(xB)+','+Y(fitY(xB)/Math.pow(10,hw))+' '+X(xA)+','+Y(fitY(xA)/Math.pow(10,hw))+'" fill="#f0b23a" opacity="0.08"/>';
  s+='<line x1="'+X(xA)+'" y1="'+Y(fitY(xA))+'" x2="'+X(xB)+'" y2="'+Y(fitY(xB))+'" stroke="#f0b23a" stroke-width="1.4" stroke-dasharray="5 3"/>';
  LIVE.forEach(function(r){if(!r.mcap_usd||!isFinite(r.mcap_usd)||r.mcap_usd<=0||!r.tvl_usd||r.tvl_usd<=0)return;s+='<circle cx="'+X(r.tvl_usd).toFixed(1)+'" cy="'+Y(r.mcap_usd).toFixed(1)+'" r="2.4" fill="#5eead4" opacity="0.75"><title>'+esc(r.name)+' — market cap '+usd(r.mcap_usd)+'</title></circle>'});
  ROWS.forEach(function(r){if(!r.tvl_usd||r.tvl_usd<=0||!isFinite(r.implied_value_usd))return;s+='<circle data-slug="'+esc(r.slug)+'" cx="'+X(r.tvl_usd).toFixed(1)+'" cy="'+Y(r.implied_value_usd).toFixed(1)+'" r="'+(S.sel===r.slug?4.5:2.6)+'" fill="#f0b23a" '+(S.sel===r.slug?'stroke="#fff" stroke-width="1"':'')+' style="cursor:pointer"><title>'+esc(r.name)+' — implied '+usd(r.implied_value_usd)+'</title></circle>'});
  s+='</svg>';
  c.innerHTML='<h3>Traded tokens and the curve</h3>'+s+
  '<p class="cap">Teal: '+esc(LIVE.length)+' traded tokens, market cap on TVL. Amber: the board at its implied value. Line: the size curve before family offsets; shaded band: P10–P90. Click an amber dot to open that row — hovering a dot highlights its row below.</p>';
  var svg=c.querySelector('svg');
  svg.addEventListener('click',function(e){var t=e.target;if(t&&t.getAttribute('data-slug')){select(t.getAttribute('data-slug'),true)}});
  svg.addEventListener('mouseover',function(e){var t=e.target;if(t&&t.getAttribute('data-slug')){var tr=document.querySelector('tr[data-slug="'+t.getAttribute('data-slug')+'"]');if(tr)tr.style.background='#1a2b22'}});
  svg.addEventListener('mouseout',function(e){var t=e.target;if(t&&t.getAttribute('data-slug')){var tr=document.querySelector('tr[data-slug="'+t.getAttribute('data-slug')+'"]');if(tr)tr.style.background=''}});
  return c;
}
function rail(){
  var c=el('section','card rail');
  var fn=D.farm_next||[];
  var h='<h3>Farm next · top 5 by net /h</h3><ol class="fn">';
  fn.forEach(function(f,i){h+='<li data-slug="'+esc(f.slug)+'"><span class="rk">'+(i+1)+'</span><span><span class="nm">'+esc(f.name)+'</span><br><span class="nt">net '+usd2(f.net)+'</span></span><span class="ph">+'+esc(f.per_hour)+' /h</span></li>'});
  h+='</ol>';
  var sel=ROWS.filter(function(r){return r.slug===S.sel})[0]||ROWS[0];
  h+='<h3 style="margin-top:12px">How a row is valued</h3>';
  if(sel){var p=sel._p||parts(sel);
    h+='<table class="mult"><tr><td>Base · 10<sup>'+esc(M().a)+'</sup> × TVL<sup>'+esc(M().b)+'</sup> (TVL in dollars)</td><td>'+usd(p.base)+'</td></tr>'+
    '<tr><td>× Category · '+esc(sel.category||'—')+'</td><td>×'+p.cat.toFixed(2)+'</td></tr>'+
    '<tr><td>× Growth · 7d '+pct(sel.change_7d)+'</td><td>×'+p.growth.toFixed(2)+'</td></tr>'+
    '<tr><td>× Seasoning · '+age(sel.age_days)+' no token</td><td>×'+p.season.toFixed(2)+'</td></tr>'+
    '<tr><td>× Sibling · '+(((sel.badges||[]).indexOf('SIBLING')>=0)?'kin trades':'no kin')+'</td><td>×'+p.sib.toFixed(2)+'</td></tr>'+
    '<tr class="tot"><td>= '+esc(sel.name)+'</td><td>'+usd(p.implied)+'</td></tr></table>'+
    '<p class="note" style="margin-top:6px">Board carries '+usd(sel.implied_value_usd)+' — '+(p.implied===sel.implied_value_usd?'matches the board figure exactly.':'differs by '+usd(Math.abs(p.implied-sel.implied_value_usd))+'; the board figure is the one ranked.')+'</p>';
  } else h+='<p class="note">—</p>';
  c.innerHTML=h;
  c.querySelectorAll('.fn li').forEach(function(li){li.addEventListener('click',function(){select(li.getAttribute('data-slug'),true)})});
  return c;
}
function tabs(){
  var t=el('div','tabs');
  var defs=[['board','No token yet',C.ranked||ROWS.length],['live','Token trades',C.traded||LIVE.length],['aside','Set aside',C.set_aside||'—'],['method','Method and backtest',null]];
  defs.forEach(function(d){var b=el('button');b.setAttribute('aria-selected',S.tab===d[0]?'true':'false');
    b.innerHTML=esc(d[1])+(d[2]!==null?' <b>'+esc(d[2])+'</b>':'');
    b.addEventListener('click',function(){S.tab=d[0];render()});t.appendChild(b)});
  return t;
}
function filters(){
  var f=el('div','filters');
  var cats=uniq(ROWS.map(function(r){return r.category||'Other'}));
  var chs=uniq(ROWS.reduce(function(a,r){return a.concat(r.chains||[])},[]));
  function opt(v,l,sel){return '<option value="'+esc(v)+'"'+(String(v)===String(sel)?' selected':'')+'>'+esc(l)+'</option>'}
  var h='<input type="search" id="fq" placeholder="Search name, category or chain" value="'+esc(S.q)+'" aria-label="Search the board">'+
  '<select id="fcat" aria-label="Category">'+opt('all','All categories',S.cat)+cats.map(function(c){return opt(c,c,S.cat)}).join('')+'</select>'+
  '<select id="fch" aria-label="Chain">'+opt('all','All chains',S.chain)+chs.map(function(c){return opt(c,c,S.chain)}).join('')+'</select>'+
  '<select id="ftier" aria-label="Tier">'+opt('all','All tiers',S.tier)+opt('WATCHLIST','WATCHLIST',S.tier)+opt('EARLY','EARLY',S.tier)+'</select>'+
  '<select id="fv" aria-label="Verdict">'+opt('all','All verdicts',S.verdict)+['FARM','THIN','SKIP'].map(function(v){return opt(v,v,S.verdict)}).join('')+'</select>'+
  '<select id="ftvl" aria-label="Minimum TVL">'+opt(0,'Min TVL: any',S.minTvl)+[[5e7,'$50M'],[1e8,'$100M'],[2.5e8,'$250M'],[5e8,'$500M'],[1e9,'$1B']].map(function(p){return opt(p[0],p[1],S.minTvl)}).join('')+'</select>'+
  '<select id="fcap" aria-label="Capital">'+[100,500,1000,5000].map(function(c){return opt(c,'Capital '+capLbl(c),S.capital)}).join('')+'</select>'+
  '<button class="rst" id="frst" type="button">Reset</button><span class="cnt" id="fcnt"></span>';
  f.innerHTML=h;
  f.querySelector('#fq').addEventListener('input',function(e){S.q=e.target.value;render(true)});
  f.querySelector('#fcat').addEventListener('change',function(e){S.cat=e.target.value;render()});
  f.querySelector('#fch').addEventListener('change',function(e){S.chain=e.target.value;render()});
  f.querySelector('#ftier').addEventListener('change',function(e){S.tier=e.target.value;render()});
  f.querySelector('#fv').addEventListener('change',function(e){S.verdict=e.target.value;render()});
  f.querySelector('#ftvl').addEventListener('change',function(e){S.minTvl=+e.target.value;render()});
  f.querySelector('#fcap').addEventListener('change',function(e){S.capital=+e.target.value;render()});
  f.querySelector('#frst').addEventListener('click',function(){S.q='';S.cat='all';S.chain='all';S.tier='all';S.verdict='all';S.minTvl=0;S.capital=1000;render()});
  return f;
}
function th(key,label,cls){var b=el('button');b.type='button';b.innerHTML=esc(label)+(S.sort===key?(S.dir<0?' ↓':' ↑'):'');
  b.addEventListener('click',function(){if(S.sort===key)S.dir=-S.dir;else{S.sort=key;S.dir=key==='name'?1:-1}render()});
  var t=el('th',cls||'');t.appendChild(b);return t}
function boardTable(){
  var list=sorted(filtered());
  var wrap=el('div','panel');
  if(!list.length){wrap.innerHTML='<div class="empty">No protocol matches that filter.<br>Clear the search or pick another filter to see the board again.</div>';return wrap}
  var tw=el('div','tw');
  var tb=el('table','grid');
  var thead=el('thead');var hr=el('tr');
  hr.appendChild(th('rank','#'));hr.appendChild(th('name','Protocol'));
  hr.appendChild(th('tvl','TVL','r'));hr.appendChild(th('ch7','7D','r'));hr.appendChild(th('age','No token for','r'));
  hr.appendChild(th('implied','Implied value · P10–P90','r'));hr.appendChild(th('slice',capLbl(S.capital)+' slice','r'));
  hr.appendChild(th('net','Net · $/h','r'));var last=el('th');last.textContent='Farm · fees · hold';hr.appendChild(last);
  thead.appendChild(hr);tb.appendChild(thead);
  var body=el('tbody');
  list.forEach(function(r){
    var n=netAt(r,S.capital),v=verdictOf(n.per);
    var tr=el('tr');tr.setAttribute('data-slug',r.slug);if(S.sel===r.slug)tr.className='sel';
    tr.innerHTML='<td class="num">'+r.rank+'</td>'+
    '<td><span class="nm2">'+esc(r.name)+'</span>'+badges(r)+'<br><span class="sub2">'+esc(r.category||'—')+' · '+esc((r.chains||[]).slice(0,2).join(', ')||'—')+((r.chains||[]).length>2?' +'+(r.chains.length-2):'')+'</span></td>'+
    '<td class="num r">'+usd(r.tvl_usd)+'</td>'+
    '<td class="num r '+(r.change_7d===null?'':r.change_7d>=0?'pos':'neg')+'">'+pct(r.change_7d)+'</td>'+
    '<td class="num r">'+age(r.age_days)+'</td>'+
    '<td class="r"><span style="display:inline-flex;align-items:center;gap:6px">'+whisk(r)+'<span class="num">'+usd(r.implied_value_usd)+'</span></span><br><span class="sub2 num">'+usd(r.p10)+' – '+usd(r.p90)+'</span></td>'+
    '<td class="num r">'+usd2(n.slice)+'</td>'+
    '<td class="r">'+(v==='—'?'—':'<span class="chip '+v+'">'+v+'</span>')+'<div class="netline"><span class="num">'+usd2(n.net)+'</span><br><span class="per">'+usd2(n.per)+' /h</span></div></td>'+
    '<td><span class="sub2">'+esc((r.steps&&r.steps[1]?r.steps[1].split(' Cost:')[0]:'')||'—')+'</span><br><span class="sub2 num">fees '+usd2(r.fees_usd)+' · gas '+usd2(r.gas_usd)+' · '+esc(r.hold_weeks)+' wk</span></td>';
    tr.addEventListener('click',function(){select(r.slug,true)});
    body.appendChild(tr);
  });
  tb.appendChild(body);tw.appendChild(tb);wrap.appendChild(tw);
  return wrap;
}
function liveTable(){
  var wrap=el('div','panel');
  var tw=el('div','tw');var tb=el('table','grid');
  tb.innerHTML='<thead><tr><th>#</th><th>Protocol</th><th class="r">TVL</th><th class="r">7D</th><th class="r">Market cap</th><th class="r">Mcap / TVL</th></tr></thead>';
  var body=el('tbody');
  LIVE.forEach(function(r,i){var tr=el('tr');
    tr.innerHTML='<td class="num">'+(i+1)+'</td><td><span class="nm2">'+esc(r.name)+'</span><br><span class="sub2">'+esc(r.category||'—')+' · '+esc((r.chains||[]).slice(0,2).join(', ')||'—')+'</span></td>'+
    '<td class="num r">'+usd(r.tvl_usd)+'</td><td class="num r '+(r.change_7d===null?'':r.change_7d>=0?'pos':'neg')+'">'+pct(r.change_7d)+'</td>'+
    '<td class="num r">'+usd(r.mcap_usd)+'</td><td class="num r">'+(r.mcap_usd&&r.tvl_usd?(r.mcap_usd/r.tvl_usd).toFixed(2)+'×':'—')+'</td>';
    body.appendChild(tr)});
  tb.appendChild(body);tw.appendChild(tb);wrap.appendChild(tw);
  var note=el('p','note');note.style.padding='10px 12px';note.innerHTML='Market values, never model values. These protocols already trade, so they are the comps the curve is fitted on — they are set apart from the ranked board, not ranked by it.';
  wrap.appendChild(note);return wrap;
}
function asideTable(){
  var wrap=el('div','panel');
  var rules=D.set_aside_rules||null;
  var h='<div style="padding:12px 14px"><p class="note"><b>'+esc(C.set_aside||'—')+' protocols were set aside</b> before ranking. Each rule is a property of the snapshot record — no name is hand-picked.</p>';
  if(rules){h+='<table class="bt" style="margin-top:8px"><tr><th>Rule</th><th>What it excludes</th><th style="text-align:right">Count</th></tr>';
    rules.forEach(function(ru){h+='<tr><td>'+esc(ru[0])+'</td><td>'+esc(ru[1])+'</td><td class="num" style="text-align:right">'+esc(ru[2])+'</td></tr>'});
    h+='</table>';
  } else {
    h+='<table class="bt" style="margin-top:8px"><tr><th>Rule</th><th>What it excludes</th></tr>'+
    '<tr><td>CEX</td><td>Centralised exchange — not a DeFi protocol</td></tr>'+
    '<tr><td>Versioned pool</td><td>Name ends in a version (e.g. V2) — a pool of another protocol</td></tr>'+
    '<tr><td>Wrapped / staked / bridged</td><td>A wrapped, staked or bridged form of a token that already trades</td></tr>'+
    '<tr><td>Kin / parent</td><td>Token already exists via a parent or sibling protocol</td></tr></table>'+
    '<p class="note" style="margin-top:8px">Per-rule counts are not in this data file — only the total above.</p>';
  }
  h+='</div>';wrap.innerHTML=h;return wrap;
}
function methodTab(){
  var m=M(),bt=BT.loo||{},ts=BT.timesplit||{};
  var cf=m.category_factors||{};
  var fac=Object.keys(cf).sort(function(a,b){return cf[b]-cf[a]}).map(function(k){return '<tr><td>'+esc(k)+'</td><td class="num">×'+cf[k].toFixed(2)+'</td></tr>'}).join('');
  var w=el('div','panel method');
  w.innerHTML='<div class="full"><h3 style="font-size:13px;text-transform:none;letter-spacing:0;color:var(--ink)">Method and backtest</h3>'+
  '<p class="note">One function prices every row. The curve is fitted on '+esc(m.n_families)+' traded token families: log market cap on log TVL, then a category factor, a 7-day growth factor, a seasoning factor for time with no token, and a sibling factor where a kin token already trades. Nothing is hand-picked; a protocol moves only when its snapshot figures move.</p></div>'+
  '<div><h4>Formula</h4><div class="formula">value = 10<sup>'+esc(m.a)+'</sup> × TVL<sup>'+esc(m.b)+'</sup> (TVL in dollars)<br>× category × growth × seasoning × sibling</div>'+
  '<h4>Growth and seasoning</h4><p class="note">Growth = 1 + 0.5 × clamp(7d change, −60%, +120%) ÷ 100, capped at ×1.40. Seasoning rises from ×'+esc(m.seasoning_min)+' to ×'+esc(m.seasoning_max)+' over '+esc(m.seasoning_days)+' days with no token. Sibling ×'+esc(m.sibling_factor)+' where a kin token trades, ×1.00 otherwise. Fit: R² '+esc(m.r2)+', slope b 95% CI ['+esc((BT.bootstrap_b_ci||[])[0])+', '+esc((BT.bootstrap_b_ci||[])[1])+'].</p>'+
  '<h4>Slice, net and verdict</h4><p class="note">A '+capLbl(S.capital)+' deposit earns its pro-rata share of '+(esc((m.slice_share||0.1)*100))+'% of the launch: slice = capital ÷ TVL × '+esc((m.slice_share||0.1)*100)+'% × implied value. Net = slice − fees − gas − T-bill yield ('+esc(m.tbill_pct)+'% on the capital for the hold). Net per hour = net ÷ hands-on hours. FARM ≥ $5/h, THIN ≥ $0/h, otherwise SKIP.</p></div>'+
  '<div><h4>Backtest — out of sample</h4><table class="bt"><tr><th>Check</th><th>Model</th><th>Flat</th></tr>'+
  '<tr><td>Leave-one-out median miss</td><td class="num">×'+esc(bt.median_miss)+'</td><td class="num">×'+esc(bt.flat_median_miss)+'</td></tr>'+
  '<tr><td>Time-split median miss</td><td class="num">×'+esc(ts.median_miss)+'</td><td class="num">×'+esc(ts.flat_median_miss)+'</td></tr>'+
  '<tr><td>Within 3× of real cap</td><td class="num">'+pct100(bt.within3)+'</td><td class="num">'+pct100(bt.flat_within3)+'</td></tr>'+
  '<tr><td>Within 10× of real cap</td><td class="num">'+pct100(bt.within10)+'</td><td class="num">—</td></tr>'+
  '<tr><td>Band P50 / P80</td><td class="num">×'+esc((BT.band50||[])[0])+' – ×'+esc((BT.band50||[])[1])+' / ×'+esc((BT.band80||[])[0])+' – ×'+esc((BT.band80||[])[1])+'</td><td class="num">—</td></tr></table>'+
  '<h4>Category factors</h4><table class="bt">'+fac+'</table></div>'+
  '<div class="full"><p class="note">What the model cannot see: a launch may never happen, an airdrop may exclude depositors, and “no token” is only DefiLlama’s record. Implied value is a fitted estimate, not a price — the P10–P90 band is the honest width of that estimate.</p></div>';
  return w;
}
function detailPanel(){
  var r=ROWS.filter(function(x){return x.slug===S.sel})[0];
  if(!r)return null;
  var p=r._p||parts(r),n=netAt(r,S.capital),v=verdictOf(n.per);
  var d=el('section','card detail');
  var mn=Math.log10(Math.max(r.p10||1,1)),mx=Math.log10(Math.max(r.p90||1,1)),vv=Math.log10(Math.max(r.implied_value_usd,1));
  function X(x){return((x-(mn-0.3))/((mx+0.3)-(mn-0.3)))*100}
  var lo=X(mn),hi=X(mx),dot=X(vv);
  var steps=(r.steps||[]).map(function(s){return '<li>'+esc(s)+'</li>'}).join('');
  d.innerHTML='<div class="dhead"><h2>#'+r.rank+' '+esc(r.name)+'</h2>'+badges(r)+(v==='—'?'':'<span class="chip '+v+'">'+v+'</span>')+'<span class="num mut">'+usd(r.implied_value_usd)+' implied</span><button class="x" type="button" id="dclose">Close ✕</button></div>'+
  '<div class="dcols"><div><h4>Valuation breakdown — same model as the board</h4>'+
  '<table class="mult"><tr><td>Base · 10<sup>'+esc(M().a)+'</sup> × TVL<sup>'+esc(M().b)+'</sup> (TVL in dollars)</td><td>'+usd(p.base)+'</td></tr>'+
  '<tr><td>× Category · '+esc(r.category||'—')+'</td><td>×'+p.cat.toFixed(2)+'</td></tr>'+
  '<tr><td>× Growth · 7d '+pct(r.change_7d)+'</td><td>×'+p.growth.toFixed(2)+'</td></tr>'+
  '<tr><td>× Seasoning · '+age(r.age_days)+' with no token</td><td>×'+p.season.toFixed(2)+'</td></tr>'+
  '<tr><td>× Sibling · '+(((r.badges||[]).indexOf('SIBLING')>=0)?'kin trades':'no kin')+'</td><td>×'+p.sib.toFixed(2)+'</td></tr>'+
  '<tr class="tot"><td>= Implied value</td><td>'+usd(p.implied)+'</td></tr></table>'+
  '<p class="note" style="margin-top:6px">Board row carries '+usd(r.implied_value_usd)+' — '+(p.implied===r.implied_value_usd?'recomputed exactly.':'differs by '+usd(Math.abs(p.implied-r.implied_value_usd))+'; the board figure is the one ranked.')+'</p>'+
  '<h4>Uncertainty · P10–P90</h4><div class="bandbar"><i style="left:'+lo.toFixed(1)+'%;width:'+Math.max(1,hi-lo).toFixed(1)+'%"></i><b style="left:'+dot.toFixed(1)+'%"></b></div>'+
  '<p class="note num">'+usd(r.p10)+' — '+usd(r.implied_value_usd)+' — '+usd(r.p90)+'</p>'+
  '<h4>Net at '+capLbl(S.capital)+'</h4><div class="netmath">slice '+usd2(n.slice)+' − fees '+usd2(r.fees_usd)+' − gas '+usd2(r.gas_usd)+' − T-bill '+usd2(n.opp)+'<br>= net <b style="color:'+(n.net>=0?'var(--grn)':'var(--red)')+'">'+usd2(n.net)+'</b> · '+usd2(n.per)+' /h over '+esc(r.hours)+' h · hold '+esc(r.hold_weeks)+' wk</div></div>'+
  '<div><h4>Farm plan — 6 steps</h4><ol class="steps">'+steps+'</ol></div></div>';
  d.querySelector('#dclose').addEventListener('click',function(){S.sel=null;render()});
  return d;
}
function select(slug,scroll){S.sel=slug;render();if(scroll){var d=document.getElementById('detail');if(d)d.scrollIntoView({behavior:'smooth',block:'start'})}}
function render(keepFocus){
  var active=document.activeElement;
  app.textContent='';
  var sh=el('div','shell');
  sh.appendChild(header());sh.appendChild(hero());
  var band=el('div','band');band.appendChild(methodCard());band.appendChild(scatter());band.appendChild(rail());sh.appendChild(band);
  sh.appendChild(tabs());
  if(S.tab==='board'){
    var det=detailPanel();if(det){det.id='detail';sh.appendChild(det)}
    sh.appendChild(filters());
    sh.appendChild(boardTable());
    var c=sh.querySelector('#fcnt');if(c)c.textContent=filtered().length+' of '+ROWS.length+' rows shown';
  } else if(S.tab==='live'){sh.appendChild(liveTable());
  } else if(S.tab==='aside'){sh.appendChild(asideTable());
  } else {sh.appendChild(methodTab())}
  var ft=el('p','foot');ft.innerHTML='Source: '+esc(D.source||'—')+' · snapshot '+esc(D.as_of||'—')+' · floor '+usd(D.floor_usd)+' TVL · model '+esc(M().version||'—')+'. Implied values are model estimates from a fitted curve, not prices and not investment advice. No data leaves this page; the dashboard makes no network requests.';
  sh.appendChild(ft);
  app.appendChild(sh);app.setAttribute('aria-busy','false');
  if(keepFocus&&active&&active.id==='fq'){var q=document.getElementById('fq');if(q){q.focus();q.setSelectionRange(q.value.length,q.value.length)}}
}
render();
})();
