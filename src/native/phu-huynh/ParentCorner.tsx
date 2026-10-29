import {useEffect,useMemo,useState,type FormEvent,type ReactNode} from 'react';
import type {ParentChild,ParentHomework,ParentReport} from './contract';
import './parent.css';

/** Góc phụ huynh /phu-huynh (20/10). Chỉ đọc. Ghép con khi khớp sổ trung tâm; phiên là cookie HttpOnly do máy chủ đặt. */
type Reply={status:number;data:any};
async function ph(action:string,body:Record<string,unknown>={}):Promise<Reply>{
 try{
  const r=await fetch('/api/btvn',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({ph:action,...body}),signal:AbortSignal.timeout(30000)});
  let data:any={};try{data=await r.json();}catch{/* máy chủ trả rỗng */}
  return {status:r.status,data};
 }catch{return {status:0,data:{message:'Chưa kết nối được. Phụ huynh kiểm tra mạng rồi thử lại.'}};}
}
const message=(r:Reply)=>typeof r.data?.message==='string'?r.data.message:'Hệ thống đang bận. Phụ huynh thử lại sau ít phút.';
const day=(iso:string|null)=>{if(!iso)return '';const [y,m,d]=iso.slice(0,10).split('-');return `${d}/${m}/${y}`;};
const weekday=(iso:string)=>['CN','T2','T3','T4','T5','T6','T7'][new Date(iso.slice(0,10)+'T12:00:00+07:00').getDay()];
const score=(n:number|null)=>n===null?'–':(Math.round(n*100)/100).toLocaleString('vi-VN');
const STATUS:Record<ParentHomework['status'],string>={'da-nop':'Đã nộp','muon':'Nộp muộn','chua-nop':'Chưa đến hạn','qua-han':'Chưa làm','chua-mo':'Chưa mở'};

export default function ParentCorner(){
 const [phase,setPhase]=useState<'checking'|'gate'|'in'>('checking');
 const [parentName,setParentName]=useState<string|null>(null);
 const [children,setChildren]=useState<ParentChild[]>([]);
 const [adding,setAdding]=useState(false);
 useEffect(()=>{void ph('children').then(r=>{if(r.status===200){setParentName(r.data.parentName);setChildren(r.data.children);setPhase('in');}else setPhase('gate');});},[]);
 const enter=(data:any)=>{setParentName(data.parentName);setChildren(data.children);setAdding(false);setPhase('in');};
 const logout=async()=>{await ph('logout');setChildren([]);setParentName(null);setPhase('gate');};
 return <section className="ph-page mig-container">
  <header className="ph-hero">
   <p className="ph-eyebrow">Góc phụ huynh MTM</p>
   <h1>Theo dõi việc học của con</h1>
   <p>Điểm danh từng buổi, bài tập về nhà, điểm thi và phần con cần luyện thêm. Số liệu lấy cùng sổ điểm danh và bảng điểm của trung tâm.</p>
  </header>
  {phase==='checking'&&<p className="ph-note" role="status">Đang kiểm tra phiên đăng nhập…</p>}
  {phase==='gate'&&<Gate onEnter={enter}/>}
  {phase==='in'&&(adding?<div className="ph-card"><div className="ph-row-head"><h2>Ghép thêm con</h2><button className="ph-link" onClick={()=>setAdding(false)}>Quay lại</button></div><LinkForm onEnter={enter} known/></div>
   :<Dashboard parentName={parentName} items={children} onAdd={()=>setAdding(true)} onLogout={logout} onExpired={()=>setPhase('gate')}/>)}
 </section>;
}

