import {completedPercent, type LessonSession, type LessonUpload} from './model';

/** Wall-clock fields are always Vietnam time, independent of the teacher's device timezone. */
export function defaultDueLocal(session: LessonSession) {
  if(session.deadline_policy_error)return '';
  const value=session.default_due_at_by_class?.[session.class_id];
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:[Zz]|[+-]\d{2}:\d{2})$/.test(value))return '';
  const calendar=new Date(value.slice(0,10)+'T00:00:00Z');
  if(!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,10)!==value.slice(0,10))return '';
  const due=Date.parse(value);
  return Number.isFinite(due)?new Date(due+7*3600000).toISOString().slice(0,16):'';
}

export function dueLocalToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw Error('Chọn ngày và giờ hạn nộp hợp lệ.');
  const date = new Date(`${value}:00+07:00`);
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime()+7*3600000).toISOString().slice(0,16)!==value) throw Error('Ngày hạn nộp không hợp lệ.');
  return date.toISOString();
}

export function uploadTitle(title: string, filenames: string[], session: LessonSession) {
  if (title.trim()) return title.trim().normalize('NFC').slice(0,200);
  const stem=filenames[0]?.normalize('NFC').replace(/\.[^.]+$/, '').trim();
  const generic=!!stem&&/^(?:(?:img|image|scan|photo|screenshot|anh|ảnh|zalo)[_\s.\d()-]*|[\d_\s.-]{6,})$/i.test(stem);
  const filename = generic?'':stem?.replace(/[\u0000-\u001f\u007f]/g,'').replace(/[_]+/g, ' ').trim();
  return (filename || `BTVN ${session.class_name} · ${session.lesson_date}`).slice(0,200);
}

export function uploadState(upload: LessonUpload) {
  const steps = [...upload.steps, ...(upload.homework2_uploaded ? upload.paper2_steps ?? [] : [])];
  const issue = steps.find(s=>s.status==='loi') ?? steps.find(s=>s.status==='canh_bao');
  if (issue) return {label:'Cần kiểm tra', detail:issue.detail || 'AI cần đối chiếu thêm trước khi giao bài.', state:'issue' as const};
  const complete = completedPercent(upload.steps)===100 && (!upload.homework2_uploaded || completedPercent(upload.paper2_steps??[])===100);
  const started=steps.some(s=>s.step>=2&&(s.status==='dang'||s.status==='xong'));
  return complete
    ? {label:'Đã giao bài cho lớp', detail:'Đề đã hoàn tất xử lý và giao bài.', state:'complete' as const}
    : {label:started?'AI đang xử lý':'Đã nhận, chờ AI xử lý', detail:steps.find(s=>s.status==='dang')?.detail || 'Bài sẽ được giao sau khi kiểm tra xong.', state:'processing' as const};
}
