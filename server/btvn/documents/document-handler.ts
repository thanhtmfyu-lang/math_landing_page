import {type ApprovedRelease,type PrivatePdf,type StepOptions,StepTimeout,boundedStep,GateError,ensure,object,exactKeys,shortText,sha,hashBytes,hashJson,decodeBase64,reply} from './release-gate.ts';

/** Phải lấy từ cookie/session đã xác thực, không lấy principal từ body. */
export type Principal={subjectId:string;className:string};
export type StoredAsset=PrivatePdf&{storagePath:string};
export type DocumentRelease=ApprovedRelease&{releaseId:string;assets:StoredAsset[]};
export type Answer=string|[boolean|null,boolean|null,boolean|null,boolean|null]|null;
export type StudentAnswers=Record<string,Answer>;
export type Attempt={attemptId:string;releaseId:string;manifestHash:string;subjectId:string;revision:number;startedAt:string;submittedAt:string|null;answers:StudentAnswers;note:string;attachmentIds:string[];receipt:null|{receiptId:string;attemptId:string;submittedAt:string;late:boolean|null;gradingPending:true}};
export type DocumentPort={
  authenticate(request:Request,signal?:AbortSignal):Promise<Principal|null>;
  /** Các mutation phải có transaction, kiểm subject/lớp/manifest/giờ mở,
   * expected_revision và idempotency_key ở DB. Cùng key cùng payload trả cùng
   * kết quả; cùng key khác payload trả IDEMPOTENCY_CONFLICT. Receipt được lưu
   * cùng submit. Save/upload sau submit không được đổi bài hoặc receipt. */
  rpc(action:'get_release'|'get_attempt'|'start_attempt'|'save_attempt'|'submit_attempt'|'register_attachment',payload:Record<string,unknown>,signal?:AbortSignal):Promise<unknown>;
  upload(path:string,bytes:Uint8Array,contentType:string,sha256:string,signal?:AbortSignal):Promise<void>;
  sign(path:string,seconds:number,signal?:AbortSignal):Promise<string>;
};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const commandKey=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(v);
const timestamp=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const SIGNED_SECONDS=9000;

