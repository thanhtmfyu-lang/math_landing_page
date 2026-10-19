import {createDocumentHomeworkHandler} from './document-handler.ts';
import {createNativeDocumentPort,listNativeDocuments,type NativeTransport} from './native-port.ts';
import {boundedStep,GateError,hashBytes,object,reply,sha,type StepOptions} from './release-gate.ts';

type Dependencies=StepOptions&{ready:()=>Promise<boolean>;trustedOrigin:(origin:string)=>boolean;transport:(request:Request)=>Promise<NativeTransport>;rate:(db:NativeTransport)=>Promise<boolean>;clock?:()=>number};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ext=(type:string)=>({'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg'}[type]);
const bytesToBase64=(bytes:Uint8Array)=>{let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);};

/** JSON nhỏ đi qua same-origin. Blob đi thẳng storageprivate theo URL ký chỉ
 * cho một path. Commit tải blob và kiểm byte lại trước register_attachment. */
export function createNativeDocumentHttp(deps:Dependencies){return async(request:Request):Promise<Response>=>{
  try{
    if(request.method!=='POST')return reply(405,{error_code:'POST_REQUIRED'});
    const target=new URL(request.url),origin=request.headers.get('origin')??'';
    if(target.protocol!=='https:'||origin!==target.origin||!deps.trustedOrigin(origin))return reply(403,{error_code:'ORIGIN_REJECTED'});
    if(!await boundedStep('READY',deps,false,()=>deps.ready()))return reply(503,{error_code:'INTEGRATION_NOT_READY'});
    const raw=await request.text();if(new TextEncoder().encode(raw).length>512*1024)return reply(413,{error_code:'PAYLOAD_TOO_LARGE'});
    const body=JSON.parse(raw);if(!object(body))throw new GateError('INVALID_ACTION');
    const db=await boundedStep('TRANSPORT',deps,false,()=>deps.transport(request));
    if(!await boundedStep('RATE',deps,false,()=>deps.rate(db)))return reply(429,{error_code:'RATE_LIMITED'});
    const port=createNativeDocumentPort(request,db),core=createDocumentHomeworkHandler(port,deps.clock,deps);
    const makeRequest=(value:unknown)=>new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(value)});
    if(body.action==='list'){
      if(Object.keys(body).length!==1)throw new GateError('INVALID_ACTION_FIELDS');
      return reply(200,{releases:await boundedStep('LIST',deps,false,s=>listNativeDocuments(request,db,s))});
    }
    if(body.action!=='upload_init'&&body.action!=='upload_commit')return core(makeRequest(body));
    if(Object.keys(body).sort().join(',')!==['action','releaseId','attemptId','revision','idempotencyKey','file'].sort().join(','))throw new GateError('INVALID_ACTION_FIELDS');
    if(typeof body.releaseId!=='string'||!UUID.test(body.releaseId)||typeof body.attemptId!=='string'||!UUID.test(body.attemptId)||!Number.isSafeInteger(body.revision)||Number(body.revision)<0||typeof body.idempotencyKey!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey))throw new GateError('INVALID_UPLOAD');
    const file=body.file;
    if(!object(file)||Object.keys(file).sort().join(',')!==['sha256','contentType','bytes'].sort().join(',')||!sha(file.sha256)||typeof file.contentType!=='string'||!ext(file.contentType)||!Number.isSafeInteger(file.bytes)||Number(file.bytes)<8||Number(file.bytes)>10*1024*1024)throw new GateError('INVALID_ATTACHMENT');
    // State kiểm session/lớp/manifest/giờ mở qua cùng core. Không nhận principal
    // hoặc đườngstorage từ body để cấp quyền upload.
    const stateResponse=await core(makeRequest({action:'state',releaseId:body.releaseId}));
    if(!stateResponse.ok)return stateResponse;
    const state=await stateResponse.json();
    if(state.locked)return reply(409,{error_code:'NOT_OPEN'});
    if(state.attempt?.attemptId!==body.attemptId)return reply(403,{error_code:'ATTEMPT_NOT_OWNED'});
    if(state.attempt.submittedAt!==null)return reply(409,{error_code:'ALREADY_SUBMITTED'});
    if(state.attempt.revision!==body.revision)return reply(409,{error_code:'REVISION_CONFLICT'});
    if(state.attempt.attachmentIds.length>=5)return reply(409,{error_code:'ATTACHMENT_LIMIT'});
    const path=`btvn-submissions/${body.attemptId}/${file.sha256}.${ext(file.contentType)}`;
    if(body.action==='upload_init'){
      const uploadUrl=await boundedStep('SIGN_UPLOAD',deps,false,s=>db.storage.signUpload(path,s));
      const url=new URL(uploadUrl);if(url.protocol!=='https:'||url.username||url.password)throw new GateError('UPLOAD_SIGNING_UNAVAILABLE');
      return reply(200,{uploadUrl,sha256:file.sha256,bytes:file.bytes});
    }
    const bytes=await boundedStep('VERIFY_UPLOADED_BLOB',deps,false,s=>db.storage.download(path,s));
    if(bytes.length!==file.bytes||await hashBytes(bytes)!==file.sha256)throw new GateError('ATTACHMENT_HASH_OR_SIGNATURE_MISMATCH');
    // Core kiểmmagic bytes và hash, uploadImmutable hòa giải409, RPC khóa lại
    // CAS/submitted ngay lúc register. Race sau state không mở quyền ghi.
    return core(makeRequest({...body,action:'upload',file:{sha256:file.sha256,contentType:file.contentType,base64:bytesToBase64(bytes)}}));
  }catch(error){return reply(error instanceof GateError&&error.code==='UNAUTHORIZED'?401:error instanceof GateError?422:503,{error_code:error instanceof GateError?error.code:'DOCUMENT_UNAVAILABLE'});}
};}
