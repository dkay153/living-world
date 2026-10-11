import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve,join } from 'node:path';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('the disposable micro Realm keeps its journey anchors and server-authoritative recovery point',()=>{
  const dir=mkdtempSync(join(tmpdir(),'lw-micro-fixture-'));
  const script=`import {WORLD_LAYOUT,WIDTH,HEIGHT,SPAWN,objects,creatureSeeds,destination} from './server/world.js';
    import {openStore} from './server/store.js';
    if(WORLD_LAYOUT!=='micro'||WIDTH!==18||HEIGHT!==14||SPAWN.x!==3||SPAWN.y!==10)throw new Error('unexpected fixture geometry');
    for(const id of ['well','keeper','stone','ruin','camp'])if(!objects.some(item=>item.id===id))throw new Error('missing '+id);
    if(creatureSeeds.length!==4)throw new Error('missing encounter coverage');
    const move=destination(SPAWN,'right');if(!move||move.x!==4||move.y!==10)throw new Error('expected opening move is blocked');
    const store=openStore(process.env.LW_MICRO_DB);const player=store.player('fixture');if(player.x!==SPAWN.x||player.y!==SPAWN.y)throw new Error('store did not use fixture spawn');store.db.close();`;
  try{const result=spawnSync(process.execPath,['--input-type=module','--eval',script],{cwd:resolve('.'),env:{...process.env,WORLD_FIXTURE:'micro',LW_MICRO_DB:join(dir,'world.sqlite')},encoding:'utf8'});assert.equal(result.status,0,result.stderr||result.stdout);}
  finally{rmSync(dir,{recursive:true,force:true});}
});
