import { objects,creatureSeeds,destination } from './world.js';
import { beginEncounter,resolveTurn } from './combat.js';
import { randomUUID } from 'node:crypto';
export function createGame(store,clock=Date.now){
  const creatures=creatureSeeds.map(seed=>({...seed,...(store.loadEnvironment(seed.id)||{hp:seed.maxHp,respawnAt:0})}));
  const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  function refresh(){for(const c of creatures)if(c.hp<=0&&clock()>=c.respawnAt){c.hp=c.maxHp;c.respawnAt=0;store.saveEnvironment(c.id,c);}}
  function snapshot(){refresh();return creatures.map(c=>({...c}));}
  function act(player,message){
    refresh();const state=store.loadGame(player.id);let text='',dialogue=null;
    const originalPosition={x:player.x,y:player.y},originalCreatures=structuredClone(creatures),actionId=randomUUID();
    const record=(kind,subject,details={})=>store.event(player.id,kind,subject,{actionId,location:{x:player.x,y:player.y},details});
    store.db.exec('BEGIN IMMEDIATE');
    try{
      store.importInventory(player.id,state);
      const before=structuredClone(state);
      function commit(){
        if(JSON.stringify(before)!==JSON.stringify(state))record('action_committed',message.type,{before,after:state});
        store.saveGame(player.id,state);store.db.exec('COMMIT');return {text,state,dialogue};
      }
      if(state.battle){
        const encounter=state.battle;
        const turnBefore=encounter.turn,hpBefore=state.hp,enemyHpBefore=encounter.hp,herbsBefore=state.inventory.dewleaf;
        const result=resolveTurn(state,message.type);text=result.text;
        if(result.outcome||encounter.turn!==turnBefore)record('battle_turn',encounter.id,{command:message.type,turn:turnBefore,hpBefore,hpAfter:state.hp,enemyHpBefore,enemyHpAfter:encounter.hp,outcome:result.outcome});
        if(state.inventory.dewleaf<herbsBefore){const e=record('healing','dewleaf',{inBattle:true});store.consumeItems(player.id,'dewleaf',1,e);}
        if(result.outcome==='victory'){
          state.victories++;state.inventory.shard++;const e=record('victory',encounter.id);store.awardItem(player.id,'shard',e);
          const c=creatures.find(c=>c.id===encounter.id);c.hp=0;c.respawnAt=clock()+60000;store.saveEnvironment(c.id,c);
        }
        if(result.outcome==='retreat')record('retreat',encounter.id);
        if(result.outcome==='defeat'){record('defeat',encounter.id,{recovery:{x:9,y:12}});state.deaths++;state.hp=state.maxHp;store.move(player.id,9,12);player.x=9;player.y=12;}
        return commit();
      }
      if(message.type==='heal'){
        if(state.inventory.dewleaf<1)text='No dewleaf in your satchel. Gather the blue plants east of the bridge.';
        else if(state.hp===state.maxHp)text='You are already at full strength.';
        else{state.inventory.dewleaf--;state.hp=Math.min(state.maxHp,state.hp+12);const e=record('healing','dewleaf',{inBattle:false});store.consumeItems(player.id,'dewleaf',1,e);text='Dewleaf restores 12 vitality.';}
      }
      if(message.type==='attack'){
        const c=creatures.find(c=>c.hp>0&&distance(c,player)<=1);
        if(!c)text='Approach a creature to strike. You can also avoid it.';
        else{
          state.battle=beginEncounter(c);record('encounter',c.id,{encounter:state.battle});text=`${c.name} approaches. Choose your next move.`;
        }
      }
      if(message.type==='interact'){
        const o=objects.find(o=>distance(o,player)<=1);
        if(!o)text='Approach a landmark, plant, or inhabitant to interact.';
        else{
          if(o.kind==='herb'){
            const plant=store.loadEnvironment(o.id)||{readyAt:0};
            if(plant.readyAt>clock())text='This dewleaf needs time to regrow.';
            else{const readyAt=clock()+45000;state.inventory.dewleaf++;store.saveEnvironment(o.id,{readyAt});const e=record('gathering',o.id,{regrowsAt:readyAt});store.awardItem(player.id,'dewleaf',e);text='You gathered a dewleaf. Use it to restore vitality, or bring it to Mara.';}
          }else{
            const fresh=store.db.prepare('INSERT OR IGNORE INTO discoveries VALUES (?,?)').run(player.id,o.id).changes>0;
            if(fresh){const e=record('discovery',o.id);store.learn('player',player.id,o.id,'discovered',true,e);}
            text=o.description;
            if(o.id==='well'||o.id==='camp'){if(state.hp<state.maxHp)record('rest',o.id,{restored:state.maxHp-state.hp});state.hp=state.maxHp;text+=' Your vitality is restored.';}
            if(o.id==='keeper'){
              const talk=record('conversation','keeper',{questAtArrival:state.quest});store.learn('npc','keeper',player.id,'spoke_to_me',true,talk);
              if(state.quest==='unstarted'){state.quest='active';const e=record('quest_started','first-echo');store.learn('npc','keeper',player.id,'accepted_first_echo',true,e);text='“The stone across the river hums at night. Study it, gather two dewleaf, and bring me two echo shards from the mosslings. Perhaps we can understand it together.”';}
              else if(state.quest==='active'){
                const stone=store.discoveries(player.id).includes('stone');
                if(stone&&state.inventory.dewleaf>=2&&state.inventory.shard>=2){state.inventory.dewleaf-=2;state.inventory.shard-=2;state.quest='complete';state.hp=state.maxHp;const e=record('quest_completed','first-echo',{delivered:{dewleaf:2,shard:2}});store.consumeItems(player.id,'dewleaf',2,e);store.consumeItems(player.id,'shard',2,e);store.awardItem(player.id,'tempered_blade',e);store.learn('npc','keeper',player.id,'delivered_first_echo',true,e);text='“These echoes belong to the ruin. Take this tempered blade. Whatever waits there, you now have a chance.” Your strike increases to 7.';}
                else text='“Study the Unnamed Stone, then return with two dewleaf and two echo shards. Rest at the well whenever you need.”';
              }else text='“You have given this place its first story. The Hollow Warden still guards the sealed ruin. The next question is yours.”';
              dialogue={speaker:o.name,text};
            }
          }
        }
      }
      return commit();
    }catch(e){store.db.exec('ROLLBACK');Object.assign(player,originalPosition);creatures.splice(0,creatures.length,...originalCreatures);throw e;}
  }
  function move(player,direction){
    if(store.loadGame(player.id).battle)return false;
    const next=destination(player,direction);if(!next)return false;
    const from={x:player.x,y:player.y};store.db.exec('BEGIN IMMEDIATE');
    try{store.move(player.id,next.x,next.y);store.event(player.id,'position_changed','world',{from,to:next});store.db.exec('COMMIT');Object.assign(player,next);return true;}
    catch(e){store.db.exec('ROLLBACK');throw e;}
  }
  return {act,snapshot,move};
}
