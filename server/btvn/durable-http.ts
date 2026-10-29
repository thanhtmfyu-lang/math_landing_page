import {SupabaseHomeworkRepository} from './supabase-repository';
import {HomeworkError,GATE_ERROR} from './service';
import {homeworkCookie,REMEMBER_SECONDS} from './http';
import type {GateInput} from '../../src/native/homework/btvn-contract';
/** Factory để Claude gắn transport đã kiểm. api/btvn.ts giữ đóng đến nghiệm thu.
 * Cookie chỉ server đọc; origin bắt buộc và proxy phải được platform kiểm. */
export function createDurableHomeworkHandler(repo:SupabaseHomeworkRepository){return async(input:{method:string;body:unknown;cookie?:string;origin?:string;host:string;secure?:boolean})=>{
  const headers:Record<string,string>={'Cache-Control':'no-store, private','Content-Type':'application/json; charset=utf-8','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow'};
  try{
    if(input.method!=='POST')throw new HomeworkError(405,'Chỉ nhận POST.');
    if(input.origin!==`${input.secure?'https':'http'}://${input.host}`)throw new HomeworkError(403,GATE_ERROR);
    const body=input.body as Record<string,unknown>;
    if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>524288)throw new HomeworkError(400,GATE_ERROR);
    const action=body.action;
    if(action==='classes'){
      if(Object.keys(body).length!==1)throw new HomeworkError(400,GATE_ERROR);
      return {status:200,headers,body:{classNames:await repo.classNames()}};
    }
    if(!['login','logout','state','select','start','save','submit'].includes(String(action)))throw new HomeworkError(400,GATE_ERROR);
    if(body.lessonCode!==undefined&&(typeof body.lessonCode!=='string'||! /^[a-z0-9-]{1,160}$/.test(body.lessonCode)))throw new HomeworkError(400,GATE_ERROR);
    const allowed=['action','classKey','lessonCode',...(action==='login'?['gate','remember']:action==='save'||action==='submit'?['attemptId','answers']:[])];
    if(Object.keys(body).some(k=>!allowed.includes(k)))throw new HomeworkError(400,GATE_ERROR);
    let session=(input.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('mtm_btvn_demo='))?.slice(14)??'';
    const details:{classMismatch?:boolean}={};
    if(action==='login'){
      if(body.remember!==undefined&&typeof body.remember!=='boolean')throw new HomeworkError(400,GATE_ERROR);
      session=await repo.login(body.gate as GateInput,details);
      // Kéo phiên lên 30 ngày lỗi thì vẫn cho vào bài với phiên 4 giờ như cũ.
      const remembered=body.remember===true&&await repo.remember(session).catch(()=>false);
      headers['Set-Cookie']=homeworkCookie(session,input.secure,remembered?REMEMBER_SECONDS:undefined);
    }
    if(!/^[0-9a-f]{64}$/.test(session))throw new HomeworkError(401,GATE_ERROR);
    if(action==='logout'){await repo.logout(session);headers['Set-Cookie']=homeworkCookie('',input.secure);return {status:200,headers,body:{loggedOut:true}};}
    const state=await repo.call(session,action==='login'?'state':action as 'state'|'select'|'start'|'save'|'submit',body.lessonCode as string|undefined,body.attemptId as string|undefined,body.answers as any);
    return {status:200,headers,body:action==='login'?{...state,...details}:state};
  }catch(error){return {status:error instanceof HomeworkError?error.status:503,headers,body:{message:error instanceof HomeworkError?error.message:'Chưa lưu được. Giữ trang mở và thử lại.'}};}
};}
