// Runs as observer UID 10002, separate from candidate game/build/test UID 10001.
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const require=createRequire('/opt/lw-deps/package.json');const {chromium}=require('playwright-core'),{WebSocket}=require('ws');
if(process.platform!=='linux'||process.getuid()!==10002)throw new Error('Contained observer identity required');
const base='http://127.0.0.1:3000',report={version:1,passed:false,checks:[],limits:'Compatibility fixtures and browser checks are independent mechanical evidence, not proof of artistic quality.'};
let browser,socket,state,welcome,version=0,guest=randomBytes(32).toString('hex');
const wait=ms=>new Promise(done=>setTimeout(done,ms));
async function until(check,label){for(let i=0;i<100;i++){if(check())return;await wait(50);}throw new Error(label);}
async function connect(){state=null;socket=new WebSocket(base.replace('http','ws')+'/world',{origin:base,headers:{Cookie:'lw_session='+guest}});socket.on('error',()=>{});socket.on('message',raw=>{const message=JSON.parse(raw);if(message.type==='welcome')welcome=message;if(message.type==='state'){state=message;version++;}});await until(()=>!!state,'Authoritative connection');}
async function action(value){await wait(170);const previous=version;socket.send(JSON.stringify(value));await until(()=>version>previous,'Acknowledged action');}
const position=()=>state.players.find(player=>player.id===welcome.id);
async function near(target){
  const start=position(),queue=[[start.x,start.y,[]]],seen=new Set([`${start.x},${start.y}`]);let path;
  while(queue.length){const [x,y,steps]=queue.shift();if(Math.abs(x-target.x)+Math.abs(y-target.y)<=1){path=steps;break;}
    for(const [direction,dx,dy] of [['up',0,-1],['down',0,1],['left',-1,0],['right',1,0]]){const a=x+dx,b=y+dy,key=`${a},${b}`;if(!seen.has(key)&&['grass','path','bridge'].includes(welcome.tiles[b]?.[a])){seen.add(key);queue.push([a,b,[...steps,direction]]);}}
  }
  if(!path)throw new Error('Unreachable narrative anchor');for(const direction of path)await action({type:'move',direction});
}
try{
  await connect();const object=id=>welcome.objects.find(item=>item.id===id);
  if(!object('keeper')||!object('stone')||!object('ruin'))throw new Error('Narrative anchors missing');
  await near(object('keeper'));await action({type:'interact'});if(state.journey.quest!=='active')throw new Error('Quest acceptance');
  for(const id of ['herb-a','herb-b']){await near(object(id));await action({type:'interact'});}
  await near(object('stone'));await action({type:'interact'});
  await near(state.creatures.find(item=>item.id==='moss-1'));await action({type:'attack'});await action({type:'guard'});await action({type:'retreat'});if(state.journey.battle)throw new Error('Retreat did not preserve player choice');
  for(const id of ['moss-1','moss-2']){await near(state.creatures.find(item=>item.id===id));await action({type:'attack'});if(!state.journey.battle)throw new Error('Distinct encounter absent');let turns=0;while(state.journey.battle){if(++turns>20)throw new Error('Encounter cannot complete');await action({type:'attack'});}}
  await near(object('keeper'));await action({type:'interact'});if(state.journey.quest!=='complete')throw new Error('Quest completion');
  const before=JSON.stringify({quest:state.journey.quest,victories:state.journey.victories,discoveries:state.discoveries});socket.close();await wait(100);await connect();
  if(before!==JSON.stringify({quest:state.journey.quest,victories:state.journey.victories,discoveries:state.discoveries}))throw new Error('Reconnect lost history');
  // Malformed relocation cannot decide authoritative position.
  const location=JSON.stringify(position());socket.send(JSON.stringify({type:'move',direction:'teleport',x:999,y:999}));await wait(300);if(JSON.stringify(position())!==location)throw new Error('Client teleport accepted');
  report.checks.push('guard and retreat preserve command-driven choice','quest reward and discoveries persist on reconnect','malformed movement rejected');
  socket.close();await wait(100);guest='2'.repeat(64);await connect();
  if(state.journey.battle?.turn!==2||state.journey.hp!==17)throw new Error('Saved encounter did not resume');
  await action({type:'guard'});await action({type:'retreat'});if(state.journey.battle)throw new Error('Saved encounter cannot resolve');
  socket.close();await wait(100);guest='1'.repeat(64);await connect();
  if(state.journey.quest!=='complete'||state.journey.victories!==2||state.journey.deaths!==1)throw new Error('Veteran progress lost');
  report.checks.push('saved encounter resumes and supports retreat','completed veteran history remains complete');
  browser=await chromium.launch({headless:true,chromiumSandbox:true});
  const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'});const page=await context.newPage();
  await page.goto(base+'/');await page.locator('iframe').waitFor();
  const game=page.frameLocator('iframe');await game.locator('#connection').filter({hasText:'WORLD ONLINE'}).waitFor({timeout:10000});
  await page.screenshot({path:'/work/observations/desktop.png',fullPage:true});
  for(const width of [1280,390]){await page.setViewportSize({width,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('UI overflow');}
  await page.screenshot({path:'/work/observations/mobile.png',fullPage:true});
  if(!await game.locator('#world').getAttribute('aria-label'))throw new Error('Accessible world feedback missing');
  report.checks.push('React shell and canvas connect','desktop and mobile render','accessible world label');report.passed=true;
}catch(error){report.error=String(error.message).slice(-4000);}
finally{socket?.terminate();await browser?.close();await writeFile('/work/observations/report.json',JSON.stringify(report));if(!report.passed)process.exitCode=1;}
