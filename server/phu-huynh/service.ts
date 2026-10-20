import {homeworkLessonCard} from '../btvn/lesson-card';
import {visibleThiThangCards} from '../btvn/thi-thang';
import {publicClassNames} from '../btvn/class-config';
import type {HomeworkLesson,LessonMaterial} from '../../src/native/homework/btvn-contract';
import type {ParentChild,ParentReport,ParentHomework,ParentAttendance,ParentPaper} from '../../src/native/phu-huynh/contract';

/** Góc phụ huynh (20/10). Mọi quyền PH→HS kiểm trong Postgres (mtm_ph_*); máy chủ web không tin mã học sinh
 * từ trình duyệt. Dữ liệu BTVN đọc lại đúng nguồn học sinh dùng (mtm_btvn_read) bằng phiên tạm 2 phút của con. */
export type Rpc=(name:string,args:Record<string,unknown>)=>Promise<unknown>;
export class ParentError extends Error{constructor(public status:number,message:string){super(message);}}
export const PH_COOKIE='mtm_ph';
export const PH_GATE='Thông tin chưa khớp sổ trung tâm. Phụ huynh kiểm tra lại, hoặc nhắn Zalo 0967 365 413 để được cập nhật.';
export const PH_LOGIN='Số điện thoại hoặc mã PIN chưa đúng.';
export const PH_LOCKED='Nhập sai quá nhiều lần. Phụ huynh chờ 15 phút rồi thử lại, hoặc nhắn Zalo 0967 365 413.';
export const PH_SESSION='Phiên đã hết hạn. Phụ huynh đăng nhập lại.';
export function parentCookie(token:string,secure=true){return `${PH_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${token?2592000:0}${secure?'; Secure':''}`;}
export function parentSession(cookie:string){return cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(PH_COOKIE+'='))?.slice(PH_COOKIE.length+1)??'';}

const phone=(v:unknown)=>typeof v==='string'&&v.length<=20?v:null;
const text=(v:unknown,max=160)=>typeof v==='string'&&v.trim().length>=1&&v.length<=max?v:null;
const pin=(v:unknown)=>typeof v==='string'&&/^[0-9]{6}$/.test(v)?v:null;
const ATTENDED=new Set(['co_mat','hoc_online','di_muon','ve_som']);
export const ATTENDANCE_LABEL:Record<string,string>={co_mat:'Có mặt',hoc_online:'Học online',di_muon:'Đi muộn',ve_som:'Về sớm',vang_phep:'Vắng có phép',vang:'Vắng',chuyen_buoi:'Học bù buổi khác'};

function pinResult(r:any,setupOk=true){
 if(r?.pin==='locked')throw new ParentError(423,PH_LOCKED);
 if(r?.pin==='setup'&&setupOk)throw new ParentError(428,'PIN_SETUP');
 if(r?.pin==='required')throw new ParentError(428,'PIN_REQUIRED');
 if(r?.pin==='weak')throw new ParentError(422,'Mã PIN quá dễ đoán. Phụ huynh chọn 6 số khác, không dùng 123456 hay 6 số giống nhau.');
 if(r?.pin==='wrong')throw new ParentError(401,r.remaining===undefined?PH_LOGIN:'Sai mã PIN. Còn '+Number(r.remaining)+' lần thử trước khi bị khoá 15 phút.');
 if(r?.ok!==true||typeof r.session!=='string'||!/^[0-9a-f]{64}$/.test(r.session))throw new ParentError(401,PH_GATE);
 return r.session as string;
}

