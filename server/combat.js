// Encounter rules are independent of transport, rendering and storage.
export function beginEncounter(creature) {
  return {id:creature.id,name:creature.name,hp:creature.maxHp,maxHp:creature.maxHp,damage:creature.damage,turn:1};
}
export function resolveTurn(state,command) {
  const battle=state.battle;
  if(!battle)return {text:'No encounter is active.',outcome:null};
  let text='',incoming=battle.damage;
  if(command==='retreat'){state.battle=null;return {text:'You retreat safely. The unanswered question remains.',outcome:'retreat'};}
  if(command==='attack') {const damage=state.quest==='complete'?7:5;battle.hp=Math.max(0,battle.hp-damage);text=`Your strike deals ${damage}.`;}
  else if(command==='guard'){incoming=Math.max(1,Math.floor(incoming/2));text='You brace for the next blow.';}
  else if(command==='heal'){
    if(state.inventory.dewleaf<1)return {text:'No dewleaf remains. Choose another command.',outcome:null};
    if(state.hp===state.maxHp)return {text:'Vitality is full. Choose another command.',outcome:null};
    state.inventory.dewleaf--;state.hp=Math.min(state.maxHp,state.hp+12);text='Dewleaf restores 12 vitality.';
  }else return {text:'Choose Strike, Guard, Dewleaf, or Retreat.',outcome:null};
  if(battle.hp===0){state.battle=null;return {text:`${battle.name} falls. You recover an echo shard.`,outcome:'victory'};}
  state.hp=Math.max(0,state.hp-incoming);battle.turn++;
  if(state.hp===0){state.battle=null;return {text:'Your strength fails. Mara brings you home with your belongings.',outcome:'defeat'};}
  return {text:`${text} ${battle.name} answers for ${incoming}.`,outcome:null};
}
