// Token launch radar v2c: comps-fitted valuation + farm economics, from the sealed snapshot only.
//
// The merge of v2a (tuned shrinkage, breadth regressor) and v2b (ROBUST farm tier, early
// finds, pays-from break-even), decided on backtest numbers, not dogma:
//
//   1. Shrinkage is tuned, not assumed. The leave-one-out backtest runs for K in
//      {3, 5, 8, 12, 20, 25, 40} pseudo-peers and keeps the K with the lowest
//      leave-one-out median miss (lowest K wins a tie). The dashboard prints the whole
//      K-curve so the choice can be checked. Shrinking toward the global median residual
//      was tried in v2a and lost to shrinking toward 0 at every K.
//   2. The chains/breadth term is TESTED, not kept on faith. Both variants are fitted
//      and backtested at run time — with log10(min(chains, 10)) as a second regressor
//      and without it — and the breadth term ships ONLY if it wins BOTH backtests
//      (leave-one-out and time-split median miss). On this snapshot it loses both,
//      so v2c ships the no-breadth curve and says so on the page, with both variants'
//      numbers printed. A fancier formula that backtests worse is not shipped.
//   3. Buckets follow the field's own convention. "Traded" means the protocol records
//      a token at all (a gecko_id, a symbol, or a market cap): 416 protocols. "Set
//      aside" is only the pre-token protocols the board does not rank: 144. The fit set
//      is named on its own — 128 families fitted — so the three numbers no longer
//      fight: 416 traded + 198 ranked + 144 set aside = 758 protocols, exactly.
//
// The model, fitted on the snapshot's traded token families (one log-log curve):
//
//   log10(mcap) = a + b * log10(TVL)          [+ c * log10(min(chains, 10)) when kept]
//
// then every pre-token protocol is scored as
//
//   implied = 10^a * TVL^b [* breadth] * category * growth * seasoning * sibling
//
//   category  = 10^(median log-residual of the protocol's category), shrunk toward 1 with
//               K pseudo-peers at 0 (factor = 10^(median * n / (n + K))), K tuned by
//               leave-one-out; 1 when the category has no traded family, or null.
//   breadth   = min(chains, 10)^c when the term ships, else 1.00 (chains capped at 10:
//               the raw count runs to 176, and one 176-chain family would otherwise
//               lever the slope).
//   growth    = 1 + 0.5 * clamp(change_7d, -60, +120) / 100, capped at 1.40 (+40% upside cap).
//   seasoning = 0.70 at 0 days with no token, rising linearly to 1.00 at 730 days; a protocol
//               with no listed_at is scored at 365 days.
//   sibling   = 0.50 when another protocol of the same token family (same gecko_id) already
//               trades; 1 otherwise. In this snapshot no ranked row is sibling-linked (every
//               ranked row records no gecko_id at all), so the factor is defined but never fires.
//
// The P10-P90 band comes from leave-one-out residual quantiles at the tuned K: the band is
// wide on purpose (see the backtest), because the fit is noisy and the page says so instead
// of hiding it.
//
// Early finds are the board's off-watchlist rows that are new (listed <= 180 days ago) or
// rising (TVL up over 7 days): 58 of the 158 early rows here. They are a discovery surface,
// not a second ranking — the board's rank still comes from the implied value alone.
//
// Farm economics are netted to the dollar on a $1,000 plan, twice: once at the implied value
// and once at the band's low end. The $1k slice is a 10% share of the implied launch value
// scaled to the plan (0.10 * implied * 1000 / TVL), minus gas (a stated per-chain table, ~10
// transactions over the plan), minus 0.3% swap/bridge fees on the $1,000, minus the 4%
// T-bill yield forgone on the $1,000 over the hold. The low-end slice uses the P25
// multiplier of the leave-one-out band (x0.36 here): the P10 low end (x0.07) is so far down
// that no plan on the board pays at it, so the robustness test is keyed to the inner band's
// low end and the page says so, while the P10 net is still computed and shown per row.
// Verdict: ROBUST when the plan still pays at the low end, FARM when it pays after every
// cost at value and at least $5 per hands-on hour, THIN when it pays but thinner, SKIP when
// the net is zero or negative. Break-even is the implied launch value at which the $1k
// plan nets exactly $0: costs * TVL / 100. No protocol name is ever special-cased: the same
// functions score every row, and every fitted constant below comes from code run on snapshot.json.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-comps-2c';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 158;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The plan size every farm plan is costed at, in whole US dollars. */
export const PLAN_USD = 1000;
/** The share of the implied launch value a $1,000 plan is assumed to capture. */
export const SLICE_SHARE = 0.1;
/** The T-bill yield forgone on the plan's capital, in per cent per year. */
export const TBILL_PCT = 4;
/** Swap/bridge fees as a share of the plan's capital. */
export const SWAP_FEE_RATE = 0.003;
/** Transactions assumed over one farm plan (deposits, weekly actions, claim, exit). */
export const PLAN_TXS = 10;
/** The growth multiplier's upside cap: +40%. */
export const GROWTH_MULT_CAP = 1.4;
/** Seasoning: 0.70 at day 0 rising linearly to 1.00 at this many days. */
export const SEASONING_MIN = 0.7;
export const SEASONING_MAX = 1.0;
export const SEASONING_DAYS = 730;
/** Age assumed when listed_at is null. */
export const UNKNOWN_AGE_DAYS = 365;
/** Pseudo-peer counts the leave-one-out backtest tries for the category factor. */
export const SHRINK_K_GRID = [3, 5, 8, 12, 20, 25, 40];
/** The sibling discount: a family whose token already trades is worth half as a launch. */
export const SIBLING_FACTOR = 0.5;
/** Chains counted toward breadth, capped: the raw count runs to 176, the cap keeps one
 *  family from levering the breadth slope. */
