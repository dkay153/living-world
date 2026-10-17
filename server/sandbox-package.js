import { mkdir, readdir, lstat, readFile, copyFile, writeFile } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const xml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const inside = (root, target) => { const path = relative(root, target); return path !== '' && !path.startsWith('..') && !path.includes(':'); };

export function sandboxConfiguration(input, output) {
  const a = resolve(input), b = resolve(output);
  if (!inside(resolve(input, '..'), a) || a === b || inside(a,b) || inside(b,a)) throw new Error('Invalid Sandbox mapping');
  return `<Configuration>
  <Networking>Disable</Networking>
  <vGPU>Disable</vGPU>
  <AudioInput>Disable</AudioInput>
  <VideoInput>Disable</VideoInput>
  <PrinterRedirection>Disable</PrinterRedirection>
  <ClipboardRedirection>Disable</ClipboardRedirection>
  <ProtectedClient>Enable</ProtectedClient>
  <MemoryInMB>4096</MemoryInMB>
  <MappedFolders>
    <MappedFolder><HostFolder>${xml(resolve(input))}</HostFolder><SandboxFolder>C:\\LivingWorldInput</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
    <MappedFolder><HostFolder>${xml(resolve(output))}</HostFolder><SandboxFolder>C:\\LivingWorldOutput</SandboxFolder><ReadOnly>false</ReadOnly></MappedFolder>
  </MappedFolders>
  <LogonCommand><Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\LivingWorldInput\\boot.ps1</Command></LogonCommand>
</Configuration>\n`;
}

// Copy data only. Never import a module, run a build or execute a candidate on the host.
export async function copySandboxTree(source, destination, { maxBytes = 100 * 1024 * 1024, filter = () => true } = {}) {
  let bytes = 0, count = 0;
  async function visit(from, to, path = '') {
    const info = await lstat(from);
    if (info.isSymbolicLink()) throw new Error('Sandbox inputs cannot contain symlinks or junctions');
    if (info.isDirectory()) {
      await mkdir(to, { recursive: true });
      for (const entry of await readdir(from)) {
        const next = path ? `${path}/${entry}` : entry;
        if (filter(next, entry)) await visit(join(from, entry), join(to, entry), next);
      }
    } else if (info.isFile()) {
      bytes += info.size;
      if (bytes > maxBytes || ++count > 15000) throw new Error('Sandbox input size limit exceeded');
      await mkdir(resolve(to, '..'), { recursive: true });
      await copyFile(from, to);
    } else throw new Error('Unsupported Sandbox input');
  }
  await visit(resolve(source), resolve(destination));
  return { bytes, count };
}

export async function prepareSandboxPackage({ projectDir, candidateDir = projectDir, outputRoot, nodeBinary, playwrightCore, browserDir }) {
  const project = resolve(projectDir), candidate = resolve(candidateDir), root = resolve(outputRoot);
  if (root === candidate || inside(root, candidate)) throw new Error('Candidate cannot be inside the Sandbox output directory');
  if (inside(candidate,root) && !['outputs','work'].includes(relative(candidate,root).split(sep)[0])) throw new Error('Sandbox output cannot overlap copied candidate source');
  const run = resolve(root, `review-${randomUUID()}`), input = join(run, 'input'), output = join(run, 'evidence');
  await mkdir(input, { recursive: true }); await mkdir(output, { recursive: true });
  const filter = (path, name) => !name.startsWith('.') && !['node_modules','data','backups','work','outputs','codex-home'].includes(name) && !/\.(sqlite|db|key|log|env)$/i.test(name);
  for (const name of ['server','public','config']) await copySandboxTree(join(candidate, name), join(input, 'project', name), { filter });
  // Only the module type is taken from package.json; candidate scripts never execute.
  await writeFile(join(input, 'project', 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await copySandboxTree(join(project, 'node_modules', 'ws'), join(input, 'project', 'node_modules', 'ws'));
  await copyFile(nodeBinary, join(input, 'node.exe'));
  await copySandboxTree(playwrightCore, join(input, 'node_modules', 'playwright-core'));
  await copySandboxTree(browserDir, join(input, 'browser'), { maxBytes: 800 * 1024 * 1024 });
  await copyFile(join(project, 'scripts', 'sandbox-review.mjs'), join(input, 'review.mjs'));
  await writeFile(join(input, 'boot.ps1'), `$ErrorActionPreference = 'Stop'\nSet-Location C:\\LivingWorldInput\n& C:\\LivingWorldInput\\node.exe C:\\LivingWorldInput\\review.mjs\n`);
  const files = [];
  async function manifest(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await manifest(path);
      else files.push({ path: relative(input, path).split(sep).join('/'), sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
    }
  }
  await manifest(input); files.sort((a,b) => a.path.localeCompare(b.path));
  const receipt = { version: 1, preparedAt: new Date().toISOString(), kind: 'offline_windows_sandbox_review', source: candidate === project ? 'current_source' : 'candidate', files, inputHash: createHash('sha256').update(JSON.stringify(files)).digest('hex'), runtimeVerified: false, promotionAuthority: false };
  await writeFile(join(input, 'manifest.json'), JSON.stringify(receipt, null, 2));
  await writeFile(join(run, 'review.wsb'), sandboxConfiguration(input, output));
  await writeFile(join(run, 'README.txt'), 'Open review.wsb after enabling Windows Sandbox. Play in its Chromium window. Close the Sandbox to discard the world. evidence/ contains untrusted screenshot/report exports: never execute files from it. This package grants no production promotion authority.\n');
  return { run, configuration: join(run, 'review.wsb'), evidence: output, inputHash: receipt.inputHash, runtimeVerified: false };
}
