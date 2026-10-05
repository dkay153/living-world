import { resolve } from 'node:path';
import { openStore } from '../server/store.js';
import { createSteward } from '../server/steward.js';
const store=openStore(resolve(process.env.DATA_DIR||'data','world.sqlite'));
try {
  const steward=createSteward(store);
  if(process.argv.includes('--once'))steward.tick();
  console.log(JSON.stringify({...steward.status(),
    memories:store.db.prepare('SELECT COUNT(*) AS count FROM memories').get().count,
    events:store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count,
    itemInstances:store.db.prepare('SELECT COUNT(*) AS count FROM item_instances').get().count
  },null,2));
}finally{store.db.close();}
