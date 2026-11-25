import type {LessonSession, UploadDashboard} from './model';

export const SELF_QA_ROUTE = '/quan-tri/len-bai?thu-btvn=1';
export const SELF_QA_PENDING = 'self-qa-btvn';

export function selfQaRequested(search:string){
  return new URLSearchParams(search).has('thu-btvn');
}

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const day=/^\d{4}-\d{2}-\d{2}$/;
const time=/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const names=/^2K(?:9|10|11) QA [A-Za-z0-9][A-Za-z0-9 -]{2,70}$/;

function onlyClass(ids:unknown,expected:string){
  return Array.isArray(ids)&&ids.length===1&&ids[0]===expected;
}

export function selfQaDashboard(data:UploadDashboard&{self_qa?:boolean}):UploadDashboard{
  if(data.self_qa!==true||!['ql','admin'].includes(data.staff.role)||data.sessions.length>1||data.uploads.length>1)throw Error('Máy chủ chưa xác nhận vùng thử riêng.');
  const session=data.sessions[0];
  if(!session){
    if(data.uploads.length)throw Error('Biên nhận bài thử chưa khớp ca.');
    return data;
  }
  if(!uuid.test(session.class_id)||!names.test(session.class_name)||!session.teacher_key||
     !day.test(session.lesson_date)||!time.test(session.start_time)||!time.test(session.end_time)||
     !onlyClass(session.class_ids,session.class_id)||
     Object.keys(session.class_dates??{}).length!==1||session.class_dates?.[session.class_id]!==session.lesson_date){
    throw Error('Máy chủ chưa xác nhận đúng lớp và buổi thử.');
  }
  for(const upload of data.uploads){
    if(!onlyClass(upload.class_ids,session.class_id)||upload.lesson_date!==session.lesson_date||
       upload.teacher_key!==session.teacher_key||upload.work_kind!=='homework'||upload.version!==1)
      throw Error('Biên nhận bài thử chưa khớp ca.');
  }
  return data;
}

export function assertSelfQaLane(data:UploadDashboard,session:LessonSession){
  const target=data.sessions[0];
  if(data.sessions.length!==1||target.class_id!==session.class_id||target.lesson_date!==session.lesson_date||
     target.teacher_key!==session.teacher_key||target.start_time!==session.start_time||target.end_time!==session.end_time){
    throw Error('Ca thử đã thay đổi. Tải lại trang trước khi gửi.');
  }
  if(data.uploads.length)throw Error('Ca thử đã nhận một BTVN. Xem trạng thái của bài đã gửi.');
}
