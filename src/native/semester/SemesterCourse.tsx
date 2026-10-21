import {useEffect, useRef, useState} from 'react';
import {BookOpen, CalendarDays, LockKeyhole, PlayCircle} from 'lucide-react';
import {RegisterSection} from '../../components/RegisterSection';
import {ZALO_ASSISTANT_URL} from '../../components/mtm-contact';
import {Link} from '../../migration/navigation';
import {SEMESTER_GRADES, SEMESTER_START, semesterLessons, type SemesterGrade, type SemesterState} from './catalogue';
import './semester.css';

async function api(body: object) {
  const r = await fetch('/api/exam?muc=on-cuoi-ky-1', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  const data = await r.json().catch(() => null);
  if (!r.ok || !data) throw Object.assign(new Error(data?.message || 'Chưa kết nối được khóa ôn. Em thử lại sau.'), {status:r.status});
  return data;
}
export default function SemesterCourse() {
  const [grade, setGrade] = useState<SemesterGrade>('12');
  const [state, setState] = useState<SemesterState|null>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [code, setCode] = useState(''), [video, setVideo] = useState<{url:string; title:string}|null>(null);
  const requests = useRef(new Map<string,{id:string;expiresAt?:number}>()), revision = useRef(0), pending = useRef(false);
  const reusable=(id:string)=>{const r=requests.current.get(id);return !!r&&(!r.expiresAt||r.expiresAt>Date.now());};
  const activeGrade=useRef(grade);activeGrade.current=grade;
  const refresh = async (g = grade, rev = revision.current) => {
    try {const data = await api({action:'state', grade:g}); if (rev === revision.current&&g===activeGrade.current) {setState(data); setMessage('');}}
    catch (e) {if (rev === revision.current&&g===activeGrade.current) {if((e as any).status===401){setState(null);setVideo(null);requests.current.clear();}setMessage((e as Error).message);}}
  };
  useEffect(() => {revision.current++; const rev=revision.current; setState(null); setVideo(null); setMessage('');setCode('');void refresh(grade,rev);return()=>{revision.current++;};}, [grade]);
  async function play(id:string, title:string) {
    if (pending.current) return;
    pending.current=true;setBusy(true);setMessage('');const rev=revision.current;
    if (!reusable(id)) requests.current.set(id,{id:crypto.randomUUID()});
    try {const data=await api({action:'play',grade,video:id,requestId:requests.current.get(id)!.id});
      if (rev===revision.current) {requests.current.get(id)!.expiresAt=Date.parse(data.expiresAt);setVideo({url:data.url,title});await refresh();}}
    catch(e){if(rev===revision.current){if((e as any).status===409)requests.current.delete(id);if((e as any).status===401){setState(null);setVideo(null);requests.current.clear();}setMessage((e as Error).message);}}
    finally{pending.current=false;setBusy(false);}
  }
  async function activate(e:React.FormEvent) {
    e.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);const rev=revision.current;
    try {await api({action:'activate',grade,code});if(rev===revision.current){setCode('');await refresh();setMessage('Đã mở phần nâng cao cho tài khoản của em.');}}
    catch(e){if(rev===revision.current){if((e as any).status===401){setState(null);setVideo(null);requests.current.clear();}setMessage((e as Error).message);}}
    finally{pending.current=false;setBusy(false);}
  }
  const scrollRegister=()=>document.getElementById('register')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  return <div className="mig-container semester-course">
    <section className="semester-hero">
      <div><span className="semester-eyebrow">MINH THÀNH MATH · TOÁN 10–12</span><h1>Vững từng tuần.<br/><em>Sẵn sàng cuối kỳ I.</em></h1>
      <p>Chọn lộ trình của em, củng cố kiến thức và luyện tập theo tuần.</p>
      <div className="semester-actions"><button className="mig-button primary" onClick={scrollRegister}>Đăng ký miễn phí</button><Link className="mig-button outline" href="/btvn">Đăng nhập BTVN</Link></div></div>
      <aside><BookOpen size={36} aria-hidden="true"/><h2>Ôn cuối kỳ I</h2><p>Toán lớp 10 · 11 · 12</p><p><CalendarDays size={18} aria-hidden="true"/> Mốc mở khóa: {SEMESTER_START}</p><span>Học có lộ trình · Hiểu bản chất</span></aside>
    </section>
    <p className="semester-sample" role="note">Bản mẫu: tên bài và tuần học minh họa, video chưa mở. Nội dung chính thức được MTM kiểm và cập nhật trước khi học.</p>
    <section aria-labelledby="semester-roadmap"><div className="semester-heading"><div><span className="semester-eyebrow">LỘ TRÌNH CỦA EM</span><h2 id="semester-roadmap">Chọn khối, theo từng tuần</h2></div>
      <div className="semester-grades" role="group" aria-label="Khối lớp">{SEMESTER_GRADES.map(g=><button key={g} aria-pressed={grade===g} onClick={()=>setGrade(g)}>Lớp {g}</button>)}</div></div>
      <p>{state?.registered?'Đã đăng ký lộ trình lớp '+grade+'.':'Đăng nhập BTVN và điền form bên dưới để lưu đăng ký.'} Mỗi video có số lượt mở riêng, mặc định 3 lượt; thời gian một lượt tối đa 60 phút. Phát lại trong cùng lượt đang mở không tính thêm.</p>
      <p role="status" aria-live="polite" className="semester-message">{message}</p>
      <div className="semester-weeks">{[1,2,3,4].map(week=><article key={week}><span className="semester-week">TUẦN {week}</span><h3>{['Củng cố nền tảng','Luyện chắc từng dạng','Kết nối kiến thức','Tự tin tổng ôn'][week-1]}</h3>
        {semesterLessons(grade).filter(l=>l.week===week).map(l=>{const info=state?.lessons.find(x=>x.id===l.id), locked=l.advanced&&!state?.advanced;
          return <div className="semester-lesson" key={l.id}><p>{locked?<LockKeyhole size={18} aria-hidden="true"/>:<PlayCircle size={18} aria-hidden="true"/>}{l.title}</p>
            <small>{l.advanced?'Phần sách nâng cao':'Phần ôn miễn phí'} · Bài mẫu</small>
            <button disabled={busy||!state?.registered||!info?.available||locked||(info.views>=info.limit&&!reusable(l.id))} onClick={()=>void play(l.id,l.title)}>
              {!info?.available?'Video chưa mở':locked?'Cần mã sách':info.views>=info.limit&&!reusable(l.id)?'Đã hết lượt':`Mở video · ${info.views}/${info.limit} lượt đã dùng`}</button>
          </div>;})}</article>)}</div>
    </section>
    {video&&<section className="semester-player" aria-label="Video bài học"><h2>{video.title}</h2><video key={video.url} src={video.url} controls controlsList="nodownload" onError={()=>setMessage('Chưa tải được video. Em mở lại trong thời gian lượt đang cấp để giữ lượt; sau 60 phút, mở lại sẽ tính lượt mới. Cần hỗ trợ: Zalo 0967 365 413.')} /><button className="mig-button outline" onClick={()=>setVideo(null)}>Đóng video</button></section>}
    <section className="semester-book" aria-labelledby="semester-books"><BookOpen size={32} aria-hidden="true"/><div><span className="semester-eyebrow">SÁCH MINH THÀNH MATH</span><h2 id="semester-books">Học trên sách, luyện sâu cùng video</h2><p>Sách MTM đồng hành với phần ôn tập và luyện dạng. Mã kích hoạt được in trong sách giúp mở video nâng cao cho đúng khối lớp, gắn với một tài khoản học sinh.</p><a href={ZALO_ASSISTANT_URL}>Tìm hiểu sách · Zalo 0967 365 413</a>
      <form onSubmit={activate}><label htmlFor="semester-code">Mã kích hoạt trong sách lớp {grade}</label><div><input id="semester-code" value={code} onChange={e=>setCode(e.target.value)} maxLength={60} autoComplete="off" spellCheck={false} required placeholder="Nhập mã trong sách" disabled={busy||!state?.registered||state?.advanced}/><button className="mig-button primary" disabled={busy||!state?.registered||state?.advanced}>{state?.advanced?'Đã mở nâng cao':'Kích hoạt sách'}</button></div></form>
    </div></section>
    <RegisterSection key={grade} kind="on-cuoi-ky-1" initialGrade={grade} onRegistered={()=>void refresh()}/>
  </div>;
}
