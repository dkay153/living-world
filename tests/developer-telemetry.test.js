import test from 'node:test';
import assert from 'node:assert/strict';
import { executionEvent } from '../server/developer-telemetry.js';
import { narrateActivity } from '../server/agent-activity.js';
import {harnessEvent} from '../server/codex-harness.js';

test('readable provider summaries stream separately from chat, with bounded section identity',()=>{
  let r=executionEvent(null,{...harnessEvent('item/reasoning/summaryTextDelta',{itemId:'thought',summaryIndex:0,delta:'Checking '}),harness:true},'implementation',1000);
  r=executionEvent(r,{...harnessEvent('item/reasoning/summaryTextDelta',{itemId:'thought',summaryIndex:0,delta:'input ownership.'}),harness:true},'implementation',2000);
  assert.equal(r.workingNote.text,'Checking input ownership.');assert.equal(r.messages.length,0);
  r=executionEvent(r,{...harnessEvent('item/reasoning/summaryTextDelta',{itemId:'thought',summaryIndex:1,delta:'Found the missing focus guard.'}),harness:true},'implementation',3000);
  assert.equal(r.workingNote.text,'Found the missing focus guard.');
  assert.equal(harnessEvent('item/reasoning/textDelta',{delta:'PRIVATE'}),null);
  assert.equal(harnessEvent('item/completed',{item:{type:'reasoning',content:['PRIVATE'],summary:[]}}),null);
  r=executionEvent(r,{type:'summary.delta',itemId:'fake',index:0,delta:'UNVERIFIED'},'implementation',4000);
  assert.equal(r.workingNote.text,'Found the missing focus guard.');
});

test('public agent updates are bounded and reasoning/tool output stays private',()=>{
 let receipt=executionEvent(null,{type:'item.completed',item:{id:'update',type:'agent_message',text:'I found the reconnect issue and am checking the saved encounter.'}},'implementation',1);
 receipt=executionEvent(receipt,{type:'item.completed',item:{id:'private',type:'reasoning',text:'PRIVATE_THOUGHT'}},'implementation',2);
 receipt=executionEvent(receipt,{type:'item.completed',item:{id:'analysis',type:'agent_message',channel:'analysis',text:'PRIVATE_THOUGHT'}},'implementation',3);
 assert.equal(receipt.messages.length,1);assert.match(receipt.messages[0].text,/reconnect issue/);assert.ok(!JSON.stringify(receipt).includes('PRIVATE_THOUGHT'));
 for(let i=0;i<40;i++)receipt=executionEvent(receipt,{type:'item.completed',item:{id:'m'+i,type:'agent_message',text:'a'.repeat(5000)}},'implementation',i+4);
 assert.equal(receipt.messages.length,24);assert.equal(receipt.messages[0].text.length,3000);
});

test('tool receipts retain lifecycle, executable identity and timestamps without raw data',()=>{
  let receipt=executionEvent(null,{type:'item.started',item:{id:'tool1',type:'command_execution',command:'pwsh -Command "rg secret-token data/auth.json"',aggregated_output:'private-output'}},'planning',1000);
  assert.equal(receipt.tools[0].state,'running');assert.equal(receipt.tools[0].detail,'Executable: pwsh');
  receipt=executionEvent(receipt,{type:'item.completed',item:{id:'tool1',type:'command_execution',command:'rg secret-token',exit_code:1,aggregated_output:'private-output'}},'planning',2000);
  assert.equal(receipt.tools.length,1);assert.equal(receipt.tools[0].state,'failed');assert.equal(receipt.tools[0].startedAt,1000);assert.equal(receipt.lastEventAt,2000);
  assert.ok(!JSON.stringify(receipt).includes('secret-token'));assert.ok(!JSON.stringify(receipt).includes('private-output'));
  const narrative=narrateActivity({state:'running',phase:'Planning state impact in a separate read-only candidate',startedAt:1000,execution:receipt,model:'fixture'},3000);
  assert.equal(narrative.execution.lastEventAt,2000);assert.equal(narrative.model,'fixture');assert.equal(narrative.elapsedSeconds,2);
});
test('executable identity comes from the invoked command, never an argument mention',()=>{
  const receipt=executionEvent(null,{type:'item.completed',item:{id:'echo',type:'command_execution',command:'echo rg node git',exit_code:0}},'planning',1);
  assert.equal(receipt.tools[0].detail,'Executable: echo');assert.equal(receipt.tools[0].source,'codex_cli');
  const windows=executionEvent(null,{type:'item.completed',item:{id:'win',type:'command_execution',command:'"C:\\Windows\\System32\\cmd.exe" /c type docs/BASELINE.md',exit_code:0}},'planning',1);
  assert.equal(windows.tools[0].detail,'Executable: cmd');
});
test('tool arguments and reasoning are excluded; same IDs in different stages remain distinct',()=>{
  let receipt=executionEvent(null,{type:'item.completed',item:{id:'a',type:'mcp_tool_call',server:'docs',tool:'search',arguments:{secret:'PRIVATE'},result:'PRIVATE'}},'planning',1);
  receipt=executionEvent(receipt,{type:'item.completed',item:{id:'a',type:'file_change',changes:[{path:'PRIVATE'}]}},'implementation',2);
  receipt=executionEvent(receipt,{type:'item.completed',item:{id:'b',type:'reasoning',text:'PRIVATE'}},'implementation',3);
  assert.equal(receipt.tools.length,2);assert.equal(receipt.eventCount,3);assert.ok(!JSON.stringify(receipt).includes('PRIVATE'));
});
test('only the last forty tool receipts are retained',()=>{
  let receipt;for(let i=0;i<60;i++)receipt=executionEvent(receipt,{type:'item.completed',item:{id:`a${i}`,type:'command_execution',command:'node',exit_code:0}},'implementation',i+1);
  assert.equal(receipt.tools.length,40);assert.equal(receipt.tools[0].id,'implementation:a20');assert.equal(receipt.eventCount,60);
});
