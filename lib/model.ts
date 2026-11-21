// Token Radar v4 — the model (radar-4). One snapshot in, one ranked board out.
//
// What this file does, in order:
//   1. reads the sealed DefiLlama snapshot (758 protocols, as_of 2026-11-14);
//   2. fits the value curve on the 95 traded tokens that carry both a market
//      cap and a listing date, then backtests it two ways (leave-one-out and
//      walk-forward: tokens listed earlier price those listed later);
//   3. fits token odds on the 436 peers the house rule leaves standing, and
//      backtests those the same two ways (Brier score);
//   4. ranks the 40 watchlist protocols plus the 158 largest pre-token
//      protocols below the floor by implied value = if-it-launches x odds;
//   5. prices a 12-week, $1,000 farm plan for every row, with real gas per
//      chain, and verdicts each row on its net of fees and net per hour.
//
// Nothing here names a protocol. Every number below is fitted from the
// snapshot at run time; the backtest numbers the dashboard prints are the
// ones this file computes, not constants typed in by hand.

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

/** The farm scenario the board is priced under. */
export interface FarmScenario {
  deposit_usd: number;
  drop_share: number;
  horizon_weeks: number;
}

export const SCENARIO: FarmScenario = { deposit_usd: 1000, drop_share: 0.07, horizon_weeks: 12 };

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-4';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 158;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The T-bill rate the farm is compared against, per year. */
export const TBILL_RATE = 0.04;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

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
  if_launches_usd: number;
  token_odds: number;
  range_p25_usd: number;
  range_p75_usd: number;
  range_p10_usd: number;
  range_p90_usd: number;
  verdict: string;
  drop_value_usd: number;
  fees_usd: number;
  net_of_fees_usd: number;
  net_per_hour_usd: number;
  model: {
    growth_pct: number;
    age_days: number | null;
    sibling: boolean;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  if_launches_usd: number;
  token_odds: number;
  range_p25_usd: number;
  range_p75_usd: number;
  range_p10_usd: number;
  range_p90_usd: number;
  verdict: string;
  drop_value_usd: number;
  fees_usd: number;
  net_of_fees_usd: number;
  net_per_hour_usd: number;
  watchlist: boolean;
  sibling: boolean;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One row of an out-of-sample evidence table. */
export interface EvidenceRow {
  term: string;
  loo: number;
  wf: number;
  kept: boolean;
  note: string;
}

/** One group of the protocol accounting bar. */
export interface AccountGroup {
  label: string;
  count: number;
  note: string;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  checksum: string;
  scenario: FarmScenario;
  value_beta: number[];
  value_r2: number;
  value_comps: number;
  odds_beta: number[];
  odds_peers: number;
  odds_base_rate: number;
  value_evidence: EvidenceRow[];
  odds_evidence: EvidenceRow[];
  range: {
    q10: number;
    q25: number;
    q75: number;
    q90: number;
    within3_loo: number;
    within3_wf: number;
    p2575_loo: number;
    p2575_wf: number;
    p1090_loo: number;
    p1090_wf: number;
  };
  kpi: {
    miss_wf: number;
    miss_flat_wf: number;
    miss_loo: number;
    brier_wf: number;
    brier_base_wf: number;
    brier_loo: number;
    odds_acc_wf: number;
    odds_acc_loo: number;
    value_kept: number;
    value_tested: number;
    odds_kept: number;
    odds_tested: number;
    worth_farming: number;
    skip_count: number;
    verdicts: Record<string, number>;
  };
  accounting: AccountGroup[];
  rows: RadarRow[];
  live: LiveRow[];
  gas: Record<string, number>;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const ln = Math.log;

/** A finite number, else the fallback. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a list (lower middle for even counts). */
export function median(values: number[]): number {
  const t = [...values].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)]!;
}

/** A quantile of a list by index (floor(q * n), clamped). */
function quantile(values: number[], q: number): number {
  const t = [...values].sort((a, b) => a - b);
  return t[Math.min(t.length - 1, Math.floor(q * t.length))]!;
}

/** The typical miss of log errors: exp(median absolute log error). */
function typicalMiss(errors: number[]): number {
  return Math.exp(median(errors.map((e) => Math.abs(e))));
}

