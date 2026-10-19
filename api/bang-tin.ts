import {allowedBtvnOrigin} from '../server/btvn/origin-policy';
// Bảng tin trung tâm (19/10/2026): bài đã duyệt từ ảnh nhóm Zalo, chỉ trả khi phiên BTVN hợp lệ.
// Ảnh nằm ở bucket riêng tư mtm-bang-tin, trả link ký 1 giờ. Tắt (MTM_BANG_TIN_ENABLED khác 1) thì web chỉ hiện bài cố định.
type Req={method?:string;body?:unknown;headers?:Record<string,string|string[]|undefined>};
type Res={setHeader:(key:string,value:string)=>void;status:(n:number)=>{json:(value:unknown)=>void}};
type Row={id:string;kind:string;title:string;date:string;summary:string;place:string|null;pinned:boolean;photos:{path:string;alt:string;width:number|null;height:number|null}[]|null};
const PATH=/^[0-9]{4}-[0-9]{2}\/[0-9a-f]{64}\.(jpg|png|webp)$/;
export function createBoardApi(getEnv=()=>process.env,transport:typeof fetch=fetch){return async(req:Req,res:Res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('Vary','Cookie');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({message:'Chỉ nhận POST.'});}
 const env=getEnv(),h=req.headers??{},origin=h.origin;
 if(typeof origin!=='string'||origin!==`https://${h.host}`||!allowedBtvnOrigin(origin,env))return res.status(403).json({message:'Không thể xem bảng tin.'});
 const cookie=typeof h.cookie==='string'?h.cookie:'',session=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('mtm_btvn_demo='))?.slice(14)??'';
 if(!/^[0-9a-f]{64}$/.test(session))return res.status(401).json({message:'Em cần đăng nhập để xem bảng tin.'});
 if(env.MTM_BANG_TIN_ENABLED!=='1')return res.status(200).json({enabled:false,posts:[]});
 try{
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error();const url=new URL(env.SUPABASE_URL);if(url.protocol!=='https:')throw Error();
  const auth={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
  const response=await transport(url.origin+'/rest/v1/rpc/mtm_bang_tin_doc',{method:'POST',headers:auth,body:JSON.stringify({p_session:session}),signal:AbortSignal.timeout(8000)});
  if(!response.ok){if(response.status===401||response.status===403)return res.status(401).json({message:'Em cần đăng nhập lại.'});throw Error();}
  const rows=(await response.json()) as Row[];if(!Array.isArray(rows))throw Error();
  const paths=[...new Set(rows.flatMap(r=>(r.photos??[]).map(p=>p.path)).filter(p=>PATH.test(p)))];
  const signed=new Map<string,string>();
  if(paths.length){
   const sign=await transport(url.origin+'/storage/v1/object/sign/mtm-bang-tin',{method:'POST',headers:auth,body:JSON.stringify({expiresIn:3600,paths}),signal:AbortSignal.timeout(8000)});
   if(!sign.ok)throw Error();
   for(const item of (await sign.json()) as {path?:string;signedURL?:string|null}[])if(item.path&&item.signedURL)signed.set(item.path,url.origin+'/storage/v1'+item.signedURL);
  }
  const posts=rows.map(r=>({id:r.id,kind:r.kind,title:r.title,date:r.date,summary:r.summary??'',place:r.place??undefined,pinned:r.pinned===true,
   photos:(r.photos??[]).filter(p=>signed.has(p.path)).map(p=>({url:signed.get(p.path)!,alt:p.alt,width:p.width??undefined,height:p.height??undefined}))})).filter(p=>p.photos.length);
  return res.status(200).json({enabled:true,posts});
 }catch{return res.status(503).json({message:'Chưa tải được bảng tin.'});}
};}
export default createBoardApi();
