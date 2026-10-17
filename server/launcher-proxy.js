// A dev-renderer disconnect must not terminate the launcher or its services.
export function proxyFailure(response){
  if(response.destroyed||response.writableEnded)return;
  if(response.headersSent){response.destroy();return;}
  response.writeHead(502);response.end('Development service unavailable. Reload shortly.');
}
