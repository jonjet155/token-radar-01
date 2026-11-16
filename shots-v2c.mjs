// Render + verify the v2c token radar dashboard FROM an /output dir (never the repo dashboard/).
// Usage: OUT_DIR=/tmp/v2c-out1 NODE_PATH=~/workspace/tools/playwright/node_modules node shots-v2c.mjs
// Writes the three screenshots into this repo's screenshots/ (1-board, 2-detail, 3-filtered).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT_DIR || '/tmp/v2c-out1';
const SHOTS = '/home/hatch/workspace/makefun/token-radar-01-repo/screenshots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/home/hatch/workspace/tools/playwright/chrome-linux64/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', (r) => errors.push('REQFAIL: ' + r.url()));

await page.goto(`file://${OUT}/dashboard/index.html`, { waitUntil: 'load' });
await page.waitForTimeout(900);

const grab = async (label, fn) => {
  const v = await page.evaluate(fn);
  console.log(label + ': ' + JSON.stringify(v));
  return v;
};

console.log('consoleErrors(collected): ' + JSON.stringify(errors));
await grab('tabs', () => [...document.querySelectorAll('.tabs button')].map((b) => b.textContent.trim()));
await grab('payline', () => document.querySelector('.payline')?.textContent.replace(/\s+/g, ' ').trim());
await grab('boardRows', () => document.querySelectorAll('table.grid tbody tr').length);
await grab('boardHeaders', () => [...document.querySelectorAll('table.grid thead th')].map((th) => th.textContent.trim()));
await grab('firstRowVerdict', () => {
  const tr = document.querySelector('table.grid tbody tr');
  return [...tr.querySelectorAll('td')].map((td) => td.textContent.replace(/\s+/g, ' ').trim());
});

// Detail view: click rank 1, check break-even + breadth-dropped lines, screenshot.
await grab('clickRank1', () => { document.querySelector('table.grid tbody tr').click(); return null; });
await page.waitForTimeout(500);
await grab('detailHead', () => document.querySelector('.detail .dhead')?.textContent.replace(/\s+/g, ' ').trim());
await grab('detailBreadth', () => {
  const d = document.querySelector('.detail');
  return [...d.querySelectorAll('.mult td')].map((n) => n.textContent).find((t) => t.includes('Breadth'));
});
await grab('detailBreakEven', () => {
  const d = document.querySelector('.detail');
  return [...d.querySelectorAll('.note')].map((n) => n.textContent).find((t) => t.includes('Break-even'));
});
await page.screenshot({ path: `${SHOTS}/2-detail.png` });
console.log('shot 2-detail.png saved');
await page.evaluate(() => document.querySelector('#dclose')?.click());
await page.waitForTimeout(300);

// Early finds tab: verify count and rows, then back to board for shot 1.
await grab('openEarlyTab', () => {
  [...document.querySelectorAll('.tabs button')].find((b) => b.textContent.includes('Early finds')).click();
  return null;
});
await page.waitForTimeout(500);
await grab('earlyRows', () => document.querySelectorAll('table.grid tbody tr').length);
await grab('earlyFirstWhy', () => document.querySelector('table.grid tbody tr td:nth-child(10)')?.textContent.trim());
await grab('backToBoard', () => {
  [...document.querySelectorAll('.tabs button')].find((b) => b.textContent.includes('No token yet')).click();
  return null;
});
await page.waitForTimeout(400);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}/1-board.png` });
console.log('shot 1-board.png saved');

// Filtered view: verdict = ROBUST shows the new tier.
await page.evaluate(() => {
  const sel = document.querySelector('#fv');
  sel.value = 'ROBUST';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(500);
await grab('filteredCount', () => document.querySelector('#fcnt')?.textContent);
await grab('filteredRows', () => document.querySelectorAll('table.grid tbody tr').length);
await page.evaluate(() => document.querySelector('.filters')?.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}/3-filtered.png` });
console.log('shot 3-filtered.png saved');
await browser.close();
console.log('DONE');
