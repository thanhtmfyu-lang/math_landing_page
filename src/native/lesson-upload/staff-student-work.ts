import type {StaffHistoryMode,StaffHistoryHomework,StaffHistoryWorkKind} from './staff-history';

export type StaffStudentWorkRequest={
  student_id:string;
  class_id:string;
  lesson_date:string;
  assignment_id:string;
  work_kind:StaffHistoryWorkKind;
  mode:StaffHistoryMode;
};

export type StaffStudentWorkAnswer={number:number;label:string;answer:string|(boolean|null)[]|null};
export type StaffStudentWorkAttempt={number:number;submitted_at:number;score:number|null;answers:StaffStudentWorkAnswer[]};
export type StaffStudentWorkData=StaffStudentWorkRequest&{
  title:string;
  status:'ready'|'not_submitted'|'not_released';
  attempts:StaffStudentWorkAttempt[];
};

export function canOpenStudentWork(item:StaffHistoryHomework){
  return item.status!=='not_released'&&(!!item.submitted_at||item.status==='submitted'||item.status==='pending');
}

const boundedIndex=(value:number,max:number)=>Number.isSafeInteger(value)&&value>0&&value<=max;
const validAnswer=(entry:StaffStudentWorkAnswer)=>
  !!entry&&boundedIndex(entry.number,300)&&typeof entry.label==='string'&&entry.label.length<=300
  &&(entry.answer===null||(typeof entry.answer==='string'&&entry.answer.length<=1000)
    ||(Array.isArray(entry.answer)&&entry.answer.length===4&&entry.answer.every(value=>typeof value==='boolean'||value===null)));

export function validateStaffStudentWork(value:unknown,request:StaffStudentWorkRequest):StaffStudentWorkData{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Chưa nhận được bài làm hợp lệ.');
  const data=value as StaffStudentWorkData;
  if(data.student_id!==request.student_id||data.class_id!==request.class_id||data.lesson_date!==request.lesson_date
    ||data.assignment_id!==request.assignment_id||data.work_kind!==request.work_kind||data.mode!==request.mode
    ||typeof data.title!=='string'||!data.title.trim()
    ||!['ready','not_submitted','not_released'].includes(data.status)||!Array.isArray(data.attempts)||data.attempts.length>20
    ||(data.status==='ready'?data.attempts.length===0:data.attempts.length!==0)
    ||(data.status==='not_released'&&request.work_kind!=='exam'))
    throw Error('Máy chủ chưa trả đúng bài làm cần xem.');
  if(data.attempts.some(attempt=>!attempt||!boundedIndex(attempt.number,100)
    ||!Number.isSafeInteger(attempt.submitted_at)||attempt.submitted_at<=0||attempt.submitted_at>253402300799999
    ||(attempt.score!==null&&(!Number.isFinite(attempt.score)||attempt.score<0||attempt.score>10))
    ||!Array.isArray(attempt.answers)||attempt.answers.length>300||!attempt.answers.every(validAnswer)))
    throw Error('Bài làm của học sinh chưa có dữ liệu hợp lệ.');
  return data;
}