export const BREADTH_CAP_CHAINS = 10;
/** Bootstrap resamples for the confidence interval on b (seeded, so runs are byte-identical). */
export const BOOTSTRAP_RESAMPLES = 200;

/**
 * Gas per transaction, in whole US dollars, by the protocol's first chain. An assumption, stated
 * on the page: Ethereum L1 ~$2, the big L2s ~$0.20, Solana ~$0.01, BNB Chain ~$0.10, anything
 * else ~$0.50. A plan is costed at PLAN_TXS transactions.
 */
export const GAS_PER_TX_USD: Record<string, number> = {
  Ethereum: 2.0,
  Solana: 0.01,
  Binance: 0.1,
};
export const L2_CHAINS = new Set([
  'Arbitrum', 'Optimism', 'Base', 'Polygon', 'zkSync Era', 'Blast', 'Linea', 'Scroll',
  'Mantle', 'Mode', 'Starknet', 'Manta', 'Fraxtal', 'Berachain', 'Unichain', 'Abstract',
  'Soneium', 'World Chain', 'Zora', 'Boba', 'Metis', 'Gnosis',
]);

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_usd: number;
    breadth_factor: number;
    breadth_chains: number;
    category_factor: number;
    growth_pct: number;
    growth_multiplier: number;
    seasoning_multiplier: number;
    sibling_factor: number;
    age_days: number | null;
    p10_usd: number;
    p90_usd: number;
  };
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One backtest's headline metrics (the flat baseline is scored the same way, on the same split). */
export interface BacktestMetrics {
  median_miss: number;
  within3: number;
  within10: number;
  flat_median_miss: number;
  flat_within3: number;
  flat_within10: number;
  n_test: number;
}

/** One variant's backtest headline: its tuned K, its fit and its two median misses. */
export interface VariantBacktest {
  k: number;
  loo_miss: number;
  ts_miss: number;
  r2: number;
}

/** Everything the fit learned from the snapshot, with the receipts. */
export interface FitResult {
  a: number;
  b: number;
  /** The fitted breadth exponent; 0 when the breadth term was tested and dropped. */
  c: number;
  /** Whether the breadth term ships in the curve. */
  breadth_enabled: boolean;
  r2: number;
  n_families: number;
  n_traded: number;
  n_token_record: number;
  n_token_no_mcap: number;
  n_dead_excluded: number;
  shrink_k: number;
  shrink_k_curve: [number, number][];
  /** Both variants' backtests at their own tuned K: the numbers the ship decision rests on. */
  variant_test: { breadth: VariantBacktest; nobreadth: VariantBacktest };
  flat_median_ratio: number;
  category_factors: Record<string, number>;
  category_counts: Record<string, number>;
  /** LOO residual quantiles (log10) at P05/P10/P25/P50/P75/P90/P95, at the tuned K. */
  loo_residual_quantiles: Record<string, number>;
  /** Multipliers from the LOO residuals: [P25, P75] and [P10, P90]. */
  band50: [number, number];
  band80: [number, number];
  loo: BacktestMetrics;
  timesplit: BacktestMetrics;
  bootstrap_b_ci: [number, number];
  sibling_linked_rows: number;
}

/** The dashboard's compact row, with the farm plan costed to the dollar twice. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  p10: number;
  p90: number;
  breadth: number;
  slice_1k: number;
  slice_low_1k: number;
  net_usd: number;
  net_low_usd: number;
  net_p10_usd: number;
  net_per_hour: number;
  net_low_per_hour: number;
  break_even_usd: number;
  verdict: 'ROBUST' | 'FARM' | 'THIN' | 'SKIP';
  fees_usd: number;
  gas_usd: number;
  hold_weeks: number;
  hours: number;
  steps: string[];
  badges: string[];
  early_find: boolean;
  early_reason: string | null;
}

/** Everything the dashboard needs, as window.RADAR. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: {
    version: string;
    formula: string;
    a: number;
    b: number;
    c: number;
    breadth_cap: number;
    breadth_enabled: boolean;
    shrink_k: number;
    shrink_k_curve: [number, number][];
    variant_test: { breadth: VariantBacktest; nobreadth: VariantBacktest };
    r2: number;
    n_families: number;
    category_factors: Record<string, number>;
    sibling_factor: number;
    growth_cap: number;
    seasoning_min: number;
    seasoning_max: number;
    seasoning_days: number;
    slice_share: number;
    plan_usd: number;
    tbill_pct: number;
  };
  backtest: {
    loo: { median_miss: number; within3: number; within10: number; flat_median_miss: number; flat_within3: number };
    timesplit: { median_miss: number; within3: number; within10: number; flat_median_miss: number; flat_within3: number };
    band50: [number, number];
    band80: [number, number];
    bootstrap_b_ci: [number, number];
  };
  counts: {
    protocols: number;
    watchlist: number;
    ranked: number;
    traded: number;
    traded_mcap: number;
    fit_families: number;
    pre_token: number;
    set_aside: number;
    robust: number;
    farm: number;
    thin: number;
    skip: number;
    early_finds: number;
  };
  farm_next: { slug: string; name: string; net: number; per_hour: number }[];
  set_aside_rules: [string, string, number][];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The growth multiplier: 1 + 0.5 * clamped 7-day change, upside capped at +40%. */
