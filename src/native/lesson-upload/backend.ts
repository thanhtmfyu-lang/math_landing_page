import {createClient} from '@supabase/supabase-js';
import {requireBackend,safeConfig,loginEmail} from '../admin/backend';
import type {UploadDashboard} from './model';
import {LessonSubmitError} from './submission-receipt';
export {LessonSubmitError} from './submission-receipt';
export class StaffAccessError extends Error{}
/** A captured access token keeps a delayed request from using another staff member's session. */
async function staffRequest(expectedOwner:string){
 const b=requireBackend(),{data:{session},error}=await b.auth.getSession();if(error||!session||session.user.id!==expectedOwner)throw new StaffAccessError('Phiên đăng nhập đã đổi. Đăng nhập lại trước khi lên bài.');
 const config=safeConfig({VITE_MTM_SUPABASE_URL:import.meta.env.VITE_MTM_SUPABASE_URL,VITE_MTM_SUPABASE_PUBLISHABLE_KEY:import.meta.env.VITE_MTM_SUPABASE_PUBLISHABLE_KEY});if(!config)throw Error('Chưa có kết nối cổng giáo viên.');
 const client=createClient(config.url,config.key,{accessToken:async()=>session.access_token,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const {data:{user},error:userError}=await b.auth.getUser(session.access_token);if(userError||user?.id!==expectedOwner)throw new StaffAccessError('Phiên đăng nhập hết hạn. Đăng nhập lại để tiếp tục.');
 const assertOwner=async()=>{const current=await b.auth.getSession();if(current.data.session?.user.id!==expectedOwner)throw Error('Tài khoản đã thay đổi. Dữ liệu cũ không được đưa sang tài khoản mới.');};
 await assertOwner();return {client,assertOwner};
}
export async function staffSignIn(name:string,password:string){const {error}=await requireBackend().auth.signInWithPassword({email:loginEmail(name),password});if(error)throw Error(error.status===429?'Đăng nhập đang bị giới hạn. Vui lòng thử lại sau.':'Tên đăng nhập hoặc mật khẩu chưa đúng, hoặc chưa kết nối được máy chủ.');}
export async function lessonDashboard(owner:string):Promise<UploadDashboard>{const {client,assertOwner}=await staffRequest(owner),r=await client.rpc('mtm_lesson_upload_api',{p:{action:'dashboard'}});await assertOwner();if(r.error){if(r.error.code==='42501'||r.error.code==='PGRST301')throw new StaffAccessError('Tài khoản chưa được cấp quyền hoặc phiên đăng nhập đã hết hạn.');throw Error('Chưa tải được lịch và tiến độ. Kiểm tra tài khoản được cấp quyền hoặc thử lại.');}if(!r.data?.staff||!['gv','ql','admin'].includes(r.data.staff.role)||r.data.staff.user_id!==owner)throw new StaffAccessError('Tài khoản chưa được cấp quyền giáo viên/quản lý.');return r.data as UploadDashboard;}
export async function uploadLessonFile(owner:string,batch:string,kind:string,file:File){const {client,assertOwner}=await staffRequest(owner),path=`${owner}/${batch}/${kind}.pdf`;const r=await client.storage.from('mtm-lesson-private').upload(path,file,{contentType:'application/pdf',upsert:false});await assertOwner();if(r.error)throw Error('Chưa tải được tệp riêng tư. Các tệp đã chọn vẫn được giữ để thử lại.');return path;}
export async function submitLesson(owner:string,payload:Record<string,unknown>){
 const {client,assertOwner}=await staffRequest(owner);
 let r;
 try{r=await client.rpc('mtm_lesson_upload_api',{p:{action:'create',...payload}});}
 catch{throw new LessonSubmitError('Chưa nhận được xác nhận của máy chủ. Gửi lại cùng yêu cầu để kiểm tra, không tạo bản khác.','unknown');}
 try{await assertOwner();}catch{throw new LessonSubmitError('Tài khoản đã thay đổi trong lúc gửi. Đăng nhập lại đúng tài khoản để kiểm tra bản vừa gửi.','unknown');}
 if(r.error){
  if(!r.error.code)throw new LessonSubmitError('Kết nối bị gián đoạn khi lưu bài. Gửi lại cùng yêu cầu để kiểm tra.','unknown');
  const messages:Record<string,string>={
   FULL_HOMEWORK_REUPLOAD_REQUIRED:'Bản BTVN trước đang xử lý. Gửi lại đủ đề và đáp án cùng học liệu bổ sung.',
   HOMEWORK_REQUIRED_WITH_ANSWERS:'Gửi đáp án cùng đề BTVN để AI đối chiếu đúng phiên bản.',
   INVALID_HOMEWORK_DEADLINE:'Hạn nộp chưa hợp lệ. Chọn thời điểm sau giờ kết thúc buổi học.',
   CLASS_SCOPE_MISMATCH:'Lớp hoặc hạn nộp chưa khớp lịch được phân quyền. Tải lại lịch để kiểm tra.',
   CLIENT_REQUEST_CONFLICT:'Yêu cầu này đã được lưu với nội dung khác. Cần kiểm tra lịch sử trước khi gửi bản mới.',
   INVALID_CLIENT_REQUEST_ID:'Mã yêu cầu chưa hợp lệ. Cần tải lại và kiểm tra lịch sử trước khi gửi.',
  };
  throw new LessonSubmitError(messages[r.error.message]??'Chưa lưu được buổi học. Kiểm tra lớp, buổi, giáo viên và phần cần làm rồi thử lại.',r.error.message==='CLIENT_REQUEST_CONFLICT'?'unknown':'rejected');
 }
 if(r.data?.ok!==true||typeof r.data?.upload_id!=='string'||!Number.isInteger(r.data?.version))throw new LessonSubmitError('Máy chủ chưa trả biên nhận hợp lệ. Gửi lại cùng yêu cầu để kiểm tra.','unknown');
 return r.data as {ok:true;upload_id:string;version:number;already_received?:boolean;due_at_by_class?:Record<string,string>};
}
