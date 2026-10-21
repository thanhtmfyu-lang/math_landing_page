import {TRACKS,PROGRESS_UPDATED} from '../../migration/roadmaps';
import type {HomeworkState} from './btvn-contract';
import './my-class.css';

export function classRoadmap(className:string){
 const id=/HSA/i.test(className)?'hsa':className.startsWith('2K9 ')?'12':className.startsWith('2K10 ')?'11':className.startsWith('2K11 ')?'10':null;
 const track=TRACKS.find(t=>t.id===id);
 const kind=className.includes('9+')?'9+':className.includes('8+')?'8+':className.includes('XPT')?'XPT':null;
 const group=kind?track?.groups.find(g=>g.name.includes(kind)):undefined;
 return track?{title:track.title,progress:group?.now??null,updated:PROGRESS_UPDATED}:null;
}
const time=(at:number)=>new Date(at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
export default function MyClass({state,onSelect,busy}:{state:HomeworkState;onSelect:(code:string)=>void;busy:boolean}){
 const overview=state.classOverview,roadmap=classRoadmap(state.className);
 if(!overview||overview.className!==state.className)return null;
 const source=overview.legacySchedule?'Lịch dự phòng cũ, cần xác nhận':overview.source==='snapshot'?`Lịch dự phòng ${overview.snapshotDate??''}`:overview.source==='Lich_lop-cache'?'Lịch đọc gần nhất từ Lich_lop':'Lịch Lich_lop';
 const button=(card:{lessonCode:string;title:string})=><button type="button" disabled={busy} onClick={()=>onSelect(card.lessonCode)}>{card.title}</button>;
 return <section className="my-class" aria-label="Lớp của em"><header><h2>Lớp của em · {state.className}</h2><p>{source}</p></header>
  <div className="my-class-grid"><section><h3>Lịch tuần này</h3>{overview.week.length?<ul>{overview.week.map(s=><li key={s.startsAt}>{time(s.startsAt)} – {new Date(s.endsAt).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'})}</li>)}</ul>:<p>Chưa có lịch đủ căn cứ cho lớp này.</p>}{overview.next&&<p><strong>Buổi tới:</strong> {time(overview.next.startsAt)}</p>}</section>
  <section><h3>BTVN đang mở</h3>{overview.open.length?<ul>{overview.open.map(c=><li key={c.lessonCode}>{button(c)}</li>)}</ul>:<p>Hiện chưa có bài đang mở.</p>}<p>Đã nộp {overview.progress.submitted}/{overview.progress.opened} bài đã mở.</p></section>
  <section><h3>Buổi học và kiểm tra</h3>{overview.latest?<p>Video, handout buổi gần nhất: {button(overview.latest)}</p>:<p>Chưa có video hoặc handout của buổi đã mở.</p>}{overview.monthly.length?<ul>{overview.monthly.map(c=><li key={c.lessonCode}>{button(c)}</li>)}</ul>:<p>Chưa có đề thi tháng được mở cho lớp.</p>}</section></div>
  {roadmap&&<section className="my-class-roadmap"><h3>{roadmap.title}</h3>{roadmap.progress?<p><strong>Ghi nhận trong lộ trình ngày {roadmap.updated}:</strong> {roadmap.progress}</p>:<p>Chưa có mốc tiến độ riêng được đối soát cho nhóm này.</p>}<p>Mốc trên là dữ liệu lộ trình đã ghi, không thay cho xác nhận tiến độ học mới nhất của lớp.</p></section>}
 </section>;
}
