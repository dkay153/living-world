import { deflateSync } from 'node:zlib';
import { validateArt } from './visual-releases.js';

// A deterministic contact sheet, not a claim to be a browser screenshot.
export function artPreview(pack){
  validateArt(pack);const width=384,height=256,pixels=Buffer.alloc(width*height*4);
  function rect(x,y,w,h,color){const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));for(let r=Math.floor(y);r<Math.min(height,y+h);r++)for(let c=Math.floor(x);c<Math.min(width,x+w);c++){if(r<0||c<0)continue;const at=(r*width+c)*4;pixels.set([...rgb,255],at);}}
  rect(0,0,width,height,pack.palette.void);
  const tiles=['grass','path','bridge','water','tree','house'];
  tiles.forEach((name,i)=>{const x=12+i*60;rect(x,12,48,48,pack.palette[name]);for(let row=0;row<2;row++)for(let col=0;col<2;col++)pattern(pack.tiles[name],x+col*24,12+row*24,24);});
  function pattern(spec,x,y,size){if(!spec)return;const frame=spec.frames[0],s=size/16;for(let r=0;r<16;r++)for(let c=0;c<16;c++)if(frame[r][c]!=='.')rect(x+c*s,y+r*s,s,s,spec.colors[parseInt(frame[r][c],16)]);}
  Object.entries(pack.sprites).forEach(([name,spec],i)=>{const x=12+(i%6)*60,y=88+Math.floor(i/6)*76;rect(x,y,48,48,pack.palette.grass);pattern(spec,x,y,48);});
  // Show the protected label outline colors and selected presentation tokens.
  const colors=Object.values(pack.palette);colors.forEach((color,i)=>rect(12+(i%24)*15,220+Math.floor(i/24)*12,12,9,color));
  const raw=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)pixels.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
  function crc(data){let n=0xffffffff;for(const byte of data){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;}
  function chunk(type,data){const label=Buffer.from(type),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([label,data])));return Buffer.concat([size,label,data,sum]);}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