export function growthMultiplier(change7d: number | null): { pct: number; mult: number } {
  const pct = Math.min(120, Math.max(-60, finite(change7d, 0)));
  const mult = Math.min(GROWTH_MULT_CAP, 1 + (0.5 * pct) / 100);
  return { pct, mult };
}

/** The seasoning multiplier: 0.70 at 0 days rising linearly to 1.00 at 730 days. */
export function seasoningMultiplier(age: number | null): number {
  const a = age ?? UNKNOWN_AGE_DAYS;
  return SEASONING_MIN + ((SEASONING_MAX - SEASONING_MIN) * Math.min(Math.max(a, 0), SEASONING_DAYS)) / SEASONING_DAYS;
}

/** The chain count that enters the breadth term: the protocol's chains, capped at ten. */
export function breadthChains(p: SnapshotProtocol): number {
  return Math.min(Math.max(p.chains.length, 1), BREADTH_CAP_CHAINS);
}

/** The breadth multiplier of a protocol under a fitted exponent c: min(chains, 10)^c. */
export function breadthMultiplier(p: SnapshotProtocol, c: number): number {
  return breadthChains(p) ** c;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Whether a protocol records a token at all — a gecko_id, a symbol, or a market cap.
 *  This is the bucket the board calls "traded": 416 protocols here, of which 272 record
 *  a token id or symbol but no market cap, and 144 record a market cap. */
export function hasTokenRecord(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
}

/** A protocol whose market cap is recorded (dead or alive): 144 here. */
export function isTraded(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null;
}

/** Whether a protocol can enter the log fit: a positive market cap and a positive TVL. */
function isFittable(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

/** One token family: the traded protocols sharing a gecko_id (one row each in this snapshot). */
interface Family {
  key: string;
  row: SnapshotProtocol;
}

function familiesOf(protocols: SnapshotProtocol[]): Family[] {
  const byKey = new Map<string, SnapshotProtocol[]>();
  for (const p of protocols) {
    if (!isFittable(p)) continue;
    const key = p.gecko_id ?? `slug:${p.slug}`;
    const rows = byKey.get(key);
    if (rows === undefined) byKey.set(key, [p]);
    else rows.push(p);
  }
  // A family is represented by its largest-TVL row: the family's own size, once.
  return [...byKey.entries()].map(([key, rows]) => ({
    key,
    row: rows.sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))[0]!,
  }));
}

/** The design row of one protocol: [1, log10 TVL], plus [log10 capped chains] when breadth is on. */
function designRow(p: SnapshotProtocol, useBreadth: boolean): number[] {
  const row = [1, Math.log10(p.tvl_usd)];
  if (useBreadth) row.push(Math.log10(breadthChains(p)));
  return row;
}

/** Solve a small dense linear system by Gauss-Jordan with partial pivoting; null when singular. */
function solveLinear(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      for (let k = col; k <= n; k++) m[r]![k]! -= f * m[col]![k]!;
    }
  }
  // After Gauss-Jordan the matrix is diagonal: x_i = augmented_i / diagonal_i.
  return m.map((row, i) => row[n]! / row[i]!);
}

/**
 * OLS on log10(mcap) = a + b * log10(TVL) [+ c * log10(min(chains, 10)) when breadth is on],
 * by the normal equations. Null when the design is singular (no TVL spread to fit).
 */
function olsN(families: Family[], useBreadth: boolean): { a: number; b: number; c: number; r2: number } | null {
  const n = families.length;
  const xs = families.map((f) => designRow(f.row, useBreadth));
  const ys = families.map((f) => Math.log10(f.row.mcap_usd!));
  const k = useBreadth ? 3 : 2;
  const normal: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const rhs: number[] = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < k; r++) {
      rhs[r]! += xs[i]![r]! * ys[i]!;
      for (let c2 = 0; c2 < k; c2++) normal[r]![c2]! += xs[i]![r]! * xs[i]![c2]!;
    }
  }
  const beta = solveLinear(normal, rhs);
  if (beta === null) return null;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let ssr = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const yh = xs[i]!.reduce((s, v, j) => s + v * beta[j]!, 0);
    ssr += (ys[i]! - yh) ** 2;
    sst += (ys[i]! - my) ** 2;
  }
  return { a: beta[0]!, b: beta[1]!, c: useBreadth ? beta[2]! : 0, r2: sst === 0 ? 0 : 1 - ssr / sst };
}

/** Median of numbers (average of the two middles when even). */
function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? v[(n - 1) / 2]! : (v[n / 2 - 1]! + v[n / 2]!) / 2;
}

/** A sorted array's quantile by nearest-rank index (deterministic, stated). */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]!;
}

/**
 * Category factors from a fit: the median log-residual per category, shrunk toward 0 with
 * K pseudo-peers at 0, exponentiated back to a multiplier. K is a parameter here: the
 * leave-one-out backtest tries every K in SHRINK_K_GRID and keeps the best.
 */
