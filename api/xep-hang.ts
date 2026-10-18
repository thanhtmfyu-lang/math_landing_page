import {publicArena,publicRankRow,validRankFilter} from '../server/btvn/rank-row';
type Req={method?:string;query?:Record<string,string|string[]|undefined>};
type Res={setHeader:(key:string,value:string)=>void;status:(n:number)=>{json:(value:unknown)=>void}};
export function createRankApi(getEnv=()=>process.env,transport:typeof fetch=fetch){return async(req:Req,res:Res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({message:'Chỉ nhận GET.'});}
 const env=getEnv();
 if(env.MTM_RANK_ENABLED!=='1')return res.status(200).json({enabled:false,rows:[]});
 if(req.query?.['dau-truong']==='1'){
  const kind=req.query?.loai;
  if(typeof kind!=='string'||!['btvn-tuan','btvn-thang','kiem-tra-thang'].includes(kind))return res.status(400).json({message:'Bộ lọc không hợp lệ.'});
  try{
   if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Missing config');
   const url=new URL(env.SUPABASE_URL);if(url.protocol!=='https:')throw Error('HTTPS required');
   const response=await transport(url.origin+'/rest/v1/rpc/mtm_btvn_arena',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_kind:kind}),signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('RPC failed');
   let arena=publicArena(await response.json());
   // gon=1 (dải vinh danh đầu mọi trang): chỉ nhà vô địch, không ảnh, tải rất nhẹ.
   if(req.query?.gon==='1')arena={...arena,cohorts:arena.cohorts.map(c=>({...c,top:c.top.slice(0,10).filter((r,i)=>i<3||r.score>=10).map(r=>({...r,photo:null})),classes:c.classes.map(k=>({...k,top:k.top.slice(0,1).map(r=>({...r,photo:null}))}))}))};
   // Bộ đệm CDN 5 giây: đông người xem chỉ gọi kho tối đa 1 lần/5 giây; hạng của em (POST) không đệm.
   res.setHeader('Cache-Control','public, s-maxage=5, stale-while-revalidate=10');
   return res.status(200).json({enabled:true,...arena});
  }catch{return res.status(503).json({message:'Chưa tải được bảng xếp hạng. Vui lòng thử lại.'});}
 }
 const cohort=req.query?.khoi,kind=req.query?.loai;
 const cls=req.query?.lop;
 if(!validRankFilter(cohort,kind,cls))return res.status(400).json({message:'Bộ lọc không hợp lệ.'});
 try{
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Missing config');
  const url=new URL(env.SUPABASE_URL);if(url.protocol!=='https:')throw Error('HTTPS required');
  const response=await transport(url.origin+'/rest/v1/rpc/mtm_btvn_leaderboard_class',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_cohort:cohort,p_kind:kind,p_class:cls??null}),signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('RPC failed');
  const data=await response.json();
  if(!Array.isArray(data)||data.length>10)throw Error('Invalid rows');
  // Ánh xạ rõ từng trường, không chuyển nguyên RPC ra công khai.
  const rows=data.map(r=>publicRankRow(r,10));
  // Điểm, hạng và hồ sơ phải đọc bản mới sau nộp; phía trình duyệt gộp
  // request trùng và chỉ polling 45 giây khi tab đang hiển thị.
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({enabled:true,rows});
 }catch{return res.status(503).json({message:'Chưa tải được bảng xếp hạng. Vui lòng thử lại.'});}
};}
export default createRankApi();
