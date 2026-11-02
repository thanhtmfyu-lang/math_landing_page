import {validateMonthlyPayload} from './monthly-validation';
import {createHash} from 'node:crypto';
import {expectedSlots,type PublishPort} from '../btvn/publish-handler';
import {reviewQuestions,type Draft,type Extraction,type IndependentReview,type PendingReview,type PrivateState,type UploadJob} from './worker';
export type MonthlyJob={id:string;class_ids:string[];class_names:Record<string,string>;class_dates:Record<string,string>;teacher_keys:Record<string,string>;exam_date:string;opens_at:string;closes_at:string;title:string;version:number;claim_token:string;lesson_code:string;papers:{code:number;homework_path:string;answer_path:string|null;answer_text:string|null;essay_max_score?:number;essay_rubric?:string}[];checkpoint:Record<string,string>};
export type MonthlyReview=IndependentReview&{sourceVersion:string;request_hash:string;sympy_checks?:unknown[]};
export type SympyProof={engine:'sympy';version:string;sourceVersion:string;passed:boolean;receipt_hash:string;slots:{question_id:string;slot:string;actual:unknown}[]};
export interface MonthlyPipeline{
 extractor:{provider:string;model:string};read(job:UploadJob):Promise<Extraction>;build(job:UploadJob,source:Extraction):Promise<Draft>;
 review(input:{questions:unknown[];task_scope:string;sourceVersion:string},provider:'grok'|'agy'):Promise<MonthlyReview|PendingReview>;
 sympy(input:{questions:unknown[];sourceVersion:string;reviews:MonthlyReview[]}):Promise<SympyProof>;
}
export interface MonthlyRepository{
 claim(worker:string):Promise<MonthlyJob|null>;current(job:MonthlyJob):Promise<void>;checkpoint(job:MonthlyJob,checkpoint:Record<string,string>):Promise<void>;
 wait(job:MonthlyJob):Promise<void>;block(job:MonthlyJob):Promise<void>;publish(job:MonthlyJob,payloads:unknown[]):Promise<void>;assets(job:MonthlyJob):PublishPort;
}
function need(value:unknown,code:string):asserts value{if(!value)throw Error(code);}
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function monthlyPaperJob(job:MonthlyJob,paper:1|2):UploadJob{
 const p=job.papers[paper-1];need(p?.code===100+paper&&p.homework_path&&(p.answer_path||p.answer_text),'TWO_PAPERS_AND_KEYS_REQUIRED');
 return {...job,paper,lesson_date:job.exam_date,teacher_key:Object.values(job.teacher_keys)[0],task_scope:'Toàn bộ đề, giữ nguyên TN, Đ/S, TLN và tự luận; không chuyển dạng câu hỏi.',homework_path:p.homework_path,answer_path:p.answer_path,answer_text:p.answer_text,handout_path:null,video_url:null,start_times:{},due_at_by_class:{},checkpoint:{},lesson_code:job.lesson_code+'-thi-ma-'+paper};
}
/** Finite, same queue/lock as BTVN. No timer fallback, no scheduler and no grade mutations. */
export async function runMonthlyUploadOnce(repo:MonthlyRepository,pipeline:MonthlyPipeline,state:PrivateState,worker:string){
 const job=await repo.claim(worker);if(!job)return {status:'idle' as const};
 const cp={...job.checkpoint},payloads:any[]=[];let waiting=false;
 const save=async(key:string,value:unknown)=>{cp[key]=await state.save(job.id,'monthly-'+key,value);await repo.current(job);await repo.checkpoint(job,cp);};
 try{
  need(job.papers.length===2&&new Set(job.papers.map(p=>p.homework_path)).size===2,'TWO_PAPERS_AND_KEYS_REQUIRED');
  for(const paper of [1,2] as const){
   await repo.current(job);const key='paper'+paper,projected=monthlyPaperJob(job,paper);
   const source:Extraction=cp[key+'source']?await state.load(cp[key+'source']):await pipeline.read(projected);
   if(cp[key+'extractor'])Object.assign(pipeline.extractor,await state.load(cp[key+'extractor']));else await save(key+'extractor',pipeline.extractor);
   await save(key+'source',source);
   const draft:Draft=cp[key+'draft']?await state.load(cp[key+'draft']):await pipeline.build(projected,source);await save(key+'draft',draft);
   need(!draft.exam.questions.some(q=>q.convertedFrom==='essay'),'MONTHLY_ESSAY_CONVERSION_FORBIDDEN');
   if(draft.exam.questions.some(q=>q.kind==='self'))need(Number.isFinite(job.papers[paper-1].essay_max_score)&&job.papers[paper-1].essay_max_score!>0&&job.papers[paper-1].essay_rubric?.trim(),'ESSAY_RUBRIC_REQUIRED');
   need(/^[a-f0-9]{64}$/.test(source.sourceVersion)&&hash(source.questions)===hash(reviewQuestions(draft.exam)),'SOURCE_QUESTIONS_CHANGED');
   const slots=expectedSlots(draft.exam);need(slots.length>0&&slots.length===source.teacherSlots.length&&slots.every(s=>source.teacherSlots.filter(t=>t.question_id===s.question_id&&t.slot===s.slot&&hash(t.expected)===hash(s.expected)).length===1),'TEACHER_KEY_MISMATCH');
   need(!(source.privateAnswerHashes??[]).some(h=>draft.assets.some(a=>a.sha256===h)),'TEACHER_ASSET_FORBIDDEN');
   const reviews:MonthlyReview[]=[];
   for(const provider of ['grok','agy'] as const){
    const rkey=key+provider,result=cp[rkey]?await state.load(cp[rkey]):await pipeline.review({questions:reviewQuestions(draft.exam),task_scope:projected.task_scope,sourceVersion:source.sourceVersion},provider);
    if('status' in result){need(result.status==='pending'&&result.sourceVersion===source.sourceVersion,'INVALID_PENDING_REVIEW');waiting=true;continue;}
    need(result.provider===provider&&result.sourceVersion===source.sourceVersion&&result.model&&/^[a-f0-9]{64}$/.test(result.receipt_hash),'REAL_PROVIDER_RECEIPT_REQUIRED');await save(rkey,result);reviews.push(result);
   }
   if(reviews.length!==2)continue;
   need(reviews[0].request_hash!==reviews[1].request_hash&&reviews[0].receipt_hash!==reviews[1].receipt_hash,'INDEPENDENT_CONTEXT_REQUIRED');
   const sympy:SympyProof=cp[key+'sympy']?await state.load(cp[key+'sympy']):await pipeline.sympy({questions:reviewQuestions(draft.exam),sourceVersion:source.sourceVersion,reviews});await save(key+'sympy',sympy);
   // The source remains in the private extraction receipt, not in a delivered URL.
   const exam={...draft.exam,sourceUrl:'https://minhthanhmath.vn/quan-tri/len-bai'};
   const payload={kind:'kiem-tra-thang',lesson_key:projected.lesson_code,source_version:source.sourceVersion,opensAt:job.opens_at,closesAt:job.closes_at,
    material:{lessonCode:projected.lesson_code,title:job.title,date:job.exam_date,classNames:Object.values(job.class_names),classDates:Object.fromEntries(Object.values(job.class_names).map(n=>[n,job.exam_date])),titleSource:'auto'},exam,assets:draft.assets,
    verification:{...reviews[0],extractor_provider:pipeline.extractor.provider,validator:true,independent:true},monthly_verification:{sourceVersion:source.sourceVersion,passed:true,reviews,sympy}};
   // Validate before uploading any asset, then the gateway validates stored bytes again.
   await validateMonthlyPayload(payload,{async rpc(){throw Error('UNEXPECTED_RPC');},async upload(){}});
   payloads.push(await validateMonthlyPayload(payload,repo.assets(job)));
  }
  if(waiting){await repo.wait(job);return {status:'waiting_review' as const};}
  need(payloads.length===2,'TWO_PAPERS_REQUIRED');await repo.current(job);await repo.publish(job,payloads);return {status:'complete' as const};
 }catch(error){await repo.block(job).catch(()=>{});return {status:'blocked' as const,code:error instanceof Error&&/^[A-Z_]{3,60}$/.test(error.message)?error.message:'MONTHLY_WORKER_FAILED'};}
}

