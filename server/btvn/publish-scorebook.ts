import {publicClassNames} from './class-config';
import type {ScoreRow} from './scorebook';
import {isTestRow} from './test-scope';

/** Read actions dùng cùng secret; không cho caller chọn RPC hoặc bật apply. */
export function scorebookRpc(body:any):{name:string;payload:Record<string,unknown>}|null {
 if(body.action==='opening_materials'){
  if(Object.keys(body).some(k=>!['action','lesson_key'].includes(k))||(body.lesson_key!==undefined&&(typeof body.lesson_key!=='string'||!/^[a-z0-9-]{1,160}$/.test(body.lesson_key))))throw Error('INVALID_OPENING_READ');
  return {name:'opening_materials',payload:{p_code:body.lesson_key??null}};
 }
 if(body.action==='classes'){
  if(Object.keys(body).some(k=>k!=='action'))throw Error('INVALID_CLASSES');
  return {name:'classes',payload:{}};
 }
 if(body.action!=='scorebook')return null;
 const from=body.from===undefined?'2026-10-01':body.from;
 if(Object.keys(body).some(k=>!['action','from'].includes(k))||typeof from!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(from)||from<'2026-10-01'||!Number.isFinite(Date.parse(from))||new Date(from).toISOString().slice(0,10)!==from)throw Error('INVALID_SCOREBOOK');
 return {name:'scorebook',payload:{p_from:from,p_apply:false}};
}

/** Allowlist đầu ra, kể cả khi RPC về sau thêm trường riêng tư. */
export function scorebookResult(action:string,result:any) {
 if(action==='opening_materials'){
  if(!Array.isArray(result)||result.length>20000)throw Error('INVALID_OPENING_RESULT');
  return result.filter(r=>!isTestRow(r)).map(r=>({lessonCode:r.lessonCode,date:r.date,classNames:r.classNames,classDates:r.classDates}));
 }
 if(action==='classes')return {classNames:publicClassNames(result)};
 if(!Array.isArray(result))throw Error('INVALID_SCOREBOOK_RESULT');
 return result.filter(r=>!isTestRow(r)).map((r:any):ScoreRow=>({studentId:r.studentId,fullName:r.fullName,className:r.className,lessonCode:r.lessonCode,title:r.title,date:r.date,dueAt:r.dueAt,expectedDueAt:r.expectedDueAt,sourceIdentity:r.sourceIdentity,
  attempts:(Array.isArray(r.attempts)?r.attempts:[]).slice(0,50).map((x:any)=>({startedAt:typeof x?.startedAt==='number'?x.startedAt:null,submittedAt:typeof x?.submittedAt==='number'?x.submittedAt:null})),receipts:r.receipts.map((s:any)=>({score:s.score,submittedAt:s.submittedAt,late:s.late}))}));
}
