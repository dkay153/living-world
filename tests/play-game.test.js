import test from 'node:test';
import assert from 'node:assert/strict';
import {validateJourney,playGame} from '../scripts/play-game.js';
test('playthrough inputs select private game routes and bounded evidence paths',()=>{
  assert.equal(validateJourney().route,'/legacy/');
  assert.equal(validateJourney({steps:[{action:'press',value:'ArrowRight'},{action:'reload'}]}).steps.length,2);
  for(const input of [{route:'http://production/'},{capture:'../history.png'},{width:99999},{steps:[{action:'evaluate',value:'anything'}]},{steps:[{action:'wait',value:600000}]},{steps:[{action:'click'}]},{steps:Array(61).fill({action:'reload'})},{url:'http://localhost'}])assert.throws(()=>validateJourney(input));
});
test('playthrough cannot launch on the owner host',async()=>{
  if(process.platform!=='linux'||process.getuid?.()!==10002)await assert.rejects(playGame({}),/contained development/);
});
