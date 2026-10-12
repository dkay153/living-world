import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { artPreview } from '../server/art-preview.js';
import { inflateSync } from 'node:zlib';
import { migrate } from '../server/migrations.js';
import { createVisualReleases,validateArt } from '../server/visual-releases.js';
const seed=()=>JSON.parse(readFileSync(new URL('../public/art.json',import.meta.url),'utf8'));
test('visual gate rejects executable data, unreadable colors, invalid pixels and flashing animation',()=>{
  assert.ok(validateArt(seed()).hash);
  const url=seed();url.palette.water='url(https://invalid)';assert.throws(()=>validateArt(url),/Palette/);
  const code=seed();code.script='alert(1)';assert.throws(()=>validateArt(code),/format/);
  const indistinct=seed();indistinct.palette.water=indistinct.palette.grass;assert.throws(()=>validateArt(indistinct),/indistinguishable/);
  const pack=seed();pack.sprites.traveler={colors:['#111111','#eeeeee'],frames:[Array(16).fill('................')],frameMs:500};assert.throws(()=>validateArt(pack),/empty/);
  pack.sprites.traveler.frames=[Array.from({length:16},(_,i)=>i>3&&i<13?'.....000000.....':'................')];assert.ok(validateArt(pack));
  pack.sprites.traveler.frameMs=20;assert.throws(()=>validateArt(pack),/timing/);
  const flash=seed();flash.tiles.grass={colors:['#000000','#ffffff'],frames:[Array(16).fill('0000000000000000'),Array(16).fill('1111111111111111')],frameMs:150};assert.throws(()=>validateArt(flash),/flashing/);
  const same=seed();const tile={colors:['#000000','#ffffff'],frames:[Array(16).fill('0000000011111111')],frameMs:500};same.tiles.water=tile;same.tiles.grass=tile;assert.throws(()=>validateArt(same),/Rendered/);
});
test('immutable artifacts publish atomically, reject stale baselines and restore previous art after failure',()=>{
  const db=new DatabaseSync(':memory:');migrate(db);const v=createVisualReleases(db,()=>1000);try{
    const baseline=v.read().hash,p=seed();p.name='Original dusk palette';p.palette.grass='#597047';
    const first=v.publish(p,null,baseline);assert.equal(v.read().hash,first.hash);assert.equal(v.status().history.length,1);
    const next=seed();next.name='Original dawn palette';next.palette.grass='#556c49';
    assert.throws(()=>v.publish(next,null,baseline),/baseline changed/);
    assert.throws(()=>db.prepare('UPDATE visual_releases SET artifact=? WHERE id=?').run('{}',first.id),/immutable/);
    const second=v.publish(next,null,first.hash);assert.equal(v.read().hash,second.hash);
    v.rollback('Failed visual quality drill');assert.equal(v.read().hash,first.hash);assert.equal(v.status().history.find(r=>r.id===second.id).state,'rolled_back');
    v.rollback();assert.equal(v.read().hash,baseline);assert.equal(v.status().history.length,2);
  }finally{db.close();}
});
test('transaction failure cannot publish art without the associated job evidence',()=>{
  const db=new DatabaseSync(':memory:');migrate(db);const v=createVisualReleases(db);try{
    const p=seed();p.name='Proposed art';const baseline=v.read().hash;
    db.exec('BEGIN IMMEDIATE');v.publish(p,null,baseline,true);db.exec('ROLLBACK');assert.equal(v.status().active,null);assert.equal(v.read().hash,baseline);
  }finally{db.close();}
});
test('corrupt active artifacts automatically restore the previous valid version',()=>{
  const db=new DatabaseSync(':memory:');migrate(db);const v=createVisualReleases(db);try{
    const first=seed();first.name='First verified visual pack';const r=v.publish(first,null,v.read().hash);
    const next=seed();next.name='Later visual pack';const second=v.publish(next,null,r.hash);
    // Fault injection is limited to this disposable fixture database.
    db.exec('DROP TRIGGER visual_artifact_immutable');db.prepare('UPDATE visual_releases SET sha256=? WHERE id=?').run('corrupted',second.id);
    assert.equal(v.read().hash,r.hash);assert.equal(v.status().history.find(x=>x.id===second.id).state,'rolled_back');
  }finally{db.close();}
});
test('schema six and later failure rolls back new columns and preserves existing history',()=>{
  const db=new DatabaseSync(':memory:');migrate(db);try{
    db.exec("DROP TABLE agent_messages;DROP TABLE developer_lessons;DROP TABLE visual_releases;ALTER TABLE developer_runs DROP COLUMN context;ALTER TABLE developer_runs DROP COLUMN origin;PRAGMA user_version=5;CREATE TABLE visual_releases(id TEXT);INSERT INTO players VALUES('old-player',9,12)");
    assert.throws(()=>migrate(db),/already exists/);assert.equal(db.prepare('PRAGMA user_version').get().user_version,5);assert.ok(!db.prepare('PRAGMA table_info(developer_runs)').all().some(c=>c.name==='origin'));assert.equal(db.prepare('SELECT x FROM players').get().x,9);
    db.exec('DROP TABLE visual_releases');migrate(db);assert.equal(db.prepare('PRAGMA user_version').get().user_version,7);
  }finally{db.close();}
});

test('visual contact sheet is a bounded valid PNG and rejects invalid packs before rendering',()=>{
  const png=artPreview(seed());assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(png.readUInt32BE(16),384);assert.equal(png.readUInt32BE(20),256);
  let at=8,compressed;while(at<png.length){const n=png.readUInt32BE(at),name=png.subarray(at+4,at+8).toString();if(name==='IDAT')compressed=png.subarray(at+8,at+8+n);at+=12+n;}
  assert.equal(inflateSync(compressed).length,256*(384*4+1));assert.throws(()=>artPreview({script:'untrusted'}),/format/);
});