function categoryFactors(
  families: Family[],
  fit: { a: number; b: number; c: number },
  k: number,
  useBreadth: boolean,
): { factors: Record<string, number>; counts: Record<string, number> } {
  const residuals = new Map<string, number[]>();
  for (const f of families) {
    const cat = f.row.category ?? '__null__';
    const d = designRow(f.row, useBreadth);
    const r = Math.log10(f.row.mcap_usd!) - (fit.a + fit.b * d[1]! + (useBreadth ? fit.c * d[2]! : 0));
    const list = residuals.get(cat);
    if (list === undefined) residuals.set(cat, [r]);
    else list.push(r);
  }
  const factors: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const [cat, list] of residuals) {
    const n = list.length;
    counts[cat] = n;
    factors[cat] = 10 ** (median(list) * (n / (n + k)));
  }
  return { factors, counts };
}

/** The full-model prediction for one protocol (curve [x breadth] x category x growth x seasoning x sibling). */
function predictValue(
  p: SnapshotProtocol,
  asOf: string,
  fit: { a: number; b: number; c: number },
  factors: Record<string, number>,
  siblingSet: Set<string>,
  useBreadth: boolean,
): { value: number; base: number; breadth: number; growthMult: number; growthPct: number; seasoningMult: number; sibling: number; cat: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const { pct, mult: growthMult } = growthMultiplier(p.change_7d);
  const seasoningMult = seasoningMultiplier(age);
  const cat = p.category === null ? 1 : (factors[p.category] ?? 1);
  const sibling = p.gecko_id !== null && siblingSet.has(p.gecko_id) ? SIBLING_FACTOR : 1;
  const breadth = useBreadth ? breadthMultiplier(p, fit.c) : 1;
  const base = 10 ** fit.a * p.tvl_usd ** fit.b;
  const value = base * breadth * cat * growthMult * seasoningMult * sibling;
  return { value, base, breadth, growthMult, growthPct: pct, seasoningMult, sibling, cat, age };
}

/** One backtest's metrics from parallel prediction/actual/flat arrays. */
function scoreBacktest(pred: number[], actual: number[], flat: number[]): Omit<BacktestMetrics, 'n_test'> {
  const miss = pred.map((v, i) => Math.max(v / actual[i]!, actual[i]! / v)).sort((x, y) => x - y);
  const flatMiss = flat.map((v, i) => Math.max(v / actual[i]!, actual[i]! / v)).sort((x, y) => x - y);
  const n = miss.length;
  const within = (arr: number[], k: number): number => (n === 0 ? 0 : arr.filter((m) => m <= k).length / n);
  return {
    median_miss: round2(median(miss)),
    within3: round4(within(miss, 3)),
    within10: round4(within(miss, 10)),
    flat_median_miss: round2(median(flatMiss)),
    flat_within3: round4(within(flatMiss, 3)),
    flat_within10: round4(within(flatMiss, 10)),
  };
}

/** A deterministic seeded PRNG (mulberry32) so the bootstrap is byte-identical every run. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One leave-one-out pass at a fixed K: refit OLS + category factors per held-out family. */
function looPass(
  families: Family[],
  asOf: string,
  k: number,
  useBreadth: boolean,
): { pred: number[]; actual: number[]; flat: number[]; residuals: number[] } {
  const pred: number[] = [];
  const actual: number[] = [];
  const flat: number[] = [];
  const residuals: number[] = [];
  for (let i = 0; i < families.length; i++) {
    const rest = families.filter((_, j) => j !== i);
    const f = olsN(rest, useBreadth);
    if (f === null) continue;
    const cf = categoryFactors(rest, f, k, useBreadth).factors;
    const p = families[i]!.row;
    const v = predictValue(p, asOf, f, cf, new Set(), useBreadth).value;
    pred.push(v);
    actual.push(p.mcap_usd!);
    flat.push(median(rest.map((x) => x.row.mcap_usd! / x.row.tvl_usd)) * p.tvl_usd);
    residuals.push(Math.log10(p.mcap_usd!) - Math.log10(v));
  }
  return { pred, actual, flat, residuals };
}

interface VariantFit {
  useBreadth: boolean;
  a: number;
  b: number;
  c: number;
  r2: number;
  shrinkK: number;
  curve: [number, number][];
  loo: BacktestMetrics;
  timesplit: BacktestMetrics;
  residuals: number[];
  band50: [number, number];
  band80: [number, number];
  factors: Record<string, number>;
  counts: Record<string, number>;
}

/**
 * One variant, fully fitted and backtested: the full OLS fit, the shrinkage K tuned by
 * leave-one-out over SHRINK_K_GRID (lowest median miss wins, lowest K wins a tie), and
 * the time-split at the tuned K. The caller decides which variant ships.
 */
