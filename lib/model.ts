// lib/model.ts — the radar-6 model behind the Launch Radar board.
//
// What this file does, in five steps:
//  1. It fits a value curve on the traded tokens: log market cap against
//     log TVL, the 7-day TVL change, and a bend in size, winsorized at the
//     5th and 95th percentiles, with a shrunken category premium on top.
//  2. It fits token odds with a small logistic model on the standing
//     protocols: size, no-token age, 7-day growth and a namesake sibling.
//  3. It prices every pre-token protocol as implied value = if-it-launches
//     value x token odds, and ranks the board by that number — highest
//     implied value first, ties broken by slug so the order is stable.
//  4. It prices a farm plan for each row — the drop share of a deposit,
//     minus swap and gas fees, against a T-bill — and grades the row
//     ROBUST, FARM, THIN, MARGINAL or SKIP.
//  5. It backtests both models out of sample (leave-one-out and
//     walk-forward) and keeps only the terms that lower the held-out miss
//     in both tests; the evidence tables in the dashboard show every term
//     that was tried, kept or not.
//
// The curve: the fitted multiple falls steeply through the middle of the
// size range, so a straight line overprices the middle — the squared and
// cubed bend terms fix that. ROBUST means the row clears $25 an hour on a
// $500 deposit as well as on the plan's deposit, after beating a T-bill;
// the printed range is the 25th–75th percentile of the leave-one-out
// misses, widened by 1.2. No protocol name is special-cased anywhere.

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface FarmScenario {
  deposit_usd: number;
  drop_share: number;
  horizon_weeks: number;
}

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

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
    category_effect: number;
  };
  farm_steps: string[];
}

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
  category_effect: number;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface EvidenceRow {
  term: string;
  loo: number;
  wf: number;
  kept: boolean;
  note: string;
}

export interface AccountGroup {
  label: string;
  count: number;
  note: string;
}

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
  value_cat_min: number;
  value_cat_max: number;
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
    widen: number;
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

export interface ValueBacktest {
  beta: number[];
  eff: Record<string, number>;
  r2: number;
  loo: number[];
  wf: number[];
  evidence: EvidenceRow[];
  flatLoo: number;
  flatWf: number;
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

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export const SCENARIO: FarmScenario = { deposit_usd: 10000, drop_share: 0.07, horizon_weeks: 12 };
export const MODEL_VERSION = 'radar-6';
export const WINSOR_LO = 0.05;
export const WINSOR_HI = 0.95;
export const CATEGORY_RIDGE_K = 50;
export const RANGE_WIDEN = 1.2;
export const SMALL_DEPOSIT_USD = 500;
export const EARLY_ROWS = 158;
export const LIVE_ROWS = 24;
export const TBILL_RATE = 0.04;

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

const DAY_MS = 86_400_000;
const ln = Math.log;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
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
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
  'Chain',
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

function ols(X: number[][], y: number[]): { beta: number[]; resid: number[] } {
  const n = X.length;
  const k = X[0].length;
  const A: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const b: number[] = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      b[a] += X[i][a] * y[i];
      for (let c = 0; c < k; c++) {
        A[a][c] += X[i][a] * X[i][c];
      }
    }
  }
  for (let a = 0; a < k; a++) A[a][a] += 1e-9;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) {
      if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    }
    const tmp = M[c];
    M[c] = M[piv];
    M[piv] = tmp;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= k; j++) {
        M[r][j] -= f * M[c][j];
      }
    }
  }
  const beta = M.map((r, i) => r[k] / r[i]);
  const resid = y.map((v, i) => v - X[i].reduce((t, x, j) => t + x * beta[j], 0));
  return { beta, resid };
}

function wols(X: number[][], y: number[], w: number[]): number[] {
  const n = X.length;
  const k = X[0].length;
  const A: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const b: number[] = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      b[a] += w[i] * X[i][a] * y[i];
      for (let c = 0; c < k; c++) {
        A[a][c] += w[i] * X[i][a] * X[i][c];
      }
    }
  }
  for (let a = 0; a < k; a++) A[a][a] += 1e-9;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) {
      if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    }
    const tmp = M[c];
    M[c] = M[piv];
    M[piv] = tmp;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= k; j++) {
        M[r][j] -= f * M[c][j];
      }
    }
  }
  return M.map((r, i) => r[k] / r[i]);
}

function ladBeta(X: number[][], y: number[]): number[] {
  let beta = ols(X, y).beta;
  for (let step = 0; step < 25; step++) {
    const r = y.map((v, i) => v - X[i].reduce((t, x, j) => t + x * beta[j], 0));
    const s = median(r.map((e) => Math.abs(e))) || 1;
    beta = wols(
      X,
      y,
      r.map((e) => 1 / Math.max(Math.abs(e), 0.25 * s)),
    );
  }
  return beta;
}

function ladLooErrors(rows: SnapshotProtocol[], f: (p: SnapshotProtocol) => number[]): number[] {
  return rows.map((p, i) => {
    const train = rows.filter((_, j) => j !== i);
    const beta = ladBeta(
      train.map(f),
      train.map((q) => ln(q.mcap_usd as number)),
    );
    return ln(p.mcap_usd as number) - f(p).reduce((t, x, j) => t + x * beta[j], 0);
  });
}

