// Production basin by default; WORLD_FIXTURE=micro selects a disposable World Lab map.
const micro=process.env.WORLD_FIXTURE==='micro';
export const WORLD_LAYOUT=micro?'micro':'basin';
export const WIDTH=micro?18:48, HEIGHT=micro?14:32;
export const SPAWN=micro?{x:3,y:10}:{x:9,y:12};
const basinObjects=[
  {id:'stone',x:23,y:5,name:'The Unnamed Stone',description:'Marks cover the stone. Someone was here before the settlement.'},{id:'well',x:8,y:10,name:'Settlement Well',description:'Cool water. A place where strangers become neighbors.'},{id:'ruin',x:24,y:16,name:'Sealed Ruin',description:'A doorway without a handle. The world has not revealed its purpose.'},{id:'keeper',x:12,y:9,name:'Mara, the Keeper',description:'“Paths do not have names until someone walks them.”'},
  {id:'herb-a',x:21,y:9,name:'Dewleaf',kind:'herb'},{id:'herb-b',x:28,y:12,name:'Dewleaf',kind:'herb'},{id:'herb-c',x:32,y:21,name:'Dewleaf',kind:'herb'},{id:'herb-d',x:22,y:18,name:'Dewleaf',kind:'herb'},{id:'camp',x:35,y:24,name:'Wayfarer Camp',description:'A sheltered fire. You rest and recover your strength.'}
];
const microObjects=[
  {id:'stone',x:11,y:3,name:'The Unnamed Stone',description:'A compact echo of an older mystery, placed here for the Lab journey.'},{id:'well',x:2,y:9,name:'Settlement Well',description:'Cool water. A place where strangers become neighbors.'},{id:'ruin',x:12,y:11,name:'Sealed Ruin',description:'A small sealed doorway. The question is still larger than the map.'},{id:'keeper',x:5,y:8,name:'Mara, the Keeper',description:'“Paths do not have names until someone walks them.”'},
  {id:'herb-a',x:11,y:8,name:'Dewleaf',kind:'herb'},{id:'herb-b',x:14,y:10,name:'Dewleaf',kind:'herb'},{id:'herb-c',x:14,y:3,name:'Dewleaf',kind:'herb'},{id:'herb-d',x:10,y:11,name:'Dewleaf',kind:'herb'},{id:'camp',x:15,y:11,name:'Wayfarer Camp',description:'A sheltered fire. You rest and recover your strength.'}
];
export const objects=micro?microObjects:basinObjects;
export const creatureSeeds=micro?[
  {id:'moss-1',x:12,y:8,name:'Mossling',maxHp:12,damage:3},{id:'moss-2',x:14,y:10,name:'Mossling',maxHp:12,damage:3},{id:'moss-3',x:11,y:11,name:'Mossling',maxHp:12,damage:3},{id:'warden',x:13,y:11,name:'Hollow Warden',maxHp:26,damage:5}
]:[
  {id:'moss-1',x:25,y:9,name:'Mossling',maxHp:12,damage:3},{id:'moss-2',x:30,y:15,name:'Mossling',maxHp:12,damage:3},{id:'moss-3',x:23,y:20,name:'Mossling',maxHp:12,damage:3},{id:'warden',x:25,y:16,name:'Hollow Warden',maxHp:26,damage:5}
];
export function tile(x,y){
  if(x<0||y<0||x>=WIDTH||y>=HEIGHT)return 'void';if(x===0||y===0||x===WIDTH-1||y===HEIGHT-1)return 'tree';
  const river=micro?x===8&&y!==7:x>=16&&x<=18&&y!==10,bridge=micro?x===8&&y===7:x>=16&&x<=18&&y===10;
  if(river)return 'water';if(bridge)return 'bridge';
  if(micro&&((x>=2&&x<=4&&y>=3&&y<=5)||(x>=4&&x<=6&&y>=3&&y<=5)))return 'house';
  if(!micro&&((x>=5&&x<=7&&y>=5&&y<=7)||(x>=10&&x<=13&&y>=5&&y<=7)))return 'house';
  if(y===(micro?7:10)||(!micro&&x===9&&y>=7&&y<=14))return 'path';
  if(objects.some(o=>Math.abs(o.x-x)+Math.abs(o.y-y)<=1)||creatureSeeds.some(o=>Math.abs(o.x-x)+Math.abs(o.y-y)<=1))return 'grass';
  if((micro?x>10:x>19)&&(x*7+y*11)%13===0)return 'tree';return 'grass';
}
export function canMove(x,y){return ['grass','path','bridge'].includes(tile(x,y));}
export function destination(player,direction){const directions={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};if(typeof direction!=='string'||!Object.hasOwn(directions,direction))return null;const [dx,dy]=directions[direction],x=player.x+dx,y=player.y+dy;return canMove(x,y)?{x,y}:null;}
