import test from 'node:test';
import assert from 'node:assert/strict';
import { beginEncounter,resolveTurn } from '../server/combat.js';
const state=()=>({hp:30,maxHp:30,inventory:{dewleaf:1},quest:'active',battle:beginEncounter({id:'a',name:'Mossling',maxHp:12,damage:3})});
test('encounter commands resolve turns; rejected items consume no turn',()=>{
 const s=state();resolveTurn(s,'heal');assert.equal(s.battle.turn,1);assert.equal(s.inventory.dewleaf,1);
 resolveTurn(s,'guard');assert.equal(s.hp,29);assert.equal(s.battle.turn,2);
 resolveTurn(s,'heal');assert.equal(s.hp,27);assert.equal(s.inventory.dewleaf,0);
 const turn=s.battle.turn;resolveTurn(s,'heal');assert.equal(s.battle.turn,turn);
 resolveTurn(s,'attack');resolveTurn(s,'attack');const hp=s.hp;assert.equal(resolveTurn(s,'attack').outcome,'victory');assert.equal(s.hp,hp);assert.equal(s.battle,null);
});
test('retreat exits safely; defeat exits without allowing further battle rewards',()=>{
 const a=state();assert.equal(resolveTurn(a,'retreat').outcome,'retreat');assert.equal(a.hp,30);
 const b=state();b.hp=1;assert.equal(resolveTurn(b,'attack').outcome,'defeat');assert.equal(b.battle,null);assert.equal(resolveTurn(b,'attack').outcome,null);
});
