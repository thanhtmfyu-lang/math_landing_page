/** BTVN partial/PDF gateway. Không đổi PracticeExam hay giả sourceComplete. */
export const RELEASE_CONTRACT = 'MTM-BTVN-RELEASE-20261019-v1';
export type SourceItem = {id:string;sourceRef:string;kind:'mc'|'tf'|'short'|'manual';contentHash:string};
export type SourceBinding = {lessonKey:string;sourceVersion:string;scopeHash:string;inventoryHash:string;hsSha256:string;gvSha256:string;classDates:Record<string,string>};
export type PrivatePdf = {path:string;sha256:string;bytes:number};
export type ReviewBinding = {id:string;sourceVersion:string;scopeHash:string;inventoryHash:string;contentHash:string;examVersionHash:string;receiptHash:string};
export type PublicQuestion = {id:string;sourceRef:string;kind:'mc'|'tf'|'short';prompt:string;choices?:[string,string,string,string];statements?:[string,string,string,string]};
export type AcceptedItem = {id:string;contentHash:string;examVersionHash:string;receiptHash:string;question:PublicQuestion};
export type PendingItem = {id:string;reasonCode:'FORMAT'|'MATH'|'COVERAGE'|'ANSWER_MISSING'|'REVIEW_PENDING';repairTaskId:string};
export type ReleaseManifest = {contract:typeof RELEASE_CONTRACT;mode:'partial'|'pdf-simple';source:SourceBinding;accepted:AcceptedItem[];pending:PendingItem[];pdf:{questions:PrivatePdf;answers:PrivatePdf;questionOnlyReceiptHash:string;teacherKeyReceiptHash:string}};
/** Registry server đã xác minh độc lập, không lấy các giá trị này từ request. */
export type PinnedSource = {source:SourceBinding;sourceCorrect:true;inventory:SourceItem[];questionsPdf:PrivatePdf;answersPdf:PrivatePdf;questionOnlyReceiptHash:string;teacherKeyReceiptHash:string;teacherPdfKeyComplete:boolean;teacherKeyCoveredSourceRefs:string[];keyAvailability:'complete'|'partial'|'none';reviews:ReviewBinding[];classOpensAt:Record<string,string>;classDueAt:Record<string,string|null>};
export type TeacherKeyCoverage={complete:boolean;coveredSourceRefs:string[];missingSourceRefs:string[]};
export type ApprovedRelease = {manifest:ReleaseManifest;manifestHash:string;inventory:SourceItem[];sourceCount:number;acceptedCount:number;pendingCount:number;teacherKeyCoverage:TeacherKeyCoverage;officialGrading:'pending';label:'Bản đơn giản'|'Bản đang bổ sung';classOpensAt:Record<string,string>;classDueAt:Record<string,string|null>};
export class GateError extends Error {code:string;constructor(code:string){super(code);this.code=code;}}
export function ensure(value:unknown,code:string):asserts value {if(!value)throw new GateError(code);}
export type StepOptions={stepTimeoutMs?:number};
export class StepTimeout extends GateError {step:string;constructor(step:string,mutation:boolean){super(mutation?'MUTATION_OUTCOME_UNKNOWN':'STEP_TIMEOUT');this.step=step;}}
/** Abort là yêu cầu hủy có thể có hiệu lực sau commit. Timeout mutation luôn
 * là kết quả chưa rõ, không phải rollback và không được retry bằng key mới. */
