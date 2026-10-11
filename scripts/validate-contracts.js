import { loadConstitutionFixtures,loadFeatureContracts } from '../server/contracts.js';

const [fixtures,{registry,contracts}]=await Promise.all([loadConstitutionFixtures(),loadFeatureContracts()]);
console.log('LW_CONTRACTS_OK');
console.log(JSON.stringify({constitution:fixtures.protectedCommitments.map(item=>item.id),stateGroups:registry.stateGroups.map(item=>item.id),featureContracts:contracts.map(item=>item.id)}));
