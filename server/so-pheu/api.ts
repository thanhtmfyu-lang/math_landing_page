import {createHmac,timingSafeEqual} from 'node:crypto';
// W6/W9: số phễu chỉ đọc cho Javis. Gọi: GET /api/exam?muc=so-pheu&tu=YYYY-MM-DD&den=YYYY-MM-DD, header x-mtm-khoa.
// Khóa = MTM_SO_PHEU_KEY nếu đặt ở Vercel; chưa đặt thì = HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY,'mtm-so-pheu-v1') dạng hex,
// để Javis (đã giữ service role) tự tính được mà không cần thêm biến. Chỉ trả số tổng, không tên/SĐT.
type Req={method?:string;query?:Record<string,string|string[]|undefined>;headers:Record<string,string|string[]|undefined>};
type Res={setHeader:(k:string,v:any)=>void;status:(n:number)=>{json:(v:unknown)=>void}};
type Env=Record<string,string|undefined>;
export const khoaSoPheu=(env:Env)=>env.MTM_SO_PHEU_KEY||(env.SUPABASE_SERVICE_ROLE_KEY?createHmac('sha256',env.SUPABASE_SERVICE_ROLE_KEY).update('mtm-so-pheu-v1').digest('hex'):'');
const ngayVn=(ms:number)=>new Date(ms+7*3600000).toISOString().slice(0,10);
const ISO=/^\d{4}-\d{2}-\d{2}$/;
export function createSoPheuApi(getEnv:()=>Env=()=>process.env as Env,transport:typeof fetch=fetch,now=()=>Date.now()){return async(req:Req,res:Res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.method!=='GET')return res.status(405).json({message:'Chỉ nhận GET.'});
 const env=getEnv(),khoa=khoaSoPheu(env),gui=req.headers['x-mtm-khoa'];
 if(!khoa||!env.SUPABASE_URL)return res.status(503).json({message:'Chưa cấu hình.'});
 const a=Buffer.from(typeof gui==='string'?gui:''),b=Buffer.from(khoa);
 if(a.length!==b.length||!timingSafeEqual(a,b))return res.status(401).json({message:'Sai khóa.'});
 const q=(k:string)=>{const v=req.query?.[k];return typeof v==='string'?v:'';};
 const den=q('den')||ngayVn(now()),tu=q('tu')||ngayVn(Date.parse(den+'T00:00:00Z')-13*864e5);
 if(!ISO.test(tu)||!ISO.test(den)||Number.isNaN(Date.parse(tu))||Number.isNaN(Date.parse(den))||den<tu||Date.parse(den)-Date.parse(tu)>366*864e5)return res.status(400).json({message:'tu/den là YYYY-MM-DD, den không trước tu, tối đa 366 ngày.'});
 try{
  const url=new URL(env.SUPABASE_URL);if(url.protocol!=='https:')throw Error();
  const r=await transport(url.origin+'/rest/v1/rpc/mtm_pt_so_pheu',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY!,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_tu:tu,p_den:den}),signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error();return res.status(200).json(await r.json());
 }catch{return res.status(503).json({message:'Chưa đọc được số.'});}
};}
