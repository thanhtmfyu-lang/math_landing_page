import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import R106PageIntro from '../../migration/R106PageIntro';
import MathText from '../math/MathText';
import {Link} from '../../migration/navigation';
import {ZALO_ASSISTANT_URL} from '../../components/mtm-contact';
import {describeLeadSource,storedLeadSource} from '../../components/lead-source';
import {DV_TRACKS,DV_TRACK_LABEL,LEVEL_LABEL,isDvTrack,type DvTrack,type Paper,type Result} from '../../../server/dau-vao/engine';
import {entranceLeadPayload,normalizeEntryPhone,resultSummary} from './entrance-test';
import './hsa-mock.css';
import './entrance-test.css';

type Entry={name:string;khoi:DvTrack;school:string;phone:string;consent:boolean};
type Saved={paper:Paper;answers:Record<string,number|string>;startedAt:number;entry:Entry;result?:Result;lead?:'sent'|'error'|'skipped'};
const KEY='mtm:dau-vao:v1',API='/api/kiem-tra-dau-vao';
const load=():Saved|null=>{try{const s=JSON.parse(localStorage.getItem(KEY)??'null');return s&&s.paper&&isDvTrack(s.paper.khoi)?s:null;}catch{return null;}};
const save=(s:Saved|null)=>{try{s?localStorage.setItem(KEY,JSON.stringify(s)):localStorage.removeItem(KEY);}catch{/* trình duyệt chặn lưu thì vẫn làm bài được */}};
const fmt=(ms:number)=>{const s=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
const TRACK_NOTE:Record<DvTrack,string>={'6':'Nền tiểu học + Toán 6','7':'Nền lớp 6 + Toán 7','8':'Nền lớp 7 + Toán 8','9':'Nền lớp 8 + Toán 9, ôn vào 10','10':'Nền lớp 9 + Toán 10','11':'Nền lớp 10 + Toán 11','12':'Nền lớp 11 + Toán 12','hsa':'Toán và xử lý số liệu HSA'};
const STATUS_LABEL={vung:'Đã vững','cung-co':'Cần củng cố',hong:'Còn hổng'} as const;

function initialTrack(search:string):DvTrack{const k=new URLSearchParams(search).get('khoi');return isDvTrack(k)?k:'10';}

export default function EntranceTest({search}:{search:string}){
 const [saved,setSaved]=useState<Saved|null>(()=>load());
 const update=useCallback((next:Saved|null)=>{save(next);setSaved(next);},[]);
 return <div className="mig-container hsa-page dv-page">
  {saved?<h1 className="dv-title">Kiểm tra đầu vào Toán</h1>:<R106PageIntro className="hsa-intro" eyebrow="Miễn phí · chấm tự động · gợi ý xếp lớp" title="Kiểm tra đầu vào Toán" description={<><p>Đề tự đổi theo ngày em làm bài: máy chọn câu theo phần trường em đã học đến tuần này và phần lớp ở MTM đã dạy, nên kết quả cho biết em đang vững gì, hổng gì và nên vào lớp nào.</p><p>Lớp 6 đến lớp 12 và HSA. Làm trên điện thoại hoặc máy tính, không cần tài khoản.</p></>}>
   <ul className="hsa-facts"><li><strong>20</strong><span>câu (HSA 25)</span></li><li><strong>60</strong><span>phút (HSA 50)</span></li><li><strong>3</strong><span>phần kiến thức</span></li></ul>
  </R106PageIntro>}
  {!saved?<Start initial={initialTrack(search)} onStart={update}/>:saved.result?<ResultView saved={saved} update={update}/>:<Attempt saved={saved} update={update}/>}
 </div>;
}

function Start({initial,onStart}:{initial:DvTrack;onStart:(s:Saved)=>void}){
 const [khoi,setKhoi]=useState<DvTrack>(initial),[name,setName]=useState(''),[school,setSchool]=useState(''),[phone,setPhone]=useState(''),[consent,setConsent]=useState(false);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const summer=[6,7,8].includes(new Date().getMonth()+1);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setError('');
  const n=name.trim().replace(/\s+/g,' ');if(n.length<2||n.length>60)return setError('Em nhập họ tên (2–60 ký tự).');
  let p='';if(phone.trim()){const v=normalizeEntryPhone(phone);if(!v)return setError('Số điện thoại chưa đúng: nhập số di động 10 chữ số.');p=v;if(!consent)return setError('Em tích ô đồng ý để MTM gửi kết quả qua số này, hoặc để trống số điện thoại.');}
  setBusy(true);
  try{const r=await fetch(API+'?khoi='+khoi,{headers:{Accept:'application/json'}});const data=await r.json();if(!r.ok)throw Error(data?.message??'');
   onStart({paper:data as Paper,answers:{},startedAt:Date.now(),entry:{name:n,khoi,school:school.trim().slice(0,80),phone:p,consent:!!p&&consent}});}
  catch(err){setError((err as Error).message||'Chưa tải được đề. Em kiểm tra mạng rồi thử lại.');setBusy(false);}
 };
 return <div className="dv-start-wrap"><form className="hsa-card hsa-entry dv-start" onSubmit={submit} noValidate>
  <h2>Em chọn khối và điền thông tin</h2>
  <fieldset className="hsa-field hsa-grades"><legend>{summer?'Năm học tới em lên':'Em đang học'}</legend><div className="dv-tracks">
   {DV_TRACKS.map(t=><label key={t} className={'dv-track'+(t===khoi?' is-on':'')+(t==='hsa'?' is-hsa':'')}><input type="radio" name="khoi" value={t} checked={t===khoi} onChange={()=>setKhoi(t)}/><strong>{DV_TRACK_LABEL[t]}</strong><small>{TRACK_NOTE[t]}</small></label>)}
  </div></fieldset>
  <label className="hsa-field"><span>Họ tên học sinh</span><input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" maxLength={60} required/></label>
  <label className="hsa-field"><span>Trường đang học <em className="dv-opt">(không bắt buộc)</em></span><input value={school} onChange={e=>setSchool(e.target.value)} maxLength={80} placeholder="Ví dụ: THPT Kim Liên"/></label>
  <label className="hsa-field"><span>Số điện thoại phụ huynh hoặc em <em className="dv-opt">(không bắt buộc)</em></span><input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={15}/><small>Để lại số thì MTM gửi phiếu kết quả chi tiết và tư vấn lớp phù hợp. Số không hiện công khai ở đâu.</small></label>
  {phone.trim()&&<label className="hsa-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>Em và phụ huynh đồng ý để MTM nhận họ tên, lớp, kết quả bài làm và số điện thoại này để gửi kết quả, tư vấn xếp lớp. Xem <a href="/chinh-sach-bao-mat" target="_blank" rel="noopener">chính sách quyền riêng tư</a>.</span></label>}
  {error&&<p className="hsa-error" role="alert">{error}</p>}
  <p className="dv-rules">Bấm bắt đầu là đồng hồ chạy. Em làm độc lập, có giấy nháp, không dùng máy tính cầm tay trừ khi đề cho phép. Bài tự lưu trên trình duyệt nếu lỡ tải lại trang.</p>
  <p className="hsa-actions"><button className="hsa-primary" type="submit" disabled={busy}>{busy?'Đang ghép đề…':'Bắt đầu làm bài'}</button></p>
 </form>
 <aside className="hsa-card dv-how"><h2>Đề của em gồm 3 phần</h2><ol>
  <li><strong>Nền tảng lớp dưới</strong><span>Các mảng then chốt của năm trước mà {khoi==='hsa'?'đề HSA':'lớp '+khoi} cần dùng.</span></li>
  <li><strong>Kiến thức trên trường đã học</strong><span>Chỉ các bài trường đã dạy đến tuần này; bài đang dạy dở chỉ hỏi mức cơ bản.</span></li>
  <li><strong>{khoi==='hsa'?'Lớp 12 và dạng đặc thù HSA':'Phần lớp MTM đã dạy trước'}</strong><span>{khoi==='hsa'?'Phần lớp 12 đã học ở trường hoặc lớp HSA, cùng dạng xử lý số liệu, logic, bài thực tế.':'Bài các lớp MTM đã học trước trường. Phần này không tính điểm, chỉ để biết em cần bù gì khi vào lớp.'}</span></li>
 </ol><p className="dv-note">Đề đổi theo ngày làm bài, nên mỗi thời điểm trong năm em gặp đúng phần kiến thức đang học. Kết quả có ngay: điểm, chủ đề còn hổng và gợi ý lớp.</p></aside>
 </div>;
}

function Attempt({saved,update}:{saved:Saved;update:(s:Saved|null)=>void}){
 const {paper,answers}=saved;const deadline=saved.startedAt+paper.durationMinutes*60000;
 const [now,setNow]=useState(Date.now()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);
 const ref=useRef(saved);ref.current=saved;
 const answered=paper.questions.filter(q=>answers[q.id]!==undefined&&answers[q.id]!=='').length;
 const set=(id:string,v:number|string)=>update({...ref.current,answers:{...ref.current.answers,[id]:v}});
 const submit=useCallback(async()=>{if(busy)return;setBusy(true);setError('');const s=ref.current;
  try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({khoi:s.paper.khoi,ngay:s.paper.ngay,seed:s.paper.seed,answers:s.answers})});
   const data=await r.json();if(!r.ok)throw Error(data?.message??'');update({...s,result:data as Result});window.scrollTo({top:0});}
  catch(err){setError((err as Error).message||'Chưa nộp được bài. Bài làm vẫn được lưu, em bấm nộp lại.');setBusy(false);}
 },[busy,update]);
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
 const late=now>=deadline;useEffect(()=>{if(late)void submit();},[late]);// eslint-disable-line react-hooks/exhaustive-deps
 let lastSection='';
 return <div className="dv-attempt">
  <div className="hsa-card dv-bar" role="region" aria-label="Thời gian và tiến độ">
   <span><strong>{saved.entry.name}</strong> · {DV_TRACK_LABEL[paper.khoi]} · Mã bài {paper.code}</span>
   <span className={'dv-clock'+(deadline-now<5*60000?' is-low':'')} aria-live="off">{fmt(deadline-now)}</span>
   <span className="dv-count">Đã làm {answered}/{paper.questions.length}</span>
  </div>
  <p className="dv-week">{paper.summer?`Đề dịp hè cho năm học ${paper.schoolYear}: nền lớp dưới và phần lớp MTM đã dạy trước trong hè.`:`Đề theo tiến độ tuần ${paper.week} năm học ${paper.schoolYear}.`} {paper.sections.map(s=>s.label+' '+s.count+' câu').join(' · ')}.</p>
  <ol className="dv-questions">
   {paper.questions.map(q=>{const head=q.section!==lastSection;lastSection=q.section;const sec=paper.sections.find(s=>s.id===q.section);
    return <li key={q.id} className="hsa-card dv-q" id={'cau-'+q.no}>
     {head&&<p className="dv-section">{sec?.label}</p>}
     <p className="dv-q-head"><strong>Câu {q.no}</strong><span>{q.topicName}</span></p>
     <div className="dv-prompt"><MathText text={q.prompt}/></div>
     {q.kind==='mc'?<div className="dv-choices" role="radiogroup" aria-label={'Câu '+q.no}>{q.choices!.map((c,i)=><label key={i} className={'dv-choice'+(answers[q.id]===i?' is-on':'')}><input type="radio" name={q.id} checked={answers[q.id]===i} onChange={()=>set(q.id,i)}/><b>{'ABCD'[i]}</b><span><MathText text={c}/></span></label>)}</div>
     :<label className="dv-num"><span>Đáp số</span><input inputMode="decimal" maxLength={8} value={String(answers[q.id]??'')} onChange={e=>set(q.id,e.target.value.replace(/[^0-9,.\-]/g,''))} placeholder="Ví dụ: -1,5"/></label>}
    </li>;})}
  </ol>
  <nav className="hsa-card dv-jump" aria-label="Chuyển câu">{paper.questions.map(q=><a key={q.id} href={'#cau-'+q.no} className={answers[q.id]!==undefined&&answers[q.id]!==''?'is-done':''}>{q.no}</a>)}</nav>
  {error&&<p className="hsa-error" role="alert">{error}</p>}
  <div className="hsa-card dv-submit">
   {confirm||answered===paper.questions.length?<p className="hsa-actions"><button type="button" className="hsa-primary" onClick={()=>void submit()} disabled={busy}>{busy?'Đang chấm…':'Nộp bài'}</button>{answered<paper.questions.length&&<span>Còn {paper.questions.length-answered} câu chưa làm.</span>}</p>
   :<p className="hsa-actions"><button type="button" className="hsa-primary" onClick={()=>setConfirm(true)}>Nộp bài</button></p>}
   <button type="button" className="hsa-link dv-quit" onClick={()=>{if(window.confirm('Bỏ bài này và chọn lại khối? Bài đang làm sẽ bị xóa.'))update(null);}}>Chọn lại khối</button>
  </div>
 </div>;
}

