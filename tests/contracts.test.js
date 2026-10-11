import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConstitutionFixtures,loadFeatureContracts,validateFeatureContract } from '../server/contracts.js';

test('protected commitments and feature contracts have a complete executable vocabulary',async()=>{
  const fixtures=await loadConstitutionFixtures(),{registry,contracts}=await loadFeatureContracts();
  assert.equal(fixtures.protectedCommitments.length,6);
  assert.ok(registry.stateGroups.some(group=>group.id==='player.vitality'));
  assert.ok(registry.stateGroups.some(group=>group.id==='presentation'));
  assert.equal(contracts[0].id,'micro-world-core');
  assert.ok(contracts[0].affectedStateGroups.includes('encounter'));
});

test('feature contracts reject missing recovery and unregistered state surfaces',async()=>{
  const {registry,contracts}=await loadFeatureContracts();
  const missingRecovery={...contracts[0],recovery:''};
  assert.throws(()=>validateFeatureContract(missingRecovery,registry),/recovery/);
  const unknownState={...contracts[0],affectedStateGroups:[...contracts[0].affectedStateGroups,'world.unknown']};
  assert.throws(()=>validateFeatureContract(unknownState,registry),/unknown/);
});
