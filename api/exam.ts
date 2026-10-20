import {createClient} from '@supabase/supabase-js';
import {createPhongThiApi} from '../server/phong-thi/api';
type Req={method?:string;query?:Record<string,string|string[]|undefined>;headers:Record<string,string|string[]|undefined>;body?:unknown};
type Res={setHeader:(k:string,v:any)=>void;status:(n:number)=>{json:(v:unknown)=>void}};
export function createExamApi(getEnv=()=>process.env,clientFactory=createClient){return async(req:Req,res:Res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.method!=='POST')return res.status(405).json({message:'Chỉ nhận POST.'});
 const origin=req.headers.origin,host=req.headers.host;
 if(typeof origin!=='string'||typeof host!=='string'||origin!==`https://${host}`||!['https://minhthanhmath.vn','https://www.minhthanhmath.vn'].includes(origin))return res.status(403).json({message:'Không thể mở tài liệu.'});
 let body:any=req.body;try{if(typeof body==='string')body=JSON.parse(body);}catch{return res.status(400).json({message:'Yêu cầu không hợp lệ.'});}
 if(!body||body.action!=='solutionPdf'||typeof body.attemptId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.attemptId)||typeof body.attemptToken!=='string'||!/^[a-f0-9]{64}$/.test(body.attemptToken)||Object.keys(body).some(k=>!['action','attemptId','attemptToken'].includes(k)))return res.status(400).json({message:'Yêu cầu không hợp lệ.'});
 const env=getEnv();if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return res.status(503).json({message:'Chưa kết nối được kho tài liệu.'});
 try{
  const db=clientFactory(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const access=await db.rpc('mtm_exam_pdf_access',{p_attempt:body.attemptId,p_token:body.attemptToken,p_kind:'solutions'});
  if(access.error||!access.data)return res.status(403).json({message:'Cần nộp bài trước khi mở lời giải.'});
  if(!access.data.path)return res.status(404).json({message:'Đề này có lời giải theo từng câu sau khi nộp.'});
  const signed=await db.storage.from('mtm-exams').createSignedUrl(access.data.path,120);
  if(signed.error||!signed.data)return res.status(503).json({message:'Chưa mở được tài liệu.'});
  return res.status(200).json({url:signed.data.signedUrl});
 }catch{return res.status(503).json({message:'Chưa mở được tài liệu.'});}
};}
/** Vercel Hobby chỉ cho 12 hàm mỗi lần deploy: /api/phong-thi được rewrite về đây (?muc=phong-thi), xem server/phong-thi/api.ts. */
const exam=createExamApi(),phongThi=createPhongThiApi();
export default function handler(req:Req,res:Res){return req.query?.muc==='phong-thi'?phongThi(req,res):exam(req,res);}
