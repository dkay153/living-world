// Trusted launcher copied separately from candidate source. Runs ONLY inside the VM.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection } from 'node:net';

const input = 'C:\\LivingWorldInput', output = 'C:\\LivingWorldOutput', data = 'C:\\LivingWorldData';
const wait = ms => new Promise(done => setTimeout(done, ms));
const report = { version: 1, kind: 'sandbox_visual_review', capturedAt: new Date().toISOString(), promotionAuthority: false, checks: { passed: false }, limitations: ['VM exports are untrusted observations, not independent promotion evidence.', 'This slice serves the legacy canvas client; candidate React builds and Godot exports are not yet supported.', 'The disposable world is discarded when Windows Sandbox closes.'] };
let server, browser;
async function canConnect(host) {
  return new Promise(done => {
    const socket = createConnection({host, port: 443});
    const finish = result => { socket.destroy(); done(result); };
    socket.once('connect', () => finish(true)); socket.once('error', () => finish(false)); socket.setTimeout(2000, () => finish(false));
  });
}
try {
  await mkdir(data, { recursive: true });
  const manifest = JSON.parse(await readFile(join(input, 'manifest.json'), 'utf8'));
  report.inputHash = manifest.inputHash;
  let readOnly = false;
  try { await writeFile(join(input, 'write-canary.txt'), 'must be denied'); } catch (error) { readOnly = ['EACCES','EPERM','EROFS'].includes(error.code); }
  const egressBlocked = !await canConnect('1.1.1.1');
  report.preflight = { readOnlyInput: readOnly, egressBlocked, productionMapped: false };
  if (!readOnly || !egressBlocked) throw new Error('Isolation preflight failed; candidate was not started');
  server = spawn(join(input, 'node.exe'), ['server/index.js'], { cwd: join(input, 'project'), env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP, HOST: '127.0.0.1', PORT: '3000', DATA_DIR: data, BACKUP_DIR: join(data,'backups'), PUBLIC_ORIGIN: 'http://127.0.0.1:3000', WORLD_FIXTURE: 'micro' }, stdio: ['ignore','ignore','ignore'], windowsHide: true });
  server.once('error', error => { report.serverError = error.message; });
  let healthy = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { healthy = (await fetch('http://127.0.0.1:3000/healthz', { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (healthy) break;
    await wait(200);
  }
  if (!healthy) throw new Error('Disposable Realm did not start');
  browser = await chromium.launch({ executablePath: join(input, 'browser', 'chrome.exe'), headless: false });
  const context = await browser.newContext({ viewport: { width:1280, height:800 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3000/legacy/');
  await page.waitForFunction(() => document.querySelector('#connection')?.textContent === 'WORLD ONLINE', { timeout: 20000 });
  await page.screenshot({ path: join(output, 'desktop.png'), fullPage: true });
  report.desktop = await page.evaluate(() => ({ connected: document.querySelector('#connection')?.textContent === 'WORLD ONLINE', canvasLabel: document.querySelector('#world')?.getAttribute('aria-label'), overflow: document.documentElement.scrollWidth > innerWidth }));
  await page.setViewportSize({ width:390, height:844 });
  await page.screenshot({ path: join(output, 'mobile.png'), fullPage: true });
  report.mobile = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth }));
  await page.setViewportSize({ width:1280, height:800 });
  report.checks = { passed: report.desktop.connected && !!report.desktop.canvasLabel && !report.desktop.overflow && !report.mobile.overflow };
  await writeFile(join(output,'report.json'), JSON.stringify(report,null,2));
  console.log('Sandbox ready. Play in Chromium; close the browser or VM when finished.');
  await new Promise(done => browser.once('disconnected', done));
} catch (error) {
  report.error = error.message;
  await writeFile(join(output,'report.json'), JSON.stringify(report,null,2));
  await browser?.close();
  process.exitCode = 1;
} finally { server?.kill(); }
