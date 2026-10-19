import {ArrowRight,CalendarDays,CheckCircle2,Compass,Users} from 'lucide-react';
import {TRACKS,CONSULTATION_STEPS,PROGRESS_UPDATED,type TrackId} from './roadmaps';
import {Link} from './navigation';
import './roadmap.css';

/** Lộ trình năm học và lộ trình tư vấn của một khối, đặt trên danh mục khóa học. */
export function RoadmapPanel({track:id}:{track:TrackId}){
 const t=TRACKS.find(x=>x.id===id);if(!t)return null;
 const consult='/?lop='+t.id+'&quan-tam='+encodeURIComponent(t.title)+'#register';
 return <section className="mtm-roadmap" aria-labelledby={'roadmap-'+t.id}>
  <header className="mtm-roadmap-head">
   <div><p className="mtm-roadmap-eyebrow">{t.cohort} · NĂM HỌC 2026-2027</p><h2 id={'roadmap-'+t.id}>{t.title}</h2><p>{t.goal}</p></div>
   <dl className="mtm-roadmap-facts"><div><dt><CalendarDays size={16} aria-hidden="true"/>Lịch học</dt><dd>{t.schedule}</dd></div><div><dt><Compass size={16} aria-hidden="true"/>Kỳ thi</dt><dd>{t.exam}</dd></div></dl>
  </header>
  <ol className="mtm-roadmap-stages">{t.stages.map((s,i)=><li key={s.period}><span className="mtm-roadmap-index" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><div><p className="mtm-roadmap-period">{s.period}</p><h3>{s.title}</h3><p>{s.detail}</p><p className="mtm-roadmap-course">Khóa học: {s.courses}</p></div></li>)}</ol>
  <div className="mtm-roadmap-grid">
   <section className="mtm-roadmap-box" aria-labelledby={'groups-'+t.id}><h3 id={'groups-'+t.id}><Users size={18} aria-hidden="true"/>Các lớp đang học đến đâu</h3><ul className="mtm-roadmap-groups">{t.groups.map(g=><li key={g.name}><b>{g.name}</b><small>{g.start}</small><p>{g.now}</p><p className="mtm-roadmap-fit">{g.fit}</p></li>)}</ul><p className="mtm-roadmap-fine">Tiến độ cập nhật ngày {PROGRESS_UPDATED}.</p></section>
   <section className="mtm-roadmap-box" aria-labelledby={'place-'+t.id}><h3 id={'place-'+t.id}><Compass size={18} aria-hidden="true"/>Em nên bắt đầu từ đâu?</h3><ul className="mtm-roadmap-place">{t.placements.map(p=><li key={p.level}><span>{p.level}</span><b>{p.start}</b></li>)}</ul><p className="mtm-roadmap-fine">Đây là gợi ý ban đầu. MTM chốt bước học sau bài kiểm tra đầu vào.</p></section>
  </div>
  <section className="mtm-roadmap-consult" aria-labelledby={'consult-'+t.id}><h3 id={'consult-'+t.id}>Lộ trình tư vấn khi đăng ký</h3><ol>{CONSULTATION_STEPS.map((s,i)=><li key={s.title}><span aria-hidden="true">{i+1}</span><div><b>{s.title}</b><p>{s.detail}</p></div></li>)}</ol><div className="mtm-roadmap-actions"><Link href={consult} className="mig-button gold">Nhờ MTM tư vấn lộ trình {t.tab} <ArrowRight size={17}/></Link></div></section>
  <ul className="mtm-roadmap-notes">{t.notes.map(n=><li key={n}><CheckCircle2 size={15} aria-hidden="true"/>{n}</li>)}</ul>
 </section>;
}
