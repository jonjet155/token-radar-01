// Launch Radar (model radar-8): rank pre-token DefiLlama protocols by
// implied launch value and price a farm plan for each row.
//
// Five steps, all fitted on the snapshot itself:
//  1. Fit a value curve on the traded tokens: log market cap on log TVL
//     and a bend in size, with comps winsorized 5-95%. Every value term
//     was kept only if it lowers the held-out miss in BOTH leave-one-out
//     and walk-forward (earlier listings price later ones). The term
//     tournament (see backtestValue) keeps size + the bend and drops the
//     cubic, 7-day growth, chain count, age, the category effect and a
//     control term. Growth is out of value on purpose: the capped form
//     lowers both tests only by paying crashes (coefficient -2.05), and
//     the crash-safe form max(0, growth) fails walk-forward x4.36, so a
//     crash can never raise a value here. Growth enters through the odds.
//  2. Fit token odds on the standing peers: a logistic model on size,
//     no-token age, 7-day growth and whether a namesake sibling exists.
//  3. implied value = exp(value curve) x token odds, per protocol.
//  4. Price the farm: the drop is shared pro-rata with the protocol's
//     TVL; fees are a 0.3% swap plus one gas payment per transaction; the
//     verdict also checks the plan at $25 an hour on a $500 deposit as
//     well as on the plan deposit.
//  5. Print the range from the leave-one-out misses, widened x1.2, so the
//     P25-P75 band is an honest statement about the curve's own error.
//
// No name is special-cased: every coefficient comes from the snapshot.

export interface SnapshotProtocol {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot {
  as_of: string; source: string; floor_usd: number;
  protocols: SnapshotProtocol[]; watchlist: string[];
}
export interface FarmScenario { deposit_usd: number; drop_share: number; horizon_weeks: number; }
export interface FarmStep { text: string; cost: string; time: string; }
export interface BoardRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
  token_status: 'pre-token'; age_days: number | null;
  implied_value_usd: number; if_launches_usd: number; token_odds: number;
  range_p25_usd: number; range_p75_usd: number; range_p10_usd: number; range_p90_usd: number;
  verdict: string; drop_value_usd: number; fees_usd: number; net_of_fees_usd: number;
  net_per_hour_usd: number;
  model: { growth_pct: number; age_days: number | null; sibling: boolean; category_effect: number };
  farm_steps: string[];
}
export interface RadarRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; listed_at: string | null; age_days: number | null;
  implied_value_usd: number; if_launches_usd: number; token_odds: number;
  range_p25_usd: number; range_p75_usd: number; range_p10_usd: number; range_p90_usd: number;
  verdict: string; drop_value_usd: number; fees_usd: number; net_of_fees_usd: number;
  net_per_hour_usd: number; watchlist: boolean; sibling: boolean; category_effect: number;
  farm_steps: string[];
}
export interface LiveRow {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; mcap_usd: number | null; change_7d: number | null;
}
export interface EvidenceRow { term: string; loo: number; wf: number; kept: boolean; note: string; }
export interface AccountGroup { label: string; count: number; note: string; }
export interface RadarData {
  as_of: string; source: string; floor_usd: number; model_version: string;
  watchlist_size: number; board_size: number; early_size: number; live_size: number;
  total_implied_usd: number; checksum: string; scenario: FarmScenario;
  value_beta: number[]; value_r2: number; value_comps: number; value_cat_min: number; value_cat_max: number;
  odds_beta: number[]; odds_peers: number; odds_base_rate: number;
  value_evidence: EvidenceRow[]; odds_evidence: EvidenceRow[];
  range: { q10: number; q25: number; q75: number; q90: number; widen: number; within3_loo: number; within3_wf: number; p2575_loo: number; p2575_wf: number; p1090_loo: number; p1090_wf: number };
  kpi: { miss_wf: number; miss_flat_wf: number; miss_loo: number; brier_wf: number; brier_base_wf: number; brier_loo: number; odds_acc_wf: number; odds_acc_loo: number; odds_acc_insample: number; odds_prec_low_wf: number; odds_prec_low_n_wf: number; odds_prec_low_loo: number; odds_prec_low_n_loo: number; odds_prec_high_wf: number; odds_prec_high_n_wf: number; value_kept: number; value_tested: number; odds_kept: number; odds_tested: number; worth_farming: number; skip_count: number; verdicts: Record<string, number> };
  accounting: AccountGroup[]; rows: RadarRow[]; live: LiveRow[]; gas: Record<string, number>;
}
export interface ValueBacktest {
  beta: number[]; eff: Record<string, number>; r2: number;
  loo: number[]; wf: number[]; evidence: EvidenceRow[]; flatLoo: number; flatWf: number;
}
export interface OddsBacktest {
  beta: number[]; baseRate: number; loo: number; wf: number; looAcc: number; wfAcc: number;
  insampleAcc: number; baseLoo: number; baseWf: number; evidence: EvidenceRow[];
  // Precision on the confident subsets, held-out: the honest equivalent of
  // a headline accuracy. Low = the peers called unlikely (odds <= 10%):
  // how many recorded no token. High = the peers called likely (>= 70%).
  // Conf = accuracy on either extreme (odds >= 90% or <= 10%).
  precLowLoo: number; precLowNLoo: number; precLowWf: number; precLowNWf: number;
  precHighWf: number; precHighNWf: number; confAccWf: number; confNWf: number;
}
export interface Econ {
  drop_value_usd: number; fees_usd: number; net_of_fees_usd: number;
  net_per_hour_usd: number; tbill_usd: number; hours: number; tx: number; verdict: string;
}
export class SnapshotError extends Error {
  constructor(message: string) { super(message); this.name = 'SnapshotError'; }
}

export const SCENARIO: FarmScenario = { deposit_usd: 10000, drop_share: 0.07, horizon_weeks: 12 };
export const MODEL_VERSION = 'radar-8';
export const WINSOR_LO = 0.05;
export const WINSOR_HI = 0.95;
export const CATEGORY_RIDGE_K = 50;
export const RANGE_WIDEN = 1.2;
export const SMALL_DEPOSIT_USD = 500;
export const EARLY_ROWS = 158;
export const LIVE_ROWS = 24;
export const TBILL_RATE = 0.04;
export const GAS_PER_TX: Record<string, number> = {
  Ethereum: 4.0, Tron: 6.5, Solana: 0.02, Base: 0.08, Arbitrum: 0.1, Optimism: 0.1,
  BSC: 0.3, Polygon: 0.05, Avalanche: 0.4, Sui: 0.05, 'zkSync Era': 0.15, Linea: 0.1,
  Mantle: 0.05, Berachain: 0.1, Hyperliquid: 0.05, Plume: 0.05, Pharos: 0.05,
  Bittensor: 0.1, Provenance: 0.1,
};