export async function parentLink(rpc:Rpc,body:Record<string,unknown>,net:string){
 const args={p_parent_phone:phone(body.parentPhone),p_parent_name:body.parentName===undefined||body.parentName===''?null:text(body.parentName),p_child_name:text(body.childName),p_child_phone:phone(body.childPhone),p_class_name:text(body.className),p_pin:body.pin===undefined?null:pin(body.pin),p_new_pin:body.newPin===undefined?null:pin(body.newPin),p_net:net};
 if(!args.p_parent_phone||!args.p_child_name||!args.p_child_phone||!args.p_class_name||(body.parentName!==undefined&&body.parentName!==''&&!args.p_parent_name))throw new ParentError(401,PH_GATE);
 if(body.newPin!==undefined&&!args.p_new_pin)throw new ParentError(422,'Mã PIN gồm đúng 6 chữ số.');
 return pinResult(await rpc('mtm_ph_link',args));
}
export async function parentLogin(rpc:Rpc,body:Record<string,unknown>,net:string){
 const p=phone(body.parentPhone),code=pin(body.pin);
 if(!p||!code)throw new ParentError(401,PH_LOGIN);
 const r:any=await rpc('mtm_ph_login',{p_parent_phone:p,p_pin:code,p_net:net});
 if(r?.pin==='wrong')throw new ParentError(401,PH_LOGIN);
 return pinResult(r,false);
}
export async function parentChildren(rpc:Rpc,session:string):Promise<{parentName:string|null;children:ParentChild[]}>{
 const r:any=await rpc('mtm_ph_children',{p_session:session});
 return {parentName:typeof r?.parentName==='string'?r.parentName:null,children:(Array.isArray(r?.children)?r.children:[]).map((c:any)=>({id:String(c.id),fullName:String(c.fullName),className:String(c.className)}))};
}

/** Gom số liệu một con. Không trả SĐT, học phí, tên hay điểm học sinh khác. */
export async function parentReport(rpc:Rpc,session:string,childId:unknown,now=Date.now()):Promise<ParentReport>{
 if(typeof childId!=='string'||!/^[0-9a-f-]{36}$/i.test(childId))throw new ParentError(400,'Chưa chọn con.');
 const {children,parentName}=await parentChildren(rpc,session);
 const child=children.find(c=>c.id===childId);
 if(!child)throw new ParentError(403,'Không xem được học sinh này.');
 const token=await rpc('mtm_ph_child_session',{p_session:session,p_student_id:childId}) as string;
 let lessons:HomeworkLesson[]=[],rank:ParentReport['rank']=null;
 try{
  const snap:any=await rpc('mtm_btvn_read',{p_session:token,p_lesson:null});
  const className=String(snap?.work?.student?.className??child.className),fullName=String(snap?.work?.student?.fullName??child.fullName);
  const visible=visibleThiThangCards((Array.isArray(snap?.lessons)?snap.lessons:[]) as HomeworkLesson[],fullName,className);
  // Tiến độ từng buổi lấy từ chính thẻ snapshot (điểm cao nhất, lúc nộp, hạn do RPC tính cho mọi buổi), giống trang BTVN của học sinh.
  // work chỉ chứa biên nhận của buổi đang chọn, không có work.lessons, nên không dựng lại tiến độ từ work.
  lessons=visible.map(l=>{const c=l as HomeworkLesson&{expectedDueAt?:number|null};
   return homeworkLessonCard(l as LessonMaterial,className,now,{dueAt:c.dueAt??c.expectedDueAt??null,bestScore:typeof c.bestScore==='number'?c.bestScore:c.bestScore==null?null:Number(c.bestScore),late:c.late??null,submittedAt:c.submittedAt??null,available:false});
  });
  const cohort=/^2K1?[0-9]/i.exec(className)?.[0].toUpperCase();
  if(cohort)try{
   const row:any=await rpc('mtm_btvn_my_rank',{p_session:token,p_cohort:cohort,p_kind:'btvn-thang',p_class:className});
   if(row&&Number.isSafeInteger(row.rank)&&row.rank>=1)rank={rank:row.rank,score:typeof row.score==='number'?row.score:null,submitted:Number.isSafeInteger(row.submitted)?row.submitted:null,total:Number.isSafeInteger(row.total)?row.total:null};
  }catch{/* Hạng là phần phụ: lỗi không chặn báo cáo. */}
 }finally{await rpc('mtm_btvn_logout',{p_session:token}).catch(()=>undefined);}
 const extras:any=await rpc('mtm_ph_extras',{p_session:session,p_student_id:childId});
 const homework:ParentHomework[]=lessons.filter(l=>l.kind!=='kiem-tra-thang'||!l.locked).map(l=>({
  lessonCode:l.lessonCode,title:l.homeworkTitle||l.title,date:l.date,kind:l.kind??'btvn',dueAt:l.dueAt,bestScore:l.bestScore,submittedAt:l.submittedAt,late:l.late===true,
  status:l.submittedAt?(l.late?'muon':'da-nop'):l.locked?'chua-mo':(l.dueAt!==null&&l.dueAt<now?'qua-han':'chua-nop')}));
 const attendance:ParentAttendance[]=(Array.isArray(extras?.attendance)?extras.attendance:[]).filter((a:any)=>typeof a?.date==='string'&&ATTENDANCE_LABEL[a.status]).map((a:any)=>({date:a.date,status:a.status,label:ATTENDANCE_LABEL[a.status]}));
 const papers:ParentPaper[]=(Array.isArray(extras?.papers)?extras.papers:[]).filter((p:any)=>typeof p?.testCode==='string').map((p:any)=>({testCode:p.testCode,date:p.date??null,subject:p.subject??null,score:Number(p.score),maxScore:p.maxScore===null||p.maxScore===undefined?10:Number(p.maxScore)}));
 return {parentName,children,child,generatedAt:now,upcoming:typeof extras?.upcoming==='string'?extras.upcoming:null,attendance,homework,papers,rank,summary:summarize(homework,attendance,now)};
}

