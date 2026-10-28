import {validatePracticeExam,type PracticeExam} from '../../src/native/exams/data';
import {normalizedShort} from '../../src/native/exams/assessment';
import {mtmPracticeGradingReadiness} from '../../src/native/exams/mtm-assessment';
import {MTM_SCORING_VERSION,normalizeMtmShort} from '../../src/native/exams/mtm-scoring';
import {classOpeningTimes} from './class-schedule';
import {classRules,loadClassRules} from './class-rules';
import {scheduleEnvironment} from '../schedule/lich-lop';
import {attendanceRpc} from './publish-attendance';
import {scorebookRpc,scorebookResult} from './publish-scorebook';
export type PublishAsset={path:string;sha256:string;content_type:string;data_base64:string};
export interface PublishPort {
 rpc(action:string,payload:Record<string,unknown>):Promise<any>;
 upload(path:string,bytes:Uint8Array,type:string,sha256:string):Promise<void>;
}
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes).buffer))).map(x=>x.toString(16).padStart(2,'0')).join('');
const canonical=(value:unknown):string=>JSON.stringify(value);
export type AnswerSlot={question_id:string;slot:string;expected:boolean|string|string[]};
export function expectedSlots(exam:PracticeExam):AnswerSlot[]{return exam.questions.flatMap<AnswerSlot>(q=>q.kind==='tf'?q.answer.map((expected,i)=>({question_id:q.id,slot:'abcd'[i],expected})):[{question_id:q.id,slot:'answer',expected:q.kind==='self'?'self':q.kind==='short'?q.acceptedAnswers:q.answer}]);}
function ensure(value:unknown,message:string):asserts value {if(!value)throw Error(message);}
function references(exam:PracticeExam){
 const refs:{path:string;sha256:string}[]=[];
 for(const q of exam.questions)for(const s of [...q.sourceContent?.questions??[],...q.sourceContent?.solutions??[]])refs.push(s);
 refs.push(...exam.sourceInstructions??[],...exam.solutionInstructions??[]);
 for(const pdf of [exam.sourcePdf,exam.mtmDocuments?.questions,exam.mtmDocuments?.solutions])if(pdf){ensure(pdf.url.startsWith('/exam-assets/'),'PDF_MUST_BE_PRIVATE');refs.push({path:pdf.url.slice(1),sha256:pdf.sha256});}
 return refs;
}
/** Factory thuần: test tiêm port giả; không đọc env hoặc mạng khi import. */
export function createBtvnPublishHandler(port:PublishPort,secret:string,options:{scheduleEnv?:Record<string,string|undefined>;scheduleTransport?:typeof fetch}={}){return async(request:Request)=>{
 const respond=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
 if(request.method!=='POST')return respond(405,{error_code:'POST_REQUIRED'});
 // So hash có chiều dài cố định; không trả khác biệt giữa secret sai/thiếu.
 const supplied=request.headers.get('X-MTM-Publish-Secret')??'';
 if(!secret||secret.length<32||supplied.length>1024)return respond(401,{error_code:'UNAUTHORIZED'});
 const a=await hash(new TextEncoder().encode(secret)),b=await hash(new TextEncoder().encode(supplied));let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 if(diff)return respond(401,{error_code:'UNAUTHORIZED'});
 try{
  const text=await request.text();ensure(text.length<=48*1024*1024,'PAYLOAD_TOO_LARGE');
  const body=JSON.parse(text);ensure(body&&typeof body==='object'&&!Array.isArray(body),'INVALID_PAYLOAD');
  const read=scorebookRpc(body);
  if(read)return respond(200,scorebookResult(read.name,await port.rpc(read.name,read.payload)));
  const scheduleEnv=options.scheduleEnv??scheduleEnvironment();
  const rules=['sync_due','publish','update_material'].includes(body.action)?await loadClassRules(scheduleEnv,options.scheduleTransport):classRules;
  const attendance=attendanceRpc(body,rules);
  if(attendance){ensure(new TextEncoder().encode(text).length<=10*1024*1024,'PAYLOAD_TOO_LARGE');return respond(200,await port.rpc(attendance.name,attendance.payload));}
  ensure(['lookup','publish','error','update_material'].includes(body.action)&&/^[a-z0-9-]{1,160}$/.test(body.lesson_key),'INVALID_ACTION');
  const previous=await port.rpc('lookup',{lesson_key:body.lesson_key});
  if(body.action==='lookup')return respond(200,previous);
  if(body.action==='update_material'){
   ensure(previous.status==='da_dang','LESSON_NOT_PUBLISHED');
   ensure(Object.keys(body).every(k=>['action','lesson_key','material'].includes(k)),'INVALID_UPDATE');
   const patch=body.material;
   ensure(patch&&typeof patch==='object'&&!Array.isArray(patch)&&Object.keys(patch).length>0,'INVALID_UPDATE');
   const allowed=['videoId','videoUrl','materialUrl','handoutUrl','homeworkNote','title','titleSource','classOpensAt'];
   ensure(Object.keys(patch).every(k=>allowed.includes(k)),'INVALID_UPDATE');
   for(const [key,value] of Object.entries(patch)){
    if(key==='titleSource')ensure(value==='sheet'||value==='auto','INVALID_TITLE_SOURCE');
    else if(key==='videoId')ensure(value===null||typeof value==='string'&&/^[a-zA-Z0-9_-]{11}$/.test(value),'INVALID_VIDEO');
    else if(['videoUrl','materialUrl','handoutUrl'].includes(key)){
     if(value!==null){ensure(typeof value==='string'&&value.length<=4096,'INVALID_MATERIAL_LINK');const url=new URL(value);ensure(url.protocol==='https:'&&!url.username&&!url.password,'INVALID_MATERIAL_LINK');}
    }else if(key==='classOpensAt'){
     ensure(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0&&Object.entries(value).every(([name,date])=>name.length>0&&name.length<=100&&typeof date==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===date.slice(0,10)),'INVALID_CLASS_OPENING');
    }else ensure(typeof value==='string'&&value.length<=300&&(key!=='title'||value.trim().length>0),'INVALID_MATERIAL');
   }
   return respond(200,await port.rpc('update_material',{lesson_key:body.lesson_key,material:patch}));
  }
  if(previous.status==='da_dang')return respond(200,{status:'already_published'});
  ensure(/^[a-f0-9]{64}$/.test(body.source_version??''),'INVALID_VERSION');
  const kind=body.kind??'btvn';ensure(['btvn','kiem-tra-thang'].includes(kind),'INVALID_KIND');
  if(kind==='kiem-tra-thang')ensure(typeof body.opensAt==='string'&&typeof body.closesAt==='string'&&/([zZ]|[+-]\d{2}:\d{2})$/.test(body.opensAt)&&/([zZ]|[+-]\d{2}:\d{2})$/.test(body.closesAt)&&Number.isFinite(Date.parse(body.opensAt))&&Date.parse(body.opensAt)>=Date.parse('2026-10-15T00:00:00+07:00')&&Date.parse(body.closesAt)>Date.parse(body.opensAt),'INVALID_MONTHLY_WINDOW');
  const m=body.material;
  ensure(m?.homeworkScope===undefined||typeof m.homeworkScope==='string'&&m.homeworkScope.length>0&&m.homeworkScope.length<=300,'INVALID_HOMEWORK_SCOPE');
  ensure(m?.homeworkScopeSource===undefined||['sheet','auto','whole_file'].includes(m.homeworkScopeSource),'INVALID_HOMEWORK_SCOPE_SOURCE');
  ensure((m?.homeworkScope===undefined)===(m?.homeworkScopeSource===undefined),'INVALID_HOMEWORK_SCOPE');
  ensure(m?.titleSource===undefined||m.titleSource==='sheet'||m.titleSource==='auto','INVALID_TITLE_SOURCE');
  ensure(m?.lessonCode===body.lesson_key&&Array.isArray(m.classNames)&&m.classNames.length>0&&m.classNames.length<=50&&new Set(m.classNames).size===m.classNames.length&&m.classNames.every((x:unknown)=>typeof x==='string'&&x.length>0&&x.length<=100),'INVALID_MATERIAL');
  ensure(/^\d{4}-\d{2}-\d{2}$/.test(m.date)&&new Date(m.date).toISOString().slice(0,10)===m.date&&typeof m.title==='string'&&m.title.length>0&&m.title.length<=300,'INVALID_MATERIAL');
  const link=(v:unknown)=>{if(v===null||v===undefined||v==='')return null;ensure(typeof v==='string'&&v.length<=4096,'INVALID_MATERIAL_LINK');const u=new URL(v);ensure(u.protocol==='https:'&&!u.username&&!u.password,'INVALID_MATERIAL_LINK');return u.href;};
  const classDates=m.classDates??{};ensure(classDates&&typeof classDates==='object'&&!Array.isArray(classDates)&&Object.entries(classDates).every(([name,date])=>m.classNames.includes(name)&&typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&new Date(date).toISOString().slice(0,10)===date),'INVALID_CLASS_DATES');
  const material={lessonCode:m.lessonCode,classNames:m.classNames,date:m.date,title:m.title,titleSource:m.titleSource??'sheet',homeworkScope:m.homeworkScope,homeworkScopeSource:m.homeworkScopeSource,classDates,classOpensAt:classOpeningTimes({...m,classDates},rules,!!scheduleEnv.MTM_LICH_LOP_CSV),videoId:m.videoId??null,materialUrl:link(m.materialUrl),handoutUrl:link(m.handoutUrl),homeworkUrl:null,videoUrl:link(m.videoUrl),homeworkNote:typeof m.homeworkNote==='string'?m.homeworkNote.slice(0,300):undefined};
  // PDF BTVN chỉ mở qua chữ ký riêng; không trả đường nguồn trực tiếp của đề.
  ensure(material.videoId===null||/^[a-zA-Z0-9_-]{11}$/.test(material.videoId),'INVALID_VIDEO');
  if(body.action==='error'){
   ensure(/^[A-Z0-9_]{1,80}$/.test(body.error_code??''),'INVALID_ERROR');
   const reason=typeof body.reason==='string'&&body.reason.length<=1000&&!/(https?:|@|bearer|sk-|secret|token|password|otp)/i.test(body.reason)?body.reason.replace(/[\x00-\x1f]/g,' '):'Không đạt bộ kiểm; xem receipt riêng của worker.';
   return respond(200,await port.rpc('error',{lesson_key:body.lesson_key,source_version:body.source_version,material,error_code:body.error_code,reason}));
  }
  const exam=body.exam as PracticeExam;ensure(validatePracticeExam(exam).valid&&exam.durationMinutes===120,'VALIDATOR_FAILED');
  if(exam.rubricVersion===MTM_SCORING_VERSION)ensure(mtmPracticeGradingReadiness(exam).valid,'MTM_GRADING_NOT_READY');
  const proof=body.verification;
  ensure(proof?.validator===true&&proof.independent===true&&/^[a-f0-9]{64}$/.test(proof.receipt_hash??'')&&typeof proof.provider==='string'&&proof.provider.trim().length>0&&typeof proof.model==='string'&&proof.model.trim().length>0,'REVIEW_REQUIRED');
  const slots=expectedSlots(exam);ensure(Array.isArray(proof.slots)&&proof.slots.length===slots.length,'REVIEW_COVERAGE');
  ensure(typeof proof.extractor_provider==='string'&&proof.extractor_provider!==proof.provider,'INDEPENDENT_PROVIDER_REQUIRED');
  for(const slot of slots){
   const matches=proof.slots.filter((x:any)=>x.question_id===slot.question_id&&x.slot===slot.slot),q=exam.questions.find(q=>q.id===slot.question_id)!;
   ensure(matches.length===1&&canonical(matches[0].expected)===canonical(slot.expected),'REVIEW_MISMATCH');
   if(q.convertedFrom==='essay'||q.kind==='self'||(exam.rubricVersion==='MTM-BTVN-10-v1'&&q.kind==='short'))ensure(matches[0].conversion_verified===true,'CONVERSION_REVIEW_REQUIRED');
   const actual=matches[0].actual;
   if(q.kind==='short'&&exam.rubricVersion===MTM_SCORING_VERSION){
    ensure(typeof actual==='string','REVIEW_MISMATCH');
    const normalized=normalizeMtmShort(actual,q.shortRule!);
    ensure(normalized!==null&&q.acceptedAnswers.some(expected=>normalizeMtmShort(expected,q.shortRule!)===normalized),'REVIEW_MISMATCH');
   }else ensure(q.kind==='short'?typeof actual==='string'&&normalizedShort(q.mode,actual)!==null&&q.acceptedAnswers.some(a=>normalizedShort(q.mode,a)===normalizedShort(q.mode,actual)):canonical(actual)===canonical(slot.expected),'REVIEW_MISMATCH');
  }
  ensure(Array.isArray(body.assets)&&body.assets.length>0&&body.assets.length<=500,'INVALID_ASSETS');
  const assets=body.assets as PublishAsset[],paths=new Set<string>();let bytesTotal=0;
  const decoded=await Promise.all(assets.map(async asset=>{
   ensure(typeof asset.path==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_/-]*\.(png|pdf)$/.test(asset.path)&&!asset.path.split('/').includes('..')&&!asset.path.includes('//')&&!paths.has(asset.path),'INVALID_PATH');paths.add(asset.path);
   ensure(/^[a-f0-9]{64}$/.test(asset.sha256)&&['application/pdf','image/png'].includes(asset.content_type)&&asset.path.endsWith(asset.content_type==='image/png'?'.png':'.pdf'),'INVALID_ASSET');
   ensure(typeof asset.data_base64==='string'&&/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data_base64)&&asset.data_base64.length<=21*1024*1024,'INVALID_BASE64');
   const raw=atob(asset.data_base64),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));bytesTotal+=bytes.length;
   ensure(bytes.length>=8&&bytes.length<=15*1024*1024&&bytesTotal<=32*1024*1024&&await hash(bytes)===asset.sha256,'ASSET_HASH_MISMATCH');
   ensure(asset.content_type==='image/png'?bytes.slice(0,8).every((x,i)=>x===[137,80,78,71,13,10,26,10][i]):new TextDecoder().decode(bytes.slice(0,5))==='%PDF-','INVALID_FILE_SIGNATURE');
   return {asset,bytes,storage_path:`btvn/${body.lesson_key}/${body.source_version}/${asset.path}`};
  }));
  for(const ref of references(exam))ensure(assets.some(a=>a.path===ref.path&&a.sha256===ref.sha256),'ASSET_REFERENCE_MISSING');
  // Upload không ghi đè; port đối chiếu hash nếu tệp đã có từ lượt dở.
  for(const item of decoded)await port.upload(item.storage_path,item.bytes,item.asset.content_type,item.asset.sha256);
  const metadata=decoded.map(({asset,bytes,storage_path})=>({path:asset.path,sha256:asset.sha256,content_type:asset.content_type,bytes:bytes.length,storage_path}));
  return respond(200,await port.rpc('publish',{kind,opensAt:body.opensAt,closesAt:body.closesAt,lesson_key:body.lesson_key,source_version:body.source_version,material,exam,assets:metadata,verification:proof}));
 }catch(e){
  // Người gọi đã qua secret; chỉ trả mã kiểm dạng HOA_GACH (không thông điệp DB, không dữ liệu HS) để biết kiểm nào trượt.
  const code=e instanceof Error&&/^[A-Z][A-Z0-9_]{2,59}$/.test(e.message)?e.message:'UNCLASSIFIED';
  console.warn('[btvn-publish] rejected',code);
  return new Response(JSON.stringify({error_code:'PUBLISH_REJECTED'}),{status:422,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-MTM-Reject-Code':code}});
 }
};}
