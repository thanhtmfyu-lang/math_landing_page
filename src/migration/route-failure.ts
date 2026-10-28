/** Only fixed classifications and source locations leave the browser. No message,
 * URL query, identity, cookie, draft, answers or arbitrary error object is sent. */
export type RouteFailure={version:1;kind:'chunk'|'render';name:string;code:string;frames:string[]};
export function isChunkFailure(error:unknown):boolean{
  if(!error||typeof error!=='object')return false;
  const {name,message}=error as {name?:unknown;message?:unknown};
  return name==='ChunkLoadError'||typeof message==='string'&&/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading (?:CSS )?chunk [\w-]+ failed|Unable to preload CSS for/i.test(message);
}
export function routeFailure(error:unknown):RouteFailure{
  const e=error&&typeof error==='object'?error as {name?:unknown;message?:unknown;stack?:unknown}:{};
  const kind=isChunkFailure(e)?'chunk':'render',message=typeof e.message==='string'?e.message:'';
  const code=kind==='chunk'?'chunk-load':/Cannot read properties of null|null is not an object/.test(message)?'null-property':/Cannot read properties of undefined|undefined is not an object/.test(message)?'undefined-property':/is not (?:a function|iterable)/.test(message)?'invalid-type':/Rendered (?:more|fewer) hooks/.test(message)?'hook-order':'unclassified';
  // Ignore the first line: it usually repeats the untrusted error message.
  const frames=typeof e.stack==='string'?e.stack.split('\n').slice(1).flatMap(line=>{
    const frame=/(\/(?:assets|src)\/[A-Za-z0-9_./-]+\.(?:js|mjs|tsx?|jsx))(?::(\d{1,8}):(\d{1,8}))(?:\)?\s*)$/.exec(line);
    return frame&&!frame[1].includes('..')?[frame[1]+':'+frame[2]+':'+frame[3]]:[];
  }).slice(0,8):[];
  return {version:1,kind,name:typeof e.name==='string'&&['Error','TypeError','RangeError','ReferenceError','SyntaxError','ChunkLoadError'].includes(e.name)?e.name:'Error',code,frames};
}
export const CHUNK_RELOAD_KEY='mtm:chunk-reload:v1';
/** Keep the marker through reload, including repeated failures. Storage denied =>
 * no automatic reload: a memory-only marker would disappear and create a loop. */
export function reloadChunkOnce(error:unknown,storage:Pick<Storage,'getItem'|'setItem'>,reload:()=>void):boolean{
  if(!isChunkFailure(error))return false;
  try{if(storage.getItem(CHUNK_RELOAD_KEY))return false;storage.setItem(CHUNK_RELOAD_KEY,'1');}
  catch{return false;}
  reload();return true;
}
export function reportRouteFailure(error:unknown){
  try{void fetch('/api/btvn',{method:'POST',credentials:'omit',cache:'no-store',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'client-error',error:routeFailure(error)})}).catch(()=>{});}catch{/* Logging must not replace the original fallback. */}
}
