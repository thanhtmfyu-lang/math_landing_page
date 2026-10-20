import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import R106PageIntro from '../../migration/R106PageIntro';
import MathText from '../math/MathText';
import {Link} from '../../migration/navigation';
import {ZALO_ASSISTANT_URL} from '../../components/mtm-contact';
import {PT_LOAI,PT_LOAI_TEN,PT_NHOM_TEN,baoCao,tenChuDe,type PtDeCongKhai,type PtDotCongKhai,type PtKetQua,type PtKhoi,type PtLoai,type PtMucLuc,type PtCauCongKhai} from '../../../server/phong-thi/engine';
import './hsa-mock.css';
import './entrance-test.css';
import './phong-thi.css';

const API='/api/phong-thi',KEY='mtm:phong-thi:v1';
type Quyen={mo:true}|{mo:false;lyDo:'hoc-sinh-mtm'|'can-goi'};
type MucDe=PtMucLuc&{quyen:Quyen};
type LichSu={de:string;loai?:PtLoai;dot?:string|null;diem:number;thang:number;dung:number;tong:number;giay:number;quaGio:boolean;luc:string};
type NguoiXem={kieu:'hoc-sinh';ten:string|null}|{kieu:'tai-khoan';ten:string;goi:{loai:PtLoai[];den:string}[]}|{kieu:'khach'};
type Goi={id:string;ten:string;loai:PtLoai[];soNgay:number;gia:number|null;moTa:string};
type DanhMuc={nguoiXem:NguoiXem;de:MucDe[];goi:Goi[];lichSu?:LichSu[];dot?:PtDotCongKhai[]};
type TraLoi=Record<string,unknown>;
type XepHang={status:string;hang?:number;n?:number;dot?:string};
type KhaoSat={thiSinh:{sbd:string;khoi:string;ten:string;truong:string;mtm?:boolean}|null;em:{hang:number;n:number;diem:number;phanVi:number}|null;n:number;cau:Record<string,number>};
/** tg: số giây em dừng ở từng câu (đo ở trình duyệt, gửi kèm khi nộp). dot: lượt làm theo đợt (ks: kỳ khảo sát theo SBD). */
type Luot={de:PtDeCongKhai;ve:string;batDau:number;hetGio:number;traLoi:TraLoi;co?:string[];tg?:Record<string,number>;dot?:{ma:string;ten:string;ks?:boolean;khoi?:string};
 ketQua?:PtKetQua;giay?:number;quaGio?:boolean;xepHang?:XepHang;khaoSat?:KhaoSat;nopLuc?:number};
const load=():Luot|null=>{try{const s=JSON.parse(localStorage.getItem(KEY)??'null');return s&&s.de&&typeof s.ve==='string'?s:null;}catch{return null;}};
const save=(s:Luot|null)=>{try{s?localStorage.setItem(KEY,JSON.stringify(s)):localStorage.removeItem(KEY);}catch{/* trình duyệt chặn lưu thì vẫn làm bài được */}};
const fmt=(ms:number)=>{const s=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return (h?h+':':'')+String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
const so=(x:number)=>x.toLocaleString('vi-VN',{maximumFractionDigits:2});
async function goi<T>(body?:Record<string,unknown>,query=''):Promise<T>{
 const r=await fetch(API+query,body?{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),credentials:'same-origin'}:{headers:{Accept:'application/json'},credentials:'same-origin'});
 const d=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(Error(d?.message??'Chưa kết nối được máy chủ. Em thử lại sau.'),{status:r.status,data:d});return d as T;
}
const daLam=(c:PtCauCongKhai,v:unknown)=>c.kieu==='ds'||c.kieu==='keo-tha'?Array.isArray(v)&&v.some(x=>x!==null&&x!==undefined):c.kieu==='nhieu'?Array.isArray(v)&&v.length>0:v!==undefined&&v!==null&&v!=='';

export default function PhongThi({search}:{search:string}){
 const [luot,setLuot]=useState<Luot|null>(()=>load());
 const update=useCallback((next:Luot|null)=>{save(next);setLuot(next);},[]);
 return <div className="mig-container hsa-page pt-page">
  {luot?null:<R106PageIntro className="hsa-intro" eyebrow="Tốt nghiệp THPT · HSA · TSA" title="Phòng thi thử THPT Quốc gia" description={<><p>Thi đúng cấu trúc, đúng thời gian đề thật: đồng hồ đếm ngược, chấm ngay khi nộp, lời giải từng câu theo mã câu và bảng xếp hạng từng đề.</p><p>Học sinh Minh Thành Math vào miễn phí toàn bộ bằng mã học sinh. Bạn ngoài trung tâm làm miễn phí các đề công khai, mở thêm kho đề bằng gói luyện đề.</p></>}>
   <ul className="hsa-facts"><li><strong>3</strong><span>kỳ thi</span></li><li><strong>90</strong><span>phút đề THPT</span></li><li><strong>0đ</strong><span>học sinh MTM</span></li></ul>
  </R106PageIntro>}
  {!luot?<Sanh search={search} onMo={update}/>:luot.ketQua?<KetQua luot={luot} update={update}/>:<PhongLam luot={luot} update={update}/>}
 </div>;
}

