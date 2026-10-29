import type {HomeworkService} from './service';
import {HomeworkError,GATE_ERROR} from './service';
import type {Answers} from '../../src/native/exams/store';
import {publicClassNames} from './class-config';
const COOKIE='mtm_btvn_demo';
/** 28/10: HS đánh dấu "Nhớ đăng nhập" thì cookie và phiên máy chủ cùng sống 30 ngày; không đánh dấu giữ 4 giờ. */
export const REMEMBER_SECONDS=30*86400;
export function homeworkCookie(token:string,secure=false,maxAge=14400){return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${token?maxAge:0}${secure?'; Secure':''}`;}
export function expireLegacyHomeworkCookie(secure=false){return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/btvn; Max-Age=0${secure?'; Secure':''}`;}
export function handleHomework(service:HomeworkService,input:{method:string;body:unknown;cookie?:string;ip:string;origin?:string;host:string;secure?:boolean}) {
  const headers:Record<string,string>={'Cache-Control':'no-store, private','Content-Type':'application/json; charset=utf-8','X-Robots-Tag':'noindex, nofollow','Vary':'Cookie'};
  try {
    if(input.method!=='POST'){headers.Allow='POST';throw new HomeworkError(405,'Chỉ nhận POST.');}
    if(input.origin&&input.origin!==`${input.secure?'https':'http'}://${input.host}`)throw new HomeworkError(403,GATE_ERROR);
    const body=input.body as Record<string,unknown>;
    if(body&&typeof body==='object'&&!Array.isArray(body)&&body.action==='classes'){
      if(Object.keys(body).length!==1)throw new HomeworkError(400,GATE_ERROR);
      return {status:200,headers,body:{classNames:publicClassNames(service.materials.flatMap(lesson=>lesson.classNames))}};
    }
    if(!body||typeof body!=='object'||(body.classKey!==undefined&&body.classKey!==service.classKey)||(body.action!=='select'&&body.lessonCode!==undefined&&body.lessonCode!==service.lessonCode&&!service.materials.some(l=>l.lessonCode===body.lessonCode)))throw new HomeworkError(404,'Không tìm thấy bài.');
    let token=(input.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)??'';
    if(body.action==='login'){token=service.login(body.gate,input.ip);headers['Set-Cookie']=homeworkCookie(token,input.secure);}
    if(body.action==='logout'){service.logout(token);headers['Set-Cookie']=homeworkCookie('',input.secure);return {status:200,headers,body:{loggedOut:true}};}
    // Mỗi request chỉ rõ bài, tránh hai tab cùng phiên làm lẫn buổi.
    if(body.action!=='login'&&body.action!=='select'&&typeof body.lessonCode==='string'&&service.materials.length)service.select(token,body.lessonCode);
    const state=body.action==='login'||body.action==='state'?service.state(token):body.action==='start'?service.start(token):body.action==='select'?service.select(token,String(body.lessonCode??'')):
      body.action==='save'||body.action==='submit'?
        (body.action==='save'?service.save(token,String(body.attemptId??''),body.answers as Answers):service.submit(token,String(body.attemptId??''),body.answers as Answers)):
        (()=>{throw new HomeworkError(400,'Yêu cầu không hợp lệ.');})();
    return {status:200,headers,body:state};
  }catch(error){return {status:error instanceof HomeworkError?error.status:503,headers,body:{message:error instanceof HomeworkError?error.message:'Chưa lưu được kết quả. Giữ trang mở và thử lại.'}};}
}