function tuneVariant(families: Family[], asOf: string, useBreadth: boolean): VariantFit {
  const full = olsN(families, useBreadth);
  if (full === null) throw new SnapshotError('the traded families have no TVL spread to fit');
  const flatMedian = median(families.map((f) => f.row.mcap_usd! / f.row.tvl_usd));

  // Tune K by leave-one-out: one full pass per candidate, keep the lowest median miss.
  const curve: [number, number][] = [];
  let bestK = SHRINK_K_GRID[0]!;
  let bestMiss = Number.POSITIVE_INFINITY;
  let bestPass = looPass(families, asOf, bestK, useBreadth);
  for (const k of SHRINK_K_GRID) {
    const pass = k === bestK ? bestPass : looPass(families, asOf, k, useBreadth);
    const m = scoreBacktest(pass.pred, pass.actual, pass.flat).median_miss;
    curve.push([k, m]);
    if (m < bestMiss - 1e-12) {
      bestMiss = m;
      bestK = k;
      bestPass = pass;
    }
  }
  const { factors, counts } = categoryFactors(families, full, bestK, useBreadth);
  const looResidSorted = [...bestPass.residuals].sort((x, y) => x - y);
  const qs: Record<string, number> = {};
  for (const q of [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95]) qs[`p${Math.round(q * 100)}`] = round4(quantile(looResidSorted, q));
  const band50: [number, number] = [round2(10 ** qs.p25!), round2(10 ** qs.p75!)];
  const band80: [number, number] = [round2(10 ** qs.p10!), round2(10 ** qs.p90!)];
  const loo: BacktestMetrics = { ...scoreBacktest(bestPass.pred, bestPass.actual, bestPass.flat), n_test: families.length };

  // Time-split: fit on families listed before 2024-01-01, test on later ones, at the tuned K.
  const train = families.filter((f) => f.row.listed_at !== null && f.row.listed_at < '2024-01-01');
  const test = families.filter((f) => f.row.listed_at !== null && f.row.listed_at >= '2024-01-01');
  const tf = olsN(train, useBreadth);
  if (tf === null) throw new SnapshotError('the pre-2024 families have no TVL spread to fit');
  const tcf = categoryFactors(train, tf, bestK, useBreadth).factors;
  const trainFlat = median(train.map((f) => f.row.mcap_usd! / f.row.tvl_usd));
  const tsPred = test.map((f) => predictValue(f.row, asOf, tf, tcf, new Set(), useBreadth).value);
  const tsActual = test.map((f) => f.row.mcap_usd!);
  const tsFlat = test.map((f) => trainFlat * f.row.tvl_usd);
  const timesplit: BacktestMetrics = { ...scoreBacktest(tsPred, tsActual, tsFlat), n_test: test.length };

  return {
    useBreadth,
    a: full.a,
    b: full.b,
    c: full.c,
    r2: full.r2,
    shrinkK: bestK,
    curve,
    loo,
    timesplit,
    residuals: bestPass.residuals,
    band50,
    band80,
    factors,
    counts,
  };
}

/**
 * The whole fit, backtests included, from the snapshot. Every number the page quotes comes
 * from here; nothing is typed in by hand. Both curve variants are fitted and backtested,
 * each at its own leave-one-out-tuned K, and the breadth term ships ONLY if it wins BOTH
 * backtests (leave-one-out and time-split median miss) — a term that loses either is
 * dropped, and the rejected variant's numbers are kept in variant_test for the page.
 */
export function fitComps(snapshot: Snapshot): FitResult {
  const traded = snapshot.protocols.filter(isTraded);
  const tokenRecord = snapshot.protocols.filter(hasTokenRecord);
  const dead = traded.filter((p) => p.mcap_usd !== null && p.mcap_usd <= 0);
  const families = familiesOf(snapshot.protocols);
  const flatMedian = median(families.map((f) => f.row.mcap_usd! / f.row.tvl_usd));

  // The sibling set for the backtests is empty on purpose: a left-out family is predicted
  // as if no same-family token trades, because the family itself is the one held out.
  const withBreadth = tuneVariant(families, snapshot.as_of, true);
  const noBreadth = tuneVariant(families, snapshot.as_of, false);
  const keepBreadth =
    withBreadth.loo.median_miss < noBreadth.loo.median_miss - 1e-12 &&
    withBreadth.timesplit.median_miss < noBreadth.timesplit.median_miss - 1e-12;
  const pick = keepBreadth ? withBreadth : noBreadth;

  const looResidSorted = [...pick.residuals].sort((x, y) => x - y);
  const qs: Record<string, number> = {};
  for (const q of [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95]) qs[`p${Math.round(q * 100)}`] = round4(quantile(looResidSorted, q));

  // Bootstrap: 200 resamples of the families, refit the shipped curve, 95% CI on b.
  const rng = mulberry32(20261114);
  const bs: number[] = [];
  for (let i = 0; i < BOOTSTRAP_RESAMPLES; i++) {
    const sample = Array.from({ length: families.length }, () => families[Math.floor(rng() * families.length)]!);
    const b = olsN(sample, pick.useBreadth);
    if (b !== null) bs.push(b.b);
  }
  bs.sort((x, y) => x - y);
  const bootstrapB: [number, number] = [round4(quantile(bs, 0.025)), round4(quantile(bs, 0.975))];

  // Sibling-linked rows on the board: ranked rows sharing a gecko_id with a traded protocol.
  const tradedGecko = new Set(families.map((f) => f.row.gecko_id!));
  const siblingLinked = snapshot.protocols.filter((p) => isRankable(p) && p.gecko_id !== null && tradedGecko.has(p.gecko_id)).length;

  return {
    a: round4(pick.a),
    b: round4(pick.b),
    c: round4(pick.c),
    breadth_enabled: pick.useBreadth,
    r2: round4(pick.r2),
    n_families: families.length,
    n_traded: traded.length,
    n_token_record: tokenRecord.length,
    n_token_no_mcap: tokenRecord.filter((p) => p.mcap_usd === null).length,
    n_dead_excluded: dead.length,
    shrink_k: pick.shrinkK,
    shrink_k_curve: pick.curve,
    variant_test: {
      breadth: { k: withBreadth.shrinkK, loo_miss: withBreadth.loo.median_miss, ts_miss: withBreadth.timesplit.median_miss, r2: round4(withBreadth.r2) },
      nobreadth: { k: noBreadth.shrinkK, loo_miss: noBreadth.loo.median_miss, ts_miss: noBreadth.timesplit.median_miss, r2: round4(noBreadth.r2) },
    },
    flat_median_ratio: round4(flatMedian),
    category_factors: Object.fromEntries(Object.entries(pick.factors).map(([k, v]) => [k, round4(v)])),
    category_counts: pick.counts,
    loo_residual_quantiles: qs,
    band50: pick.band50,
    band80: pick.band80,
    loo: pick.loo,
    timesplit: pick.timesplit,
    bootstrap_b_ci: bootstrapB,
    sibling_linked_rows: siblingLinked,
  };
}

