import {allowedBtvnOrigin} from '../server/btvn/origin-policy';
import {leadRpcArgs} from '../server/lead/lead';
import {semesterSession} from '../server/semester/api';
type Req={method?:string;body?:unknown;headers?:Record<string,string|string[]|undefined>};
type Res={setHeader:(key:string,value:string)=>void;status:(n:number)=>{json:(value:unknown)=>void}};
/** Lead form đăng ký và thi thử HSA vào Supabase của trung tâm. Tắt mặc định: chỉ bật khi MTM_LEAD_ENABLED=1 và migration 073 đã áp;
 * khi tắt trả {enabled:false} để trình duyệt gửi đường EmailJS cũ, không mất lead. */
export function createLeadApi(getEnv=()=>process.env,transport:typeof fetch=fetch){return async(req:Req,res:Res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({message:'Chỉ nhận POST.'});}
 const env=getEnv(),h=req.headers??{},origin=h.origin;
 if(typeof origin!=='string'||origin!==`https://${h.host}`||!allowedBtvnOrigin(origin,env))return res.status(403).json({message:'Không gửi được đăng ký.'});
 let body:unknown=req.body;try{if(typeof body==='string')body=JSON.parse(body);}catch{return res.status(400).json({message:'Yêu cầu không hợp lệ.'});}
 const args=leadRpcArgs(body);
 if(typeof args==='string')return res.status(400).json({message:args});
 const semester=args.p_kind==='on-cuoi-ky-1',session=semesterSession(h.cookie);
 if(semester&&!session)return res.status(401).json({message:'Em đăng nhập BTVN trước khi đăng ký khóa ôn để lưu đúng tài khoản.'});
 if(semester&&env.MTM_SEMESTER_ENABLED==='0')return res.status(503).json({message:'Đăng ký khóa ôn chưa mở. Em nhắn Zalo 0967 365 413 để được hỗ trợ.'});
 if(env.MTM_LEAD_ENABLED!=='1')return res.status(200).json({enabled:false});
 try{
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Missing config');
  const url=new URL(env.SUPABASE_URL);if(url.protocol!=='https:')throw Error('HTTPS required');
  const response=await transport(url.origin+'/rest/v1/rpc/'+(semester?'mtm_hk1_register':'mtm_lead_add'),{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(semester?{...args,p_session:session}:args),signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('RPC failed');
  const data=await response.json();
  if(semester&&data?.status==='login')return res.status(401).json({message:'Phiên học sinh đã hết hạn. Em đăng nhập lại BTVN rồi gửi đăng ký.'});
  if(!data||(data.status!=='accepted'&&data.status!=='already'))throw Error('Invalid status');
  return res.status(200).json({enabled:true,status:data.status});
 }catch{return res.status(503).json({message:'Chưa gửi được đăng ký. Vui lòng thử lại hoặc nhắn Zalo 0967 365 413.'});}
};}
export default createLeadApi();
