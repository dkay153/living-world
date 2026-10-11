import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const plainObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const nonEmpty=value=>typeof value==='string'&&value.trim().length>0;
const uniqueStrings=value=>Array.isArray(value)&&value.length>0&&value.every(nonEmpty)&&new Set(value).size===value.length;

export async function readJson(path){
  return JSON.parse(await readFile(path,'utf8'));
}

export async function loadStateRegistry(projectDir=resolve('.')){
  const registry=await readJson(resolve(projectDir,'config','state-registry.json'));
  validateStateRegistry(registry);
  return registry;
}

export function validateStateRegistry(registry){
  if(!plainObject(registry)||registry.version!==1||!Array.isArray(registry.stateGroups)||registry.stateGroups.length<1)throw new Error('Invalid state registry');
  const ids=new Set();
  for(const group of registry.stateGroups){
    if(!plainObject(group)||!nonEmpty(group.id)||!nonEmpty(group.authority)||!nonEmpty(group.visibility)||!nonEmpty(group.description)||ids.has(group.id))throw new Error('Invalid state group');
    ids.add(group.id);
  }
  return registry;
}

export async function loadConstitutionFixtures(projectDir=resolve('.')){
  const fixtures=await readJson(resolve(projectDir,'config','constitution-fixtures.json'));
  validateConstitutionFixtures(fixtures);
  return fixtures;
}

export function validateConstitutionFixtures(fixtures){
  if(!plainObject(fixtures)||fixtures.version!==1||!Array.isArray(fixtures.protectedCommitments)||fixtures.protectedCommitments.length<6)throw new Error('Invalid constitution fixtures');
  const ids=new Set();
  for(const fixture of fixtures.protectedCommitments){
    if(!plainObject(fixture)||!nonEmpty(fixture.id)||!nonEmpty(fixture.statement)||!uniqueStrings(fixture.requiredSignals)||ids.has(fixture.id))throw new Error('Invalid protected commitment');
    ids.add(fixture.id);
  }
  return fixtures;
}

export function validateFeatureContract(contract,registry){
  validateStateRegistry(registry);
  if(!plainObject(contract)||contract.version!==1||!nonEmpty(contract.id)||!nonEmpty(contract.title)||!nonEmpty(contract.playerPromise)||!nonEmpty(contract.category))throw new Error('Feature contract needs identity and player promise');
  const known=new Set(registry.stateGroups.map(group=>group.id));
  if(!uniqueStrings(contract.affectedStateGroups)||contract.affectedStateGroups.some(id=>!known.has(id)))throw new Error('Feature contract names an unknown or duplicate state group');
  for(const field of ['authorities','intents','invariants','presentation','validation'])if(!uniqueStrings(contract[field]))throw new Error(`Feature contract needs ${field}`);
  for(const field of ['recovery','retirement'])if(!nonEmpty(contract[field]))throw new Error(`Feature contract needs ${field}`);
  return contract;
}

export async function loadFeatureContracts(projectDir=resolve('.')){
  const { readdir }=await import('node:fs/promises');
  const registry=await loadStateRegistry(projectDir);
  const directory=resolve(projectDir,'config','feature-contracts');
  const names=(await readdir(directory)).filter(name=>name.endsWith('.json')).sort();
  if(!names.length)throw new Error('No feature contracts found');
  const contracts=[];
  const ids=new Set();
  for(const name of names){
    const contract=validateFeatureContract(await readJson(resolve(directory,name)),registry);
    if(ids.has(contract.id))throw new Error('Duplicate feature contract');
    ids.add(contract.id);contracts.push(contract);
  }
  return {registry,contracts};
}
