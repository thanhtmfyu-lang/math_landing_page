import {useEffect,useState} from 'react';
import {EXAM_DATES,examDayLabel,splitRemaining,upcomingExams} from './exam-countdown-data';
import './exam-countdown.css';

/** 29/10 anh Thành: đầu trang chủ đếm ngược tới THPT QG và HSA đợt 1–5; THPT đứng đầu, kỳ đã qua tự ẩn. Ngày + nguồn ở exam-countdown-data.ts. */
export function ExamCountdown(){
 const [now,setNow]=useState(()=>Date.now());
 const [picked,setPicked]=useState<string>();
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
 const list=upcomingExams(now,EXAM_DATES).sort((a,b)=>Number(b.id.startsWith('thpt'))-Number(a.id.startsWith('thpt')));
 if(!list.length)return null;
 const cur=list.find(x=>x.id===picked)||list[0];
 const started=now>=Date.parse(cur.start);
 const r=splitRemaining(Date.parse(cur.start)-now);
 const p=(n:number)=>String(n).padStart(2,'0');
 return <section className="mtm-cd" aria-label="Đếm ngược ngày thi">
  <div className="mtm-cd-head"><p className="mtm-cd-kicker">Đếm ngược ngày thi</p><h2>{cur.name}</h2><p className="mtm-cd-date">{examDayLabel(cur)}{!cur.official&&<span className="mtm-cd-tag">dự kiến</span>}</p></div>
  {started?<p className="mtm-cd-live" role="status">Đang thi. Chúc các sĩ tử bình tĩnh, tự tin!</p>:
  <div className="mtm-cd-clock" role="timer" aria-label={`Còn ${r.days} ngày ${r.hours} giờ ${r.minutes} phút`}>
   <span className="mtm-cd-cell is-day"><b>{r.days}</b><small>ngày</small></span>
   <span className="mtm-cd-cell"><b>{p(r.hours)}</b><small>giờ</small></span>
   <span className="mtm-cd-cell"><b>{p(r.minutes)}</b><small>phút</small></span>
   <span className="mtm-cd-cell"><b>{p(r.seconds)}</b><small>giây</small></span>
  </div>}
  {list.length>1&&<div className="mtm-cd-tabs" role="tablist" aria-label="Chọn kỳ thi">{list.map(x=>{const d=splitRemaining(Date.parse(x.start)-now).days;return <button key={x.id} type="button" role="tab" aria-selected={x.id===cur.id} className={x.id===cur.id?'is-on':''} onClick={()=>setPicked(x.id)}><span>{x.short}</span><small>{now>=Date.parse(x.start)?'đang thi':`${d} ngày`}</small></button>;})}</div>}
  {list.some(x=>!x.official)&&<p className="mtm-cd-note">Ngày "dự kiến": THPT theo khung năm học của Bộ GD&ĐT; HSA 2027 ĐHQGHN chưa công bố, tạm tính theo lịch 2026. Trung tâm sẽ cập nhật ngay khi có lịch chính thức.</p>}
 </section>;
}
