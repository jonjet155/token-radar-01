// A token-radar-01 entry (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), fits
// the comps model in lib/model.ts on the snapshot's traded token families, scores every
// pre-token protocol, writes the ranked board to /output/board.json, writes the dashboard's
// data beside the page as /output/data.js, and copies this repository's dashboard/ and
// screenshots/ to /output. Last, it writes /output/dossier.json, the summary the judge reads,
// with the vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html, dashboard/app.css
// and dashboard/app.js read /output/data.js, which this program writes from the same board.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// NOTE (v2): dashboard/ and screenshots/ are in this repository now, so the program is
// strict again, as the starter's main.ts is: a missing dashboard or fewer than 3 screenshots
// is a failure (exit non-zero), and dossier.json is always written on a successful run.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, fitComps, parseSnapshot } from './lib/model.ts';
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

// Guard (v2): the dashboard must never carry a data.js of its own. main.ts writes the fresh
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
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));
const dossierWritten = true;
const dossierBytes = statSync(join(out, 'dossier.json')).size;

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${board.length - snapshot.watchlist.length} early, ${radar.live.length} live set aside)\n` +
    `token radar: fit log10(mcap) = ${fit.a} + ${fit.b}*log10(TVL), R2=${fit.r2}, ${fit.n_families} families (${fit.n_dead_excluded} dead tokens excluded); LOO median miss x${fit.loo.median_miss} vs flat x${fit.loo.flat_median_miss}; time-split x${fit.timesplit.median_miss} vs flat x${fit.timesplit.flat_median_miss}\n` +
    `token radar: verdicts FARM ${radar.counts.farm} / THIN ${radar.counts.thin} / SKIP ${radar.counts.skip}; wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images)${dossierWritten ? ` and ${join(out, 'dossier.json')} (${dossierBytes} bytes)` : ' (no dossier.json yet)'}\n`,
);
