import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseDeveloperRoute } from '../server/developer-routing.js';

const models=[{id:'gpt-5.6-luna'},{id:'gpt-5.6-terra'},{id:'gpt-6-astra'}];
test('automatic developer routing uses the strongest available account model and task-appropriate effort',()=>{
  assert.deepEqual(chooseDeveloperRoute({task:'Repair a database migration and recovery path',models}),{model:'gpt-6-astra',effort:'high',reason:'automatic account-catalog routing'});
  assert.deepEqual(chooseDeveloperRoute({task:'Rename one visible label',models}),{model:'gpt-6-astra',effort:'low',reason:'automatic account-catalog routing'});
});
test('a saved model and effort remain explicit routing overrides',()=>{
  assert.deepEqual(chooseDeveloperRoute({task:'Anything',models,model:'gpt-5.6-terra',effort:'medium'}),{model:'gpt-5.6-terra',effort:'medium',reason:'saved model override'});
  assert.equal(chooseDeveloperRoute({models,model:'missing',effort:'auto'}),null);
});