/** A whole day count from one date to another, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking in a name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** The house rule's excluded categories: not standalone launches. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
  'Chain',
]);

/** Whether a protocol is one the house rule leaves standing as a launch candidate. */
export function isStanding(p: SnapshotProtocol): boolean {
  return !EXCLUDED_CATEGORIES.has(p.category ?? '') && !VERSIONED.test(p.name) && !WRAPPED_WORD.test(p.name);
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The 7-day TVL change as a fraction, clamped to [-60%, +120%]. */
function growthFrac(p: SnapshotProtocol): number {
  return Math.min(1.2, Math.max(-0.6, finite(p.change_7d, 0) / 100));
}

/** Ordinary least squares by normal equations with partial pivoting. */
function ols(X: number[][], y: number[]): { beta: number[]; resid: number[] } {
  const n = X.length;
  const k = X[0]!.length;
  const A: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      b[a]! += X[i]![a]! * y[i]!;
      for (let c = 0; c < k; c++) A[a]![c]! += X[i]![a]! * X[i]![c]!;
    }
  }
  for (let a = 0; a < k; a++) A[a]![a]! += 1e-9;
  const M = A.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    const tmp = M[c]!;
    M[c] = M[piv]!;
    M[piv] = tmp;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      for (let j = c; j <= k; j++) M[r]![j]! -= f * M[c]![j]!;
    }
  }
  const beta = M.map((r, i) => r[k]! / r[i]!);
  const resid = y.map((v, i) => v - X[i]!.reduce((t, x, j) => t + x * beta[j]!, 0));
  return { beta, resid };
}

// ---------------------------------------------------------------- value model
//
// The value curve prices what a token would be worth IF it launches, from
// the traded tokens that already did: log market cap on log TVL plus the
// 7-day TVL change. The comps are the 95 traded tokens that carry both a
// market cap above zero and a listing date, so every term is identified.
// A term is kept only when it lowers the held-out miss in BOTH backtests.

/** The traded tokens the value curve is fitted on. */
export function valueComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0 && p.listed_at !== null);
}

/** The value curve's features: intercept, log TVL, clamped 7-day growth. */
function valueFeatures(p: SnapshotProtocol): number[] {
  return [1, ln(p.tvl_usd), growthFrac(p)];
}

/** The value curve's features with a chain-count term (tested, not kept). */
function valueFeaturesChains(p: SnapshotProtocol): number[] {
  return [1, ln(p.tvl_usd), growthFrac(p), ln(Math.max(1, p.chains.length))];
}

/** The value curve's features with an age term (tested, not kept). */
function valueFeaturesAge(p: SnapshotProtocol, asOf: string): number[] {
  const age = ageDays(asOf, p.listed_at);
  return [1, ln(p.tvl_usd), growthFrac(p), ln(1 + (age ?? 365) / 365)];
}

/** Leave-one-out log errors for a feature function. */
function looErrors(rows: SnapshotProtocol[], f: (p: SnapshotProtocol) => number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const train = rows.filter((_, j) => j !== i);
    const { beta } = ols(train.map(f), train.map((p) => ln(p.mcap_usd!)));
    out.push(ln(rows[i]!.mcap_usd!) - f(rows[i]!).reduce((t, x, j) => t + x * beta[j]!, 0));
  }
  return out;
}

/** Walk-forward log errors: fit on the earlier-listed half, test on the later half. */
function wfErrors(rows: SnapshotProtocol[], f: (p: SnapshotProtocol) => number[]): number[] {
  const dated = [...rows].sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const { beta } = ols(
    dated.slice(0, half).map(f),
    dated.slice(0, half).map((p) => ln(p.mcap_usd!)),
  );
  return dated.slice(half).map((p) => ln(p.mcap_usd!) - f(p).reduce((t, x, j) => t + x * beta[j]!, 0));
}

/** The flat baseline: one median multiple of TVL, refitted per fold. */
function flatErrors(rows: SnapshotProtocol[], mode: 'loo' | 'wf'): number[] {
  if (mode === 'loo') {
    const out: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const ratios = rows
        .filter((_, j) => j !== i)
        .map((p) => p.mcap_usd! / p.tvl_usd)
        .sort((a, b) => a - b);
      const m = ratios[Math.floor(ratios.length / 2)]!;
      out.push(ln(rows[i]!.mcap_usd!) - ln(m * rows[i]!.tvl_usd));
    }
    return out;
  }
  const dated = [...rows].sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const ratios = dated
    .slice(0, half)
    .map((p) => p.mcap_usd! / p.tvl_usd)
    .sort((a, b) => a - b);
  const m = ratios[Math.floor(ratios.length / 2)]!;
  return dated.slice(half).map((p) => ln(p.mcap_usd!) - ln(m * p.tvl_usd));
}

/** The category effect for a feature function: shrunk median residual per category. */
function categoryEffects(
  rows: SnapshotProtocol[],
  f: (p: SnapshotProtocol) => number[],
  beta: number[],
  shrinkK: number,
): Record<string, number> {
  const by: Record<string, number[]> = {};
  for (const p of rows) {
    const resid = ln(p.mcap_usd!) - f(p).reduce((t, x, j) => t + x * beta[j]!, 0);
    (by[p.category ?? 'null'] ??= []).push(resid);
  }
  const eff: Record<string, number> = {};
  for (const [c, rs] of Object.entries(by)) {
    if (rs.length >= 3) eff[c] = median(rs) * (rs.length / (rs.length + shrinkK));
  }
  return eff;
}

