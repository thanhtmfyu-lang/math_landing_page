import {useState} from 'react';
import {ArrowRight,Check,Sparkles} from 'lucide-react';
import {Link} from './navigation';
import {consultationUrl,displayCourseTitle,lessonCount,type Course} from './catalogue';
import {stepCard,stepStatus,schoolYearPosition,SCHOOL_MONTHS} from './roadmaps';
import './step-card.css';

const LADDER=['Nền tảng','Vận dụng','VD cao','Luyện đề'];
const LEVELS=['Dưới 6,5','6,5 - 8','Từ 8 trở lên','Đã học xong kiến thức'];

/** Lưới thẻ của một khối, có bộ chọn điểm hiện tại để làm sáng bước nên bắt đầu. */
export function StepCardGrid({list}:{list:Course[]}){
 const [level,setLevel]=useState(0),stepped=list.some(c=>stepCard(c).tone!=='hsa')&&list.length>1;
 return <>{stepped&&<div className="mtm-sc-picker" role="group" aria-label="Điểm Toán hiện tại của em"><b>Điểm Toán hiện tại của em:</b>{LEVELS.map((l,i)=><button type="button" key={l} aria-pressed={level===i+1} onClick={()=>setLevel(level===i+1?0:i+1)}>{l}</button>)}</div>}
  <div className="mtm-sc-grid">{list.map(c=><StepCard key={c.slug} course={c} pick={!!level&&stepCard(c).num===String(level)}/>)}</div></>;
}

/** Thẻ khóa học dựng từ lộ trình: bước, hành trình điểm, thời điểm học trong năm, bước tiếp theo. */
export function StepCard({course:c,pick=false}:{course:Course;pick?:boolean}){
 const k=stepCard(c),s=stepStatus(k),title=displayCourseTitle(c),href='/khoa-hoc/'+c.slug,today=schoolYearPosition(),steps=k.tone==='hsa'?null:Number(k.num);
 return <article className={'mtm-sc tone-'+k.tone+(pick?' is-pick':'')}>{pick&&<span className="mtm-sc-pick"><Sparkles size={13} aria-hidden="true"/>Gợi ý cho em</span>}
  <Link href={href} className="mtm-sc-cover" aria-label={'Xem '+title}>
   <div className="mtm-sc-top"><span className="mtm-sc-grade">{k.grade}</span><span className={'mtm-sc-status'+(s.now?' is-now':'')}>{s.label}</span></div>
   <div className="mtm-sc-hero"><span className="mtm-sc-num" aria-hidden="true">{k.tone==='hsa'?'HSA':<><small>STEP</small>{k.num}</>}</span><span className="mtm-sc-name">{k.name}</span></div>
   <div className="mtm-sc-journey"><span><small>{k.from[0]}</small><b>{k.from[1]}</b></span><ArrowRight size={18} aria-hidden="true"/><span><small>{k.to[0]}</small><b>{k.to[1]}</b></span></div>
   {steps&&<ol className="mtm-sc-ladder" aria-label={'Bước '+steps+' trên 4 bước'}>{LADDER.map((l,i)=><li key={l} className={i+1<steps?'done':i+1===steps?'here':''}><span>{l}</span></li>)}</ol>}
  </Link>
  <div className="mtm-sc-body">
   <h2><Link href={href}>{title}</Link></h2>
   <p className="mtm-sc-meta">{c.sections.length?c.sections.length+' chương · '+lessonCount(c)+' bài trên web':'Bài học theo tuần tại lớp'}</p>
   <p className="mtm-sc-label">Hợp với em nếu</p>
   <ul className="mtm-sc-fit">{k.fit.map(f=><li key={f}><Check size={14} aria-hidden="true"/>{f}</li>)}</ul>
   <p className="mtm-sc-outcome"><b>Học xong:</b> {k.outcome}</p>
   <div className="mtm-sc-year" aria-label="Thời điểm học trong năm học 2026-2027">
    <div className="mtm-sc-track">{k.windows.map(([a,b])=><span key={a} style={{left:a*10+'%',width:(b-a+1)*10+'%'}}/>)}{today!==null&&<i style={{left:today*10+'%'}} title="Hôm nay"/>}</div>
    <div className="mtm-sc-months">{SCHOOL_MONTHS.map(m=><span key={m}>{m}</span>)}</div>
   </div>
   <div className="mtm-sc-foot"><small>{k.next}</small><Link href={consultationUrl(c)} className="mtm-sc-cta">Tư vấn bước này <ArrowRight size={15}/></Link></div>
  </div>
 </article>;
}
