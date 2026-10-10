import { resolve } from 'node:path';
import { createRpc } from './codex-process.js';

export function safeLogin(result) {
  const raw=result.type==='chatgptDeviceCode'?result.verificationUrl:result.authUrl;
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.hostname!=='auth.openai.com'||url.username||url.password)throw new Error('Unexpected Codex sign-in address');
  return {type:result.type,loginId:result.loginId,url:url.href,...(result.type==='chatgptDeviceCode'?{userCode:String(result.userCode).slice(0,80)}:{})};
}
export function createCodexConnection({home,cwd,rpcFactory=createRpc}) {
  let login=null,loginError=null,closed=false,loginStarting=false;
  const rpc=rpcFactory({home:resolve(home),cwd,onNotification(method,params){
    if(method==='account/login/completed'&&params.loginId===login?.loginId){login=null;loginError=params.success?null:'Sign-in did not complete. Retry or use the other sign-in method.';}
  }});
  async function status(){
    const result=await rpc.request('account/read',{refreshToken:false});
    const a=result.account;
    const account=a?{type:a.type,email:a.type==='chatgpt'?a.email:null,planType:a.type==='chatgpt'?a.planType:null}:null;
    return {available:true,account,connected:account?.type==='chatgpt',login,loginError};
  }
  async function startLogin(type){
    if(closed)throw new Error('Connection stopped');
    if(!['chatgpt','chatgptDeviceCode'].includes(type))throw new Error('Choose browser or headless sign-in');
    if(login||loginStarting)throw new Error('A sign-in is already pending');loginStarting=true;
    try{const result=await rpc.request('account/login/start',{type});login=safeLogin(result);loginError=null;return login;}finally{loginStarting=false;}
  }
  async function cancelLogin(){if(login)await rpc.request('account/login/cancel',{loginId:login.loginId});login=null;}
  async function logout(){await cancelLogin();await rpc.request('account/logout');}
  async function catalog(){
    if(!(await status()).connected)throw new Error('Connect a ChatGPT Codex account first');
    let cursor=null,data=[];
    for(let page=0;page<10;page++){
      const result=await rpc.request('model/list',{cursor,limit:100,includeHidden:false});
      data.push(...(result.data||[]).filter(m=>!m.hidden).map(m=>({id:m.model,name:m.displayName||m.model})));cursor=result.nextCursor;if(!cursor)break;
    }
    return data.filter(m=>typeof m.id==='string'&&/^[-a-zA-Z0-9_.:]{1,120}$/.test(m.id));
  }
  async function limits(){
    if(!(await status()).connected)return null;
    const result=await rpc.request('account/rateLimits/read');
    const windows=Object.values(result.rateLimitsByLimitId||{codex:result.rateLimits}).filter(Boolean);
    return windows.map(w=>({name:w.limitName||w.limitId||'Codex',primary:w.primary,secondary:w.secondary}));
  }
  async function close(){closed=true;await rpc.close();}
  return {status,startLogin,cancelLogin,logout,catalog,limits,close};
}
