import {allowedBtvnOrigin} from '../server/btvn/origin-policy';
import {boardKey,localBoardPosts} from '../server/bang-tin/local';
// Bảng tin trung tâm (19/10/2026): bài đã duyệt từ ảnh nhóm Zalo, chỉ trả khi phiên BTVN hợp lệ.
// Quy tắc anh Thành chốt 19/10 17:45: ảnh, video lớp công khai trên trang chủ để marketing. Khách chưa đăng nhập nhận ảnh
// đóng gói không đánh dấu "public": false (chuẩn fanpage: không cận mặt riêng một em).
// Hai nguồn: ảnh thật đóng gói mã hóa trong kho (server/bang-tin, cần MTM_BANG_TIN_KEY) và bucket riêng tư mtm-bang-tin
// từ nhóm Zalo (cần MTM_BANG_TIN_ENABLED=1 + migration 071). Mọi link ảnh ký, sống 1 giờ. Thiếu cả hai thì web chỉ hiện bài cố định.
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
 const key=boardKey(env),signedIn=/^[0-9a-f]{64}$/.test(session),zalo=env.MTM_BANG_TIN_ENABLED==='1';
 if(!key&&!zalo)return signedIn?res.status(200).json({enabled:false,posts:[]}):res.status(401).json({message:'Em cần đăng nhập để xem bảng tin.'});
 // 20/10: bài từ ảnh Zalo chỉ có trạng thái "da-dang" sau khi anh Thành trả lời "duyệt" (Javis gọi Edge duyet), nên trả cho cả khách
 // như ảnh đóng gói. Lỗi đọc Supabase không làm mất ảnh đóng gói trong kho.
 let remote:ReturnType<typeof toPosts>=[];
 if(zalo)try{
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error();const url=new URL(env.SUPABASE_URL);if(url.protocol!=='https:')throw Error();
  const auth={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
  const response=await transport(url.origin+'/rest/v1/rpc/mtm_bang_tin_doc',{method:'POST',headers:auth,body:'{}',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error();
  const rows=(await response.json()) as Row[];if(!Array.isArray(rows))throw Error();
  remote=toPosts(rows,await signPaths(url.origin,auth,rows,transport));
 }catch{if(!key)return res.status(503).json({message:'Chưa tải được bảng tin.'});}
 const local=key?localBoardPosts(key,Date.now(),!signedIn):[];
 return res.status(200).json({enabled:true,public:!signedIn,posts:[...remote.filter(r=>!local.some(l=>l.id===r.id)),...local]});
};}
async function signPaths(origin:string,auth:Record<string,string>,rows:Row[],transport:typeof fetch){
 const paths=[...new Set(rows.flatMap(r=>(r.photos??[]).map(p=>p.path)).filter(p=>PATH.test(p)))];
 const signed=new Map<string,string>();
 if(!paths.length)return signed;
 const sign=await transport(origin+'/storage/v1/object/sign/mtm-bang-tin',{method:'POST',headers:auth,body:JSON.stringify({expiresIn:3600,paths}),signal:AbortSignal.timeout(8000)});
 if(!sign.ok)throw Error();
 for(const item of (await sign.json()) as {path?:string;signedURL?:string|null}[])if(item.path&&item.signedURL)signed.set(item.path,origin+'/storage/v1'+item.signedURL);
 return signed;
}
function toPosts(rows:Row[],signed:Map<string,string>){
 return rows.map(r=>({id:r.id,kind:r.kind,title:r.title,date:r.date,summary:r.summary??'',place:r.place??undefined,pinned:r.pinned===true,
  photos:(r.photos??[]).filter(p=>signed.has(p.path)).map(p=>({url:signed.get(p.path)!,alt:p.alt,width:p.width??undefined,height:p.height??undefined}))})).filter(p=>p.photos.length);
}
export default createBoardApi();
