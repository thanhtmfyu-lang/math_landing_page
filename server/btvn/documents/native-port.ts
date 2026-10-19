import {GateError,hashBytes,sha,type PublisherPort} from './release-gate.ts';
import type {DocumentPort,Principal} from './document-handler.ts';

/** Server-only glue. Session và key chỉ giữ trong closure mỗi request. */
export interface NativeTransport {
  rpc(name:string,args:Record<string,unknown>,signal?:AbortSignal):Promise<{data:unknown;error:null|{message?:string;code?:string}}>;
  storage:{
    upload(path:string,bytes:Uint8Array,type:string,signal?:AbortSignal):Promise<{error:null|{statusCode?:string|number;error?:string;message?:string}}>;
    download(path:string,signal?:AbortSignal):Promise<Uint8Array>;
    sign(path:string,seconds:number,signal?:AbortSignal):Promise<string>;
    signUpload(path:string,signal?:AbortSignal):Promise<string>;
  };
}
const SAFE_CODES=new Set(['RELEASE_NOT_FOUND','NOT_OPEN','REVISION_CONFLICT','IDEMPOTENCY_CONFLICT','ALREADY_SUBMITTED','ATTEMPT_LIMIT','SOURCE_CHANGED','SOURCE_NOT_PINNED','RELEASE_HAS_ATTEMPTS','INVALID_ATTACHMENT','ATTACHMENT_LIMIT','INVALID_SUBMISSION','NO_SUBMISSION','RELEASE_SUPERSEDED','PREVIOUS_DRAFT_ACTIVE','IMMUTABLE_ACCEPTED_CHANGED']);
async function rpc(db:NativeTransport,name:string,args:Record<string,unknown>,signal?:AbortSignal){
  const result=await db.rpc(name,args,signal);
  if(result.error){const code=result.error.message??'';throw new GateError(SAFE_CODES.has(code)?code:result.error.code==='42501'?'UNAUTHORIZED':'NATIVE_RPC_UNAVAILABLE');}
  return result.data;
}
function cookieSession(request:Request){
  const cookies=(request.headers.get('cookie')??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith('mtm_btvn_demo='));
  if(cookies.length!==1)return null;
  const token=cookies[0].slice('mtm_btvn_demo='.length);
  return /^[a-f0-9]{64}$/.test(token)?token:null;
}
export async function uploadImmutable(db:NativeTransport,path:string,bytes:Uint8Array,type:string,expected:string,signal?:AbortSignal){
  if(!sha(expected)||await hashBytes(bytes)!==expected)throw new GateError('UPLOAD_HASH_MISMATCH');
  const written=await db.storage.upload(path,bytes,type,signal);
  if(!written.error)return;
  // Không coi mọi lỗi upload là conflict rồi nuốt lỗi. Chỉ đọc lại khi409.
  if(!(Number(written.error.statusCode)===409||Number(written.error.statusCode)===400&&/duplicate|already exists/i.test(written.error.error??written.error.message??'')))throw new GateError('UPLOAD_UNAVAILABLE');
  const previous=await db.storage.download(path,signal);
  if(previous.length!==bytes.length||await hashBytes(previous)!==expected)throw new GateError('IMMUTABLE_ASSET_CONFLICT');
}
export function createNativeDocumentPort(request:Request,db:NativeTransport):DocumentPort {
  const session=cookieSession(request);
  return {
    async authenticate(_request,signal){
      if(!session)return null;
      try{const value=await rpc(db,'mtm_btvn_document_principal',{p_session:session},signal) as Principal|null;
       return value&&typeof value.subjectId==='string'&&typeof value.className==='string'?value:null;
      }catch(error){if(error instanceof GateError&&error.code==='UNAUTHORIZED')return null;throw error;}
    },
    async rpc(action,payload,signal){
      if(!session)throw new GateError('UNAUTHORIZED');
      return rpc(db,'mtm_btvn_document',{p_session:session,p_action:action,p_payload:payload},signal);
    },
    upload:(path,bytes,type,digest,signal)=>{
      if(!/^btvn-submissions\/[0-9a-f-]{36}\/[a-f0-9]{64}\.(pdf|png|jpg)$/.test(path))throw new GateError('INVALID_ATTACHMENT');
      return uploadImmutable(db,path,bytes,type,digest,signal);
    },
    sign:(path,seconds,signal)=>{
      if(!/^btvn\/[a-z0-9-]{1,160}\/[a-f0-9]{64}\/exam-assets\/[a-f0-9]{64}\.pdf$/.test(path)||seconds!==9000)throw new GateError('PRIVATE_PDF_UNAVAILABLE');
      return db.storage.sign(path,seconds,signal);
    },
  };
}
export async function listNativeDocuments(request:Request,db:NativeTransport,signal?:AbortSignal){
  const session=cookieSession(request);if(!session)throw new GateError('UNAUTHORIZED');
  return rpc(db,'mtm_btvn_document_list',{p_session:session},signal);
}
export function createNativePublisherPort(db:NativeTransport,authorize:PublisherPort['authorize'],pythonPlan?:unknown):PublisherPort{return {
  authorize,
  loadPinnedSource:async(lessonKey,signal)=>await rpc(db,'mtm_btvn_document_pin',{p_lesson_key:lessonKey},signal) as Awaited<ReturnType<PublisherPort['loadPinnedSource']>>,
  upload:(path,bytes,type,digest,signal)=>{
    if(!/^btvn\/[a-z0-9-]{1,160}\/[a-f0-9]{64}\/exam-assets\/[a-f0-9]{64}\.pdf$/.test(path)||type!=='application/pdf')throw new GateError('INVALID_PDF_ASSET');
    return uploadImmutable(db,path,bytes,type,digest,signal);
  },
  rpc:async(_action,payload,signal)=>await rpc(db,'mtm_btvn_document_publish',{p_payload:{...payload,...(pythonPlan===undefined?{}:{pythonPlan})}},signal) as Awaited<ReturnType<PublisherPort['rpc']>>,
};}

export async function lookupNativeRelease(db:NativeTransport,manifestHash:string,signal?:AbortSignal){
  if(!sha(manifestHash))throw new GateError('INVALID_MANIFEST_HASH');
  return rpc(db,'mtm_btvn_document_lookup',{p_manifest_hash:manifestHash},signal);
}