/** LOO + walk-forward errors for the size curve plus a ridge-shrunk category effect. */
function categoryErrors(rows: SnapshotProtocol[], mode: 'loo' | 'wf'): number[] {
  const f = valueFeatures;
  if (mode === 'loo') {
    const out: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const train = rows.filter((_, j) => j !== i);
      const { beta } = ols(train.map(f), train.map((p) => ln(p.mcap_usd!)));
      const eff = categoryEffects(train, f, beta, 25);
      out.push(ln(rows[i]!.mcap_usd!) - (f(rows[i]!).reduce((t, x, j) => t + x * beta[j]!, 0) + (eff[rows[i]!.category ?? 'null'] ?? 0)));
    }
    return out;
  }
  const dated = [...rows].sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const { beta } = ols(train.map(f), train.map((p) => ln(p.mcap_usd!)));
  const eff = categoryEffects(train, f, beta, 25);
  return dated
    .slice(half)
    .map((p) => ln(p.mcap_usd!) - (f(p).reduce((t, x, j) => t + x * beta[j]!, 0) + (eff[p.category ?? 'null'] ?? 0)));
}

export interface ValueBacktest {
  beta: number[];
  r2: number;
  loo: number[];
  wf: number[];
  evidence: EvidenceRow[];
  flatLoo: number;
  flatWf: number;
}

/** Fit the value curve and backtest every candidate term on the same comps. */
export function backtestValue(snapshot: Snapshot): ValueBacktest {
  const comps = valueComps(snapshot);
  const y = comps.map((p) => ln(p.mcap_usd!));
  const { beta, resid } = ols(comps.map(valueFeatures), y);
  const mean = y.reduce((a, b) => a + b, 0) / y.length;
  const ssTot = y.reduce((a, v) => a + (v - mean) * (v - mean), 0);
  const ssRes = resid.reduce((a, v) => a + v * v, 0);
  const r2 = 1 - ssRes / ssTot;
  const loo = looErrors(comps, valueFeatures);
  const wf = wfErrors(comps, valueFeatures);
  const evidence: EvidenceRow[] = [
    {
      term: 'flat median multiple',
      loo: typicalMiss(flatErrors(comps, 'loo')),
      wf: typicalMiss(flatErrors(comps, 'wf')),
      kept: false,
      note: 'baseline',
    },
    {
      term: 'size curve, ln TVL',
      loo: typicalMiss(looErrors(comps, (p) => [1, ln(p.tvl_usd)])),
      wf: typicalMiss(wfErrors(comps, (p) => [1, ln(p.tvl_usd)])),
      kept: true,
      note: 'kept',
    },
    {
      term: '+ 7-day TVL growth',
      loo: typicalMiss(loo),
      wf: typicalMiss(wf),
      kept: true,
      note: 'kept: lowers both tests',
    },
    {
      term: '+ chain count, ln',
      loo: typicalMiss(looErrors(comps, valueFeaturesChains)),
      wf: typicalMiss(wfErrors(comps, valueFeaturesChains)),
      kept: false,
      note: 'tested, not kept',
    },
    {
      term: '+ no-token age, ln',
      loo: typicalMiss(looErrors(comps, (p) => valueFeaturesAge(p, snapshot.as_of))),
      wf: typicalMiss(wfErrors(comps, (p) => valueFeaturesAge(p, snapshot.as_of))),
      kept: false,
      note: 'tested, not kept',
    },
    {
      term: '+ category effect, ridge 25',
      loo: typicalMiss(categoryErrors(comps, 'loo')),
      wf: typicalMiss(categoryErrors(comps, 'wf')),
      kept: false,
      note: 'tested, not kept',
    },
  ];
  return {
    beta,
    r2,
    loo,
    wf,
    evidence,
    flatLoo: typicalMiss(flatErrors(comps, 'loo')),
    flatWf: typicalMiss(flatErrors(comps, 'wf')),
  };
}

/** What a token would be worth if it launches, under the fitted curve. */
export function ifLaunches(p: SnapshotProtocol, beta: number[]): number {
  const x = valueFeatures(p);
  return Math.exp(x.reduce((t, v, j) => t + v * beta[j]!, 0));
}

