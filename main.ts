// A token-radar-01 entry, v3b (Node 22, standard library only).
//
// What it does, end to end: read the sealed snapshot from /input/snapshot.json (or
// --input <file|dir>), fit the comps model in lib/model.ts — nineteen curve variants are
// tested at run time and the gate picks the ship (see the model's header for the verdict:
// no variant cleared all three gates, so the v1 curve ships and the page says so) —
// score every pre-token protocol, write the ranked board to /output/board.json, write the
// dashboard's data beside the page as /output/data.js, and copy this repository's
// dashboard/ and screenshots/ to /output. Last, it writes /output/dossier.json, the
// summary the judge reads, with the vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html,
// dashboard/app.css and dashboard/app.js read /output/data.js, which this program writes
// from the same board, so the page and the board can never disagree.
//
// v3b verification, 2026-11-16 (run twice into fresh dirs, diff -r clean):
//   board 198 rows, ranks 1-198 contiguous, watchlist 40/40 covered, every row >=6
//   farm steps, verdicts ROBUST 77 / FARM 59 / THIN 40 / SKIP 22 (176/198 pay);
//   dashboard 3 files / 50,261 bytes, no network references; screenshots 3 PNGs,
//   208-230 KB each; dossier 952,051 bytes, text 50,525 bytes (cap 65,536).
//   `makefun check` passes competition_open, snapshot, license_osi, entrypoint;
//   transcripts_present fails only because no transcripts are bundled in this build
//   session (bundled at submit time). Screenshots verified by looking: the first
//   viewport holds the formula, blind check, curve, Farm Next rail, KPI strip, Farm
//   Next strip and table header. Hermes (via 9Router) agreed with the ship decision,
//   the $0.50 Ethereum gas correction and the strip-over-resort choice.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// The program is strict, as the starter's main.ts is: a missing dashboard, fewer than 3
// screenshots, a stale data.js left in a reused output directory, or a board the gate
// refuses are all failures (exit non-zero), and dossier.json is written only on a
// successful run. The program runs twice in grading and both runs must write the same
// bytes: every fit is deterministic (seeded bootstrap, sorted ties), so they do.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRadar, boardIssue, dataScript, fitComps, parseSnapshot, shippedEcon } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const fit = fitComps(snapshot);
const { board, radar } = buildRadar(snapshot, fit);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));

// Guard: the dashboard must never carry a data.js of its own. main.ts writes the fresh
// data.js beside the page; a data.js inside the copied dashboard would be a stale mock from
// an earlier run in a reused output directory, and it would eat the dossier's text cap while
// the page read mock numbers. Refuse a reused output directory instead of shipping it.
if (existsSync(join(out, 'dashboard', 'data.js'))) {
  process.stderr.write('token radar: a stale dashboard/data.js sits in the output directory: hand in from a fresh output directory, never a reused one\n');
  process.exit(1);
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
// It needs a dashboard and at least three screenshots (the board, a detail view, a filtered
// view); without them the hand-in is incomplete, so fail loudly instead of warning.
if (dashFiles.length === 0) {
  process.stderr.write('token radar: dashboard/ is missing in this repository: cannot hand in a dashboard\n');
  process.exit(1);
}
if (shots.length < 3) {
  process.stderr.write(
    `token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`,
  );
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}
const dossierText = buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } });
writeFileSync(join(out, 'dossier.json'), dossierText);
const dossierBytes = statSync(join(out, 'dossier.json')).size;
// buildDossier returns bytes, not a string: decode before reading its `text` field.
const dossierTextBytes = Buffer.byteLength(JSON.parse(new TextDecoder().decode(dossierText)).text ?? '', 'utf8');

// The run's receipts, one line each: what was scored, what curve shipped and why, what the
// variant test found, and what the farm economics say under the shipped table. The last
// line is the gate shape in one place, so a bad run is obvious from the log alone.
const econ = shippedEcon();
const bestLoo = Math.min(...fit.variant_test.map((v) => v.loo_miss));
const pay = radar.counts.robust + radar.counts.farm + radar.counts.thin;
const boardSlugs = new Set(board.map((r) => r.slug));
const watchCovered = snapshot.watchlist.filter((s) => boardSlugs.has(s)).length;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols (${radar.counts.pre_token} pre-token, ${radar.counts.traded} record a token, ${radar.counts.set_aside} set aside), ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${board.length - snapshot.watchlist.length} early, ${radar.live.length} live shown of ${radar.counts.traded} that record a token)\n` +
    `token radar: variant '${fit.variant_id}' ships (${fit.variant_label}) — ship_ok=${fit.ship_ok}: fit log10(mcap) = ${fit.a} + ${fit.b}*log10(TVL)${fit.breadth_enabled ? ` + ${fit.c}*log10(min(chains,10))` : ''}${fit.momentum_enabled ? ` + ${fit.d}*clamp(change_7d,-60,120)/100` : ''}, R2=${fit.r2}, ${fit.n_families} families fitted (${fit.n_dead_excluded} dead tokens excluded); shrinkage K=${fit.shrink_k} tuned by LOO over {${fit.spec.kGrid.join(',')}}; LOO median miss x${fit.loo.median_miss} vs flat x${fit.loo.flat_median_miss}; time-split x${fit.timesplit.median_miss} vs flat x${fit.timesplit.flat_median_miss}\n` +
    `token radar: variant test (${fit.variant_test.length} variants, best honest LOO x${bestLoo}): ${fit.variant_test.map((v) => `${v.id} LOO x${v.loo_miss}/TS x${v.ts_miss}/SKIP ${v.skip}`).join('; ')}\n` +
    `token radar: econ '${econ.id}' (${econ.label}): plans that pay ${pay}/${board.length} — ROBUST ${radar.counts.robust} (pay even at the band low end) / FARM ${radar.counts.farm} / THIN ${radar.counts.thin} / SKIP ${radar.counts.skip}; early finds ${radar.counts.early_finds} off-watchlist (new <=180d or rising 7d); set aside ${radar.counts.set_aside} pre-token protocols not ranked\n` +
    `token radar: econ test under the shipped curve: ${fit.econ_test.map((e) => `${e.id} SKIP ${e.skip}`).join('; ')}\n` +
    `token radar: robustness is keyed to the P25 low end (x${fit.band50[0]} of implied); at the P10 low end (x${fit.band80[0]}) no plan on the board pays, and each row still carries its P10 net\n` +
    `token radar: gate shape: ${board.length} rows, ranks 1-${board.length}, watchlist ${watchCovered}/${snapshot.watchlist.length} covered, ${board.filter((r) => r.farm_steps.length >= 6).length}/${board.length} rows with >=6 farm steps, dossier ${dossierBytes} bytes (text ${dossierTextBytes} of ${TEXT_MAX_BYTES} max), dashboard ${dashFiles.length} files, screenshots ${shots.length}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')} (${dossierBytes} bytes)\n`,
);
