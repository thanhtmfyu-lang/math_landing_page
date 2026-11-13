export const HISTORY_NO_DATA='Chưa có dữ liệu';
export type StaffHistoryClass={class_id:string;class_name:string};
export type StaffHistoryMode='session'|'assignment';
export type StaffHistoryQuery={mode:StaffHistoryMode;class_id?:string;name?:string;from_date:string;to_date:string;page:number;page_size:number;student_id?:string};
export type StaffHistoryHomework={assignment_id:string;title:string;score:number|null;status?:'submitted'|'pending'|'not_submitted'|string;submitted_at?:string|null;lesson_date?:string|null;due_at?:string|null};
export type StaffHistoryRow={record_id:string;student_id:string;student_name:string;display_name?:string|null;class_id:string;class_name:string;lesson_date:string;start_time?:string|null;attendance_status:string|null;attendance_source?:string|null;enrollment_status?:'active'|'former'|'transferred'|'unknown';homework:StaffHistoryHomework[]};
export type StaffHistoryPage={ok?:boolean;mode?:StaffHistoryMode;classes:StaffHistoryClass[];rows:StaffHistoryRow[];total:number;page:number;page_size:number;has_more?:boolean;generated_at?:string;score_basis?:string;score_snapshot?:string;summary?:unknown};

export function historyToday(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function defaultHistoryQuery(today=historyToday()):StaffHistoryQuery{
  const start=new Date(today+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-29);
  return {mode:'session',class_id:'',name:'',from_date:start.toISOString().slice(0,10),to_date:today,page:1,page_size:20};
}
function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
export function validateHistoryQuery(query:StaffHistoryQuery,today=historyToday()){
  if(!['session','assignment'].includes(query.mode))return 'Chọn cách xem lịch sử.';
  if(!validDate(query.from_date)||!validDate(query.to_date))return 'Chọn ngày bắt đầu và kết thúc hợp lệ.';
  if(query.from_date>query.to_date)return 'Ngày bắt đầu phải trước hoặc trùng ngày kết thúc.';
  if(query.to_date>today)return 'Chỉ tra cứu đến ngày hôm nay.';
  if(Date.parse(query.to_date)-Date.parse(query.from_date)>30*86400000)return 'Mỗi lần xem tối đa 31 ngày. Đổi khoảng ngày để xem các buổi cũ hơn.';
  if((query.name?.trim().length??0)>100)return 'Tên tìm kiếm tối đa 100 ký tự.';
  if(!Number.isInteger(query.page)||query.page<1||!Number.isInteger(query.page_size)||query.page_size<1||query.page_size>100)return 'Trang hoặc số dòng chưa hợp lệ.';
  return null;
}
export function cleanHistoryQuery(query:StaffHistoryQuery):StaffHistoryQuery{
  return {...query,class_id:query.class_id?.trim()||undefined,name:query.name?.normalize('NFC').trim()||undefined,student_id:query.student_id?.trim()||undefined};
}
export function historyRowKey(row:StaffHistoryRow){return JSON.stringify([row.student_id,row.class_id,row.lesson_date,row.record_id]);}
export function historyStudentName(row:StaffHistoryRow){return row.display_name?.trim()||row.student_name?.trim()||HISTORY_NO_DATA;}
export function historyScore(score:number|null|undefined){return typeof score==='number'&&Number.isFinite(score)?score.toLocaleString('vi-VN',{maximumFractionDigits:2}):HISTORY_NO_DATA;}
const attendance:Record<string,string>={co_mat:'Có mặt',hoc_online:'Học online',di_muon:'Đi muộn',ve_som:'Về sớm',vang_phep:'Vắng có phép',vang:'Vắng',chuyen_buoi:'Chuyển buổi',du_kien:'Dự kiến',present:'Có mặt',late:'Đi muộn',absent:'Vắng'};
export function historyAttendance(status:string|null|undefined){return status?attendance[status]??HISTORY_NO_DATA:HISTORY_NO_DATA;}
const sources:Record<string,string>={van_tay:'Vân tay',zoom:'Zoom',quan_ly:'Quản lý',phu_huynh:'Phụ huynh',hoc_sinh:'Học sinh',chuyen_buoi:'Chuyển buổi'};
export function historyAttendanceSource(source:string|null|undefined){return source?sources[source]??'':'';}
export function historyEnrollment(status:StaffHistoryRow['enrollment_status']){
  return status==='former'?'Hồ sơ lịch sử · đã nghỉ':status==='transferred'?'Hồ sơ lịch sử · đã chuyển lớp':status==='active'?'Theo hồ sơ buổi học':'Hồ sơ lịch sử';
}
export function historyScoreBasis(basis:string|undefined,mode:StaffHistoryMode){return basis==='previous_assignment_day'?'Các bài giao ở buổi trước':basis==='latest_assignment_before_session'?'Bài giao gần nhất trước buổi':mode==='assignment'?'Các bài theo ngày giao':'Điểm BTVN theo buổi';}
export function historyDate(value:string|null|undefined){return value&&validDate(value)?new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(value+'T12:00:00+07:00')):HISTORY_NO_DATA;}
export function historyDateTime(value:string|null|undefined){return value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(value)):HISTORY_NO_DATA;}
export function validateHistoryPage(value:StaffHistoryPage){
  if(!value||value.ok===false||!Array.isArray(value.rows)||!Array.isArray(value.classes)||!Number.isInteger(value.total)||value.total<0||!Number.isInteger(value.page)||value.page<1||!Number.isInteger(value.page_size)||value.page_size<1||value.page_size>100||(value.has_more!==undefined&&typeof value.has_more!=='boolean'))throw Error('Chưa nhận được bảng lịch sử hợp lệ.');
  if(value.classes.some(item=>!item||typeof item.class_id!=='string'||!item.class_id||typeof item.class_name!=='string')||value.rows.some(row=>!row||typeof row.student_id!=='string'||!row.student_id||typeof row.class_id!=='string'||!row.class_id||typeof row.lesson_date!=='string'||typeof row.record_id!=='string'||!row.record_id||!Array.isArray(row.homework)))throw Error('Chưa nhận được bảng lịch sử hợp lệ.');
  return value;
}