export type EssayGrade={provider:'grok'|'agy'|'codex'|'claude';model:string;request_id:string;receipt_hash:string;submission_hash:string;rubric_hash:string;score:number;max_score:number;images_seen:boolean};
/** Grades are private suggestions. Never write paper_scores or overwrite original work. */
export async function gradeMonthlyEssay(input:{submission_hash:string;rubric_hash:string;max_score:number},grade:(provider:EssayGrade['provider'])=>Promise<EssayGrade>,third:'codex'|'claude'='codex'){
 const check=(r:EssayGrade,p:EssayGrade['provider'])=>{need(r.provider===p&&r.model?.trim()&&r.request_id?.trim()&&/^[a-f0-9]{64}$/.test(r.receipt_hash)&&r.submission_hash===input.submission_hash&&r.rubric_hash===input.rubric_hash&&r.images_seen===true&&Number.isFinite(r.score)&&r.max_score===input.max_score&&r.score>=0&&r.score<=input.max_score,'ESSAY_RECEIPT_REQUIRED');return r;};
 const first=check(await grade('grok'),'grok'),second=check(await grade('agy'),'agy'),reviews=[first,second];
 need(first.request_id!==second.request_id&&first.receipt_hash!==second.receipt_hash,'INDEPENDENT_CONTEXT_REQUIRED');
 if(Math.abs(Math.round(first.score*100)-Math.round(second.score*100))>25)reviews.push(check(await grade(third),third));
 return {status:'reviewed' as const,reviews,requires_manager_confirmation:true,paper_scores_unchanged:true};
}
