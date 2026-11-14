/** Opaque synthetic transport payloads, never an upload/publication fixture. */
import {createHash} from 'node:crypto';
import {MTM_SCORING_VERSION} from '../../src/native/exams/mtm-scoring';
import {CLASS_CONTEXT_CONTRACT,classContextHash} from '../../server/lesson-upload/class-context';
import {NATIVE_DRAFT_INVENTORY_CONTRACT,type NativeDraftJob} from '../../server/lesson-upload/native-draft';
const hash=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
export const nativeFixtureSource='7'.repeat(64);
export function nativeDraftFixture(){
 const cid='0d31a7f2-1da1-4b03-b248-22c260d1c713',source=nativeFixtureSource;
 const job:NativeDraftJob={id:'14227822-ce9a-4f0f-8df3-489a60b11392',version:1,is_test:true,homework_path:'SYNTHETIC_PRIVATE_SOURCE.pdf',class_ids:[cid],class_names:{[cid]:'Synthetic class 11'},class_dates:{[cid]:'2026-11-10'},lesson_date:'2026-11-10',class_grades:{[cid]:11},grade_source:'managed_class_catalog',class_grade_complete:true,class_grade_issue:null};
 const assets:any[]=[],questions=Array.from({length:3},(_,i)=>{
  const segments=['questions','solutions'].map(tag=>{const bytes=Buffer.from(`SYNTHETIC_OPAQUE_PNG_${tag}_${i}`),path=`paper1/exam-assets_${tag}_${i}.png`;assets.push({path,sha256:hash(bytes),content_type:'image/png',data_base64:bytes.toString('base64')});return {path,sha256:hash(bytes),sourcePage:1,width:100,height:100};});
  return {id:`q${i+1}`,kind:'mc',sourceRef:`Synthetic ${i+1}`,prompt:`Synthetic item ${i+1}`,choices:['One','Two','Three','Four'],answer:'B',maxPoints:{numerator:'10',denominator:'3'},maxMillipoints:10000/3,sourceContent:{questions:[segments[0]],solutions:[segments[1]]}};
 });
 const pdfs=['questions','solutions'].map(tag=>{const bytes=Buffer.from(`%PDF-1.4\nSYNTHETIC_${tag}\n%%EOF`),sha256=hash(bytes),path=`paper1/exam-assets_${sha256}.pdf`;assets.push({path,sha256,content_type:'application/pdf',data_base64:bytes.toString('base64')});return {url:'/'+path,sha256,bytes:bytes.length};});
 const exam={id:'mtm-custom-synthetic-native',sourceHash:pdfs[0].sha256,sourceRef:source,questionCount:3,grade:11,period:'GK1',title:'Synthetic native draft',durationMinutes:120,versionHash:'5'.repeat(64),rubricVersion:MTM_SCORING_VERSION,answerKeyVersion:'synthetic-key',sourceComplete:true,answerKeyVerified:true,rubricVerified:true,sourceUrl:'https://source.invalid/fixture',publicationVerified:true,questionDisplayVerified:true,sourceMaterial:{title:'Synthetic',publisher:'MTM QA',version:'v1',locator:'Synthetic items'},sections:[{label:'MC',kind:'mc',count:3}],questions,sourcePdf:{...pdfs[0],verified:true,totalPages:1,questionPages:[1]},mtmDocuments:{questions:{url:pdfs[0].url,sha256:pdfs[0].sha256},solutions:{url:pdfs[1].url,sha256:pdfs[1].sha256}},mtmGrading:{examVersion:'5'.repeat(64),N:3,questionMax:{numerator:'10',denominator:'3'}}};
 const value:any={inventory_contract:NATIVE_DRAFT_INVENTORY_CONTRACT,class_context_contract:CLASS_CONTEXT_CONTRACT,class_metadata_sha256:classContextHash(job,source),sourceVersion:source,draft:{exam,assets},extractor:{provider:'synthetic-only',model:'no-provider-called'}};
 value.native_cache_record_sha256=hash(JSON.stringify(value));return {job,value};
}
