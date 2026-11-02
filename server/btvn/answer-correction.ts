import {validatePracticeExam, type PracticeExam} from '../../src/native/exams/data';
import {validateDraft, type Draft} from '../../src/native/exams/store';
import {resultFor} from '../../src/native/exams/result';
import {MTM_SCORING_VERSION} from '../../src/native/exams/mtm-scoring';
import type {HomeworkReceipt} from '../../src/native/homework/btvn-contract';
type Work = {student_id:string;revision:number;drafts:Draft[];receipts:HomeworkReceipt[]};
export type CorrectionSnapshot = {exam:PracticeExam;work:Work[]};
type Patch = {question_id:string;answer?:'A'|'B'|'C'|'D';acceptedAnswers?:string[];mode?:'numeric'|'rational'|'exact'};
export type CorrectionRequest = {action:'answer_correction_preview'|'answer_correction_apply'|'answer_correction_future_only_preview'|'answer_correction_future_only_apply';lesson_key:string;request_id:string;
  lenh_ref:string;approved_via:string;patches:Patch[];expected_plan_sha256?:string};
function ensure(v:unknown,code:string):asserts v {if(!v)throw Error(code);}
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function canonicalCorrection(v:any):string {
  if(Array.isArray(v))return '['+v.map(canonicalCorrection).join(',')+']';
  if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalCorrection(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
export async function correctionHash(v:unknown) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalCorrection(v))))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function validateCorrectionRequest(v:unknown):asserts v is CorrectionRequest {
  ensure(object(v),'CORRECTION_SCHEMA');
  ensure(Object.keys(v).every(k=>['action','lesson_key','request_id','lenh_ref','approved_via','patches','expected_plan_sha256'].includes(k)),'CORRECTION_SCHEMA');
  ensure(['answer_correction_preview','answer_correction_apply','answer_correction_future_only_preview','answer_correction_future_only_apply'].includes(v.action),'CORRECTION_ACTION');
  ensure(/^[a-z0-9-]{1,160}$/.test(v.lesson_key??'')&&/^[A-Za-z0-9_-]{12,160}$/.test(v.request_id??''),'CORRECTION_ID');
  ensure(typeof v.lenh_ref==='string'&&v.lenh_ref.length>=8&&v.lenh_ref.length<=500&&typeof v.approved_via==='string'&&v.approved_via.length>=8&&v.approved_via.length<=500,'CORRECTION_AUTHORITY_REQUIRED');
  ensure(Array.isArray(v.patches)&&v.patches.length>0&&v.patches.length<=50,'CORRECTION_PATCHES');
  const seen=new Set();
  for(const p of v.patches) {
    ensure(object(p)&&Object.keys(p).every(k=>['question_id','answer','acceptedAnswers','mode'].includes(k)),'CORRECTION_PATCH_SCHEMA');
    ensure(typeof p.question_id==='string'&&p.question_id.trim()===p.question_id&&p.question_id.length>0&&!seen.has(p.question_id),'CORRECTION_DUPLICATE_QUESTION');seen.add(p.question_id);
    ensure((Object.hasOwn(p,'answer')?1:0)+(Object.hasOwn(p,'acceptedAnswers')?1:0)===1,'CORRECTION_PATCH_SCHEMA');
    if(Object.hasOwn(p,'mode'))ensure(Object.hasOwn(p,'acceptedAnswers')&&['numeric','rational','exact'].includes(p.mode),'CORRECTION_SHORT_MODE');
    if(Object.hasOwn(p,'answer'))ensure(['A','B','C','D'].includes(p.answer),'CORRECTION_CHOICE');
    else ensure(Array.isArray(p.acceptedAnswers)&&p.acceptedAnswers.length>0&&p.acceptedAnswers.length<=20&&p.acceptedAnswers.every((x:unknown)=>typeof x==='string'&&x.trim()===x&&x.length>0&&x.length<=500)&&new Set(p.acceptedAnswers).size===p.acceptedAnswers.length,'CORRECTION_SHORT');
  }
  if(v.action.endsWith('_apply'))ensure(/^[a-f0-9]{64}$/.test(v.expected_plan_sha256??''),'CORRECTION_PREVIEW_REQUIRED');
}
/** Reuse the exact submission engine. No I/O, guessed answers, score deltas or rescaling. */
export async function planAnswerCorrection(snapshot:CorrectionSnapshot,request:CorrectionRequest) {
  validateCorrectionRequest(request);
  ensure(object(snapshot)&&validatePracticeExam(snapshot.exam).valid&&Array.isArray(snapshot.work),'CORRECTION_SNAPSHOT');
  const old=snapshot.exam,exam=structuredClone(old);
  const hasSelf=exam.questions.some(q=>q.kind==='self');
  const patchHash=await correctionHash(request.patches);
  if(exam.rubricVersion===MTM_SCORING_VERSION)exam.answerKeyVersion='corrected-'+patchHash;
  else exam.versionHash=await correctionHash({previousVersion:old.versionHash,patches:request.patches});
  for(const patch of request.patches) {
    const q=exam.questions.find(q=>q.id===patch.question_id);ensure(q,'CORRECTION_QUESTION_NOT_FOUND');
    if(q.kind==='mc') {ensure(patch.answer&&!patch.acceptedAnswers&&!patch.mode,'CORRECTION_KIND');q.answer=patch.answer;}
    else {
      ensure(q.kind==='short'&&patch.acceptedAnswers&&!patch.answer,'CORRECTION_KIND');
      q.acceptedAnswers=[...patch.acceptedAnswers];
      if(patch.mode!==undefined) {
        // An existing verified rule must agree; this endpoint cannot rewrite its evidence/constraints.
        ensure(!q.shortRule||q.shortRule.mode===(patch.mode==='numeric'?'decimal':patch.mode),'CORRECTION_SHORT_RULE_CONFLICT');
        q.mode=patch.mode;
      }
    }
    if(exam.rubricVersion===MTM_SCORING_VERSION) {q.answerVerified=true;q.answerConflict=false;}
  }
  ensure(validatePracticeExam(exam).valid,'CORRECTION_NEW_KEY_INVALID');
  // Future-only never grades or rewrites any existing work, even a submitted draft.
  if(request.action.startsWith('answer_correction_future_only_')) {
    ensure(!snapshot.work.some(row=>row.drafts.some(d=>d.submittedAt===null)),'CORRECTION_ACTIVE_ATTEMPT_HOLD');
    const plan={exam,work:structuredClone(snapshot.work)};
    const plan_sha256=await correctionHash({mode:'future_only',request_id:request.request_id,lesson_key:request.lesson_key,lenh_ref:request.lenh_ref,approved_via:request.approved_via,patches:request.patches,snapshot,plan});
    return {plan,plan_sha256,students:snapshot.work.length,attempts:0,changed:0,question_ids:request.patches.map(p=>p.question_id)};
  }
  let attempts=0,changed=0;const studentIds=new Set<string>();
  const work=snapshot.work.map(row=>{
    ensure(object(row)&&typeof row.student_id==='string'&&!studentIds.has(row.student_id)&&Number.isSafeInteger(row.revision)&&row.revision>=0&&Array.isArray(row.drafts)&&Array.isArray(row.receipts),'CORRECTION_WORK');studentIds.add(row.student_id);
    const drafts=row.drafts.map(d=>{
      ensure(validateDraft(d,old).ok,'CORRECTION_OLD_DRAFT_INVALID');
      return exam.rubricVersion===MTM_SCORING_VERSION?{...d,answerKeyVersion:exam.answerKeyVersion}:{...d,examVersionHash:exam.versionHash};
    });
    ensure(new Set(drafts.map(d=>d.attemptId)).size===drafts.length,'CORRECTION_DUPLICATE_ATTEMPT');
    ensure(new Set(row.receipts.map(r=>r.attemptId)).size===row.receipts.length,'CORRECTION_DUPLICATE_RECEIPT');
    ensure(drafts.filter(d=>d.submittedAt!==null).length===row.receipts.length,'CORRECTION_MISSING_RECEIPT');
    const receipts=row.receipts.map(receipt=>{
      // self has zero machine points. Recompute only score; preserve all teacher fields,
      // including officialScore, gradingPending and any stored comments, without a delta.
      ensure(hasSelf||!Object.hasOwn(receipt,'officialScore')&&receipt.gradingPending!==true,'CORRECTION_MANUAL_OVERRIDE_HOLD');
      const draft=drafts.find(d=>d.attemptId===receipt.attemptId);
      ensure(draft&&draft.submittedAt!==null&&draft.submittedAt===receipt.submittedAt,'CORRECTION_MISSING_ANSWERS');
      const result=resultFor(exam,draft);ensure(result?.score.ok,'CORRECTION_GRADING_FAILED');
      const mtm=result.mtm;
      ensure(!mtm||mtm.officialDisplayTotal!==null,'CORRECTION_PENDING_KEY_HOLD');
      const score=mtm?Number(mtm.officialDisplayTotal):result.score.earnedMillipoints/1000;
      ensure(Number.isFinite(score)&&score>=0&&score<=10,'CORRECTION_SCORE');
      attempts++;if(receipt.score!==score)changed++;
      return {...receipt,score,...(mtm?{mtm,rubricVersion:MTM_SCORING_VERSION}:{} )};
    });
    return {...row,drafts,receipts};
  });
  const plan={exam,work};const plan_sha256=await correctionHash({request_id:request.request_id,lesson_key:request.lesson_key,lenh_ref:request.lenh_ref,approved_via:request.approved_via,patches:request.patches,snapshot,plan});
  return {plan,plan_sha256,students:work.length,attempts,changed,question_ids:request.patches.map(p=>p.question_id)};
}
export async function handleAnswerCorrection(port:{rpc(action:string,payload:Record<string,unknown>):Promise<any>},body:unknown) {
  validateCorrectionRequest(body);
  // A read/retry cannot apply a second correction. The DB journal binds authority + exact patches.
  const binding={lesson_key:body.lesson_key,request_id:body.request_id,lenh_ref:body.lenh_ref,approved_via:body.approved_via,patches:body.patches};
  const futureOnly=body.action.startsWith('answer_correction_future_only_');
  const snapshot=await port.rpc(futureOnly?'answer_correction_future_snapshot':'answer_correction_snapshot',binding);
  if(snapshot?.already_applied===true)return snapshot.result;
  const result=await planAnswerCorrection(snapshot,body);
  if(body.action.endsWith('_preview'))return {status:'preview',plan_sha256:result.plan_sha256,students:result.students,attempts:result.attempts,changed:result.changed,question_ids:result.question_ids};
  ensure(body.expected_plan_sha256===result.plan_sha256,'CORRECTION_STALE_PREVIEW');
  return port.rpc(futureOnly?'answer_correction_future_commit':'answer_correction_commit',{...binding,expected_snapshot:snapshot,new_exam:result.plan.exam,updated_work:result.plan.work,plan_sha256:result.plan_sha256});
}
