import React,{useEffect,useState} from 'react';
import type {HomeworkLesson} from './btvn-contract';
import {homeworkServerNow} from './asset-renewal';
import {isDemoVideo,lessonHomeworkTitle,lessonCaption,displayHomeworkLessons,distinctHomeworkTitle,displayHomeworkDeadline,homeworkDisplayNote} from './presentation';
import {createHomeworkDeadlineICS,hasHomeworkDeadline,homeworkDeadlineFilename} from './deadline-calendar';
import {homeworkPriorityDeadline,homeworkPriorityReason,isHomeworkLocked,nextHomework} from './homework-priority';
import './homework-priority.css';
export const LOCKED_HOMEWORK_HELP='Bài mở theo giờ ghi trên thẻ. Tới giờ mở, em tải lại trang rồi bấm Làm BTVN. Nếu chưa có giờ mở hoặc hạn nộp, em liên hệ trợ lý lớp để được hỗ trợ.';
const openingLabel=(lesson:HomeworkLesson)=>lesson.opensAt!=null&&Number.isFinite(lesson.opensAt)?dateTime(lesson.opensAt):'sau buổi học';
const dateTime=(at:number)=>new Date(at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',weekday:'long',day:'2-digit',month:'2-digit'});
export function LessonVideo({lesson,demo}:{lesson:HomeworkLesson;demo:boolean}){
  if(!lesson.videoId)return lesson.videoUrl?<p id={'video-'+lesson.lessonCode}><a className="btvn-btn primary" href={lesson.videoUrl} target="_blank" rel="noopener noreferrer">Xem record Zoom</a></p>:null;
  if(!(demo&&isDemoVideo(lesson.videoId))&&lesson.videoEmbeddable!==true)return <div id={'video-'+lesson.lessonCode} className="btvn-video-fallback"><img src={'https://i.ytimg.com/vi/'+lesson.videoId+'/hqdefault.jpg'} alt={'Ảnh xem trước: '+lesson.title}/><a className="btvn-btn primary" href={'https://www.youtube.com/watch?v='+lesson.videoId} target="_blank" rel="noopener noreferrer">Xem video bài giảng trên YouTube</a></div>;
  return <div id={'video-'+lesson.lessonCode} className="btvn-player">{demo&&isDemoVideo(lesson.videoId)?<div className="btvn-video-placeholder" role="img" aria-label={'Video mẫu buổi '+lesson.date}><b>▶</b><span>Video buổi {lesson.date.slice(8,10)}/{lesson.date.slice(5,7)}</span><small>Khung minh họa · chưa có video thật</small></div>:<iframe title={'Video bài giảng: '+lesson.title} src={'https://www.youtube-nocookie.com/embed/'+lesson.videoId+'?rel=0'} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>}</div>;
}
// Buổi chưa học (theo ngày Việt Nam) thì video chưa có, không gọi là buổi ôn tập.
const upcomingLesson=(date:string,now:number)=>date>=new Date(now).toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'});
export default function LessonCards({lessons,busy,onHomework,demo=false,serverNow,clientReceivedAt,headingLevel=1}:{lessons:HomeworkLesson[];busy:boolean;onHomework:(code:string)=>void;demo?:boolean;serverNow?:number;clientReceivedAt?:number;headingLevel?:1|2}){
  lessons=displayHomeworkLessons(lessons);
  const Heading=headingLevel===2?'h2':'h1';
  const [explained,setExplained]=useState<string|null>(null),[opened,setOpened]=useState<string|null>(null),[invited,setInvited]=useState<string|null>(null),[now,setNow]=useState(Date.now);
  const [calendarStatus,setCalendarStatus]=useState<{code:string;message:string}|null>(null);
  const [priorityNotice,setPriorityNotice]=useState<string|null>(null);
  const clockNow=homeworkServerNow({serverNow,clientReceivedAt},now);
  const priority=nextHomework(lessons,clockNow),priorityId='next-homework-'+priority?.lessonCode,priorityDeadline=priority?homeworkPriorityDeadline(priority):null;
  const openPriority=()=>{
    if(busy||!priority)return;
    const clickedAt=Date.now();
    setNow(clickedAt);
    const current=nextHomework(lessons,homeworkServerNow({serverNow,clientReceivedAt},clickedAt));
    if(current?.lessonCode===priority.lessonCode){setPriorityNotice(null);onHomework(current.lessonCode);}
    else setPriorityNotice(current?'Gợi ý vừa thay đổi theo giờ của lớp. Em kiểm tra bài mới rồi bấm mở lại.':'Hiện không còn bài phù hợp để gợi ý. Em kiểm tra trạng thái trên từng bài.');
  };
  const downloadDeadline=(lesson:HomeworkLesson)=>{
    setCalendarStatus(null);
    try{
      const ics=createHomeworkDeadlineICS(lesson,homeworkServerNow({serverNow,clientReceivedAt})),url=URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'}));
      try{const link=document.createElement('a');link.href=url;link.download=homeworkDeadlineFilename(lesson);link.hidden=true;try{document.body.appendChild(link);link.click();}finally{link.remove();}}finally{setTimeout(()=>URL.revokeObjectURL(url),60000);}
      setCalendarStatus({code:lesson.lessonCode,message:'Đã yêu cầu tải tệp lịch. Em mở tệp để thêm vào lịch; nếu MTM đổi hạn, em cần tải lại. Việc nhắc do ứng dụng lịch quyết định.'});
    }catch{setCalendarStatus({code:lesson.lessonCode,message:'Chưa yêu cầu tải được tệp lịch. Em kiểm tra hạn nộp rồi thử mở bằng Chrome hoặc Safari.'});}
  };
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer);},[]);
  const locked=(lesson:HomeworkLesson)=>isHomeworkLocked(lesson,clockNow);
  const submitted=(lesson:HomeworkLesson)=>lesson.submittedAt!=null;
  const todo=lessons.filter(l=>l.available&&!locked(l)&&l.bestScore===null&&!submitted(l)).length, pending=lessons.filter(locked).length;
  return <div className="btvn-cards"><div className="btvn-lead"><Heading>Buổi học của em</Heading><p>Xem lại bài giảng, hoàn thành BTVN trước hạn ghi trên từng bài.</p><p>Giờ mở và hạn nộp theo lịch riêng của lớp. Em xem thời gian cụ thể trên từng bài.</p><div className="btvn-overview"><b>{todo===0&&pending>0?`Chưa có bài cần làm. Có ${pending} bài chưa tới giờ mở.`:`Em còn ${todo} buổi cần làm BTVN`}</b><span>{lessons.length} buổi học</span></div><div className="btvn-legend"><span className="btvn-chip vid">▶ Có video bài giảng</span><span className="btvn-chip review">↻ Chưa có video bài giảng</span></div></div>
    {priority&&<section className="btvn-card btvn-priority" aria-labelledby={priorityId+'-title'}>
      <h2 id={priorityId+'-title'}>Việc nên làm tiếp</h2>
      <p><strong>{distinctHomeworkTitle(priority,lessons)}</strong> · Buổi {priority.date.slice(8,10)}/{priority.date.slice(5,7)}</p>
      <p id={priorityId+'-reason'}>{homeworkPriorityReason(priority,clockNow)} {priorityDeadline!==null&&(priority.kind==='kiem-tra-thang'?'Đóng bài lúc ':'Hạn: trước ')+dateTime(priorityDeadline)+' (theo lịch lớp).'}</p>
      <p className="btvn-review-note">Ưu tiên bài còn hạn gần nhất, sau đó BTVN quá hạn rồi bài chưa rõ hạn. Chọn bài chỉ mở thông tin, chưa bắt đầu lượt làm.</p>
      <button type="button" className="btvn-btn primary" disabled={busy} aria-describedby={priorityId+'-reason'} onClick={openPriority}>Mở bài được gợi ý</button>
    </section>}
    <div aria-live="polite" aria-atomic="true">{priorityNotice&&<p className="btvn-review-note">{priorityNotice}</p>}</div>
    {[...lessons].sort((a,b)=>b.date.localeCompare(a.date)).map(lesson=>{const isOpen=opened===lesson.lessonCode,isLocked=locked(lesson);
      const awaitingPublication=lesson.bestScore===null&&submitted(lesson),publicationId='publication-'+lesson.lessonCode;
      const homeworkDescription=isLocked&&explained===lesson.lessonCode?'locked-help-'+lesson.lessonCode:awaitingPublication?publicationId:undefined;
      const homeworkLabel=awaitingPublication?'Xem bài đã nộp':lesson.bestScore===null&&!submitted(lesson)?'Làm BTVN':'Xem kết quả';
      const day=new Date(lesson.date+'T00:00:00+07:00');const status=isLocked?'🔒 Chưa mở · mở '+openingLabel(lesson):lesson.bestScore===null?(submitted(lesson)?lesson.pendingGrading?'Đã nộp · Tạm tính, chờ chấm đủ':'Đã nộp · Chờ công bố điểm':'Chưa làm BTVN'):`${lesson.late===true?'Nộp muộn':'Đã nộp'} · ${lesson.bestScore.toLocaleString('vi-VN')}/10${lesson.pendingGrading?' · Tạm tính':''}`;
      const doHomework=()=>{if(isLocked)setExplained(lesson.lessonCode);else onHomework(lesson.lessonCode);};
      return <section key={lesson.lessonCode} className={'btvn-card'+(isLocked?' locked-card':'')+(lesson.available&&!isLocked&&lesson.bestScore===null&&!submitted(lesson)?' todo-card':'')+(isOpen?' open':'')}><div className="btvn-card-head"><div className="btvn-date"><b>{lesson.date.slice(8,10)+'/'+lesson.date.slice(5,7)}</b><span>{day.toLocaleDateString('vi-VN',{weekday:'long',timeZone:'Asia/Ho_Chi_Minh'})}</span></div><div className="btvn-title"><h2>{distinctHomeworkTitle(lesson,lessons)}</h2><p>{lessonCaption(lesson,demo)}</p><span className={'btvn-chip '+((lesson.videoId||lesson.videoUrl)?'vid':'review')}>{(lesson.videoId||lesson.videoUrl)?'▶ Có video bài giảng':upcomingLesson(lesson.date,clockNow)?'⏳ Video sẽ có sau buổi học':'↻ Chưa có video bài giảng'}</span></div><div className="btvn-card-status"><b className={isLocked?'locked':lesson.bestScore===null?submitted(lesson)?'ok':'todo':lesson.late?'late':'ok'}>{status}</b>{lesson.bestScore!==null&&<span>Điểm cao nhất: {lesson.bestScore.toLocaleString('vi-VN')}/10{lesson.pendingGrading&&' · Tạm tính'}</span>}<span>{!isLocked&&!submitted(lesson)&&lesson.bestScore===null&&lesson.dueAt!=null&&lesson.dueAt<=clockNow?'Quá hạn · Chưa nộp. ':''}{displayHomeworkDeadline(lesson)}</span>{lesson.submittedAt!==null&&<span>Nộp: {dateTime(lesson.submittedAt)}{!awaitingPublication&&lesson.late===null?' · Đã ghi nhận bài nộp':''}</span>}</div></div>
      {!lesson.videoId&&!lesson.videoUrl&&<p className="btvn-review-note">{upcomingLesson(lesson.date,clockNow)?'Buổi học chưa diễn ra. Video bài giảng sẽ có sau buổi học.':'Buổi này chưa có video bài giảng.'}</p>}
      <div className={'btvn-card-actions'+(!(lesson.videoId||lesson.videoUrl)?' single':'')}>{(lesson.videoId||lesson.videoUrl)&&<button className="btvn-btn gold" aria-expanded={isOpen} aria-controls={'video-'+lesson.lessonCode} onClick={()=>{setOpened(isOpen?null:lesson.lessonCode);if(isOpen)setInvited(lesson.lessonCode);}}>{isOpen?'Đóng video':'▶ Xem video'}</button>}<button className={'btvn-btn'+(isLocked?' locked':lesson.bestScore===null&&!submitted(lesson)?' primary':'')} disabled={busy||(!lesson.available&&!isLocked)} aria-describedby={homeworkDescription} onClick={doHomework}>{isLocked?'🔒 Chưa mở, mở lúc '+openingLabel(lesson):homeworkLabel}</button></div>
      {awaitingPublication&&<p id={publicationId} className="btvn-review-note">{lesson.kind==='kiem-tra-thang'?'Điểm công bố sau giờ đóng.':'Điểm đang chờ công bố.'}</p>}
      {isLocked&&<p className="btvn-review-note">Giờ mở: {openingLabel(lesson)}</p>}
      {isLocked&&explained===lesson.lessonCode&&<p id={'locked-help-'+lesson.lessonCode} className="btvn-review-note" role="status">{LOCKED_HOMEWORK_HELP}</p>}
      {!lesson.available&&!isLocked&&<p className="btvn-review-note">BTVN buổi này đang chờ chuẩn bị.</p>}
      {calendarStatus?.code===lesson.lessonCode&&<p className="btvn-review-note" role="status">{calendarStatus.message}</p>}
      {isOpen&&<LessonVideo lesson={lesson} demo={demo}/>}
      <div className="btvn-files">{lesson.materialUrl&&<a href={lesson.materialUrl} target="_blank" rel="noopener noreferrer">📄 Tài liệu buổi học</a>}{lesson.handoutUrl&&<a href={lesson.handoutUrl} target="_blank" rel="noopener noreferrer">📄 Handout</a>}{lesson.available&&!isLocked&&hasHomeworkDeadline(lesson.dueAt,clockNow)&&<button type="button" className="btvn-btn btvn-btn-subtle" disabled={busy} onClick={()=>downloadDeadline(lesson)}>Nhắc lịch hạn nộp</button>}{homeworkDisplayNote(lesson)&&<span>{homeworkDisplayNote(lesson)}</span>}</div>
      {(isOpen||invited===lesson.lessonCode)&&<div className="btvn-after"><p><b>Xem xong rồi?</b> {isLocked?'Giờ mở BTVN: '+openingLabel(lesson):submitted(lesson)?'Em đã nộp bài của buổi này.':'Em có thể làm BTVN của buổi này ngay.'}</p><button className={'btvn-btn'+(isLocked?' locked':' primary')} disabled={busy||(!lesson.available&&!isLocked)} aria-describedby={homeworkDescription} onClick={doHomework}>{isLocked?'🔒 Chưa mở, mở lúc '+openingLabel(lesson):submitted(lesson)?homeworkLabel:'Làm BTVN buổi này'}</button></div>}
    </section>;})}
    {!lessons.length&&<p>Lớp em chưa có BTVN trên web. Khi thầy giao bài, buổi học và BTVN sẽ hiện ở đây.</p>}<p className="btvn-footnote">Buổi mới nhất ở trên cùng. Điểm lấy lần cao nhất; nộp sau hạn đã xác minh vẫn được nhưng ghi nộp muộn.</p>
  </div>;
}