const DAY_MS = 86_400_000;
const ln = Math.log;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function quantile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}
function typicalMiss(errors: number[]): number {
  return Math.exp(median(errors.map((e) => Math.abs(e))));
}
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCLUDED_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking',
  'Restaked BTC', 'CEX', 'Chain',
]);
export function isStanding(p: SnapshotProtocol): boolean {
  return !EXCLUDED_CATEGORIES.has(p.category ?? '') && !VERSIONED.test(p.name) && !WRAPPED_WORD.test(p.name);
}
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}
function growthFrac(p: SnapshotProtocol): number {
  return Math.min(1.2, Math.max(-0.6, finite(p.change_7d, 0) / 100));
}
// --- Value model (radar-8): log market cap on log TVL and a bend in size ---
// Term tournament, every variant fitted on winsorized comps (5-95%) and
// scored by typical miss in BOTH leave-one-out and walk-forward:
//   flat median multiple                x4.89   x5.33   baseline
//   size curve, ln TVL                  x3.38   x2.86   kept
//   + size bend, (ln TVL-18)^2          x3.21   x2.49   kept
//   + size bend, (ln TVL-18)^3          x3.47   x2.37   not kept: LOO worse
//   + 7-day growth, capped +/-30%       x2.84   x2.45   not kept: lowers both
//       only by paying crashes (coefficient -2.05); the crash-safe form
//       max(0, growth) fails walk-forward at x4.36, so growth stays out
//   + 7-day growth, crash-safe max(0,g) x3.15   x4.36   not kept
//   + chain count, ln                   x3.33   x2.68   not kept
//   + no-token age, ln                  x3.25   x2.93   not kept
//   + category effect, ridge 50         x3.21   x2.49   not kept: no gain
//   + control: growth of another row    x3.43   x2.64   must not help
//   same features, unwinsorized         x3.28   x2.64   not kept
// A term is kept only if the model with it beats the model without it in
// both tests. The kept model is size + the bend: two terms, no category,
// no growth, no cubic. Growth helps tell which peers record a token, so
// it enters through the odds only.
export function valueComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0 && p.listed_at !== null);
}
function sizeCentre(p: SnapshotProtocol): number { return ln(p.tvl_usd) - 18; }
// Control term: the 7-day growth of ANOTHER row (next slug in order). It
// must not help; if it did, the growth signal itself would be suspect.
function controlGrowth(comps: SnapshotProtocol[]): Map<string, number> {
  const sorted = [...comps].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const m = new Map<string, number>();
  sorted.forEach((p, i) => {
    const other = sorted[(i + 1) % sorted.length];
    m.set(p.slug, Math.min(0.3, Math.max(-0.3, finite(other.change_7d, 0) / 100)));
  });
  return m;
}
function valueFeaturesFor(p: SnapshotProtocol, spec: string[], ctrl: Map<string, number>, asOf: string): number[] {
  const t = sizeCentre(p);
  const g = finite(p.change_7d, 0) / 100;
  const age = ageDays(asOf, p.listed_at);
  const out = [1, ln(p.tvl_usd)];
  if (spec.includes('quad')) out.push(t * t);
  if (spec.includes('cubic')) out.push(t * t * t);
  if (spec.includes('growthCap')) out.push(Math.min(0.3, Math.max(-0.3, g)));
  if (spec.includes('growthPos')) out.push(Math.max(0, g));
  if (spec.includes('chain')) out.push(ln(Math.max(1, p.chains.length)));
  if (spec.includes('age')) out.push(ln(1 + (age ?? 365) / 365));
  if (spec.includes('control')) out.push(ctrl.get(p.slug) ?? 0);
  return out;
}
function flatErrors(rows: SnapshotProtocol[], mode: 'loo' | 'wf'): number[] {
  if (mode === 'loo') {
    const out: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const ratios = rows.filter((_, j) => j !== i).map((p) => (p.mcap_usd as number) / p.tvl_usd).sort((a, b) => a - b);
      const m = ratios[Math.floor(ratios.length / 2)];
      out.push(ln(rows[i].mcap_usd as number) - ln(m * rows[i].tvl_usd));
    }
    return out;
  }
  const sorted = [...rows].sort((a, b) => (a.listed_at as string) < (b.listed_at as string) ? -1 : 1);
  const half = Math.floor(sorted.length / 2);
  const ratios = sorted.slice(0, half).map((p) => (p.mcap_usd as number) / p.tvl_usd).sort((a, b) => a - b);
  const m = ratios[Math.floor(ratios.length / 2)];
  return sorted.slice(half).map((p) => ln(p.mcap_usd as number) - ln(m * p.tvl_usd));
}
function categoryEffects(rows: SnapshotProtocol[], f: (p: SnapshotProtocol) => number[], beta: number[], shrinkK: number): Record<string, number> {
  const groups = new Map<string, number[]>();
  for (const p of rows) {
    const resid = ln(p.mcap_usd as number) - f(p).reduce((t, x, j) => t + x * beta[j], 0);
    const key = p.category ?? 'null';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(resid);
  }
  const eff: Record<string, number> = {};
  for (const [key, rs] of groups) {
    if (rs.length >= 3) eff[key] = median(rs) * (rs.length / (rs.length + shrinkK));
  }
  return eff;
}
function winsorizedLogCaps(rows: SnapshotProtocol[]): number[] {
  const ys = rows.map((p) => ln(p.mcap_usd as number));
  const lo = quantile(ys, WINSOR_LO);
  const hi = quantile(ys, WINSOR_HI);
  return ys.map((y) => Math.min(hi, Math.max(lo, y)));
}
interface ValueFit { beta: number[]; eff: Record<string, number>; f: (p: SnapshotProtocol) => number[]; }
function fitValue(rows: SnapshotProtocol[], spec: string[], ctrl: Map<string, number>, asOf: string, winsorize: boolean, catK: number): ValueFit {
  const f = (p: SnapshotProtocol): number[] => valueFeaturesFor(p, spec, ctrl, asOf);
  const ys = winsorize ? winsorizedLogCaps(rows) : rows.map((p) => ln(p.mcap_usd as number));
  const beta = ols(rows.map(f), ys).beta;
  const eff = catK > 0 ? categoryEffects(rows, f, beta, catK) : {};
  return { beta, eff, f };
}
function valuePrediction(p: SnapshotProtocol, fit: ValueFit): number {
  return fit.f(p).reduce((t, x, j) => t + x * fit.beta[j], 0) + (fit.eff[p.category ?? 'null'] ?? 0);
}
function variantErrors(rows: SnapshotProtocol[], spec: string[], ctrl: Map<string, number>, asOf: string, winsorize: boolean, catK: number, mode: 'loo' | 'wf'): number[] {
  if (mode === 'loo') {
    const out: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const train = rows.filter((_, j) => j !== i);
      const fit = fitValue(train, spec, ctrl, asOf, winsorize, catK);
      out.push(ln(rows[i].mcap_usd as number) - valuePrediction(rows[i], fit));
    }
    return out;
  }
  const sorted = [...rows].sort((a, b) => (a.listed_at as string) < (b.listed_at as string) ? -1 : 1);
  const half = Math.floor(sorted.length / 2);
  const fit = fitValue(sorted.slice(0, half), spec, ctrl, asOf, winsorize, catK);
  return sorted.slice(half).map((p) => ln(p.mcap_usd as number) - valuePrediction(p, fit));
}
export function backtestValue(snapshot: Snapshot): ValueBacktest {
  const comps = valueComps(snapshot);
  const ctrl = controlGrowth(comps);
  const asOf = snapshot.as_of;
  const ev = (term: string, spec: string[], winsorize: boolean, catK: number, kept: boolean, note: string): EvidenceRow => ({
    term,
    loo: typicalMiss(variantErrors(comps, spec, ctrl, asOf, winsorize, catK, 'loo')),
    wf: typicalMiss(variantErrors(comps, spec, ctrl, asOf, winsorize, catK, 'wf')),
    kept, note,
  });
  // The kept model: size + the bend, winsorized, no category.
  const keptSpec = ['quad'];
  const fit = fitValue(comps, keptSpec, ctrl, asOf, true, 0);
  const loo = variantErrors(comps, keptSpec, ctrl, asOf, true, 0, 'loo');
  const wf = variantErrors(comps, keptSpec, ctrl, asOf, true, 0, 'wf');
  const y = comps.map((p) => ln(p.mcap_usd as number));
  const mean = y.reduce((t, v) => t + v, 0) / y.length;
  const ssTot = y.reduce((t, v) => t + (v - mean) * (v - mean), 0);
  const ssRes = comps.reduce((t, p) => {
    const d = ln(p.mcap_usd as number) - valuePrediction(p, fit);
    return t + d * d;
  }, 0);
  const r2 = 1 - ssRes / ssTot;
  const evidence: EvidenceRow[] = [
    { term: 'flat median multiple', loo: typicalMiss(flatErrors(comps, 'loo')), wf: typicalMiss(flatErrors(comps, 'wf')), kept: false, note: 'baseline' },
    ev('size curve, ln TVL', [], true, 0, true, 'kept'),
    ev('+ bend, (ln TVL\u221218)\u00b2', ['quad'], true, 0, true, 'kept: lowers both tests'),
    ev('+ bend, (ln TVL\u221218)\u00b3', ['quad', 'cubic'], true, 0, false, 'tested, not kept: LOO worse'),
    ev('+ growth, capped \u00b130%', ['quad', 'growthCap'], true, 0, false, 'tested, not kept: lowers both only by paying crashes (coef \u22122.05)'),
    ev('+ growth, max(0,g)', ['quad', 'growthPos'], true, 0, false, 'tested, not kept: walk-forward x4.36'),
    ev('+ chain count, ln', ['quad', 'chain'], true, 0, false, 'tested, not kept'),
    ev('+ no-token age, ln', ['quad', 'age'], true, 0, false, 'tested, not kept'),
    ev('+ category, ridge 50', ['quad'], true, 50, false, 'tested, not kept: no gain on either test'),
    ev('+ control: other growth', ['quad', 'control'], true, 0, false, 'must not help'),
    ev('same model, unwinsorized', ['quad'], false, 0, false, 'tested, not kept: winsorize wins both tests'),
  ];
  return {
    beta: fit.beta, eff: fit.eff, r2, loo, wf, evidence,
    flatLoo: typicalMiss(flatErrors(comps, 'loo')),
    flatWf: typicalMiss(flatErrors(comps, 'wf')),
  };
}
export function ifLaunches(p: SnapshotProtocol, beta: number[], eff: Record<string, number>): number {
  const fit: ValueFit = { beta, eff, f: (q) => valueFeaturesFor(q, ['quad'], new Map(), '') };
  return Math.exp(valuePrediction(p, fit));
}

