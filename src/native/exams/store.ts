import type {Choice} from './assessment';
import {MTM_SCORING_VERSION} from './mtm-scoring';
import {boundedText, isRecord, validatePracticeExam, validateQuestionOnlyPracticeExam, type PracticeExam} from './data';

export const STORAGE_PREFIX = 'mtm:exam:v1:';
export const MAX_SHORT_LENGTH = 500;
export type Response = Choice | null | readonly (boolean | null)[] | string;
export type Answers = Readonly<Record<string, Response>>;
export type Draft = Readonly<{
  version: 1;
  examId: string;
  examVersionHash: string;
  rubricVersion: string;
  answerKeyVersion?:string;
  attemptId: string;
  startedAt: number;
  deadline: number;
  updatedAt: number;
  answers: Answers;
  submittedAt: number | null;
  revision: number;
}>;
export type Store = Pick<Storage, 'getItem' | 'setItem'>;
export type Failure = {ok: false; code: string; message: string};
export type Outcome<T> = {ok: true; value: T} | Failure;
/** Only the server-graded homework caller may admit a public question transport.
 * Practice/history callers retain the complete-exam gate by default. */
export type DraftValidationOptions = {allowQuestionOnly?:boolean};
const validDraftExam=(exam:PracticeExam,options:DraftValidationOptions)=>
  ((options.allowQuestionOnly===true||exam.serverGraded===true)&&exam.responseMode==='questions-only'?validateQuestionOnlyPracticeExam(exam):validatePracticeExam(exam)).valid;
const fail = (code: string, message: string): Failure => ({ok: false, code, message});
const validTime = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 8640000000000000;
const validRevision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
export const draftKey = (examId: string) => STORAGE_PREFIX + encodeURIComponent(examId);

/** A provider is supplied by the caller. This module never reads browser globals,
 * enumerates unrelated storage, deletes data, or uses fallback storage. */
export function validateDraft(value: unknown, exam: PracticeExam, options:DraftValidationOptions={}): Outcome<Draft> {
  if (!validDraftExam(exam,options)) return fail('exam', 'Đề chưa đủ điều kiện mở làm bài.');
  if (!isRecord(value)) return fail('shape', 'Bản lưu không đúng định dạng. Dữ liệu cũ được giữ nguyên.');
  const fields = ['version', 'examId', 'examVersionHash', 'rubricVersion', 'attemptId', 'startedAt', 'deadline', 'updatedAt', 'answers', 'submittedAt', 'revision'];
  if(exam.rubricVersion===MTM_SCORING_VERSION)fields.push('answerKeyVersion');
  if (Object.keys(value).length !== fields.length || !fields.every(key => Object.hasOwn(value, key))) return fail('shape', 'Bản lưu có cấu trúc khác. Dữ liệu cũ được giữ nguyên.');
  if (value.version !== 1 || value.examId !== exam.id || value.examVersionHash !== exam.versionHash || value.rubricVersion !== exam.rubricVersion) return fail('version', 'Bản lưu thuộc đề hoặc phiên bản khác. Dữ liệu cũ được giữ nguyên.');
  if(exam.rubricVersion===MTM_SCORING_VERSION&&value.answerKeyVersion!==exam.answerKeyVersion)return fail('version','Bản lưu thuộc phiên bản đáp án khác. Dữ liệu cũ được giữ nguyên.');
  if (!boundedText(value.attemptId, 160) || value.attemptId.trim() !== value.attemptId) return fail('attempt', 'Mã lượt làm trong bản lưu không hợp lệ.');
  if (!validTime(value.startedAt) || !validTime(value.deadline) || !validTime(value.updatedAt) || !validRevision(value.revision)) return fail('time', 'Thời gian hoặc số lần lưu không hợp lệ.');
  if (value.deadline <= value.startedAt || value.deadline - value.startedAt !== exam.durationMinutes * 60000 || value.updatedAt < value.startedAt) return fail('time', 'Thời hạn trong bản lưu không khớp thời lượng đề.');
  if (value.submittedAt !== null && (!validTime(value.submittedAt) || value.submittedAt < value.startedAt || value.submittedAt > value.updatedAt)) return fail('time', 'Thời điểm nộp bài không hợp lệ.');
  if (!isRecord(value.answers)) return fail('answers', 'Đáp án trong bản lưu không đúng định dạng.');
  const questions = new Map(exam.questions.map(q => [q.id, q]));
  for (const [id, answer] of Object.entries(value.answers)) {
    const question = questions.get(id);
    if (!question) return fail('unknown-answer', 'Bản lưu có câu trả lời không thuộc đề này.');
    const valid = question.kind === 'mc'
      ? answer === null || ['A', 'B', 'C', 'D'].includes(answer as string)
      : question.kind === 'tf'
        ? Array.isArray(answer) && answer.length === 4 && Array.from(answer).every(x => x === null || typeof x === 'boolean')
        : typeof answer === 'string' && answer.length <= MAX_SHORT_LENGTH;
    if (!valid) return fail('answers', 'Có câu trả lời không đúng định dạng. Dữ liệu cũ được giữ nguyên.');
  }
  // Return a detached copy; callers cannot accidentally mutate an expected snapshot.
  return {ok: true, value: JSON.parse(JSON.stringify(value)) as Draft};
}