function Gate({onEnter}:{onEnter:(data:any)=>void}){
 const [tab,setTab]=useState<'login'|'link'>('login');
 return <div className="ph-card ph-gate">
  <div className="ph-tabs" role="tablist">
   <button role="tab" aria-selected={tab==='login'} onClick={()=>setTab('login')}>Đăng nhập</button>
   <button role="tab" aria-selected={tab==='link'} onClick={()=>setTab('link')}>Lần đầu: ghép con</button>
  </div>
  {tab==='login'?<LoginForm onEnter={onEnter} onFirst={()=>setTab('link')}/>:<LinkForm onEnter={onEnter}/>}
  <p className="ph-small">Quên mã PIN: phụ huynh nhắn quản lý lớp hoặc Zalo 0967 365 413 để được đặt lại. Trung tâm không hỏi mã PIN qua điện thoại.</p>
 </div>;
}

function LoginForm({onEnter,onFirst}:{onEnter:(d:any)=>void;onFirst:()=>void}){
 const [phone,setPhone]=useState(''),[pin,setPin]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');const r=await ph('login',{parentPhone:phone.trim(),pin});setBusy(false);if(r.status===200)onEnter(r.data);else setError(r.status===428?'Số này chưa ghép con. Phụ huynh chọn "Lần đầu: ghép con".':message(r));};
 return <form onSubmit={submit} className="ph-form">
  <label>Số điện thoại phụ huynh<input inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} required maxLength={20}/></label>
  <label>Mã PIN 6 số<input inputMode="numeric" autoComplete="current-password" type="password" pattern="[0-9]{6}" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} required/></label>
  {error&&<p className="ph-error" role="alert">{error}</p>}
  <button className="ph-primary" disabled={busy}>{busy?'Đang kiểm tra…':'Vào Góc phụ huynh'}</button>
  <p className="ph-small">Lần đầu vào? <button type="button" className="ph-link" onClick={onFirst}>Ghép con với số điện thoại của phụ huynh</button></p>
 </form>;
}

function LinkForm({onEnter,known=false}:{onEnter:(d:any)=>void;known?:boolean}){
 const [f,setF]=useState({parentName:'',parentPhone:'',childName:'',childPhone:'',className:''});
 const [classes,setClasses]=useState<string[]>([]);
 const [pinStep,setPinStep]=useState<null|'setup'|'required'>(null);
 const [pin,setPin]=useState(''),[pin2,setPin2]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{void ph('classes').then(r=>{if(r.status===200&&Array.isArray(r.data.classes))setClasses(r.data.classes);});},[]);
 const set=(k:keyof typeof f)=>(e:{target:{value:string}})=>setF({...f,[k]:e.target.value});
 const submit=async(e:FormEvent)=>{
  e.preventDefault();setError('');
  if(pinStep==='setup'&&pin!==pin2)return setError('Hai lần nhập mã PIN chưa giống nhau.');
  setBusy(true);
  const r=await ph('link',{...f,parentPhone:f.parentPhone.trim(),childPhone:f.childPhone.trim(),childName:f.childName.trim(),parentName:f.parentName.trim(),...(pinStep==='setup'?{newPin:pin}:pinStep==='required'?{pin}:{})});
  setBusy(false);
  if(r.status===200)return onEnter(r.data);
  if(r.status===428){setPinStep(r.data.pin==='setup'?'setup':'required');setPin('');setPin2('');return;}
  setError(message(r));
 };
 const pinInput=(value:string,on:(v:string)=>void,label:string,auto:string)=><label>{label}<input inputMode="numeric" type="password" autoComplete={auto} pattern="[0-9]{6}" value={value} onChange={e=>on(e.target.value.replace(/\D/g,'').slice(0,6))} required/></label>;
 return <form onSubmit={submit} className="ph-form">
  {!pinStep&&<>
   <p className="ph-small">Điền đúng như trong sổ của trung tâm. Hệ thống chỉ mở khi cả năm thông tin khớp với hồ sơ của con.</p>
   <label>Họ tên phụ huynh<input autoComplete="name" value={f.parentName} onChange={set('parentName')} required maxLength={80}/></label>
   <label>Số điện thoại phụ huynh<input inputMode="tel" autoComplete="tel" value={f.parentPhone} onChange={set('parentPhone')} required maxLength={20}/></label>
   <label>Họ tên con (đầy đủ, có dấu)<input value={f.childName} onChange={set('childName')} required maxLength={80}/></label>
   <label>Số điện thoại của con<input inputMode="tel" value={f.childPhone} onChange={set('childPhone')} required maxLength={20}/><span className="ph-hint">Con chưa có số riêng thì điền số phụ huynh đã đăng ký cho con.</span></label>
   <label>Lớp của con<select value={f.className} onChange={set('className')} required><option value="">Chọn lớp</option>{classes.map(c=><option key={c}>{c}</option>)}</select></label>
  </>}
  {pinStep==='setup'&&<><p className="ph-ok">Thông tin đã khớp sổ trung tâm. Phụ huynh tạo mã PIN 6 số riêng (khác mã của con) để lần sau vào nhanh.</p>{pinInput(pin,setPin,'Mã PIN mới','new-password')}{pinInput(pin2,setPin2,'Nhập lại mã PIN','new-password')}</>}
  {pinStep==='required'&&<><p className="ph-ok">{known?'Phụ huynh nhập mã PIN để xác nhận ghép thêm con.':'Số điện thoại này đã có mã PIN. Phụ huynh nhập mã PIN để ghép thêm con.'}</p>{pinInput(pin,setPin,'Mã PIN 6 số','current-password')}</>}
  {error&&<p className="ph-error" role="alert">{error}</p>}
  <button className="ph-primary" disabled={busy}>{busy?'Đang kiểm tra…':pinStep==='setup'?'Tạo mã PIN và vào':pinStep==='required'?'Xác nhận':'Kiểm tra thông tin'}</button>
  {pinStep&&<button type="button" className="ph-link" onClick={()=>{setPinStep(null);setError('');}}>Sửa lại thông tin</button>}
 </form>;
}

