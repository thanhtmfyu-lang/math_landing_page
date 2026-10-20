import {createHash,randomBytes,scrypt as scryptCb,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {allowedBtvnOrigin} from '../btvn/origin-policy';
import {sanitizeDisplayName} from '../hsa/rank';
import {PT_LOAI,PT_KHOI,kiemBaoLoi,kiemDangKyDot,tenRutGon,type PtNguoiXem} from './engine';
import {DOT,GOI,serverKho,xuLy,type PtThiSinh} from './handler';
type Req={method?:string;query?:Record<string,string|string[]|undefined>;body?:unknown;headers?:Record<string,string|string[]|undefined>};
type Res={setHeader:(key:string,value:string|string[])=>void;status:(n:number)=>{json:(value:unknown)=>void}};
const scrypt=promisify(scryptCb) as (pw:string,salt:Buffer,len:number)=>Promise<Buffer>;
const COOKIE='mtm_pt',COOKIE_DK='mtm_pt_dk';
const cookieOf=(h:Record<string,string|string[]|undefined>,name:string)=>{const c=typeof h.cookie==='string'?h.cookie:'';return c.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)??'';};
const ptCookie=(token:string)=>`${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${token?30*86400:0}; Secure`;
const dkCookie=(v:string)=>`${COOKIE_DK}=${v}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${v?120*86400:0}; Secure`;
/** Mã tra cứu SBD: 10 ký tự dễ đọc (không 0/O, 1/I/L), chỉ hiện một lần khi đăng ký; CSDL lưu sha256. */
export function taoMaTraCuu(){const A='ABCDEFGHJKMNPQRSTUVWXYZ23456789',b=randomBytes(10);return Array.from(b,x=>A[x%A.length]).join('');}
const okSbd=(v:unknown)=>typeof v==='string'&&/^[A-Z][A-Z0-9]{1,7}-1[012]-[0-9]{4}$/.test(v);
const okMaTc=(v:unknown)=>typeof v==='string'&&/^[A-Z2-9]{10}$/.test(v);
/** IP băm (có khóa phòng thi làm muối) cho chống spam đăng ký, báo lỗi; không lưu IP thô. */
export function ipBam(h:Record<string,string|string[]|undefined>,env:Record<string,string|undefined>){const x=h['x-forwarded-for'],raw=(typeof x==='string'?x.split(',')[0]:'')||(typeof h['x-real-ip']==='string'?h['x-real-ip']:'')||'khong-ro';
 return createHash('sha256').update('phong-thi-ip:'+(env.MTM_PHONG_THI_KEY??'')+':'+raw.trim()).digest('hex');}
const digest=(raw:string,scope:string)=>createHash('sha256').update(scope+':'+raw).digest('hex');
export const maKichHoatDigest=(ma:string)=>digest(ma.toUpperCase().replace(/[^A-Z0-9]/g,''),'phong-thi-ma');
export function chuanSdt(v:unknown){if(typeof v!=='string')return null;let s=v.replace(/[\s.()-]/g,'');if(s.startsWith('+84'))s='0'+s.slice(3);else if(s.startsWith('84')&&s.length===11)s='0'+s.slice(2);return /^0[35789][0-9]{8}$/.test(s)?s:null;}
export async function bamMatKhau(pw:string){const salt=randomBytes(16);return 'scrypt$'+salt.toString('base64url')+'$'+(await scrypt(pw,salt,32)).toString('base64url');}
export async function dungMatKhau(pw:string,stored:string){const [k,salt,hash]=stored.split('$');if(k!=='scrypt'||!salt||!hash)return false;const got=await scrypt(pw,Buffer.from(salt,'base64url'),32),want=Buffer.from(hash,'base64url');return got.length===want.length&&timingSafeEqual(got,want);}

