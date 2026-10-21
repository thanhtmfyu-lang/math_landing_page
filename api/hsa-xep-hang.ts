import {createHash} from 'node:crypto';
import {isExposedExam,PRACTICE_ONLY_NOTICE} from '../server/exam-security/exposure';
import {allowedBtvnOrigin} from '../server/btvn/origin-policy';
import {HSA_SUBMIT_STATUS,HSA_TOP_LIMIT,hsaNameKey,isHsaGrade,publicHsaRow,sanitizeDisplayName,validHsaExamId,type HsaSubmitStatus} from '../server/hsa/rank';
type Req={method?:string;query?:Record<string,string|string[]|undefined>;body?:unknown;headers?:Record<string,string|string[]|undefined>};
type Res={setHeader:(key:string,value:string)=>void;status:(n:number)=>{json:(value:unknown)=>void}};
/** Bảng xếp hạng Thi thử HSA. Tắt mặc định: chỉ bật khi MTM_HSA_RANK_ENABLED=1 và migration 069 đã áp.
 * GET ?de=<examId>: top 50 công khai. POST: ghi lượt máy chủ đã chấm (attemptId + attemptToken), không nhận điểm từ trình duyệt. */
export function createHsaRankApi(getEnv=()=>process.env,transport:typeof fetch=fetch){return async(req:Req,res:Res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method!=='GET'&&req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({message:'Chỉ nhận GET hoặc POST.'});}
 const env=getEnv();
 const rpc=async(name:string,args:Record<string,unknown>)=>{
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Missing config');
  const url=new URL(env.SUPABASE_URL);if(url.protocol!=='https:')throw Error('HTTPS required');
  return transport(url.origin+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});
 };
 if(req.method==='GET'){
  const exam=req.query?.de;
  if(!validHsaExamId(exam))return res.status(400).json({message:'Đề không hợp lệ.'});
  if(isExposedExam(exam))return res.status(200).json({enabled:false,open:false,rows:[],practiceOnly:true,message:PRACTICE_ONLY_NOTICE});
  if(env.MTM_HSA_RANK_ENABLED!=='1')return res.status(200).json({enabled:false,open:false,rows:[]});
  try{
   const response=await rpc('mtm_hsa_rank_top',{p_exam:exam,p_limit:HSA_TOP_LIMIT});if(!response.ok)throw Error('RPC failed');
   const data=await response.json();if(!data||typeof data.open!=='boolean'||!Array.isArray(data.rows)||data.rows.length>HSA_TOP_LIMIT)throw Error('Invalid top');
   // Ánh xạ từng trường; một dòng cũ không qua bộ lọc tên hiện tại thì bỏ dòng đó, không làm hỏng cả bảng.
   const rows=data.rows.flatMap((r:unknown)=>{try{return [publicHsaRow(r,HSA_TOP_LIMIT)];}catch{return [];}});
   res.setHeader('Cache-Control','public, s-maxage=15, stale-while-revalidate=30');
   return res.status(200).json({enabled:true,open:data.open,rows});
  }catch{return res.status(503).json({message:'Chưa tải được bảng xếp hạng. Vui lòng thử lại.'});}
 }
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Robots-Tag','noindex, nofollow');
 const h=req.headers??{},origin=h.origin;
 if(typeof origin!=='string'||origin!==`https://${h.host}`||!allowedBtvnOrigin(origin,env))return res.status(403).json({message:'Không thể ghi bảng xếp hạng.'});
 let body:any=req.body;try{if(typeof body==='string')body=JSON.parse(body);}catch{return res.status(400).json({message:'Yêu cầu không hợp lệ.'});}
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['de','attemptId','attemptToken','name','grade','device'].includes(k))
  ||!validHsaExamId(body.de)||typeof body.attemptId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.attemptId)
  ||typeof body.attemptToken!=='string'||!/^[a-f0-9]{64}$/.test(body.attemptToken)||!isHsaGrade(body.grade)||typeof body.device!=='string'||!/^[a-f0-9]{32,64}$/.test(body.device))return res.status(400).json({message:'Yêu cầu không hợp lệ.'});
 const name=sanitizeDisplayName(body.name);
 if(!name)return res.status(400).json({message:'Tên hiển thị chưa phù hợp. Em chọn tên khác (2–24 ký tự, không số điện thoại hay đường dẫn).'});
 if(isExposedExam(body.de))return res.status(200).json({enabled:false,status:'closed',rank:null,practiceOnly:true,message:PRACTICE_ONLY_NOTICE});
 if(env.MTM_HSA_RANK_ENABLED!=='1')return res.status(200).json({enabled:false});
 try{
  // Chỉ lưu băm của mã thiết bị theo từng đề; mã gốc không rời API.
  const device=createHash('sha256').update(body.de+':'+body.device).digest('hex');
  const response=await rpc('mtm_hsa_rank_submit',{p_exam:body.de,p_attempt:body.attemptId,p_token:body.attemptToken,p_name:name,p_name_key:hsaNameKey(name),p_grade:body.grade,p_device_hash:device});
  if(!response.ok){if(response.status===401||response.status===403)return res.status(403).json({message:'Không xác minh được lượt thi này.'});throw Error('RPC failed');}
  const data=await response.json();
  if(!data||!HSA_SUBMIT_STATUS.includes(data.status))throw Error('Invalid status');
  const rank=Number.isSafeInteger(data.rank)&&data.rank>0?data.rank as number:null;
  return res.status(200).json({enabled:true,status:data.status as HsaSubmitStatus,rank,name});
 }catch{return res.status(503).json({message:'Chưa ghi được bảng xếp hạng. Vui lòng thử lại.'});}
};}
export default createHsaRankApi();