// --- Regression: OLS / WOLS / LAD (order of operations is load-bearing) ---
function ols(X: number[][], y: number[]): { beta: number[]; resid: number[] } {
  const n = X.length;
  const k = X[0].length;
  const A: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const b: number[] = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      b[a] += X[i][a] * y[i];
      for (let c = 0; c < k; c++) A[a][c] += X[i][a] * X[i][c];
    }
  }
  for (let a = 0; a < k; a++) A[a][a] += 1e-9;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    const tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j];
    }
  }
  const beta = M.map((r, i) => r[k] / r[i]);
  const resid = y.map((v, i) => v - X[i].reduce((t, x, j) => t + x * beta[j], 0));
  return { beta, resid };
}
function wols(X: number[][], y: number[], w: number[]): number[] {
  const n = X.length;
  const k = X[0].length;
  const A: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const b: number[] = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      b[a] += w[i] * X[i][a] * y[i];
      for (let c = 0; c < k; c++) A[a][c] += w[i] * X[i][a] * X[i][c];
    }
  }
  for (let a = 0; a < k; a++) A[a][a] += 1e-9;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    const tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r, i) => r[k] / r[i]);
}
function ladBeta(X: number[][], y: number[]): number[] {
  let beta = ols(X, y).beta;
  for (let step = 0; step < 25; step++) {
    const r = y.map((v, i) => v - X[i].reduce((t, x, j) => t + x * beta[j], 0));
    const s = median(r.map((e) => Math.abs(e))) || 1;
    beta = wols(X, y, r.map((e) => 1 / Math.max(Math.abs(e), 0.25 * s)));
  }
  return beta;
}
function ladLooErrors(rows: SnapshotProtocol[], f: (p: SnapshotProtocol) => number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const train = rows.filter((_, j) => j !== i);
    const beta = ladBeta(train.map(f), train.map((p) => ln(p.mcap_usd as number)));
    out.push(ln(rows[i].mcap_usd as number) - f(rows[i]).reduce((t, x, j) => t + x * beta[j], 0));
  }
  return out;
}
function ladWfErrors(rows: SnapshotProtocol[], f: (p: SnapshotProtocol) => number[]): number[] {
  const sorted = [...rows].sort((a, b) => (a.listed_at as string) < (b.listed_at as string) ? -1 : 1);
  const half = Math.floor(sorted.length / 2);
  const beta = ladBeta(sorted.slice(0, half).map(f), sorted.slice(0, half).map((p) => ln(p.mcap_usd as number)));
  return sorted.slice(half).map((p) => ln(p.mcap_usd as number) - f(p).reduce((t, x, j) => t + x * beta[j], 0));
}



