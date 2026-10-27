import {ESSAY_BUCKET} from './tu-luan';

type Rpc=(name:string,args:Record<string,unknown>)=>PromiseLike<{data:any;error:any}>;
export type CleanupPort={rpc:Rpc;remove:(bucket:string,paths:string[])=>PromiseLike<{error:any}>};
/** RPC uses the administrator's JWT, NEVER service_role. Only Storage removal
 * uses service credentials. All paths come from the owner-scoped SQL plan. */
export async function cleanupTestStudent(port:CleanupPort,studentId:unknown){
 if(typeof studentId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId))return {status:400,body:{message:'Mã tài khoản thử không hợp lệ.'}};
 studentId=studentId.toLowerCase();
 try{
  const prepared=await port.rpc('mtm_test_cleanup_prepare100',{p_student:studentId});
  if(prepared.error)return {status:prepared.error.code==='42501'?403:503,body:{message:'Không được dọn tài khoản này.'}};
  const plan=prepared.data;
  if(!plan||typeof plan.jobId!=='string'||!Array.isArray(plan.paths)||plan.paths.some((p:unknown)=>typeof p!=='string'||p.split('/')[1]?.toLowerCase()!==studentId||p.includes('..')))throw Error('Invalid cleanup plan');
  if(!plan.finished)for(let at=0;at<plan.paths.length;at+=100){
   const removed=await port.remove(ESSAY_BUCKET,plan.paths.slice(at,at+100));
   if(removed.error)throw Error('Storage unavailable');
  }
  const finished=await port.rpc('mtm_test_cleanup_finish100',{p_job:plan.jobId});
  if(finished.error)throw Error('Cleanup not complete');
  return {status:200,body:finished.data};
 }catch{return {status:503,body:{message:'Chưa dọn xong. Tài khoản thử đã khóa; chạy lại cùng tài khoản để tiếp tục.'}};}
}