function Sanh({search,onMo}:{search:string;onMo:(l:Luot)=>void}){
 const [dm,setDm]=useState<DanhMuc|null>(null),[loi,setLoi]=useState(''),[busy,setBusy]=useState('');
 const p=new URLSearchParams(search),[loai,setLoai]=useState<PtLoai>(()=>{const l=p.get('loai');return (PT_LOAI as readonly string[]).includes(l??'')?l as PtLoai:'thpt';});
 const tai=useCallback(()=>{setLoi('');goi<DanhMuc>().then(setDm).catch(e=>setLoi(e.message));},[]);
 useEffect(tai,[tai]);
 const mo=async(id:string|null,dot?:PtDotCongKhai)=>{setBusy(dot?'dot:'+dot.ma:id!);setLoi('');
  try{const d=await goi<{de:PtDeCongKhai;ve:string;batDau:number;hetGio:number;dot?:{ma:string;ten:string}}>({action:'mo',...(id?{de:id}:{}),...(dot?{dot:dot.ma}:{})});
   // Giờ kết thúc tính theo đồng hồ máy em, lệch giờ máy chủ không làm mất phút làm bài.
   const lech=Date.now()-d.batDau;onMo({de:d.de,ve:d.ve,batDau:d.batDau+lech,hetGio:d.hetGio+lech,traLoi:{},
    ...(d.dot?{dot:{...d.dot,...(dot?.dangKy?{ks:true,khoi:dot.cuaEm?.khoi}:{})}}:{})});window.scrollTo({top:0});}
  catch(e){setLoi((e as Error).message);setBusy('');}
 };
 const ds=useMemo(()=>(dm?.de??[]).filter(d=>d.loai===loai),[dm,loai]);
 const nhom=useMemo(()=>[...new Set(ds.map(d=>d.nhom))],[ds]);
 const ls=new Map((dm?.lichSu??[]).map(l=>[l.de,l]));
 return <div className="pt-lobby">
  <div className="pt-main">
   {dm?.dot&&dm.dot.length>0&&<DotThi ds={dm.dot} busy={busy} onMo={mo} onDoi={tai}/>}
   <nav className="hsa-picker pt-tabs" aria-label="Kỳ thi">{PT_LOAI.map(l=><a key={l} href={'?loai='+l} aria-current={l===loai?'page':undefined} onClick={e=>{e.preventDefault();setLoai(l);history.replaceState(null,'','?loai='+l);}}>{PT_LOAI_TEN[l]}<small>{(dm?.de??[]).filter(d=>d.loai===l).length} đề</small></a>)}</nav>
   <p className="pt-format">{loai==='thpt'?'Cấu trúc từ 2025: Phần I 12 câu trắc nghiệm (0,25 điểm/câu), Phần II 4 câu đúng sai (tối đa 1 điểm/câu), Phần III 6 câu trả lời ngắn (0,5 điểm/câu). 90 phút, thang 10.'
    :loai==='hsa'?'Phần 1 Toán học và xử lý số liệu của bài HSA: 50 câu (trắc nghiệm và điền đáp án), 75 phút, mỗi câu 1 điểm, thang 50.'
    :'Phần Tư duy Toán học của bài TSA: 40 câu, 60 phút; câu chọn một, đúng sai, chọn nhiều, kéo thả, điền đáp án; đúng hết các ý mới được điểm.'}</p>
   {loi&&<p className="hsa-error" role="alert">{loi} {!dm&&<button type="button" className="hsa-link" onClick={tai}>Tải lại</button>}</p>}
   {!dm&&!loi&&<p className="pt-wait" role="status">Đang tải kho đề…</p>}
   {dm&&!ds.length&&<p className="hsa-card pt-empty">Kho đề {PT_LOAI_TEN[loai]} đang được nhập và kiểm đáp án. Em quay lại sau nhé.</p>}
   {nhom.map(n=><section key={n} className="pt-group"><h2>{PT_NHOM_TEN[n]}</h2><ul className="pt-cards">
    {ds.filter(d=>d.nhom===n).map(d=>{const l=ls.get(d.id);return <li key={d.id} className={'hsa-card pt-card'+(d.quyen.mo?'':' is-locked')}>
     <p className="pt-badges">{d.tang==='cong-khai'?<span className="is-free">Miễn phí</span>:d.tang==='hoc-sinh-mtm'?<span className="is-mtm">Học sinh MTM</span>:<span className="is-pro">Gói luyện đề</span>}<span>{d.thoiGian} phút · {d.soCau} câu</span></p>
     <h3>{d.tieuDe}</h3><p className="pt-src">{d.nguon}</p>{d.moTa&&<p className="pt-desc">{d.moTa}</p>}
     {l&&<p className="pt-done">Lần gần nhất: <strong>{so(l.diem)}/{so(l.thang)}</strong> · đúng {l.dung}/{l.tong}</p>}
     <p className="hsa-actions">{d.quyen.mo?<button type="button" className="hsa-primary" disabled={!!busy} onClick={()=>void mo(d.id)}>{busy===d.id?'Đang mở đề…':l?'Làm lại':'Vào thi'}</button>
      :d.quyen.lyDo==='hoc-sinh-mtm'?<Link className="hsa-ghost" href="/btvn">Đăng nhập mã học sinh</Link>:<a className="hsa-ghost" href="#tai-khoan">Mở bằng gói luyện đề</a>}</p>
    </li>;})}
   </ul></section>)}
   {dm?.lichSu&&dm.lichSu.length>0&&<LichSuDiem ls={dm.lichSu} de={dm.de}/>}
  </div>
  <aside className="pt-side" id="tai-khoan">{dm&&<TaiKhoan dm={dm} onDoi={tai}/>}</aside>
 </div>;
}

const demNguoc=(ms:number)=>{const s=Math.max(0,Math.floor(ms/1000)),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);
 return (d?d+' ngày ':'')+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
const ngayGio=(iso:string)=>new Date(iso).toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Asia/Ho_Chi_Minh'});
const KHOI:PtKhoi[]=['10','11','12'];

/** Thẻ "Đợt thi sắp tới / đang mở": đếm ngược tới giờ mở (hoặc giờ đóng), vào thi theo đợt; kỳ khảo sát có đăng ký lấy SBD. */
function DotThi({ds,busy,onMo,onDoi}:{ds:PtDotCongKhai[];busy:string;onMo:(id:string|null,dot?:PtDotCongKhai)=>void;onDoi:()=>void}){
 const [now,setNow]=useState(Date.now());useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
 const [moDk,setMoDk]=useState('');
 return <section className="pt-dots" aria-label="Đợt thi">
  <h2>Đợt thi sắp tới và đang mở</h2>
  <ul>{ds.map(t=>{const mo=Date.parse(t.mo),dong=Date.parse(t.dong),dangMo=now>=mo&&now<dong;if(now>=dong)return null;
   const coDeKs=t.dangKy&&t.cuaEm?t.dangKy.khoi[t.cuaEm.khoi]:false;
   return <li key={t.ma} className={'hsa-card pt-dot'+(dangMo?' is-open':'')}>
    <p className="pt-badges"><span className={dangMo?'is-free':'is-soon'}>{dangMo?'Đang mở':'Sắp mở'}</span><span>{PT_LOAI_TEN[t.loai]}</span></p>
    <h3>{t.ten}</h3>
    <p className="pt-dot-time">{ngayGio(t.mo)} → {ngayGio(t.dong)}</p>
    <p className="pt-countdown" aria-live="off"><small>{dangMo?'Đóng sau':'Mở sau'}</small><b>{demNguoc((dangMo?dong:mo)-now)}</b></p>
    {t.moTa&&<p className="pt-desc">{t.moTa}</p>}
    {t.dangKy?<>
     {t.cuaEm?<p className="pt-sbd">SBD <b>{t.cuaEm.sbd}</b> · {t.cuaEm.ten} · Lớp {t.cuaEm.khoi}</p>:null}
     <p className="pt-desc">{KHOI.map(k=><span key={k} className="pt-khoi">Lớp {k}: {t.dangKy!.khoi[k]?'đã có đề':'sắp công bố đề'}</span>)}</p>
     <p className="hsa-actions">{t.cuaEm?(dangMo&&coDeKs?<button type="button" className="hsa-primary" disabled={!!busy} onClick={()=>onMo(null,t)}>{busy==='dot:'+t.ma?'Đang mở đề…':'Vào thi bằng SBD'}</button>
       :<span className="pt-note">{dangMo?'Đề khối của em sắp công bố.':'Đến giờ mở, em bấm "Vào thi bằng SBD" ở đây.'}</span>)
      :<button type="button" className="hsa-primary" onClick={()=>setMoDk(moDk===t.ma?'':t.ma)} aria-expanded={moDk===t.ma}>Đăng ký dự thi</button>}</p>
     {!t.cuaEm&&moDk===t.ma&&<DangKyDot dot={t} onXong={onDoi}/>}
    </>:t.de?<>
     <p className="pt-dot-de">{t.de.tieuDe}<small>{t.de.thoiGian} phút · {t.de.soCau} câu</small></p>
     <p className="hsa-actions">{dangMo?<button type="button" className="hsa-primary" disabled={!!busy} onClick={()=>onMo(t.de!.id,t)}>{busy==='dot:'+t.ma?'Đang mở đề…':'Vào thi đợt này'}</button>:<span className="pt-note">Lượt làm trong giờ mở mới vào bảng xếp hạng đợt.</span>}</p>
    </>:<p className="pt-dot-de is-soon">Sắp công bố đề</p>}
   </li>;})}</ul>
 </section>;
}