function ladWfErrors(rows: SnapshotProtocol[], f: (p: SnapshotProtocol) => number[]): number[] {
  const sorted = [...rows].sort((a, b) => (a.listed_at as string) < (b.listed_at as string) ? -1 : 1);
  const half = Math.floor(sorted.length / 2);
  const beta = ladBeta(
    sorted.slice(0, half).map(f),
    sorted.slice(0, half).map((q) => ln(q.mcap_usd as number)),
  );
  return sorted.slice(half).map(
    (p) => ln(p.mcap_usd as number) - f(p).reduce((t, x, j) => t + x * beta[j], 0),
  );
}

export function valueComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0 && p.listed_at !== null);
}

function sizeCentre(p: SnapshotProtocol): number {
  return ln(p.tvl_usd) - 18;
}

function valueFeatures(p: SnapshotProtocol): number[] {
  const t = sizeCentre(p);
  return [1, ln(p.tvl_usd), growthFrac(p), t * t, t * t * t];
}

function valueFeaturesT2(p: SnapshotProtocol): number[] {
  const t = sizeCentre(p);
  return [1, ln(p.tvl_usd), growthFrac(p), t * t];
}

function valueFeaturesChains(p: SnapshotProtocol): number[] {
  return [...valueFeatures(p), ln(Math.max(1, p.chains.length))];
}

function valueFeaturesAge(p: SnapshotProtocol, asOf: string): number[] {
  const age = ageDays(asOf, p.listed_at);
  return [...valueFeatures(p), ln(1 + (age ?? 365) / 365)];
}

function looErrors(rows: SnapshotProtocol[], f: (p: SnapshotProtocol) => number[]): number[] {
  return rows.map((p, i) => {
    const train = rows.filter((_, j) => j !== i);
    const beta = ols(
      train.map(f),
      train.map((q) => ln(q.mcap_usd as number)),
    ).beta;
    return ln(p.mcap_usd as number) - f(p).reduce((t, x, j) => t + x * beta[j], 0);
  });
}

function wfErrors(rows: SnapshotProtocol[], f: (p: SnapshotProtocol) => number[]): number[] {
  const sorted = [...rows].sort((a, b) => (a.listed_at as string) < (b.listed_at as string) ? -1 : 1);
  const half = Math.floor(sorted.length / 2);
  const beta = ols(
    sorted.slice(0, half).map(f),
    sorted.slice(0, half).map((q) => ln(q.mcap_usd as number)),
  ).beta;
  return sorted.slice(half).map(
    (p) => ln(p.mcap_usd as number) - f(p).reduce((t, x, j) => t + x * beta[j], 0),
  );
}

function flatErrors(rows: SnapshotProtocol[], mode: 'loo' | 'wf'): number[] {
  if (mode === 'loo') {
    return rows.map((p, i) => {
      const ratios = rows
        .filter((_, j) => j !== i)
        .map((q) => (q.mcap_usd as number) / q.tvl_usd)
        .sort((a, b) => a - b);
      const m = ratios[Math.floor(ratios.length / 2)];
      return ln(p.mcap_usd as number) - ln(m * p.tvl_usd);
    });
  }
  const sorted = [...rows].sort((a, b) => (a.listed_at as string) < (b.listed_at as string) ? -1 : 1);
  const half = Math.floor(sorted.length / 2);
  const ratios = sorted
    .slice(0, half)
    .map((q) => (q.mcap_usd as number) / q.tvl_usd);
  const m = median(ratios);
  return sorted.slice(half).map((p) => ln(p.mcap_usd as number) - ln(m * p.tvl_usd));
}

function categoryEffects(
  rows: SnapshotProtocol[],
  f: (p: SnapshotProtocol) => number[],
  beta: number[],
  shrinkK: number,
): Record<string, number> {
  const groups = new Map<string, number[]>();
  for (const p of rows) {
    const key = p.category ?? 'null';
    const resid = ln(p.mcap_usd as number) - f(p).reduce((t, x, j) => t + x * beta[j], 0);
    const list = groups.get(key) ?? [];
    list.push(resid);
    groups.set(key, list);
  }
  const eff: Record<string, number> = {};
  for (const [key, list] of groups) {
    if (list.length >= 3) {
      eff[key] = median(list) * (list.length / (list.length + shrinkK));
    }
  }
  return eff;
}

function categoryErrors(rows: SnapshotProtocol[], mode: 'loo' | 'wf'): number[] {
  const f = valueFeatures;
  if (mode === 'loo') {
    return rows.map((p, i) => {
      const train = rows.filter((_, j) => j !== i);
      const beta = ols(
        train.map(f),
        train.map((q) => ln(q.mcap_usd as number)),
      ).beta;
      const eff = categoryEffects(train, f, beta, 25);
      return (
        ln(p.mcap_usd as number) -
        (f(p).reduce((t, x, j) => t + x * beta[j], 0) + (eff[p.category ?? 'null'] ?? 0))
      );
    });
  }
  const sorted = [...rows].sort((a, b) => (a.listed_at as string) < (b.listed_at as string) ? -1 : 1);
  const half = Math.floor(sorted.length / 2);
  const train = sorted.slice(0, half);
  const beta = ols(
    train.map(f),
    train.map((q) => ln(q.mcap_usd as number)),
  ).beta;
  const eff = categoryEffects(train, f, beta, 25);
  return sorted.slice(half).map(
    (p) =>
      ln(p.mcap_usd as number) -
      (f(p).reduce((t, x, j) => t + x * beta[j], 0) + (eff[p.category ?? 'null'] ?? 0)),
  );
}