/** The implied value of one protocol under a fitted model, with every multiplier shown. */
export function impliedValue(
  protocol: SnapshotProtocol,
  snapshot: Snapshot,
  fit: FitResult,
): { implied: number; base: number; breadthFactor: number; breadthChains: number; categoryFactor: number; growthPct: number; growthMult: number; seasoningMult: number; sibling: number; age: number | null; p10: number; p90: number } {
  // Sibling: 0.50 when another protocol of the same gecko_id family already trades. Ranked
  // rows record no gecko_id, so this never fires on this snapshot — the check still runs.
  const geckoCounts = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (p.gecko_id === null) continue;
    geckoCounts.set(p.gecko_id, (geckoCounts.get(p.gecko_id) ?? 0) + 1);
  }
  const siblingSet = new Set([...geckoCounts.entries()].filter(([, n]) => n > 1).map(([g]) => g));
  const pred = predictValue(protocol, snapshot.as_of, fit, fit.category_factors, siblingSet, fit.breadth_enabled);
  const implied = Math.max(1, Math.round(pred.value));
  return {
    implied,
    base: Math.round(pred.base),
    breadthFactor: round4(pred.breadth),
    breadthChains: breadthChains(protocol),
    categoryFactor: round4(pred.cat),
    growthPct: pred.growthPct,
    growthMult: round4(pred.growthMult),
    seasoningMult: round4(pred.seasoningMult),
    sibling: pred.sibling,
    age: pred.age,
    p10: Math.max(1, Math.round(implied * fit.band80[0])),
    p90: Math.max(1, Math.round(implied * fit.band80[1])),
  };
}

// ---------------------------------------------------------------- farm economics

