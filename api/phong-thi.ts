import {createHash,randomBytes,scrypt as scryptCb,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {allowedBtvnOrigin} from '../server/btvn/origin-policy';
import {sanitizeDisplayName} from '../server/hsa/rank';
import {PT_LOAI,type PtNguoiXem} from '../server/phong-thi/engine';
import {GOI,serverKho,xuLy} from '../server/phong-thi/handler';
type Req={method?:string;query?:Record<string,string|string[]|undefined>;body?:unknown;headers?:Record<string,string|string[]|undefined>};
type Res={setHeader:(key:string,value:string|string[])=>void;status:(n:number)=>{json:(value:unknown)=>void}};
const scrypt=promisify(scryptCb) as (pw:string,salt:Buffer,len:number)=>Promise<Buffer>;
const COOKIE='mtm_pt';
const cookieOf=(h:Record<string,string|string[]|undefined>,name:string)=>{const c=typeof h.cookie==='string'?h.cookie:'';return c.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)??'';};
const ptCookie=(token:string)=>`${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${token?30*86400:0}; Secure`;
const digest=(raw:string,scope:string)=>createHash('sha256').update(scope+':'+raw).digest('hex');
export const maKichHoatDigest=(ma:string)=>digest(ma.toUpperCase().replace(/[^A-Z0-9]/g,''),'phong-thi-ma');
export function chuanSdt(v:unknown){if(typeof v!=='string')return null;let s=v.replace(/[\s.()-]/g,'');if(s.startsWith('+84'))s='0'+s.slice(3);else if(s.startsWith('84')&&s.length===11)s='0'+s.slice(2);return /^0[35789][0-9]{8}$/.test(s)?s:null;}
export async function bamMatKhau(pw:string){const salt=randomBytes(16);return 'scrypt$'+salt.toString('base64url')+'$'+(await scrypt(pw,salt,32)).toString('base64url');}
export async function dungMatKhau(pw:string,stored:string){const [k,salt,hash]=stored.split('$');if(k!=='scrypt'||!salt||!hash)return false;const got=await scrypt(pw,Buffer.from(salt,'base64url'),32),want=Buffer.from(hash,'base64url');return got.length===want.length&&timingSafeEqual(got,want);}

/** Phòng thi thử THPT Quốc gia. GET: danh mục đề (kèm quyền của người xem) hoặc ?xep-hang=<đề>. POST {action}: mo, nop, dang-ky, dang-nhap, dang-xuat, kich-hoat, thanh-toan.
 * Đề giải mã từ server/phong-thi/kho-de.bin bằng MTM_PHONG_THI_KEY. Tài khoản, gói, lượt thi cần migration 076 + MTM_PHONG_THI_DB=1;
 * chưa bật thì học sinh MTM vẫn vào miễn phí (xác nhận phiên BTVN), lượt thi chỉ chấm, không lưu. Thanh toán thật cần MTM_PHONG_THI_THANH_TOAN=1. */
