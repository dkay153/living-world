import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const directory=new URL('../tests/',import.meta.url);
const entries=await readdir(directory,{withFileTypes:true});
const files=entries.filter(entry=>entry.isFile()&&entry.name.endsWith('.test.js')).map(entry=>fileURLToPath(new URL(entry.name,directory))).sort();
if(!files.length)throw new Error('No project tests found');
// Default recursive discovery would execute untrusted tests in saved AI candidates.
const child=spawn(process.execPath,['--test',...files],{stdio:'inherit',windowsHide:true});
child.once('error',()=>{process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??1;});