function answers(value:unknown,release:DocumentRelease):asserts value is StudentAnswers {
  ensure(object(value)&&Object.keys(value).length<=release.acceptedCount,'INVALID_ANSWERS');
  const questions=new Map(release.manifest.accepted.map(item=>[item.id,item.question]));
  for(const [id,response] of Object.entries(value)){
    const q=questions.get(id);ensure(q,'ANSWER_NOT_IN_RELEASE');
    if(response===null)continue;
    if(q.kind==='tf')ensure(Array.isArray(response)&&response.length===4&&response.every(v=>v===null||typeof v==='boolean'),'INVALID_ANSWER');
    else ensure(typeof response==='string'&&response.length<=20000&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(response)&&(q.kind!=='mc'||/^[ABCD]$/.test(response)),'INVALID_ANSWER');
  }
}
function attempt(value:unknown,who:Principal,release:DocumentRelease):asserts value is Attempt {
  ensure(object(value)&&uuid(value.attemptId)&&value.releaseId===release.releaseId&&value.subjectId===who.subjectId&&value.manifestHash===release.manifestHash&&Number.isSafeInteger(value.revision)&&(value.revision as number)>=0&&timestamp(value.startedAt)&&(value.submittedAt===null||timestamp(value.submittedAt))&&typeof value.note==='string'&&value.note.length<=20000&&Array.isArray(value.attachmentIds)&&value.attachmentIds.length<=5&&value.attachmentIds.every(uuid),'INVALID_ATTEMPT_RECEIPT');
  answers(value.answers,release);
  if(value.submittedAt===null)ensure(value.receipt===null,'INVALID_ATTEMPT_RECEIPT');
  else ensure(object(value.receipt)&&uuid(value.receipt.receiptId)&&value.receipt.attemptId===value.attemptId&&value.receipt.submittedAt===value.submittedAt&&(value.receipt.late===null||typeof value.receipt.late==='boolean')&&value.receipt.gradingPending===true,'INVALID_ATTEMPT_RECEIPT');
}
async function checkedRelease(value:unknown,releaseId:string,who:Principal):Promise<DocumentRelease> {
  ensure(object(value)&&value.releaseId===releaseId&&object(value.manifest)&&object(value.manifest.source)&&object(value.manifest.source.classDates)&&Object.hasOwn(value.manifest.source.classDates,who.className),'RELEASE_NOT_FOUND');
  const release=value as DocumentRelease;
  ensure(sha(release.manifestHash)&&await hashJson(release.manifest)===release.manifestHash&&release.officialGrading==='pending'&&['partial','pdf-simple'].includes(release.manifest.mode),'INVALID_RELEASE');
  ensure(Array.isArray(release.inventory)&&await hashJson(release.inventory)===release.manifest.source.inventoryHash,'INVALID_RELEASE_INVENTORY');
  ensure(release.sourceCount===release.manifest.accepted.length+release.manifest.pending.length&&release.acceptedCount===release.manifest.accepted.length&&release.pendingCount===release.manifest.pending.length,'INVALID_RELEASE');
  const key=release.teacherKeyCoverage,refs=release.inventory.map(q=>q.sourceRef);
  ensure(object(key)&&Array.isArray(key.coveredSourceRefs)&&key.coveredSourceRefs.length>0&&Array.isArray(key.missingSourceRefs)&&JSON.stringify(key.coveredSourceRefs)===JSON.stringify(refs.filter(ref=>key.coveredSourceRefs.includes(ref)))&&JSON.stringify(key.missingSourceRefs)===JSON.stringify(refs.filter(ref=>!key.coveredSourceRefs.includes(ref)))&&key.complete===(key.missingSourceRefs.length===0),'INVALID_KEY_COVERAGE');
  ensure(timestamp(release.classOpensAt?.[who.className])&&(release.classDueAt?.[who.className]===null||timestamp(release.classDueAt?.[who.className])),'INVALID_RELEASE_SCHEDULE');
  ensure(Array.isArray(release.assets)&&release.assets.length===2,'INVALID_RELEASE_ASSETS');
  for(const expected of [release.manifest.pdf.questions,release.manifest.pdf.answers]){
    const rows=release.assets.filter(x=>x.path===expected.path&&x.sha256===expected.sha256&&x.bytes===expected.bytes);
    const path=`btvn/${release.manifest.source.lessonKey}/${release.manifest.source.sourceVersion}/${expected.path}`;
    ensure(rows.length===1&&rows[0].storagePath===path,'INVALID_RELEASE_ASSETS');
  }
  return release;
}
async function signedPdf(port:DocumentPort,release:DocumentRelease,pdf:PrivatePdf,options:StepOptions):Promise<string>{
  const rows=release.assets.filter(x=>x.path===pdf.path&&x.sha256===pdf.sha256);
  ensure(rows.length===1,'PRIVATE_PDF_UNAVAILABLE');
  const value=await boundedStep('SIGN_PRIVATE_PDF',options,false,s=>port.sign(rows[0].storagePath,SIGNED_SECONDS,s)),url=new URL(value);
  ensure(url.protocol==='https:'&&!url.username&&!url.password,'PRIVATE_PDF_UNAVAILABLE');return value;
}
/** Không serialize record server trực tiếp. URL GV chỉ được ký sau ACK submit
 * của đúng người, đúng release, đúng manifest và giờ mở của lớp đã đến. */