// ---------------------------------------------------------------- token odds
//
// Token odds are a logistic model on the peers the house rule leaves
// standing (436 protocols, 242 of which record a token). Features, in the
// order they are added: size, no-token age in log months, an indicator for
// an unknown listing date (those protocols are almost always old), 7-day
// TVL growth, and a namesake sibling — another protocol sharing the
// protocol's first name word. Chain count and category rates were tested
// and did not survive both backtests, so they are not in the model.

/** The peers the odds model learns from. */
export function oddsPeers(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => isStanding(p));
}

/** The first word of a name, lowercased, for namesake matching. */
function firstWord(name: string): string {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] ?? '';
}

/** Whether another protocol shares this protocol's first name word. */
export function hasSibling(p: SnapshotProtocol, snapshot: Snapshot): boolean {
  const w = firstWord(p.name);
  if (w === '') return false;
  let count = 0;
  for (const q of snapshot.protocols) {
    if (firstWord(q.name) === w) count++;
    if (count > 1) return true;
  }
  return false;
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

/** The odds model's features for one protocol. */
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

/** Logistic regression by plain gradient descent (fixed steps: deterministic). */
function fitLogit(X: number[][], y: number[], iters: number): number[] {
  const k = X[0]!.length;
  const beta: number[] = new Array<number>(k).fill(0);
  const m = y.reduce((a, b) => a + b, 0) / y.length;
  beta[0] = ln(m / (1 - m));
  const lr = 0.5;
  const l2 = 1e-3;
  for (let it = 0; it < iters; it++) {
    const grad: number[] = new Array<number>(k).fill(0);
    for (let i = 0; i < X.length; i++) {
      const pr = sigmoid(X[i]!.reduce((t, x, j) => t + x * beta[j]!, 0));
      const e = pr - y[i]!;
      for (let j = 0; j < k; j++) grad[j]! += e * X[i]![j]!;
    }
    for (let j = 0; j < k; j++) beta[j]! -= lr * (grad[j]! / X.length + (j === 0 ? 0 : l2 * beta[j]!));
  }
  return beta;
}

/** The Brier score of predicted probabilities against 0/1 outcomes. */
function brier(pred: number[], y: number[]): number {
  return pred.reduce((t, pr, i) => t + (pr - y[i]!) * (pr - y[i]!), 0) / y.length;
}

export interface OddsBacktest {
  beta: number[];
  baseRate: number;
  loo: number;
  wf: number;
  looAcc: number;
  wfAcc: number;
  baseLoo: number;
  baseWf: number;
  evidence: EvidenceRow[];
}

/** Fit token odds and backtest every candidate term on the same peers. */
export function backtestOdds(snapshot: Snapshot): OddsBacktest {
  const peers = oddsPeers(snapshot);
  const y = peers.map((p) => (isPreToken(p) ? 0 : 1));
  const baseRate = y.reduce((a, b) => a + b, 0) / y.length;
  const sibs = peers.map((p) => hasSibling(p, snapshot));
  const dated = peers
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.listed_at !== null)
    .sort((a, b) => (a.p.listed_at! < b.p.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);

  // Feature sets, each a prefix of the kept model plus two tested extras.
  const sets: { term: string; cols: (p: SnapshotProtocol, i: number) => number[]; kept: boolean; note: string }[] = [
    { term: 'base rate of peers', cols: () => [1], kept: false, note: 'baseline' },
    {
      term: '+ size, ln TVL',
      cols: (p) => [1, (ln(p.tvl_usd) - ln(100_000_000)) / 2],
      kept: true,
      note: 'kept',
    },
    {
      term: '+ no-token age, ln months',
      cols: (p) => {
        const age = ageDays(snapshot.as_of, p.listed_at);
        return [1, (ln(p.tvl_usd) - ln(100_000_000)) / 2, age === null ? 2.5 : ln(1 + age / 30), age === null ? 1 : 0];
      },
      kept: true,
      note: 'kept',
    },
    {
      term: '+ 7-day TVL growth',
      cols: (p) => {
        const age = ageDays(snapshot.as_of, p.listed_at);
        return [
          1,
          (ln(p.tvl_usd) - ln(100_000_000)) / 2,
          age === null ? 2.5 : ln(1 + age / 30),
          age === null ? 1 : 0,
          growthFrac(p),
        ];
      },
      kept: true,
      note: 'kept',
    },
    {
      term: '+ namesake sibling',
      cols: (p, i) => oddsFeatures(p, snapshot.as_of, sibs[i]!),
      kept: true,
      note: 'kept: lowers both tests',
    },
    {
      term: '+ chain count, ln',
      cols: (p, i) => [...oddsFeatures(p, snapshot.as_of, sibs[i]!), ln(Math.max(1, p.chains.length))],
      kept: false,
      note: 'tested, not kept',
    },
  ];

  const evalSet = (cols: (p: SnapshotProtocol, i: number) => number[]): { loo: number; wf: number } => {
    const looP: number[] = [];
    for (let i = 0; i < peers.length; i++) {
      const trainX = peers.filter((_, j) => j !== i).map((p, j) => cols(p, j < i ? j : j + 1));
      const trainY = y.filter((_, j) => j !== i);
      const beta = fitLogit(trainX, trainY, 600);
      looP.push(sigmoid(cols(peers[i]!, i).reduce((t, x, j) => t + x * beta[j]!, 0)));
    }
    const trainIdx = dated.slice(0, half).map(({ i }) => i);
    const beta = fitLogit(
      trainIdx.map((i) => cols(peers[i]!, i)),
      trainIdx.map((i) => y[i]!),
      1200,
    );
    const wfP = dated.slice(half).map(({ p, i }) => sigmoid(cols(p, i).reduce((t, x, j) => t + x * beta[j]!, 0)));
    const wfY = dated.slice(half).map(({ i }) => y[i]!);
    return { loo: brier(looP, y), wf: brier(wfP, wfY) };
  };

  const evidence: EvidenceRow[] = sets.map((s) => {
    const { loo, wf } = evalSet(s.cols);
    return { term: s.term, loo, wf, kept: s.kept, note: s.note };
  });

  // The category-rate variant is fitted separately: shrunk per-category
  // logits as an extra column, refitted inside every fold.
  const catEval = (): { loo: number; wf: number } => {
    const fitCat = (train: SnapshotProtocol[]): Record<string, number> => {
      const by: Record<string, number[]> = {};
      for (const p of train) (by[p.category ?? 'null'] ??= []).push(isPreToken(p) ? 0 : 1);
      const gm = train.filter((p) => !isPreToken(p)).length / train.length;
      const lo = ln(gm / (1 - gm));
      const eff: Record<string, number> = {};
      for (const [c, ys] of Object.entries(by)) {
        const m = ys.reduce((a, b) => a + b, 0) / ys.length;
        const shr = (ys.length * m + 8 * gm) / (ys.length + 8);
        eff[c] = ln(shr / (1 - shr)) - lo;
      }
      return eff;
    };
    const cols = (p: SnapshotProtocol, i: number, eff: Record<string, number>): number[] => [
      ...oddsFeatures(p, snapshot.as_of, sibs[i]!),
      eff[p.category ?? 'null'] ?? 0,
    ];
    const looP: number[] = [];
    for (let i = 0; i < peers.length; i++) {
      const train = peers.filter((_, j) => j !== i);
      const eff = fitCat(train);
      const beta = fitLogit(
        train.map((p, j) => cols(p, j < i ? j : j + 1, eff)),
        y.filter((_, j) => j !== i),
        600,
      );
      looP.push(sigmoid(cols(peers[i]!, i, eff).reduce((t, x, j) => t + x * beta[j]!, 0)));
    }
    const trainIdx = dated.slice(0, half).map(({ i }) => i);
    const eff = fitCat(trainIdx.map((i) => peers[i]!));
    const beta = fitLogit(
      trainIdx.map((i) => cols(peers[i]!, i, eff)),
      trainIdx.map((i) => y[i]!),
      1200,
    );
    const wfP = dated.slice(half).map(({ p, i }) => sigmoid(cols(p, i, eff).reduce((t, x, j) => t + x * beta[j]!, 0)));
    const wfY = dated.slice(half).map(({ i }) => y[i]!);
    return { loo: brier(looP, y), wf: brier(wfP, wfY) };
  };
  const cat = catEval();
  evidence.push({ term: '+ category rate, shrunk', loo: cat.loo, wf: cat.wf, kept: false, note: 'tested, not kept' });

  const full = sets[4]!;
  const beta = fitLogit(
    peers.map((p, i) => full.cols(p, i)),
    y,
    1200,
  );
  const fullLoo = evidence[4]!;
  const looP: number[] = [];
  for (let i = 0; i < peers.length; i++) {
    const b = fitLogit(
      peers.filter((_, j) => j !== i).map((p, j) => full.cols(p, j < i ? j : j + 1)),
      y.filter((_, j) => j !== i),
      600,
    );
    looP.push(sigmoid(full.cols(peers[i]!, i).reduce((t, x, j) => t + x * b[j]!, 0)));
  }
  const looAcc = looP.filter((pr, i) => (pr >= 0.5 ? 1 : 0) === y[i]!).length / y.length;
  const trainIdx = dated.slice(0, half).map(({ i }) => i);
  const wb = fitLogit(
    trainIdx.map((i) => full.cols(peers[i]!, i)),
    trainIdx.map((i) => y[i]!),
    1200,
  );
  const wfP = dated.slice(half).map(({ p, i }) => sigmoid(full.cols(p, i).reduce((t, x, j) => t + x * wb[j]!, 0)));
  const wfY = dated.slice(half).map(({ i }) => y[i]!);
  const wfAcc = wfP.filter((pr, i) => (pr >= 0.5 ? 1 : 0) === wfY[i]!).length / wfY.length;

  return {
    beta,
    baseRate,
    loo: fullLoo.loo,
    wf: fullLoo.wf,
    looAcc,
    wfAcc,
    baseLoo: evidence[0]!.loo,
    baseWf: evidence[0]!.wf,
    evidence,
  };
}

/** A protocol's token odds under the fitted model. */
export function tokenOdds(p: SnapshotProtocol, snapshot: Snapshot, beta: number[]): number {
  const x = oddsFeatures(p, snapshot.as_of, hasSibling(p, snapshot));
  return sigmoid(x.reduce((t, v, j) => t + v * beta[j]!, 0));
}

// ---------------------------------------------------------------- economics
//
// A farm plan costs what its chain charges. One transaction's gas, in
// dollars, by first chain; the plan runs 2 setup transactions, one
// qualifying action a week, and 1 claim transaction. The expected drop is
// the implied value times the drop share, shared pro-rata with the tenth
// of TVL that is points-eligible deposits. Hours count the setup, the
// weekly actions at 15 minutes each, the claim and the log.

/** Gas per transaction, in dollars, by chain. */
export const GAS_PER_TX: Record<string, number> = {
  Ethereum: 4.0,
  Tron: 6.5,
  Solana: 0.02,
  Base: 0.08,
  Arbitrum: 0.1,
  Optimism: 0.1,
  BSC: 0.3,
  Polygon: 0.05,
  Avalanche: 0.4,
  Sui: 0.05,
  'zkSync Era': 0.15,
  Linea: 0.1,
  Mantle: 0.05,
  Berachain: 0.1,
  Hyperliquid: 0.05,
  Plume: 0.05,
  Pharos: 0.05,
  Bittensor: 0.1,
  Provenance: 0.1,
};

const DEFAULT_GAS = 1.0;
const SWAP_FEE_RATE = 0.003;
const ELIGIBLE_SHARE = 0.1;

/** The transactions and hours a plan of `weeks` weeks takes. */
export function planWork(weeks: number): { tx: number; hours: number } {
  const tx = 2 + weeks + 1;
  const hours = (5 + 15 + weeks * 15 + 15 + 5) / 60;
  return { tx, hours };
}

export interface Econ {
  drop_value_usd: number;
  fees_usd: number;
  net_of_fees_usd: number;
  net_per_hour_usd: number;
  tbill_usd: number;
  hours: number;
  tx: number;
  verdict: string;
}

/** Price a farm plan for one row under a scenario. */
export function econFor(
  p: SnapshotProtocol,
  implied: number,
  scenario: FarmScenario,
): Econ {
  const gas = GAS_PER_TX[p.chains[0] ?? ''] ?? DEFAULT_GAS;
  const { tx, hours } = planWork(scenario.horizon_weeks);
  const drop = (implied * scenario.drop_share * scenario.deposit_usd) / (ELIGIBLE_SHARE * p.tvl_usd);
  const fees = SWAP_FEE_RATE * scenario.deposit_usd + gas * tx;
  const net = drop - fees;
  const tbill = scenario.deposit_usd * TBILL_RATE * (scenario.horizon_weeks / 52);
  const perHour = net / hours;
  let verdict: string;
  if (net > tbill && perHour >= 25) verdict = 'ROBUST';
  else if (net > tbill && perHour >= 10) verdict = 'FARM';
  else if (net > 0) verdict = 'THIN';
  else if (net >= -25) verdict = 'MARGINAL';
  else verdict = 'SKIP';
  return { drop_value_usd: drop, fees_usd: fees, net_of_fees_usd: net, net_per_hour_usd: perHour, tbill_usd: tbill, hours, tx, verdict };
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
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge'))
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator'))
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains,
 * TVL, gas) and the priced scenario, never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, scenario: FarmScenario, econ: Econ): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const gas = GAS_PER_TX[chain] ?? DEFAULT_GAS;
  const action = actionFor(p, capital, chain);
  const weeklyGas = gas * scenario.horizon_weeks;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, fund it with $${scenario.deposit_usd} of USDC on ${chain}, and keep its seed phrase offline.`,
      cost: `about $${gas.toFixed(2)} of gas to fund it`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gas.toFixed(2)} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week for ${scenario.horizon_weeks} weeks, such as a deposit, a borrow, a swap or a vote, so the activity spans the whole window.`,
      cost: `about $${weeklyGas.toFixed(2)} of gas across the ${scenario.horizon_weeks} actions`,
      time: `15 minutes a week, ${scenario.horizon_weeks} weeks`,
    },
    {
      text: `Hold the position for the full ${scenario.horizon_weeks} weeks so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${scenario.horizon_weeks} weeks`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: `about $${gas.toFixed(2)} of gas to claim, and never pay to claim`,
      time: '15 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

// ---------------------------------------------------------------- the board

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
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

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  valueBeta: number[],
  oddsBeta: number[],
  rangeQ: { q10: number; q25: number; q75: number; q90: number },
  scenario: FarmScenario = SCENARIO,
): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const ifl = ifLaunches(p, valueBeta);
    const odds = tokenOdds(p, snapshot, oddsBeta);
    const implied = Math.max(1, Math.round(ifl * odds));
    const econ = econFor(p, implied, scenario);
    const age = ageDays(snapshot.as_of, p.listed_at);
    return { p, ifl, odds, implied, econ, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
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
    age_days: s.age,
    implied_value_usd: s.implied,
    if_launches_usd: Math.max(1, Math.round(s.ifl)),
    token_odds: Math.round(s.odds * 10000) / 10000,
    range_p25_usd: Math.max(1, Math.round(s.implied * Math.exp(rangeQ.q25))),
    range_p75_usd: Math.max(1, Math.round(s.implied * Math.exp(rangeQ.q75))),
    range_p10_usd: Math.max(1, Math.round(s.implied * Math.exp(rangeQ.q10))),
    range_p90_usd: Math.max(1, Math.round(s.implied * Math.exp(rangeQ.q90))),
    verdict: s.econ.verdict,
    drop_value_usd: Math.round(s.econ.drop_value_usd * 100) / 100,
    fees_usd: Math.round(s.econ.fees_usd * 100) / 100,
    net_of_fees_usd: Math.round(s.econ.net_of_fees_usd * 100) / 100,
    net_per_hour_usd: Math.round(s.econ.net_per_hour_usd * 100) / 100,
    model: {
      growth_pct: Math.round(finite(s.p.change_7d, 0) * 100) / 100,
      age_days: s.age,
      sibling: hasSibling(s.p, snapshot),
    },
    farm_steps: farmSteps(s.p, scenario, s.econ).map(stepText),
  }));
}