/** Đăng ký kỳ khảo sát: nhận cả học sinh ngoài trung tâm. Cấp SBD + mã tra cứu (hiện một lần); máy này nhớ SBD bằng cookie. */
function DangKyDot({dot,onXong}:{dot:PtDotCongKhai;onXong:()=>void}){
 const [f,setF]=useState({ten:'',khoi:'',truong:'',sdt:'',sbd:'',maTraCuu:''}),[loi,setLoi]=useState(''),[busy,setBusy]=useState(false),[xong,setXong]=useState<{sbd:string;maTraCuu:string}|null>(null),[tab,setTab]=useState<'moi'|'co-sbd'>('moi');
 const set=(k:keyof typeof f)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setF(o=>({...o,[k]:e.target.value}));
 const gui=async(body:Record<string,unknown>)=>{setBusy(true);setLoi('');try{const d=await goi<{sbd:string;maTraCuu?:string}>(body);if(d.maTraCuu)setXong({sbd:d.sbd,maTraCuu:d.maTraCuu});else onXong();}catch(e){setLoi((e as Error).message);}setBusy(false);};
 if(xong)return <div className="pt-dk-ok" role="status"><p>Đăng ký xong. Em ghi lại để vào thi trên máy khác:</p><p className="pt-dk-ma"><span>SBD <b>{xong.sbd}</b></span><span>Mã tra cứu <b>{xong.maTraCuu}</b></span></p>
  <p className="pt-note">Mã tra cứu chỉ hiện một lần. Máy này đã nhớ SBD của em.</p><p className="hsa-actions"><button type="button" className="hsa-primary" onClick={onXong}>Xong</button></p></div>;
 return <div className="pt-dk">
  <div className="pt-acc-tabs" role="tablist">{(['moi','co-sbd'] as const).map(t=><button key={t} type="button" role="tab" aria-selected={tab===t} onClick={()=>{setTab(t);setLoi('');}}>{t==='moi'?'Đăng ký mới':'Đã có SBD'}</button>)}</div>
  {tab==='moi'?<form className="pt-form pt-dk-form" onSubmit={e=>{e.preventDefault();void gui({action:'dang-ky-dot',dot:dot.ma,ten:f.ten,khoi:f.khoi,truong:f.truong,sdt:f.sdt});}}>
   <label className="hsa-field"><span>Họ và tên</span><input value={f.ten} onChange={set('ten')} maxLength={60} autoComplete="name" required/></label>
   <label className="hsa-field"><span>Lớp</span><select value={f.khoi} onChange={set('khoi')} required><option value="">Chọn lớp</option>{KHOI.map(k=><option key={k} value={k}>Lớp {k}</option>)}</select></label>
   <label className="hsa-field"><span>Trường</span><input value={f.truong} onChange={set('truong')} maxLength={120} placeholder="Ví dụ: THPT Phan Đình Phùng" required/></label>
   <label className="hsa-field"><span>Số Zalo phụ huynh</span><input value={f.sdt} onChange={set('sdt')} inputMode="tel" maxLength={15} autoComplete="tel" required/></label>
   <p className="pt-note">Báo cáo kết quả gửi riêng qua Zalo phụ huynh. Bảng xếp hạng chỉ hiện SBD và tên viết tắt.</p>
   <button className="hsa-primary" disabled={busy}>{busy?'Đang đăng ký…':'Nhận số báo danh'}</button>
  </form>:<form className="pt-form pt-dk-form" onSubmit={e=>{e.preventDefault();void gui({action:'tra-cuu-sbd',sbd:f.sbd.trim().toUpperCase(),maTraCuu:f.maTraCuu});}}>
   <label className="hsa-field"><span>Số báo danh</span><input value={f.sbd} onChange={set('sbd')} maxLength={16} placeholder="KS26-10-0001" autoComplete="off" required/></label>
   <label className="hsa-field"><span>Mã tra cứu</span><input value={f.maTraCuu} onChange={set('maTraCuu')} maxLength={12} autoComplete="off" required/></label>
   <button className="hsa-primary" disabled={busy}>Dùng SBD này</button>
  </form>}
  {loi&&<p className="hsa-error" role="alert">{loi}</p>}
 </div>;
}

/** Lịch sử điểm: biểu đồ đường SVG theo thời gian (điểm quy về %) cho từng kỳ thi, kèm danh sách lượt gần nhất. */
function LichSuDiem({ls,de}:{ls:LichSu[];de:MucDe[]}){
 const ten=new Map(de.map(d=>[d.id,d])),loaiCua=(l:LichSu)=>l.loai??ten.get(l.de)?.loai??'thpt';
 const nhom=PT_LOAI.map(loai=>({loai,ds:ls.filter(l=>loaiCua(l)===loai).sort((a,b)=>Date.parse(a.luc)-Date.parse(b.luc))})).filter(g=>g.ds.length);
 const [chon,setChon]=useState<PtLoai>(nhom[0]?.loai??'thpt');const g=nhom.find(x=>x.loai===chon)??nhom[0];if(!g)return null;
 const W=560,H=190,L=40,R=12,T=14,B=30,t0=Date.parse(g.ds[0].luc),t1=Date.parse(g.ds[g.ds.length-1].luc),span=Math.max(1,t1-t0);
 const pts=g.ds.map((l,i)=>({x:g.ds.length===1?(L+W-R)/2:L+(W-L-R)*(Date.parse(l.luc)-t0)/span,y:T+(H-T-B)*(1-l.diem/l.thang),l,i}));
 return <section className="hsa-card pt-history" aria-label="Lịch sử điểm của em">
  <h2>Lịch sử điểm của em</h2>
  {nhom.length>1&&<div className="pt-acc-tabs" role="tablist">{nhom.map(x=><button key={x.loai} type="button" role="tab" aria-selected={x.loai===g.loai} onClick={()=>setChon(x.loai)}>{PT_LOAI_TEN[x.loai]}</button>)}</div>}
  <svg viewBox={`0 0 ${W} ${H}`} className="pt-chart" role="img" aria-label={'Điểm '+PT_LOAI_TEN[g.loai]+' theo thời gian'}>
   {[0,25,50,75,100].map(p=>{const y=T+(H-T-B)*(1-p/100);return <g key={p}><line x1={L} x2={W-R} y1={y} y2={y} className="pt-chart-grid"/><text x={L-6} y={y+4} textAnchor="end" className="pt-chart-ax">{so(g.ds[0].thang*p/100)}</text></g>;})}
   <polyline points={pts.map(p=>p.x+','+p.y).join(' ')} className="pt-chart-line"/>
   {pts.map(p=><g key={p.i}><circle cx={p.x} cy={p.y} r={4} className={'pt-chart-dot'+(p.l.quaGio?' is-late':'')}><title>{(ten.get(p.l.de)?.tieuDe??p.l.de)+': '+so(p.l.diem)+'/'+so(p.l.thang)}</title></circle></g>)}
   {[pts[0],pts[pts.length-1]].filter((p,i,a)=>i===0||p!==a[0]).map(p=><text key={'d'+p.i} x={p.x} y={H-8} textAnchor={p.i===0&&pts.length>1?'start':'end'} className="pt-chart-ax">{new Date(p.l.luc).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})}</text>)}
  </svg>
  <ol className="pt-history-list">{[...g.ds].reverse().slice(0,8).map((l,i)=><li key={i}><span>{ten.get(l.de)?.tieuDe??l.de}{l.dot?<em> · theo đợt</em>:null}</span><b>{so(l.diem)}/{so(l.thang)}</b><small>{new Date(l.luc).toLocaleDateString('vi-VN')} · {Math.round(l.giay/60)} phút</small></li>)}</ol>
 </section>;
}

