import {boundedStep,canonical,decodeBase64,GateError,hashBytes,hashJson,object,sha,type SourceBinding,type StepOptions} from './release-gate.ts';
import {uploadImmutable,type NativeTransport} from './native-port.ts';
import {sourceIntakeIdentity,type EvidenceRef,type IntakePort,type SourceSnapshot,type TrustedEvidence} from './source-intake.ts';

const check=(ok:unknown,code:string)=>{if(!ok)throw new GateError(code);};
const parse=(bytes:Uint8Array)=>JSON.parse(new TextDecoder().decode(bytes));
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const contentBinding=(value:any)=>({sourceVersion:value?.sourceVersion,scopeHash:value?.scopeHash,inventoryHash:value?.inventoryHash,hsSha256:value?.hsSha256,gvSha256:value?.gvSha256});
export function normalizeDocumentReview(raw:Record<string,unknown>){
 if(raw.stage!=='source_documents')return raw;
 const result=raw.result as Record<string,unknown>,input=raw.inputBinding as Record<string,unknown>;
 check(object(result)&&object(input)&&result.contract==='MTM-BTVN-SOURCE-DOCUMENTS-REVIEW-20261019-v1','SOURCE_DOCUMENTS_CONTRACT');
 check(same(result.source,input.source),'SOURCE_DOCUMENTS_BINDING');
 return{contract:'MTM-BTVN-PDF-SPLIT-REVIEW-20261019-v1',source:input.source,studentClassification:result.studentClassification,teacherClassification:result.teacherClassification,questionOnly:result.questionOnly,teacherKeyComplete:result.teacherKeyComplete,brandingVerified:result.brandingVerified,coveredSourceRefs:result.coveredSourceRefs};
}
async function nativeArtifact(raw:Record<string,unknown>,source:SourceBinding){
 check(raw.stage==='source_documents'||raw.stage==='question_review','UNSUPPORTED_REVIEW_STAGE');
 const provider=raw.provider_receipt,input=raw.inputBinding;
 check(object(provider)&&object(input)&&typeof provider.provider==='string'&&provider.provider.length>0&&typeof provider.response_id==='string'&&provider.response_id.length>0&&typeof provider.actual_model==='string'&&provider.actual_model.length>0&&provider.provider_response_status==='completed','NATIVE_COMPLETED_RESPONSE_REQUIRED');
 check(sha(raw.request_sha256)&&sha(raw.hash)&&raw.hash===await hashJson(Object.fromEntries(Object.entries(raw).filter(([key])=>key!=='hash'))),'NATIVE_ARTIFACT_HASH');
 check(raw.stage==='source_documents'?same(contentBinding(input.source),contentBinding(source)):same(input.source,source),'NATIVE_ARTIFACT_SOURCE');
 return provider;
}
async function rpc(db:NativeTransport,name:string,args:Record<string,unknown>,signal?:AbortSignal){
 const result=await db.rpc(name,args,signal);if(result.error)throw new GateError(result.error.message==='SOURCE_CHANGED'?'SOURCE_CHANGED':'SOURCE_REGISTRY_UNAVAILABLE');return result.data;
}
/** ConcreteIntakePort. Nguồn/receipt nằm trong DBprivateindex; rawJSON/2PDF
 * trong bucketprivate. Không phụ thuộc SQLINSERTmanual từngassignment. */
export function createRegisteredSourceIntakePort(db:NativeTransport):IntakePort{return {
 async loadCurrentSource(assignmentId,signal){const row=await rpc(db,'mtm_btvn_document_source_snapshot',{p_assignment_id:assignmentId},signal)as any;if(!row?.snapshot)throw new GateError('SOURCE_NOT_REGISTERED');check(await hashJson(row.snapshot)===row.snapshotHash,'SOURCE_INDEX_HASH_MISMATCH');return row.snapshot as SourceSnapshot;},
 async loadRegisteredEvidence(ref,signal){const row=await rpc(db,'mtm_btvn_document_evidence',{p_path:ref.path,p_sha256:ref.sha256},signal)as any;if(!row?.registration||row.storagePath!==ref.path)throw new GateError('EVIDENCE_NOT_REGISTERED');const bytes=await db.storage.download(row.storagePath,signal);check(await hashBytes(bytes)===ref.sha256,'EVIDENCE_BYTES_MISMATCH');return{bytes,registration:row.registration}as TrustedEvidence;},
 readPrivatePdf:(path,signal)=>db.storage.download(path,signal),
 async currentPinHash(lessonKey,signal){const value=await rpc(db,'mtm_btvn_document_pin_state',{p_lesson_key:lessonKey},signal)as any;return value===null?null:sha(value.pinHash)?value.pinHash:Promise.reject(new GateError('INVALID_PIN_REVISION'));},
 refreshPin:(payload,signal)=>rpc(db,'mtm_btvn_document_refresh_pin',{p_payload:payload},signal),
};}
export type RegisterDependencies=StepOptions&{
 db:NativeTransport;
 /** PDFparser server đọcnumPages từ chínhbyte đãhash, không nhận count tựkhai. */
 countPdfPages:(bytes:Uint8Array,signal?:AbortSignal)=>Promise<number>;
 clock?:()=>number;
};
/** Writer chỉ mount sau publishsecretcheck. Snapshot là rawfacts, không có
 * approved/sourceCorrect/teacherPdfKeyComplete pin do caller tựtạo. */