/** Phòng thi thử THPT Quốc gia. GET: danh mục đề (kèm quyền của người xem, đợt thi), ?xep-hang=<đề>, ?xep-hang-dot=<đợt>, ?xep-hang-ks=<đợt>&khoi=10.
 * POST {action}: mo (kèm dot cho chế độ đợt), nop, dang-ky, dang-nhap, dang-xuat, kich-hoat, thanh-toan, dang-ky-dot, tra-cuu-sbd, khao-sat, bao-loi.
 * Đề giải mã từ server/phong-thi/kho-de.bin bằng MTM_PHONG_THI_KEY. Tài khoản, gói, lượt thi cần migration 077 + MTM_PHONG_THI_DB=1;
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
 // Bảng xếp hạng đợt thi; kỳ khảo sát xếp trong từng khối, chỉ SBD + tên rút gọn + phân vị (không trường, không SĐT).
 if(req.method==='GET'&&(typeof req.query?.['xep-hang-dot']==='string'||typeof req.query?.['xep-hang-ks']==='string')){
  const ks=typeof req.query['xep-hang-ks']==='string',ma=String(req.query[ks?'xep-hang-ks':'xep-hang-dot']),khoi=String(req.query.khoi??'');
  const t=DOT.find(x=>x.ma===ma);if(!t||!!t.khoi!==ks||(ks&&!(PT_KHOI as readonly string[]).includes(khoi)))return res.status(400).json({message:'Đợt không hợp lệ.'});
  if(!db)return res.status(200).json({enabled:false,rows:[]});
  try{const r=ks?await rpc('mtm_pt_khao_sat',{p_dot:ma,p_khoi:Number(khoi),p_sbd:null,p_limit:100}):await rpc('mtm_pt_xep_hang_dot',{p_dot:ma,p_limit:50});if(!r.ok)throw Error();const x=await r.json();
   const rows=ks?(Array.isArray(x?.bang)?x.bang:[]).map((b:any)=>({hang:b.hang,sbd:b.sbd,ten:tenRutGon(String(b.ten??'')),mtm:!!b.mtm,diem:b.diem,phanVi:b.phanVi})):x;if(!Array.isArray(rows))throw Error();
   res.setHeader('Cache-Control','public, s-maxage=15, stale-while-revalidate=30');return res.status(200).json({enabled:true,rows,...(ks?{n:x.n}:{})});}
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
   else{// Chưa áp 077: xác nhận phiên bằng RPC hạng đang chạy (lỗi khi phiên sai), giống /api/bang-tin.
    const r=await rpc('mtm_btvn_my_rank',{p_session:hs,p_cohort:'2K9',p_kind:'btvn-tuan',p_class:null});if(r.ok)ai={kieu:'hoc-sinh',id:null,ten:null};}
  }
  if(ai.kieu==='khach'&&db){const t=await taiKhoan(cookieOf(h,COOKIE),rpc);if(t)ai=t;}
 }catch{/* máy chủ CSDL lỗi: vẫn cho làm đề công khai */}

 const kho=serverKho(env),nay=clock(),ip=()=>ipBam(h,env),nguoiCua=(x:PtNguoiXem)=>x.kieu==='hoc-sinh'?(x.id?'hs:'+x.id:'khach'):x.kieu==='tai-khoan'?'tk:'+x.id:'khach';
 // Thí sinh kỳ khảo sát: SBD + mã tra cứu từ cookie (đã đăng ký trên máy này) hoặc nhập tay; chỉ khi đã bật CSDL.
 let thiSinh:PtThiSinh|null=null,thiSinhDu:Record<string,unknown>|null=null;
 if(db){const [c1,c2]=cookieOf(h,COOKIE_DK).split('.'),sbd=body?.sbd??c1,mtc=typeof body?.maTraCuu==='string'?body.maTraCuu.toUpperCase().replace(/[^A-Z0-9]/g,''):c2;
  if(okSbd(sbd)&&okMaTc(mtc))try{const r=await rpc('mtm_pt_tra_cuu_dot',{p_sbd:sbd,p_tra_cuu:digest(mtc,'phong-thi-tra-cuu')});const x=r.ok?await r.json():null;
   if(x&&typeof x.sbd==='string'&&(PT_KHOI as readonly unknown[]).includes(x.khoi)){thiSinh={dot:x.dot,sbd:x.sbd,khoi:x.khoi,ten:x.ten};thiSinhDu=x;if(body?.sbd)res.setHeader('Set-Cookie',dkCookie(sbd+'.'+mtc));}}catch{/* bỏ qua */}}
 if(action==='dang-ky-dot'||action==='tra-cuu-sbd'||action==='khao-sat'||action==='bao-loi'){
  if(!kho)return res.status(503).json({message:'Phòng thi thử đang cập nhật đề. Em quay lại sau ít phút.'});
  if(!db)return res.status(503).json({message:action==='bao-loi'?'Báo lỗi đề sẽ mở khi phòng thi chính thức hoạt động. Em nhắn Zalo 0967 365 413 để báo giúp thầy.':'Đăng ký kỳ khảo sát sắp mở. Em nhắn Zalo 0967 365 413 để giữ chỗ.'});
  try{
   if(action==='bao-loi'){
    const v=kiemBaoLoi(body,kho.kho);if(typeof v==='string')return res.status(400).json({message:v});
    const r=await rpc('mtm_pt_bao_loi',{p_de:v.de,p_ma:v.ma,p_noi_dung:v.noiDung,p_nguoi:nguoiCua(ai),p_ip:ip()});if(!r.ok)throw Error();const x=await r.json();
    return x?.status==='ok'?res.status(200).json({ok:true,message:'Đã gửi. Thầy sẽ kiểm lại câu này, cảm ơn em.'}):res.status(429).json({message:'Em đã gửi nhiều báo lỗi trong một giờ. Em thử lại sau nhé.'});
   }
   if(action==='dang-ky-dot'){
    const t=DOT.find(x=>x.ma===body.dot);if(!t?.khoi||!t.sbd)return res.status(404).json({message:'Không tìm thấy kỳ khảo sát này.'});
    if(nay>=Date.parse(t.dong))return res.status(410).json({message:'Kỳ khảo sát đã kết thúc.'});
    const v=kiemDangKyDot(body);if(typeof v==='string')return res.status(400).json({message:v});
    const sdt=chuanSdt(body.sdt);if(!sdt)return res.status(400).json({message:'Số Zalo phụ huynh chưa đúng (10 số, ví dụ 0912345678).'});
    const ma=taoMaTraCuu();
    const r=await rpc('mtm_pt_dang_ky_dot',{p_dot:t.ma,p_khoi:Number(v.khoi),p_tien_to:t.sbd,p_ten:v.ten,p_truong:v.truong,p_sdt:sdt,p_tra_cuu:digest(ma,'phong-thi-tra-cuu'),p_ip:ip(),p_hoc_sinh:ai.kieu==='hoc-sinh'?ai.id:null});
    if(!r.ok)throw Error();const x=await r.json();
    const msg:Record<string,string>={'qua-nhieu':'Máy này đã đăng ký nhiều lượt trong một giờ. Em thử lại sau.','sdt-du':'Số Zalo phụ huynh này đã đăng ký đủ 3 thí sinh.','het-cho':'Khối này đã đủ chỗ.'};
    if(x?.status!=='ok'||!okSbd(x.sbd))return res.status(x?.status==='qua-nhieu'?429:409).json({message:msg[x?.status]??'Chưa đăng ký được.'});
    res.setHeader('Set-Cookie',dkCookie(x.sbd+'.'+ma));
    return res.status(200).json({ok:true,sbd:x.sbd,maTraCuu:ma,khoi:v.khoi,ten:v.ten,truong:v.truong,dot:t.ma,mtm:ai.kieu==='hoc-sinh'});
   }
   if(!thiSinh)return res.status(401).json({message:'SBD hoặc mã tra cứu chưa đúng.'});
   if(action==='tra-cuu-sbd')return res.status(200).json({ok:true,...thiSinhDu});
   // khao-sat: thứ hạng, phân vị của chính em và tỉ lệ đúng từng câu của khối (để so theo chuyên đề).
   const r=await rpc('mtm_pt_khao_sat',{p_dot:thiSinh.dot,p_khoi:Number(thiSinh.khoi),p_sbd:thiSinh.sbd,p_limit:1});if(!r.ok)throw Error();const x=await r.json();
   return res.status(200).json({thiSinh:thiSinhDu,em:x?.em??null,n:x?.n??0,cau:x?.cau??{}});
  }catch{return res.status(503).json({message:'Chưa kết nối được máy chủ. Em thử lại sau ít phút.'});}
 }
 const out=xuLy(action,body??{},ai,kho,nay,{thiSinh});
 if(action==='danh-muc'&&out.status===200&&db&&ai.kieu!=='khach'){
  try{const r=await rpc('mtm_pt_lich_su',{p_nguoi:ai.kieu==='hoc-sinh'?'hs:'+ai.id:'tk:'+ai.id,p_limit:30});if(r.ok)(out.body as any).lichSu=await r.json();}catch{/* bỏ qua */}
 }
 if(action==='nop'&&out.status===200&&db){
  const b=out.body as any,k=b.ketQua,ten=body.ten===undefined||body.ten===null||body.ten===''?null:sanitizeDisplayName(body.ten);
  const nguoi=b.sbd?'sbd:'+b.sbd:nguoiCua(ai);
  try{const r=await rpc('mtm_pt_ghi_luot',{p_nonce:b.nonce,p_de:k.de,p_loai:k.loai,p_nguoi:nguoi,p_hoc_sinh:ai.kieu==='hoc-sinh'?ai.id:null,p_tai_khoan:ai.kieu==='tai-khoan'?ai.id:null,
    p_diem:k.diem,p_thang:k.thangDiem,p_dung:k.dung,p_tong:k.tong,p_giay:b.giay,p_qua_gio:b.quaGio,
    p_chi_tiet:{phan:k.theoPhan,cau:k.cau.map((c:any)=>[c.ma,c.dung?1:0,c.daLam?1:0,c.giay??null]),...(b.thoiGian?{coThoiGian:true}:{})},p_ten:b.sbd?null:ten,p_dot:b.dot??null,p_sbd:b.sbd??null});
   b.xepHang=r.ok?await r.json():{status:'loi'};}catch{b.xepHang={status:'loi'};}
  const ts=thiSinh as PtThiSinh|null;
  if(b.sbd&&ts&&ts.sbd===b.sbd)try{const r=await rpc('mtm_pt_khao_sat',{p_dot:ts.dot,p_khoi:Number(ts.khoi),p_sbd:ts.sbd,p_limit:1});
   if(r.ok){const x=await r.json();b.khaoSat={thiSinh:thiSinhDu,em:x?.em??null,n:x?.n??0,cau:x?.cau??{}};}}catch{/* báo cáo vẫn hiện phần điểm */}
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
// Vercel Hobby giới hạn 12 hàm: phục vụ qua api/exam.ts (rewrite /api/phong-thi -> /api/exam?muc=phong-thi).
