import {readFile,lstat} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function crc(bytes){let n=0xffffffff;for(const byte of bytes){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;}
export function validatePng(bytes){
  if(bytes.length<45||bytes.length>4*1024*1024||!bytes.subarray(0,8).equals(signature))throw Error('Invalid evidence PNG');
  let at=8,width=0,height=0,channels=0,ended=false;const data=[];
  while(at<bytes.length){
    if(at+12>bytes.length)throw Error('Truncated evidence PNG');const size=bytes.readUInt32BE(at),end=at+12+size;if(end>bytes.length)throw Error('Truncated PNG chunk');
    const type=bytes.toString('ascii',at+4,at+8),payload=bytes.subarray(at+8,end-4);if(crc(bytes.subarray(at+4,end-4))!==bytes.readUInt32BE(end-4))throw Error('PNG checksum mismatch');
    if(at===8&&type!=='IHDR')throw Error('Missing PNG header');
    if(type==='IHDR'){
      if(width||size!==13)throw Error('Invalid PNG header');width=payload.readUInt32BE(0);height=payload.readUInt32BE(4);channels=({0:1,2:3,4:2,6:4})[payload[9]];
      if(!width||!height||width>4096||height>4096||width*height>4*1024*1024||payload[8]!==8||!channels||payload[10]||payload[11]||payload[12])throw Error('Unsupported evidence PNG dimensions or format');
    }else if(type==='IDAT')data.push(payload);else if(type==='IEND'){if(size||end!==bytes.length)throw Error('Invalid PNG end');ended=true;}
    at=end;
  }
  if(!ended||!data.length)throw Error('Incomplete evidence PNG');const stride=width*channels+1,raw=inflateSync(Buffer.concat(data),{maxOutputLength:height*stride});if(raw.length!==height*stride)throw Error('PNG pixel length mismatch');for(let y=0;y<height;y++)if(raw[y*stride]>4)throw Error('Invalid PNG row filter');
  return {width,height,bytes:bytes.length};
}
// Checks host-produced evidence without a CLI session, network or paid turn.
export async function validateEvidenceImages(paths){
  if(!Array.isArray(paths)||!paths.length||paths.length>3)throw Error('Choose 1-3 evidence images');
  const results=[];for(const path of paths){const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>4*1024*1024)throw Error('Invalid evidence image file');results.push(validatePng(await readFile(path)));}return results;
}
