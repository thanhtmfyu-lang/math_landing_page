import {createClient} from '@supabase/supabase-js';
import {requireBackend,safeConfig} from '../admin/backend';
import {StaffAccessError} from './backend';
export type StaffPasswordProfile={user_id:string;short_name:string;display_name:string;role:'gv'|'ql'|'admin';must_change_password:boolean;recovery_ready?:boolean};
export async function passwordProfile(owner:string):Promise<StaffPasswordProfile>{
 const b=requireBackend(),{data:{user},error}=await b.auth.getUser();
 if(error||user?.id!==owner)throw new StaffAccessError('Phiên đăng nhập đã thay đổi.');
 const result=await b.rpc('mtm_lesson_staff');
 if((await b.auth.getSession()).data.session?.user.id!==owner)throw new StaffAccessError('Phiên đăng nhập đã thay đổi.');
 if(result.error||result.data?.user_id!==owner)throw new StaffAccessError('Tài khoản chưa được cấp quyền nhân sự.');
 return result.data;
}
export async function changeStaffPassword(owner:string,password:string){
 if(password.length<12)throw Error('Mật khẩu cần ít nhất 12 ký tự.');
 await passwordProfile(owner);
 const b=requireBackend(),{data:{session}}=await b.auth.getSession();
 if(session?.user.id!==owner)throw new StaffAccessError('Phiên đăng nhập đã thay đổi.');
 const config=safeConfig({VITE_MTM_SUPABASE_URL:import.meta.env.VITE_MTM_SUPABASE_URL,VITE_MTM_SUPABASE_PUBLISHABLE_KEY:import.meta.env.VITE_MTM_SUPABASE_PUBLISHABLE_KEY});
 if(!config)throw Error('Chưa có kết nối máy chủ.');
 // Bind the Auth write to the captured account, even if another tab signs in
 // before this request completes. Never persist the isolated client's session.
 const captured=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const bound=await captured.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
 if(bound.error||bound.data.user?.id!==owner)throw new StaffAccessError('Phiên đăng nhập đã thay đổi.');
 const {error}=await captured.auth.updateUser({password});
 if(error)throw Error('Chưa đổi được mật khẩu. Dùng mật khẩu mới khác mật khẩu cũ, đủ mạnh, hoặc mở lại email khôi phục.');
 // Re-read the server flag. Never clear it from browser-controlled metadata.
 const profile=await passwordProfile(owner);
 if(profile.must_change_password)throw Error('Máy chủ chưa xác nhận đã đổi mật khẩu. Chưa thể mở cổng.');
 return profile;
}
export async function staffRoster(owner:string):Promise<StaffPasswordProfile[]>{
 await passwordProfile(owner);const b=requireBackend(),result=await b.rpc('mtm_staff_password_roster');
 if((await b.auth.getSession()).data.session?.user.id!==owner)throw new StaffAccessError('Phiên đăng nhập đã thay đổi.');
 if(result.error||!Array.isArray(result.data))throw new StaffAccessError('Cần tài khoản quản lý đã hoàn tất đổi mật khẩu.');
 return result.data;
}
export async function requestStaffReset(owner:string,targetId:string){
 const b=requireBackend(),{data:{session}}=await b.auth.getSession();
 if(session?.user.id!==owner)throw new StaffAccessError('Phiên đăng nhập đã thay đổi.');
 const response=await fetch('/api/exam?muc=staff-password',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action:'reset',targetId})});
 const body=await response.json();
 if((await b.auth.getSession()).data.session?.user.id!==owner)throw new StaffAccessError('Phiên đăng nhập đã thay đổi.');
 if(!response.ok)throw Error(body.message||'Chưa gửi được email đặt lại mật khẩu.');
 return body.message as string;
}
/** Consume recovery tokens only on the dedicated route, remove them immediately. */
export async function acceptPasswordRecovery(){
 const hash=new URLSearchParams(location.hash.slice(1));history.replaceState(history.state,'',location.pathname);
 if(hash.get('error')||hash.get('error_code'))throw Error('Liên kết khôi phục đã hết hạn hoặc không hợp lệ. Nhờ quản lý gửi lại.');
 if(hash.get('type')!=='recovery'||!hash.get('access_token')||!hash.get('refresh_token'))throw Error('Mở liên kết đặt lại từ email của chính tài khoản.');
 const b=requireBackend();await b.auth.signOut({scope:'local'});
 const result=await b.auth.setSession({access_token:hash.get('access_token')!,refresh_token:hash.get('refresh_token')!});
 if(result.error||!result.data.user)throw Error('Liên kết khôi phục đã hết hạn hoặc không hợp lệ. Nhờ quản lý gửi lại.');
 try{await passwordProfile(result.data.user.id);}catch(error){await b.auth.signOut({scope:'local'});throw error;}
 return result.data.user.id;
}
