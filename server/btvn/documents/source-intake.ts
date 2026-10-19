import {approveRelease,boundedStep,canonical,GateError,hashBytes,hashJson,object,sha,type PinnedSource,type SourceBinding,type SourceItem,type StepOptions,type ReviewBinding} from './release-gate.ts';
import {bridgePublicationPlan,type BridgeRegistry} from './plan-bridge.ts';

export type EvidenceRef={path:string;sha256:string};
export type SourceSnapshot={
 assignmentId:string;sourceId:string;classId:string;className:string;lessonKey:string;
 lessonAt:string;openAt:string;dueAt:string;source:SourceBinding;inventory:SourceItem[];
 classOpensAt:Record<string,string>;classDueAt:Record<string,string|null>;
 /** Các rawfacts này lấy từ Sheet/resolver hiện hành, không nhận từ body. */
 sourceLocation:{sheetId:string;row:number;scopeCell:string;sourceCell:string;scopeText:string};
 questionsPdf:{path:string;sha256:string;bytes:number;storagePath:string};
 answersPdf:{path:string;sha256:string;bytes:number;storagePath:string};
 rawSource?:{algorithm:'sha256-concat-hs-gv';byteKind:'post-split-source';student:{sha256:string;bytes:number;storagePath:string;sourceUrl:string};teacher:{sha256:string;bytes:number;storagePath:string;sourceUrl:string}};
 transformationReceipt?:EvidenceRef;
 sourceReceipt:EvidenceRef;pdfSplitReceipt:EvidenceRef;questionReviewReceipts:EvidenceRef[];
 plan:Record<string,unknown>;
};
export type TrustedEvidence={bytes:Uint8Array;
 /** Metadata từ kho receipt đã duyệt phía server, không lấy tự khai trongJSON. */
 registration:{receiptId:string;reviewer:string;approvedAt:string;sourceVersion:string;scopeHash:string;contentSha256:string;kind:'native-review'|'human-visual'|'source-readback'};
};
export type IntakePort={
 loadCurrentSource(assignmentId:string,signal?:AbortSignal):Promise<SourceSnapshot>;
 loadRegisteredEvidence(reference:EvidenceRef,signal?:AbortSignal):Promise<TrustedEvidence>;
 readPrivatePdf(path:string,signal?:AbortSignal):Promise<Uint8Array>;
 currentPinHash(lessonKey:string,signal?:AbortSignal):Promise<string|null>;
 /** RPC transaction CAS chỉ nhận kết quả validatorserver. Không dùng endpoint
  * RPC này như một HTTPpass-through cho worker gửi true/false tự khai. */
 refreshPin(payload:{lessonKey:string;expectedPinHash:string|null;pin:PinnedSource;bridgeRegistry:Record<string,unknown>;evidenceRefs:unknown[]},signal?:AbortSignal):Promise<unknown>;
};
const check=(ok:unknown,code:string)=>{if(!ok)throw new GateError(code);};
export const sourceIntakeIdentity=(source:SourceSnapshot)=>({assignmentId:source.assignmentId,sourceId:source.sourceId,classId:source.classId,className:source.className,lessonAt:source.lessonAt,openAt:source.openAt,dueAt:source.dueAt,classOpensAt:source.classOpensAt,classDueAt:source.classDueAt,source:source.source,inventory:source.inventory,sourceLocation:source.sourceLocation,questionsPdf:source.questionsPdf,answersPdf:source.answersPdf,...(source.rawSource?{rawSource:source.rawSource}:{}),plan:source.plan});
/** Intake không nhận pin trong request. Resolver đọc lại toàn bộ8định danh,
 * scope/nguồn và receipt đã đăng ký, đọcbytePDF, re-readnguồn trướcCAScommit. */