export function readDraft(storage: Store | null, exam: PracticeExam, options:DraftValidationOptions={}): Outcome<Draft | null> {
  if (!validDraftExam(exam,options)) return fail('exam', 'Đề chưa đủ điều kiện mở làm bài.');
  if (!storage) return fail('unavailable', 'Không truy cập được nơi lưu trên trình duyệt này.');
  let raw: string | null;
  try { raw = storage.getItem(draftKey(exam.id)); }
  catch { return fail('read', 'Không đọc được bài đã lưu. Dữ liệu cũ được giữ nguyên.'); }
  if (raw === null) return {ok: true, value: null};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return fail('json', 'Bản lưu bị lỗi định dạng. Dữ liệu cũ được giữ nguyên.'); }
  return validateDraft(parsed, exam, options);
}

const sameAnswers = (a: Answers, b: Answers) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && JSON.stringify(a[key]) === JSON.stringify(b[key]));
};
export function sameDraft(a: Draft, b: Draft): boolean {
  return a.version === b.version && a.examId === b.examId && a.examVersionHash === b.examVersionHash && a.rubricVersion === b.rubricVersion && a.answerKeyVersion===b.answerKeyVersion && a.attemptId === b.attemptId && a.startedAt === b.startedAt && a.deadline === b.deadline && a.updatedAt === b.updatedAt && a.submittedAt === b.submittedAt && a.revision === b.revision && sameAnswers(a.answers, b.answers);
}

/** Optimistic save against the exact last successfully read/saved snapshot.
 * localStorage has no cross-tab atomic CAS; re-read + readback catch observable
 * conflicts. A storage event must freeze automatic writes in the UI as well. */
export function saveDraft(storage: Store | null, exam: PracticeExam, candidate: Draft, expected: Draft | null, options:DraftValidationOptions={}): Outcome<Draft> {
  const checked = validateDraft(candidate, exam, options);
  if (!checked.ok) return checked;
  if (expected !== null) {
    const validExpected = validateDraft(expected, exam, options);
    if (!validExpected.ok) return validExpected;
  }
  const read = readDraft(storage, exam, options);
  if (!read.ok) return read;
  const current = read.value, next = checked.value;
  // Exact repeat is safe and writes nothing, including after submission/reload.
  if (current && sameDraft(current, next)) return {ok: true, value: current};
  if ((current === null) !== (expected === null) || (current && expected && !sameDraft(current, expected))) return fail('conflict', 'Bài đã thay đổi ở nơi khác. Câu trả lời đang làm vẫn được giữ trên trang này.');
  if (current) {
    if (current.submittedAt !== null || next.attemptId !== current.attemptId || next.startedAt !== current.startedAt || next.deadline !== current.deadline || next.revision <= current.revision || next.updatedAt < current.updatedAt) return fail('conflict', 'Không ghi đè lượt làm khác, bản mới hơn hoặc bài đã nộp.');
  }
  try { storage!.setItem(draftKey(exam.id), JSON.stringify(next)); }
  catch { return fail('write', 'Không lưu được bài trên trình duyệt. Có thể bộ nhớ đã đầy hoặc quyền lưu đang bị chặn.'); }
  const confirmed = readDraft(storage, exam, options);
  if (!confirmed.ok) return confirmed;
  if (!confirmed.value || !sameDraft(confirmed.value, next)) return fail('conflict', 'Chưa xác nhận được bản vừa lưu. Câu trả lời vẫn được giữ trên trang này.');
  return {ok: true, value: confirmed.value};
}

