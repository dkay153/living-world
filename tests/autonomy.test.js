import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../server/migrations.js';
import { createAutonomy } from '../server/autonomy.js';
import { createQueue } from '../server/jobs.js';

function fixture(){const db=new DatabaseSync(':memory:');migrate(db);let now=1000000;const a=createAutonomy({db},()=>now),q=createQueue(db,()=>now);return {db,a,q,advance:ms=>now+=ms,run:(origin='autonomous')=>{const id=q.enqueue('codex_development',{},'run-'+Math.random(),1);db.prepare("INSERT INTO developer_runs(id,request_key,task,model,max_minutes,state,created_at,origin) VALUES (?,?,'Task','owner-model',2,'succeeded',?,?)").run(id,id,now,origin);return id;}};}
test('independent cadence survives restart, respects a queued owner task and avoids duplicate cycles',()=>{
  const {db,a,q,advance,run}=fixture();try{
    assert.equal(a.ready(),false);a.save({enabled:true,intervalMinutes:30,automaticVisuals:true});assert.equal(a.ready(),true);
    run();assert.equal(a.ready(),false);advance(30*60000);assert.equal(a.ready(),true);
    const id=q.enqueue('codex_development',{},'owner-request',1);db.prepare("INSERT INTO developer_runs(id,request_key,task,model,max_minutes,state,created_at) VALUES (?,?,'Owner task','owner-model',2,'queued',0)").run(id,id);
    assert.equal(a.ready(),false);assert.equal(createAutonomy({db},()=>99999999).ready(),false);
  }finally{db.close();}
});
test('three consecutive execution failures open the circuit; evidence distinguishes claims from facts',()=>{
  const {db,a,run}=fixture();try{
    a.save({enabled:true,intervalMinutes:15,automaticVisuals:false});
    for(let i=0;i<3;i++)a.learn(run(),'execution_failed','The process did not complete.',{hypothesisVerified:false});
    assert.equal(a.status().circuitOpen,true);assert.equal(a.ready(),false);
    const id=run();a.learn(id,'candidate_validated','Checks passed.',{modelHypothesis:'Players may prefer this',hypothesisVerified:false});
    a.learn(id,'visual_published','Must not overwrite the original observation',{});
    assert.equal(a.status().circuitOpen,false);assert.equal(a.evidence().outcomes[0].evidence.hypothesisVerified,false);
  }finally{db.close();}
});
test('dossier contains aggregate observations without guest bearer IDs or secret tables',()=>{
  const {db,a}=fixture();try{db.prepare('INSERT INTO players VALUES (?,1,2)').run('private-bearer-1234');db.prepare('INSERT INTO owner_secrets VALUES (?,?)').run('apiKey','private-provider-secret');
    const text=JSON.stringify(a.evidence());assert.ok(!text.includes('private-bearer'));assert.ok(!text.includes('private-provider-secret'));assert.equal(a.evidence().counts.players,1);
    assert.throws(()=>a.save({enabled:true,intervalMinutes:1,automaticVisuals:true}),/15–1440/);
  }finally{db.close();}
});
