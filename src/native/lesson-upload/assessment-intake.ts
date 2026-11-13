import type {LessonSession} from './model';

/** Business type; deliberately unrelated to the server's is_test QA flag. */
export type AssessmentWorkKind='homework'|'exam';
export type AssessmentExamType='monthly'|'custom';
export type AssessmentExamConfig={opens_at:string;closes_at:string;duration_minutes:number};
export type AssessmentIntakeInput={
  work_kind?:unknown;exam_type?:unknown;assessment_id?:unknown;title:unknown;task_scope?:unknown;
  class_ids:unknown;has_answer:boolean;has_second_paper?:boolean;exam_config?:unknown;
};
type BaseIntake={title:string;task_scope:string};
export type HomeworkAssessmentIntake=BaseIntake&{work_kind:'homework'};
export type ExamAssessmentIntake=BaseIntake&{work_kind:'exam';exam_type:AssessmentExamType;assessment_id:string;exam_config:AssessmentExamConfig};
export type AssessmentIntake=HomeworkAssessmentIntake|ExamAssessmentIntake;
export const ASSESSMENT_FULL_SCOPE='Toàn bộ đề';
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const reject=(message:string):never=>{throw Error(message);};

export function normalizeWorkKind(value:unknown):AssessmentWorkKind{
  if(value===undefined)return 'homework';
  if(value==='homework'||value==='exam')return value;
  return reject('Chọn BTVN hoặc đề kiểm tra hợp lệ.');
}
export function assessmentPublishKind(value:unknown):'btvn'|'kiem-tra'{
  return normalizeWorkKind(value)==='exam'?'kiem-tra':'btvn';
}
export function normalizeExamType(value:unknown):AssessmentExamType{
  if(value===undefined)return 'monthly';
  if(value==='monthly'||value==='custom')return value;
  return reject('Chọn kiểm tra kết thúc tháng hoặc loại kiểm tra tự đặt.');
}
export function sanitizeAssessmentTitle(value:unknown){
  if(typeof value!=='string')return reject('Điền tên bài trước khi lên bài.');
  const title=value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
  if(!title)return reject('Điền tên bài trước khi lên bài.');
  if(title.length>200)return reject('Tên bài tối đa 200 ký tự.');
  return title;
}
function timestamp(value:unknown){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:[Zz]|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/.test(value))return reject('Chọn thời gian mở và đóng bài có múi giờ hợp lệ.');
  const day=value.slice(0,10),date=new Date(day+'T00:00:00Z'),time=Date.parse(value);
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day||!Number.isFinite(time))return reject('Ngày mở hoặc đóng bài không hợp lệ.');
  return new Date(time).toISOString();
}
export function normalizeExamConfig(value:unknown):AssessmentExamConfig{
  if(!value||typeof value!=='object'||Array.isArray(value))return reject('Chọn thời gian và thời lượng làm bài kiểm tra.');
  const config=value as Record<string,unknown>,keys=Object.keys(config).sort();
  if(keys.join('|')!=='closes_at|duration_minutes|opens_at')return reject('Cấu hình kiểm tra chưa hợp lệ.');
  const opens_at=timestamp(config.opens_at),closes_at=timestamp(config.closes_at),duration_minutes=config.duration_minutes;
  if(!Number.isInteger(duration_minutes)||typeof duration_minutes!=='number'||duration_minutes<1||duration_minutes>240)return reject('Thời lượng kiểm tra phải là số nguyên từ 1 đến 240 phút.');
  const window=Date.parse(closes_at)-Date.parse(opens_at);
  if(window<=0||duration_minutes*60000>window)return reject('Giờ đóng phải sau giờ mở và đủ thời lượng làm bài.');
  return {opens_at,closes_at,duration_minutes};
}
/** The authenticated dashboard's per-class values win; no end-of-month date is guessed. */
export function defaultExamConfig(session:Pick<LessonSession,'lesson_date'|'start_time'|'end_time'>&{exam_defaults?:unknown}):AssessmentExamConfig{
  if(session.exam_defaults!==undefined)return normalizeExamConfig(session.exam_defaults);
  const validTime=(time:string)=>/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time);
  if(!validTime(session.start_time)||!validTime(session.end_time))return reject('Chưa có giờ học hợp lệ để đặt lịch kiểm tra.');
  const opens_at=timestamp(`${session.lesson_date}T${session.start_time}+07:00`);
  let closes=Date.parse(timestamp(`${session.lesson_date}T${session.end_time}+07:00`));
  if(session.end_time<session.start_time)closes+=86400000;
  const minutes=Math.floor((closes-Date.parse(opens_at))/60000);
  return normalizeExamConfig({opens_at,closes_at:new Date(closes).toISOString(),duration_minutes:Math.min(120,minutes)});
}
/** Returns only immutable request metadata; never rewrites an existing pending payload. */
export function normalizeAssessmentIntake(input:AssessmentIntakeInput):AssessmentIntake{
  const work_kind=normalizeWorkKind(input.work_kind),title=sanitizeAssessmentTitle(input.title);
  if(input.task_scope!==undefined&&typeof input.task_scope!=='string')return reject('Phạm vi bài tập chưa hợp lệ.');
  const scope=(input.task_scope as string|undefined)?.normalize('NFC').trim()??'';
  if(scope.length>300)return reject('Phần cần làm tối đa 300 ký tự.');
  if(!Array.isArray(input.class_ids)||!input.class_ids.length||input.class_ids.some(id=>typeof id!=='string'||!id)||new Set(input.class_ids).size!==input.class_ids.length)return reject('Chọn lớp học hợp lệ.');
  if(typeof input.has_answer!=='boolean'||(input.has_second_paper!==undefined&&typeof input.has_second_paper!=='boolean'))return reject('Trạng thái tệp đề và đáp án chưa hợp lệ.');
  if(work_kind==='homework'){
    if(input.exam_type!==undefined||input.assessment_id!==undefined||input.exam_config!==undefined)return reject('BTVN không dùng cấu hình đề kiểm tra.');
    return {work_kind,title,task_scope:scope};
  }
  if(input.class_ids.length!==1||!uuid.test(input.class_ids[0]))return reject('Mỗi đề kiểm tra chỉ giao cho một lớp được chọn.');
  if(typeof input.assessment_id!=='string'||!uuid.test(input.assessment_id))return reject('Mã đề kiểm tra chưa hợp lệ. Giữ mã cũ khi gửi lại cùng đề.');
  if(!input.has_answer)return reject('Gửi đáp án cùng đề kiểm tra để AI đối chiếu đúng phiên bản.');
  if(input.has_second_paper)return reject('Mỗi đề kiểm tra dùng một tệp đề; tạo đề khác nếu cần thêm đề.');
  return {work_kind,title,task_scope:scope||ASSESSMENT_FULL_SCOPE,exam_type:normalizeExamType(input.exam_type),assessment_id:input.assessment_id,exam_config:normalizeExamConfig(input.exam_config)};
}