export function createDraft(exam: PracticeExam, attemptId: string, now: number, options:DraftValidationOptions={}): Outcome<Draft> {
  return validateDraft({version: 1, examId: exam.id, examVersionHash: exam.versionHash, rubricVersion: exam.rubricVersion, attemptId,
    startedAt: now, deadline: now + exam.durationMinutes * 60000, updatedAt: now,
    answers: {}, submittedAt: null, revision: 0,...(exam.rubricVersion===MTM_SCORING_VERSION?{answerKeyVersion:exam.answerKeyVersion}:{})}, exam, options);
}
export function remainingMs(draft: Pick<Draft, 'deadline'>, now: number): number {
  if (!validTime(now) || !validTime(draft.deadline)) throw new RangeError('Invalid clock');
  return Math.max(0, draft.deadline - now);
}
export function isAnswered(exam: PracticeExam, id: string, answers: Answers): boolean {
  const q = exam.questions.find(question => question.id === id), answer = answers[id];
  if (!q) return false;
  if (q.kind === 'tf') return Array.isArray(answer) && answer.length === 4 && answer.every(value => typeof value === 'boolean');
  return typeof answer === 'string' && answer.trim().length > 0;
}
/** Once submitted, repeated manual clicks, timeout ticks and refresh are no-ops. */
export function submitDraft(exam: PracticeExam, draft: Draft, now: number, options:DraftValidationOptions={}): Outcome<Draft> {
  const checked = validateDraft(draft, exam, options);
  if (!checked.ok) return checked;
  if (draft.submittedAt !== null) return checked;
  if (!validTime(now)) return fail('time', 'Không xác định được thời gian nộp bài.');
  const submittedAt = Math.max(now, draft.startedAt, draft.updatedAt);
  return validateDraft({...draft, submittedAt, updatedAt: submittedAt, revision: draft.revision + 1}, exam, options);
}

/** Merge archived submitted snapshots and the active completed draft, deduplicated
 * by attempt id. Retake archives before replacing active; scores are recomputed
 * from each retained exam version rather than a newer answer key. */
export function readHistory(storage: Store | null, catalog: readonly PracticeExam[]): {items: {exam: PracticeExam; draft: Draft}[]; messages: string[]} {
  if (!storage) return {items: [], messages: ['Không đọc được lịch sử đã lưu trên trình duyệt này.']};
  const archive=readArchive(storage);
  const items: {exam: PracticeExam; draft: Draft}[] = archive.ok?[...archive.value.entries]:[], messages: string[] = archive.ok?[]:[archive.message];
  for (const exam of catalog) {
    const result = readDraft(storage, exam);
    if (!result.ok) messages.push(`${exam.title}: ${result.message}`);
    else if (result.value && result.value.submittedAt !== null&&!items.some(item=>item.draft.attemptId===result.value!.attemptId)) items.push({exam, draft: result.value});
  }
  return {items: items.sort((a, b) => b.draft.submittedAt! - a.draft.submittedAt!), messages};
}