function TaiKhoan({dm,onDoi}:{dm:DanhMuc;onDoi:()=>void}){
 const ai=dm.nguoiXem;const [tab,setTab]=useState<'dang-nhap'|'dang-ky'>('dang-nhap');
 const [f,setF]=useState({sdt:'',ten:'',matKhau:'',ma:''}),[loi,setLoi]=useState(''),[tin,setTin]=useState(''),[busy,setBusy]=useState(false);
 const gui=async(body:Record<string,unknown>)=>{setBusy(true);setLoi('');setTin('');try{const d=await goi<{message?:string}>(body);setTin(d.message??'Xong.');setF(o=>({...o,matKhau:'',ma:''}));onDoi();}catch(e){setLoi((e as Error).message);}setBusy(false);};
 if(ai.kieu==='hoc-sinh')return <div className="hsa-card pt-acc is-mtm"><h2>Học sinh Minh Thành Math</h2><p>{ai.ten?<>Chào <strong>{ai.ten}</strong>. </>:null}Em đang vào bằng mã học sinh nên toàn bộ kho đề miễn phí. Điểm từng đề được lưu vào hồ sơ học tập và gửi phụ huynh trong báo cáo định kỳ.</p></div>;
 const set=(k:keyof typeof f)=>(e:React.ChangeEvent<HTMLInputElement>)=>setF(o=>({...o,[k]:e.target.value}));
 return <div className="pt-acc-wrap">
  <div className="hsa-card pt-acc"><h2>Học sinh MTM</h2><p>Đăng nhập bằng mã học sinh (như khi làm BTVN) để thi miễn phí toàn bộ đề.</p><p className="hsa-actions"><Link className="hsa-primary" href="/btvn">Đăng nhập mã học sinh</Link></p><p className="pt-note">Đăng nhập xong, quay lại trang này.</p></div>
  {ai.kieu==='tai-khoan'?<div className="hsa-card pt-acc"><h2>Tài khoản phòng thi</h2><p>Chào <strong>{ai.ten}</strong>.</p>
   {ai.goi.length?<ul className="pt-goi-cua-em">{ai.goi.map((g,i)=><li key={i}>{g.loai.map(l=>PT_LOAI_TEN[l]).join(', ')}<small>đến {new Date(g.den).toLocaleDateString('vi-VN')}</small></li>)}</ul>:<p className="pt-note">Em chưa có gói luyện đề. Các đề "Miễn phí" vẫn làm được.</p>}
   <form className="pt-form" onSubmit={e=>{e.preventDefault();void gui({action:'kich-hoat',ma:f.ma});}}><label className="hsa-field"><span>Mã kích hoạt</span><input value={f.ma} onChange={set('ma')} maxLength={30} placeholder="Mã in trong sách hoặc nhận qua Zalo" autoComplete="off"/></label><button className="hsa-primary" disabled={busy||f.ma.length<8}>Kích hoạt</button></form>
   <p className="hsa-actions"><button type="button" className="hsa-link" onClick={()=>void gui({action:'dang-xuat'})}>Đăng xuất</button></p>
   {loi&&<p className="hsa-error" role="alert">{loi}</p>}{tin&&<p className="pt-ok" role="status">{tin}</p>}
  </div>
  :<div className="hsa-card pt-acc"><h2>Bạn ngoài trung tâm</h2>
   <div className="pt-acc-tabs" role="tablist">{(['dang-nhap','dang-ky'] as const).map(t=><button key={t} type="button" role="tab" aria-selected={tab===t} onClick={()=>{setTab(t);setLoi('');}}>{t==='dang-nhap'?'Đăng nhập':'Tạo tài khoản'}</button>)}</div>
   <form className="pt-form" onSubmit={e=>{e.preventDefault();void gui({action:tab,sdt:f.sdt,matKhau:f.matKhau,...(tab==='dang-ky'?{ten:f.ten}:{})});}}>
    {tab==='dang-ky'&&<label className="hsa-field"><span>Họ tên</span><input value={f.ten} onChange={set('ten')} maxLength={40} autoComplete="name"/></label>}
    <label className="hsa-field"><span>Số điện thoại</span><input value={f.sdt} onChange={set('sdt')} inputMode="tel" maxLength={15} autoComplete="tel"/></label>
    <label className="hsa-field"><span>Mật khẩu</span><input type="password" value={f.matKhau} onChange={set('matKhau')} maxLength={72} autoComplete={tab==='dang-ky'?'new-password':'current-password'}/></label>
    <button className="hsa-primary" disabled={busy}>{tab==='dang-nhap'?'Đăng nhập':'Tạo tài khoản'}</button>
   </form>
   {loi&&<p className="hsa-error" role="alert">{loi}</p>}{tin&&<p className="pt-ok" role="status">{tin}</p>}
  </div>}
  <div className="hsa-card pt-acc"><h2>Gói luyện đề</h2>
   {dm.goi.length?<ul className="pt-goi">{dm.goi.map(g=><li key={g.id}><strong>{g.ten}</strong><span>{g.moTa}</span>{g.gia!==null&&<b>{g.gia.toLocaleString('vi-VN')}đ</b>}</li>)}</ul>
    :<p>Gói luyện đề cho bạn ngoài trung tâm sắp mở bán. Bạn nhắn Zalo để được báo sớm và nhận mã dùng thử.</p>}
   <p className="hsa-actions"><a className="hsa-ghost" href={ZALO_ASSISTANT_URL} target="_blank" rel="noopener noreferrer">Nhắn Zalo 0967 365 413</a></p>
  </div>
 </div>;
}

function Hinh({src,alt}:{src:string;alt:string}){
 const url=src.trim().startsWith('<svg')?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(src):src;
 return <img className="pt-img" src={url} alt={alt} loading="lazy"/>;
}

