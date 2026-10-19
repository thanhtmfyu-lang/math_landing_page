import {createReleasePublisher,boundedStep,canonical,GateError,object,reply,type StepOptions} from './release-gate.ts';
import {bridgePublicationPlan,type BridgeRegistry} from './plan-bridge.ts';
import {createNativePublisherPort,type NativeTransport} from './native-port.ts';
import {classRules} from '../class-rules';
import {classOpeningTimes} from '../class-schedule';
type Dependencies=StepOptions&{ready:()=>Promise<boolean>;publishEnabled?:()=>Promise<boolean>;authorize:(request:Request,signal?:AbortSignal)=>Promise<boolean>;transport:()=>Promise<NativeTransport>;loadBridgeRegistry:(plan:Record<string,unknown>,lessonKey:string,signal?:AbortSignal)=>Promise<BridgeRegistry>;intake?:(assignmentId:string,sourceVersion:string)=>Promise<unknown>;registerSource?:(input:unknown)=>Promise<unknown>};
/** Mount cạnh handler cũ trên cùng EdgeFunction/secret. Không đưa route này qua
 * VercelJSONbody vì haiPDF có thể vượt4.5MB. Không nhận registry từ worker. */
export function createNativePublisherHandler(deps:Dependencies){return async(request:Request)=>{
 try{
  if(request.method!=='POST')return reply(405,{error_code:'POST_REQUIRED'});
  if(!await boundedStep('AUTHORIZE',deps,false,s=>deps.authorize(request,s)))return reply(401,{error_code:'UNAUTHORIZED'});
  if(!await boundedStep('READY',deps,false,()=>deps.ready()))return reply(503,{error_code:'INTEGRATION_NOT_READY'});
  const raw=await request.text();if(new TextEncoder().encode(raw).length>44*1024*1024)throw new GateError('PAYLOAD_TOO_LARGE');
  const body=JSON.parse(raw);if(!object(body))throw new GateError('INVALID_ACTION');
  if(body.action==='document_register_source'){
   if(Object.keys(body).sort().join(',')!=='action,documents,evidence,rawDocuments,snapshot')throw new GateError('INVALID_ACTION_FIELDS');
   if(!deps.registerSource)return reply(503,{error_code:'SOURCE_INTAKE_NOT_CONNECTED'});
   return reply(200,await deps.registerSource({snapshot:body.snapshot,documents:body.documents,rawDocuments:body.rawDocuments,evidence:body.evidence}));
  }
  if(body.action==='document_intake'){
   if(Object.keys(body).sort().join(',')!=='action,assignmentId,sourceVersion'||typeof body.assignmentId!=='string'||typeof body.sourceVersion!=='string')throw new GateError('INVALID_ACTION_FIELDS');
   if(!deps.intake)return reply(503,{error_code:'SOURCE_INTAKE_NOT_CONNECTED'});
   return reply(200,await deps.intake(body.assignmentId,body.sourceVersion));
  }
  if(body.action==='document_capabilities'){
   if(Object.keys(body).length!==1)throw new GateError('INVALID_ACTION_FIELDS');
   const enabled=await deps.publishEnabled?.()??false;
   return reply(200,{contract:'MTM-BTVN-RESILIENT-20261019-v1',webContract:'MTM-BTVN-RELEASE-20261019-v1',nativeReady:true,frontendReady:enabled,complete:enabled,partial:enabled,simple_pdf:enabled});
  }
  const db=await boundedStep('TRANSPORT',deps,false,()=>deps.transport());
  if(body.action==='document_assignment_facts'){
   const date=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
   if(Object.keys(body).sort().join(',')!=='action,classDates,lessonKey'||typeof body.lessonKey!=='string'||!/^[a-z0-9-]{1,160}$/.test(body.lessonKey)||!object(body.classDates)||Object.keys(body.classDates).length<1||Object.keys(body.classDates).length>50||!Object.values(body.classDates).every(date))throw new GateError('INVALID_CLASS_DATES');
   const dates=body.classDates as Record<string,string>,names=Object.keys(dates),opens=classOpeningTimes({classNames:names,classDates:dates,date:dates[names[0]]});
   const out=await boundedStep('ASSIGNMENT_FACTS',deps,false,s=>db.rpc('mtm_btvn_document_assignment_facts',{p_lesson_key:body.lessonKey,p_class_dates:dates,p_class_rules:classRules,p_policy_opens:opens},s));if(out.error)throw new GateError('ASSIGNMENT_FACTS_UNAVAILABLE');return reply(200,out.data);
  }
  if(body.action==='document_repairs'){
   if(Object.keys(body).some(k=>!['action','lessonKey'].includes(k))||(body.lessonKey!==undefined&&(typeof body.lessonKey!=='string'||!/^[a-z0-9-]{1,160}$/.test(body.lessonKey))))throw new GateError('INVALID_REPAIR_IDENTITY');
   const out=await boundedStep('READ_REPAIRS',deps,false,s=>db.rpc('mtm_btvn_document_repairs',{p_lesson_key:body.lessonKey??null},s));if(out.error)throw new GateError('REPAIRS_UNAVAILABLE');return reply(200,out.data);
  }
  if(body.action==='document_readiness'){
   const day=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value).toISOString().slice(0,10)===value;
   if(Object.keys(body).sort().join(',')!=='action,from,to'||!day(body.from)||!day(body.to)||Date.parse(String(body.to))<Date.parse(String(body.from))||Date.parse(String(body.to))-Date.parse(String(body.from))>31*86400000)throw new GateError('INVALID_READINESS_RANGE');
   const out=await boundedStep('READ_DOCUMENT_READINESS',deps,false,s=>db.rpc('mtm_btvn_document_readiness',{p_from:body.from,p_to:body.to,p_class_rules:classRules},s));if(out.error)throw new GateError('READINESS_UNAVAILABLE');return reply(200,out.data);
  }
  if(body.action==='document_registry'){
   if(Object.keys(body).sort().join(',')!=='action,lessonKey,planHash'||typeof body.lessonKey!=='string'||!/^[a-z0-9-]{1,160}$/.test(body.lessonKey)||typeof body.planHash!=='string'||!/^[a-f0-9]{64}$/.test(body.planHash))throw new GateError('INVALID_REGISTRY_IDENTITY');
   const out=await boundedStep('READ_BRIDGE_REGISTRY',deps,false,s=>db.rpc('mtm_btvn_document_bridge_registry',{p_lesson_key:body.lessonKey,p_plan_hash:body.planHash},s));
   if(out.error||!out.data)throw new GateError('SOURCE_NOT_PINNED');return reply(200,out.data);
  }
  if(body.action==='document_lookup'){
   if(Object.keys(body).sort().join(',')!=='action,idempotencyKey'||typeof body.idempotencyKey!=='string'||!/^[a-f0-9]{64}$/.test(body.idempotencyKey))throw new GateError('INVALID_IDEMPOTENCY_KEY');
   const out=await boundedStep('LOOKUP',deps,false,s=>db.rpc('mtm_btvn_document_lookup_plan',{p_idempotency_key:body.idempotencyKey},s));if(out.error)throw new GateError('NATIVE_READBACK_UNAVAILABLE');
   return reply(200,out.data??{found:false});
  }
  if(body.action!=='document_publish'||Object.keys(body).sort().join(',')!=='action,assets,manifest,pythonPlan'||!object(body.pythonPlan)||!object(body.manifest)||!object(body.manifest.source)||typeof body.manifest.source.lessonKey!=='string')throw new GateError('INVALID_ACTION_FIELDS');
  if(!await deps.publishEnabled?.())return reply(409,{error_code:'FRONTEND_NOT_READY'});
  const registry=await boundedStep('BRIDGE_REGISTRY',deps,false,s=>deps.loadBridgeRegistry(body.pythonPlan as Record<string,unknown>,(body.manifest as any).source.lessonKey,s));
  const bridge=await bridgePublicationPlan(body.pythonPlan,registry);
  if(canonical(body.manifest)!==canonical(bridge.manifest))throw new GateError('BRIDGE_MANIFEST_MISMATCH');
  const port=createNativePublisherPort(db,deps.authorize,body.pythonPlan);
  return createReleasePublisher(port,deps)(new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({manifest:body.manifest,assets:body.assets})}));
 }catch(error){return reply(error instanceof GateError?422:503,{error_code:error instanceof GateError?error.code:'NATIVE_PUBLISHER_UNAVAILABLE'});}
};}