/** FNV-1a over the board's ranks, slugs and implied values: the integrity strip's checksum. */
export function boardChecksum(board: BoardRow[]): string {
  let h = 0x811c9dc5;
  const text = board.map((r) => `${r.rank}:${r.slug}:${r.implied_value_usd};`).join('');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The protocol accounting: every one of the 758 protocols in exactly one group. */
export function accounting(snapshot: Snapshot, board: BoardRow[]): AccountGroup[] {
  const ranked = new Set(board.map((r) => r.slug));
  const watch = new Set(snapshot.watchlist);
  let rankedWatch = 0;
  let rankedEarly = 0;
  let tokenMcap = 0;
  let tokenNoCap = 0;
  let outBridge = 0;
  let outStaking = 0;
  let outExchange = 0;
  let outVersioned = 0;
  let outBelowFloor = 0;
  for (const p of snapshot.protocols) {
    if (ranked.has(p.slug)) {
      if (watch.has(p.slug)) rankedWatch++;
      else rankedEarly++;
    } else if (!isPreToken(p)) {
      if ((p.mcap_usd ?? 0) > 0) tokenMcap++;
      else tokenNoCap++;
    } else if (['Bridge', 'Canonical Bridge', 'Cross Chain Bridge'].includes(p.category ?? '')) {
      outBridge++;
    } else if (['Liquid Staking', 'Liquid Restaking', 'Restaked BTC'].includes(p.category ?? '')) {
      outStaking++;
    } else if (p.category === 'CEX') {
      outExchange++;
    } else if (VERSIONED.test(p.name) || WRAPPED_WORD.test(p.name)) {
      outVersioned++;
    } else {
      outBelowFloor++;
    }
  }
  return [
    { label: 'Ranked · watchlist', count: rankedWatch, note: 'records no token, at or above the $50M floor' },
    { label: 'Ranked · early, below the floor', count: rankedEarly, note: 'records no token, largest by TVL' },
    { label: 'Token trades · priced comp', count: tokenMcap, note: 'a market cap the curve can learn from' },
    { label: 'Token recorded · no usable cap', count: tokenNoCap, note: 'a token on record, no market cap to price' },
    { label: 'Out · bridge', count: outBridge, note: 'another token carried across' },
    { label: 'Out · liquid staking', count: outStaking, note: 'the staked form of a token that trades' },
    { label: 'Out · exchange', count: outExchange, note: 'exchange custody, nothing to farm' },
    { label: 'Out · versioned or wrapped', count: outVersioned, note: 'a release or a wrapped form of one protocol' },
    { label: 'Out · below the floor, not ranked', count: outBelowFloor, note: 'records no token, smaller than the 158 early rows' },
  ];
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    if_launches_usd: row.if_launches_usd,
    token_odds: row.token_odds,
    range_p25_usd: row.range_p25_usd,
    range_p75_usd: row.range_p75_usd,
    range_p10_usd: row.range_p10_usd,
    range_p90_usd: row.range_p90_usd,
    verdict: row.verdict,
    drop_value_usd: row.drop_value_usd,
    fees_usd: row.fees_usd,
    net_of_fees_usd: row.net_of_fees_usd,
    net_per_hour_usd: row.net_per_hour_usd,
    watchlist,
    sibling: row.model.sibling,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const value = backtestValue(snapshot);
  const odds = backtestOdds(snapshot);
  const q10 = quantile(value.loo, 0.1);
  const q25 = quantile(value.loo, 0.25);
  const q75 = quantile(value.loo, 0.75);
  const q90 = quantile(value.loo, 0.9);
  const rangeQ = { q10, q25, q75, q90 };
  const board = buildBoard(snapshot, value.beta, odds.beta, rangeQ, SCENARIO);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const verdicts: Record<string, number> = {};
  for (const r of board) verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: board.reduce((t, r) => t + r.implied_value_usd, 0),
    checksum: boardChecksum(board),
    scenario: SCENARIO,
    value_beta: value.beta.map((b) => Math.round(b * 10000) / 10000),
    value_r2: Math.round(value.r2 * 10000) / 10000,
    value_comps: valueComps(snapshot).length,
    odds_beta: odds.beta.map((b) => Math.round(b * 10000) / 10000),
    odds_peers: oddsPeers(snapshot).length,
    odds_base_rate: Math.round(odds.baseRate * 10000) / 10000,
    value_evidence: value.evidence.map((e) => ({
      term: e.term,
      loo: Math.round(e.loo * 100) / 100,
      wf: Math.round(e.wf * 100) / 100,
      kept: e.kept,
      note: e.note,
    })),
    odds_evidence: odds.evidence.map((e) => ({
      term: e.term,
      loo: Math.round(e.loo * 1000) / 1000,
      wf: Math.round(e.wf * 1000) / 1000,
      kept: e.kept,
      note: e.note,
    })),
    range: {
      q10: Math.round(q10 * 100) / 100,
      q25: Math.round(q25 * 100) / 100,
      q75: Math.round(q75 * 100) / 100,
      q90: Math.round(q90 * 100) / 100,
      within3_loo: Math.round((value.loo.filter((e) => Math.abs(e) <= ln(3)).length / value.loo.length) * 1000) / 10,
      within3_wf: Math.round((value.wf.filter((e) => Math.abs(e) <= ln(3)).length / value.wf.length) * 1000) / 10,
      p2575_loo: Math.round((value.loo.filter((e) => e >= q25 && e <= q75).length / value.loo.length) * 1000) / 10,
      p2575_wf: Math.round((value.wf.filter((e) => e >= q25 && e <= q75).length / value.wf.length) * 1000) / 10,
      p1090_loo: Math.round((value.loo.filter((e) => e >= q10 && e <= q90).length / value.loo.length) * 1000) / 10,
      p1090_wf: Math.round((value.wf.filter((e) => e >= q10 && e <= q90).length / value.wf.length) * 1000) / 10,
    },
    kpi: {
      miss_wf: Math.round(typicalMiss(value.wf) * 100) / 100,
      miss_flat_wf: Math.round(value.flatWf * 100) / 100,
      miss_loo: Math.round(typicalMiss(value.loo) * 100) / 100,
      brier_wf: Math.round(odds.wf * 1000) / 1000,
      brier_base_wf: Math.round(odds.baseWf * 1000) / 1000,
      brier_loo: Math.round(odds.loo * 1000) / 1000,
      odds_acc_wf: Math.round(odds.wfAcc * 1000) / 1000,
      odds_acc_loo: Math.round(odds.looAcc * 1000) / 1000,
      value_kept: 2,
      value_tested: 5,
      odds_kept: 4,
      odds_tested: 6,
      worth_farming: verdicts.ROBUST ?? 0,
      skip_count: verdicts.SKIP ?? 0,
      verdicts,
    },
    accounting: accounting(snapshot, board),
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    live,
    gas: GAS_PER_TX,
  };
  return { board, radar };
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
