// Next rewrites this generated file for dev/build. Normalize only its exact
// known template; arbitrary declarations remain source and cannot be hidden.
export function canonicalNextTypes(bytes) {
  const text=bytes.toString('utf8').replaceAll('\r\n','\n');
  const expected='/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n';
  const tail='\n// NOTE: This file should not be edited\n// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.\n';
  const imports=text.slice(expected.length,text.length-tail.length);
  if(!text.startsWith(expected)||!text.endsWith(tail)||!/^import "\.\/(?:\.next|\.next-dev)(?:\/dev)?\/types\/routes\.d\.ts";\nimport "\.\/(?:\.next|\.next-dev)(?:\/dev)?\/types\/root-params\.d\.ts";\n$/.test(imports))return bytes;
  return Buffer.from(expected+'import "./.next/types/routes.d.ts";\nimport "./.next/types/root-params.d.ts";\n'+tail);
}