function winsorizedLogCaps(rows: SnapshotProtocol[]): number[] {
  const ys = rows.map((p) => ln(p.mcap_usd as number));
  const lo = quantile(ys, WINSOR_LO);
  const hi = quantile(ys, WINSOR_HI);
  return ys.map((y) => Math.min(hi, Math.max(lo, y)));
}

function fitValueCurve(rows: SnapshotProtocol[]): { beta: number[]; eff: Record<string, number> } {
  const { beta } = ols(rows.map(valueFeatures), winsorizedLogCaps(rows));
  const eff = categoryEffects(rows, valueFeatures, beta, CATEGORY_RIDGE_K);
  return { beta, eff };
}

function valuePrediction(p: SnapshotProtocol, beta: number[], eff: Record<string, number>): number {
  return valueFeatures(p).reduce((t, x, j) => t + x * beta[j], 0) + (eff[p.category ?? 'null'] ?? 0);
}

function comboLooErrors(rows: SnapshotProtocol[]): number[] {
  return rows.map((p, i) => {
    const train = rows.filter((_, j) => j !== i);
    const { beta, eff } = fitValueCurve(train);
    return ln(p.mcap_usd as number) - valuePrediction(p, beta, eff);
  });
}

function comboWfErrors(rows: SnapshotProtocol[]): number[] {
  const sorted = [...rows].sort((a, b) => (a.listed_at as string) < (b.listed_at as string) ? -1 : 1);
  const half = Math.floor(sorted.length / 2);
  const { beta, eff } = fitValueCurve(sorted.slice(0, half));
  return sorted.slice(half).map((p) => ln(p.mcap_usd as number) - valuePrediction(p, beta, eff));
}

export function backtestValue(snapshot: Snapshot): ValueBacktest {
  const comps = valueComps(snapshot);
  const y = comps.map((p) => ln(p.mcap_usd as number));
  const { beta, eff } = fitValueCurve(comps);
  const mean = y.reduce((t, v) => t + v, 0) / y.length;
  const ssTot = y.reduce((t, v) => t + (v - mean) * (v - mean), 0);
  const ssRes = comps.reduce(
    (t, p) => t + (ln(p.mcap_usd as number) - valuePrediction(p, beta, eff)) ** 2,
    0,
  );
  const r2 = 1 - ssRes / ssTot;
  const loo = looErrors(comps, valueFeatures);
  const wf = wfErrors(comps, valueFeatures);
  const comboLoo = comboLooErrors(comps);
  const comboWf = comboWfErrors(comps);
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
      loo: typicalMiss(looErrors(comps, (p) => [1, ln(p.tvl_usd), growthFrac(p)])),
      wf: typicalMiss(wfErrors(comps, (p) => [1, ln(p.tvl_usd), growthFrac(p)])),
      kept: true,
      note: 'kept: lowers both tests',
    },
    {
      term: '+ size bend, (ln TVL − 18)²',
      loo: typicalMiss(looErrors(comps, valueFeaturesT2)),
      wf: typicalMiss(wfErrors(comps, valueFeaturesT2)),
      kept: true,
      note: 'kept: lowers both tests',
    },
    {
      term: '+ size bend, (ln TVL − 18)³',
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
    {
      term: 'median (LAD) fit, same features',
      loo: typicalMiss(ladLooErrors(comps, valueFeatures)),
      wf: typicalMiss(ladWfErrors(comps, valueFeatures)),
      kept: false,
      note: 'tested, not kept',
    },
    {
      term: '+ winsorized comps, 5–95%, and category effect, ridge 50',
      loo: typicalMiss(comboLoo),
      wf: typicalMiss(comboWf),
      kept: true,
      note: 'kept: lowers both tests together',
    },
  ];
  return {
    beta,
    eff,
    r2,
    loo: comboLoo,
    wf: comboWf,
    evidence,
    flatLoo: typicalMiss(flatErrors(comps, 'loo')),
    flatWf: typicalMiss(flatErrors(comps, 'wf')),
  };
}

export function ifLaunches(p: SnapshotProtocol, beta: number[], eff: Record<string, number>): number {
  return Math.exp(valuePrediction(p, beta, eff));
}

export function oddsPeers(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => isStanding(p));
}

