// Project execution receipts, not model reasoning or raw CLI logs.
// Never retain tool arguments, environment values, command output or RPC bodies.
const executables=['rg','node','npm','git','python','python3','pwsh','powershell','Get-Content','Get-ChildItem','cat','ls'];
const token=value=>typeof value==='string'&&/^[-a-zA-Z0-9_.:]{1,100}$/.test(value)?value:null;
export function executionEvent(previous,event,stage,now=Date.now()){
  const receipt={...(previous||{}),stage,lastEventAt:now,eventCount:(previous?.eventCount||0)+1,tools:[...(previous?.tools||[])],messages:[...(previous?.messages||[])]};
  if(['summary.delta','summary.part'].includes(event.type)){
    const id=token(event.itemId),index=event.index;
    if(!event.harness||!id||!Number.isSafeInteger(index)||index<0)return receipt;
    const key=`${stage}:${id}:${index}`,old=receipt.workingNote;
    if(event.type==='summary.delta'&&typeof event.delta==='string'&&event.delta.length<=16000){
      receipt.workingNote={id:key,stage,text:((old?.id===key?old.text:'')+event.delta).slice(-2000),updatedAt:now,source:'provider_summary'};
    }
    return receipt;
  }
  if(event.harness){receipt.harness={...(receipt.harness||{}),provider:'codex_app_server'};if(event.type==='thread.started'&&token(event.thread_id))receipt.harness.threadId=event.thread_id;if(event.type==='harness.skills'&&Number.isInteger(event.count))receipt.harness.skills=event.count;if(['turn.started','turn.completed','turn.failed'].includes(event.type))receipt.harness.state=event.type;}
  const item=event.item;
  if(!item||!['item.started','item.updated','item.completed'].includes(event.type))return receipt;
  const id=token(item.id);if(!id)return receipt;
  if(item.type==='agent_message'&&event.type==='item.completed'&&item.channel!=='analysis'){
    const text=typeof item.text==='string'?item.text.trim().slice(0,3000):'';
    if(text){const key=`${stage}:${id}`;receipt.messages=receipt.messages.filter(message=>message.id!==key).concat({id:key,text,stage,createdAt:now}).slice(-24);}
    return receipt;
  }
  let name=null,detail='';
  if(item.type==='command_execution'){
    name='Shell command';
    // Only a known executable name is disclosed; never its arguments.
    const first=String(item.command||'').trim().replace(/^&\s*/, '').match(/^(?:"([^"]+)"|'([^']+)'|([^\s;|&()]+))/);
    const basename=(first?.[1]||first?.[2]||first?.[3]||'').split(/[\\/]/).at(-1).replace(/\.exe$/i,'');
    const executable=[...executables,'cmd','echo','dir','type','Get-Location','Set-Location','Test-Path'].find(value=>value.toLowerCase()===basename.toLowerCase());
    detail=executable?`Executable: ${executable}`:'Command arguments and output are kept private.';
  }else if(item.type==='file_change'){
    name='File changes';detail=`${Array.isArray(item.changes)?item.changes.length:0} file changes reported in the candidate.`;
  }else if(item.type==='mcp_tool_call'){
    name='Connected tool';detail=[token(item.server),token(item.tool)].filter(Boolean).join(' / ')||'Tool identifiers unavailable.';
  }else if(item.type==='image_view'){
    name='Image inspection';detail='The native image tool opened a visual input.';
  }else if(item.type==='web_search'){
    name='Web search';detail='Search request reported by the CLI; query text is kept private.';
  }
  if(!name)return receipt;
  const failed=item.status==='failed'||item.error!=null||(Number.isInteger(item.exit_code)&&item.exit_code!==0);
  const state=failed?'failed':event.type==='item.completed'||item.status==='completed'?'completed':'running';
  const key=`${stage}:${id}`,existing=receipt.tools.find(tool=>tool.id===key);
  const tool={id:key,name,detail,stage,state,source:event.harness?'codex_harness':'codex_cli',reportedType:item.type,startedAt:existing?.startedAt||now,updatedAt:now,...(Number.isInteger(item.exit_code)?{exitCode:item.exit_code}:{})};
  receipt.tools=receipt.tools.filter(tool=>tool.id!==key).concat(tool).slice(-40);
  receipt.current=`${state==='running'?'Running':state==='failed'?'Failed':'Completed'}: ${name}${detail.startsWith('Executable: ')?` (${detail.slice(12)})`:''}`;
  return receipt;
}