// --- Token odds: logistic model on the standing peers ---
export function oddsPeers(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => isStanding(p));
}
function firstWord(name: string): string {
  const parts = name.toLowerCase().split(/[^a-z0-9]+/).filter((s) => s.length > 0);
  return parts.length > 0 ? parts[0] : '';
}
export function hasSibling(p: SnapshotProtocol, snapshot: Snapshot): boolean {
  const w = firstWord(p.name);
  if (w === '') return false;
  let count = 0;
  for (const q of snapshot.protocols) {
    if (firstWord(q.name) === w) {
      count++;
      if (count > 1) return true;
    }
  }
  return false;
}
function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}
function oddsFeatures(p: SnapshotProtocol, asOf: string, sibling: boolean): number[] {
  const age = ageDays(asOf, p.listed_at);
  return [
    1,
    (ln(p.tvl_usd) - ln(100_000_000)) / 2,
    age === null ? 2.5 : ln(1 + age / 30),
    age === null ? 1 : 0,
    growthFrac(p),
    sibling ? 1 : 0,
  ];
}
function fitLogit(X: number[][], y: number[], iters: number): number[] {
  const k = X[0].length;
  const beta: number[] = new Array(k).fill(0);
  const m = y.reduce((t, v) => t + v, 0) / y.length;
  beta[0] = ln(m / (1 - m));
  const lr = 0.5;
  const l2 = 1e-3;
  for (let it = 0; it < iters; it++) {
    const grad: number[] = new Array(k).fill(0);
    for (let i = 0; i < X.length; i++) {
      const pr = sigmoid(X[i].reduce((t, x, j) => t + x * beta[j], 0));
      for (let j = 0; j < k; j++) grad[j] += (pr - y[i]) * X[i][j];
    }
    for (let j = 0; j < k; j++) beta[j] -= lr * (grad[j] / X.length + (j === 0 ? 0 : l2 * beta[j]));
  }
  return beta;
}
function brier(pred: number[], y: number[]): number {
  return pred.reduce((t, pr, i) => t + (pr - y[i]) * (pr - y[i]), 0) / y.length;
}
export function backtestOdds(snapshot: Snapshot): OddsBacktest {
  const peers = oddsPeers(snapshot);
  const y = peers.map((p) => (isPreToken(p) ? 0 : 1));
  const baseRate = y.reduce((t, v) => t + v, 0) / y.length;
  const sibs = peers.map((p) => hasSibling(p, snapshot));
  const dated = peers
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.listed_at !== null)
    .sort((a, b) => (a.p.listed_at as string) < (b.p.listed_at as string) ? -1 : 1);
  const half = Math.floor(dated.length / 2);
  const sizeCol = (p: SnapshotProtocol): number => (ln(p.tvl_usd) - ln(100_000_000)) / 2;
  const ageCols = (p: SnapshotProtocol): number[] => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    return [age === null ? 2.5 : ln(1 + age / 30), age === null ? 1 : 0];
  };
  type ColsFn = (p: SnapshotProtocol, i: number) => number[];
  const sets: { term: string; cols: ColsFn; kept: boolean; note: string }[] = [
    { term: 'base rate', cols: () => [1], kept: false, note: 'baseline' },
    { term: '+ size', cols: (p) => [1, sizeCol(p)], kept: true, note: 'kept' },
    { term: '+ age, ln months', cols: (p) => [1, sizeCol(p), ...ageCols(p)], kept: true, note: 'kept' },
    { term: '+ growth', cols: (p) => [1, sizeCol(p), ...ageCols(p), growthFrac(p)], kept: true, note: 'kept' },
    { term: '+ sibling', cols: (p, i) => oddsFeatures(p, snapshot.as_of, sibs[i]), kept: true, note: 'kept: lowers both tests' },
    { term: '+ chain count', cols: (p, i) => [...oddsFeatures(p, snapshot.as_of, sibs[i]), ln(Math.max(1, p.chains.length))], kept: false, note: 'tested, not kept' },
  ];
  // evalSet returns the predictions as well as the Brier scores, so the
  // full model's leave-one-out and walk-forward predictions are fitted
  // once here and reused below instead of refitting the same 436 models.
  const evalSet = (cols: ColsFn): { loo: number; wf: number; looP: number[]; wfP: number[]; wfY: number[] } => {
    const looP: number[] = [];
    for (let i = 0; i < peers.length; i++) {
      // Train element j is original peer j when j < i, j + 1 when j >= i.
      const tx: number[][] = [];
      const ty: number[] = [];
      for (let j = 0; j < peers.length; j++) {
        if (j === i) continue;
        tx.push(cols(peers[j], j));
        ty.push(y[j]);
      }
      const beta = fitLogit(tx, ty, 600);
      looP.push(sigmoid(cols(peers[i], i).reduce((t, x, j) => t + x * beta[j], 0)));
    }
    const trainIdx = dated.slice(0, half).map((d) => d.i);
    const beta = fitLogit(trainIdx.map((i) => cols(peers[i], i)), trainIdx.map((i) => y[i]), 1200);
    const wfP = dated.slice(half).map((d) => sigmoid(cols(d.p, d.i).reduce((t, x, j) => t + x * beta[j], 0)));
    const wfY = dated.slice(half).map((d) => y[d.i]);
    return { loo: brier(looP, y), wf: brier(wfP, wfY), looP, wfP, wfY };
  };
  const evaluated = sets.map((s) => ({ set: s, ...evalSet(s.cols) }));
  const evidence: EvidenceRow[] = evaluated.map(({ set: s, loo, wf }) => ({ term: s.term, loo, wf, kept: s.kept, note: s.note }));
  // Category-rate variant, computed separately and appended.
  const fitCat = (train: SnapshotProtocol[]): Record<string, number> => {
    const ty = train.map((p) => (isPreToken(p) ? 0 : 1));
    const gm = ty.reduce((t, v) => t + v, 0) / ty.length;
    const lo = ln(gm / (1 - gm));
    const groups = new Map<string, number[]>();
    for (let i = 0; i < train.length; i++) {
      const key = train[i].category ?? 'null';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ty[i]);
    }
    const eff: Record<string, number> = {};
    for (const [key, vs] of groups) {
      const m = vs.reduce((t, v) => t + v, 0) / vs.length;
      const shr = (vs.length * m + 8 * gm) / (vs.length + 8);
      eff[key] = ln(shr / (1 - shr)) - lo;
    }
    return eff;
  };
  const catCols = (p: SnapshotProtocol, i: number, eff: Record<string, number>): number[] => [
    ...oddsFeatures(p, snapshot.as_of, sibs[i]),
    eff[p.category ?? 'null'] ?? 0,
  ];
  const catLooP: number[] = [];
  for (let i = 0; i < peers.length; i++) {
    const train = peers.filter((_, j) => j !== i);
    const eff = fitCat(train);
    const beta = fitLogit(train.map((p, j) => catCols(p, j < i ? j : j + 1, eff)), y.filter((_, j) => j !== i), 600);
    catLooP.push(sigmoid(catCols(peers[i], i, eff).reduce((t, x, j) => t + x * beta[j], 0)));
  }
  const catTrainIdx = dated.slice(0, half).map((d) => d.i);
  const catEff = fitCat(catTrainIdx.map((i) => peers[i]));
  const catBeta = fitLogit(catTrainIdx.map((i) => catCols(peers[i], i, catEff)), catTrainIdx.map((i) => y[i]), 1200);
  const catWfP = dated.slice(half).map((d) => sigmoid(catCols(d.p, d.i, catEff).reduce((t, x, j) => t + x * catBeta[j], 0)));
  const catWfY = dated.slice(half).map((d) => y[d.i]);
  evidence.push({
    term: '+ category rate',
    loo: brier(catLooP, y),
    wf: brier(catWfP, catWfY),
    kept: false,
    note: 'tested, not kept',
  });
  // Full model = set 5 (sibling). Its leave-one-out and walk-forward
  // predictions are the ones evalSet already fitted: reuse them.
  const full = sets[4];
  const beta = fitLogit(peers.map((p, i) => full.cols(p, i)), y, 1200);
  const fullLoo = evidence[4];
  const looP600 = evaluated[4].looP;
  const looAcc = looP600.filter((pr, i) => (pr >= 0.5 ? 1 : 0) === y[i]).length / y.length;
  const wfP = evaluated[4].wfP;
  const wfY = evaluated[4].wfY;
  const wfAcc = wfP.filter((pr, i) => (pr >= 0.5 ? 1 : 0) === wfY[i]).length / wfY.length;
  // In-sample accuracy, same 0.5 call, labelled as such wherever printed:
  // it is the fit describing its own training peers, not held-out proof.
  const insampleAcc = peers.filter((p, i) => (sigmoid(full.cols(p, i).reduce((t, x, j) => t + x * beta[j], 0)) >= 0.5 ? 1 : 0) === y[i]).length / y.length;
  // Precision on the confident subsets (held-out, never in-sample): the
  // low side calls a peer unlikely (odds <= 10%) and counts how many
  // recorded no token; the high side calls a peer likely (>= 70%).
  const precLow = (preds: number[], ys: number[]): { prec: number; n: number } => {
    const sub = preds.map((pr, i) => ({ pr, y: ys[i] })).filter((r) => r.pr <= 0.1);
    return { prec: sub.length > 0 ? sub.filter((r) => r.y === 0).length / sub.length : 0, n: sub.length };
  };
  const precHigh = (preds: number[], ys: number[]): { prec: number; n: number } => {
    const sub = preds.map((pr, i) => ({ pr, y: ys[i] })).filter((r) => r.pr >= 0.7);
    return { prec: sub.length > 0 ? sub.filter((r) => r.y === 1).length / sub.length : 0, n: sub.length };
  };
  const conf = (preds: number[], ys: number[]): { acc: number; n: number } => {
    const sub = preds.map((pr, i) => ({ pr, y: ys[i] })).filter((r) => r.pr >= 0.9 || r.pr <= 0.1);
    return { acc: sub.length > 0 ? sub.filter((r) => (r.pr >= 0.5 ? 1 : 0) === r.y).length / sub.length : 0, n: sub.length };
  };
  const plLoo = precLow(looP600, y);
  const plWf = precLow(wfP, wfY);
  const phWf = precHigh(wfP, wfY);
  const cfWf = conf(wfP, wfY);
  return {
    beta, baseRate, loo: fullLoo.loo, wf: fullLoo.wf, looAcc, wfAcc, insampleAcc,
    baseLoo: evidence[0].loo, baseWf: evidence[0].wf, evidence,
    precLowLoo: plLoo.prec, precLowNLoo: plLoo.n, precLowWf: plWf.prec, precLowNWf: plWf.n,
    precHighWf: phWf.prec, precHighNWf: phWf.n, confAccWf: cfWf.acc, confNWf: cfWf.n,
  };
}
export function tokenOdds(p: SnapshotProtocol, snapshot: Snapshot, beta: number[]): number {
  return sigmoid(oddsFeatures(p, snapshot.as_of, hasSibling(p, snapshot)).reduce((t, x, j) => t + x * beta[j], 0));
}