function Dashboard({parentName,items,onAdd,onLogout,onExpired}:{parentName:string|null;items:ParentChild[];onAdd:()=>void;onLogout:()=>void;onExpired:()=>void}){
 const [childId,setChildId]=useState(items[0]?.id??'');
 const [report,setReport]=useState<ParentReport|null>(null),[error,setError]=useState(''),[zalo,setZalo]=useState<{code:string;expiresAt:number}|null>(null);
 useEffect(()=>{if(!childId)return;setReport(null);setError('');void ph('report',{childId}).then(r=>{if(r.status===200)setReport(r.data);else if(r.status===401)onExpired();else setError(message(r));});},[childId]);
 const zaloCode=async()=>{const r=await ph('zalo');if(r.status===200)setZalo(r.data);else if(r.status===401)onExpired();else setError(message(r));};
 return <>
  <div className="ph-card ph-bar">
   <p>Xin chào {parentName?<strong>phụ huynh {parentName}</strong>:'phụ huynh'}.</p>
   <div className="ph-actions"><button className="ph-ghost" onClick={zaloCode}>Mã ghép Zalo</button><button className="ph-ghost" onClick={onAdd}>Ghép thêm con</button><button className="ph-ghost" onClick={onLogout}>Đăng xuất</button></div>
  </div>
  {zalo&&<div className="ph-card ph-zalo" role="status"><p>Mã ghép Zalo: <strong className="ph-code">{zalo.code}</strong></p><p className="ph-small">Nhắn mã này cho Zalo Toán Thầy Thành của trung tâm trong 10 phút để nhận tin học tập của con qua Zalo. Mã dùng một lần; không đưa mã cho người khác.</p></div>}
  {items.length>1&&<div className="ph-tabs ph-children" role="tablist">{items.map(c=><button key={c.id} role="tab" aria-selected={c.id===childId} onClick={()=>setChildId(c.id)}>{c.fullName}<small>{c.className}</small></button>)}</div>}
  {!items.length&&<p className="ph-note">Chưa có con nào đang học được ghép. <button className="ph-link" onClick={onAdd}>Ghép con</button></p>}
  {error&&<p className="ph-error" role="alert">{error}</p>}
  {childId&&!report&&!error&&<p className="ph-note" role="status">Đang tải số liệu của con…</p>}
  {report&&<Report r={report}/>}
 </>;
}