/** Tổng quan: tỉ lệ đi học tháng này, tỉ lệ nộp, điểm TB; 3 chủ đề tốt nhất, 3 chủ đề cần luyện (theo điểm cao nhất từng buổi). */
export function summarize(homework:ParentHomework[],attendance:ParentAttendance[],now:number):ParentReport['summary']{
 const month=new Date(now+7*3600e3).toISOString().slice(0,7);
 const monthRows=attendance.filter(a=>a.date.startsWith(month)&&a.status!=='chuyen_buoi');
 const due=homework.filter(h=>h.kind!=='kiem-tra-thang'&&h.status!=='chua-mo'&&(h.submittedAt!==null||h.status==='qua-han'));
 const scored=homework.filter(h=>h.kind!=='kiem-tra-thang'&&typeof h.bestScore==='number');
 const byScore=[...scored].sort((a,b)=>(b.bestScore!-a.bestScore!)||(b.date<a.date?-1:1));
 const pick=(h:ParentHomework)=>({lessonCode:h.lessonCode,title:h.title,date:h.date,score:h.bestScore!});
 const strong=byScore.filter(h=>h.bestScore!>=7).slice(0,3).map(pick);
 const weak=[...scored].sort((a,b)=>(a.bestScore!-b.bestScore!)||(b.date<a.date?-1:1)).filter(h=>h.bestScore!<8&&!strong.some(s=>s.lessonCode===h.lessonCode)).slice(0,3).map(pick);
 return {
  monthAttendance:monthRows.length?{attended:monthRows.filter(a=>ATTENDED.has(a.status)).length,total:monthRows.length}:null,
  submitted:due.filter(h=>h.submittedAt!==null).length,dueTotal:due.length,
  averageScore:scored.length?Math.round(scored.reduce((s,h)=>s+h.bestScore!,0)/scored.length*100)/100:null,
  strong,weak,missing:homework.filter(h=>h.status==='qua-han').slice(0,5).map(h=>({lessonCode:h.lessonCode,title:h.title,date:h.date}))};
}

export async function parentClasses(rpc:Rpc){return publicClassNames(await rpc('mtm_btvn_classes',{}));}