// --- Farm economics and the per-row farm plan ---
export function planWork(weeks: number): { tx: number; hours: number } {
  return { tx: 2 + weeks + 1, hours: (5 + 15 + weeks * 15 + 15 + 5) / 60 };
}
const DEFAULT_GAS = 1.0;
const SWAP_FEE_RATE = 0.003;
const ELIGIBLE_SHARE = 1.0;
function econAtDeposit(p: SnapshotProtocol, implied: number, scenario: FarmScenario, deposit: number): { drop: number; fees: number; net: number; tbill: number; perHour: number; hours: number; tx: number } {
  const gas = GAS_PER_TX[p.chains[0] ?? ''] ?? DEFAULT_GAS;
  const { tx, hours } = planWork(scenario.horizon_weeks);
  const drop = (implied * scenario.drop_share * deposit) / (ELIGIBLE_SHARE * p.tvl_usd);
  const fees = SWAP_FEE_RATE * deposit + gas * tx;
  const net = drop - fees;
  const tbill = deposit * TBILL_RATE * (scenario.horizon_weeks / 52);
  return { drop, fees, net, tbill, perHour: net / hours, hours, tx };
}
export function econFor(p: SnapshotProtocol, implied: number, scenario: FarmScenario): Econ {
  const e = econAtDeposit(p, implied, scenario, scenario.deposit_usd);
  const small = econAtDeposit(p, implied, scenario, SMALL_DEPOSIT_USD);
  let verdict: string;
  if (e.net > e.tbill && e.perHour >= 25 && small.net > small.tbill && small.perHour >= 25) verdict = 'ROBUST';
  else if (e.net > e.tbill && e.perHour >= 10) verdict = 'FARM';
  else if (e.net > 0) verdict = 'THIN';
  else if (e.net >= -25) verdict = 'MARGINAL';
  else verdict = 'SKIP';
  return {
    drop_value_usd: e.drop, fees_usd: e.fees, net_of_fees_usd: e.net,
    net_per_hour_usd: e.perHour, tbill_usd: e.tbill, hours: e.hours, tx: e.tx, verdict,
  };
}
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0] : 'its main chain';
}
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = s.slice(0, 596) + '...';
  if (s.length < 20) s += ' Hold the position and check the protocol\u2019s own page.';
  return s;
}
function riskFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Read ${name}'s borrow rates and liquidation rules on ${chain} first: a sharp price move can liquidate a leveraged position, so keep the loan-to-value below half the limit.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Read ${name}'s pool page on ${chain} first: the pool can lose value while the token price moves, so check the pair's range before you add liquidity.`;
  if (c.includes('bridge')) return `Read ${name}'s bridge limits on ${chain} first: a bridge can pause withdrawals, so never send more than you can leave locked for the full window.`;
  if (c.includes('staking') || c.includes('restak')) return `Read ${name}'s unbonding rules on ${chain} first: staked funds can take days to release, so do not stake money you need before the window ends.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Read ${name}'s funding and liquidation rules on ${chain} first: a small hedge can still be liquidated in a fast move, so keep the position small.`;
  if (c.includes('prediction')) return `Read ${name}'s market rules on ${chain} first: a prediction market can resolve against you, so treat the stake as the cost of the signal, not as savings.`;
  if (c.includes('curator') || c.includes('allocator')) return `Read the vault's strategy page on ${chain} first: a vault stacks other protocols beneath it, so any one of them failing can take the position with it.`;
  if (c.includes('stable')) return `Read how ${name}'s stable asset holds its peg on ${chain} first: a depeg cuts the deposit itself, so check the reserves page before you mint.`;
  if (c.includes('rwa')) return `Read what backs ${name}'s yield asset on ${chain} first: the yield depends on off-chain assets, so check the issuer's reports before you mint.`;
  return `Read ${name}'s own docs on ${chain} first: a smart-contract bug or a paused withdrawal can trap the deposit, so check the audit and pause history before you commit.`;
}
function moneyShort(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
// Ten steps, specific to this protocol: its chain, its category action,
// its gas, its TVL exit floor and its own numbers. No step is shared
// word-for-word with another row except the wallet and ledger hygiene.
export function farmSteps(p: SnapshotProtocol, scenario: FarmScenario, econ: Econ): FarmStep[] {
  const capital = capitalFor(p);
  const chain = chainOf(p);
  const gas = GAS_PER_TX[chain] ?? DEFAULT_GAS;
  const action = actionFor(p, capital, chain);
  const weeks = scenario.horizon_weeks;
  const weeklyGas = gas * weeks;
  const floor = Math.round(p.tvl_usd * 0.83);
  const second = p.chains.length > 1 ? p.chains[1] : null;
  const deepen = second !== null
    ? `Hold the receipt ${p.name} gives you and use it once on ${second}; activity on a second chain counts as a separate signal, and the same wallet ties it together.`
    : `Leave the receipt ${p.name} gives you in the same wallet for the full ${weeks} weeks; moving it to another wallet splits the activity across two addresses.`;
  const net = econ.net_of_fees_usd;
  const netTxt = net >= 0 ? `$${net.toFixed(0)}` : `-$${Math.abs(net).toFixed(0)}`;
  return [
    { text: `Use a fresh wallet that holds only the funds you plan to farm, fund it with $${scenario.deposit_usd.toLocaleString()} of USDC on ${chain}, and keep its seed phrase offline.`, cost: `about $${gas.toFixed(2)} gas`, time: '5 min' },
    { text: `Open ${p.name}'s own site from its DefiLlama page and match the contract address on ${chain} before you approve anything; never sign a link sent in a message.`, cost: '$0', time: '10 min' },
    { text: action, cost: `$${capital} + $${gas.toFixed(2)} gas`, time: '15 min' },
    { text: riskFor(p, chain), cost: '$0', time: '10 min' },
    { text: `Make one qualifying action each week for ${weeks} weeks, such as a deposit, a borrow, a swap or a vote, so the activity spans the whole window.`, cost: `about $${weeklyGas.toFixed(2)} gas`, time: '15 min/wk' },
    { text: deepen, cost: `about $${gas.toFixed(2)} gas`, time: '10 min' },
    { text: `Withdraw if ${p.name}'s TVL prints below ${moneyShort(floor)} (\u221217% from today's ${moneyShort(p.tvl_usd)}) or if withdrawals pause; below that floor the modelled drop no longer covers the fees at this deposit.`, cost: '$0', time: '5 min/wk' },
    { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Never pay to claim.`, cost: `about $${gas.toFixed(2)} gas`, time: '15 min' },
    { text: `Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it.`, cost: '$0', time: '5 min' },
    { text: `At the end of ${weeks} weeks, close the position and compare: the same $${scenario.deposit_usd.toLocaleString()} in a 4% T-bill pays $${econ.tbill_usd.toFixed(0)}, while this farm nets ${netTxt} after fees, about $${econ.net_per_hour_usd.toFixed(0)} an hour for ${econ.hours.toFixed(1)} hours of work.`, cost: `about $${gas.toFixed(2)} gas`, time: '15 min' },
  ];
}

// --- Board, accounting, buildRadar, parse, validation ---
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  const m = new Map<string, SnapshotProtocol>();
  for (const p of protocols) m.set(p.slug, p);
  return m;
}
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}
export function buildBoard(snapshot: Snapshot, valueBeta: number[], valueEff: Record<string, number>, oddsBeta: number[], rangeQ: { q10: number; q25: number; q75: number; q90: number }, scenario: FarmScenario = SCENARIO): BoardRow[] {
  const by = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = by.get(slug);
    if (p) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);
  const scored = [...chosen.values()].map((p) => {
    const ifl = ifLaunches(p, valueBeta, valueEff);
    const odds = tokenOdds(p, snapshot, oddsBeta);
    const implied = Math.max(1, Math.round(ifl * odds));
    const econ = econFor(p, implied, scenario);
    const age = ageDays(snapshot.as_of, p.listed_at);
    return { p, ifl, odds, implied, econ, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : 1));
  return scored.map((s, i) => {
    const p = s.p;
    const r = (x: number): number => Math.round(x * 100) / 100;
    return {
      rank: i + 1, slug: p.slug, name: p.name, category: p.category, chains: p.chains,
      tvl_usd: p.tvl_usd, change_7d: p.change_7d, mcap_usd: p.mcap_usd,
      listed_at: p.listed_at, gecko_id: p.gecko_id, symbol: p.symbol,
      token_status: 'pre-token' as const, age_days: s.age,
      implied_value_usd: s.implied,
      if_launches_usd: Math.max(1, Math.round(s.ifl)),
      token_odds: Math.round(s.odds * 10000) / 10000,
      range_p25_usd: Math.max(1, Math.round(s.implied * Math.exp(rangeQ.q25))),
      range_p75_usd: Math.max(1, Math.round(s.implied * Math.exp(rangeQ.q75))),
      range_p10_usd: Math.max(1, Math.round(s.implied * Math.exp(rangeQ.q10))),
      range_p90_usd: Math.max(1, Math.round(s.implied * Math.exp(rangeQ.q90))),
      verdict: s.econ.verdict,
      drop_value_usd: r(s.econ.drop_value_usd),
      fees_usd: r(s.econ.fees_usd),
      net_of_fees_usd: r(s.econ.net_of_fees_usd),
      net_per_hour_usd: r(s.econ.net_per_hour_usd),
      model: {
        growth_pct: Math.round(finite(p.change_7d, 0) * 100) / 100,
        age_days: s.age,
        sibling: hasSibling(p, snapshot),
        category_effect: Math.round((valueEff[p.category ?? 'null'] ?? 0) * 10000) / 10000,
      },
      farm_steps: farmSteps(p, scenario, s.econ).map(stepText),
    };
  });
}
export function boardChecksum(board: BoardRow[]): string {
  let h = 0x811c9dc5;
  const text = board.map((r) => `${r.rank}:${r.slug}:${r.implied_value_usd};`).join('');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
export function accounting(snapshot: Snapshot, board: BoardRow[]): AccountGroup[] {
  const groups: AccountGroup[] = [
    { label: 'Ranked \u00b7 watchlist', count: 0, note: 'records no token, at or above the $50M floor' },
    { label: 'Ranked \u00b7 early, below the floor', count: 0, note: 'records no token, largest by TVL' },
    { label: 'Token trades \u00b7 priced comp', count: 0, note: 'a market cap the curve can learn from' },
    { label: 'Token recorded \u00b7 no usable cap', count: 0, note: 'a token on record, no market cap to price' },
    { label: 'Out \u00b7 bridge', count: 0, note: 'another token carried across' },
    { label: 'Out \u00b7 liquid staking', count: 0, note: 'the staked form of a token that trades' },
    { label: 'Out \u00b7 exchange', count: 0, note: 'exchange custody, nothing to farm' },
    { label: 'Out \u00b7 versioned or wrapped', count: 0, note: 'a release or a wrapped form of one protocol' },
    { label: 'Out \u00b7 below the floor, not ranked', count: 0, note: 'records no token, smaller than the 158 early rows' },
  ];
  const boardSlugs = new Set(board.map((r) => r.slug));
  const watch = new Set(snapshot.watchlist);
  for (const p of snapshot.protocols) {
    if (boardSlugs.has(p.slug)) { groups[watch.has(p.slug) ? 0 : 1].count++; continue; }
    if (!isPreToken(p)) { groups[(p.mcap_usd ?? 0) > 0 ? 2 : 3].count++; continue; }
    if (p.category === 'Bridge' || p.category === 'Canonical Bridge' || p.category === 'Cross Chain Bridge') { groups[4].count++; continue; }
    if (p.category === 'Liquid Staking' || p.category === 'Liquid Restaking' || p.category === 'Restaked BTC') { groups[5].count++; continue; }
    if (p.category === 'CEX') { groups[6].count++; continue; }
    if (VERSIONED.test(p.name) || WRAPPED_WORD.test(p.name)) { groups[7].count++; continue; }
    groups[8].count++;
  }
  return groups;
}
export function radarRow(row: BoardRow, watchlist: boolean): RadarRow {
  return {
    rank: row.rank, slug: row.slug, name: row.name, category: row.category, chains: row.chains,
    tvl_usd: row.tvl_usd, change_7d: row.change_7d, listed_at: row.listed_at, age_days: row.age_days,
    implied_value_usd: row.implied_value_usd, if_launches_usd: row.if_launches_usd,
    token_odds: row.token_odds, range_p25_usd: row.range_p25_usd, range_p75_usd: row.range_p75_usd,
    range_p10_usd: row.range_p10_usd, range_p90_usd: row.range_p90_usd, verdict: row.verdict,
    drop_value_usd: row.drop_value_usd, fees_usd: row.fees_usd,
    net_of_fees_usd: row.net_of_fees_usd, net_per_hour_usd: row.net_per_hour_usd,
    watchlist, sibling: row.model.sibling, category_effect: row.model.category_effect,
    farm_steps: row.farm_steps,
  };
}
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const value = backtestValue(snapshot);
  const odds = backtestOdds(snapshot);
  const q10 = quantile(value.loo, 0.1);
  const q25 = quantile(value.loo, 0.25) * RANGE_WIDEN;
  const q75 = quantile(value.loo, 0.75) * RANGE_WIDEN;
  const q90 = quantile(value.loo, 0.9);
  const board = buildBoard(snapshot, value.beta, value.eff, odds.beta, { q10, q25, q75, q90 }, SCENARIO);
  const catVals = Object.values(value.eff).map((v) => Math.exp(v));
  const catMin = catVals.length > 0 ? Math.min(...catVals) : 1;
  const catMax = catVals.length > 0 ? Math.max(...catVals) : 1;
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const verdicts: Record<string, number> = {};
  for (const r of board) verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1;
  const r4 = (x: number): number => Math.round(x * 10000) / 10000;
  const r2 = (x: number): number => Math.round(x * 100) / 100;
  const r3 = (x: number): number => Math.round(x * 1000) / 1000;
  const r1 = (x: number): number => Math.round(x * 1000) / 10;
  const within = (errs: number[]): number => r1(errs.filter((e) => Math.abs(e) <= ln(3)).length / errs.length);
  const inside = (errs: number[], lo: number, hi: number): number => r1(errs.filter((e) => e >= lo && e <= hi).length / errs.length);
  const radar: RadarData = {
    as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length, board_size: board.length,
    early_size: early, live_size: live.length,
    total_implied_usd: board.reduce((t, r) => t + r.implied_value_usd, 0),
    checksum: boardChecksum(board), scenario: SCENARIO,
    value_beta: value.beta.map(r4), value_r2: r4(value.r2),
    value_comps: valueComps(snapshot).length,
    value_cat_min: r2(catMin), value_cat_max: r2(catMax),
    odds_beta: odds.beta.map(r4),
    odds_peers: oddsPeers(snapshot).length,
    odds_base_rate: r4(odds.baseRate),
    value_evidence: value.evidence.map((e) => ({ term: e.term, loo: r2(e.loo), wf: r2(e.wf), kept: e.kept, note: e.note })),
    odds_evidence: odds.evidence.map((e) => ({ term: e.term, loo: r3(e.loo), wf: r3(e.wf), kept: e.kept, note: e.note })),
    range: {
      q10: r2(q10), q25: r2(q25), q75: r2(q75), q90: r2(q90), widen: RANGE_WIDEN,
      within3_loo: within(value.loo), within3_wf: within(value.wf),
      p2575_loo: inside(value.loo, q25, q75), p2575_wf: inside(value.wf, q25, q75),
      p1090_loo: inside(value.loo, q10, q90), p1090_wf: inside(value.wf, q10, q90),
    },
    kpi: {
      miss_wf: r2(typicalMiss(value.wf)), miss_flat_wf: r2(value.flatWf),
      miss_loo: r2(typicalMiss(value.loo)),
      brier_wf: r3(odds.wf), brier_base_wf: r3(odds.baseWf), brier_loo: r3(odds.loo),
      odds_acc_wf: r3(odds.wfAcc), odds_acc_loo: r3(odds.looAcc),
      odds_acc_insample: r3(odds.insampleAcc),
      odds_prec_low_wf: r3(odds.precLowWf), odds_prec_low_n_wf: odds.precLowNWf,
      odds_prec_low_loo: r3(odds.precLowLoo), odds_prec_low_n_loo: odds.precLowNLoo,
      odds_prec_high_wf: r3(odds.precHighWf), odds_prec_high_n_wf: odds.precHighNWf,
      value_kept: value.evidence.filter((e) => e.kept).length,
      value_tested: value.evidence.filter((e) => e.note !== 'baseline').length,
      odds_kept: odds.evidence.filter((e) => e.kept).length,
      odds_tested: odds.evidence.filter((e) => e.note !== 'baseline').length,
      worth_farming: (verdicts.ROBUST ?? 0) + (verdicts.FARM ?? 0), skip_count: verdicts.SKIP ?? 0, verdicts,
    },
    accounting: accounting(snapshot, board),
    rows: board.map((r) => radarRow(r, watch.has(r.slug))),
    live, gas: GAS_PER_TX,
  };
  return { board, radar };
}
export function parseSnapshot(text: string): Snapshot {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new SnapshotError('snapshot.json is not a JSON object');
  const d = data as Record<string, unknown>;
  if (typeof d.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof d.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof d.floor_usd !== 'number' || !Number.isSafeInteger(d.floor_usd) || d.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(d.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(d.watchlist) || !d.watchlist.every((s) => typeof s === 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols: SnapshotProtocol[] = (d.protocols as unknown[]).map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    const p = raw as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
    const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return {
      slug: p.slug, name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd, change_7d: numOrNull(p.change_7d), mcap_usd: numOrNull(p.mcap_usd),
      listed_at: strOrNull(p.listed_at), gecko_id: strOrNull(p.gecko_id), symbol: strOrNull(p.symbol),
    };
  });
  return {
    as_of: d.as_of as string, source: d.source as string, floor_usd: d.floor_usd as number,
    protocols, watchlist: d.watchlist as string[],
  };
}
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const boardSlugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !boardSlugs.has(s));
  if (missing.length > 0) {
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i].implied_value_usd > board[i - 1].implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board[0].implied_value_usd === board[board.length - 1].implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0].implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