export async function refreshSourcePin(assignmentId:string,expectedSourceVersion:string,port:IntakePort,options:StepOptions={}){
 check(typeof assignmentId==='string'&&assignmentId.length>0&&assignmentId.length<=300&&sha(expectedSourceVersion),'INTAKE_IDENTITY_REQUIRED');
 const source=await boundedStep('READ_CURRENT_SOURCE',options,false,s=>port.loadCurrentSource(assignmentId,s));
 check(source.assignmentId===assignmentId&&source.source.sourceVersion===expectedSourceVersion&&source.lessonKey===source.source.lessonKey,'SOURCE_CHANGED');
 check([source.sourceId,source.classId,source.className,source.lessonAt,source.openAt,source.dueAt].every(x=>typeof x==='string'&&x.length>0),'SOURCE_IDENTITY_REQUIRED');
 check(source.sourceLocation.sheetId&&Number.isSafeInteger(source.sourceLocation.row)&&source.sourceLocation.row>0&&source.sourceLocation.scopeCell&&source.sourceLocation.sourceCell&&typeof source.sourceLocation.scopeText==='string','SOURCE_LOCATION_REQUIRED');
 check(await hashJson(source.inventory)===source.source.inventoryHash,'SOURCE_INVENTORY_HASH');
 check(source.questionsPdf.sha256===source.source.hsSha256&&source.answersPdf.sha256===source.source.gvSha256&&source.source.hsSha256!==source.source.gvSha256,'PDF_SOURCE_MISMATCH');
 const evidenceRefs:unknown[]=[];
 async function evidence(reference:EvidenceRef,allowed:TrustedEvidence['registration']['kind'][]){
  check(/^btvn-evidence\/[a-zA-Z0-9_/-]+\.json$/.test(reference.path)&&!reference.path.split('/').includes('..')&&sha(reference.sha256),'EVIDENCE_REFERENCE_REQUIRED');
  const value=await boundedStep('LOAD_REGISTERED_EVIDENCE',options,false,s=>port.loadRegisteredEvidence(reference,s));
  check(await hashBytes(value.bytes)===reference.sha256&&value.registration.contentSha256===reference.sha256,'EVIDENCE_BYTES_MISMATCH');
  const record=value.registration;
  check(record.receiptId&&record.reviewer&&Number.isFinite(Date.parse(record.approvedAt))&&allowed.includes(record.kind)&&record.sourceVersion===source.source.sourceVersion&&record.scopeHash===source.source.scopeHash,'EVIDENCE_NOT_REGISTERED');
  const raw=JSON.parse(new TextDecoder().decode(value.bytes));check(object(raw),'EVIDENCE_SCHEMA');
  // Registered native SourceDocs artifact giữ nguyênrawbytes. Projection chỉ
  // đổi shape sauhashcheck, không tạo một receiptmới hoặc tựđổi kếtquảmodel.
  let normalized=raw;
  if(raw.stage==='source_documents'){
   check(object(raw.inputBinding)&&object(raw.result)&&canonical(raw.inputBinding.source)===canonical(raw.result.source),'EVIDENCE_SOURCE_BINDING');
   const result=raw.result;check(result.contract==='MTM-BTVN-SOURCE-DOCUMENTS-REVIEW-20261019-v1','SOURCE_DOCUMENTS_CONTRACT');
   const content=(value:any)=>({sourceVersion:value?.sourceVersion,scopeHash:value?.scopeHash,inventoryHash:value?.inventoryHash,hsSha256:value?.hsSha256,gvSha256:value?.gvSha256});
   check(canonical(content(raw.inputBinding.source))===canonical(content(source.source)),'EVIDENCE_SOURCE_BINDING');
   // Lớp/ngày lấy từ sourceReadback mới; contentQA có thể dùng lại cùngbytes,
   // scope/inventory. GiữreviewedSource gốc, không sửa rawresponse/modeltarget.
   normalized={contract:'MTM-BTVN-PDF-SPLIT-REVIEW-20261019-v1',source:source.source,reviewedSource:raw.inputBinding.source,studentClassification:result.studentClassification,teacherClassification:result.teacherClassification,questionOnly:result.questionOnly,teacherKeyComplete:result.teacherKeyComplete,brandingVerified:result.brandingVerified,coveredSourceRefs:result.coveredSourceRefs};
  }
  check(canonical(normalized.source)===canonical(source.source),'EVIDENCE_SOURCE_BINDING');
  evidenceRefs.push({...reference,registration:record});return normalized;
 }
 const sourceRead=await evidence(source.sourceReceipt,['source-readback']);
 check(canonical(sourceRead.identity)===canonical(sourceIntakeIdentity(source)),'SOURCE_READBACK_MISMATCH');
 const split=await evidence(source.pdfSplitReceipt,['human-visual','native-review']);
 check(split.brandingVerified===true,'BRANDING_REVIEW_REQUIRED');
 check(split.contract==='MTM-BTVN-PDF-SPLIT-REVIEW-20261019-v1'&&split.questionOnly===true&&split.studentClassification==='questions-only'&&['complete-key','partial-key'].includes(String(split.teacherClassification)),'PDF_SPLIT_REVIEW_REQUIRED');
 check(Array.isArray(split.coveredSourceRefs)&&split.coveredSourceRefs.length>0&&new Set(split.coveredSourceRefs).size===split.coveredSourceRefs.length&&canonical(split.coveredSourceRefs)===canonical(source.inventory.map(q=>q.sourceRef).filter(ref=>(split.coveredSourceRefs as string[]).includes(ref))),'TEACHER_KEY_COVERAGE_REQUIRED');
 const completeTeacherKey=split.teacherClassification==='complete-key'&&canonical(split.coveredSourceRefs)===canonical(source.inventory.map(q=>q.sourceRef));
 check(split.teacherKeyComplete===completeTeacherKey,'INCONSISTENT_DOCUMENT_REVIEW');
 for(const item of[source.questionsPdf,source.answersPdf]){
  check(item.storagePath===`btvn/${source.lessonKey}/${source.source.sourceVersion}/${item.path}`,'PRIVATE_PDF_NAMESPACE_REQUIRED');
  const bytes=await boundedStep('READ_PRIVATE_SOURCE_PDF',options,false,s=>port.readPrivatePdf(item.storagePath,s));
  check(bytes.length===item.bytes&&new TextDecoder().decode(bytes.slice(0,5))==='%PDF-'&&await hashBytes(bytes)===item.sha256,'PDF_BYTES_MISMATCH');
 }
 const reviews:ReviewBinding[]=[],reviewed:BridgeRegistry['reviewed']={};
 for(const ref of source.questionReviewReceipts){
  const receipt=await evidence(ref,['native-review']);
  check(receipt.contract==='MTM-BTVN-QUESTION-REVIEW-20261019-v1'&&object(receipt.binding)&&object(receipt.acceptedItem)&&sha(receipt.sourceQuestionHash),'QUESTION_REVIEW_REQUIRED');
  // Receipt không chứa hash của chính nó. Hashref được server thêm SAU khi
  // kiểm byte, tránh vòng tựthamchiếu không thể băm và self-claimedreceipt.
  const binding={...receipt.binding,receiptHash:ref.sha256} as ReviewBinding,item={...receipt.acceptedItem,receiptHash:ref.sha256} as any;
  check(binding.sourceVersion===source.source.sourceVersion&&binding.scopeHash===source.source.scopeHash&&binding.inventoryHash===source.source.inventoryHash&&binding.receiptHash===ref.sha256&&binding.id===item.id&&binding.contentHash===item.contentHash&&binding.examVersionHash===item.examVersionHash&&binding.receiptHash===item.receiptHash,'QUESTION_REVIEW_BINDING');
  check(!Object.hasOwn(reviewed,item.id),'DUPLICATE_QUESTION_REVIEW');reviews.push(binding);reviewed[item.id]={sourceQuestionHash:receipt.sourceQuestionHash as string,item};
 }
 const only=(pdf:SourceSnapshot['questionsPdf'])=>({path:pdf.path,sha256:pdf.sha256,bytes:pdf.bytes});
 for(const item of Object.values(reviewed))check((split.coveredSourceRefs as string[]).includes(item.item.question.sourceRef),'ACCEPTED_TEACHER_KEY_COVERAGE_REQUIRED');
 const pin:PinnedSource={source:source.source,sourceCorrect:true,inventory:source.inventory,questionsPdf:only(source.questionsPdf),answersPdf:only(source.answersPdf),questionOnlyReceiptHash:source.pdfSplitReceipt.sha256,teacherKeyReceiptHash:source.pdfSplitReceipt.sha256,teacherPdfKeyComplete:completeTeacherKey,teacherKeyCoveredSourceRefs:[...split.coveredSourceRefs as string[]],keyAvailability:completeTeacherKey?'complete':'partial',reviews,classOpensAt:source.classOpensAt,classDueAt:source.classDueAt};
 check(Object.hasOwn(source.source.classDates,source.className)&&source.classOpensAt[source.className]===source.openAt&&source.classDueAt[source.className]===source.dueAt,'SOURCE_CLASS_SCHEDULE_MISMATCH');
 const registry:BridgeRegistry={assignmentId:source.assignmentId,sourceId:source.sourceId,classId:source.classId,className:source.className,planHash:String(source.plan.exam_version_hash),pin,reviewed};
 const bridge=await bridgePublicationPlan(source.plan,registry);await approveRelease(bridge.manifest,pin);
 const expectedPinHash=await boundedStep('READ_PIN_REVISION',options,false,s=>port.currentPinHash(source.lessonKey,s));
 const fresh=await boundedStep('RECHECK_SOURCE',options,false,s=>port.loadCurrentSource(assignmentId,s));
 check(canonical(sourceIntakeIdentity(fresh))===canonical(sourceIntakeIdentity(source)),'SOURCE_CHANGED_DURING_REVIEW');
 const {pin:_pin,...storedRegistry}=registry;
 return boundedStep('REFRESH_PIN',options,true,s=>port.refreshPin({lessonKey:source.lessonKey,expectedPinHash,pin,bridgeRegistry:{[registry.planHash]:storedRegistry},evidenceRefs},s));
}
