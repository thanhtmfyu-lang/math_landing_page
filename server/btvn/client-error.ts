import type {RouteFailure} from '../../src/migration/route-failure';
/** Strict allowlist; never log caller-supplied messages, component props or identity. */
export function safeClientError(input:unknown):RouteFailure|null{
  if(!input||typeof input!=='object'||Array.isArray(input))return null;
  const e=input as Record<string,unknown>;
  if(e.version!==1||!['chunk','render'].includes(String(e.kind))||!['Error','TypeError','RangeError','ReferenceError','SyntaxError','ChunkLoadError'].includes(String(e.name))||!['chunk-load','null-property','undefined-property','invalid-type','hook-order','unclassified'].includes(String(e.code))||!Array.isArray(e.frames)||e.frames.length>8)return null;
  if(e.frames.some(f=>typeof f!=='string'||f.length>180||f.includes('..')||!/^\/(?:assets|src)\/[A-Za-z0-9_./-]+\.(?:js|mjs|tsx?|jsx):\d{1,8}:\d{1,8}$/.test(f)))return null;
  return {version:1,kind:e.kind as RouteFailure['kind'],name:String(e.name),code:String(e.code),frames:e.frames as string[]};
}
// Bound anonymous log volume without recording IPs or student sessions.
export function createClientErrorLogger(log:(label:string,value:RouteFailure)=>void=console.error,clock=Date.now){
  let since=0,count=0;
  return (input:unknown)=>{const error=safeClientError(input);if(!error)return false;
    const now=clock();if(now-since>=60000){since=now;count=0;}if(count>=30)return true;
    count++;log('[route-error]',error);return true;
  };
}
