export type GatewayDeps={publishableKey:string;origins:string[];networkKey:(request:Request)=>Promise<string>;rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:null|{code?:string}}> ;download:(path:string)=>Promise<Blob>};
const token=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{64}$/i.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const revision=(v:unknown)=>Number.isInteger(v)&&Number(v)>0;
const answers=(v:unknown)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&JSON.stringify(v).length<=524288;
function operation(body:Record<string,unknown>):{name:string;args:Record<string,unknown>}|null{
 const op=body.operation,base={p_session:body.session};
 if(op==='forgot'){
  // 18/10: mã PIN 6 số (pin để vào, newPin để đặt lần đầu); chỉ nhận đúng các khoá này.
  const keys=Object.keys(body).sort().filter(k=>k!=='pin'&&k!=='newPin').join(',');
  if(keys!=='className,fullName,operation,phone'||!['fullName','phone','className'].every(k=>typeof body[k]==='string'&&String(body[k]).trim().length>0&&String(body[k]).length<=160))return null;
  if(['pin','newPin'].some(k=>body[k]!==undefined&&!(typeof body[k]==='string'&&/^[0-9]{6}$/.test(String(body[k])))))return null;
  return {name:'mtm_btvn_forgot_pin',args:{p_full_name:body.fullName,p_phone:body.phone,p_class_name:body.className,p_pin:body.pin??null,p_new_pin:body.newPin??null}};
 }
 if(op==='resolve'){if(typeof body.code!=='string'||body.code.length>80||!/^[a-f0-9]{32}$/i.test(body.code.replace(/[\s-]/g,'')))return null;return{name:'mtm_hw_resolve_code',args:{p_code:body.code}};}
 if(op==='confirm')return token(body.challenge)?{name:'mtm_hw_confirm',args:{p_challenge:body.challenge,p_confirm:true}}:null;
 if(!token(body.session))return null;
 if(['me','logout','assignments','history'].includes(String(op)))return {name:'mtm_hw_'+op,args:base};
 if(op==='start')return uuid(body.assignment)?{name:'mtm_hw_start',args:{...base,p_assignment:body.assignment}}:null;
 if(op==='result')return uuid(body.attempt)?{name:'mtm_hw_result',args:{...base,p_attempt:body.attempt}}:null;
 if(op==='pdf')return uuid(body.attempt)&&['questions','solutions'].includes(String(body.kind))?{name:'mtm_hw_pdf_access',args:{...base,p_attempt:body.attempt,p_kind:body.kind}}:null;
 if(op==='save'||op==='submit'){if(!uuid(body.attempt)||!revision(body.revision)||!answers(body.answers)||op==='submit'&&!uuid(body.submissionKey))return null;return{name:op==='save'?'mtm_hw_save_answers':'mtm_hw_submit',args:{...base,p_attempt:body.attempt,p_revision:body.revision,p_answers:body.answers,...(op==='submit'?{p_submission_key:body.submissionKey}:{})}};}
 return null;
}
/** No arbitrary RPC, table, path, user id, score or timestamp accepted from the browser. */
export function createHomeworkHandler(deps:GatewayDeps){return async(request:Request)=>{
 const origin=request.headers.get('origin')??'',cors={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const json=(status:number,code:string,data?:unknown)=>Response.json(data??{error:code},{status,headers:cors});
 if(!deps.origins.includes(origin))return new Response('Forbidden',{status:403});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(request.method!=='POST'||new URL(request.url).search)return json(405,'METHOD');
 if(!deps.publishableKey||request.headers.get('apikey')!==deps.publishableKey)return json(401,'KEY');
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json(415,'JSON');
 try{
  const reader=request.body?.getReader();if(!reader)return json(400,'BODY');let bytes=0;const chunks:Uint8Array[]=[];
  for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>524288){await reader.cancel();return json(413,'SIZE');}chunks.push(value);}
  const raw=new Uint8Array(bytes);let offset=0;for(const b of chunks){raw.set(b,offset);offset+=b.length;}
  const body=JSON.parse(new TextDecoder().decode(raw));if(!body||typeof body!=='object'||Array.isArray(body))return json(400,'BODY');
  if(body.operation==='resolve'||body.operation==='forgot'){const key=await deps.networkKey(request),limit=await deps.rpc('mtm_btvn_gateway_rate',{p_network_key:key});if(limit.error)return json(503,'BUSY');if((limit.data as {ok?:boolean})?.ok!==true)return json(429,'RATE');}
  const route=operation(body);if(!route)return json(400,'INPUT');
  const out=await deps.rpc(route.name,route.args);if(out.error)return json(out.error.code==='42501'?401:out.error.code==='40001'?409:400,out.error.code??'RPC');
  if(body.operation!=='pdf')return json(200,'OK',out.data);
  const asset=(out.data as {asset:{path:string;sha256:string;bytes:number}})?.asset;if(!asset||typeof asset.path!=='string'||!uuid(asset.path.split('/')[0])||!uuid(asset.path.split('/')[1])||!/^[0-9a-f]{64}$/.test(asset.sha256)||asset.path!==asset.path.split('/').slice(0,2).join('/')+'/'+asset.sha256+'-'+body.kind+'.pdf'||!Number.isInteger(asset.bytes)||asset.bytes<8||asset.bytes>15728640)return json(500,'ASSET');
  const blob=await deps.download(asset.path),data=await blob.arrayBuffer();if(data.byteLength!==asset.bytes||new TextDecoder().decode(data.slice(0,5))!=='%PDF-')return json(502,'PDF');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==asset.sha256)return json(502,'HASH');
  return new Response(data,{headers:{...cors,'Content-Type':'application/pdf','Content-Disposition':'inline; filename="mtm-'+body.kind+'.pdf"'}});
 }catch{return json(400,'REQUEST');}
};}
