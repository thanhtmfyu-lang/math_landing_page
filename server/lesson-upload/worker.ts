import {createHash} from 'node:crypto';
import {createBtvnPublishHandler,expectedSlots,type AnswerSlot,type PublishAsset,type PublishPort} from '../btvn/publish-handler';
import {validatePracticeExam,type PracticeExam} from '../../src/native/exams/data';
import {youtubeVideoId} from '../btvn/lesson-materials';
import {normalizedShort} from '../../src/native/exams/assessment';
import {MTM_SCORING_VERSION,normalizeMtmShort} from '../../src/native/exams/mtm-scoring';

export type UploadJob={paper?:1|2;homework2_path?:string|null;answer2_path?:string|null;answer2_text?:string|null;task_scope2?:string|null;id:string;class_ids:string[];lesson_date:string;teacher_key:string;title:string;task_scope:string;homework_path:string|null;answer_path:string|null;answer_text:string|null;handout_path:string|null;video_url:string|null;version:number;claim_token:string;lesson_code:string;class_names:Record<string,string>;class_dates:Record<string,string>;start_times:Record<string,string>;end_times?:Record<string,string>;due_at_by_class:Record<string,string>;due_at_overrides?:Record<string,string>;checkpoint:Record<string,any>};
export type Extraction={sourceVersion:string;questions:unknown[];teacherSlots:AnswerSlot[];privateAnswerHashes?:string[]};
export type Draft={exam:PracticeExam;assets:PublishAsset[]};
export type PreparedMaterials={handoutUrl:string|null;materialUrl:string|null;access?:'authenticated';studentSafe?:true;receipt_hash?:string;pending?:boolean};
export type PendingReview={status:'pending';request_hash:string;sourceVersion:string};
export type IndependentReview={provider:'grok'|'agy';model:string;receipt_hash:string;slots:{question_id:string;slot:string;actual:unknown;conversion_verified?:boolean}[]};
export interface Pipeline {
 extractor:{provider:'codex'|'chatgpt-oauth'|'openai';model:string};
 /** Input has private GV answers. Return statement-only questions separately. */
 read(job:UploadJob):Promise<Extraction>;
 build(job:UploadJob,source:Extraction):Promise<Draft>;
 /** Separate provider/session, statement-only input: never the draft/teacher key. */
 review(input:{questions:unknown[];task_scope:string;sourceVersion:string}):Promise<IndependentReview|PendingReview>;
 /** Idempotent private handout copying/signing. Never return a raw answer URL. */
 materials(job:UploadJob,idempotencyKey:string):Promise<PreparedMaterials>;
}
export interface WorkerRepository {
 claim(workerId:string):Promise<UploadJob|null>;
 current(job:UploadJob):Promise<void>;
 step(job:UploadJob,step:number,status:'dang'|'xong'|'loi'|'canh_bao',detail:string,checkpoint:Record<string,unknown>,paper?:1|2):Promise<void>;
 waitReview?(job:UploadJob,request:PendingReview):Promise<{allowed:boolean}>;
 publishBundle?(job:UploadJob,primary:unknown,second:unknown):Promise<void>;
 finish(job:UploadJob):Promise<void>;
 /** Existing publisher validates first; RPC does atomic lease/version/receipt commit. */
 publisher(job:UploadJob):PublishPort;
}
export interface PrivateState {
 save(uploadId:string,stage:string,value:unknown):Promise<string>;
 load(ref:string):Promise<any>;
}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function ensure(yes:unknown,code:string):asserts yes {if(!yes)throw Error(code);}
export function nextWeekDue(date:string,start:string){
 ensure(/^\d{4}-\d{2}-\d{2}$/.test(date)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(start),'SCHEDULE_UNAVAILABLE');
 const parsed=new Date(date+'T'+start+':00+07:00');
 ensure(Number.isFinite(parsed.getTime())&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date,'SCHEDULE_UNAVAILABLE');
 return new Date(parsed.getTime()+7*86400000-30*60000).toISOString();
}
/** Overrides are a private, server-validated part of the claimed version, never
 * accepted directly from the publication payload. Legacy jobs keep exact defaults. */