function Report({r}:{r:ParentReport}){
 const s=r.summary;
 const rows=useMemo(()=>{
  const map=new Map<string,{date:string;att?:string;attStatus?:string;hw:ParentHomework[]}>();
  for(const a of r.attendance){const row=map.get(a.date)??{date:a.date,hw:[]};row.att=row.att?row.att+', '+a.label:a.label;row.attStatus=a.status;map.set(a.date,row);}
  for(const h of r.homework){if(h.kind==='kiem-tra-thang')continue;const row=map.get(h.date)??{date:h.date,hw:[]};row.hw.push(h);map.set(h.date,row);}
  return [...map.values()].filter(x=>x.date<=new Date(r.generatedAt+7*3600e3).toISOString().slice(0,10)).sort((a,b)=>b.date.localeCompare(a.date));
 },[r]);
 const monthly=r.homework.filter(h=>h.kind==='kiem-tra-thang'&&h.bestScore!==null);
 return <div className="ph-report">
  <div className="ph-stats">
   <Stat label="Lớp" value={r.child.className} note={r.child.fullName}/>
   <Stat label="Buổi học kế tiếp" value={r.upcoming?`${weekday(r.upcoming)} ${day(r.upcoming)}${/T\d{2}:\d{2}/.test(r.upcoming)?' · '+r.upcoming.slice(11,16):''}`:'Theo lịch lớp'} note={<a href="/#timetable">Xem lịch học</a>}/>
   <Stat label="Đi học tháng này" value={s.monthAttendance?`${s.monthAttendance.attended}/${s.monthAttendance.total} buổi`:'Chưa có buổi'} note={s.monthAttendance?Math.round(s.monthAttendance.attended/s.monthAttendance.total*100)+'%':''}/>
   <Stat label="BTVN đã nộp" value={`${s.submitted}/${s.dueTotal} bài`} note={s.dueTotal?Math.round(s.submitted/s.dueTotal*100)+'% đến hạn':''}/>
   <Stat label="Điểm BTVN trung bình" value={score(s.averageScore)} note="các bài đã nộp, lấy lần cao nhất, thang 10"/>
   <Stat label="Hạng BTVN tháng trong lớp" value={r.rank?'Hạng '+r.rank.rank:'Chưa xếp'} note={r.rank?.score!==null&&r.rank?.score!==undefined?'điểm tháng '+score(r.rank.score)+' (bài chưa nộp tính 0 điểm)':''}/>
  </div>
  {s.missing.length>0&&<div className="ph-card ph-warn"><h2>Bài chưa nộp</h2><ul>{s.missing.map(m=><li key={m.lessonCode}>{day(m.date)}: {m.title}</li>)}</ul><p className="ph-small">Con vào <a href="/btvn">minhthanhmath.vn/btvn</a> để làm bù. Bài nộp lại vẫn được tính trong báo cáo tối.</p></div>}
  <div className="ph-two">
   <div className="ph-card"><h2>Phần con làm tốt</h2>{s.strong.length?<ul className="ph-topics">{s.strong.map(t=><li key={t.lessonCode}><span>{t.title}</span><b className="ph-good">{score(t.score)}</b></li>)}</ul>:<p className="ph-small">Chưa đủ bài để đánh giá.</p>}</div>
   <div className="ph-card"><h2>Phần cần luyện thêm</h2>{s.weak.length?<><ul className="ph-topics">{s.weak.map(t=><li key={t.lessonCode}><span>{t.title}</span><b className="ph-bad">{score(t.score)}</b></li>)}</ul><p className="ph-small">Gợi ý: con làm lại các buổi này trong <a href="/btvn">BTVN</a> (mỗi bài được làm nhiều lượt) và luyện thêm ở <a href="/luyen-tap">Luyện tập</a>.</p></>:<p className="ph-small">Chưa có bài dưới 8 điểm.</p>}</div>
  </div>
  <div className="ph-card"><h2>Điểm BTVN theo thời gian</h2><Chart homework={r.homework}/></div>
  {(monthly.length>0||r.papers.length>0)&&<div className="ph-card"><h2>Điểm thi</h2><table className="ph-table"><thead><tr><th>Ngày</th><th>Bài thi</th><th>Điểm</th></tr></thead><tbody>
   {monthly.map(m=><tr key={m.lessonCode}><td>{day(m.date)}</td><td>{m.title}</td><td>{score(m.bestScore)}</td></tr>)}
   {r.papers.map(p=><tr key={p.testCode+p.date}><td>{day(p.date)}</td><td>{p.subject||'Bài kiểm tra trên lớp'}</td><td>{score(p.score)}/{p.maxScore}</td></tr>)}
  </tbody></table></div>}
  <div className="ph-card"><h2>Từng buổi học</h2>{rows.length?<div className="ph-scroll"><table className="ph-table ph-days"><thead><tr><th>Ngày</th><th>Điểm danh</th><th>Bài</th><th>BTVN</th><th>Điểm</th></tr></thead><tbody>
   {rows.map(row=>{const h=row.hw[0];return <tr key={row.date}><td className="ph-day">{weekday(row.date)} {day(row.date)}</td><td data-label="Điểm danh" className={row.attStatus==='vang'?'ph-bad':row.attStatus==='di_muon'?'ph-mid':''}>{row.att??'–'}</td><td data-label="Bài" className="ph-title">{h?.title??'–'}</td><td data-label="BTVN" className={h?.status==='qua-han'?'ph-bad':h?.status==='muon'?'ph-mid':''}>{h?STATUS[h.status]:'–'}</td><td data-label="Điểm">{h?score(h.bestScore):'–'}</td></tr>;})}
  </tbody></table></div>:<p className="ph-small">Chưa có buổi học nào được ghi.</p>}</div>
  <p className="ph-small">Cập nhật lúc {new Date(r.generatedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}. Thắc mắc về số liệu, phụ huynh nhắn quản lý lớp hoặc Zalo 0967 365 413.</p>
 </div>;
}
function Stat({label,value,note}:{label:string;value:string;note?:ReactNode}){return <div className="ph-stat"><span>{label}</span><strong>{value}</strong>{note?<small>{note}</small>:null}</div>;}

function Chart({homework}:{homework:ParentHomework[]}){
 const pts=homework.filter(h=>h.kind!=='kiem-tra-thang'&&h.bestScore!==null).sort((a,b)=>a.date.localeCompare(b.date)).slice(-20);
 if(pts.length<2)return <p className="ph-small">Cần ít nhất 2 bài có điểm để vẽ biểu đồ.</p>;
 const W=640,H=220,L=34,R=30,T=12,B=34,x=(i:number)=>L+(W-L-R)*i/(pts.length-1),y=(v:number)=>T+(H-T-B)*(1-v/10);
 const line=pts.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p.bestScore!).toFixed(1)}`).join(' ');
 return <svg className="ph-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={'Điểm BTVN '+pts.length+' bài gần nhất'}>
  {[0,5,7,10].map(v=><g key={v}><line x1={L} x2={W-R} y1={y(v)} y2={y(v)} className={v===7?'ph-grid ph-grid-7':'ph-grid'}/><text x={L-6} y={y(v)+4} textAnchor="end">{v}</text></g>)}
  <path d={line} className="ph-line"/>
  {pts.map((p,i)=><g key={p.lessonCode}><circle cx={x(i)} cy={y(p.bestScore!)} r="4.5" className={p.bestScore!<7?'ph-dot ph-dot-low':'ph-dot'}><title>{day(p.date)}: {p.title} — {score(p.bestScore)}</title></circle>{(i===0||i===pts.length-1||pts.length<=8)&&<text x={x(i)} y={H-12} textAnchor="middle">{day(p.date).slice(0,5)}</text>}</g>)}
 </svg>;
}