export async function boundedStep<T>(name:string,options:StepOptions,mutation:boolean,run:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  const ms=options.stepTimeoutMs??10000;ensure(Number.isSafeInteger(ms)&&ms>=1&&ms<=30000,'INVALID_TIMEOUT');
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([Promise.resolve().then(()=>run(controller.signal)),new Promise<T>((_resolve,reject)=>{timer=setTimeout(()=>{reject(new StepTimeout(name,mutation));controller.abort();},ms);})]);}
  finally{if(timer!==undefined)clearTimeout(timer);}
}
export const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
export const sha=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export const shortText=(x:unknown,max=300):x is string=>typeof x==='string'&&x.trim()===x&&x.length>0&&x.length<=max&&!/[\x00-\x1f]/.test(x);
const contentText=(x:unknown,max=20000):x is string=>typeof x==='string'&&x.trim().length>0&&x.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(x);
export const exactKeys=(x:Record<string,unknown>,required:string[],optional:string[]=[])=>required.every(k=>Object.hasOwn(x,k))&&Object.keys(x).every(k=>required.includes(k)||optional.includes(k));
export function canonical(value:unknown):string {
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){ensure(Number.isFinite(value),'NON_JSON_VALUE');return JSON.stringify(value);}
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  ensure(object(value)&&Object.getPrototypeOf(value)===Object.prototype,'NON_JSON_VALUE');
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export async function hashBytes(bytes:Uint8Array):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes).buffer))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export const hashJson=(v:unknown)=>hashBytes(new TextEncoder().encode(canonical(v)));
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const date=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const instant=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
function binding(x:unknown):asserts x is SourceBinding {
  ensure(object(x)&&exactKeys(x,['lessonKey','sourceVersion','scopeHash','inventoryHash','hsSha256','gvSha256','classDates']),'SOURCE_SCHEMA');
  ensure(typeof x.lessonKey==='string'&&/^[a-z0-9-]{1,160}$/.test(x.lessonKey)&&[x.sourceVersion,x.scopeHash,x.inventoryHash,x.hsSha256,x.gvSha256].every(sha),'SOURCE_SCHEMA');
  ensure(object(x.classDates)&&Object.keys(x.classDates).length>0&&Object.keys(x.classDates).length<=50&&Object.entries(x.classDates).every(([k,v])=>shortText(k,100)&&date(v)),'CLASS_SCHEMA');
}
function pdf(x:unknown):asserts x is PrivatePdf {
  ensure(object(x)&&exactKeys(x,['path','sha256','bytes'])&&sha(x.sha256)&&x.path===`exam-assets/${x.sha256}.pdf`&&Number.isSafeInteger(x.bytes)&&(x.bytes as number)>=8&&(x.bytes as number)<=15*1024*1024,'PRIVATE_PDF_REQUIRED');
}
function question(x:unknown):asserts x is PublicQuestion {
  ensure(object(x)&&exactKeys(x,['id','sourceRef','kind','prompt'],['choices','statements']),'QUESTION_SCHEMA');
  ensure(shortText(x.id,120)&&shortText(x.sourceRef,1000)&&contentText(x.prompt)&&['mc','tf','short'].includes(String(x.kind)),'QUESTION_SCHEMA');
  const four=(v:unknown)=>Array.isArray(v)&&v.length===4&&v.every(c=>contentText(c));
  if(x.kind==='mc')ensure(four(x.choices)&&new Set(x.choices as string[]).size===4&&!Object.hasOwn(x,'statements'),'CHOICES_REQUIRED');
  else if(x.kind==='tf')ensure(four(x.statements)&&!Object.hasOwn(x,'choices'),'STATEMENTS_REQUIRED');
  else ensure(!Object.hasOwn(x,'choices')&&!Object.hasOwn(x,'statements'),'QUESTION_SCHEMA');
}
export async function approveRelease(input:unknown,pin:PinnedSource):Promise<ApprovedRelease> {
  // Pin cũng được kiểm để lỗi registry không biến thành quyền đăng rộng.
  binding(pin.source);ensure(pin.sourceCorrect===true&&['partial','complete'].includes(pin.keyAvailability),'SOURCE_OR_ALL_KEYS_INVALID');
  ensure(Array.isArray(pin.inventory)&&pin.inventory.length>0&&pin.inventory.length<=300,'INVENTORY_REQUIRED');
  const inventory=new Map<string,SourceItem>();
  for(const row of pin.inventory){ensure(object(row)&&exactKeys(row,['id','sourceRef','kind','contentHash'])&&shortText(row.id,120)&&shortText(row.sourceRef,1000)&&['mc','tf','short','manual'].includes(row.kind)&&sha(row.contentHash)&&!inventory.has(row.id),'INVENTORY_SCHEMA');inventory.set(row.id,row);}
  ensure(await hashJson(pin.inventory)===pin.source.inventoryHash,'PIN_INVENTORY_HASH');
  const refs=pin.inventory.map(q=>q.sourceRef),covered=pin.teacherKeyCoveredSourceRefs;
  ensure(Array.isArray(covered)&&covered.length>0&&new Set(covered).size===covered.length&&same(covered,refs.filter(ref=>covered.includes(ref))),'TEACHER_KEY_COVERAGE_REQUIRED');
  const missing=refs.filter(ref=>!covered.includes(ref));
  ensure(pin.teacherPdfKeyComplete===(missing.length===0)&&pin.keyAvailability===(missing.length?'partial':'complete'),'TEACHER_KEY_COVERAGE_INCONSISTENT');
  ensure(object(input)&&exactKeys(input,['contract','mode','source','accepted','pending','pdf'])&&input.contract===RELEASE_CONTRACT&&['partial','pdf-simple'].includes(String(input.mode)),'MANIFEST_SCHEMA');
  binding(input.source);ensure(same(input.source,pin.source),'SOURCE_CLASS_SCOPE_HASH_MISMATCH');
  ensure(object(pin.classOpensAt)&&object(pin.classDueAt)&&same(Object.keys(pin.classOpensAt).sort(),Object.keys(pin.source.classDates).sort())&&same(Object.keys(pin.classDueAt).sort(),Object.keys(pin.source.classDates).sort()),'SCHEDULE_REQUIRED');
  ensure(Object.values(pin.classOpensAt).every(instant)&&Object.values(pin.classDueAt).every(x=>x===null||instant(x)),'SCHEDULE_REQUIRED');
  ensure(Array.isArray(input.accepted)&&Array.isArray(input.pending)&&input.accepted.length+input.pending.length===inventory.size,'NO_SILENT_OMISSION');
  const seen=new Set<string>();
  for(const item of input.accepted){
    ensure(object(item)&&exactKeys(item,['id','contentHash','examVersionHash','receiptHash','question'])&&shortText(item.id,120)&&[item.contentHash,item.examVersionHash,item.receiptHash].every(sha),'ACCEPTED_SCHEMA');
    const original=inventory.get(item.id);ensure(original&&!seen.has(item.id)&&original.kind!=='manual'&&original.contentHash===item.contentHash,'ACCEPTED_SOURCE_MISMATCH');seen.add(item.id);
    ensure(covered.includes(original.sourceRef),'ACCEPTED_TEACHER_KEY_COVERAGE_REQUIRED');
    question(item.question);ensure(item.question.id===item.id&&item.question.sourceRef===original.sourceRef&&item.question.kind===original.kind&&await hashJson(item.question)===item.contentHash,'QUESTION_SOURCE_MISMATCH');
    const expected={id:item.id,sourceVersion:pin.source.sourceVersion,scopeHash:pin.source.scopeHash,inventoryHash:pin.source.inventoryHash,contentHash:item.contentHash,examVersionHash:item.examVersionHash,receiptHash:item.receiptHash};
    ensure(pin.reviews.filter(r=>same(r,expected)).length===1,'REAL_BOUND_REVIEW_REQUIRED');
  }
  for(const item of input.pending){
    ensure(object(item)&&exactKeys(item,['id','reasonCode','repairTaskId'])&&shortText(item.id,120)&&['FORMAT','MATH','COVERAGE','ANSWER_MISSING','REVIEW_PENDING'].includes(String(item.reasonCode))&&typeof item.repairTaskId==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(item.repairTaskId),'PENDING_SCHEMA');
    ensure(inventory.has(item.id)&&!seen.has(item.id),'PENDING_SOURCE_MISMATCH');seen.add(item.id);
  }
  ensure(seen.size===inventory.size,'NO_SILENT_OMISSION');
  ensure(object(input.pdf)&&exactKeys(input.pdf,['questions','answers','questionOnlyReceiptHash','teacherKeyReceiptHash']),'PDF_SCHEMA');
  pdf(input.pdf.questions);pdf(input.pdf.answers);pdf(pin.questionsPdf);pdf(pin.answersPdf);
  ensure(same(input.pdf.questions,pin.questionsPdf)&&same(input.pdf.answers,pin.answersPdf)&&input.pdf.questions.sha256!==input.pdf.answers.sha256,'PDF_SOURCE_MISMATCH');
  ensure(sha(input.pdf.questionOnlyReceiptHash)&&input.pdf.questionOnlyReceiptHash===pin.questionOnlyReceiptHash&&sha(input.pdf.teacherKeyReceiptHash)&&input.pdf.teacherKeyReceiptHash===pin.teacherKeyReceiptHash,'VERIFIED_PDF_SPLIT_REQUIRED');
  if(input.mode==='partial')ensure(input.accepted.length>0&&pin.keyAvailability!=='none','NO_ACCEPTED_QUESTION');
  else ensure(input.accepted.length===0,'PDF_SIMPLE_HAS_ACCEPTED_QUESTIONS');
  const manifest=structuredClone(input) as ReleaseManifest;
  return {manifest,manifestHash:await hashJson(manifest),inventory:structuredClone(pin.inventory),sourceCount:inventory.size,acceptedCount:manifest.accepted.length,pendingCount:manifest.pending.length,teacherKeyCoverage:{complete:pin.teacherPdfKeyComplete,coveredSourceRefs:[...covered],missingSourceRefs:missing},officialGrading:'pending',label:manifest.mode==='pdf-simple'?'Bản đơn giản':'Bản đang bổ sung',classOpensAt:structuredClone(pin.classOpensAt),classDueAt:structuredClone(pin.classDueAt)};
}

