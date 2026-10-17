import test from 'node:test';
import assert from 'node:assert/strict';
import {liveExecution} from '../ui/lib/live-execution.ts';
test('shimmer uses a separate provider summary, never chat messages or tool traffic',()=>{
  const tool={name:'Shell command',detail:'Executable: node',stage:'implementation',state:'running',updatedAt:1000};
  const e={stage:'implementation',tools:[tool],messages:[]};
  assert.equal(liveExecution(e,2000).at,null);
  tool.state='failed';tool.updatedAt=3000;
  assert.equal(liveExecution(e,4000).quiet,true);
  e.messages.push({text:'Full result message that belongs in chat.',stage:'implementation',createdAt:5000});
  assert.equal(liveExecution(e,6000).at,null);
  e.workingNote={text:'Checking the input handler next.',stage:'implementation',updatedAt:5000,source:'provider_summary'};
  assert.match(liveExecution(e,6000).text,/input handler next/);
  tool.updatedAt=7000;
  assert.match(liveExecution(e,8000).text,/input handler next/);
  assert.equal(liveExecution(e,8000).at,5000);
});
test('polling and ignored events cannot refresh stale work or resurrect an earlier phase',()=>{
  const e={stage:'planning',lastEventAt:999999,workingNote:{text:'Checking saved progress.',stage:'planning',updatedAt:1000,source:'provider_summary'},tools:[{name:'Shell command',detail:'Executable: node',stage:'planning',state:'running',updatedAt:45000}]};
  assert.equal(liveExecution(e,46000).quiet,true);
  assert.equal(liveExecution(e,46000).age,45);
  e.stage='implementation';assert.equal(liveExecution(e,46000).at,null);
  assert.equal(liveExecution(null,46000).quiet,true);
});
