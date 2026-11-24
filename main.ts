// Launch Radar: Node 22, stdlib only. Reads the sealed snapshot from
// /input/snapshot.json (or --input <file|dir>), fits model radar-7 in
// lib/model.ts, writes the ranked board to /output/board.json, the
// dashboard data to /output/data.js, copies dashboard/ and screenshots/
// to /output, and writes /output/dossier.json with the vendored library.
// Outside the grader container, MAKEFUN_OUTPUT_DIR replaces /output.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const flag = `--${name}`;
  const i = process.argv.indexOf(flag);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  return fallback;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  console.error(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  console.error(`token radar: the model wrote a board the gate refuses: ${issue}`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  console.error(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    console.error(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
    process.exit(1);
  }
}
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));
console.log(`token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)`);
console.log(`token radar: value LOO x${radar.kpi.miss_loo} walk-forward x${radar.kpi.miss_wf}, odds Brier LOO ${radar.kpi.brier_loo} walk-forward ${radar.kpi.brier_wf}, worth farming ${radar.kpi.worth_farming} of ${board.length}, SKIP ${radar.kpi.skip_count}`);
console.log(`token radar: wrote ${out}/board.json, ${out}/data.js, ${out}/dashboard (3 files), ${out}/screenshots (${shots.length} images) and ${out}/dossier.json`);
