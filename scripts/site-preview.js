import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { openStore } from '../server/store.js';
import { createOwnerTicket } from '../server/owner-auth.js';
import { stopProcess } from '../server/codex-process.js';

// An application preview of trusted project source, not a candidate execution sandbox.
const root = resolve('.'), workspace = resolve('outputs/site-preview');
const dataDir = join(workspace, 'data'), port = Number(process.env.PREVIEW_PORT || 3100);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');
if (process.argv.slice(2).some(arg => arg !== '--login')) throw new Error('Usage: node scripts/site-preview.js [--login]');
const origin = `http://127.0.0.1:${port}`;
await mkdir(workspace, { recursive: true });
async function prepareLogin() {
  const store = openStore(join(dataDir, 'world.sqlite'));
  try {
    const ticket = createOwnerTicket(store.db);
    await writeFile(join(workspace, 'owner-link.json'), JSON.stringify({ url: `${origin}/admin#ticket=${ticket}` }), { mode: 0o600 });
    console.log('Preview owner link prepared. It expires in two minutes.');
  } finally { store.db.close(); }
}
if (process.argv.includes('--login')) {
  await prepareLogin();
} else {
  await new Promise((done, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(error => error ? reject(error) : done()));
  });
  const names = ['PATH','Path','SystemRoot','WINDIR','COMSPEC','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP'];
  const env = Object.fromEntries(names.filter(name => process.env[name] !== undefined).map(name => [name,process.env[name]]));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root, windowsHide: true, stdio: 'inherit',
    env: { ...env, LW_SITE_PREVIEW:'1', HOST:'127.0.0.1', PORT:String(port), PUBLIC_ORIGIN:origin, DATA_DIR:dataDir, BACKUP_DIR:join(workspace,'backups') }
  });
  let stopped = false;
  child.once('error', error => { console.error(error.message); stopped = true; process.exitCode = 1; });
  child.once('exit', code => { stopped = true; process.exitCode = code ?? 1; });
  const shutdown = async () => { await stopProcess(child); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  let healthy = false;
  const startupDeadline = Date.now() + 120000;
  while (Date.now() < startupDeadline && !stopped) {
    try { healthy = (await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(500) })).ok; } catch {}
    if (healthy) break;
    await new Promise(done => setTimeout(done,100));
  }
  if (!healthy || stopped) {
    await shutdown(); throw new Error('Website preview could not start. Check the port and logs.');
  }
  await writeFile(join(workspace,'status.json'), JSON.stringify({ kind:'trusted_source_application_preview', origin, game:`${origin}/`, admin:`${origin}/admin`, dataDir, serverPid:child.pid, startedAt:new Date().toISOString(), candidateIsolation:false },null,2));
  await prepareLogin();
  console.log(`Website preview ready: ${origin}\nAdmin: ${origin}/admin\nSeparate preview data: ${dataDir}`);
}
