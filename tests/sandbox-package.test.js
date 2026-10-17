import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copySandboxTree, sandboxConfiguration, prepareSandboxPackage } from '../server/sandbox-package.js';

test('Sandbox configuration maps only input and evidence, disables external access and escapes XML', () => {
  const config = sandboxConfiguration('C:/review/a&b/input','C:/review/a&b/evidence');
  assert.match(config, /a&amp;b/);
  assert.equal((config.match(/<HostFolder>/g)||[]).length, 2);
  for (const flag of ['Networking','ClipboardRedirection','AudioInput','VideoInput','PrinterRedirection','vGPU']) assert.match(config, new RegExp(`<${flag}>Disable</${flag}>`));
  assert.match(config, /<ReadOnly>true<\/ReadOnly>/);
  assert.match(config, /<ProtectedClient>Enable<\/ProtectedClient>/);
  assert.throws(()=>sandboxConfiguration('C:/review/input','C:/review/input/evidence'), /Invalid Sandbox mapping/);
});

test('Sandbox copying bounds bytes and rejects junctions before copying target content', async () => {
  const root = await mkdtemp(join(tmpdir(),'lw-sandbox-copy-'));
  try {
    await mkdir(join(root,'source')); await mkdir(join(root,'secret'));
    await writeFile(join(root,'source','file.txt'),'abcd');
    await assert.rejects(copySandboxTree(join(root,'source'),join(root,'too-big'),{maxBytes:3}), /size limit/);
    await symlink(join(root,'secret'),join(root,'source','escape'),process.platform==='win32'?'junction':'dir');
    await assert.rejects(copySandboxTree(join(root,'source'),join(root,'copy')), /symlinks or junctions/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('candidate packaging never executes source and exposes no production data', async () => {
  const root = await mkdtemp(join(tmpdir(),'lw-sandbox-package-'));
  const project = join(root,'project'), candidate = join(root,'candidate');
  try {
    for (const dir of ['server','public','config','data','node_modules/ws','scripts','controller','browser']) await mkdir(join(project,dir),{recursive:true});
    for (const dir of ['server','public','config']) await mkdir(join(candidate,dir),{recursive:true});
    await writeFile(join(candidate,'server','index.js'), 'throw new Error("candidate must never run on host")');
    await writeFile(join(candidate,'server','.env'),'secret');
    await writeFile(join(project,'data','world.sqlite'),'private');
    await writeFile(join(project,'node_modules','ws','index.js'),'trusted dependency');
    await writeFile(join(project,'scripts','sandbox-review.mjs'),'trusted controller');
    await writeFile(join(project,'node.exe'),'runtime');
    await writeFile(join(project,'browser','chrome.exe'),'browser');
    await assert.rejects(prepareSandboxPackage({projectDir:project,candidateDir:candidate,outputRoot:join(candidate,'server','recursive')}), /overlap copied candidate/);
    const result = await prepareSandboxPackage({projectDir:project,candidateDir:candidate,outputRoot:join(root,'packages'),nodeBinary:join(project,'node.exe'),playwrightCore:join(project,'controller'),browserDir:join(project,'browser')});
    assert.equal(result.runtimeVerified,false);
    const manifest = JSON.parse(await readFile(join(result.run,'input','manifest.json'),'utf8'));
    assert.equal(manifest.source,'candidate'); assert.equal(manifest.promotionAuthority,false);
    assert.ok(manifest.files.some(file=>file.path==='project/server/index.js'));
    assert.ok(!manifest.files.some(file=>/sqlite|\.env|codex-home/.test(file.path)));
    assert.equal(await readFile(join(result.run,'input','project','node_modules','ws','index.js'),'utf8'),'trusted dependency');
    const config = await readFile(result.configuration,'utf8');
    assert.ok(!config.includes(candidate)); assert.ok(!config.includes(join(project,'data')));
  } finally { await rm(root,{recursive:true,force:true}); }
});