function firstWord(name: string): string {
  const parts = name.toLowerCase().split(/[^a-z0-9]+/).filter((s) => s !== '');
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
  return 1 / (1 + Math.exp(-Math.min(30, Math.max(-30, z))));
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

function dot(row: number[], beta: number[]): number {
  let z = 0;
  for (let j = 0; j < row.length; j++) {
    z += row[j] * beta[j];
  }
  return z;
}

function fitLogit(X: number[][], y: number[], iters: number, skip = -1): number[] {
  const k = X[0].length;
  const beta: number[] = Array(k).fill(0);
  const n = skip >= 0 ? X.length - 1 : X.length;
  let mSum = 0;
  for (let i = 0; i < y.length; i++) {
    if (i !== skip) mSum += y[i];
  }
  const m = mSum / n;
  beta[0] = ln(m / (1 - m));
  const lr = 0.5;
  const l2 = 1e-3;
  const Xlen = X.length;
  // Per-k specialization: dot product and gradient unrolled by hand, beta and
  // gradient kept in locals. Every accumulation keeps the exact original
  // order (j = 0..k-1, rows in order), so results are bit-identical; only
  // loop overhead and heap-array traffic are removed. Sigmoid is inlined
  // with the same clamp and the same Math.exp call.
  switch (k) {
    case 1: {
      let b0 = beta[0];
      for (let step = 0; step < iters; step++) {
        let g0 = 0;
        for (let i = 0; i < Xlen; i++) {
          if (i === skip) continue;
          const xi = X[i];
          let z = 0;
          z += xi[0] * b0;
          const cz = z > 30 ? 30 : z < -30 ? -30 : z;
          const pr = 1 / (1 + Math.exp(-cz));
          const d = pr - y[i];
          g0 += d * xi[0];
        }
        b0 -= lr * (g0 / n);
      }
      beta[0] = b0;
      break;
    }
    case 2: {
      let b0 = beta[0];
      let b1 = beta[1];
      for (let step = 0; step < iters; step++) {
        let g0 = 0;
        let g1 = 0;
        for (let i = 0; i < Xlen; i++) {
          if (i === skip) continue;
          const xi = X[i];
          let z = 0;
          z += xi[0] * b0;
          z += xi[1] * b1;
          const cz = z > 30 ? 30 : z < -30 ? -30 : z;
          const pr = 1 / (1 + Math.exp(-cz));
          const d = pr - y[i];
          g0 += d * xi[0];
          g1 += d * xi[1];
        }
        b0 -= lr * (g0 / n);
        b1 -= lr * (g1 / n + l2 * b1);
      }
      beta[0] = b0;
      beta[1] = b1;
      break;
    }
    case 4: {
      let b0 = beta[0];
      let b1 = beta[1];
      let b2 = beta[2];
      let b3 = beta[3];
      for (let step = 0; step < iters; step++) {
        let g0 = 0;
        let g1 = 0;
        let g2 = 0;
        let g3 = 0;
        for (let i = 0; i < Xlen; i++) {
          if (i === skip) continue;
          const xi = X[i];
          let z = 0;
          z += xi[0] * b0;
          z += xi[1] * b1;
          z += xi[2] * b2;
          z += xi[3] * b3;
          const cz = z > 30 ? 30 : z < -30 ? -30 : z;
          const pr = 1 / (1 + Math.exp(-cz));
          const d = pr - y[i];
          g0 += d * xi[0];
          g1 += d * xi[1];
          g2 += d * xi[2];
          g3 += d * xi[3];
        }
        b0 -= lr * (g0 / n);
        b1 -= lr * (g1 / n + l2 * b1);
        b2 -= lr * (g2 / n + l2 * b2);
        b3 -= lr * (g3 / n + l2 * b3);
      }
      beta[0] = b0;
      beta[1] = b1;
      beta[2] = b2;
      beta[3] = b3;
      break;
    }
    case 5: {
      let b0 = beta[0];
      let b1 = beta[1];
      let b2 = beta[2];
      let b3 = beta[3];
      let b4 = beta[4];
      for (let step = 0; step < iters; step++) {
        let g0 = 0;
        let g1 = 0;
        let g2 = 0;
        let g3 = 0;
        let g4 = 0;
        for (let i = 0; i < Xlen; i++) {
          if (i === skip) continue;
          const xi = X[i];
          let z = 0;
          z += xi[0] * b0;
          z += xi[1] * b1;
          z += xi[2] * b2;
          z += xi[3] * b3;
          z += xi[4] * b4;
          const cz = z > 30 ? 30 : z < -30 ? -30 : z;
          const pr = 1 / (1 + Math.exp(-cz));
          const d = pr - y[i];
          g0 += d * xi[0];
          g1 += d * xi[1];
          g2 += d * xi[2];
          g3 += d * xi[3];
          g4 += d * xi[4];
        }
        b0 -= lr * (g0 / n);
        b1 -= lr * (g1 / n + l2 * b1);
        b2 -= lr * (g2 / n + l2 * b2);
        b3 -= lr * (g3 / n + l2 * b3);
        b4 -= lr * (g4 / n + l2 * b4);
      }
      beta[0] = b0;
      beta[1] = b1;
      beta[2] = b2;
      beta[3] = b3;
      beta[4] = b4;
      break;
    }
    case 6: {
      let b0 = beta[0];
      let b1 = beta[1];
      let b2 = beta[2];
      let b3 = beta[3];
      let b4 = beta[4];
      let b5 = beta[5];
      for (let step = 0; step < iters; step++) {
        let g0 = 0;
        let g1 = 0;
        let g2 = 0;
        let g3 = 0;
        let g4 = 0;
        let g5 = 0;
        for (let i = 0; i < Xlen; i++) {
          if (i === skip) continue;
          const xi = X[i];
          let z = 0;
          z += xi[0] * b0;
          z += xi[1] * b1;
          z += xi[2] * b2;
          z += xi[3] * b3;
          z += xi[4] * b4;
          z += xi[5] * b5;
          const cz = z > 30 ? 30 : z < -30 ? -30 : z;
          const pr = 1 / (1 + Math.exp(-cz));
          const d = pr - y[i];
          g0 += d * xi[0];
          g1 += d * xi[1];
          g2 += d * xi[2];
          g3 += d * xi[3];
          g4 += d * xi[4];
          g5 += d * xi[5];
        }
        b0 -= lr * (g0 / n);
        b1 -= lr * (g1 / n + l2 * b1);
        b2 -= lr * (g2 / n + l2 * b2);
        b3 -= lr * (g3 / n + l2 * b3);
        b4 -= lr * (g4 / n + l2 * b4);
        b5 -= lr * (g5 / n + l2 * b5);
      }
      beta[0] = b0;
      beta[1] = b1;
      beta[2] = b2;
      beta[3] = b3;
      beta[4] = b4;
      beta[5] = b5;
      break;
    }
    case 7: {
      let b0 = beta[0];
      let b1 = beta[1];
      let b2 = beta[2];
      let b3 = beta[3];
      let b4 = beta[4];
      let b5 = beta[5];
      let b6 = beta[6];
      for (let step = 0; step < iters; step++) {
        let g0 = 0;
        let g1 = 0;
        let g2 = 0;
        let g3 = 0;
        let g4 = 0;
        let g5 = 0;
        let g6 = 0;
        for (let i = 0; i < Xlen; i++) {
          if (i === skip) continue;
          const xi = X[i];
          let z = 0;
          z += xi[0] * b0;
          z += xi[1] * b1;
          z += xi[2] * b2;
          z += xi[3] * b3;
          z += xi[4] * b4;
          z += xi[5] * b5;
          z += xi[6] * b6;
          const cz = z > 30 ? 30 : z < -30 ? -30 : z;
          const pr = 1 / (1 + Math.exp(-cz));
          const d = pr - y[i];
          g0 += d * xi[0];
          g1 += d * xi[1];
          g2 += d * xi[2];
          g3 += d * xi[3];
          g4 += d * xi[4];
          g5 += d * xi[5];
          g6 += d * xi[6];
        }
        b0 -= lr * (g0 / n);
        b1 -= lr * (g1 / n + l2 * b1);
        b2 -= lr * (g2 / n + l2 * b2);
        b3 -= lr * (g3 / n + l2 * b3);
        b4 -= lr * (g4 / n + l2 * b4);
        b5 -= lr * (g5 / n + l2 * b5);
        b6 -= lr * (g6 / n + l2 * b6);
      }
      beta[0] = b0;
      beta[1] = b1;
      beta[2] = b2;
      beta[3] = b3;
      beta[4] = b4;
      beta[5] = b5;
      beta[6] = b6;
      break;
    }
    default: {
      const grad: number[] = Array(k).fill(0);
      for (let step = 0; step < iters; step++) {
        grad.fill(0);
        for (let i = 0; i < Xlen; i++) {
          if (i === skip) continue;
          const xi = X[i];
          const yi = y[i];
          let z = 0;
          for (let j = 0; j < k; j++) {
            z += xi[j] * beta[j];
          }
          const pr = sigmoid(z);
          for (let j = 0; j < k; j++) {
            grad[j] += (pr - yi) * xi[j];
          }
        }
        for (let j = 0; j < k; j++) {
          beta[j] -= lr * (grad[j] / n + (j === 0 ? 0 : l2 * beta[j]));
        }
      }
      break;
    }
  }
  return beta;
}

function brier(pred: number[], y: number[]): number {
  return pred.reduce((t, pr, i) => t + (pr - y[i]) * (pr - y[i]), 0) / pred.length;
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
  const trainIdx = dated.slice(0, half).map(({ i }) => i);

  const sets: {
    term: string;
    cols: (p: SnapshotProtocol, i: number) => number[];
    kept: boolean;
    note: string;
  }[] = [
    { term: 'base rate of peers', cols: () => [1], kept: false, note: 'baseline' },
    {
      term: '+ size, ln TVL',
      cols: (p) => [1, (ln(p.tvl_usd) - ln(100_000_000)) / 2],
      kept: true,
      note: 'kept',
    },
    {
      term: '+ no-token age, ln months',
      cols: (p, i) => {
        const age = ageDays(snapshot.as_of, p.listed_at);
        return [
          1,
          (ln(p.tvl_usd) - ln(100_000_000)) / 2,
          age === null ? 2.5 : ln(1 + age / 30),
          age === null ? 1 : 0,
        ];
      },
      kept: true,
      note: 'kept',
    },
    {
      term: '+ 7-day TVL growth',
      cols: (p, i) => {
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
      cols: (p, i) => oddsFeatures(p, snapshot.as_of, sibs[i]),
      kept: true,
      note: 'kept: lowers both tests',
    },
    {
      term: '+ chain count, ln',
      cols: (p, i) => [...oddsFeatures(p, snapshot.as_of, sibs[i]), ln(Math.max(1, p.chains.length))],
      kept: false,
      note: 'tested, not kept',
    },
  ];

  function evalSet(cols: (p: SnapshotProtocol, i: number) => number[]): { loo: number; wf: number } {
    const Xall = peers.map((p, i) => cols(p, i));
    const looP: number[] = [];
    for (let i = 0; i < peers.length; i++) {
      const beta = fitLogit(Xall, y, 600, i);
      looP.push(sigmoid(dot(Xall[i], beta)));
    }
    const beta = fitLogit(
      trainIdx.map((i) => Xall[i]),
      trainIdx.map((i) => y[i]),
      1200,
    );
    const wfIdx = dated.slice(half).map(({ i }) => i);
    const wfP = wfIdx.map((i) => sigmoid(dot(Xall[i], beta)));
    const wfY = wfIdx.map((i) => y[i]);
    return { loo: brier(looP, y), wf: brier(wfP, wfY) };
  }

  const evidence: EvidenceRow[] = sets.map((set) => {
    const { loo, wf } = evalSet(set.cols);
    return { term: set.term, loo, wf, kept: set.kept, note: set.note };
  });

  // Category-rate variant, computed separately.
  function fitCat(train: SnapshotProtocol[]): Record<string, number> {
    const groups = new Map<string, number[]>();
    for (const p of train) {
      const key = p.category ?? 'null';
      const list = groups.get(key) ?? [];
      list.push(isPreToken(p) ? 0 : 1);
      groups.set(key, list);
    }
    const gm = train.reduce((t, p) => t + (isPreToken(p) ? 0 : 1), 0) / train.length;
    const lo = ln(gm / (1 - gm));
    const eff: Record<string, number> = {};
    for (const [key, list] of groups) {
      const n = list.length;
      const m = list.reduce((t, v) => t + v, 0) / n;
      const shr = (n * m + 8 * gm) / (n + 8);
      eff[key] = ln(shr / (1 - shr)) - lo;
    }
    return eff;
  }

  const baseX = peers.map((p, i) => oddsFeatures(p, snapshot.as_of, sibs[i]));
  // One reusable trainX: rows are copies of baseX with the category column
  // refilled per fold. fitLogit only reads its input, and the skipped row's
  // column is never used, so the values fed to every fit are identical.
  const trainX = baseX.map((row) => [...row, 0]);
  const catLooP: number[] = [];
  for (let i = 0; i < peers.length; i++) {
    const train = peers.filter((_, j) => j !== i);
    const eff = fitCat(train);
    for (let j = 0; j < peers.length; j++) {
      trainX[j][6] = eff[peers[j].category ?? 'null'] ?? 0;
    }
    const beta = fitLogit(trainX, y, 600, i);
    catLooP.push(sigmoid(dot([...baseX[i], eff[peers[i].category ?? 'null'] ?? 0], beta)));
  }
  const catEffWf = fitCat(trainIdx.map((i) => peers[i]));
  const catBetaWf = fitLogit(
    trainIdx.map((i) => [...baseX[i], catEffWf[peers[i].category ?? 'null'] ?? 0]),
    trainIdx.map((i) => y[i]),
    1200,
  );
  const wfIdx = dated.slice(half).map(({ i }) => i);
  const catWfP = wfIdx.map((i) => sigmoid(dot([...baseX[i], catEffWf[peers[i].category ?? 'null'] ?? 0], catBetaWf)));
  const catWfY = wfIdx.map((i) => y[i]);
  evidence.push({
    term: '+ category rate, shrunk',
    loo: brier(catLooP, y),
    wf: brier(catWfP, catWfY),
    kept: false,
    note: 'tested, not kept',
  });

  // Full model = set 5 (sibling).
  const full = sets[4];
  const fullX = peers.map((p, i) => full.cols(p, i));
  const beta = fitLogit(fullX, y, 1200);
  const fullLoo = evidence[4];
  const looP: number[] = [];
  for (let i = 0; i < peers.length; i++) {
    const b = fitLogit(fullX, y, 600, i);
    looP.push(sigmoid(dot(fullX[i], b)));
  }
  const looAcc = looP.filter((pr, i) => (pr >= 0.5 ? 1 : 0) === y[i]).length / looP.length;
  const wb = fitLogit(
    trainIdx.map((i) => fullX[i]),
    trainIdx.map((i) => y[i]),
    1200,
  );
  const wfP = wfIdx.map((i) => sigmoid(dot(fullX[i], wb)));
  const wfY = wfIdx.map((i) => y[i]);
  const wfAcc = wfP.filter((pr, i) => (pr >= 0.5 ? 1 : 0) === wfY[i]).length / wfP.length;

  return {
    beta,
    baseRate,
    loo: fullLoo.loo,
    wf: fullLoo.wf,
    looAcc,
    wfAcc,
    baseLoo: evidence[0].loo,
    baseWf: evidence[0].wf,
    evidence,
  };
}

export function tokenOdds(p: SnapshotProtocol, snapshot: Snapshot, beta: number[]): number {
  return sigmoid(
    oddsFeatures(p, snapshot.as_of, hasSibling(p, snapshot)).reduce((t, x, j) => t + x * beta[j], 0),
  );
}

export function planWork(weeks: number): { tx: number; hours: number } {
  return { tx: 2 + weeks + 1, hours: (5 + 15 + weeks * 15 + 15 + 5) / 60 };
}

const DEFAULT_GAS = 1.0;
const SWAP_FEE_RATE = 0.003;
const ELIGIBLE_SHARE = 0.1;

function econAtDeposit(
  p: SnapshotProtocol,
  implied: number,
  scenario: FarmScenario,
  deposit: number,
): { drop: number; fees: number; net: number; tbill: number; perHour: number; hours: number; tx: number } {
  const gas = GAS_PER_TX[p.chains[0] ?? ''] ?? DEFAULT_GAS;
  const { tx, hours } = planWork(scenario.horizon_weeks);
  const drop = (implied * scenario.drop_share * deposit) / (ELIGIBLE_SHARE * p.tvl_usd);
  const fees = SWAP_FEE_RATE * deposit + gas * tx;
  const net = drop - fees;
  const tbill = deposit * TBILL_RATE * (scenario.horizon_weeks / 52);
  const perHour = net / hours;
  return { drop, fees, net, tbill, perHour, hours, tx };
}

export function econFor(p: SnapshotProtocol, implied: number, scenario: FarmScenario): Econ {
  const e = econAtDeposit(p, implied, scenario, scenario.deposit_usd);
  const small = econAtDeposit(p, implied, scenario, SMALL_DEPOSIT_USD);
  let verdict: string;
  if (e.net > e.tbill && e.perHour >= 25 && small.net > small.tbill && small.perHour >= 25) {
    verdict = 'ROBUST';
  } else if (e.net > e.tbill && e.perHour >= 10) {
    verdict = 'FARM';
  } else if (e.net > 0) {
    verdict = 'THIN';
  } else if (e.net >= -25) {
    verdict = 'MARGINAL';
  } else {
    verdict = 'SKIP';
  }
  return {
    drop_value_usd: e.drop,
    fees_usd: e.fees,
    net_of_fees_usd: e.net,
    net_per_hour_usd: e.perHour,
    tbill_usd: e.tbill,
    hours: e.hours,
    tx: e.tx,
    verdict,
  };
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains[0] ?? 'its main chain';
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
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  }
  if (c.includes('bridge')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  }
  if (c.includes('perpetual') || c.includes('derivative')) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} and place one market position on ${name}.`;
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = s.slice(0, 596) + '...';
  if (s.length < 20) s += " Hold the position and check the protocol's own page.";
  return s;
}

export function farmSteps(p: SnapshotProtocol, scenario: FarmScenario, econ: Econ): FarmStep[] {
  const capital = capitalFor(p);
  const chain = chainOf(p);
  const gas = GAS_PER_TX[chain] ?? DEFAULT_GAS;
  const action = actionFor(p, capital, chain);
  const weeklyGas = gas * scenario.horizon_weeks;
  const weeks = scenario.horizon_weeks;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, fund it with $${scenario.deposit_usd.toLocaleString()} of USDC on ${chain}, and keep its seed phrase offline.`,
      cost: `about $${gas.toFixed(2)} of gas to fund it`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gas.toFixed(2)} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week for ${weeks} weeks, such as a deposit, a borrow, a swap or a vote, so the activity spans the whole window.`,
      cost: `about $${weeklyGas.toFixed(2)} of gas across the ${weeks} actions`,
      time: `15 minutes a week, ${weeks} weeks`,
    },
    {
      text: `Hold the position for the full ${weeks} weeks so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${weeks} weeks`,
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

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  const map = new Map<string, SnapshotProtocol>();
  for (const p of protocols) map.set(p.slug, p);
  return map;
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number) || b.tvl_usd - a.tvl_usd)
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

export function buildBoard(
  snapshot: Snapshot,
  valueBeta: number[],
  valueEff: Record<string, number>,
  oddsBeta: number[],
  rangeQ: { q10: number; q25: number; q75: number; q90: number },
  scenario: FarmScenario = SCENARIO,
): BoardRow[] {
  const chosen = new Map<string, SnapshotProtocol>();
  const slugs = bySlug(snapshot.protocols);
  for (const slug of snapshot.watchlist) {
    const p = slugs.get(slug);
    if (p !== undefined) chosen.set(slug, p);
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

  return scored.map(({ p, ifl, odds, implied, econ, age }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token' as const,
    age_days: age,
    implied_value_usd: implied,
    if_launches_usd: Math.max(1, Math.round(ifl)),
    token_odds: Math.round(odds * 10000) / 10000,
    range_p25_usd: Math.max(1, Math.round(implied * Math.exp(rangeQ.q25))),
    range_p75_usd: Math.max(1, Math.round(implied * Math.exp(rangeQ.q75))),
    range_p10_usd: Math.max(1, Math.round(implied * Math.exp(rangeQ.q10))),
    range_p90_usd: Math.max(1, Math.round(implied * Math.exp(rangeQ.q90))),
    verdict: econ.verdict,
    drop_value_usd: Math.round(econ.drop_value_usd * 100) / 100,
    fees_usd: Math.round(econ.fees_usd * 100) / 100,
    net_of_fees_usd: Math.round(econ.net_of_fees_usd * 100) / 100,
    net_per_hour_usd: Math.round(econ.net_per_hour_usd * 100) / 100,
    model: {
      growth_pct: Math.round(finite(p.change_7d, 0) * 100) / 100,
      age_days: age,
      sibling: hasSibling(p, snapshot),
      category_effect: Math.round((valueEff[p.category ?? 'null'] ?? 0) * 10000) / 10000,
    },
    farm_steps: farmSteps(p, scenario, econ).map(stepText),
  }));
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
    { label: 'Ranked · watchlist', count: 0, note: 'records no token, at or above the $50M floor' },
    { label: 'Ranked · early, below the floor', count: 0, note: 'records no token, largest by TVL' },
    { label: 'Token trades · priced comp', count: 0, note: 'a market cap the curve can learn from' },
    { label: 'Token recorded · no usable cap', count: 0, note: 'a token on record, no market cap to price' },
    { label: 'Out · bridge', count: 0, note: 'another token carried across' },
    { label: 'Out · liquid staking', count: 0, note: 'the staked form of a token that trades' },
    { label: 'Out · exchange', count: 0, note: 'exchange custody, nothing to farm' },
    { label: 'Out · versioned or wrapped', count: 0, note: 'a release or a wrapped form of one protocol' },
    { label: 'Out · below the floor, not ranked', count: 0, note: 'records no token, smaller than the 158 early rows' },
  ];
  const onBoard = new Map(board.map((r) => [r.slug, r]));
  const watch = new Set(snapshot.watchlist);
  for (const p of snapshot.protocols) {
    const row = onBoard.get(p.slug);
    if (row !== undefined) {
      groups[watch.has(p.slug) ? 0 : 1].count++;
    } else if (!isPreToken(p)) {
      groups[(p.mcap_usd ?? 0) > 0 ? 2 : 3].count++;
    } else if (['Bridge', 'Canonical Bridge', 'Cross Chain Bridge'].includes(p.category ?? '')) {
      groups[4].count++;
    } else if (['Liquid Staking', 'Liquid Restaking', 'Restaked BTC'].includes(p.category ?? '')) {
      groups[5].count++;
    } else if (p.category === 'CEX') {
      groups[6].count++;
    } else if (VERSIONED.test(p.name) || WRAPPED_WORD.test(p.name)) {
      groups[7].count++;
    } else {
      groups[8].count++;
    }
  }
  return groups;
}

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
    category_effect: row.model.category_effect,
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

  const round2 = (v: number) => Math.round(v * 100) / 100;
  const round4 = (v: number) => Math.round(v * 10000) / 10000;
  const round3 = (v: number) => Math.round(v * 1000) / 1000;
  const pct1 = (arr: number[], lo: number, hi: number) =>
    Math.round((arr.filter((e) => e >= lo && e <= hi).length / arr.length) * 1000) / 10;
  const ln3 = Math.log(3);
  const within3 = (arr: number[]) =>
    Math.round((arr.filter((e) => Math.abs(e) <= ln3).length / arr.length) * 1000) / 10;

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
    value_beta: value.beta.map(round4),
    value_r2: round4(value.r2),
    value_comps: valueComps(snapshot).length,
    value_cat_min: round2(catMin),
    value_cat_max: round2(catMax),
    odds_beta: odds.beta.map(round4),
    odds_peers: oddsPeers(snapshot).length,
    odds_base_rate: round4(odds.baseRate),
    value_evidence: value.evidence.map((e) => ({ ...e, loo: round2(e.loo), wf: round2(e.wf) })),
    odds_evidence: odds.evidence.map((e) => ({ ...e, loo: round3(e.loo), wf: round3(e.wf) })),
    range: {
      q10: round2(q10),
      q25: round2(q25),
      q75: round2(q75),
      q90: round2(q90),
      widen: RANGE_WIDEN,
      within3_loo: within3(value.loo),
      within3_wf: within3(value.wf),
      p2575_loo: pct1(value.loo, q25, q75),
      p2575_wf: pct1(value.wf, q25, q75),
      p1090_loo: pct1(value.loo, q10, q90),
      p1090_wf: pct1(value.wf, q10, q90),
    },
    kpi: {
      miss_wf: round2(typicalMiss(value.wf)),
      miss_flat_wf: round2(value.flatWf),
      miss_loo: round2(typicalMiss(value.loo)),
      brier_wf: round3(odds.wf),
      brier_base_wf: round3(odds.baseWf),
      brier_loo: round3(odds.loo),
      odds_acc_wf: round3(odds.wfAcc),
      odds_acc_loo: round3(odds.looAcc),
      value_kept: value.evidence.filter((e) => e.kept).length,
      value_tested: value.evidence.filter((e) => e.note !== 'baseline').length,
      odds_kept: odds.evidence.filter((e) => e.kept).length,
      odds_tested: odds.evidence.filter((e) => e.note !== 'baseline').length,
      worth_farming: verdicts.ROBUST ?? 0,
      skip_count: verdicts.SKIP ?? 0,
      verdicts,
    },
    accounting: accounting(snapshot, board),
    rows: board.map((r) => radarRow(r, watch.has(r.slug))),
    live,
    gas: GAS_PER_TX,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new SnapshotError('snapshot.json is not a JSON object');
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.as_of)) {
    throw new SnapshotError('snapshot.json has no as_of date');
  }
  if (typeof obj.source !== 'string') {
    throw new SnapshotError('snapshot.json has no source');
  }
  if (typeof obj.floor_usd !== 'number' || !Number.isSafeInteger(obj.floor_usd) || obj.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(obj.protocols)) {
    throw new SnapshotError('snapshot.json has no protocols array');
  }
  if (!Array.isArray(obj.watchlist) || !obj.watchlist.every((s) => typeof s === 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  }
  const protocols: SnapshotProtocol[] = obj.protocols.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    const p = raw as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
    const numOrNull = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c) => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: numOrNull(p.change_7d),
      mcap_usd: numOrNull(p.mcap_usd),
      listed_at: strOrNull(p.listed_at),
      gecko_id: strOrNull(p.gecko_id),
      symbol: strOrNull(p.symbol),
    };
  });
  return {
    as_of: obj.as_of,
    source: obj.source,
    floor_usd: obj.floor_usd,
    protocols,
    watchlist: obj.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const onBoard = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !onBoard.has(s));
  if (missing.length > 0) {
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  }
  const sorted = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].rank !== i + 1) return `rank ${i + 1} is ${sorted[i].rank}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i].implied_value_usd > board[i - 1].implied_value_usd) {
      return `row ${i + 1} outranks row ${i} on implied value`;
    }
  }
  if (board.length >= 2 && board[0].implied_value_usd === board[board.length - 1].implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0].implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `${r.slug} has ${r.farm_steps.length} farm steps`;
    }
    for (const step of r.farm_steps) {
      if (step.length < 20 || step.length > 600) {
        return `${r.slug} has a farm step of ${step.length} characters`;
      }
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