export async function registerSourcePackage(input:unknown,deps:RegisterDependencies){
 check(object(input)&&Object.keys(input).sort().join(',')==='documents,evidence,rawDocuments,snapshot','SOURCE_PACKAGE_SCHEMA');
 if(!object(input))throw new GateError('SOURCE_PACKAGE_SCHEMA');
 const snapshot=input.snapshot as SourceSnapshot;
 check(object(snapshot)&&object(snapshot.source)&&typeof snapshot.assignmentId==='string'&&snapshot.assignmentId.length>0&&typeof snapshot.lessonKey==='string'&&/^[a-z0-9-]{1,160}$/.test(snapshot.lessonKey)&&snapshot.lessonKey===snapshot.source.lessonKey,'SOURCE_SNAPSHOT_REQUIRED');
 check(!('sourceCorrect'in snapshot)&&!('teacherPdfKeyComplete'in snapshot)&&!('approved'in snapshot),'SELF_DECLARED_APPROVAL_REJECTED');
 check(sha(snapshot.source.sourceVersion)&&sha(snapshot.source.scopeHash)&&await hashJson(snapshot.inventory)===snapshot.source.inventoryHash,'SOURCE_BINDING_HASH');
 check(Array.isArray(input.documents)&&input.documents.length===2&&Array.isArray(input.rawDocuments)&&input.rawDocuments.length===2&&Array.isArray(input.evidence)&&input.evidence.length>=2&&input.evidence.length<=304,'SOURCE_BLOBS_REQUIRED');
 check(snapshot.rawSource?.algorithm==='sha256-concat-hs-gv'&&snapshot.rawSource.byteKind==='post-split-source','VERSION_SOURCE_BYTES_REQUIRED');
 const refs=[snapshot.sourceReceipt,snapshot.pdfSplitReceipt,...snapshot.questionReviewReceipts,...(snapshot.transformationReceipt?[snapshot.transformationReceipt]:[])];
 check(refs.length===input.evidence.length&&new Set(refs.map(ref=>ref.path)).size===refs.length,'SOURCE_EVIDENCE_COVERAGE');
 const docs:Map<string,{bytes:Uint8Array;pages:number;type:string}>=new Map();
 for(const blob of input.documents){
  check(object(blob)&&typeof blob.path==='string'&&blob.contentType==='application/pdf'&&sha(blob.sha256),'SOURCE_PDF_SCHEMA');
  const expected=[snapshot.questionsPdf,snapshot.answersPdf].find(pdf=>pdf.storagePath===blob.path&&pdf.sha256===blob.sha256);check(expected&&!docs.has(blob.path),'SOURCE_PDF_BINDING');
  if(!expected)throw new GateError('SOURCE_PDF_BINDING');
  check(expected.path===`exam-assets/${expected.sha256}.pdf`&&expected.storagePath===`btvn/${snapshot.lessonKey}/${snapshot.source.sourceVersion}/${expected.path}`,'SOURCE_PDF_NAMESPACE');
  const bytes=decodeBase64(blob.base64);check(bytes.length===expected.bytes&&new TextDecoder().decode(bytes.slice(0,5))==='%PDF-'&&await hashBytes(bytes)===blob.sha256,'SOURCE_PDF_BYTES');
  const pages=await boundedStep('COUNT_PDF_PAGES',deps,false,s=>deps.countPdfPages(bytes,s));check(Number.isSafeInteger(pages)&&pages>=1&&pages<=200,'PDF_PAGE_COUNT_REQUIRED');docs.set(blob.path,{bytes,pages,type:'application/pdf'});
 }
 check(snapshot.source.hsSha256===snapshot.questionsPdf.sha256&&snapshot.source.gvSha256===snapshot.answersPdf.sha256&&snapshot.source.hsSha256!==snapshot.source.gvSha256,'SOURCE_PDF_SPLIT');
 const versionDocs=new Map<string,Uint8Array>();
 for(const blob of input.rawDocuments){
  check(object(blob)&&typeof blob.path==='string'&&blob.contentType==='application/pdf'&&sha(blob.sha256),'VERSION_SOURCE_SCHEMA');
  const expected=[snapshot.rawSource!.student,snapshot.rawSource!.teacher].find(pdf=>pdf.storagePath===blob.path&&pdf.sha256===blob.sha256);
  check(expected&&!versionDocs.has(blob.path),'VERSION_SOURCE_BINDING');if(!expected)throw new GateError('VERSION_SOURCE_BINDING');
  check(expected.storagePath===`btvn-source/${snapshot.source.sourceVersion}/source/${expected.sha256}.pdf`,'VERSION_SOURCE_NAMESPACE');
  const bytes=decodeBase64(blob.base64);check(bytes.length===expected.bytes&&new TextDecoder().decode(bytes.slice(0,5))==='%PDF-'&&await hashBytes(bytes)===expected.sha256,'VERSION_SOURCE_BYTES');versionDocs.set(blob.path,bytes);
 }
 const sourceHs=versionDocs.get(snapshot.rawSource!.student.storagePath)!,sourceGv=versionDocs.get(snapshot.rawSource!.teacher.storagePath)!,concat=new Uint8Array(sourceHs.length+sourceGv.length);concat.set(sourceHs);concat.set(sourceGv,sourceHs.length);
 check(await hashBytes(concat)===snapshot.source.sourceVersion,'SOURCE_VERSION_CONCAT_MISMATCH');
 const transformed=snapshot.rawSource!.student.sha256!==snapshot.source.hsSha256||snapshot.rawSource!.teacher.sha256!==snapshot.source.gvSha256;
 check(!transformed||snapshot.transformationReceipt,'SOURCE_TRANSFORMATION_PROOF_REQUIRED');
 const registered:{path:string;sha256:string;storagePath:string;registration:TrustedEvidence['registration']}[]=[],evidenceBlobs:{path:string;bytes:Uint8Array;sha256:string}[]=[];
 const now=(deps.clock??Date.now)();let sourceReadAt:string|undefined;
 for(const blob of input.evidence){
  check(object(blob)&&typeof blob.path==='string'&&sha(blob.sha256)&&refs.some(ref=>ref.path===blob.path&&ref.sha256===blob.sha256)&&blob.path===`btvn-evidence/${snapshot.source.sourceVersion}/${blob.sha256}.json`,'EVIDENCE_BLOB_BINDING');
  const bytes=decodeBase64(blob.base64,15*1024*1024);check(await hashBytes(bytes)===blob.sha256,'EVIDENCE_BYTES_MISMATCH');
  const raw=parse(bytes);check(object(raw),'EVIDENCE_JSON_REQUIRED');
  let reviewer:string,kind:TrustedEvidence['registration']['kind'];
  if(blob.path===snapshot.sourceReceipt.path){
   check(raw.contract==='MTM-BTVN-SOURCE-READBACK-20261019-v1'&&same(raw.source,snapshot.source)&&same(raw.identity,sourceIntakeIdentity(snapshot)),'RAW_SOURCE_READBACK_REQUIRED');
   const readback=raw.readback;check(object(readback)&&object(readback.scope)&&object(readback.studentPdf)&&object(readback.teacherPdf),'SHEET_CELL_READBACK_REQUIRED');
   check(readback.sheetId===snapshot.sourceLocation.sheetId&&readback.row===snapshot.sourceLocation.row&&readback.scope.a1===snapshot.sourceLocation.scopeCell&&readback.scope.formattedValue===snapshot.sourceLocation.scopeText&&typeof readback.scope.header==='string'&&readback.scope.header.length>0,'SHEET_SCOPE_READBACK_MISMATCH');
   check([readback.studentPdf.a1,readback.teacherPdf.a1].includes(snapshot.sourceLocation.sourceCell)&&typeof readback.studentPdf.header==='string'&&typeof readback.teacherPdf.header==='string'&&readback.studentPdf.sourceUrl===snapshot.rawSource!.student.sourceUrl&&readback.teacherPdf.sourceUrl===snapshot.rawSource!.teacher.sourceUrl&&readback.studentPdf.sourceSha256===snapshot.rawSource!.student.sha256&&readback.teacherPdf.sourceSha256===snapshot.rawSource!.teacher.sha256&&readback.studentPdf.derivativeSha256===snapshot.source.hsSha256&&readback.teacherPdf.derivativeSha256===snapshot.source.gvSha256&&readback.studentPdf.byteKind==='post-split-source'&&readback.teacherPdf.byteKind==='post-split-source','SHEET_PDF_READBACK_MISMATCH');
   if(snapshot.sourceLocation.scopeText==='')check(readback.scope.ownerPolicyVersion==='MTM-AUTO-20261017-v1'&&readback.scope.interpretation==='all-source-questions','EMPTY_SCOPE_OWNER_POLICY_REQUIRED');
   check(typeof readback.readAt==='string'&&Number.isFinite(Date.parse(readback.readAt))&&now-Date.parse(readback.readAt)>=-60000&&now-Date.parse(readback.readAt)<=30*60*1000,'SHEET_READBACK_STALE');sourceReadAt=readback.readAt;
   reviewer='authorized-publisher:sheet-source-readback';kind='source-readback';
  }else if(blob.path===snapshot.transformationReceipt?.path){
   const record=raw.record;check(object(record)&&sha(raw.hash),'TRANSFORMATION_CHECKPOINT_REQUIRED');
   let valid=raw.hash===await hashJson(record);
   if(!valid){
    const legacy=(value:unknown,path:(string|number)[]=[]):string=>{
     if(Array.isArray(value))return'['+value.map((item,index)=>legacy(item,[...path,index])).join(',')+']';
     if(object(value)){let keys=Object.keys(value).sort();if(path.length===3&&path[0]==='branding_receipts'&&typeof path[1]==='number'&&path[2]==='boxes'&&keys.every(key=>/^[1-9][0-9]*$/.test(key)))keys.sort((a,b)=>Number(a)-Number(b));return'{'+keys.map(key=>JSON.stringify(key)+':'+legacy(value[key],[...path,key])).join(',')+'}';}
     return JSON.stringify(value);
    };valid=raw.hash===await hashBytes(new TextEncoder().encode(legacy(record)));
   }
   check(valid&&record.source_version===snapshot.source.sourceVersion&&object(record.row)&&record.row.lesson_key===snapshot.lessonKey&&object(record.exam)&&object(record.exam.mtmDocuments)&&Array.isArray(record.assets),'TRANSFORMATION_CHECKPOINT_BINDING');
   const dates=object(record.row.class_dates)?record.row.class_dates:{[String(record.row.class_name)]:record.row.lesson_date};
   check(Object.entries(snapshot.source.classDates).every(([name,date])=>dates[name]===date),'TRANSFORMATION_CHECKPOINT_CLASSES');
   check(record.exam.mtmDocuments.questions?.sha256===snapshot.source.hsSha256&&record.exam.mtmDocuments.solutions?.sha256===snapshot.source.gvSha256,'TRANSFORMATION_DERIVATIVE_BINDING');
   for(const asset of record.assets){check(object(asset)&&sha(asset.sha256),'TRANSFORMATION_ASSET_SCHEMA');const data=decodeBase64(asset.data_base64);check(await hashBytes(data)===asset.sha256,'TRANSFORMATION_ASSET_BYTES');}
   for(const expected of[snapshot.questionsPdf,snapshot.answersPdf])check(record.assets.filter((asset:any)=>asset.path===expected.path&&asset.sha256===expected.sha256&&asset.content_type==='application/pdf').length===1,'TRANSFORMATION_PDF_ASSET_REQUIRED');
   reviewer='authorized-publisher:verified-checkpoint';kind='source-readback';
  }else{
   const provider=await nativeArtifact(raw,snapshot.source);reviewer=`${provider.provider}:${provider.actual_model}:${provider.response_id}`;kind='native-review';
   if(blob.path===snapshot.pdfSplitReceipt.path){
    check(raw.stage==='source_documents','SOURCE_DOCUMENTS_STAGE_REQUIRED');const result=raw.result as any,binding=raw.inputBinding as any;
    check(result?.contract==='MTM-BTVN-SOURCE-DOCUMENTS-REVIEW-20261019-v1'&&same(result.source,binding.source)&&same(contentBinding(result.source),contentBinding(snapshot.source))&&same(binding.sourceRefs,snapshot.inventory.map(q=>q.sourceRef)),'SOURCE_DOCUMENTS_BINDING');
    const studentPages=docs.get(snapshot.questionsPdf.storagePath)!.pages,teacherPages=docs.get(snapshot.answersPdf.storagePath)!.pages;
    const complete=(value:unknown,count:number)=>Array.isArray(value)&&value.length===count&&value.every((page,index)=>page===index+1);
    check(complete(result.studentPagesReviewed,studentPages)&&complete(result.teacherPagesReviewed,teacherPages)&&Array.isArray(binding.studentPageSha256)&&binding.studentPageSha256.length===studentPages&&binding.studentPageSha256.every(sha)&&Array.isArray(binding.teacherPageSha256)&&binding.teacherPageSha256.length===teacherPages&&binding.teacherPageSha256.every(sha),'FULL_PDF_REVIEW_COVERAGE_REQUIRED');
    check(typeof result.questionOnly==='boolean'&&typeof result.teacherKeyComplete==='boolean'&&typeof result.brandingVerified==='boolean'&&Array.isArray(result.coveredSourceRefs)&&Array.isArray(result.issues)&&typeof result.reason==='string','SOURCE_DOCUMENTS_RESULT_SCHEMA');
    check(new Set(result.coveredSourceRefs).size===result.coveredSourceRefs.length&&same(result.coveredSourceRefs,snapshot.inventory.map(q=>q.sourceRef).filter(ref=>result.coveredSourceRefs.includes(ref))),'SOURCE_DOCUMENTS_KEY_COVERAGE');
    check(result.questionOnly===(result.studentClassification==='questions-only')&&result.teacherKeyComplete===(result.teacherClassification==='complete-key'&&same(result.coveredSourceRefs,snapshot.inventory.map(q=>q.sourceRef))),'INCONSISTENT_DOCUMENT_REVIEW');
   }else check(raw.stage==='question_review','QUESTION_REVIEW_STAGE_REQUIRED');
  }
  registered.push({path:blob.path,sha256:blob.sha256,storagePath:blob.path,registration:{receiptId:blob.sha256,reviewer,approvedAt:new Date(now).toISOString(),sourceVersion:snapshot.source.sourceVersion,scopeHash:snapshot.source.scopeHash,contentSha256:blob.sha256,kind}});evidenceBlobs.push({path:blob.path,bytes,sha256:blob.sha256});
 }
 check(sourceReadAt,'SOURCE_READBACK_MISSING');
 // Mọi parser/tuple check hoàn tất trướcupload/DBwrite. Byte blob khôngupsert;
 // cùngpathchỉ hòa giải bằng readbackhash, nhưpublishercũ.
 for(const[path,value]of docs)await boundedStep('UPLOAD_SOURCE_PDF',deps,true,s=>uploadImmutable(deps.db,path,value.bytes,value.type,path===snapshot.questionsPdf.storagePath?snapshot.questionsPdf.sha256:snapshot.answersPdf.sha256,s));
 for(const[path,bytes]of versionDocs)await boundedStep('UPLOAD_VERSION_SOURCE_PDF',deps,true,s=>uploadImmutable(deps.db,path,bytes,'application/pdf',path===snapshot.rawSource!.student.storagePath?snapshot.rawSource!.student.sha256:snapshot.rawSource!.teacher.sha256,s));
 for(const value of evidenceBlobs)await boundedStep('UPLOAD_RAW_EVIDENCE',deps,true,s=>uploadImmutable(deps.db,value.path,value.bytes,'application/json',value.sha256,s));
 const current=await boundedStep('SOURCE_INDEX_STATE',deps,false,s=>rpc(deps.db,'mtm_btvn_document_source_snapshot',{p_assignment_id:snapshot.assignmentId},s))as any;
 const snapshotHash=await hashJson(snapshot);
 return boundedStep('REGISTER_SOURCE_INDEX',deps,true,s=>rpc(deps.db,'mtm_btvn_document_register_source',{p_payload:{snapshot,snapshotHash,expectedSnapshotHash:current?.snapshotHash??null,evidence:registered,sourceReadAt}},s));
}
