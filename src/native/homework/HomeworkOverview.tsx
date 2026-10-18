import {useId,useState} from 'react';
import type {HomeworkState,HomeworkLesson,HomeworkReceipt} from './btvn-contract';
import {homeworkTitle,homeworkLessonCaption,displayClassName} from './presentation';
import ExamReview from '../exams/ExamReview';
import {LessonVideo} from './LessonCards';
import HomeworkRetry from './HomeworkRetry';
import HomeworkResultSummary from './HomeworkResultSummary';
import {acknowledgedHomeworkReceipt,acknowledgedHomeworkSubmission,homeworkReceiptScore,provisionalHomeworkReceiptScore,pendingHomeworkReceipt,monthlyResultsHidden,isMtmHomeworkReceipt,validatedMtmReceiptSnapshot} from './result-summary';
import {reviewRows} from '../exams/review';
import {hasReadableTfStatements} from '../exams/question-statements';
import MtmScoreBreakdown from '../exams/MtmScoreBreakdown';
import {MTM_SCORING_VERSION} from '../exams/mtm-scoring';
import '../exams/r106-assessment.css';

export const homeworkDate=(at:number)=>Number.isSafeInteger(at)&&at>=0&&at<=253402300799999?new Date(at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',weekday:'long',day:'2-digit',month:'2-digit'}):'Chưa xác định thời điểm';
const validScore=(score:number)=>Number.isFinite(score)&&score>=0&&score<=10;
export function HomeworkDeadline({lesson,dueAt}:{lesson?:HomeworkLesson;dueAt:number|null}){
  return <p className="btvn-deadline">{dueAt!==null?'Hạn: trước '+homeworkDate(dueAt)+' (theo lịch lớp)':lesson?.expectedDueAt!=null?'Hạn dự kiến: trước '+homeworkDate(lesson.expectedDueAt)+' (theo lịch lớp)':'Hạn: chờ xác minh lịch lớp và ca học'} (giờ Việt Nam).</p>;
}
export default function HomeworkOverview({state,busy,onStart,onRefreshReceipt}:{state:HomeworkState;busy:boolean;onStart:()=>void;onRefreshReceipt?:()=>void}){
  const [solutions,setSolutions]=useState(false),[video,setVideo]=useState(false);
  const receiptStatusId=useId()+'-receipt-status';
  const lesson=state.lessons?.find(l=>l.lessonCode===state.lessonCode);
  const receipts=[...state.receipts].filter(Boolean).sort((a,b)=>b.attemptNumber-a.attemptNumber);
  const hidden=monthlyResultsHidden(state);
  const current=acknowledgedHomeworkReceipt(state);
  const submission=acknowledgedHomeworkSubmission(state),submittedReceipt=current??(!hidden?submission:null);
  const hiddenSubmission=hidden&&!!submission;
  const scoreNeedsReview=!hidden&&!!submission&&!current;
  const mtm=current?validatedMtmReceiptSnapshot(current):null;
  const currentScore=current?homeworkReceiptScore(current):null;
  const pendingCurrent=!!current&&pendingHomeworkReceipt(current);
  const awaitingReceipt=state.draft?.submittedAt!=null&&!submittedReceipt&&!hiddenSubmission;
  const receiptScore=(receipt:HomeworkReceipt)=>receipt.attemptId===state.draft?.attemptId&&(state.draft.rubricVersion===MTM_SCORING_VERSION||isMtmHomeworkReceipt(receipt))&&receipt!==current?null:homeworkReceiptScore(receipt);
  const mtmBest=state.draft?.rubricVersion===MTM_SCORING_VERSION||receipts.some(receipt=>receipt.score===state.bestScore&&isMtmHomeworkReceipt(receipt));
  const bestReceipt=receipts.find(receipt=>(receipt.officialScore??receipt.score)===state.bestScore&&receiptScore(receipt)!==null&&(!mtmBest||!!validatedMtmReceiptSnapshot(receipt)));
  const bestNeedsReview=!bestReceipt&&mtmBest;
  const bestHasScore=!hidden&&state.bestScore!==null&&validScore(state.bestScore)&&!bestNeedsReview;
  const best=hidden?'Chờ công bố':state.bestScore===null?'Chưa có':bestHasScore?(bestReceipt?receiptScore(bestReceipt):state.bestScore.toLocaleString('vi-VN'))+'/10'+(bestReceipt&&pendingHomeworkReceipt(bestReceipt)?' · Tạm tính':''):'Chưa hiện được điểm';
  const remaining=Math.max(0,state.maxAttempts-state.attemptsUsed);
  // 18/10 anh Thành: nộp BTVN mà dưới 7 điểm thì nhắc làm lại. Điểm lần đầu lên bảng xếp hạng lớp; điểm cao nhất gửi phụ huynh.
  const lastScore=current&&!pendingCurrent?(current.officialScore??current.score):null;
  const belowSeven=state.kind!=='kiem-tra-thang'&&!hidden&&typeof lastScore==='number'&&validScore(lastScore)&&lastScore<7;
  const monthly=state.kind==='kiem-tra-thang',canReview=state.solutionsAvailable!==false;
  const hasAnswers=!!state.draft?.answers&&typeof state.draft.answers==='object'&&!Array.isArray(state.draft.answers);
  const reviewReady=!!current&&canReview&&hasAnswers&&!!state.exam&&!!state.draft&&state.draft.examId===state.exam.id&&state.draft.examVersionHash===state.exam.versionHash&&state.draft.rubricVersion===state.exam.rubricVersion&&state.draft.answerKeyVersion===state.exam.answerKeyVersion;
  const unavailableRetry=reviewReady&&state.exam&&state.draft
    ?reviewRows(state.exam,state.draft).filter(({q,status})=>q.kind==='tf'&&(status==='wrong'||status==='partial'||status==='unanswered')&&!hasReadableTfStatements(q)).length:0;
  return <div id="btvn-summary" className="btvn-detail r106-homework-overview">
    <div className="btvn-heading"><p className="btvn-eyebrow">{displayClassName(state)} · {submittedReceipt?(monthly?'KẾT QUẢ KIỂM TRA THÁNG':'KẾT QUẢ BTVN'):hiddenSubmission?'ĐÃ NỘP':awaitingReceipt?'ĐANG XÁC NHẬN KẾT QUẢ':'CHUẨN BỊ LÀM BÀI'}</p><h1>{homeworkTitle(state)}</h1>{homeworkLessonCaption(state)&&<p className="btvn-sub">{homeworkLessonCaption(state)}</p>}</div>
    {submittedReceipt&&<div className="btvn-result-meta"><span>{scoreNeedsReview?'Bài đã nộp. Điểm đang được đối soát.':'Bài đã nộp và lưu kết quả.'}</span><strong className={'btvn-chip'+(bestHasScore?' success':'')}>Điểm cao nhất: {best}</strong></div>}
    {belowSeven&&<div className="btvn-redo" role="alert"><strong>Em chưa đạt từ 7 điểm trở lên.</strong> {remaining>0?'Hãy làm lại bài này nhé (em còn '+remaining+' lượt).':'Em đã dùng hết lượt, hãy xem lời giải và ôn lại các câu sai nhé.'}<small>Điểm lần nộp đầu tính lên bảng xếp hạng lớp trên web. Điểm cao nhất trong các lần làm BTVN là điểm gửi phụ huynh.</small></div>}
    {monthly&&<p role="status">Kiểm tra cuối tháng · Chỉ 1 lượt. Mở: {state.opensAt&&homeworkDate(state.opensAt)}. Đóng: {state.closesAt&&homeworkDate(state.closesAt)} (giờ Việt Nam). {!canReview&&'Lời giải chỉ mở sau giờ đóng.'}</p>}
    {!monthly&&state.canStart===false&&state.opensAt!==undefined&&<p role="status">Mở làm sau buổi học: {homeworkDate(state.opensAt)} (giờ Việt Nam).</p>}
    <div className="btvn-detail-grid">
      <article className="btvn-sheet">
        {hiddenSubmission?<><h2>Em đã nộp bài kiểm tra tháng</h2><p role="status">Đã nộp, điểm công bố sau giờ đóng.</p></>:submittedReceipt?<><div className="btvn-result-top"><span className="btvn-check">{pendingCurrent||scoreNeedsReview?'…':'✓'}</span><div><h2>{Number.isSafeInteger(submittedReceipt.attemptNumber)&&submittedReceipt.attemptNumber>0?(pendingCurrent||scoreNeedsReview?'Em đã nộp lượt ':'Em đã hoàn thành lượt ')+submittedReceipt.attemptNumber:pendingCurrent||scoreNeedsReview?'Em đã nộp lượt này':'Em đã hoàn thành lượt này'}</h2><p>{typeof submittedReceipt.late!=='boolean'?'Chờ xác minh hạn nộp':submittedReceipt.late?'Nộp muộn':'Đúng hạn'}{submittedReceipt.timedOut===true?' · Hết giờ tự nộp':''}</p></div></div><div className="btvn-score-big">{scoreNeedsReview?<p role="status">Chưa hiện được điểm lượt này vì bảng điểm cần đối soát. Bài nộp đã được lưu.</p>:pendingCurrent?<><strong>{provisionalHomeworkReceiptScore(current!)??'…'}{provisionalHomeworkReceiptScore(current!)!==null&&<small>/10</small>}</strong><p role="status">Tạm tính · Chưa công bố tổng điểm. Chờ chấm đủ các phần, chưa tính vào hạng chính thức.</p></>:currentScore===null?<p role="status">Chưa công bố tổng điểm</p>:<><strong>{currentScore}<small>/10</small></strong><p>Điểm lượt này</p></>}</div>{(!Number.isSafeInteger(submittedReceipt.elapsedSeconds)||submittedReceipt.elapsedSeconds<0)&&<p className="btvn-footnote">Chưa xác định được thời gian làm bài. {pendingCurrent||scoreNeedsReview?'Bài nộp đã được lưu.':'Điểm lượt này đã được xác nhận.'}</p>}{mtm&&current?.officialScore===undefined&&<MtmScoreBreakdown score={mtm}/>}</>:awaitingReceipt?<><h2>Đang xác nhận lượt vừa nộp</h2><p id={receiptStatusId} role="status">Chưa có biên nhận duy nhất của lượt vừa nộp. Em giữ trang và kiểm tra lại biên nhận để xem kết quả.</p></>:<h2>Trước khi bắt đầu</h2>}
        <div className="btvn-stats"><div><small>Đã dùng</small><strong>{state.attemptsUsed}/{state.maxAttempts} lượt</strong></div><div><small>Điểm cao nhất</small><strong>{best}</strong></div><div><small>{submittedReceipt||awaitingReceipt||hiddenSubmission?'Còn lại':'Thời gian'}</small><strong>{submittedReceipt||awaitingReceipt||hiddenSubmission?remaining+' lượt':state.exam?state.exam.durationMinutes+' phút/lượt':'Chờ mở bài'}</strong></div></div>
        {!submittedReceipt&&!awaitingReceipt&&!hiddenSubmission&&<>{!monthly&&<HomeworkDeadline lesson={lesson} dueAt={state.dueAt}/>}<p>Em có tối đa {state.maxAttempts} lượt{state.exam&&<>, mỗi lượt {state.exam.durationMinutes} phút, gồm {state.exam.questions.length} câu</>}. Mở lượt tính ngay là một lần làm.</p><p>{monthly?'Bài tự nộp khi hết thời gian làm hoặc đến giờ đóng.':'Điểm cao nhất tính cả lần nộp muộn. Hết thời gian, bài tự nộp.'}</p></>}
        <div className="btvn-overview-actions">{onRefreshReceipt&&(awaitingReceipt||scoreNeedsReview||pendingCurrent)&&<button type="button" className="btvn-btn" disabled={busy} onClick={onRefreshReceipt}>Kiểm tra lại biên nhận</button>}{reviewReady&&<button className="btvn-btn primary" aria-expanded={solutions} aria-controls="btvn-solutions" onClick={()=>setSolutions(!solutions)}>{solutions?'Đóng lời giải':'Xem lời giải'}</button>}{remaining>0?<button className={'btvn-btn'+(!submittedReceipt&&!awaitingReceipt&&!hiddenSubmission?' primary':'')} disabled={busy||state.canStart===false||awaitingReceipt} aria-describedby={awaitingReceipt?receiptStatusId:undefined} onClick={onStart}>{submittedReceipt||awaitingReceipt||hiddenSubmission?'Làm lượt tiếp':'Bắt đầu làm bài'}</button>:<p>Em đã dùng hết {state.maxAttempts} lượt.</p>}</div>
        {!hidden&&<HomeworkResultSummary state={state}/>}
        {reviewReady&&!monthly&&<p className="btvn-footnote">Lượt làm sau khi đã xem lời giải vẫn tính vào điểm cao nhất của BTVN.</p>}
        {current&&!hasAnswers&&<p className="btvn-footnote">Chưa mở được phần ôn của bản nộp này. {pendingCurrent?'Bài nộp đã lưu và quyền làm lượt tiếp vẫn được giữ.':'Điểm đã lưu và quyền làm lượt tiếp vẫn được giữ.'}</p>}
        {!awaitingReceipt&&remaining>0&&state.exam&&<p className="btvn-footnote">Lượt tiếp theo: lượt {state.attemptsUsed+1} · {state.exam.durationMinutes} phút</p>}
      </article>
      <aside className="btvn-sheet btvn-history">{awaitingReceipt&&<><p className="btvn-eyebrow">ĐANG CHỜ BIÊN NHẬN</p><h2>Đang chờ kết quả lượt vừa nộp</h2><p>Lượt tiếp sẽ mở khi có biên nhận của lượt này.</p></>}{receipts.length>0?<><h2>Các lượt em đã làm</h2>{receipts.map(r=><div className="btvn-history-row" key={r.attemptId}><div><b>{Number.isSafeInteger(r.attemptNumber)&&r.attemptNumber>0?'Lượt '+r.attemptNumber:'Lượt đã làm'}</b><small>{homeworkDate(r.submittedAt)}{!hidden&&<> · {typeof r.late!=='boolean'?'Chờ xác minh hạn':r.late?'Nộp muộn':'Đúng hạn'}{r.timedOut===true?' · Hết giờ':''}</>}</small></div>{!hidden&&receiptScore(r)!==null?<strong>{receiptScore(r)}/10{pendingHomeworkReceipt(r)&&' · Tạm tính'}</strong>:<span className="btvn-footnote">{hidden?'Đã nộp, điểm công bố sau giờ đóng':pendingHomeworkReceipt(r)?'Tạm tính · Chưa công bố tổng điểm':'Chưa hiện được điểm lượt này'}</span>}</div>)}<HomeworkDeadline lesson={lesson} dueAt={state.dueAt}/></>:!awaitingReceipt&&<><p className="btvn-eyebrow">SẴN SÀNG RỒI CHỨ?</p><h2>Đến lượt em thử sức.</h2><p>Chuẩn bị giấy nháp và máy tính. Chọn một nơi yên tĩnh để tập trung làm bài.</p></>}
        {lesson&&(lesson.videoId||lesson.videoUrl)&&<button className="btvn-btn" aria-expanded={video} onClick={()=>setVideo(!video)}>{video?'Đóng video':'▷ Xem video buổi học'}</button>}
      </aside>
    </div>
    {state.assetWarnings?.map(warning=><p key={warning} role="status">{warning}</p>)}
    {unavailableRetry>0&&<p className="btvn-footnote">Có {unavailableRetry} câu Đúng/Sai chưa đủ điểm hoặc chưa trả lời chưa đưa vào phần ôn vì màn này thiếu văn bản các mệnh đề. Em xem lại đề gốc và lời giải để đối chiếu.</p>}
    {!hidden&&<HomeworkRetry state={state}/>}
    {video&&lesson&&<div className="btvn-sheet"><LessonVideo lesson={lesson} demo={state.demo}/></div>}
    {solutions&&reviewReady&&state.exam&&state.draft&&<div id="btvn-solutions" className="btvn-sheet"><ExamReview exam={state.exam} draft={state.draft} showSummary={false}/></div>}
  </div>;
}
