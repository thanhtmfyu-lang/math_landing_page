import {createClient} from '@supabase/supabase-js';

type Req={method?:string;headers:Record<string,string|string[]|undefined>;body?:unknown};
type Res={setHeader:(key:string,value:string)=>void;status:(code:number)=>{json:(value:unknown)=>void}};
const redirectTo='https://minhthanhmath.vn/quan-tri/doi-mat-khau';
/** No password or recovery link is created in this process or returned to the manager. */
export function createStaffPasswordApi(getEnv=()=>process.env,clientFactory=createClient){
 return async(req:Req,res:Res)=>{
  res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Vary','Authorization');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({message:'Chỉ nhận POST.'});}
  const origin=req.headers.origin;
  if(typeof origin!=='string'||origin!==`https://${req.headers.host}`||!['https://minhthanhmath.vn','https://www.minhthanhmath.vn'].includes(origin))return res.status(403).json({message:'Không thể gửi từ trang này.'});
  let body:any=req.body;try{if(typeof body==='string')body=JSON.parse(body);}catch{body=null;}
  if(!body||Array.isArray(body)||body.action!=='reset'||typeof body.targetId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.targetId)||Object.keys(body).some(k=>!['action','targetId'].includes(k)))return res.status(400).json({message:'Yêu cầu không hợp lệ.'});
  const authorization=req.headers.authorization;
  if(typeof authorization!=='string'||!/^Bearer \S+$/.test(authorization)||authorization.length>8192)return res.status(401).json({message:'Cần đăng nhập quản lý.'});
  const env=getEnv();if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return res.status(503).json({message:'Chưa có kết nối khôi phục mật khẩu.'});
  try{
   if(!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(env.SUPABASE_URL))throw Error('Invalid server');
   const db=clientFactory(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,flowType:'implicit'},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(8000)})}});
   const {data:{user},error}=await db.auth.getUser(authorization.slice(7));
   if(error||!user)return res.status(401).json({message:'Phiên đăng nhập hết hạn.'});
   const target=await db.rpc('mtm_staff_password_reset_target',{p_actor:user.id,p_target:body.targetId});
   if(target.error){
    if(target.error.message==='RESET_RATE_LIMIT')return res.status(429).json({message:'Chờ một phút trước khi gửi lại.'});
    if(target.error.message==='REGISTERED_EMAIL_REQUIRED')return res.status(409).json({message:'Hồ sơ chưa có email khôi phục đã xác minh khớp với tài khoản Auth. Liên hệ người quản lý hồ sơ nhân sự.'});
    return res.status(403).json({message:'Tài khoản chưa được phép đặt lại mật khẩu cho nhân sự này.'});
   }
   if(typeof target.data?.email!=='string'||!target.data.email.includes('@'))throw Error('Invalid recipient');
   const sent=await db.auth.resetPasswordForEmail(target.data.email,{redirectTo});
   if(sent.error)return res.status(sent.error.status===429?429:503).json({message:'Chưa xác nhận được yêu cầu gửi email. Tài khoản vẫn cần đổi mật khẩu; kiểm tra kênh gửi trước khi thử lại.'});
   return res.status(200).json({message:'Máy chủ đã nhận yêu cầu gửi email đặt lại cho nhân sự. Người nhận kiểm tra hộp thư, kể cả thư rác.'});
  }catch{return res.status(503).json({message:'Chưa xác nhận được yêu cầu gửi email. Kiểm tra lại trước khi thử lại.'});}
 };
}
