import {publicRankRow,validRankFilter} from '../server/btvn/rank-row';
import {allowedBtvnOrigin} from '../server/btvn/origin-policy';
type Req={method?:string;body?:unknown;headers?:Record<string,string|string[]|undefined>};
type Res={setHeader:(key:string,value:string)=>void;status:(n:number)=>{json:(value:unknown)=>void}};
export function createMyRankApi(getEnv=()=>process.env,transport:typeof fetch=fetch){return async(req:Req,res:Res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('Vary','Cookie');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({message:'Chỉ nhận POST.'});}
 const env=getEnv(),h=req.headers??{},origin=h.origin,body=req.body as Record<string,unknown>;
 if(typeof origin!=='string'||origin!==`https://${h.host}`||!allowedBtvnOrigin(origin,env))return res.status(403).json({message:'Không thể xem hạng.'});
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['khoi','loai','lop'].includes(k))||!validRankFilter(body.khoi,body.loai,body.lop))return res.status(400).json({message:'Bộ lọc không hợp lệ.'});
 const cookie=typeof h.cookie==='string'?h.cookie:'',session=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('mtm_btvn_demo='))?.slice(14)??'';
 if(!/^[0-9a-f]{64}$/.test(session))return res.status(401).json({message:'Em cần đăng nhập BTVN.'});
 if(env.MTM_RANK_ENABLED!=='1'||env.MTM_BTVN_ENABLED!=='1')return res.status(200).json({enabled:false,row:null});
 try{
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error();const url=new URL(env.SUPABASE_URL);if(url.protocol!=='https:')throw Error();
  const response=await transport(url.origin+'/rest/v1/rpc/mtm_btvn_my_rank_real100',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_session:session,p_cohort:body.khoi,p_kind:body.loai,p_class:body.lop??null}),signal:AbortSignal.timeout(8000)});
  if(!response.ok){if(response.status===401||response.status===403)return res.status(401).json({message:'Em cần đăng nhập lại BTVN.'});throw Error();}
  const data=await response.json();return res.status(200).json({enabled:true,row:data===null?null:publicRankRow(data)});
 }catch{return res.status(503).json({message:'Chưa tải được hạng của em.'});}
};}
export default createMyRankApi();
