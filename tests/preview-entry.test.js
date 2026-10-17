import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createPreviewEntry } from '../server/preview-entry.js';
import { createOwnerAuth } from '../server/owner-auth.js';

function fixture(enabled=true) {
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE owner_tickets(hash TEXT PRIMARY KEY,expires_at INTEGER,used_at INTEGER); CREATE TABLE owner_sessions(hash TEXT PRIMARY KEY,csrf TEXT,expires_at INTEGER); CREATE TABLE admin_audit(action TEXT,details TEXT);');
  const handle=createPreviewEntry({db,origin:'http://127.0.0.1:3100',enabled});
  const request=(overrides={})=>({method:'GET',url:'/admin',headers:{host:'127.0.0.1:3100'},socket:{remoteAddress:'127.0.0.1'},...overrides});
  const response=()=>({status:null,headers:{},writeHead(status,headers={}){this.status=status;this.headers=headers;},end(){}});
  return {db,handle,request,response};
}

test('preview admin creates a single-use login redirect and does not loop',()=>{
  const {db,handle,request,response}=fixture();
  try {
    const res=response();assert.equal(handle(request(),res),true);assert.equal(res.status,302);
    const url=new URL(res.headers.Location,'http://127.0.0.1:3100');
    assert.equal(handle(request({url:url.pathname+url.search}),response()),false);
    const auth=createOwnerAuth(db),ticket=new URLSearchParams(url.hash.slice(1)).get('ticket');
    assert.ok(auth.exchange(ticket));assert.equal(auth.exchange(ticket),null);
  } finally {db.close();}
});

test('production and foreign preview requests cannot acquire a login ticket',()=>{
  const disabled=fixture(false);
  try {assert.equal(disabled.handle(disabled.request(),disabled.response()),false);assert.equal(disabled.db.prepare('SELECT COUNT(*) n FROM owner_tickets').get().n,0);}finally{disabled.db.close();}
  const {db,handle,request,response}=fixture();
  try {
    for(const req of [request({socket:{remoteAddress:'192.168.1.10'}}),request({headers:{host:'attacker.invalid:3100'}}),request({headers:{host:'127.0.0.1:3100','sec-fetch-site':'cross-site'}}),request({headers:{host:'127.0.0.1:3100',origin:'http://attacker.invalid'}})]){
      const res=response();assert.equal(handle(req,res),true);assert.equal(res.status,403);
    }
    assert.equal(db.prepare('SELECT COUNT(*) n FROM owner_tickets').get().n,0);
    const local=response();handle(request({headers:{host:'localhost:3100'}}),local);
    assert.equal(local.headers.Location,'http://127.0.0.1:3100/admin');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM owner_tickets').get().n,0);
  } finally {db.close();}
});
