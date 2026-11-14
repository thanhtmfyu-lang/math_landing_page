/** Synthetic private transport fixtures; no native/provider, auth, SQL or live data. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validatePracticeExam} from '../src/native/exams/data';
import {MTM_SCORING_VERSION} from '../src/native/exams/mtm-scoring';
import {classContextHash,CLASS_CONTEXT_CONTRACT} from '../server/lesson-upload/class-context';
import {reviewQuestions} from '../server/lesson-upload/worker';
import {NATIVE_PDF_NORMALIZATION_CONTRACT,nativeCanonicalDigest,normalizeNativePdfPaths} from '../server/lesson-upload/native-pdf-normalization';
import {NATIVE_DRAFT_INVENTORY_CONTRACT,OPERATOR_CACHED_DRAFT_CONTRACT,prepareNativeDraft,privateStateDigest,type NativeDraftJob,type OperatorCachedDraftBinding} from '../server/lesson-upload/native-draft';
import {suite} from './exams-harness.mts';

const {test,finish}=suite('LESSON-NATIVE-DRAFT');
const hash=(raw:string|Buffer)=>createHash('sha256').update(raw).digest('hex');
const source='7'.repeat(64),cid='0d31a7f2-1da1-4b03-b248-22c260d1c713';
function fixture(kinds:('mc'|'tf'|'short')[]=['mc','mc','mc']){
 const job:NativeDraftJob={id:'14227822-ce9a-4f0f-8df3-489a60b11392',version:1,is_test:true,homework_path:'SYNTHETIC_PRIVATE_SOURCE.pdf',class_ids:[cid],class_names:{[cid]:'Synthetic class 11'},class_dates:{[cid]:'2026-11-10'},lesson_date:'2026-11-10',class_grades:{[cid]:11},grade_source:'managed_class_catalog',class_grade_complete:true,class_grade_issue:null};
 const assets:any[]=[],milli=10000/kinds.length;
 const questions=kinds.map((kind,i)=>{
  const segments=['questions','solutions'].map((tag,n)=>{const bytes=Buffer.from(`SYNTHETIC_OPAQUE_PNG_${tag}_${i}`),path=`paper1/exam-assets_${tag}_${i}.png`;assets.push({path,sha256:hash(bytes),content_type:'image/png',data_base64:bytes.toString('base64')});return {path,sha256:hash(bytes),sourcePage:1,width:100,height:100};});
  const q:any={id:`q${i+1}`,kind,sourceRef:`Synthetic ${i+1}`,prompt:`Synthetic item ${i+1}`,maxPoints:{numerator:'10',denominator:String(kinds.length)},maxMillipoints:milli,sourceContent:{questions:[segments[0]],solutions:[segments[1]]}};
  if(kind==='mc')Object.assign(q,{choices:['One','Two','Three','Four'],answer:'B'});
  if(kind==='tf')Object.assign(q,{answer:[true,false,true,false],statements:['a','b','c','d'],pointsByCorrectCount:[0,milli/10,milli/4,milli/2,milli]});
  if(kind==='short')Object.assign(q,{mode:'numeric',acceptedAnswers:['1.5'],shortRule:{verified:true,evidence:'Synthetic verified key',mode:'decimal'},shortFormat:{unit:'m',whitespace:'trim',decimalPlaces:1,mode:'decimal'}});
  return q;
 });
 const pdfs=['questions','solutions'].map(tag=>{const bytes=Buffer.from(`%PDF-1.4\nSYNTHETIC_${tag}\n%%EOF`),sha256=hash(bytes),path=`paper1/exam-assets_${sha256}.pdf`;assets.push({path,sha256,content_type:'application/pdf',data_base64:bytes.toString('base64')});return {url:'/'+path,sha256,bytes:bytes.length};});
 const exam:any={id:'mtm-custom-synthetic-native',sourceHash:pdfs[0].sha256,sourceRef:source,questionCount:questions.length,grade:11,period:'GK1',title:'Synthetic native draft',durationMinutes:120,versionHash:'5'.repeat(64),rubricVersion:MTM_SCORING_VERSION,answerKeyVersion:'synthetic-key',sourceComplete:true,answerKeyVerified:true,rubricVerified:true,sourceUrl:'https://source.invalid/fixture',publicationVerified:true,questionDisplayVerified:true,sourceMaterial:{title:'Synthetic',publisher:'MTM QA',version:'v1',locator:'Synthetic items'},sections:kinds.map(kind=>({label:kind,kind,count:1})),questions,sourcePdf:{...pdfs[0],verified:true,totalPages:1,questionPages:[1]},mtmDocuments:{questions:{url:pdfs[0].url,sha256:pdfs[0].sha256},solutions:{url:pdfs[1].url,sha256:pdfs[1].sha256}},mtmGrading:{examVersion:'5'.repeat(64),N:questions.length,questionMax:{numerator:'10',denominator:String(kinds.length)}}};
 const value:any={inventory_contract:NATIVE_DRAFT_INVENTORY_CONTRACT,class_context_contract:CLASS_CONTEXT_CONTRACT,class_metadata_sha256:classContextHash(job,source),sourceVersion:source,draft:{exam,assets},extractor:{provider:'synthetic-only',model:'no-provider-called'}};
 value.native_cache_record_sha256=hash(JSON.stringify(value));
 return {job,value};
}
function cachedFixture(){
 const {job,value}=fixture(),draft=prepareNativeDraft(job,value),receipt=draft.nativeNormalization!;
 const state={sourceVersion:source,questions:reviewQuestions(value.draft.exam),contextReceipt:draft.contextReceipt};
 const stateHash=privateStateDigest(state),draftHash=privateStateDigest(draft);
 const binding:OperatorCachedDraftBinding={contract:OPERATOR_CACHED_DRAFT_CONTRACT,source_ref:`${job.id}-source-${stateHash}.json`,source_state_sha256:stateHash,raw_native_draft_sha256:value.native_cache_record_sha256,class_metadata_sha256:value.class_metadata_sha256,normalizer_contract:NATIVE_PDF_NORMALIZATION_CONTRACT,normalizer_sha256:'9'.repeat(64),normalization_receipt_sha256:nativeCanonicalDigest(receipt),normalized_record_sha256:receipt.output_record_sha256,normalized_private_draft_sha256:draftHash,normalized_draft_ref:`${job.id}-draft-${draftHash}.json`,source_version:source};
 return {job:{...job,operator_cached_draft:binding},value,draft,binding,state};
}

test('Actual native-shaped three-MC draft reproduces exactly two PDF errors, then validates without changing math',()=>{
 const {job,value}=fixture(),before=JSON.stringify(value),questions=JSON.stringify(reviewQuestions(value.draft.exam));
 assert.deepEqual(validatePracticeExam(value.draft.exam).errors,['PDF question-page asset not verified','Invalid separate MTM documents']);
 const draft=prepareNativeDraft(job,value);assert.deepEqual(validatePracticeExam(draft.exam),{valid:true,errors:[]});
 assert.equal(JSON.stringify(value),before);assert.equal(JSON.stringify(reviewQuestions(draft.exam)),questions);assert.deepEqual(draft.exam.questions,value.draft.exam.questions);
 assert.equal(draft.exam.answerKeyVersion,value.draft.exam.answerKeyVersion);assert.equal(draft.exam.sourceHash,value.draft.exam.sourceHash);assert.equal(draft.exam.sourceRef,value.draft.exam.sourceRef);
 assert.equal((draft.exam as any).mtmGrading.examVersion,draft.exam.versionHash);assert.notEqual(draft.exam.versionHash,value.draft.exam.versionHash);assert.equal(draft.nativeNormalization?.changed,true);
 for(let i=0;i<draft.assets.length;i++){assert.equal(draft.assets[i].data_base64,value.draft.assets[i].data_base64);assert.equal(draft.assets[i].sha256,value.draft.assets[i].sha256);if(draft.assets[i].content_type!=='application/pdf')assert.deepEqual(draft.assets[i],value.draft.assets[i]);}
 assert.equal('nativeNormalization' in draft.exam,false);
});

test('Exact checkpoint JSON projection survives mixed/TF/short and nonalphabetical shortFormat keys',()=>{
 for(const kinds of [['mc','tf','short'],['tf'],['short']] as ('mc'|'tf'|'short')[][]){
  const {job,value}=fixture(kinds),before=JSON.stringify(reviewQuestions(value.draft.exam));
  const draft=prepareNativeDraft(job,value);assert.deepEqual(validatePracticeExam(draft.exam),{valid:true,errors:[]});assert.equal(JSON.stringify(reviewQuestions(draft.exam)),before);
  const short=draft.exam.questions.find(q=>q.kind==='short');if(short)assert.deepEqual(Object.keys(short.shortFormat!),['unit','whitespace','decimalPlaces','mode']);
 }
});

test('Crop-only/no-PDF and orphan PDF leave version, old Draft shape and original data unchanged',()=>{
 for(const orphan of [false,true]){
  const {job,value}=fixture();delete value.draft.exam.sourcePdf;delete value.draft.exam.mtmDocuments;delete value.draft.exam.mtmGrading;
  if(!orphan)value.draft.assets=value.draft.assets.filter((a:any)=>a.content_type!=='application/pdf');
  const before=JSON.stringify(value),draft=prepareNativeDraft(job,value);assert.deepEqual(Object.keys(draft),['exam','assets','contextReceipt']);assert.equal(draft.exam.versionHash,value.draft.exam.versionHash);assert.deepEqual(draft.exam,value.draft.exam);assert.deepEqual(draft.assets,value.draft.assets);assert.equal(JSON.stringify(value),before);assert.equal(validatePracticeExam(draft.exam).valid,true);
 }
});

test('sourcePdf-only normalizes only its linked PDF; canonical data is idempotent and preserves its version',()=>{
 const {job,value}=fixture();delete value.draft.exam.mtmDocuments;const draft=prepareNativeDraft(job,value);
 assert.equal(validatePracticeExam(draft.exam).valid,true);assert.equal(draft.nativeNormalization?.mappings.length,1);assert.equal(draft.assets.at(-1)!.path,value.draft.assets.at(-1).path);assert.equal('mtmDocuments' in draft.exam,false);
 const normalized=normalizeNativePdfPaths(value,source),again=prepareNativeDraft(job,normalized.value);assert.deepEqual(again.exam,draft.exam);assert.equal(again.exam.versionHash,draft.exam.versionHash);assert.equal('nativeNormalization' in again,false);
});

test('Existing missing solution references remain missing; original complete-exam validator stays strict',()=>{
 const {job,value}=fixture();delete value.draft.exam.sourcePdf;delete value.draft.exam.mtmDocuments.solutions;const draft=prepareNativeDraft(job,value);assert.equal('solutions' in draft.exam.mtmDocuments!,false);assert.equal(validatePracticeExam(draft.exam).valid,false);
});

test('Malformed PDF refs, missing/mismatched assets and canonical path collisions fail closed',()=>{
 for(const mutate of [
  (v:any)=>{v.draft.exam.sourcePdf=null;},(v:any)=>{delete v.draft.exam.sourcePdf.sha256;},
  (v:any)=>{v.draft.exam.sourcePdf.sha256='0'.repeat(64);},(v:any)=>{v.draft.assets=v.draft.assets.filter((a:any)=>a.content_type!=='application/pdf');},
  (v:any)=>{const asset=v.draft.assets.at(-1);v.draft.assets.push({...asset,path:`exam-assets/${asset.sha256}.pdf`});}
 ]){const {job,value}=fixture();mutate(value);const before=JSON.stringify(value);assert.throws(()=>prepareNativeDraft(job,value),/NORMALIZATION_/);assert.equal(JSON.stringify(value),before);}
});

test('Canonical receipt hashes ignore insertion order while private-state hashes preserve actual JSON bytes',()=>{
 const a={z:{unit:'m',mode:'decimal'},a:1},b={a:1,z:{mode:'decimal',unit:'m'}};
 assert.equal(nativeCanonicalDigest(a),nativeCanonicalDigest(b));assert.notEqual(privateStateDigest(a),privateStateDigest(b));assert.equal(privateStateDigest(a),hash(JSON.stringify(a)));
 assert.throws(()=>nativeCanonicalDigest({bad:Infinity}),/FINITE_JSON_REQUIRED/);assert.throws(()=>nativeCanonicalDigest({bad:undefined}),/PLAIN_JSON_REQUIRED/);
});

test('Exact cached binding yields the identical private Draft and has no recursive binding in the saved value',()=>{
 const {job,value,draft,binding}=cachedFixture(),before=JSON.stringify(value),prepared=prepareNativeDraft(job,value);
 assert.deepEqual(prepared,draft);assert.equal(privateStateDigest(prepared),binding.normalized_private_draft_sha256);assert.equal(nativeCanonicalDigest(prepared.nativeNormalization),binding.normalization_receipt_sha256);assert.equal(prepared.nativeNormalization!.output_record_sha256,binding.normalized_record_sha256);assert.equal(JSON.stringify(value),before);
 assert.deepEqual(Object.keys(prepared),['exam','assets','contextReceipt','nativeNormalization']);assert.equal('operator_cached_draft' in prepared,false);assert.equal('normalized_private_draft_sha256' in prepared.nativeNormalization!,false);
});

test('Every cached identity/hash/ref pin is enforced, and absent/extra binding fields are rejected',()=>{
 for(const key of ['contract','source_ref','source_state_sha256','raw_native_draft_sha256','class_metadata_sha256','normalizer_contract','normalization_receipt_sha256','normalized_record_sha256','normalized_private_draft_sha256','normalized_draft_ref','source_version']){
  const f=cachedFixture();(f.binding as any)[key]=key.endsWith('sha256')||key==='source_version'?'0'.repeat(64):'changed';assert.throws(()=>prepareNativeDraft(f.job,f.value),/OPERATOR_CACHED_DRAFT_BINDING_/);
 }
 for(const mutate of [(b:any)=>{delete b.raw_native_draft_sha256;},(b:any)=>{b.extra='unknown';},(b:any)=>{b.normalizer_sha256='not-a-sha';}]){const f=cachedFixture();mutate(f.binding);assert.throws(()=>prepareNativeDraft(f.job,f.value),/BINDING_REQUIRED/);}
});

test('Cached raw-file marker, schema/context contracts, source bytes and normalized math cannot be substituted',()=>{
 for(const mutate of [
  (v:any)=>{delete v.native_cache_record_sha256;},(v:any)=>{v.native_cache_record_sha256='0'.repeat(64);},
  (v:any)=>{v.inventory_contract='old-contract';},(v:any)=>{v.class_context_contract='old-contract';},
  (v:any)=>{v.sourceVersion='0'.repeat(64);},(v:any)=>{v.class_metadata_sha256='0'.repeat(64);},
  (v:any)=>{v.draft.exam.questions[0].prompt='changed same-shaped question';},(v:any)=>{v.draft.assets[0].data_base64=Buffer.from('changed opaque bytes').toString('base64');}
 ]){const f=cachedFixture();mutate(f.value);assert.throws(()=>prepareNativeDraft(f.job,f.value));}
});

test('Cached route is only the exact test upload/version and rejects an already-normalized no-op receipt',()=>{
 for(const patch of [{id:'11111111-1111-4111-8111-111111111111'},{version:2},{is_test:false}]){const f=cachedFixture();assert.throws(()=>prepareNativeDraft({...f.job,...patch},f.value),/BINDING_CHANGED/);}
 const f=cachedFixture(),canonical=normalizeNativePdfPaths(f.value,source).value;canonical.native_cache_record_sha256=f.binding.raw_native_draft_sha256;assert.throws(()=>prepareNativeDraft(f.job,canonical),/BINDING_CHANGED/);
});

test('Managed class receipt/grade cannot be bypassed by PDF normalization or cached pins',()=>{
 for(const cached of [false,true]){const f=cached?cachedFixture():fixture();f.job.class_grades={[cid]:12};assert.throws(()=>prepareNativeDraft(f.job,f.value),/NATIVE_CLASS_METADATA_CHANGED/);}
 const {job,value}=fixture();value.draft.exam.grade=12;assert.throws(()=>prepareNativeDraft(job,value),/NATIVE_CLASS_GRADE_MISMATCH/);
});

finish({providerCalls:0,SQLCalls:0,cacheWrites:0});
