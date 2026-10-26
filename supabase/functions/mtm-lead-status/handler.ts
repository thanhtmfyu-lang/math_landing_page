type RpcResult={data:unknown;error:null|{code?:string}};
type Deps={rpc:(token:string,command:Record<string,unknown>)=>Promise<RpcResult>};
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const states=['HOC_THU','DA_HOC_THU','CHINH_THUC','KHONG_HOC'];
export function validCommand(v:unknown):v is Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const c=v as Record<string,unknown>,keys=Object.keys(c).sort().join(',');
 if(!uuid(c.leadId))return false;
 if(c.action==='get')return keys==='action,leadId';
 if(c.action!=='set'||keys!=='action,actorRef,className,effectiveDate,eventId,expectedEventId,expectedStatus,leadId,source,sourceReceipt,status')return false;
 if(c.expectedEventId!==null&&!uuid(c.expectedEventId))return false;
 if(!uuid(c.eventId)||typeof c.status!=='string'||!states.includes(c.status)||!(c.expectedStatus===null||typeof c.expectedStatus==='string'&&states.includes(c.expectedStatus)))return false;
 if(typeof c.source!=='string'||!['web','bot-zalo','manager','l10'].includes(c.source))return false;
 if(typeof c.actorRef!=='string'||!c.actorRef.match(/^[a-zA-Z][a-zA-Z0-9_.:/-]{0,159}$/))return false;
 if(typeof c.sourceReceipt!=='string'||!c.sourceReceipt.match(/^[a-zA-Z][a-zA-Z0-9_.:/-]{0,299}$/))return false;
 if(c.status==='CHINH_THUC')return typeof c.className==='string'&&c.className.trim().length>0&&c.className.length<=100&&typeof c.effectiveDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(c.effectiveDate);
 return c.className===null&&c.effectiveDate===null;
}
/** VPS worker only: existing J33 token checked in DB, no browser CORS or sends. */
export function createLeadStatusHandler(deps:Deps){return async(request:Request)=>{
 const json=(status:number,value:unknown)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(request.method!=='POST'||new URL(request.url).search)return json(405,{ok:false,code:'METHOD'});
 const match=request.headers.get('authorization')?.match(/^Bearer ([^\s]{16,4096})$/);
 if(!match)return json(401,{ok:false,code:'AUTH'});
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json(415,{ok:false,code:'JSON'});
 let command:unknown;
 try{
  const reader=request.body?.getReader();if(!reader)return json(400,{ok:false,code:'INPUT'});
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();return json(413,{ok:false,code:'SIZE'});}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  command=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }catch{return json(400,{ok:false,code:'INPUT'});}
 if(!validCommand(command))return json(400,{ok:false,code:'INPUT'});
 try{
  const out=await deps.rpc(match[1],command);
  if(out.error)return json(out.error.code==='42501'||out.error.code==='28000'?401:out.error.code?.startsWith('22')?400:503,{ok:false,code:out.error.code==='42501'||out.error.code==='28000'?'AUTH':out.error.code?.startsWith('22')?'INPUT':'DB_UNAVAILABLE'});
  const value=out.data as {ok?:boolean;code?:string};
  if(value?.ok===true)return json(200,value);
  if(value?.code==='NOT_FOUND')return json(404,value);
  if(value?.code==='STATUS_CONFLICT'||value?.code==='EVENT_CONFLICT')return json(409,value);
  return json(503,{ok:false,code:'DB_UNAVAILABLE'});
 }catch{return json(503,{ok:false,code:'DB_UNAVAILABLE'});}
};}
