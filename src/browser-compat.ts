import 'core-js/actual/object/has-own';
import 'core-js/actual/array/at';

// Entry-point import runs before application modules. Keep UUIDs cryptographically random.
if(typeof AbortSignal!=='undefined'&&!AbortSignal.timeout){
  AbortSignal.timeout=(ms:number)=>{
    if(!Number.isInteger(ms)||ms<0||ms>Number.MAX_SAFE_INTEGER)throw new RangeError('Invalid timeout');
    const controller=new AbortController();
    setTimeout(()=>controller.abort(new DOMException('The operation timed out','TimeoutError')),ms);
    return controller.signal;
  };
}
if(globalThis.crypto&&!globalThis.crypto.randomUUID){
  globalThis.crypto.randomUUID=()=>{
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`;
  };
}