export function createPhongThiApi(getEnv=()=>process.env as Record<string,string|undefined>,transport:typeof fetch=fetch,clock=Date.now){return async(req:Req,res:Res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Vary','Cookie');
 if(req.method!=='GET'&&req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({message:'Chỉ nhận GET hoặc POST.'});}
 const env=getEnv(),h=req.headers??{},db=env.MTM_PHONG_THI_DB==='1';
 if(req.method==='POST'){const origin=h.origin;if(typeof origin!=='string'||origin!==`https://${h.host}`||!allowedBtvnOrigin(origin,env))return res.status(403).json({message:'Không thể gửi từ trang này.'});}
 const rpc=async(name:string,args:Record<string,unknown>)=>{
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Missing config');const url=new URL(env.SUPABASE_URL);if(url.protocol!=='https:')throw Error('HTTPS required');
  return transport(url.origin+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});
 };
 let body:any=req.body;
 if(req.method==='POST'){try{if(typeof body==='string')body=JSON.parse(body);}catch{return res.status(400).json({message:'Yêu cầu không hợp lệ.'});}
  if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.action!=='string')return res.status(400).json({message:'Yêu cầu không hợp lệ.'});}
 const action:string=req.method==='GET'?'danh-muc':body.action;

 // Bảng xếp hạng một đề: công khai, không cần biết người xem.
 if(req.method==='GET'&&typeof req.query?.['xep-hang']==='string'){
  const de=req.query['xep-hang'];if(!/^[a-z0-9][a-z0-9-]{2,79}$/.test(de))return res.status(400).json({message:'Đề không hợp lệ.'});
  if(!db)return res.status(200).json({enabled:false,rows:[]});
  try{const r=await rpc('mtm_pt_xep_hang',{p_de:de,p_limit:50});if(!r.ok)throw Error();const rows=await r.json();if(!Array.isArray(rows))throw Error();
   res.setHeader('Cache-Control','public, s-maxage=15, stale-while-revalidate=30');return res.status(200).json({enabled:true,rows});}
  catch{return res.status(503).json({message:'Chưa tải được bảng xếp hạng.'});}
 }

 // Tài khoản người ngoài.
 if(['dang-ky','dang-nhap','dang-xuat','kich-hoat','thanh-toan'].includes(action)){
  if(action==='dang-xuat'){const t=cookieOf(h,COOKIE);if(db&&/^[0-9a-f]{64}$/.test(t))try{await rpc('mtm_pt_dang_xuat',{p_digest:digest(t,'phong-thi-phien')});}catch{/* vẫn xóa cookie */}
   res.setHeader('Set-Cookie',ptCookie(''));return res.status(200).json({ok:true});}
  if(action==='thanh-toan'){
   if(env.MTM_PHONG_THI_THANH_TOAN!=='1')return res.status(503).json({message:'Thanh toán online đang chuẩn bị. Em nhắn Zalo 0967 365 413 để nhận mã kích hoạt gói.'});
   return res.status(501).json({message:'Cổng thanh toán chưa được nối.'});
  }
  if(!db)return res.status(503).json({message:'Tài khoản phòng thi đang chuẩn bị mở. Học sinh Minh Thành Math đăng nhập bằng mã học sinh để thi miễn phí.'});
  try{
   if(action==='dang-ky'||action==='dang-nhap'){
    const sdt=chuanSdt(body.sdt),pw=typeof body.matKhau==='string'?body.matKhau:'';
    if(!sdt)return res.status(400).json({message:'Số điện thoại chưa đúng (10 số, ví dụ 0912345678).'});
    if(pw.length<6||pw.length>72)return res.status(400).json({message:'Mật khẩu 6–72 ký tự.'});
    let id:string;
    if(action==='dang-ky'){
     const ten=sanitizeDisplayName(body.ten);if(!ten)return res.status(400).json({message:'Họ tên chưa phù hợp (2–24 ký tự, không số điện thoại hay đường dẫn).'});
     const r=await rpc('mtm_pt_dang_ky',{p_sdt:sdt,p_ten:ten,p_mat_khau:await bamMatKhau(pw)});
     if(!r.ok){const e=await r.json().catch(()=>null);if(e?.code==='23505')return res.status(409).json({message:'Số điện thoại này đã có tài khoản. Em đăng nhập nhé.'});throw Error();}
     id=await r.json();
    }else{
     const r=await rpc('mtm_pt_tim_tai_khoan',{p_sdt:sdt});if(!r.ok)throw Error();const tk=await r.json();
     if(!tk||typeof tk.id!=='string')return res.status(401).json({message:'Sai số điện thoại hoặc mật khẩu.'});
     if(tk.khoa)return res.status(429).json({message:'Tài khoản tạm khóa vì nhập sai nhiều lần. Em thử lại sau 15 phút.'});
     const ok=await dungMatKhau(pw,tk.matKhau);
     if(!ok){await rpc('mtm_pt_ket_qua_dang_nhap',{p_tai_khoan:tk.id,p_dung:false,p_digest:null});return res.status(401).json({message:'Sai số điện thoại hoặc mật khẩu.'});}
     id=tk.id;
    }
    const token=randomBytes(32).toString('hex');
    const s=await rpc('mtm_pt_ket_qua_dang_nhap',{p_tai_khoan:id,p_dung:true,p_digest:digest(token,'phong-thi-phien')});if(!s.ok)throw Error();
    res.setHeader('Set-Cookie',ptCookie(token));return res.status(200).json({ok:true});
   }
   // kich-hoat
   const ai=await taiKhoan(cookieOf(h,COOKIE),rpc);if(!ai)return res.status(401).json({message:'Em đăng nhập tài khoản phòng thi trước khi kích hoạt mã.'});
   const ma=typeof body.ma==='string'?body.ma.toUpperCase().replace(/[^A-Z0-9]/g,''):'';if(ma.length<8||ma.length>24)return res.status(400).json({message:'Mã kích hoạt chưa đúng.'});
   const r=await rpc('mtm_pt_kich_hoat',{p_tai_khoan:ai.id,p_digest:maKichHoatDigest(ma)});if(!r.ok)throw Error();const out=await r.json();
   const msg:Record<string,string>={ok:'Đã kích hoạt gói.',sai:'Mã kích hoạt không đúng.','da-dung':'Mã này đã được dùng.','da-dung-boi-em':'Em đã kích hoạt mã này rồi.','het-han':'Mã đã hết hạn.'};
   return res.status(out?.status==='ok'?200:400).json({...out,message:msg[out?.status]??'Chưa kích hoạt được mã.'});
  }catch{return res.status(503).json({message:'Chưa kết nối được máy chủ. Em thử lại sau ít phút.'});}
 }

 // Xác định người xem: học sinh MTM (phiên BTVN) ưu tiên, rồi tài khoản phòng thi, còn lại là khách.
 let ai:PtNguoiXem={kieu:'khach'};
 try{
  const hs=cookieOf(h,'mtm_btvn_demo');
  if(/^[0-9a-f]{64}$/.test(hs)){
   if(db){const r=await rpc('mtm_pt_hoc_sinh',{p_session:hs});if(r.ok){const x=await r.json();if(x&&typeof x.id==='string')ai={kieu:'hoc-sinh',id:x.id,ten:typeof x.ten==='string'?x.ten:null};}}
   else{// Chưa áp 076: xác nhận phiên bằng RPC hạng đang chạy (lỗi khi phiên sai), giống /api/bang-tin.
    const r=await rpc('mtm_btvn_my_rank',{p_session:hs,p_cohort:'2K9',p_kind:'btvn-tuan',p_class:null});if(r.ok)ai={kieu:'hoc-sinh',id:null,ten:null};}
  }
  if(ai.kieu==='khach'&&db){const t=await taiKhoan(cookieOf(h,COOKIE),rpc);if(t)ai=t;}
 }catch{/* máy chủ CSDL lỗi: vẫn cho làm đề công khai */}

 const kho=serverKho(env),nay=clock();
 const out=xuLy(action,body??{},ai,kho,nay);
 if(action==='danh-muc'&&out.status===200&&db&&ai.kieu!=='khach'){
  try{const r=await rpc('mtm_pt_lich_su',{p_nguoi:ai.kieu==='hoc-sinh'?'hs:'+ai.id:'tk:'+ai.id,p_limit:30});if(r.ok)(out.body as any).lichSu=await r.json();}catch{/* bỏ qua */}
 }
 if(action==='nop'&&out.status===200&&db){
  const b=out.body as any,k=b.ketQua,ten=body.ten===undefined||body.ten===null||body.ten===''?null:sanitizeDisplayName(body.ten);
  const nguoi=ai.kieu==='hoc-sinh'?(ai.id?'hs:'+ai.id:'khach'):ai.kieu==='tai-khoan'?'tk:'+ai.id:'khach';
  try{const r=await rpc('mtm_pt_ghi_luot',{p_nonce:b.nonce,p_de:k.de,p_loai:k.loai,p_nguoi:nguoi,p_hoc_sinh:ai.kieu==='hoc-sinh'?ai.id:null,p_tai_khoan:ai.kieu==='tai-khoan'?ai.id:null,
    p_diem:k.diem,p_thang:k.thangDiem,p_dung:k.dung,p_tong:k.tong,p_giay:b.giay,p_qua_gio:b.quaGio,
    p_chi_tiet:{phan:k.theoPhan,cau:k.cau.map((c:any)=>[c.ma,c.dung?1:0,c.daLam?1:0])},p_ten:ten});
   b.xepHang=r.ok?await r.json():{status:'loi'};}catch{b.xepHang={status:'loi'};}
 }
 if(out.status===200&&action==='nop')delete (out.body as any).nonce;
 return res.status(out.status).json(out.body);
};}
async function taiKhoan(token:string,rpc:(n:string,a:Record<string,unknown>)=>Promise<Response>):Promise<Extract<PtNguoiXem,{kieu:'tai-khoan'}>|null>{
 if(!/^[0-9a-f]{64}$/.test(token))return null;
 const r=await rpc('mtm_pt_phien',{p_digest:digest(token,'phong-thi-phien')});if(!r.ok)return null;const x=await r.json();
 if(!x||typeof x.id!=='string')return null;
 return {kieu:'tai-khoan',id:x.id,ten:String(x.ten??''),goi:(Array.isArray(x.goi)?x.goi:[]).map((g:any)=>({loai:(Array.isArray(g.loai)?g.loai:[]).filter((l:unknown)=>(PT_LOAI as readonly unknown[]).includes(l)),den:String(g.den)}))};
}
export {GOI};
export default createPhongThiApi();