export function validateUploadDeadlines(job:UploadJob){
 const due=job.due_at_by_class,overrides=job.due_at_overrides??{};
 ensure(due&&typeof due==='object'&&!Array.isArray(due)&&typeof overrides==='object'&&!Array.isArray(overrides),'INVALID_HOMEWORK_DEADLINE');
 ensure(Object.keys(due).every(id=>job.class_ids.includes(id))&&Object.keys(overrides).every(id=>job.class_ids.includes(id)),'INVALID_HOMEWORK_DEADLINE');
 for(const id of job.class_ids){
  const planned=nextWeekDue(job.class_dates[id],job.start_times[id]);
  if(Object.prototype.hasOwnProperty.call(overrides,id)){
   const end=job.end_times?.[id],value=overrides[id];
   ensure(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:[Zz]|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value),'INVALID_HOMEWORK_DEADLINE');
   // Date.parse normalizes impossible dates, so check the calendar separately.
   nextWeekDue(value.slice(0,10),'00:00');
   ensure(typeof end==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(end),'SCHEDULE_UNAVAILABLE');
   const opens=Date.parse(job.class_dates[id]+'T'+end+':00+07:00'),stamp=Date.parse(value);
   ensure(Number.isFinite(stamp)&&stamp>opens&&Date.parse(due[id])===stamp,'INVALID_HOMEWORK_DEADLINE');
  }else ensure(Date.parse(due[id])===Date.parse(planned),'SCHEDULE_UNAVAILABLE');
 }
}
function validateJob(job:UploadJob){
 ensure(job.id&&job.claim_token&&job.teacher_key&&job.class_ids.length&&new Set(job.class_ids).size===job.class_ids.length,'INVALID_JOB');
 for(const id of job.class_ids)ensure(job.class_names[id],'SCHEDULE_UNAVAILABLE');
 validateUploadDeadlines(job);
 if(job.homework_path){ensure(job.task_scope?.trim()&&job.task_scope.length<=300,'INVALID_HOMEWORK_SCOPE');ensure(job.answer_path||job.answer_text?.trim(),'TEACHER_ANSWERS_REQUIRED');}
 if(job.video_url){const u=new URL(job.video_url);ensure(u.protocol==='https:'&&!u.username&&!u.password&&(youtubeVideoId(job.video_url)||/(^|\.)zoom\.us$/.test(u.hostname)&&/^\/rec\//.test(u.pathname)),'INVALID_VIDEO');}
}
function verifyTeacher(draft:Draft,source:Extraction){
 ensure(!(source.privateAnswerHashes??[]).some(hash=>draft.assets.some(asset=>asset.sha256===hash)),'ANSWER_ASSET_FORBIDDEN');
 const slots=expectedSlots(draft.exam);ensure(slots.length>0&&slots.length===source.teacherSlots.length,'TEACHER_ANSWER_COVERAGE');
 for(const s of slots){const teachers=source.teacherSlots.filter(t=>t.question_id===s.question_id&&t.slot===s.slot);ensure(teachers.length===1&&JSON.stringify(teachers[0].expected)===JSON.stringify(s.expected),'TEACHER_ANSWER_MISMATCH');}
 return slots;
}
/** Explicit projection prevents accidentally forwarding expected/actual/solution fields to reviewer. */
export function reviewQuestions(exam:PracticeExam){return exam.questions.map(q=>({id:q.id,kind:q.kind,...(q.prompt?{prompt:q.prompt}:{}),...(q.text?{text:q.text}:{}),...('choices' in q?{choices:q.choices}:{}),...(q.statements?{statements:q.statements}:{}),...('mode' in q?{mode:q.mode}:{}),...(q.convertedFrom?{convertedFrom:q.convertedFrom}:{}),...(q.shortFormat?{shortFormat:q.shortFormat}:{}),sourceRef:q.sourceRef,...(q.sourcePdfPage?{sourcePdfPage:q.sourcePdfPage}:{}),...(q.sourceContent?.questions?{sourceContent:{questions:q.sourceContent.questions.map(({path,sha256,...rest}:any)=>({path,sha256,...(typeof rest.alt==='string'?{alt:rest.alt}:{})}))}}:{})}));}
/** One claim per tick, no scheduling/startup side effect. Unknown error text never reaches progress. */
export async function runUploadOnce(repo:WorkerRepository,pipeline:Pipeline,state:PrivateState,workerId:string){
 const job=await repo.claim(workerId);if(!job)return {status:'idle' as const};
 if(job.homework2_path)return runUploadPair(repo,pipeline,state,workerId,job);
 let step=2,mismatchDetail='';const cp={...job.checkpoint};
 const save=async(stage:string,value:unknown)=>{cp[stage]=await state.save(job.id,stage,value);};
 const mark=async(n:number,status:'dang'|'xong'|'loi'|'canh_bao',detail='')=>{await repo.current(job);await repo.step(job,n,status,detail,cp);};
 try{
  validateJob(job);ensure(['codex','chatgpt-oauth','openai'].includes(pipeline.extractor.provider)&&pipeline.extractor.model?.trim(),'EXTRACTOR_REQUIRED');
  await mark(2,'dang');
  const source:Extraction=cp.source?await state.load(cp.source):await pipeline.read(job);
  ensure(/^[a-f0-9]{64}$/.test(source.sourceVersion)&&Array.isArray(source.questions),'INVALID_EXTRACTION');
  if(job.homework_path){ensure(source.questions.length&&source.teacherSlots.length,'TEACHER_ANSWERS_REQUIRED');if(job.answer_path)ensure(Array.isArray(source.privateAnswerHashes)&&source.privateAnswerHashes.length>0&&source.privateAnswerHashes.every(h=>/^[a-f0-9]{64}$/.test(h)),'PRIVATE_ANSWER_HASH_REQUIRED');}
  await save('source',source);await mark(2,'xong',job.homework_path?'':'Không áp dụng: buổi này không có đề BTVN.');step=3;await mark(3,'dang');
  const draft:Draft|null=job.homework_path?(cp.draft?await state.load(cp.draft):await pipeline.build(job,source)):null;
  if(draft){ensure(validatePracticeExam(draft.exam).valid,'DRAFT_INVALID');verifyTeacher(draft,source);ensure(digest(source.questions)===digest(reviewQuestions(draft.exam)),'QUESTION_SOURCE_MISMATCH');}
  await save('draft',draft);await mark(3,'xong',draft?'':'Không áp dụng: buổi này chỉ có học liệu/video.');step=4;await mark(4,'dang');
  let proof:any=null,teacherPending=false;
  if(draft){
   const result:IndependentReview|PendingReview=cp.review?await state.load(cp.review):await pipeline.review({questions:reviewQuestions(draft.exam),task_scope:job.task_scope,sourceVersion:source.sourceVersion});
   if('status' in result&&result.status==='pending'){
    ensure(repo.waitReview&&/^[a-f0-9]{64}$/.test(result.request_hash)&&result.sourceVersion===source.sourceVersion,'PENDING_REVIEW_AUTHORITY_REQUIRED');
    const permission=await repo.waitReview(job,result);
    if(!permission.allowed)return {status:'waiting_review' as const,uploadId:job.id};
    teacherPending=true;proof={validator:true,independent:false,teacher_source:true,status:'teacher-pending',request_hash:result.request_hash,extractor_provider:pipeline.extractor.provider};
   }
   if(!teacherPending){
   const review=result as IndependentReview;
   ensure(review&&['grok','agy'].includes(review.provider)&&review.model?.trim()&&/^[a-f0-9]{64}$/.test(review.receipt_hash),'INDEPENDENT_REVIEW_REQUIRED');
   const slots=verifyTeacher(draft,source);ensure(Array.isArray(review.slots)&&review.slots.length===slots.length,'REVIEW_COVERAGE');
   proof={validator:true,independent:true,provider:review.provider,model:review.model,receipt_hash:review.receipt_hash,extractor_provider:pipeline.extractor.provider,slots:slots.map(s=>{
    const r=review.slots.filter(r=>r.question_id===s.question_id&&r.slot===s.slot);ensure(r.length===1,'REVIEW_COVERAGE');return {...s,...r[0],expected:s.expected};
   })};
   // Only for a useful staff-facing reason; production validator below remains the publication gate.
   for(const slot of proof.slots){
    const q=draft.exam.questions.find(q=>q.id===slot.question_id)!;
    const equal=q.kind==='short'&&typeof slot.actual==='string'?q.acceptedAnswers.some(answer=>draft.exam.rubricVersion===MTM_SCORING_VERSION?normalizeMtmShort(answer,q.shortRule!)!==null&&normalizeMtmShort(answer,q.shortRule!)===normalizeMtmShort(slot.actual,q.shortRule!):normalizedShort(q.mode,answer)!==null&&normalizedShort(q.mode,answer)===normalizedShort(q.mode,slot.actual)):JSON.stringify(slot.expected)===JSON.stringify(slot.actual);
    if(!equal){const label=q.sourceRef.replace(/[^\p{L}\p{N}\s.,()/-]/gu,'').slice(0,80)||'câu đã giao';mismatchDetail=`Đáp án ${label}${slot.slot==='answer'?'':' ý '+slot.slot} chưa khớp kết quả giải độc lập; thầy kiểm tra và up lại.`;break;}
   }
   // Run the SAME production validator before step 4 can turn green; no upload/RPC writes.
   let accepted=false;const secret='lesson-upload-local-validation-'.repeat(2);
   const validator=createBtvnPublishHandler({async rpc(a){if(a==='lookup')return {status:null};accepted=a==='publish';return {status:'da_dang'};},async upload(){}},secret);
   const response=await validator(publishRequest(job,source,draft,proof,{handoutUrl:null,materialUrl:null},secret));
   ensure(response.ok&&accepted,'INDEPENDENT_ANSWER_MISMATCH');
   await save('review',review);
   }
  }
  await mark(4,teacherPending?'canh_bao':'xong',teacherPending?'Chưa kiểm chéo — máy sẽ kiểm sau':draft?'':'Không áp dụng: không có BTVN cần giải độc lập.');step=5;await mark(5,'dang');
  const materials=cp.materials?await state.load(cp.materials):await pipeline.materials(job,'lesson-upload:'+job.id+':materials');
  ensure(materials&&(!job.handout_path||materials.handoutUrl||materials.materialUrl||materials.pending===true),'MATERIALS_REQUIRED');
  for(const url of [materials.handoutUrl,materials.materialUrl])if(url){
   const u=new URL(url);ensure(u.protocol==='https:'&&!u.username&&!u.password&&!/^\/storage\/v1\/object\/(public|sign)\//.test(u.pathname)&&!u.searchParams.has('token')&&!u.searchParams.has('access_token'),'PRIVATE_MATERIAL_REQUIRED');
   ensure(materials.access==='authenticated'&&materials.studentSafe===true&&/^[a-f0-9]{64}$/.test(materials.receipt_hash??''),'PRIVATE_MATERIAL_PROOF_REQUIRED');
   ensure(!job.answer_path||!decodeURIComponent(u.pathname).includes(job.answer_path),'ANSWER_ASSET_FORBIDDEN');
  }
  await save('materials',materials);await mark(5,materials.pending?'canh_bao':'xong',materials.pending?'Tài liệu đang chờ đường truy cập xác thực; BTVN vẫn được giao.':'');step=6;await mark(6,'dang');
  // current() here plus the atomic DB fence prevent stale jobs publishing after a reupload.
  await repo.current(job);
  if(draft){
   const secret='lesson-upload-service-validation-'.repeat(2),handler=createBtvnPublishHandler(repo.publisher(job),secret,teacherPending?{teacherPending:{requestHash:proof.request_hash,sourceVersion:source.sourceVersion}}:{});
   const response=await handler(publishRequest(job,source,draft,proof,materials,secret));
   ensure(response.ok&&['da_dang','already_published'].includes((await response.json()).status),'PUBLISH_NOT_CONFIRMED');
  }else{
   // Materials-only jobs use the same fenced commit RPC, without fabricating an exam.
   const full=material(job,materials),patch=Object.fromEntries(Object.entries(full).filter(([k,v])=>['videoId','videoUrl','handoutUrl','materialUrl','title'].includes(k)&&v!==null&&v!==undefined));
   const result=await repo.publisher(job).rpc('materials_only',{material:patch});
   ensure(result?.status==='da_dang'||result?.status==='already_published','PUBLISH_NOT_CONFIRMED');
  }
  await mark(6,'xong');await repo.finish(job);return {status:'complete' as const,uploadId:job.id};
 }catch(error){
  const code=error instanceof Error&&/^[A-Z][A-Z0-9_]{2,70}$/.test(error.message)?error.message:'WORKER_FAILED';
  // Unknown commit outcome must remain resumable under the SAME identity; never error/re-publish a new job.
  const retryable=['WORKER_RPC_FAILED','PRIVATE_UPLOAD_FAILED','PUBLISH_NOT_CONFIRMED'].includes(code);
  const detail:Record<string,string>={INDEPENDENT_REVIEW_REQUIRED:'Chưa có kết quả giải độc lập từ AI thứ hai.',INDEPENDENT_ANSWER_MISMATCH:'Kết quả giải độc lập chưa khớp đáp án giáo viên; thầy kiểm tra và up lại.',TEACHER_ANSWER_MISMATCH:'Bản dựng không khớp đáp án giáo viên; chưa giao bài.',SCHEDULE_UNAVAILABLE:'Chưa xác minh được lịch học đúng giáo viên và hạn nộp.',INVALID_HOMEWORK_DEADLINE:'Hạn nộp chưa hợp lệ hoặc không khớp phiên bản đã gửi; quản lý kiểm tra.',MATERIAL_LESSON_NOT_PUBLISHED:'Buổi này chưa có BTVN đã phát hành để gắn học liệu; quản lý kiểm tra.'};
  try{await mark(step,retryable?'dang':'loi',code==='INDEPENDENT_ANSWER_MISMATCH'&&mismatchDetail?mismatchDetail:detail[code]??(retryable?'Kết nối tạm gián đoạn; giữ tiến độ để đối soát và tiếp tục cùng phiên bản.':'Chưa xử lý xong bước này; quản lý kiểm tra biên nhận riêng.'));}catch{/* Claim lost/superseded: never mutate its replacement. */}
  return {status:retryable?'retry' as const:'blocked' as const,uploadId:job.id,code};
 }
}
function material(job:UploadJob,links:{handoutUrl:string|null;materialUrl:string|null}){
 return {lessonCode:job.lesson_code,classNames:job.class_ids.map(id=>job.class_names[id]),classDates:Object.fromEntries(job.class_ids.map(id=>[job.class_names[id],job.class_dates[id]])),date:job.lesson_date,title:job.title,titleSource:'auto',homeworkScope:job.homework_path?job.task_scope:undefined,homeworkScopeSource:job.homework_path?'auto':undefined,videoId:job.video_url?youtubeVideoId(job.video_url):null,videoUrl:job.video_url&&!youtubeVideoId(job.video_url)?job.video_url:null,homeworkNote:job.task_scope,handoutUrl:links.handoutUrl,materialUrl:links.materialUrl};
}
function publishRequest(job:UploadJob,source:Extraction,draft:Draft,proof:unknown,links:{handoutUrl:string|null;materialUrl:string|null},secret:string){
 return new Request('https://lesson-worker.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':secret},body:JSON.stringify({action:'publish',kind:'btvn',lesson_key:job.lesson_code,source_version:source.sourceVersion,material:material(job,links),exam:draft.exam,assets:draft.assets,verification:proof})});
}
/** Both papers are independently validated, uploaded and checkpointed before one atomic publication.
 * There is still one lesson, work row, deadline and ranking entry for the session. */
async function runUploadPair(repo:WorkerRepository,pipeline:Pipeline,state:PrivateState,workerId:string,job:UploadJob){
 ensure(repo.publishBundle,'BUNDLE_REPOSITORY_REQUIRED');
 const payloads:unknown[]=[],waiting:unknown[]=[];
 for(const paper of [1,2] as const){
  const projected:UploadJob={...job,paper,homework2_path:null,homework_path:paper===1?job.homework_path:job.homework2_path!,answer_path:paper===1?job.answer_path:job.answer2_path??null,answer_text:paper===1?job.answer_text:job.answer2_text??null,task_scope:paper===1?job.task_scope:job.task_scope2||job.task_scope,checkpoint:job.checkpoint['paper'+paper]??{}};
  let claimed=false;
  const port=repo.publisher(job);
  const inner:WorkerRepository={
   async claim(){if(claimed)return null;claimed=true;return projected;},current:()=>repo.current(job),
   async step(_j,n,status,detail,checkpoint){
    job.checkpoint={...job.checkpoint,['paper'+paper]:checkpoint};
    // Completion can only follow the real atomic commit, never the local capture.
    if(n===6&&status==='xong')return;
    await repo.step(job,n,status,detail,{['paper'+paper]:checkpoint},paper);
   },waitReview:repo.waitReview?(_j,request)=>repo.waitReview!(projected,request):undefined,async finish(){},publisher(){return {upload:port.upload.bind(port),async rpc(action,payload){if(action==='lookup')return {status:null};ensure(action==='publish','INVALID_BUNDLE_ACTION');payloads[paper-1]=payload;return {status:'da_dang'};}};}
  };
  const privatePaperState:PrivateState={save:(id,stage,value)=>state.save(id+'-de-'+paper,stage,value),load:ref=>state.load(ref)};
  const result=await runUploadOnce(inner,pipeline,privatePaperState,workerId);
  if(result.status==='waiting_review'){waiting.push(result);continue;}
  if(result.status!=='complete')return result;
 }
 if(waiting.length)return {status:'waiting_review' as const,uploadId:job.id};
 await repo.current(job);await repo.publishBundle(job,payloads[0],payloads[1]);
 for(const paper of [1,2] as const)await repo.step(job,6,'xong','',{},paper);
 await repo.finish(job);return {status:'complete' as const,uploadId:job.id};
}
export const privateStateDigest=digest;