function ResultView({saved,update}:{saved:Saved;update:(s:Saved|null)=>void}){
 const r=saved.result!,{entry,paper}=saved;
 const [lead,setLead]=useState(saved.lead);
 const send=useCallback(async()=>{
  if(!entry.phone||!entry.consent){setLead('skipped');return;}
  setLead(undefined);
  try{const emailjs=(await import('@emailjs/browser')).default;
   await emailjs.send(import.meta.env.VITE_SERVICE_KEY,import.meta.env.VITE_TEMPLATE_KEY,{...entranceLeadPayload({name:entry.name,khoi:entry.khoi,school:entry.school,phone:entry.phone,result:r,leadSource:describeLeadSource(storedLeadSource())}),time:new Date().toLocaleString('vi-VN',{timeZone:'Asia/Saigon'})},import.meta.env.VITE_PUBLIC_KEY);
   setLead('sent');update({...saved,lead:'sent'});}
  catch{setLead('error');}
 },[entry,r,saved,update]);
 useEffect(()=>{if(!saved.lead)void send();},[]);// eslint-disable-line react-hooks/exhaustive-deps
 const groups=useMemo(()=>paper.sections.map(s=>({...s,topics:r.topics.filter(t=>t.section===s.id)})),[paper,r]);
 const gaps=r.topics.filter(t=>t.status!=='vung');
 return <div className="dv-result">
  <section className="hsa-card hsa-result dv-score" aria-live="polite">
   <div><p className="dv-kicker">Kết quả của {entry.name} · {DV_TRACK_LABEL[r.khoi]}</p>
    <p className="hsa-result-score"><strong>{r.score.toLocaleString('vi-VN')}/10</strong><span>Đúng {r.correct}/{r.total} câu · Mã bài {r.code}</span></p>
    <p className="dv-week">{paper.summer?`Đề dịp hè cho năm học ${paper.schoolYear}.`:`Đề theo tiến độ tuần ${r.week} năm học ${paper.schoolYear}, ngày ${r.ngay.split('-').reverse().join('/')}.`}</p>{r.scoreNote&&<p className="dv-note">{r.scoreNote}</p>}</div>
   <ul className="dv-sections">{r.bySection.map(s=><li key={s.id}><span>{s.label}</span><b>{s.correct}/{s.total}</b><i style={{['--p' as string]:s.percent+'%'}} className={s.percent>=70?'is-good':s.percent>=50?'is-mid':'is-low'}/></li>)}</ul>
  </section>
  <section className="hsa-card dv-suggest">
   <h2>Gợi ý xếp lớp</h2>
   <p className="dv-class"><strong>{r.suggestion.group}</strong><span>{r.suggestion.level}</span></p>
   <p>{r.suggestion.why}</p>
   {r.suggestion.extra.length>0&&<ul>{r.suggestion.extra.map(x=><li key={x}>{x}</li>)}</ul>}
   <p className="dv-note">Gợi ý tự động theo bài làm. Giáo viên xác nhận lớp sau buổi học thử (không học tiếp thì không tính phí).</p>
   <p className="hsa-actions"><a className="hsa-primary" href={ZALO_ASSISTANT_URL} target="_blank" rel="noopener noreferrer">Đặt lịch học thử qua Zalo</a><Link className="hsa-ghost" href={'/khoa-hoc'+(['10','11','12','hsa'].includes(r.khoi)?'?lop='+r.khoi:'')}>Xem lộ trình</Link><button type="button" className="hsa-ghost" onClick={()=>window.print()}>In phiếu kết quả</button></p>
   <p className="dv-lead">{!entry.phone?'Em chưa để lại số điện thoại: chụp màn hình phiếu này gửi Zalo MTM để được tư vấn.':lead==='sent'?'MTM đã nhận phiếu kết quả và sẽ liên hệ qua số em để lại.':lead==='error'?<>Chưa gửi được phiếu cho MTM. <button type="button" className="hsa-link" onClick={()=>void send()}>Gửi lại</button></>:'Đang gửi phiếu kết quả cho MTM…'}</p>
  </section>
  <section className="hsa-card dv-topics">
   <h2>Bản đồ kiến thức</h2>
   {gaps.length?<p className="dv-gap-lead">Em cần bù {gaps.length} chủ đề, đánh dấu đỏ (còn hổng) và cam (cần củng cố) bên dưới. Giáo viên chữa từng chủ đề này cùng em trong buổi học thử.</p>:<p className="dv-gap-lead">Em làm đúng hết các chủ đề trong đề. Rất tốt!</p>}
   {groups.map(g=><div key={g.id} className="dv-topic-group"><h3>{g.label}</h3><ul>{g.topics.map(t=><li key={t.topic} className={'is-'+t.status}><span>{t.name}</span><b>{t.correct}/{t.total}</b><em>{STATUS_LABEL[t.status]}</em></li>)}</ul></div>)}
  </section>
  <section className="hsa-card dv-items">
   <h2>Từng câu</h2>
   <p className="dv-note">Đáp án và lời giải chi tiết giáo viên chữa cùng em trong buổi tư vấn, để đề giữ được giá trị cho lần kiểm tra sau.</p>
   <ol>{r.items.map(i=><li key={i.no} className={i.correct?'is-ok':i.answered?'is-bad':'is-skip'} title={i.topicName+' · '+LEVEL_LABEL[i.level]}><b>{i.no}</b><span>{i.correct?'Đúng':i.answered?'Sai':'Bỏ trống'}</span><small>{LEVEL_LABEL[i.level]}</small></li>)}</ol>
   <p className="dv-levels">{r.byLevel.map(l=>`${l.label}: ${l.correct}/${l.total}`).join(' · ')}</p>
  </section>
  <section className="hsa-card dv-staff" aria-label="Phiếu cho trung tâm"><h2>Phiếu gửi trung tâm</h2><p className="dv-note">Chưa để lại số điện thoại thì em chụp phiếu này gửi Zalo MTM 0967 365 413.</p><pre>{resultSummary({name:entry.name,khoi:entry.khoi,school:entry.school,result:r})}</pre></section>
  <p className="hsa-actions dv-again"><button type="button" className="hsa-ghost" onClick={()=>update(null)}>Làm bài khối khác</button></p>
 </div>;
}
