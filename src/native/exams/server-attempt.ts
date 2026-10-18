import {requireBackend} from '../admin/backend';
import {isRecord,validatePracticeExam,type PracticeExam} from './data';
import {validateDraft,type Draft,type Store} from './store';
import {resultFor} from './result';
import type {ScoreResult} from './assessment';
export type RemoteResult={attemptId:string;exam:PracticeExam;answers:Draft['answers'];score:ScoreResult;submittedAt:number;startedAt:number;deadline:number;serverNow:number};
export type RemoteAttempt={attemptId:string;attemptToken:string;versionHash:string;startedAt:number;deadline:number;serverNow:number;clientReceivedAt?:number;localAttemptId?:string;result?:RemoteResult};
export const remoteKey=(id:string)=>'mtm:exam:remote:v1:'+encodeURIComponent(id);
export function hydrateRemoteReview(r:RemoteResult,exam:PracticeExam):RemoteResult {return {...r,exam:{...r.exam,sourcePdf:exam.sourcePdf}};}
export function needsFreshRemote(a:RemoteAttempt|null,draft:Pick<Draft,'attemptId'>):boolean {return !a||!!a.result&&a.localAttemptId!==draft.attemptId;}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const milliseconds=(v:unknown):v is number=>Number.isSafeInteger(v)&&(v as number)>=0;
export function readRemote(storage:Store|null,exam:PracticeExam):RemoteAttempt|null {
 try{const raw=storage?.getItem(remoteKey(exam.id));if(!raw)return null;const a=JSON.parse(raw);if(!isRecord(a)||a.versionHash!==exam.versionHash||!uuid(a.attemptId)||typeof a.attemptToken!=='string'||!/^[a-f0-9]{64}$/.test(a.attemptToken)||!milliseconds(a.deadline)||!milliseconds(a.startedAt)||a.deadline-a.startedAt!==exam.durationMinutes*60000||!milliseconds(a.serverNow)||a.serverNow<a.startedAt)return null;if(a.result)validateRemoteResult(a.result,exam.id,exam.versionHash);return a as RemoteAttempt;}catch{return null;}
}
export function saveRemote(storage:Store|null,id:string,attempt:RemoteAttempt){if(!storage)throw Error('Cần cho phép lưu bài trên trình duyệt để giữ quyền xem kết quả.');const raw=JSON.stringify(attempt);storage.setItem(remoteKey(id),raw);if(storage.getItem(remoteKey(id))!==raw)throw Error('Chưa lưu được quyền truy cập lượt thi.');}
async function rpc(name:string,args:Record<string,unknown>){const r=await requireBackend().rpc(name,args);if(r.error||!r.data)throw Error('Chưa nhận được xác nhận từ máy chủ. Bài làm vẫn được giữ, em hãy thử lại.');return r.data;}
export async function startRemote(exam:PracticeExam):Promise<RemoteAttempt>{const a=await rpc('mtm_exam_start',{p_version:exam.id});if(!isRecord(a)||typeof a.attemptToken!=='string'||!isRecord(a.exam)||a.exam.versionHash!==exam.versionHash)throw Error('Phiên bản đề đã thay đổi. Hãy tải lại danh sách đề.');return {...a,versionHash:exam.versionHash,clientReceivedAt:Date.now()} as RemoteAttempt;}
export async function submitRemote(a:RemoteAttempt,draft:Draft):Promise<RemoteResult>{const r=await rpc('mtm_exam_submit',{p_attempt:a.attemptId,p_token:a.attemptToken,p_answers:draft.answers});return validateRemoteResult(r,draft.examId,draft.examVersionHash);}
export function validateRemoteResult(r:unknown,id:string,hash:string):RemoteResult {
 const fail=()=>{throw Error('Máy chủ chưa trả đủ kết quả hợp lệ. Bài làm vẫn được giữ.');};
 if(!isRecord(r)||!isRecord(r.exam)||r.exam.id!==id||r.exam.versionHash!==hash||!validatePracticeExam(r.exam).valid||!isRecord(r.score)||r.score.ok!==true||!uuid(r.attemptId)||!milliseconds(r.submittedAt)||!milliseconds(r.startedAt)||!milliseconds(r.deadline)||!milliseconds(r.serverNow)||r.submittedAt<r.startedAt||r.submittedAt>r.serverNow||!isRecord(r.answers))return fail();
 const exam=r.exam as unknown as PracticeExam;
 const d={version:1,examId:id,examVersionHash:hash,rubricVersion:exam.rubricVersion,attemptId:r.attemptId,startedAt:r.startedAt,deadline:r.deadline,updatedAt:r.submittedAt,submittedAt:r.submittedAt,revision:1,answers:r.answers};
 const checked=validateDraft(d,exam);if(!checked.ok)return fail();
 const score=resultFor(exam,checked.value)?.score;
 if(!score?.ok||r.score.earnedMillipoints!==score.earnedMillipoints||r.score.finalMillipoints!==score.finalMillipoints||r.score.maxMillipoints!==10000||!Array.isArray(r.score.rows)||r.score.rows.length!==score.rows.length||!r.score.rows.every((row:unknown,i:number)=>isRecord(row)&&row.id===score.rows[i].id&&row.earnedMillipoints===score.rows[i].earnedMillipoints&&row.maxMillipoints===score.rows[i].maxMillipoints)||!Array.isArray(r.score.manualPending)||r.score.manualPending.length!==0)return fail();
 return r as RemoteResult;
}
export async function remoteSolutionPdf(a:RemoteAttempt){const response=await fetch('/api/exam',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'solutionPdf',attemptId:a.attemptId,attemptToken:a.attemptToken})});if(!response.ok)throw Error('Chưa mở được PDF lời giải. Cần nộp bài và có xác nhận máy chủ.');const r=await response.json();if(typeof r.url!=='string'||!r.url.startsWith('https://'))throw Error('Chưa có PDF lời giải cho đề này.');return r.url as string;}
