import type {LessonUpload, UploadDashboard} from './model';
import {uploadProgress} from './upload-progress';

type Outcome = 'published' | 'held';
type Observed = 'pending' | Outcome;
export type UploadOutcome = {key:string; status:Outcome; title:string; detail:string};
export type OutcomeLedger = {observedAt:number; jobs:Record<string,Observed>};

const MAX_JOBS = 256;
const JOB_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TERMINAL_HOLDS = new Set(['needs_input', 'retry_exhausted', 'exhausted']);
export const emptyOutcomeLedger: OutcomeLedger = {observedAt:0, jobs:{}};

function jobKey(id:string, version:number) {
  return JOB_ID.test(id) && Number.isSafeInteger(version) && version >= 1 ? `${id}|${version}` : null;
}

export function readOutcomeLedger(raw:string|null):OutcomeLedger {
  if (!raw) return emptyOutcomeLedger;
  try {
    const parsed = JSON.parse(raw);
    if (!Number.isFinite(parsed?.observedAt) || parsed.observedAt < 0 || !parsed.jobs || Array.isArray(parsed.jobs)) {
      return emptyOutcomeLedger;
    }
    const jobs = Object.entries(parsed.jobs).filter(([key, value]) => {
      const [id, version] = key.split('|');
      return jobKey(id, Number(version)) === key && (value === 'pending' || value === 'published' || value === 'held');
    }).slice(-MAX_JOBS);
    return {observedAt:parsed.observedAt, jobs:Object.fromEntries(jobs) as OutcomeLedger['jobs']};
  } catch {
    return emptyOutcomeLedger;
  }
}

export function trackAcceptedUpload(ledger:OutcomeLedger, id:string, version:number):OutcomeLedger {
  const key = jobKey(id, version);
  if (!key || ledger.jobs[key]) return ledger;
  return {...ledger, jobs:Object.fromEntries([...Object.entries(ledger.jobs), [key, 'pending' as const]].slice(-MAX_JOBS))};
}

function observedStatus(upload:LessonUpload):Observed {
  const retry = upload.retry;
  if (retry && (retry.status === 'published' || retry.status === 'complete') && uploadProgress(upload).published) {
    return 'published';
  }
  if (retry?.can_retry === false && TERMINAL_HOLDS.has(retry.status)) return 'held';
  return 'pending';
}

/** Only announce a terminal transition from the authenticated server dashboard. */
export function observeUploadOutcomes(ledger:OutcomeLedger, dashboard:UploadDashboard) {
  const notices:UploadOutcome[] = [];
  const observedAt = Date.parse(dashboard.server_now ?? '');
  if (!Number.isFinite(observedAt) || observedAt <= 0 || observedAt < ledger.observedAt) return {ledger, notices};
  const jobs = new Map(Object.entries(ledger.jobs));
  for (const upload of dashboard.uploads) {
    if (upload.is_current !== true || upload.retry?.status === 'superseded') continue;
    const key = jobKey(upload.id, upload.version);
    if (!key) continue;
    const previous = jobs.get(key);
    if (previous === 'published' || previous === 'held') continue;
    const status = observedStatus(upload);
    jobs.delete(key);
    jobs.set(key, status);
    const createdAt = Date.parse(upload.created_at);
    const receivedSincePriorRead = !previous && ledger.observedAt > 0 && createdAt > ledger.observedAt && createdAt <= observedAt;
    if (status === 'pending' || (previous !== 'pending' && !receivedSincePriorRead)) continue;
    const exam = upload.work_kind === 'exam';
    const title = `${status === 'published' ? (exam ? 'Đề kiểm tra đã sẵn sàng' : 'Đã giao BTVN') : 'AI đã dừng xử lý'} · ${upload.title}`;
    const detail = status === 'held' ? upload.retry?.reason || 'Xem trạng thái bài để biết chi tiết.' : '';
    notices.push({key, status, title, detail});
  }
  return {ledger:{observedAt, jobs:Object.fromEntries([...jobs].slice(-MAX_JOBS))}, notices};
}
