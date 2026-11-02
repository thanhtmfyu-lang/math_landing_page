import {createHash} from 'node:crypto';
import {createBtvnPublishHandler,expectedSlots,type AnswerSlot,type PublishAsset,type PublishPort} from '../btvn/publish-handler';
import {validatePracticeExam,type PracticeExam} from '../../src/native/exams/data';
import {youtubeVideoId} from '../btvn/lesson-materials';
import {normalizedShort} from '../../src/native/exams/assessment';
import {MTM_SCORING_VERSION,normalizeMtmShort} from '../../src/native/exams/mtm-scoring';

export type UploadJob={id:string;class_ids:string[];lesson_date:string;teacher_key:string;title:string;task_scope:string;homework_path:string|null;answer_path:string|null;answer_text:string|null;handout_path:string|null;video_url:string|null;version:number;claim_token:string;lesson_code:string;class_names:Record<string,string>;class_dates:Record<string,string>;start_times:Record<string,string>;due_at_by_class:Record<string,string>;checkpoint:Record<string,any>};
export type Extraction={sourceVersion:string;questions:unknown[];teacherSlots:AnswerSlot[];privateAnswerHashes?:string[]};
export type Draft={exam:PracticeExam;assets:PublishAsset[]};
export type PreparedMaterials={handoutUrl:string|null;materialUrl:string|null;access?:'authenticated';studentSafe?:true;receipt_hash?:string};
export type IndependentReview={provider:'grok'|'agy';model:string;receipt_hash:string;slots:{question_id:string;slot:string;actual:unknown;conversion_verified?:boolean}[]};
export interface Pipeline {
 extractor:{provider:'codex';model:string};
 /** Input has private GV answers. Return statement-only questions separately. */
 read(job:UploadJob):Promise<Extraction>;
 build(job:UploadJob,source:Extraction):Promise<Draft>;
 /** Separate provider/session, statement-only input: never the draft/teacher key. */
 review(input:{questions:unknown[];task_scope:string;sourceVersion:string}):Promise<IndependentReview>;
 /** Idempotent private handout copying/signing. Never return a raw answer URL. */
 materials(job:UploadJob,idempotencyKey:string):Promise<PreparedMaterials>;
}
export interface WorkerRepository {
 claim(workerId:string):Promise<UploadJob|null>;
 current(job:UploadJob):Promise<void>;
 step(job:UploadJob,step:number,status:'dang'|'xong'|'loi',detail:string,checkpoint:Record<string,unknown>):Promise<void>;
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
function validateJob(job:UploadJob){
 ensure(job.id&&job.claim_token&&job.teacher_key&&job.class_ids.length&&new Set(job.class_ids).size===job.class_ids.length,'INVALID_JOB');
 for(const id of job.class_ids){ensure(job.class_names[id],'SCHEDULE_UNAVAILABLE');ensure(Date.parse(job.due_at_by_class[id])===Date.parse(nextWeekDue(job.class_dates[id],job.start_times[id])),'SCHEDULE_UNAVAILABLE');}
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
 let step=2,mismatchDetail='';const cp={...job.checkpoint};
 const save=async(stage:string,value:unknown)=>{cp[stage]=await state.save(job.id,stage,value);};
 const mark=async(n:number,status:'dang'|'xong'|'loi',detail='')=>{await repo.current(job);await repo.step(job,n,status,detail,cp);};
 try{
  validateJob(job);ensure(pipeline.extractor.provider==='codex'&&pipeline.extractor.model?.trim(),'EXTRACTOR_REQUIRED');
  await mark(2,'dang');
  const source:Extraction=cp.source?await state.load(cp.source):await pipeline.read(job);
  ensure(/^[a-f0-9]{64}$/.test(source.sourceVersion)&&Array.isArray(source.questions),'INVALID_EXTRACTION');
  if(job.homework_path){ensure(source.questions.length&&source.teacherSlots.length,'TEACHER_ANSWERS_REQUIRED');if(job.answer_path)ensure(Array.isArray(source.privateAnswerHashes)&&source.privateAnswerHashes.length>0&&source.privateAnswerHashes.every(h=>/^[a-f0-9]{64}$/.test(h)),'PRIVATE_ANSWER_HASH_REQUIRED');}
  await save('source',source);await mark(2,'xong',job.homework_path?'':'Không áp dụng: buổi này không có đề BTVN.');step=3;await mark(3,'dang');
  const draft:Draft|null=job.homework_path?(cp.draft?await state.load(cp.draft):await pipeline.build(job,source)):null;
  if(draft){ensure(validatePracticeExam(draft.exam).valid,'DRAFT_INVALID');verifyTeacher(draft,source);ensure(digest(source.questions)===digest(reviewQuestions(draft.exam)),'QUESTION_SOURCE_MISMATCH');}
  await save('draft',draft);await mark(3,'xong',draft?'':'Không áp dụng: buổi này chỉ có học liệu/video.');step=4;await mark(4,'dang');
  let proof:any=null;
  if(draft){
   const review:IndependentReview=cp.review?await state.load(cp.review):await pipeline.review({questions:reviewQuestions(draft.exam),task_scope:job.task_scope,sourceVersion:source.sourceVersion});
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
  await mark(4,'xong',draft?'':'Không áp dụng: không có BTVN cần giải độc lập.');step=5;await mark(5,'dang');
  const materials=cp.materials?await state.load(cp.materials):await pipeline.materials(job,'lesson-upload:'+job.id+':materials');
  ensure(materials&&(!job.handout_path||materials.handoutUrl||materials.materialUrl),'MATERIALS_REQUIRED');
  for(const url of [materials.handoutUrl,materials.materialUrl])if(url){
   const u=new URL(url);ensure(u.protocol==='https:'&&!u.username&&!u.password&&!/^\/storage\/v1\/object\/(public|sign)\//.test(u.pathname)&&!u.searchParams.has('token')&&!u.searchParams.has('access_token'),'PRIVATE_MATERIAL_REQUIRED');
   ensure(materials.access==='authenticated'&&materials.studentSafe===true&&/^[a-f0-9]{64}$/.test(materials.receipt_hash??''),'PRIVATE_MATERIAL_PROOF_REQUIRED');
   ensure(!job.answer_path||!decodeURIComponent(u.pathname).includes(job.answer_path),'ANSWER_ASSET_FORBIDDEN');
  }
  await save('materials',materials);await mark(5,'xong');step=6;await mark(6,'dang');
  // current() here plus the atomic DB fence prevent stale jobs publishing after a reupload.
  await repo.current(job);
  if(draft){
   const secret='lesson-upload-service-validation-'.repeat(2),handler=createBtvnPublishHandler(repo.publisher(job),secret);
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
  const detail:Record<string,string>={INDEPENDENT_REVIEW_REQUIRED:'Chưa có kết quả giải độc lập từ AI thứ hai.',INDEPENDENT_ANSWER_MISMATCH:'Kết quả giải độc lập chưa khớp đáp án giáo viên; thầy kiểm tra và up lại.',TEACHER_ANSWER_MISMATCH:'Bản dựng không khớp đáp án giáo viên; chưa giao bài.',SCHEDULE_UNAVAILABLE:'Chưa xác minh được lịch học đúng giáo viên và hạn nộp.',MATERIAL_LESSON_NOT_PUBLISHED:'Buổi này chưa có BTVN đã phát hành để gắn học liệu; quản lý kiểm tra.'};
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
export const privateStateDigest=digest;
