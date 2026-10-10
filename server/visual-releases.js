import { readFileSync } from 'node:fs';
import { createHash,randomUUID } from 'node:crypto';

// This host validator and its policy are never replaced by a developer candidate.
const seed=JSON.parse(readFileSync(new URL('../public/art.json',import.meta.url),'utf8'));
const paletteKeys=Object.keys(seed.palette).sort();
const tileKeys=['grass','path','bridge','water','tree','house','void'];
const spriteKeys=['traveler','keeper','mossling','warden','herb','well','camp','stone'];
const digest=value=>createHash('sha256').update(value).digest('hex');
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>plain(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
const luminance=c=>rgb(c).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
export function validateArt(pack){
  if(!exact(pack,['version','name','palette','tiles','sprites'])||pack.version!==1||typeof pack.name!=='string'||pack.name.length<3||pack.name.length>100||/[\x00-\x1f]/.test(pack.name))throw new Error('Invalid visual pack format');
  if(!exact(pack.palette,paletteKeys)||Object.entries(pack.palette).some(([k,c])=>typeof c!=='string'||!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c)||(seed.palette[k].length===7?c.length!==7:c.length!==9||parseInt(c.slice(7),16)<64)))throw new Error('Palette must contain the known color tokens with visible opacity');
  // Labels, eyes and terrain must remain readable; quality is still a separate question.
  if(contrast(pack.palette.c_fff0bf,pack.palette.c_302b32)<4.5)throw new Error('Landmark label outline loses contrast');
  if(Math.hypot(...rgb(pack.palette.water).map((v,i)=>v-rgb(pack.palette.grass)[i]))<35)throw new Error('Water and grass are indistinguishable');
  for(const [group,keys] of [['tiles',tileKeys],['sprites',spriteKeys]]){
    if(!plain(pack[group])||Object.keys(pack[group]).some(k=>!keys.includes(k)))throw new Error('Unknown visual entity');
    for(const spec of Object.values(pack[group])){
      if(!exact(spec,['colors','frames','frameMs'])||!Array.isArray(spec.colors)||spec.colors.length<2||spec.colors.length>16||spec.colors.some(c=>typeof c!=='string'||!/^#[0-9a-f]{6}$/i.test(c)))throw new Error('Invalid pixel palette');
      if(!spec.colors.some(a=>spec.colors.some(b=>contrast(a,b)>=1.8)))throw new Error('Pixel palette lacks internal contrast');
      if(!Number.isInteger(spec.frameMs)||spec.frameMs<150||spec.frameMs>2000||!Array.isArray(spec.frames)||spec.frames.length<1||spec.frames.length>4)throw new Error('Invalid animation timing');
      for(const frame of spec.frames){
        if(!Array.isArray(frame)||frame.length!==16||frame.some(row=>typeof row!=='string'||row.length!==16||[...row].some(c=>c!=='.'&&(!/^[0-9a-f]$/.test(c)||parseInt(c,16)>=spec.colors.length))))throw new Error('Pixels must fit a 16 by 16 tile');
        const coverage=frame.join('').replaceAll('.','').length;
        if(coverage<(group==='tiles'?256:30))throw new Error('Visual entity is too empty');
        if(group==='sprites'&&coverage>240)throw new Error('Sprite must retain a distinct silhouette');
      }
      if(spec.frames.length>1&&spec.frameMs<334){
        for(let i=0;i<spec.frames.length;i++){
          const from=spec.frames[i].join(''),to=spec.frames[(i+1)%spec.frames.length].join('');let flashing=0;
          for(let p=0;p<from.length;p++)if(from[p]!=='.'&&to[p]!=='.'&&Math.abs(luminance(spec.colors[parseInt(from[p],16)])-luminance(spec.colors[parseInt(to[p],16)]))>.3)flashing++;
          if(flashing>25)throw new Error('Large flashing regions need slower animation');
        }
      }
    }
  }
  function terrainColor(name){const spec=pack.tiles[name];if(!spec)return rgb(pack.palette[name]);const pixels=spec.frames[0].join('');return [0,1,2].map(i=>[...pixels].reduce((sum,c)=>sum+rgb(spec.colors[parseInt(c,16)])[i],0)/pixels.length);}
  if(Math.hypot(...terrainColor('water').map((v,i)=>v-terrainColor('grass')[i]))<35)throw new Error('Rendered water and grass are indistinguishable');
  const encoded=JSON.stringify(pack);if(Buffer.byteLength(encoded)>96000)throw new Error('Visual pack exceeds its size limit');
  return {pack:JSON.parse(encoded),encoded,hash:digest(encoded),checks:['Typed data only; no executable code or URLs','Known entity dimensions and animation limits','Terrain distinction and landmark label contrast']};
}
export function createVisualReleases(db,clock=Date.now){
  const baseline=validateArt(seed);
  const audit=(action,details)=>db.prepare('INSERT INTO admin_audit(action,details) VALUES (?,?)').run(action,JSON.stringify(details));
  const current=()=>db.prepare("SELECT * FROM visual_releases WHERE state='active'").get();
  function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}}
  function read(){
    const row=current();if(!row)return {...baseline.pack,hash:baseline.hash,releaseId:null};
    try{const checked=validateArt(JSON.parse(row.artifact));if(checked.hash!==row.sha256)throw new Error('Artifact hash mismatch');return {...checked.pack,hash:row.sha256,releaseId:row.id};}
    catch{rollback('Stored visual artifact failed validation');return read();}
  }
  function publish(pack,runId,expectedHash,withinTransaction=false){
    const checked=validateArt(pack);
    if(read().hash!==expectedHash)throw new Error('Visual baseline changed during development');
    if(checked.hash===expectedHash)return {state:'unchanged',hash:checked.hash};
    const install=()=>{
      const previous=current(),id=randomUUID();
      if(previous)db.prepare("UPDATE visual_releases SET state='retired' WHERE id=?").run(previous.id);
      db.prepare("INSERT INTO visual_releases(id,run_id,artifact,sha256,previous_id,state,created_at,reason) VALUES (?,?,?,?,?,'active',?,?)").run(id,runId,checked.encoded,checked.hash,previous?.id||null,clock(),'Independent visual data gate passed');
      audit('visual_release_published',{id,runId,hash:checked.hash,previous:previous?.id||null});
      return {state:'published',id,hash:checked.hash,checks:checked.checks};
    };return withinTransaction?install():transaction(install);
  }
  function rollback(reason='Owner rollback'){
    return transaction(()=>{
      const row=current();if(!row)return {state:'seed'};
      db.prepare("UPDATE visual_releases SET state='rolled_back',reason=? WHERE id=?").run(reason,row.id);
      // Validate the prior artifact before restoring it. Bad history falls back to the seed.
      const previous=row.previous_id?db.prepare("SELECT * FROM visual_releases WHERE id=? AND state='retired'").get(row.previous_id):null;
      if(previous){try{const v=validateArt(JSON.parse(previous.artifact));if(v.hash===previous.sha256)db.prepare("UPDATE visual_releases SET state='active' WHERE id=?").run(previous.id);}catch{/* Seed remains available. */}}
      audit('visual_release_rolled_back',{id:row.id,reason});return {state:'rolled_back',id:row.id};
    });
  }
  return {read,publish,rollback,status:()=>({active:current()?.id||null,history:db.prepare('SELECT id,run_id,sha256,previous_id,state,created_at,reason FROM visual_releases ORDER BY created_at DESC,rowid DESC LIMIT 20').all()})};
}
