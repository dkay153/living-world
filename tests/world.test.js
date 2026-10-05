import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { destination } from '../server/world.js';
import { openStore } from '../server/store.js';
test('world rejects invalid directions, water and boundary movement',()=>{
  assert.equal(destination({x:15,y:9},'right'),null);
  assert.equal(destination({x:1,y:1},'left'),null);
  assert.equal(destination({x:9,y:12},'teleport'),null);
  assert.deepEqual(destination({x:15,y:10},'right'),{x:16,y:10});
});
test('state survives reopening; discovery and its history are idempotent',()=>{
  const dir=mkdtempSync(join(tmpdir(),'living-world-')); const path=join(dir,'test.sqlite');
  let store=openStore(path);
  try {store.player('a');store.move('a',14,10);assert.equal(store.discover('a','stone'),true);assert.equal(store.discover('a','stone'),false);store.db.close();store=openStore(path);assert.equal(store.player('a').x,14);assert.deepEqual(store.discoveries('a'),['stone']);assert.equal(store.history().length,1);}finally{store.db.close();rmSync(dir,{recursive:true,force:true});}
});