export type UploadAsset={sha256:string;bytes:Uint8Array;contentType:'application/pdf'};
export type PublisherPort={
  authorize(request:Request,signal?:AbortSignal):Promise<boolean>;
  loadPinnedSource(lessonKey:string,signal?:AbortSignal):Promise<PinnedSource>;
  upload(path:string,bytes:Uint8Array,contentType:string,sha256:string,signal?:AbortSignal):Promise<void>;
  /** Transaction: record+pending queue+assets cùng commit, immutable theo manifestHash.
   * Cùng release hash trả cùng releaseId; khác hash không ghi đè lượt đã bắt đầu. */
  rpc(action:'publish_release',payload:Record<string,unknown>,signal?:AbortSignal):Promise<{releaseId:string;manifestHash:string;status:'published'|'already_published'}>;
};
export const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
export function decodeBase64(value:unknown,max=15*1024*1024):Uint8Array {
  ensure(typeof value==='string'&&value.length<=Math.ceil(max/3)*4&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),'INVALID_BASE64');
  const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));ensure(bytes.length>=8&&bytes.length<=max,'INVALID_FILE_SIZE');return bytes;
}
export function createReleasePublisher(port:PublisherPort,options:StepOptions={}){return async(request:Request)=>{
  if(request.method!=='POST')return reply(405,{error_code:'POST_REQUIRED'});
  let manifestHash:string|undefined;
  try{
    if(!await boundedStep('AUTHORIZE',options,false,s=>port.authorize(request,s)))return reply(401,{error_code:'UNAUTHORIZED'});
    const raw=await boundedStep('READ_PUBLISH_BODY',options,false,()=>request.text());ensure(new TextEncoder().encode(raw).length<=44*1024*1024,'PAYLOAD_TOO_LARGE');
    const body=JSON.parse(raw);ensure(object(body)&&exactKeys(body,['manifest','assets'])&&object(body.manifest)&&object(body.manifest.source)&&typeof body.manifest.source.lessonKey==='string','PUBLISH_SCHEMA');
    const lessonKey=body.manifest.source.lessonKey;
    const approved=await approveRelease(body.manifest,await boundedStep('PINNED_SOURCE',options,false,s=>port.loadPinnedSource(lessonKey,s)));manifestHash=approved.manifestHash;
    ensure(Array.isArray(body.assets)&&body.assets.length===2,'TWO_PRIVATE_PDFS_REQUIRED');
    const expected=[approved.manifest.pdf.questions,approved.manifest.pdf.answers],assets:{path:string;sha256:string;bytes:number;storagePath:string}[]=[];
    const seen=new Set<string>();
    // Kiểm cả hai tệp trước mọi mutation, không upload một tệp nếu tệp kia sai.
    const checked=await Promise.all(body.assets.map(async(value:unknown)=>{
      ensure(object(value)&&exactKeys(value,['path','sha256','contentType','base64'])&&value.contentType==='application/pdf'&&sha(value.sha256)&&typeof value.path==='string'&&!seen.has(value.path),'INVALID_PDF_ASSET');seen.add(value.path);
      const wanted=expected.find(x=>x.path===value.path&&x.sha256===value.sha256);ensure(wanted,'ASSET_NOT_IN_MANIFEST');
      const bytes=decodeBase64(value.base64);ensure(bytes.length===wanted.bytes&&new TextDecoder().decode(bytes.slice(0,5))==='%PDF-'&&await hashBytes(bytes)===value.sha256,'PDF_HASH_OR_SIGNATURE_MISMATCH');
      return {ref:wanted,bytes,storagePath:`btvn/${approved.manifest.source.lessonKey}/${approved.manifest.source.sourceVersion}/${wanted.path}`};
    }));
    for(const item of checked){await boundedStep('UPLOAD_PRIVATE_PDF',options,true,s=>port.upload(item.storagePath,item.bytes,'application/pdf',item.ref.sha256,s));assets.push({...item.ref,storagePath:item.storagePath});}
    const result=await boundedStep('PUBLISH_RELEASE',options,true,s=>port.rpc('publish_release',{release:approved,assets},s));
    ensure(shortText(result.releaseId,160)&&result.manifestHash===approved.manifestHash&&['published','already_published'].includes(result.status),'INVALID_PUBLISH_RECEIPT');
    return reply(200,{releaseId:result.releaseId,manifestHash:result.manifestHash,status:result.status,acceptedCount:approved.acceptedCount,pendingCount:approved.pendingCount,sourceCount:approved.sourceCount,officialGrading:'pending'});
  }catch(error){return reply(error instanceof StepTimeout||!(error instanceof GateError)?503:422,{error_code:error instanceof GateError?error.code:'PUBLISH_UNAVAILABLE',...(error instanceof StepTimeout&&error.code==='MUTATION_OUTCOME_UNKNOWN'?{reconcile:'lookup_release_by_manifest_hash',manifestHash}: {})});}
};}
