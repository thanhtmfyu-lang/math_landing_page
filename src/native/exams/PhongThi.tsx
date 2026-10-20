import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import R106PageIntro from '../../migration/R106PageIntro';
import MathText from '../math/MathText';
import {Link} from '../../migration/navigation';
import {ZALO_ASSISTANT_URL} from '../../components/mtm-contact';
import {PT_LOAI,PT_LOAI_TEN,PT_NHOM_TEN,tenChuDe,type PtDeCongKhai,type PtKetQua,type PtLoai,type PtMucLuc,type PtCauCongKhai} from '../../../server/phong-thi/engine';
import './hsa-mock.css';
import './entrance-test.css';
import './phong-thi.css';

const API='/api/phong-thi',KEY='mtm:phong-thi:v1';
type Quyen={mo:true}|{mo:false;lyDo:'hoc-sinh-mtm'|'can-goi'};
type MucDe=PtMucLuc&{quyen:Quyen};
type LichSu={de:string;diem:number;thang:number;dung:number;tong:number;giay:number;quaGio:boolean;luc:string};
type NguoiXem={kieu:'hoc-sinh';ten:string|null}|{kieu:'tai-khoan';ten:string;goi:{loai:PtLoai[];den:string}[]}|{kieu:'khach'};
type Goi={id:string;ten:string;loai:PtLoai[];soNgay:number;gia:number|null;moTa:string};
type DanhMuc={nguoiXem:NguoiXem;de:MucDe[];goi:Goi[];lichSu?:LichSu[]};
type TraLoi=Record<string,unknown>;
type Luot={de:PtDeCongKhai;ve:string;batDau:number;hetGio:number;traLoi:TraLoi;co?:string[];ketQua?:PtKetQua;giay?:number;quaGio?:boolean;xepHang?:{status:string;hang?:number}};
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
 const mo=async(id:string)=>{setBusy(id);setLoi('');
  try{const d=await goi<{de:PtDeCongKhai;ve:string;batDau:number;hetGio:number}>({action:'mo',de:id});
   // Giờ kết thúc tính theo đồng hồ máy em, lệch giờ máy chủ không làm mất phút làm bài.
   const lech=Date.now()-d.batDau;onMo({de:d.de,ve:d.ve,batDau:d.batDau+lech,hetGio:d.hetGio+lech,traLoi:{}});window.scrollTo({top:0});}
  catch(e){setLoi((e as Error).message);setBusy('');}
 };
 const ds=useMemo(()=>(dm?.de??[]).filter(d=>d.loai===loai),[dm,loai]);
 const nhom=useMemo(()=>[...new Set(ds.map(d=>d.nhom))],[ds]);
 const ls=new Map((dm?.lichSu??[]).map(l=>[l.de,l]));
 return <div className="pt-lobby">
  <div className="pt-main">
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
  </div>
  <aside className="pt-side" id="tai-khoan">{dm&&<TaiKhoan dm={dm} onDoi={tai}/>}</aside>
 </div>;
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
 const set=(ma:string,v:unknown)=>update({...ref.current,traLoi:{...ref.current.traLoi,[ma]:v}});
 const xong=de.cau.filter(c=>daLam(c,traLoi[c.ma])).length,co=new Set(luot.co??[]);
 // Đánh dấu câu cần xem lại trước khi nộp (như phần mềm thi trên máy của HSA/TSA).
 const doiCo=(ma:string)=>{const n=new Set(ref.current.co??[]);n.has(ma)?n.delete(ma):n.add(ma);update({...ref.current,co:[...n]});};
 const nop=useCallback(async(tenBxh:string)=>{if(busy)return;setBusy(true);setLoi('');const s=ref.current;
  try{const d=await goi<{ketQua:PtKetQua;giay:number;quaGio:boolean;xepHang?:{status:string;hang?:number}}>({action:'nop',de:s.de.id,ve:s.ve,traLoi:s.traLoi,...(tenBxh.trim()?{ten:tenBxh.trim()}:{})});
   update({...s,ketQua:d.ketQua,giay:d.giay,quaGio:d.quaGio,xepHang:d.xepHang});window.scrollTo({top:0});}
  catch(e){setLoi((e as Error).message||'Chưa nộp được bài. Bài làm vẫn được lưu, em bấm nộp lại.');setBusy(false);}
 },[busy,update]);
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
 const het=now>=luot.hetGio;useEffect(()=>{if(het)void nop(ten);},[het]);// eslint-disable-line react-hooks/exhaustive-deps
 const chumDau=new Map(de.chum.map(g=>[g.cau[0],g]));
 let phanTruoc='';
 return <div className="pt-room">
  <div className="hsa-card pt-bar" role="region" aria-label="Thời gian và tiến độ">
   <span className="pt-bar-title">{de.tieuDe}</span>
   <span className={'pt-clock'+(luot.hetGio-now<5*60000?' is-low':'')} aria-live="off">{fmt(luot.hetGio-now)}</span>
   <span className="pt-count">{xong}/{de.cau.length} câu</span>
   <button type="button" className="hsa-primary" onClick={()=>setHoi(true)} disabled={busy}>Nộp bài</button>
  </div>
  <ol className="pt-questions">{de.cau.map(c=>{const p=c.phan!==phanTruoc?de.phan.find(x=>x.ma===c.phan):undefined;phanTruoc=c.phan;const g=chumDau.get(c.ma);
   return <li key={c.ma} id={'cau-'+c.so} className="pt-q-wrap">
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
   <label className="hsa-field"><span>Tên trên bảng xếp hạng <em className="dv-opt">(không bắt buộc, để trống thì không xếp hạng)</em></span><input value={ten} onChange={e=>setTen(e.target.value)} maxLength={24} placeholder="Ví dụ: Minh Anh 12A1"/></label>
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
 const [bxh,setBxh]=useState<{enabled:boolean;rows:{hang:number;ten:string;mtm:boolean;diem:number;giay:number}[]}|null>(null);
 useEffect(()=>{goi<typeof bxh>(undefined,'?xep-hang='+encodeURIComponent(k.de)).then(setBxh).catch(()=>setBxh(null));},[k.de]);
 const cau=k.cau.filter(c=>loc==='tat-ca'||!c.dung);
 return <div className="pt-result">
  <section className="hsa-card hsa-result pt-score" aria-live="polite">
   <p className="dv-kicker">{de.tieuDe}</p>
   <p className="hsa-result-score"><strong>{so(k.diem)}/{so(k.thangDiem)}</strong><span>Đúng {k.dung}/{k.tong} câu · {Math.round((luot.giay??0)/60)} phút</span></p>
   {luot.quaGio&&<p className="pt-note">Bài nộp sau giờ quy định nên chỉ tính luyện tập, không vào bảng xếp hạng.</p>}
   {luot.xepHang?.status==='xep-hang'&&<p className="pt-ok">Em đứng hạng {luot.xepHang.hang} trên bảng xếp hạng đề này.</p>}
   <ul className="dv-sections">{k.theoPhan.map(p=><li key={p.ma}><span>{p.ten}</span><b>{so(p.diem)}/{so(p.toiDa)}</b><i style={{['--p' as string]:(p.toiDa?Math.round(100*p.diem/p.toiDa):0)+'%'}} className={p.diem>=0.7*p.toiDa?'is-good':p.diem>=0.5*p.toiDa?'is-mid':'is-low'}/></li>)}</ul>
   <p className="hsa-actions"><button type="button" className="hsa-primary" onClick={()=>update(null)}>Về phòng chờ</button><button type="button" className="hsa-ghost" onClick={()=>window.print()}>In kết quả</button></p>
  </section>
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
   </li>;})}</ol>
  </section>
  <section className="hsa-card pt-rank"><h2>Bảng xếp hạng đề này</h2>
   {!bxh?<p className="pt-note">Đang tải…</p>:!bxh.enabled?<p className="pt-note">Bảng xếp hạng sẽ mở khi phòng thi chính thức hoạt động.</p>:!bxh.rows.length?<p className="pt-note">Chưa có lượt nào. Lượt đầu tiên đúng giờ có ghi tên sẽ vào bảng.</p>
    :<table className="pt-rank-table"><thead><tr><th>Hạng</th><th>Tên</th><th>Điểm</th><th>Thời gian</th></tr></thead><tbody>{bxh.rows.map(r=><tr key={r.hang}><td>{r.hang}</td><td>{r.ten}{r.mtm&&<span className="pt-mtm-tag">MTM</span>}</td><td>{so(r.diem)}</td><td>{Math.round(r.giay/60)} phút</td></tr>)}</tbody></table>}
   <p className="pt-note">Mỗi bạn chỉ tính lượt đầu tiên làm đúng giờ của mỗi đề.</p>
  </section>
 </div>;
}
