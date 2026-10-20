import {StudentSchool} from '../../components/StudentAppearance';
import {useEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import type {HomeworkLesson,HomeworkReceipt,HomeworkState} from './btvn-contract';
import type {RankRow} from './HomeLeaderboard';
import {homeworkServerNow} from './asset-renewal';
import {homeworkPriorityDeadline,homeworkPriorityReason,isHomeworkLocked,nextHomework} from './homework-priority';
import {displayClassName,lessonCaption,lessonHomeworkTitle} from './presentation';
import {LessonVideo} from './LessonCards';
import CenterBoard from './CenterBoard';
import ThiThangSection from './ThiThangSection';
import './r104-homework.css';
import './leaderboard-refresh.css';
import {requestLeaderboard,subscribeLeaderboardRefresh} from './leaderboard-refresh';
import {homeworkReceiptScore,pendingHomeworkReceipt} from './result-summary';

const periods=[['btvn-tuan','BTVN tuần'],['btvn-thang','BTVN tháng'],['kiem-tra-thang','Kiểm tra cuối tháng']] as const;
const PAGE=6;
type RankState={status:'loading'|'ready'|'error'|'guest'|'disabled'|'unsupported';row:RankRow|null};
export type LessonStatus='locked'|'preparing'|'open'|'closed'|'submitted'|'scored';
const statusLabels:Record<LessonStatus,string>={locked:'Chưa mở',preparing:'Đang chuẩn bị',open:'Đang mở',closed:'Đã đóng',submitted:'Đã nộp · chờ điểm',scored:'Đã có điểm'};
const dateTime=(at:number)=>new Date(at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const dayMonth=(date:string)=>date.slice(8,10)+'/'+date.slice(5,7);
export const formatScore=(score:number)=>score.toLocaleString('vi-VN',{maximumFractionDigits:2});
function validRow(row:unknown):row is RankRow{
  if(!row||typeof row!=='object')return false;
  const r=row as RankRow;
  return Number.isSafeInteger(r.rank)&&r.rank>0&&typeof r.score==='number'&&Number.isFinite(r.score)&&r.score>=0&&r.score<=10&&typeof r.className==='string'&&Number.isInteger(r.submitted)&&r.submitted>=0&&Number.isInteger(r.total)&&r.total>=1&&r.submitted<=r.total;
}
/** Trạng thái hiển thị theo giờ lớp; quyền làm bài vẫn do máy chủ quyết định khi chọn bài. */
export function lessonStatus(lesson:HomeworkLesson,now:number):LessonStatus{
  if(isHomeworkLocked(lesson,now))return 'locked';
  if(lesson.bestScore!==null&&!lesson.pendingGrading)return 'scored';
  if(lesson.submittedAt!=null)return 'submitted';
  if(!lesson.available)return 'preparing';
  const end=lesson.kind==='kiem-tra-thang'?homeworkPriorityDeadline(lesson):null;
  return end!==null&&now>=end?'closed':'open';
}
export function explorerLessons(lessons:HomeworkLesson[],now:number,filter:'all'|'opened'){
  return lessons.filter(lesson=>filter==='all'||!isHomeworkLocked(lesson,now)).sort((a,b)=>b.date.localeCompare(a.date)||a.lessonCode.localeCompare(b.lessonCode));
}
/** Lịch sử chỉ lấy từ thời điểm nộp và điểm cao nhất máy chủ đã trả cho từng buổi. */
export function submissionHistory(lessons:HomeworkLesson[]){
  return lessons.filter(lesson=>lesson.submittedAt!=null&&Number.isFinite(lesson.submittedAt)).sort((a,b)=>b.submittedAt!-a.submittedAt!);
}
/** Biên nhận trong phiên chỉ thuộc buổi đang chọn; không gán sang buổi khác. */
export function selectedReceipts(state:HomeworkState):{lesson:HomeworkLesson;receipts:HomeworkReceipt[]}|null{
  const lesson=state.lessons?.find(item=>item.lessonCode===state.lessonCode);
  const receipts=(state.receipts??[]).filter(receipt=>Number.isFinite(receipt.submittedAt)).sort((a,b)=>b.submittedAt-a.submittedAt);
  return lesson&&receipts.length?{lesson,receipts}:null;
}

/** Chọn bài chỉ chuyển qua gateway hiện có, không tự tạo lượt làm. */
export default function R104Dashboard({state,busy,onSelect,profileControl}:{state:HomeworkState;busy:boolean;onSelect:(code:string)=>void;profileControl?:ReactNode}){
  const [now,setNow]=useState(Date.now),[kind,setKind]=useState('btvn-tuan'),[retry,setRetry]=useState(0),[priorityNotice,setPriorityNotice]=useState('');
  const [rank,setRank]=useState<RankState>({status:'loading',row:null});
  const [filter,setFilter]=useState<'all'|'opened'>('all'),[limit,setLimit]=useState(PAGE),[picked,setPicked]=useState<string|null>(null),[video,setVideo]=useState<string|null>(null);
  const preview=useRef<HTMLDivElement>(null),rankGeneration=useRef(0),rankQuery=useRef(''),rankSnapshot=useRef('');
  const [rankUpdate,setRankUpdate]=useState(0);
  const clock=homeworkServerNow(state,now),lessons=state.lessons??[],priority=nextHomework(lessons,clock);
  const cohort=/\b(2K(?:9|1[0-4]))\b/i.exec(state.className)?.[1].toUpperCase();
  const rankIdentity=cohort+'|'+kind+'|'+state.fullName+'|'+state.className,latestRankIdentity=useRef(rankIdentity);latestRankIdentity.current=rankIdentity;
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>subscribeLeaderboardRefresh(event=>{
    rankGeneration.current++;
    if(event.reason==='session'){rankSnapshot.current='';setRank({status:'guest',row:null});}
    setRetry(value=>value+1);
  }),[]);
  useEffect(()=>{
    const controller=new AbortController(),generation=++rankGeneration.current;
    if(!cohort){setRank({status:'unsupported',row:null});return()=>controller.abort();}
    const body=JSON.stringify({khoi:cohort,loai:kind}),query=body+'|'+state.fullName+'|'+state.className;
    if(rankQuery.current!==query){rankQuery.current=query;rankSnapshot.current='';setRank({status:'loading',row:null});}
    requestLeaderboard<{enabled:boolean;row:RankRow|null}>('/api/xep-hang-cua-em',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body})
      .then(response=>{
        if(controller.signal.aborted||generation!==rankGeneration.current||latestRankIdentity.current!==rankIdentity)return;
        if(response.status===401||response.status===403){rankSnapshot.current='';setRank({status:'guest',row:null});return;}
        const data=response.data;
        if(!response.ok||!data)throw Error();
        if(typeof data.enabled!=='boolean'||(data.row!=null&&!validRow(data.row)))throw Error();
        const next=JSON.stringify(data.row??null);if(rankSnapshot.current&&rankSnapshot.current!==next)setRankUpdate(value=>value+1);rankSnapshot.current=next;
        setRank({status:data.enabled?'ready':'disabled',row:data.row??null});
      }).catch(()=>{if(!controller.signal.aborted&&generation===rankGeneration.current&&latestRankIdentity.current===rankIdentity)setRank({status:'error',row:null});});
    return()=>controller.abort();
  },[cohort,kind,retry,state.fullName,state.className]);
  const choosePriority=()=>{
    if(busy||!priority)return;
    const fresh=nextHomework(lessons,homeworkServerNow(state));
    if(fresh?.lessonCode!==priority.lessonCode){setNow(Date.now());setPriorityNotice('Gợi ý vừa thay đổi theo giờ lớp. Em kiểm tra lại bài được gợi ý.');return;}
    setPriorityNotice('');onSelect(priority.lessonCode);
  };
  const deadline=priority?homeworkPriorityDeadline(priority):null;
  const statuses=lessons.map(lesson=>lessonStatus(lesson,clock));
  const count=(...wanted:LessonStatus[])=>statuses.filter(status=>wanted.includes(status)).length;
  const listed=explorerLessons(lessons,clock,filter),shown=listed.slice(0,limit);
  const fallback=listed.find(lesson=>!isHomeworkLocked(lesson,clock))??listed[0];
  const selected=listed.find(lesson=>lesson.lessonCode===picked)??listed.find(lesson=>lesson.lessonCode===priority?.lessonCode)??fallback;
  const history=submissionHistory(lessons),receipts=selectedReceipts(state);
  const select=(lesson:HomeworkLesson,reveal=false)=>{
    const index=explorerLessons(lessons,clock,reveal?'all':filter).findIndex(item=>item.lessonCode===lesson.lessonCode);
    if(reveal)setFilter('all');
    if(index>=limit)setLimit(Math.ceil((index+1)/PAGE)*PAGE);
    setPicked(lesson.lessonCode);setVideo(null);
    requestAnimationFrame(()=>preview.current?.scrollIntoView({block:'nearest'}));
  };
  return <div className="r104-homework">
    <CenterBoard onSkip={()=>document.querySelector('.r104-hw-today')?.scrollIntoView({behavior:'smooth',block:'start'})}/>
    <header className="r104-hw-heading"><p>Học tập <span aria-hidden="true">/</span> Bài tập về nhà</p><h1>Góc học tập của em<span>.</span></h1><p>Việc hôm nay, kết quả và những bước tiếp theo.</p></header>
    <div className="r104-hw-profile"><div>{profileControl}<span><strong>{state.fullName}</strong><small>{displayClassName(state)}</small><StudentSchool identity={state.fullName+'|'+state.className}/></span></div>{cohort&&<span className="r104-hw-cohort">Khối {cohort}</span>}</div>
    <div className="r104-hw-workplane">
      <section className="r104-hw-today" aria-labelledby="r104-today-title">
        <header><span className="r104-hw-overline"><i/>Việc hôm nay</span><small>{priority?'Buổi '+dayMonth(priority.date):'Lịch học của em'}</small></header>
        <div className="r104-hw-today-grid"><div className="r104-hw-today-copy"><p>{displayClassName(state)}</p><h2 id="r104-today-title">{priority?lessonHomeworkTitle(priority):lessons.length?'Em đã xem hết việc cần làm':'Chờ buổi học đầu tiên'}<span>.</span></h2>
          <p>{priority?homeworkPriorityReason(priority,clock):lessons.length?'Em có thể xem lại bài đã nộp và bài giảng trong từng buổi bên dưới.':'Khi thầy giao bài, buổi học và BTVN sẽ xuất hiện tại đây.'}</p>
          {priority&&<><div className="r104-hw-today-facts"><span>Đã mở</span><span>{deadline!==null?(priority.kind==='kiem-tra-thang'?'Đóng: ':'Hạn: ')+dateTime(deadline):'Hạn: chờ xác minh'}</span></div><button type="button" className="r104-hw-primary" disabled={busy} onClick={choosePriority}>Xem bài cần làm <span aria-hidden="true">↗</span></button><p className="r104-hw-select-note">Mở thông tin bài, chưa bắt đầu lượt làm.</p></>}
          <div role="status">{priorityNotice}</div>
        </div><div className="r104-hw-class-snapshot"><p>Từng bước tiến bộ</p><h3>Buổi học của em</h3><dl><div><dt>Đang mở, chưa nộp</dt><dd>{count('open')}</dd></div><div><dt>Đã có bài nộp</dt><dd>{count('submitted','scored')}</dd></div><div><dt>Chưa tới giờ mở</dt><dd>{count('locked')}</dd></div></dl></div></div>
        <ThiThangSection lessons={lessons} now={clock} busy={busy} onSelect={onSelect}/>
        {lessons.length>0&&<section className="r104-hw-lessons" id="r104-lessons" aria-labelledby="r104-lessons-title">
          <div className="r104-hw-lessons-heading"><div><small>{displayClassName(state)}</small><h2 id="r104-lessons-title">Buổi học của em</h2></div>
            <div className="r104-hw-filters" role="group" aria-label="Lọc buổi học"><button type="button" aria-pressed={filter==='all'} onClick={()=>{setFilter('all');setLimit(PAGE);}}>Tất cả</button><button type="button" aria-pressed={filter==='opened'} onClick={()=>{setFilter('opened');setLimit(PAGE);}}>Đã mở</button></div></div>
          {shown.length?<ol className="r104-hw-lesson-map">{shown.map(lesson=>{const status=lessonStatus(lesson,clock);return <li key={lesson.lessonCode}><button type="button" className={'r104-hw-station r104-hw-station--'+status} aria-pressed={selected?.lessonCode===lesson.lessonCode} onClick={()=>select(lesson)}><span className="r104-hw-station-date">Buổi {dayMonth(lesson.date)}</span><strong>{lessonHomeworkTitle(lesson)}</strong><span className={'r104-hw-status r104-hw-status--'+status}>{statusLabels[status]}</span></button></li>;})}</ol>:<p className="r104-hw-lessons-empty">Chưa có buổi nào đã mở. Em chọn Tất cả để xem lịch sắp tới.</p>}
          {listed.length>shown.length&&<button type="button" className="r104-hw-more" onClick={()=>setLimit(value=>value+PAGE)}>Xem thêm buổi cũ hơn ({listed.length-shown.length})</button>}
          {selected&&<LessonPreview anchor={preview} lesson={selected} status={lessonStatus(selected,clock)} demo={state.demo} busy={busy} videoOpen={video===selected.lessonCode} onVideo={()=>setVideo(open=>open===selected.lessonCode?null:selected.lessonCode)} onSelect={onSelect}/>}
        </section>}
      </section>
      <div className="r104-hw-results">
        <aside className={'r104-hw-summary'+(rankUpdate?(rankUpdate%2?' mtm-rank-refresh-odd':' mtm-rank-refresh-even'):'')} aria-labelledby="r104-hw-summary-title"><h2 id="r104-hw-summary-title">Điểm &amp; hạng của em</h2><label>Kỳ xem<select value={kind} onChange={event=>setKind(event.target.value)}>{periods.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><p className="r104-hw-period">{kind==='btvn-tuan'?'Tuần hiện tại, thứ Hai đến Chủ nhật':'Tháng dương lịch hiện tại'} · {cohort?'Khối '+cohort:displayClassName(state)}</p>
          <div aria-live="polite" aria-busy={rank.status==='loading'}>{rank.status==='ready'&&rank.row?<><dl className="r104-hw-scores"><div><dt>Điểm trung bình<small>Thang điểm 10</small></dt><dd>{rank.row.score.toLocaleString('vi-VN',{minimumFractionDigits:2,maximumFractionDigits:2})}</dd></div><div><dt>Hạng trong khối<small>{cohort?'Nhóm '+cohort:'Theo khối'}</small></dt><dd>{rank.row.rank}</dd></div></dl><p className="r104-hw-rank-context">Đã nộp {rank.row.submitted} bài, kỳ này có {rank.row.total} bài được giao.</p></>:<p className="r104-hw-rank-empty">{rank.status==='loading'?'Đang tải điểm và hạng…':rank.status==='guest'?'Phiên xếp hạng cần đăng nhập lại. Em thoát BTVN rồi đăng nhập lại để xem.':rank.status==='disabled'?'Bảng xếp hạng hiện chưa được mở.':rank.status==='unsupported'?'Lớp em chưa có bảng xếp hạng theo khối tại đây.':rank.status==='error'?'Chưa tải được điểm và hạng.':'Em chưa có hạng trong kỳ này.'}</p>}</div>
          {rank.status==='error'&&<button type="button" className="r104-hw-retry" onClick={()=>setRetry(n=>n+1)}>Thử tải lại</button>}
          <div className="r104-hw-rank-identity">{profileControl}<span><strong>{state.fullName}</strong><small>{cohort?'Khối '+cohort:displayClassName(state)} · {periods.find(([id])=>id===kind)?.[1]}</small></span></div>
          <details><summary>Điểm này được tính thế nào?</summary><p>{kind==='kiem-tra-thang'?'Ưu tiên điểm thi trên web khi có cả điểm thi giấy.':'Điểm trung bình các bài được giao trong kỳ. Bài chưa tới hạn mà chưa nộp không tính 0; điểm lấy từ hệ thống MTM.'}</p><p>Chỉ điểm đã chấm đủ mới tính hạng chính thức. Điểm tạm tính của bài tự luận hoặc nộp vở đang chờ chấm chưa tính vào hạng.</p><p>Thời gian tính theo giờ Việt Nam. Điểm từng buổi và lịch sử lượt làm nằm trong phần kết quả của buổi học.</p></details>
        </aside>
        <section className="r104-hw-history" aria-labelledby="r104-hw-history-title"><h2 id="r104-hw-history-title">Lịch sử của em</h2>
          {history.length?<><p className="r104-hw-history-note">Các buổi em đã nộp, mới nhất ở trên. Điểm là điểm cao nhất của buổi.</p><ol>{history.slice(0,5).map(lesson=><li key={lesson.lessonCode}><button type="button" onClick={()=>select(lesson,true)}><span className="r104-hw-history-date">{dateTime(lesson.submittedAt!)}</span><span className="r104-hw-history-title"><strong>{lessonHomeworkTitle(lesson)}</strong><small>Buổi {dayMonth(lesson.date)} · {lesson.late===true?'Nộp muộn':lesson.late===false?'Đúng hạn':'Chờ xác minh hạn'}</small></span><span className="r104-hw-history-score">{lesson.bestScore!==null?<>{formatScore(lesson.bestScore)}{lesson.pendingGrading&&<small>Tạm tính</small>}</>:<small>{lesson.pendingGrading?'Tạm tính · chờ chấm':'Chờ công bố'}</small>}</span></button></li>)}</ol></>:<p className="r104-hw-history-note">Em chưa có bài nộp nào trên web. Bài đã nộp sẽ hiện ở đây.</p>}
          {receipts&&<div className="r104-hw-receipts"><h3>Các lượt của buổi {dayMonth(receipts.lesson.date)}</h3><ol>{receipts.receipts.slice(0,3).map(receipt=><li key={receipt.attemptId}><span>Lượt {receipt.attemptNumber}</span><span>{dateTime(receipt.submittedAt)}{receipt.late===true?' · Nộp muộn':''}{receipt.timedOut?' · Nộp khi hết giờ':''}</span><strong>{homeworkReceiptScore(receipt)!==null?<>{homeworkReceiptScore(receipt)}{pendingHomeworkReceipt(receipt)&&<small> · Tạm tính</small>}</>:pendingHomeworkReceipt(receipt)?'Tạm tính · chờ chấm':'Chờ công bố'}</strong></li>)}</ol></div>}
        </section>
      </div>
    </div>
  </div>;
}

function LessonPreview({anchor,lesson,status,demo,busy,videoOpen,onVideo,onSelect}:{anchor:RefObject<HTMLDivElement|null>;lesson:HomeworkLesson;status:LessonStatus;demo:boolean;busy:boolean;videoOpen:boolean;onVideo:()=>void;onSelect:(code:string)=>void}){
  const due=homeworkPriorityDeadline(lesson),hasVideo=!!(lesson.videoId||lesson.videoUrl);
  const action=status==='locked'?'Chưa mở'+(lesson.opensAt!=null&&Number.isFinite(lesson.opensAt)?' · mở '+dateTime(lesson.opensAt):''):status==='preparing'?'Đang chuẩn bị':status==='scored'||status==='submitted'?'Xem kết quả':status==='closed'?'Xem thông tin bài':'Xem bài cần làm';
  const disabled=busy||status==='locked'||status==='preparing';
  return <div className="r104-hw-preview" ref={anchor} aria-live="polite">
    <div className="r104-hw-preview-copy" key={lesson.lessonCode}><small>Đang xem · Buổi {dayMonth(lesson.date)}</small><h3>{lessonHomeworkTitle(lesson)}</h3><p>{lessonCaption(lesson,demo)}</p>
      <ul className="r104-hw-preview-facts"><li><span className={'r104-hw-status r104-hw-status--'+status}>{statusLabels[status]}</span></li>
        <li>{due!==null?(lesson.kind==='kiem-tra-thang'?'Đóng: ':'Hạn: ')+dateTime(due):lesson.expectedDueAt!=null?'Hạn dự kiến: '+dateTime(lesson.expectedDueAt):'Hạn: chờ xác minh'}</li>
        {lesson.submittedAt!=null&&<li>Nộp: {dateTime(lesson.submittedAt)}</li>}
        {lesson.pendingGrading&&lesson.bestScore===null&&<li>Tạm tính · Chờ chấm đủ các phần.</li>}{lesson.bestScore!==null&&<li>{lesson.pendingGrading?'Điểm tạm tính: ':'Điểm cao nhất: '}<strong>{formatScore(lesson.bestScore)}</strong></li>}</ul></div>
    <div className="r104-hw-preview-tools"><button type="button" className="r104-hw-preview-action" disabled={disabled} onClick={()=>onSelect(lesson.lessonCode)}>{action}{!disabled&&<span aria-hidden="true">→</span>}</button>
      <p>{status==='locked'?'Buổi học mở theo lịch của lớp.':status==='preparing'?'BTVN buổi này đang chờ chuẩn bị.':'Mở thông tin bài, chưa bắt đầu lượt làm.'}</p>
      <div className="r104-hw-preview-links">{hasVideo&&<button type="button" aria-expanded={videoOpen} onClick={onVideo}>{videoOpen?'Đóng video':'▶ Xem video'}</button>}{lesson.materialUrl&&<a href={lesson.materialUrl} target="_blank" rel="noopener noreferrer">Tài liệu</a>}{lesson.handoutUrl&&<a href={lesson.handoutUrl} target="_blank" rel="noopener noreferrer">Handout</a>}</div></div>
    {videoOpen&&<div className="r104-hw-preview-video"><LessonVideo lesson={lesson} demo={demo}/></div>}
  </div>;
}