export const HISTORY_KEY=STORAGE_PREFIX+'history';
export const HISTORY_LIMIT=100;
export const HISTORY_BYTE_LIMIT=1024*1024;
type HistoryEntry={exam:PracticeExam;draft:Draft};
type Archive={version:1;entries:HistoryEntry[]};
const byteLength=(s:string)=>new TextEncoder().encode(s).byteLength;
export function readArchive(storage:Store|null):Outcome<Archive & {raw:string|null}> {
  if(!storage)return fail('unavailable','Không truy cập được lịch sử trên trình duyệt.');
  let raw:string|null;try{raw=storage.getItem(HISTORY_KEY);}catch{return fail('read','Không đọc được lịch sử. Bản cũ được giữ nguyên.');}
  if(raw===null)return {ok:true,value:{version:1,entries:[],raw}};
  if(byteLength(raw)>HISTORY_BYTE_LIMIT)return fail('history-limit','Lịch sử vượt giới hạn. Hãy xuất dữ liệu; chưa thay bản cũ.');
  let value:unknown;try{value=JSON.parse(raw);}catch{return fail('history-json','Lịch sử lỗi định dạng. Bản cũ được giữ nguyên.');}
  if(!isRecord(value)||value.version!==1||!Array.isArray(value.entries)||value.entries.length>HISTORY_LIMIT)return fail('history-shape','Lịch sử không đúng định dạng. Bản cũ được giữ nguyên.');
  const ids=new Set<string>();const entries:HistoryEntry[]=[];
  for(const entry of Array.from(value.entries)){
    if(!isRecord(entry)||!validatePracticeExam(entry.exam).valid)return fail('history-shape','Nguồn đề trong lịch sử chưa hợp lệ. Bản cũ được giữ nguyên.');
    const exam=entry.exam as unknown as PracticeExam,checked=validateDraft(entry.draft,exam);
    if(!checked.ok||checked.value.submittedAt===null||ids.has(checked.value.attemptId))return fail('history-shape','Lượt nộp trong lịch sử chưa hợp lệ. Bản cũ được giữ nguyên.');
    ids.add(checked.value.attemptId);entries.push({exam:JSON.parse(JSON.stringify(exam)),draft:checked.value});
  }
  return {ok:true,value:{version:1,entries,raw}};
}
export function archiveSubmitted(storage:Store|null,exam:PracticeExam,draft:Draft):Outcome<HistoryEntry[]> {
  const checked=validateDraft(draft,exam);if(!checked.ok)return checked;
  if(draft.submittedAt===null)return fail('not-submitted','Chỉ lưu lịch sử cho bài đã nộp.');
  const old=readArchive(storage);if(!old.ok)return old;
  const existing=old.value.entries.find(x=>x.draft.attemptId===draft.attemptId);
  if(existing)return sameDraft(existing.draft,draft)&&JSON.stringify(existing.exam)===JSON.stringify(exam)?{ok:true,value:old.value.entries}:fail('conflict','Mã lượt làm đã tồn tại với dữ liệu khác. Chưa thay lịch sử.');
  if(old.value.entries.length>=HISTORY_LIMIT)return fail('history-limit','Lịch sử đã đủ 100 lượt. Hãy xuất dữ liệu; chưa bắt đầu lượt mới để giữ bản cũ.');
  const entries=[...old.value.entries,{exam,draft:checked.value}],raw=JSON.stringify({version:1,entries});
  if(byteLength(raw)>HISTORY_BYTE_LIMIT)return fail('history-limit','Lịch sử đã đầy. Hãy xuất dữ liệu; bản cũ được giữ nguyên.');
  try{
    if(storage!.getItem(HISTORY_KEY)!==old.value.raw)return fail('conflict','Lịch sử vừa thay đổi ở thẻ khác. Chưa ghi đè.');
    storage!.setItem(HISTORY_KEY,raw);
    if(storage!.getItem(HISTORY_KEY)!==raw)return fail('conflict','Chưa xác nhận được lịch sử vừa lưu.');
  }catch{return fail('write','Không lưu được lịch sử. Hãy xuất bài làm trước khi làm lại.');}
  return {ok:true,value:entries};
}
export function retakeDraft(storage:Store|null,exam:PracticeExam,expected:Draft,newAttemptId:string,now:number):Outcome<Draft> {
  const checked=validateDraft(expected,exam);if(!checked.ok)return checked;
  if(expected.submittedAt===null||newAttemptId===expected.attemptId)return fail('retake','Cần bài đã nộp và mã lượt mới khác để làm lại.');
  const made=createDraft(exam,newAttemptId,now);if(!made.ok)return made;
  const archive=readArchive(storage);if(!archive.ok)return archive;
  if(archive.value.entries.some(item=>item.draft.attemptId===newAttemptId))return fail('retake','Mã lượt mới đã tồn tại trong lịch sử.');
  const current=readDraft(storage,exam);if(!current.ok)return current;
  if(!current.value||!sameDraft(current.value,expected))return fail('conflict','Bài đã thay đổi ở thẻ khác. Chưa làm lại.');
  const archived=archiveSubmitted(storage,exam,expected);if(!archived.ok)return archived;
  const reread=readDraft(storage,exam);if(!reread.ok)return reread;
  if(!reread.value||!sameDraft(reread.value,expected))return fail('conflict','Bài vừa thay đổi; lịch sử đã giữ, chưa mở lượt mới.');
  try{storage!.setItem(draftKey(exam.id),JSON.stringify(made.value));}catch{return fail('write','Chưa lưu được lượt mới. Bài đã nộp và lịch sử vẫn được giữ; chưa bắt đầu làm lại.');}
  const confirmed=readDraft(storage,exam);if(!confirmed.ok)return confirmed;
  return confirmed.value&&sameDraft(confirmed.value,made.value)?{ok:true,value:confirmed.value}:fail('conflict','Chưa xác nhận lượt mới. Bài đã nộp được giữ trong lịch sử.');
}
export function matchingStorageEvent(event:{key:string|null;storageArea:unknown},storage:Store|null,examId:string):boolean {
  return !!storage&&event.storageArea===storage&&(event.key===null||event.key===draftKey(examId)||event.key===HISTORY_KEY);
}
