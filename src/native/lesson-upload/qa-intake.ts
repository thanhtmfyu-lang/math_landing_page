import type {LessonSession,UploadDashboard} from './model';

/** Explicit manager-only test view. Server roles and is_test checks remain authoritative. */
export const QA_INTAKE=Object.freeze({classId:'1ad4fa98-367b-474e-91d2-5d6ed12687b0',classLabel:'2K10 QA iPhone 1611',lessonDate:'2026-11-17',teacherKey:'thaythanh',start:'00:10',end:'00:11',pendingScope:'qa-intake-1811' as const});
export function qaIntakeRequested(search:string){const values=new URLSearchParams(search).getAll('qa');return values.length===1&&values[0]==='1';}
export function lessonDashboardRequest(qa=false){return qa?{action:'dashboard',is_test:true,from:QA_INTAKE.lessonDate,to:QA_INTAKE.lessonDate}:{action:'dashboard'};}
const onlyClass=(ids:unknown)=>Array.isArray(ids)&&ids.length===1&&ids[0]===QA_INTAKE.classId;
export function assertQaIntakeSession(session:LessonSession){
 if(session.class_id!==QA_INTAKE.classId||session.lesson_date!==QA_INTAKE.lessonDate||session.teacher_key!==QA_INTAKE.teacherKey||session.start_time.slice(0,5)!==QA_INTAKE.start||session.end_time.slice(0,5)!==QA_INTAKE.end||!onlyClass(session.class_ids??[session.class_id])||(session.class_dates&&(Object.keys(session.class_dates).length!==1||session.class_dates[QA_INTAKE.classId]!==QA_INTAKE.lessonDate)))throw Error('Chế độ QA chỉ được gửi cho lớp thử và ca17/11 đã tách riêng.');
}
export function scopeQaIntakeDashboard(data:UploadDashboard&{assessment_protocol?:number;classes?:{id?:string}[]}):UploadDashboard{
 if(!['ql','admin'].includes(data.staff.role)||data.assessment_protocol!==110)throw Error('Chế độ QA cần tài khoản quản lý và giao thức kiểm tra hiện hành.');
 const sessions=data.sessions.filter(s=>s.class_id===QA_INTAKE.classId&&s.lesson_date===QA_INTAKE.lessonDate&&s.teacher_key===QA_INTAKE.teacherKey);sessions.forEach(assertQaIntakeSession);
 const uploads=data.uploads.filter(u=>u.class_ids.includes(QA_INTAKE.classId)&&(u.class_dates?.[QA_INTAKE.classId]??u.lesson_date)===QA_INTAKE.lessonDate&&u.teacher_key===QA_INTAKE.teacherKey);
 if(uploads.some(u=>!onlyClass(u.class_ids)))throw Error('Bài QA đang kéo theo lớp khác; cần đối soát trước.');
 const result={...data,sessions,uploads,teachers:data.teachers.filter(t=>t.teacher_key===QA_INTAKE.teacherKey),publisher_warnings:data.publisher_warnings?.filter(w=>w.class_id===QA_INTAKE.classId&&w.lesson_date===QA_INTAKE.lessonDate)};
 if('classes'in result){const classes=(data as UploadDashboard&{classes?:{id?:string}[]}).classes;(result as typeof result&{classes:unknown[]}).classes=Array.isArray(classes)?classes.filter(c=>c.id===QA_INTAKE.classId):[];}
 return result;
}
export function qaIntakePayload(payload:Record<string,unknown>){
 if(!onlyClass(payload.class_ids)||payload.lesson_date!==QA_INTAKE.lessonDate||payload.teacher_key!==QA_INTAKE.teacherKey||payload.on_behalf_of!==QA_INTAKE.teacherKey||payload.__qa_asset_state!==undefined)throw Error('Biên nhận QA chưa đủ tệp hoặc sai lớp/ca; chưa gửi máy chủ.');
 return {...payload,is_test:true};
}
export function assertQaIntakeFreshLane(data:UploadDashboard,session:LessonSession,mode:'homework'|'exam'){
 const scoped=scopeQaIntakeDashboard(data);assertQaIntakeSession(session);
 if(scoped.sessions.length!==1||scoped.sessions[0].class_id!==session.class_id||scoped.sessions[0].lesson_date!==session.lesson_date||scoped.sessions[0].teacher_key!==session.teacher_key)throw Error('Máy chủ chưa xác nhận ca QA; chưa tải tệp lên.');
 if(scoped.uploads.some(u=>(u.work_kind??'homework')===mode))throw Error('Máy chủ đã nhận loại bài QA này từ phiên khác; đối soát trước, không gửi bản mới.');
}
const PDF_PINS={homework:[{bytes:81877,sha:'e2fe65f403848efaea4107344d146df6569982341d28d2e519895750769315c1'},{bytes:83048,sha:'4483bba0413729dcd45909f510b299a025e59a4aeb7d7129b5efa9abaaf72643'}],exam:[{bytes:82567,sha:'188d65f0deaac2b99f6d938f3b160e7e9ef72fbf09d0fc4c1151e0785a4ee0d7'},{bytes:83889,sha:'1748fca8c9a1931be6e5cbd4dec6528a9d22a7990e47822e19f493f495d71b60'}]};
/** This one-off QA view cannot accidentally upload another class's source files. */
export async function assertQaIntakeFiles(mode:'homework'|'exam',files:{homework:File[];answer:File[]}){
 for(const [i,kind] of (['homework','answer'] as const).entries()){
  const file=files[kind][0],pin=PDF_PINS[mode][i];if(files[kind].length!==1||!file||file.type!=='application/pdf'||file.size!==pin.bytes)throw Error('QA cần đúng hai PDF nguồn đã kiểm: đề học sinh và đáp án giáo viên.');
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer()),sha=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');if(sha!==pin.sha)throw Error('PDF QA không khớp SHA nguồn đã khóa; chưa tải tệp lên.');
 }
}
