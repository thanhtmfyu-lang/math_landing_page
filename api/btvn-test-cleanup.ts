import {createClient} from '@supabase/supabase-js';
import {cleanupTestStudent} from '../server/btvn/test-cleanup';
import {allowedBtvnOrigin} from '../server/btvn/origin-policy';
type Req={method?:string;headers?:Record<string,string|string[]|undefined>;body?:unknown};
type Res={setHeader:(k:string,v:string)=>void;status:(s:number)=>{json:(v:unknown)=>void}};
export function createCleanupApi(getEnv=()=>process.env){return async(req:Req,res:Res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({message:'Chỉ nhận POST.'});}
 const h=req.headers??{},env=getEnv(),auth=h.authorization,origin=h.origin;
 if(typeof origin!=='string'||!allowedBtvnOrigin(origin,env))return res.status(403).json({message:'Nguồn yêu cầu không hợp lệ.'});
 if(typeof auth!=='string'||!/^Bearer [A-Za-z0-9._-]+$/.test(auth))return res.status(401).json({message:'Cần phiên quản trị.'});
 let body:any;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({message:'Dữ liệu không hợp lệ.'});}
 if(!body||Object.keys(body).length!==1||!Object.hasOwn(body,'studentId'))return res.status(400).json({message:'Chỉ nhận studentId.'});
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.MTM_HOMEWORK_PUBLISHABLE_KEY)return res.status(503).json({message:'Chưa cấu hình nơi dọn bài thử.'});
 try{
  const config={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  const admin=createClient(env.SUPABASE_URL,env.MTM_HOMEWORK_PUBLISHABLE_KEY,{...config,global:{headers:{Authorization:auth}}});
  // SQL checks auth.uid(), existing admin membership AND student owner before Storage.
  const storage=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,config);
  const r=await cleanupTestStudent({rpc:(name,args)=>admin.rpc(name,args),remove:(bucket,paths)=>storage.storage.from(bucket).remove(paths)},body.studentId);
  return res.status(r.status).json(r.body);
 }catch{return res.status(503).json({message:'Chưa dọn được bài thử.'});}
};}
export default createCleanupApi();