/** Gas per transaction for a protocol's first chain, from the stated table. */
export function gasPerTx(p: SnapshotProtocol): number {
  const chain = p.chains.length > 0 ? p.chains[0]! : '';
  if (chain in GAS_PER_TX_USD) return GAS_PER_TX_USD[chain]!;
  if (L2_CHAINS.has(chain)) return 0.2;
  return 0.5;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Hands-on hours for one plan, from how many chains the protocol spans (2h base, up to 3h). */
export function hoursFor(p: SnapshotProtocol): number {
  return round2(Math.min(3, 2 + 0.25 * Math.max(0, p.chains.length - 1)));
}

export interface FarmPlan {
  slice_1k: number;
  slice_low_1k: number;
  gas_usd: number;
  fees_usd: number;
  forgone_usd: number;
  net_usd: number;
  net_low_usd: number;
  net_p10_usd: number;
  net_per_hour: number;
  net_low_per_hour: number;
  break_even_usd: number;
  verdict: 'ROBUST' | 'FARM' | 'THIN' | 'SKIP';
  hold_days: number;
  hold_weeks: number;
  hours: number;
}

/**
 * A $1,000 plan's economics, netted to the dollar twice: at the implied value and at the
 * band's low end (lowMult, the P25 multiplier). net_p10_usd is the same net at the P10
 * low end, shown per row so the reader sees how far the value must fall before the plan
 * stops paying. break_even_usd is the implied launch value at which the plan nets $0.
 */
export function farmPlan(p: SnapshotProtocol, implied: number, age: number | null, p10: number, lowMult: number): FarmPlan {
  const slice = (SLICE_SHARE * implied * PLAN_USD) / p.tvl_usd;
  const gas = round2(gasPerTx(p) * PLAN_TXS);
  const fees = round2(SWAP_FEE_RATE * PLAN_USD);
  const holdDays = holdDaysFor(age);
  const holdWeeks = round2(holdDays / 7);
  const forgone = round2((TBILL_PCT / 100) * PLAN_USD * (holdWeeks / 52));
  const costs = gas + fees + forgone;
  const net = round2(slice - costs);
  const sliceLow = round2(slice * lowMult);
  const netLow = round2(sliceLow - costs);
  const sliceP10 = round2(slice * (p10 / Math.max(implied, 1)));
  const netP10 = round2(sliceP10 - costs);
  const hours = hoursFor(p);
  const perHour = round2(net / hours);
  const perHourLow = round2(netLow / hours);
  const breakEven = Math.max(1, Math.round((costs * p.tvl_usd) / (SLICE_SHARE * PLAN_USD)));
  const verdict: FarmPlan['verdict'] = netLow > 0 ? 'ROBUST' : net <= 0 ? 'SKIP' : perHour >= 5 ? 'FARM' : 'THIN';
  return { slice_1k: round2(slice), slice_low_1k: sliceLow, gas_usd: gas, fees_usd: fees, forgone_usd: forgone, net_usd: net, net_low_usd: netLow, net_p10_usd: netP10, net_per_hour: perHour, net_low_per_hour: perHourLow, break_even_usd: breakEven, verdict, hold_days: holdDays, hold_weeks: holdWeeks, hours };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(text: string, cost: string, time: string): string {
  let s = `${text} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** The category's one action, in the words a farmer can follow. */
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

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age, gas table, hold window), never
 * from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, plan: FarmPlan): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = plan.hold_days;
  const gas = gasPerTx(p);
  const action = actionFor(p, capital, chain);
  return [
    stepText(
      `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline`,
      'under $3 of gas for the first transaction',
      '5 minutes',
    ),
    stepText(action, `$${capital} of capital and about $${gas.toFixed(2)} of gas`, '15 minutes to set up'),
    stepText(
      `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote on ${p.name}`,
      `about $${gas.toFixed(2)} of gas a week`,
      '10 minutes a week',
    ),
    stepText(
      `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot`,
      `the $${capital} stays in the position`,
      `${hold} days`,
    ),
    stepText(
      `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes`,
      'no fee to check, and never pay to claim',
      '10 minutes',
    ),
    stepText(
      `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it`,
      'nothing but the log',
      '5 minutes',
    ),
  ];
}

// ---------------------------------------------------------------- board

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: FitResult): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot, fit);
    const plan = farmPlan(p, v.implied, v.age, v.p10, fit.band50[0]);
    return { p, v, plan };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      base_usd: s.v.base,
      breadth_factor: s.v.breadthFactor,
      breadth_chains: s.v.breadthChains,
      category_factor: s.v.categoryFactor,
      growth_pct: s.v.growthPct,
      growth_multiplier: s.v.growthMult,
      seasoning_multiplier: s.v.seasoningMult,
      sibling_factor: s.v.sibling,
      age_days: s.v.age,
      p10_usd: s.v.p10,
      p90_usd: s.v.p90,
    },
    farm_steps: farmSteps(s.p, s.v.age, s.plan),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, from the snapshot and the fit. */
export function buildRadar(snapshot: Snapshot, fit: FitResult): { board: BoardRow[]; radar: RadarData; fit: FitResult } {
  const board = buildBoard(snapshot, fit);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const boardSlugs = new Set(board.map((r) => r.slug));
  const rows: RadarRow[] = board.map((r) => {
    const p = snapshot.protocols.find((x) => x.slug === r.slug)!;
    const plan = farmPlan(p, r.implied_value_usd, r.age_days, r.model.p10_usd, fit.band50[0]);
    const badges = [watchlist.has(r.slug) ? 'WATCHLIST' : 'EARLY'];
    if (r.model.sibling_factor < 1) badges.push('SIBLING');
    // Early find: off the watchlist and either new (listed <= 180 days ago) or rising
    // (TVL up over 7 days). A discovery surface, not a second ranking.
    const isNew = r.age_days !== null && r.age_days <= 180;
    const isRising = r.change_7d !== null && r.change_7d > 0;
    const earlyFind = !watchlist.has(r.slug) && (isNew || isRising);
    const earlyReason = !earlyFind ? null : isNew && isRising ? 'new + rising' : isNew ? 'new ≤180d' : 'rising 7d';
    return {
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      p10: r.model.p10_usd,
      p90: r.model.p90_usd,
      breadth: r.model.breadth_factor,
      slice_1k: plan.slice_1k,
      slice_low_1k: plan.slice_low_1k,
      net_usd: plan.net_usd,
      net_low_usd: plan.net_low_usd,
      net_p10_usd: plan.net_p10_usd,
      net_per_hour: plan.net_per_hour,
      net_low_per_hour: plan.net_low_per_hour,
      break_even_usd: plan.break_even_usd,
      verdict: plan.verdict,
      fees_usd: plan.fees_usd,
      gas_usd: plan.gas_usd,
      hold_weeks: plan.hold_weeks,
      hours: plan.hours,
      steps: r.farm_steps,
      badges,
      early_find: earlyFind,
      early_reason: earlyReason,
    };
  });
  // Buckets, field convention: traded = any token recorded (416); set aside = the
  // pre-token protocols the board does not rank (144). The four set-aside rules are
  // disjoint and sum to the set-aside count exactly.
  const tradedCount = snapshot.protocols.filter(hasTokenRecord).length;
  const preTokenCount = snapshot.protocols.filter(isPreToken).length;
  const setAsideRows = snapshot.protocols.filter((p) => !hasTokenRecord(p) && !boardSlugs.has(p.slug));
  const ruleCex = setAsideRows.filter((p) => p.category === 'CEX').length;
  const ruleVersioned = setAsideRows.filter((p) => p.category !== 'CEX' && VERSIONED.test(p.name)).length;
  const ruleOffWatchlist = setAsideRows.filter((p) => p.category !== 'CEX' && !VERSIONED.test(p.name) && p.tvl_usd >= snapshot.floor_usd).length;
  const ruleBelowCut = setAsideRows.length - ruleCex - ruleVersioned - ruleOffWatchlist;
  const setAsideRules: [string, string, number][] = [
    ['CEX', 'Centralised exchange — not a DeFi protocol', ruleCex],
    ['Versioned pool', 'Name ends in a version (e.g. V2) — a pool of another protocol', ruleVersioned],
    ['Off the watchlist above the floor', 'Pre-token but left out by the house rule: a bridge, liquid-staking, wrapped/staked or exchange-named protocol', ruleOffWatchlist],
    ['Below the early cut', 'Pre-token and rankable, but below the top-158 early rows by TVL', ruleBelowCut],
  ];
  const counts = {
    protocols: snapshot.protocols.length,
    watchlist: snapshot.watchlist.length,
    ranked: board.length,
    traded: tradedCount,
    traded_mcap: snapshot.protocols.filter(isTraded).length,
    fit_families: fit.n_families,
    pre_token: preTokenCount,
    set_aside: setAsideRows.length,
    robust: rows.filter((r) => r.verdict === 'ROBUST').length,
    farm: rows.filter((r) => r.verdict === 'FARM').length,
    thin: rows.filter((r) => r.verdict === 'THIN').length,
    skip: rows.filter((r) => r.verdict === 'SKIP').length,
    early_finds: rows.filter((r) => r.early_find).length,
  };
  const farmNext = [...rows]
    .sort((a, b) => b.net_per_hour - a.net_per_hour || b.net_usd - a.net_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, 5)
    .map((r) => ({ slug: r.slug, name: r.name, net: r.net_usd, per_hour: r.net_per_hour }));
  // The formula the page prints names the shipped curve and the variant test behind it:
  // the breadth term either ships with its fitted exponent, or is named as tested and
  // dropped, with both variants' backtest numbers so the reader can check the call.
  const vt = fit.variant_test;
  const breadthLine = fit.breadth_enabled
    ? `breadth = min(chains,10)^c with c=${fit.c} fitted; the chains term ships because it won both backtests (with chains LOO x${vt.breadth.loo_miss} / time-split x${vt.breadth.ts_miss} vs without x${vt.nobreadth.loo_miss} / x${vt.nobreadth.ts_miss} at K=${vt.nobreadth.k});`
    : `breadth = min(chains,10)^c was fitted and DROPPED: with chains LOO x${vt.breadth.loo_miss} / time-split x${vt.breadth.ts_miss} (K=${vt.breadth.k}) vs without x${vt.nobreadth.loo_miss} / x${vt.nobreadth.ts_miss} (K=${vt.nobreadth.k}) — the term hurt both backtests, so the shipped curve has no breadth term;`;
  const formula = fit.breadth_enabled
    ? `implied = 10^a * TVL^b * min(chains,10)^c * category_factor * growth * seasoning * sibling; log10(mcap) = a + b*log10(TVL) + c*log10(min(chains,10)) fitted by two-variable OLS on ${fit.n_families} traded token families (${fit.n_dead_excluded} dead tokens with mcap<=0 excluded; ${fit.n_token_no_mcap} protocols record a token but no market cap and cannot enter the fit); category = 10^(median log-residual) shrunk toward 0 with ${fit.shrink_k} pseudo-peers, tuned by leave-one-out over K in {${SHRINK_K_GRID.join(',')}}; ${breadthLine} growth = 1 + 0.5*clamp(change_7d,-60,120)/100 capped at 1.40; seasoning = 0.70 at 0 days rising linearly to 1.00 at 730 days (no listed_at = 365 days); sibling = 0.50 when the same gecko_id family already trades (0 rows in this snapshot); P10-P90 band from leave-one-out residual quantiles at the tuned K.`
    : `implied = 10^a * TVL^b * category_factor * growth * seasoning * sibling; log10(mcap) = a + b*log10(TVL) fitted by OLS on ${fit.n_families} traded token families (${fit.n_dead_excluded} dead tokens with mcap<=0 excluded; ${fit.n_token_no_mcap} protocols record a token but no market cap and cannot enter the fit); category = 10^(median log-residual) shrunk toward 0 with ${fit.shrink_k} pseudo-peers, tuned by leave-one-out over K in {${SHRINK_K_GRID.join(',')}}; ${breadthLine} growth = 1 + 0.5*clamp(change_7d,-60,120)/100 capped at 1.40; seasoning = 0.70 at 0 days rising linearly to 1.00 at 730 days (no listed_at = 365 days); sibling = 0.50 when the same gecko_id family already trades (0 rows in this snapshot); P10-P90 band from leave-one-out residual quantiles at the tuned K.`;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: {
      version: MODEL_VERSION,
      formula,
      a: fit.a,
      b: fit.b,
      c: fit.c,
      breadth_cap: BREADTH_CAP_CHAINS,
      breadth_enabled: fit.breadth_enabled,
      shrink_k: fit.shrink_k,
      shrink_k_curve: fit.shrink_k_curve,
      variant_test: fit.variant_test,
      r2: fit.r2,
      n_families: fit.n_families,
      category_factors: fit.category_factors,
      sibling_factor: SIBLING_FACTOR,
      growth_cap: GROWTH_MULT_CAP,
      seasoning_min: SEASONING_MIN,
      seasoning_max: SEASONING_MAX,
      seasoning_days: SEASONING_DAYS,
      slice_share: SLICE_SHARE,
      plan_usd: PLAN_USD,
      tbill_pct: TBILL_PCT,
    },
    backtest: {
      loo: {
        median_miss: fit.loo.median_miss,
        within3: fit.loo.within3,
        within10: fit.loo.within10,
        flat_median_miss: fit.loo.flat_median_miss,
        flat_within3: fit.loo.flat_within3,
      },
      timesplit: {
        median_miss: fit.timesplit.median_miss,
        within3: fit.timesplit.within3,
        within10: fit.timesplit.within10,
        flat_median_miss: fit.timesplit.flat_median_miss,
        flat_within3: fit.timesplit.flat_within3,
      },
      band50: fit.band50,
      band80: fit.band80,
      bootstrap_b_ci: fit.bootstrap_b_ci,
    },
    counts,
    farm_next: farmNext,
    set_aside_rules: setAsideRules,
    rows,
    live,
  };
  return { board, radar, fit };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