function PhongLam({luot,update}:{luot:Luot;update:(l:Luot|null)=>void}){
 const {de,traLoi}=luot;
 const [now,setNow]=useState(Date.now()),[busy,setBusy]=useState(false),[loi,setLoi]=useState(''),[hoi,setHoi]=useState(false),[ten,setTen]=useState('');
 const ref=useRef(luot);ref.current=luot;
 // Thời gian từng câu: mỗi giây cộng cho câu đang tương tác (bấm, gõ) nếu câu đó còn trên màn hình, không thì câu hiện rõ nhất.
 const tg=useRef<Record<string,number>>({...(luot.tg??{})}),du=useRef(0),moc=useRef(Date.now()),hien=useRef(new Map<string,number>()),cham=useRef<string|null>(null);
 const ghi=(l:Luot)=>update({...l,tg:{...tg.current}});
 useEffect(()=>{
  const io=new IntersectionObserver(es=>{for(const e of es){const ma=(e.target as HTMLElement).dataset.ma!;e.isIntersecting?hien.current.set(ma,e.intersectionRect.height):hien.current.delete(ma);}},{threshold:[0,.1,.25,.5,.75,1],rootMargin:'-120px 0px 0px 0px'});
  document.querySelectorAll<HTMLElement>('.pt-q-wrap[data-ma]').forEach(el=>io.observe(el));
  const t=setInterval(()=>{const n=Date.now(),buoc=Math.min(n,ref.current.hetGio)-moc.current;moc.current=n;if(buoc<=0)return;
   const ma=cham.current&&hien.current.has(cham.current)?cham.current:[...hien.current].sort((a,b)=>b[1]-a[1])[0]?.[0];if(!ma)return;
   du.current+=buoc;const giay=Math.floor(du.current/1000);if(giay>0){du.current-=giay*1000;tg.current[ma]=(tg.current[ma]??0)+giay;}
   if(n%5000<1000)save({...ref.current,tg:{...tg.current}});},1000);
  // Không lưu khi rời phòng: lúc đó lượt đã nộp hoặc đã bỏ, lưu lại sẽ ghi đè kết quả.
  return()=>{io.disconnect();clearInterval(t);};
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 const set=(ma:string,v:unknown)=>{cham.current=ma;ghi({...ref.current,traLoi:{...ref.current.traLoi,[ma]:v}});};
 const xong=de.cau.filter(c=>daLam(c,traLoi[c.ma])).length,co=new Set(luot.co??[]);
 // Đánh dấu câu cần xem lại trước khi nộp (như phần mềm thi trên máy của HSA/TSA).
 const doiCo=(ma:string)=>{const n=new Set(ref.current.co??[]);n.has(ma)?n.delete(ma):n.add(ma);ghi({...ref.current,co:[...n]});};
 const nop=useCallback(async(tenBxh:string)=>{if(busy)return;setBusy(true);setLoi('');const s=ref.current;
  try{const d=await goi<{ketQua:PtKetQua;giay:number;quaGio:boolean;xepHang?:XepHang;khaoSat?:KhaoSat}>({action:'nop',de:s.de.id,ve:s.ve,traLoi:s.traLoi,thoiGian:{...tg.current},...(tenBxh.trim()?{ten:tenBxh.trim()}:{})});
   update({...s,tg:{...tg.current},ketQua:d.ketQua,giay:d.giay,quaGio:d.quaGio,xepHang:d.xepHang,khaoSat:d.khaoSat,nopLuc:Date.now()});window.scrollTo({top:0});}
  catch(e){setLoi((e as Error).message||'Chưa nộp được bài. Bài làm vẫn được lưu, em bấm nộp lại.');setBusy(false);}
 },[busy,update]);
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
 const het=now>=luot.hetGio;useEffect(()=>{if(het)void nop(ten);},[het]);// eslint-disable-line react-hooks/exhaustive-deps
 const chumDau=new Map(de.chum.map(g=>[g.cau[0],g]));
 let phanTruoc='';
 return <div className="pt-room">
  <div className="hsa-card pt-bar" role="region" aria-label="Thời gian và tiến độ">
   <span className="pt-bar-title">{luot.dot&&<small className="pt-bar-dot">{luot.dot.ten}{luot.dot.ks?' · SBD':''}</small>}{de.tieuDe}</span>
   <span className={'pt-clock'+(luot.hetGio-now<5*60000?' is-low':'')} aria-live="off">{fmt(luot.hetGio-now)}</span>
   <span className="pt-count">{xong}/{de.cau.length} câu</span>
   <button type="button" className="hsa-primary" onClick={()=>setHoi(true)} disabled={busy}>Nộp bài</button>
  </div>
  <ol className="pt-questions">{de.cau.map(c=>{const p=c.phan!==phanTruoc?de.phan.find(x=>x.ma===c.phan):undefined;phanTruoc=c.phan;const g=chumDau.get(c.ma);
   return <li key={c.ma} id={'cau-'+c.so} className="pt-q-wrap" data-ma={c.ma} onPointerDown={()=>{cham.current=c.ma;}} onFocus={()=>{cham.current=c.ma;}}>
    {p&&<h2 className="pt-part">{p.ten}<small>{p.soCau} câu</small></h2>}
    {g&&<div className="hsa-card pt-stem"><MathText text={g.de}/>{g.hinh&&<Hinh src={g.hinh} alt={'Hình dùng chung '+g.ma}/>}</div>}
    <div className="hsa-card pt-q">
     <p className="pt-q-head"><strong>Câu {c.so}</strong><span>{so(c.diem)} điểm</span><button type="button" className={'pt-flag'+(co.has(c.ma)?' is-on':'')} aria-pressed={co.has(c.ma)} onClick={()=>doiCo(c.ma)}>{co.has(c.ma)?'Đã đánh dấu':'Đánh dấu xem lại'}</button></p>
     <div className="pt-prompt"><MathText text={c.de}/></div>{c.hinh&&<Hinh src={c.hinh} alt={'Hình câu '+c.so}/>}
     <TraLoiCau c={c} v={traLoi[c.ma]} set={v=>set(c.ma,v)}/>
    </div>
   </li>;})}</ol>
  <nav className="hsa-card pt-jump" aria-label="Chuyển câu">{de.cau.map(c=><a key={c.ma} href={'#cau-'+c.so} className={(daLam(c,traLoi[c.ma])?'is-done':'')+(co.has(c.ma)?' is-flag':'')}>{c.so}</a>)}</nav>
  {loi&&<p className="hsa-error" role="alert">{loi}</p>}
  {hoi&&<div className="pt-dialog" role="dialog" aria-modal="true" aria-labelledby="pt-nop-title"><div className="hsa-card">
   <h2 id="pt-nop-title">Nộp bài?</h2>
   <p>{xong<de.cau.length?`Em còn ${de.cau.length-xong} câu chưa làm.`:'Em đã làm đủ các câu.'}{co.size?` ${co.size} câu đang đánh dấu xem lại.`:''} Còn {fmt(luot.hetGio-now)}.</p>
   {luot.dot?.ks?<p className="pt-note">Bài khảo sát xếp hạng theo số báo danh trong khối, không cần ghi tên.</p>:<label className="hsa-field"><span>Tên trên bảng xếp hạng <em className="dv-opt">(không bắt buộc, để trống thì không xếp hạng)</em></span><input value={ten} onChange={e=>setTen(e.target.value)} maxLength={24} placeholder="Ví dụ: Minh Anh 12A1"/></label>}
   <p className="hsa-actions"><button type="button" className="hsa-primary" disabled={busy} onClick={()=>void nop(ten)}>{busy?'Đang chấm…':'Nộp và xem điểm'}</button><button type="button" className="hsa-ghost" onClick={()=>setHoi(false)}>Làm tiếp</button></p>
  </div></div>}
  <p className="pt-quit"><button type="button" className="hsa-link" onClick={()=>{if(window.confirm('Bỏ lượt thi này? Bài đang làm sẽ bị xóa.'))update(null);}}>Bỏ lượt thi, về phòng chờ</button></p>
 </div>;
}

function TraLoiCau({c,v,set}:{c:PtCauCongKhai;v:unknown;set:(v:unknown)=>void}){
 const L='ABCDEF';
 if(c.kieu==='mc')return <div className="dv-choices" role="radiogroup" aria-label={'Câu '+c.so}>{c.luaChon!.map((x,i)=><label key={i} className={'dv-choice'+(v===L[i]?' is-on':'')}><input type="radio" name={c.ma} checked={v===L[i]} onChange={()=>set(L[i])}/><b>{L[i]}</b><span><MathText text={x}/></span></label>)}</div>;
 if(c.kieu==='nhieu'){const a=Array.isArray(v)?v as string[]:[];return <div className="dv-choices" role="group" aria-label={'Câu '+c.so+' (chọn nhiều)'}>{c.luaChon!.map((x,i)=><label key={i} className={'dv-choice'+(a.includes(L[i])?' is-on':'')}><input type="checkbox" checked={a.includes(L[i])} onChange={()=>set(a.includes(L[i])?a.filter(y=>y!==L[i]):[...a,L[i]].sort())}/><b>{L[i]}</b><span><MathText text={x}/></span></label>)}</div>;}
 if(c.kieu==='ds'){const a=Array.isArray(v)?v as (boolean|null)[]:[null,null,null,null];return <table className="pt-ds"><thead><tr><th scope="col">Ý</th><th scope="col">Đúng</th><th scope="col">Sai</th></tr></thead><tbody>{c.y!.map((x,i)=><tr key={i}>
  <th scope="row"><b>{'abcd'[i]})</b> <MathText text={x}/></th>
  {[true,false].map(b=><td key={String(b)}><label className={'pt-ds-btn'+(a[i]===b?' is-on':'')}><input type="radio" name={c.ma+'-'+i} checked={a[i]===b} onChange={()=>{const n=[0,1,2,3].map(j=>a[j]??null);n[i]=b;set(n);}}/><span>{b?'Đ':'S'}</span></label></td>)}
 </tr>)}</tbody></table>;}
 if(c.kieu==='keo-tha'){const a=Array.isArray(v)?v as (number|null)[]:[];return <div className="pt-kt">{c.o!.map((o,i)=><label key={i} className="hsa-field"><span><MathText text={o}/></span><select value={a[i]??''} onChange={e=>{const n=c.o!.map((_,j)=>a[j]??null);n[i]=e.target.value===''?null:Number(e.target.value);set(n);}}><option value="">Chọn</option>{c.the!.map((t,j)=><option key={j} value={j}>{t.replace(/\$/g,'')}</option>)}</select></label>)}</div>;}
 return <label className="dv-num pt-short"><span>Đáp số</span><input inputMode="decimal" maxLength={8} value={String(v??'')} onChange={e=>set(e.target.value.replace(/[^0-9,.\-]/g,''))} placeholder="Ví dụ: -1,5"/></label>;
}

function hienTraLoi(c:{kieu:string},x:unknown){
 if(x===null||x===undefined||x==='')return '—';
 if(c.kieu==='ds')return (x as (boolean|null)[]).map((b,i)=>'abcd'[i]+': '+(b===null?'—':b?'Đ':'S')).join('  ');
 if(Array.isArray(x))return x.map(y=>y===null?'—':typeof y==='number'?String(y+1):String(y)).join(', ');
 return String(x);
}

function KetQua({luot,update}:{luot:Luot;update:(l:Luot|null)=>void}){
 const k=luot.ketQua!,de=luot.de;const [loc,setLoc]=useState<'tat-ca'|'sai'>('sai');
 const [bxh,setBxh]=useState<{enabled:boolean;rows:{hang:number;ten:string;mtm:boolean;diem:number;giay?:number;sbd?:string;phanVi?:number}[]}|null>(null);
 const ks=!!luot.dot?.ks,khoi=luot.khaoSat?.thiSinh?.khoi??luot.dot?.khoi;
 const qBxh=ks&&khoi?'?xep-hang-ks='+encodeURIComponent(luot.dot!.ma)+'&khoi='+khoi:luot.dot&&!ks?'?xep-hang-dot='+encodeURIComponent(luot.dot.ma):'?xep-hang='+encodeURIComponent(k.de);
 useEffect(()=>{goi<typeof bxh>(undefined,qBxh).then(setBxh).catch(()=>setBxh(null));},[qBxh]);
 const cau=k.cau.filter(c=>loc==='tat-ca'||!c.dung);
 return <div className="pt-result">
  <section className="hsa-card hsa-result pt-score" aria-live="polite">
   <p className="dv-kicker">{de.tieuDe}</p>
   <p className="hsa-result-score"><strong>{so(k.diem)}/{so(k.thangDiem)}</strong><span>Đúng {k.dung}/{k.tong} câu · {Math.round((luot.giay??0)/60)} phút</span></p>
   {luot.quaGio&&<p className="pt-note">Bài nộp sau giờ quy định nên chỉ tính luyện tập, không vào bảng xếp hạng.</p>}
   {luot.xepHang?.status==='xep-hang'&&<p className="pt-ok">Em đứng hạng {luot.xepHang.hang}{luot.xepHang.n?'/'+luot.xepHang.n:''} trên bảng xếp hạng {ks?'khối '+khoi+' của kỳ khảo sát':luot.dot?'đợt '+luot.dot.ten:'đề này'}.</p>}
   {luot.dot&&luot.xepHang?.status==='luyen-tap'&&<p className="pt-note">Lượt này tính luyện tập: mỗi bạn chỉ tính lượt đầu tiên đúng giờ của đợt.</p>}
   <ul className="dv-sections">{k.theoPhan.map(p=><li key={p.ma}><span>{p.ten}</span><b>{so(p.diem)}/{so(p.toiDa)}</b><i style={{['--p' as string]:(p.toiDa?Math.round(100*p.diem/p.toiDa):0)+'%'}} className={p.diem>=0.7*p.toiDa?'is-good':p.diem>=0.5*p.toiDa?'is-mid':'is-low'}/></li>)}</ul>
   <p className="hsa-actions"><button type="button" className="hsa-primary" onClick={()=>update(null)}>Về phòng chờ</button><a className="hsa-ghost" href="#bao-cao">Báo cáo 1 trang</a></p>
  </section>
  <BaoCao1Trang luot={luot}/>
  {k.theoChuDe.length>0&&<section className="hsa-card pt-topics"><h2>Chủ đề cần ôn</h2><ul>{k.theoChuDe.filter(t=>t.dung<t.tong).slice(0,8).map(t=><li key={t.chuDe}><span>{tenChuDe(t.chuDe)}</span><b>{t.dung}/{t.tong}</b></li>)}</ul>
   {k.theoChuDe.every(t=>t.dung===t.tong)&&<p>Em làm đúng mọi chủ đề trong đề. Rất tốt!</p>}</section>}
  <section className="hsa-card pt-solutions"><h2>Đáp án và lời giải</h2>
   <div className="pt-acc-tabs" role="tablist">{(['sai','tat-ca'] as const).map(t=><button key={t} type="button" role="tab" aria-selected={loc===t} onClick={()=>setLoc(t)}>{t==='sai'?`Câu sai, bỏ trống (${k.tong-k.dung})`:'Tất cả câu'}</button>)}</div>
   <ol className="pt-sol-list">{cau.map(c=>{const q=de.cau.find(x=>x.ma===c.ma)!;return <li key={c.ma} className={c.dung?'is-ok':c.daLam?'is-bad':'is-skip'}>
    <p className="pt-q-head"><strong>Câu {c.so}</strong><span>Mã {c.ma}{c.chuDe?' · '+tenChuDe(c.chuDe):''}</span><em>{c.dung?'Đúng':c.daLam?(c.kieu==='ds'?`Đúng ${c.yDung}/4 ý`:'Sai'):'Bỏ trống'} · {so(c.diem)}/{so(c.toiDa)}</em></p>
    <details><summary>Xem đề</summary><div className="pt-prompt"><MathText text={q.de}/></div>{q.hinh&&<Hinh src={q.hinh} alt={'Hình câu '+c.so}/>}
     {q.luaChon&&<ol className="pt-sol-choices" type="A">{q.luaChon.map((x,i)=><li key={i}><MathText text={x}/></li>)}</ol>}{q.y&&<ol className="pt-sol-choices" type="a">{q.y.map((x,i)=><li key={i}><MathText text={x}/></li>)}</ol>}</details>
    <p className="pt-ans">Em chọn: <b>{hienTraLoi(c,c.traLoi)}</b> · Đáp án: <b>{hienTraLoi(c,c.dapAn)}</b></p>
    {c.loiGiai&&<div className="pt-sol"><MathText text={c.loiGiai}/></div>}
    <BaoLoi de={k.de} ma={c.ma} so={c.so}/>
   </li>;})}</ol>
  </section>
  <section className="hsa-card pt-rank"><h2>{ks?'Bảng xếp hạng khối '+(khoi??''):luot.dot?'Bảng xếp hạng đợt '+luot.dot.ten:'Bảng xếp hạng đề này'}</h2>
   {!bxh?<p className="pt-note">Đang tải…</p>:!bxh.enabled?<p className="pt-note">Bảng xếp hạng sẽ mở khi phòng thi chính thức hoạt động.</p>:!bxh.rows.length?<p className="pt-note">Chưa có lượt nào. Lượt đầu tiên đúng giờ có ghi tên sẽ vào bảng.</p>
    :<table className="pt-rank-table"><thead><tr><th>Hạng</th>{ks&&<th>SBD</th>}<th>Tên</th><th>Điểm</th><th>{ks?'Phân vị':'Thời gian'}</th></tr></thead><tbody>{bxh.rows.map(r=><tr key={r.hang+(r.sbd??'')}><td>{r.hang}</td>{ks&&<td>{r.sbd}</td>}<td>{r.ten}{r.mtm&&<span className="pt-mtm-tag">MTM</span>}</td><td>{so(r.diem)}</td><td>{ks?'Cao hơn '+(r.phanVi??0)+'%':Math.round((r.giay??0)/60)+' phút'}</td></tr>)}</tbody></table>}
   <p className="pt-note">{ks?'Xếp theo lượt đầu đúng giờ của mỗi SBD trong khối; chỉ hiện SBD và tên viết tắt.':luot.dot?'Mỗi bạn chỉ tính lượt đầu tiên làm đúng giờ trong đợt.':'Mỗi bạn chỉ tính lượt đầu tiên làm đúng giờ của mỗi đề.'}</p>
  </section>
 </div>;
}

const phutGiay=(g:number)=>(g>=60?Math.floor(g/60)+' ph ':'')+(g%60)+' giây';
/** Báo lỗi đề ở từng câu (≤ 500 ký tự). */
function BaoLoi({de,ma,so:soCau}:{de:string;ma:string;so:number}){
 const [mo,setMo]=useState(false),[nd,setNd]=useState(''),[tin,setTin]=useState(''),[loi,setLoi]=useState(''),[busy,setBusy]=useState(false);
 if(tin)return <p className="pt-ok pt-bl-ok" role="status">{tin}</p>;
 if(!mo)return <p className="pt-bl"><button type="button" className="hsa-link" onClick={()=>setMo(true)}>Báo lỗi đề</button></p>;
 return <form className="pt-bl-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setLoi('');try{const d=await goi<{message:string}>({action:'bao-loi',de,ma,noiDung:nd});setTin(d.message);}catch(x){setLoi((x as Error).message);}setBusy(false);}}>
  <label className="hsa-field"><span>Lỗi ở câu {soCau} (đề, đáp án hay lời giải?)</span><textarea value={nd} onChange={e=>setNd(e.target.value.slice(0,500))} maxLength={500} rows={3} required minLength={5}/></label>
  <p className="pt-bl-act"><small>{nd.length}/500</small><button className="hsa-primary" disabled={busy||nd.trim().length<5}>{busy?'Đang gửi…':'Gửi báo lỗi'}</button><button type="button" className="hsa-ghost" onClick={()=>setMo(false)}>Hủy</button></p>
  {loi&&<p className="hsa-error" role="alert">{loi}</p>}
 </form>;
}

/** Báo cáo 1 trang (in A4 bằng Ctrl+P: chỉ trang này được in). Kỳ khảo sát dùng bố cục MAU_BAO_CAO_1_TRANG_KY_KHAO_SAT; đề khác: điểm, phần, mạch/chủ đề, thời gian, câu cần xem lại, phân vị HSA ước lượng. */
function BaoCao1Trang({luot}:{luot:Luot}){
 const k=luot.ketQua!,b=useMemo(()=>baoCao(k),[k]),ngay=new Date(luot.nopLuc??Date.now()).toLocaleDateString('vi-VN'),ks=luot.dot?.ks?luot.khaoSat:null;
 const nhom=b.nhom.slice(0,ks?10:8);
 return <section className="hsa-card pt-report" id="bao-cao" aria-label="Báo cáo 1 trang">
  <header className="pt-rp-head"><p><b>MINH THÀNH MATH (MTM)</b>{ks||luot.dot?.ks?<>: Kỳ khảo sát {luot.dot!.ten}, {ngay}</>:<> · Báo cáo kết quả · {ngay}</>}</p>
   <button type="button" className="hsa-ghost pt-rp-print" onClick={()=>window.print()}>In báo cáo (A4)</button></header>
  {luot.dot?.ks?<>
   <p className="pt-rp-who">Học sinh: <b>{ks?.thiSinh?.ten??'—'}</b> · Lớp {ks?.thiSinh?.khoi??luot.dot.khoi??'—'} · Trường {ks?.thiSinh?.truong??'—'} · SBD {ks?.thiSinh?.sbd??'—'}</p>
   <h3>1. Kết quả</h3>
   <table className="pt-rp-table"><thead><tr><th>Điểm</th><th>Phân vị trong khối</th><th>Hạng</th><th>Số bài dự thi khối</th></tr></thead>
    <tbody><tr><td><b>{so(k.diem)}/{so(k.thangDiem)}</b></td><td>{ks?.em?'Cao hơn '+ks.em.phanVi+'% bạn cùng khối':'Đang cập nhật'}</td><td>{ks?.em?ks.em.hang+'/'+ks.em.n:'—'}</td><td>{ks?.n??'—'}</td></tr></tbody></table>
   <p className="pt-rp-line">Điểm từng phần: {k.theoPhan.map(p=>p.ten+' '+so(p.diem)+'/'+so(p.toiDa)).join(' · ')}</p>
   <h3>2. Theo chuyên đề</h3>
   <table className="pt-rp-table"><thead><tr><th>Chuyên đề</th><th>Đúng/Tổng</th><th>So với khối</th></tr></thead><tbody>{nhom.map(n=>{
    const cs=k.cau.filter(c=>(c.chuDe??'khac')===n.ma),khoiTl=ks&&cs.length&&cs.every(c=>ks.cau[c.ma]!==undefined)?cs.reduce((t,c)=>t+ks.cau[c.ma],0)/cs.length:null,em=n.dung/n.tong;
    return <tr key={n.ma}><td>{n.ten}</td><td>{n.dung}/{n.tong}</td><td>{khoiTl===null?'—':em>khoiTl+0.1?'Cao hơn':em<khoiTl-0.1?'Thấp hơn':'Ngang'}</td></tr>;})}</tbody></table>
   <h3>3. Ba dạng em mất điểm nhiều nhất</h3>
   <ol className="pt-rp-ol">{[...b.nhom].map(n=>({...n,mat:n.toiDa-n.diem})).filter(n=>n.mat>0).sort((x,y)=>y.mat-x.mat).slice(0,3).map(n=><li key={n.ma}><b>{n.ten}</b>: câu {b.canXem.filter(c=>(c.chuDe??'khac')===n.ma).map(c=>c.so).join(', ')}. <span className="pt-rp-blank">Nguyên nhân: …………………………</span></li>)}</ol>
   <h3>4. Việc cần làm trong 4 tuần</h3>
   <ul className="pt-rp-ul"><li>Tuần 1–2: <span className="pt-rp-blank">……………………………………………</span></li><li>Tuần 3–4: <span className="pt-rp-blank">……………………………………………</span></li><li>Mốc kế tiếp: <span className="pt-rp-blank">…………………</span></li></ul>
   <h3>5. Lời thầy</h3><p className="pt-rp-blank pt-rp-loi">……………………………………………………………………………………</p>
   <p className="pt-rp-foot">Thầy ……………… ký · Lời giải chi tiết: gửi mã đề <b>{k.de}</b> cho bot Zalo MTM.{ks?.em&&!ks.thiSinh?.mtm&&ks.em.phanVi>=70?' Buổi chữa đề trực tiếp: ……………, tại trung tâm.':''}</p>
  </>:<>
   <p className="pt-rp-who"><b>{k.tieuDe}</b>{luot.dot?' · '+luot.dot.ten:''}</p>
   <div className="pt-rp-score"><p><strong>{so(k.diem)}/{so(k.thangDiem)}</strong><span>Đúng {k.dung}/{k.tong} câu · {Math.round((luot.giay??0)/60)} phút</span></p>
    <ul>{k.theoPhan.map(p=><li key={p.ma}><span>{p.ten}</span><b>{so(p.diem)}/{so(p.toiDa)}</b><small>{p.dung}/{p.tong} câu</small></li>)}</ul></div>
   {b.phanVi&&<div className="pt-rp-pv"><p><b>Phân vị ước lượng:</b> {so(k.diem)}/50 quy đổi ×3 = <b>{so(b.phanVi.quyDoi)}/150</b> → khoảng <b>top {so(b.phanVi.top)}%</b> thí sinh HSA 2026.</p>
    <p className="pt-rp-small">Ước lượng, chỉ để tham chiếu: ĐHQGHN chưa công bố phổ điểm riêng phần Toán, nên so với phổ điểm toàn bài 2026 (116.839 bài; từ 105 điểm: 5,18%; từ 100: 10,11%; từ 90: 26,19%; từ 80: 48,77%; mốc 113 ≈ top 1%).</p></div>}
   <div className="pt-rp-grid">
    <div><h3>{b.theo==='mach'?'Theo 4 mạch kiến thức':'Theo chủ đề'}</h3>
     <table className="pt-rp-table"><thead><tr><th>{b.theo==='mach'?'Mạch':'Chủ đề'}</th><th>Đúng</th><th>Điểm</th>{b.coThoiGian&&<th>Thời gian</th>}</tr></thead>
      <tbody>{nhom.map(n=><tr key={n.ma} className={n.dung<n.tong*0.5?'is-low':''}><td>{n.ten}</td><td>{n.dung}/{n.tong}</td><td>{so(n.diem)}/{so(n.toiDa)}</td>{b.coThoiGian&&<td>{Math.round(n.giay/60)} ph</td>}</tr>)}</tbody></table>
     {b.nhom.length>nhom.length&&<p className="pt-rp-small">Còn {b.nhom.length-nhom.length} chủ đề khác, xem phần lời giải.</p>}</div>
    <div><h3>Câu tốn thời gian nhất</h3>
     {b.coThoiGian?<ol className="pt-rp-ol">{b.lauNhat.map(c=><li key={c.ma}>Câu {c.so}: {phutGiay(c.giay)} <em className={c.dung?'is-ok':'is-bad'}>{c.dung?'đúng':'sai'}</em></li>)}</ol>:<p className="pt-rp-small">Lượt này chưa có số liệu thời gian từng câu.</p>}
    </div>
   </div>
   <h3>Câu sai, bỏ trống cần xem lại ({b.canXem.length})</h3>
   {b.canXem.length?<p className="pt-rp-chips">{b.canXem.map(c=><span key={c.ma} className={c.daLam?'is-bad':'is-skip'}>{c.so}{c.chuDe?' · '+tenChuDe(c.chuDe):''}</span>)}</p>:<p>Em làm đúng tất cả các câu.</p>}
   <p className="pt-rp-foot">Lời giải từng câu: mục "Đáp án và lời giải" trên minhthanhmath.vn/phong-thi-thu · Mã đề {k.de}</p>
  </>}
 </section>;
}