async function projection(port:DocumentPort,release:DocumentRelease,who:Principal,current:Attempt|null,now:number,options:StepOptions){
  const opensAt=release.classOpensAt[who.className],dueAt=release.classDueAt[who.className];
  const base={releaseId:release.releaseId,manifestHash:release.manifestHash,mode:release.manifest.mode,label:release.label,sourceCount:release.sourceCount,acceptedCount:release.acceptedCount,pendingCount:release.pendingCount,officialGrading:'pending',opensAt,dueAt,serverNow:new Date(now).toISOString()};
  if(now<Date.parse(opensAt))return {...base,locked:true,questions:[],pending:[],questionsPdf:null,answersPdf:null,attempt:null};
  let questionsPdf:string|null=null,answersPdf:string|null=null,assetsUnavailable=false;
  try{questionsPdf=await signedPdf(port,release,release.manifest.pdf.questions,options);}catch{assetsUnavailable=true;}
  if(current?.submittedAt&&current.receipt){try{answersPdf=await signedPdf(port,release,release.manifest.pdf.answers,options);}catch{assetsUnavailable=true;}}
  const instructions=release.manifest.mode==='pdf-simple'?'Làm các câu được giao dưới đây trong PDF rồi nộp tệp bài làm. Giáo viên sẽ chấm. Câu chờ bổ sung đáp án chưa được giao.':'Làm các câu đã được mở. Các câu đang chờ bổ sung trong PDF chưa thuộc phần giao trực tuyến.';
  return {...base,locked:false,instructions,teacherKeyCoverage:structuredClone(release.teacherKeyCoverage),assignedPdfSourceRefs:release.manifest.mode==='pdf-simple'?[...release.teacherKeyCoverage.coveredSourceRefs]:[],questions:release.manifest.accepted.map(item=>structuredClone(item.question)),pending:release.manifest.pending.map(item=>({id:item.id,sourceRef:release.inventory.find(row=>row.id===item.id)?.sourceRef,status:item.reasonCode==='ANSWER_MISSING'?'Chờ bổ sung đáp án':release.manifest.mode==='pdf-simple'?'Làm trong PDF, giáo viên chấm':'Chờ bổ sung'})),questionsPdf,answersPdf,assetsUnavailable,attempt:current?{attemptId:current.attemptId,revision:current.revision,startedAt:current.startedAt,submittedAt:current.submittedAt,answers:structuredClone(current.answers),note:current.note,attachmentIds:[...current.attachmentIds],receipt:current.receipt?structuredClone(current.receipt):null}:null};
}
export function createDocumentHomeworkHandler(port:DocumentPort,clock:()=>number=Date.now,options:StepOptions={}){return async(request:Request)=>{
  if(request.method!=='POST')return reply(405,{error_code:'POST_REQUIRED'});
  let idempotencyKey:string|undefined;
  try{
    const origin=request.headers.get('Origin'),target=new URL(request.url);
    if(target.protocol!=='https:'||origin!==target.origin)return reply(403,{error_code:'ORIGIN_REJECTED'});
    const who=await boundedStep('AUTHENTICATE',options,false,s=>port.authenticate(request,s));if(!who||!shortText(who.subjectId,160)||!shortText(who.className,100))return reply(401,{error_code:'UNAUTHORIZED'});
    const raw=await boundedStep('READ_HOMEWORK_BODY',options,false,()=>request.text());ensure(new TextEncoder().encode(raw).length<=16*1024*1024,'PAYLOAD_TOO_LARGE');
    const body=JSON.parse(raw);ensure(object(body)&&['state','start','save','upload','submit'].includes(String(body.action))&&uuid(body.releaseId),'INVALID_ACTION');
    const shapes:Record<string,[string[],string[]]>={state:[['action','releaseId'],[]],start:[['action','releaseId','idempotencyKey'],[]],save:[['action','releaseId','attemptId','revision','idempotencyKey','answers','note','attachmentIds'],[]],submit:[['action','releaseId','attemptId','revision','idempotencyKey','answers','note','attachmentIds'],[]],upload:[['action','releaseId','attemptId','revision','idempotencyKey','file'],[]]};
    ensure(exactKeys(body,...shapes[String(body.action)]),'INVALID_ACTION_FIELDS');
    if(body.action!=='state'){ensure(commandKey(body.idempotencyKey),'IDEMPOTENCY_KEY_REQUIRED');idempotencyKey=body.idempotencyKey;}
    const releaseId=body.releaseId;
    const rpc=(action:Parameters<DocumentPort['rpc']>[0],payload:Record<string,unknown>,mutation=false)=>boundedStep(action.toUpperCase(),options,mutation,s=>port.rpc(action,payload,s));
    const release=await checkedRelease(await rpc('get_release',{release_id:releaseId,subject_id:who.subjectId,class_name:who.className}),releaseId,who);
    const now=clock();ensure(Number.isFinite(now),'CLOCK_UNAVAILABLE');
    if(body.action!=='state')ensure(now>=Date.parse(release.classOpensAt[who.className]),'NOT_OPEN');
    const identity={release_id:release.releaseId,subject_id:who.subjectId,class_name:who.className,manifest_hash:release.manifestHash};
    if(body.action==='state'){
      const found=await rpc('get_attempt',identity);if(found!==null)attempt(found,who,release);
      return reply(200,await projection(port,release,who,found as Attempt|null,now,options));
    }
    if(body.action==='start'){
      const found=await rpc('start_attempt',{...identity,idempotency_key:body.idempotencyKey,now:new Date(now).toISOString()},true);attempt(found,who,release);
      return reply(200,await projection(port,release,who,found,now,options));
    }
    ensure(uuid(body.attemptId),'INVALID_ATTEMPT');
    const current=await rpc('get_attempt',{...identity,attempt_id:body.attemptId});attempt(current,who,release);ensure(current.attemptId===body.attemptId,'INVALID_ATTEMPT');
    if(body.action==='upload'){
      ensure(current.submittedAt===null,'ALREADY_SUBMITTED');
      ensure(Number.isSafeInteger(body.revision)&&(body.revision as number)>=0,'INVALID_REVISION');ensure(current.revision===body.revision,'REVISION_CONFLICT');
      const file=body.file;ensure(object(file)&&exactKeys(file,['sha256','contentType','base64'])&&sha(file.sha256)&&['application/pdf','image/png','image/jpeg'].includes(String(file.contentType)),'INVALID_ATTACHMENT');
      const bytes=decodeBase64(file.base64,10*1024*1024);
      const png=[137,80,78,71,13,10,26,10];
      const correct=file.contentType==='application/pdf'?new TextDecoder().decode(bytes.slice(0,5))==='%PDF-':file.contentType==='image/png'?bytes.slice(0,8).every((x,i)=>x===png[i]):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      ensure(correct&&await hashBytes(bytes)===file.sha256,'ATTACHMENT_HASH_OR_SIGNATURE_MISMATCH');
      const suffix=file.contentType==='application/pdf'?'pdf':file.contentType==='image/png'?'png':'jpg',path=`btvn-submissions/${current.attemptId}/${file.sha256}.${suffix}`;
      await boundedStep('UPLOAD_SUBMISSION',options,true,s=>port.upload(path,bytes,String(file.contentType),file.sha256 as string,s));
      const registered=await rpc('register_attachment',{...identity,attempt_id:current.attemptId,expected_revision:body.revision,idempotency_key:body.idempotencyKey,command_hash:await hashJson({sha256:file.sha256,contentType:file.contentType,bytes:bytes.length}),storage_path:path,sha256:file.sha256,content_type:file.contentType,bytes:bytes.length,now:new Date(now).toISOString()},true);
      ensure(object(registered)&&uuid(registered.attachmentId),'INVALID_ATTACHMENT_RECEIPT');return reply(200,{attachmentId:registered.attachmentId,sha256:file.sha256,bytes:bytes.length});
    }
    ensure(Number.isSafeInteger(body.revision)&&(body.revision as number)>=0&&typeof body.note==='string'&&body.note.length<=20000&&Array.isArray(body.attachmentIds)&&body.attachmentIds.length<=5&&body.attachmentIds.every(uuid)&&new Set(body.attachmentIds).size===body.attachmentIds.length,'INVALID_SUBMISSION');
    answers(body.answers,release);
    if(body.action==='save')ensure(current.submittedAt===null,'ALREADY_SUBMITTED');
    // Cả retry sau ACK và submit đầu tiên đều qua RPC atomic. DB phân biệt
    // cùng command key với cùng body và xung đột key, không tin receipt client.
    const command={answers:body.answers,note:body.note,attachment_ids:body.attachmentIds};
    const result=await rpc(body.action==='save'?'save_attempt':'submit_attempt',{...identity,attempt_id:body.attemptId,expected_revision:body.revision,idempotency_key:body.idempotencyKey,command_hash:await hashJson(command),...command,now:new Date(now).toISOString()},true);
    attempt(result,who,release);ensure(result.attemptId===body.attemptId&&(body.action!=='submit'||result.submittedAt!==null),'INVALID_SUBMISSION_RECEIPT');
    return reply(200,await projection(port,release,who,result,now,options));
  }catch(error){
    const code=error instanceof GateError?error.code:'HOMEWORK_UNAVAILABLE';
    const status=error instanceof StepTimeout?503:code==='RELEASE_NOT_FOUND'?404:['REVISION_CONFLICT','IDEMPOTENCY_CONFLICT','ALREADY_SUBMITTED','NOT_OPEN'].includes(code)?409:error instanceof GateError?422:503;
    return reply(status,{error_code:code,...(code==='MUTATION_OUTCOME_UNKNOWN'?{reconcile:'read_attempt_then_retry_same_key',idempotencyKey}: {})});
  }
};}
