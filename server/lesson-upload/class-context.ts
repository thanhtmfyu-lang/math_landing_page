import {createHash} from 'node:crypto';

export const CLASS_CONTEXT_CONTRACT='MTM-WEB-CLASS-CONTEXT-20261114-v1';
export type ClassContextJob={class_ids:string[];class_names:Record<string,string>;class_dates:Record<string,string>;lesson_date:string;class_grades?:Record<string,number>;grade_source?:string;class_grade_complete?:boolean;class_grade_issue?:string|null;homework_path?:string|null};
/** Private checkpoint metadata. Never include this object in exam/material/publish. */
export type ClassContextReceipt={contract:string;metadataSha256:string;sourceVersion:string};
const sha=/^[a-f0-9]{64}$/;
const day=/^\d{4}-\d{2}-\d{2}$/;
function ensure(value:unknown,code:string):asserts value {if(!value)throw Error(code);}
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
// Python sorts Unicode code points rather than UTF-16 code units. IDs currently
// are UUIDs; preserving the exact comparator also covers non-ASCII fixture keys.
function compareCodepoints(a:string,b:string){const x=Array.from(a),y=Array.from(b);for(let n=0;n<Math.min(x.length,y.length);n++){const d=x[n].codePointAt(0)!-y[n].codePointAt(0)!;if(d)return d;}return x.length-y.length;}
function validUnicode(text:string){for(let n=0;n<text.length;n++){const c=text.charCodeAt(n);if(c>=0xd800&&c<=0xdbff){const next=text.charCodeAt(++n);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(c>=0xdc00&&c<=0xdfff)return false;}return true;}
/** Equivalent to Python json.dumps(...ensure_ascii=False,sort_keys=True,separators=(',',':')). */
export function canonicalClassJson(value:unknown):string{
 if(value===null||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='string'){ensure(validUnicode(value),'NATIVE_CLASS_METADATA_REQUIRED');return JSON.stringify(value);}
 if(typeof value==='number'){ensure(Number.isSafeInteger(value),'NATIVE_CLASS_METADATA_REQUIRED');return JSON.stringify(value);}
 if(Array.isArray(value))return '['+value.map(canonicalClassJson).join(',')+']';
 ensure(plain(value),'NATIVE_CLASS_METADATA_REQUIRED');
 return '{'+Object.keys(value).sort(compareCodepoints).map(key=>canonicalClassJson(key)+':'+canonicalClassJson(value[key])).join(',')+'}';
}
export function managedClassContext(job:ClassContextJob,sourceVersion:string){
 const ids=job.class_ids,grades=job.class_grades,names=job.class_names,dates=job.class_dates;
 ensure(Array.isArray(ids)&&ids.length>0&&ids.every(id=>typeof id==='string')&&new Set(ids).size===ids.length,'NATIVE_CLASS_METADATA_REQUIRED');
 ensure(job.grade_source==='managed_class_catalog'&&job.class_grade_complete===true&&job.class_grade_issue==null,'NATIVE_CLASS_METADATA_REQUIRED');
 const keys=[...ids].sort(compareCodepoints);
 ensure([grades,names,dates].every(map=>{if(!plain(map))return false;const actual=Object.keys(map).sort(compareCodepoints);return actual.length===keys.length&&actual.every((key,n)=>key===keys[n]);}),'NATIVE_CLASS_METADATA_REQUIRED');
 ensure(typeof sourceVersion==='string'&&sha.test(sourceVersion)&&typeof job.lesson_date==='string'&&day.test(job.lesson_date),'NATIVE_CLASS_METADATA_REQUIRED');
 for(const id of ids)ensure(Number.isInteger(grades![id])&&[10,11,12].includes(grades![id])&&typeof names[id]==='string'&&names[id].trim()&&typeof dates[id]==='string'&&day.test(dates[id]),'NATIVE_CLASS_METADATA_REQUIRED');
 ensure(new Set(Object.values(grades!)).size===1,'NATIVE_CLASS_GRADE_AMBIGUOUS');
 return {schema:CLASS_CONTEXT_CONTRACT,sourceVersion,grade_source:'managed_class_catalog',assignment_grade:grades![ids[0]],lesson_date:job.lesson_date,classes:keys.map(class_id=>({class_id,label:names[class_id],grade:grades![class_id],date:dates[class_id]}))};
}
export function classContextHash(job:ClassContextJob,sourceVersion:string){return createHash('sha256').update(canonicalClassJson(managedClassContext(job,sourceVersion)),'utf8').digest('hex');}
function validateReceipt(job:ClassContextJob,sourceVersion:string,value:unknown){
 ensure(plain(value),'NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED');
 ensure(value.contract===CLASS_CONTEXT_CONTRACT&&typeof value.metadataSha256==='string'&&sha.test(value.metadataSha256)&&value.sourceVersion===sourceVersion,'NATIVE_CLASS_METADATA_CHANGED');
 ensure(value.metadataSha256===classContextHash(job,sourceVersion),'NATIVE_CLASS_METADATA_CHANGED');
}
export function validateClassContext(job:ClassContextJob,source:{sourceVersion:string;contextReceipt?:ClassContextReceipt},draft?:{exam:{grade:number};contextReceipt?:ClassContextReceipt}|null){
 if(!job.homework_path)return; // Existing materials-only flow has no native draft.
 validateReceipt(job,source.sourceVersion,source.contextReceipt);
 if(draft){validateReceipt(job,source.sourceVersion,draft.contextReceipt);ensure(draft.exam.grade===managedClassContext(job,source.sourceVersion).assignment_grade,'NATIVE_CLASS_GRADE_MISMATCH');}
}
/** The Python top-level receipt is accepted only after binding the claimed job. */
export function contextReceiptFromNative(job:ClassContextJob,value:any):ClassContextReceipt{
 const receipt={contract:value?.class_context_contract,metadataSha256:value?.class_metadata_sha256,sourceVersion:value?.sourceVersion};
 validateReceipt(job,value?.sourceVersion,receipt);
 return receipt;
}
