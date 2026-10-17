// Supervises only child objects created by this launcher. No PID/name-based
// killing and no candidate executable/arguments. Deliberate shutdown never
// schedules a replacement; transient failures use bounded exponential backoff.
export function createServiceSupervisor({spawnService,stopService,onEvent=()=>{},clock=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}){
  const services=new Map();let closing=false;
  function launch(record){
    if(closing)return;record.timer=null;
    const child=spawnService(record.args);record.child=child;record.started=clock();onEvent({service:record.name,state:'started'});
    let ended=false;const endedOnce=()=>{if(ended||closing||record.child!==child)return;ended=true;record.child=null;
      record.failures=record.failures.filter(at=>clock()-at<3600000);record.failures.push(clock());
      const wait=record.failures.length<=3?[1000,5000,30000][record.failures.length-1]:900000;
      onEvent({service:record.name,state:'recovering',retryInMs:wait});record.timer=setTimer(()=>launch(record),wait);record.timer?.unref?.();
    };child.once('error',endedOnce);child.once('exit',endedOnce);
  }
  return {
    start(name,args){if(closing||services.has(name))throw Error('Service already supervised or closing');const record={name,args:[...args],child:null,timer:null,failures:[]};services.set(name,record);launch(record);return record.child;},
    async repair(name){const record=services.get(name);if(!record||closing)throw Error('Service is not owned by this launcher');if(record.child)await stopService(record.child);},
    async checkHealth(name,probe){const record=services.get(name);if(!record||closing||!record.child||record.probing)return;record.probing=true;const child=record.child;
      try{const healthy=await probe();if(record.child!==child||closing)return;record.misses=healthy?0:(record.misses||0)+1;if(record.misses>=3){record.misses=0;onEvent({service:name,state:'unhealthy'});await stopService(child);}}
      finally{record.probing=false;}
    },
    status(){return [...services.values()].map(r=>({name:r.name,running:!!r.child,pending:!!r.timer,failures:r.failures.length}));},
    async close(){closing=true;await Promise.allSettled([...services.values()].map(async r=>{clearTimer(r.timer);if(r.child)await stopService(r.child);r.child=null;}));}
  };
}
