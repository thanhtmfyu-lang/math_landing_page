import {displayTitle as titleText} from '../../components/display-text';
import {lazy,Suspense,useState} from 'react';
import {phongThiV2} from '../flags';
import FocusRoom from './FocusRoom';
import RoomNotice,{homeworkStorageNotice} from './RoomNotice';
import {Link} from '../../migration/navigation';
import type {Draft} from './store';
import {draftExportFile,pendingQuestions,questionLabel,scoredQuestionCount} from './attempt-ui';
import ExamConfirm from './ExamConfirm';
import {localStore} from './local-store';
import {usePracticeAttempt} from './usePracticeAttempt';
import type {PracticeAttemptProps} from './attempt-types';
import AttemptHeader from './AttemptHeader';
import AttemptAnswerSheet from './AttemptAnswerSheet';
import AttemptResult from './AttemptResult';
import {formatAttemptDeadline} from './deadline-label';
import './r106-assessment.css';
import {isExposedExam,PRACTICE_ONLY_NOTICE} from '../../../server/exam-security/exposure';
export {localStore};
const QuestionPdf=lazy(()=>import('./QuestionPdf'));
function exportDraft(draft: Draft): boolean {
  let url: string | undefined;
  try {
    const file = draftExportFile(draft);
    url = URL.createObjectURL(new Blob([file.text], {type: 'application/json'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    const exportedUrl = url;
    window.setTimeout(() => URL.revokeObjectURL(exportedUrl), 1000);
    return true;
  } catch { if (url) URL.revokeObjectURL(url); return false; }
}

/** kind: 'exam' cho Thi thử (/thi-thu), 'practice' (mặc định) cho Luyện tập; chỉ đổi chữ hiển thị. */
export default function PracticeAttempt({onServerStart,onServerSubmit,serverScore,exam,previousExam,catalogUrl,storeOverride,questionReader,renderText,renderSolutionExtra,contextLabel,audienceLabel,displayTitle,kind='practice',isHomework=false,homeworkSelfCheck,deadlineAt,clockOffsetMs,newAttemptsClosed,storageNotice,saveStatus,savePending,onRetrySave,onAcceptClosed,onRetake}: PracticeAttemptProps) {
  const props = {onServerStart,onServerSubmit,serverScore,exam,previousExam,catalogUrl,storeOverride,questionReader,renderText,renderSolutionExtra,contextLabel,audienceLabel,displayTitle,kind,isHomework,homeworkSelfCheck,deadlineAt,clockOffsetMs,newAttemptsClosed,storageNotice,saveStatus,savePending,onRetrySave,onAcceptClosed,onRetake};
  const state = usePracticeAttempt(props);
  const {sourceIssue,erratum,acceptedErratum,setAcceptedErratum,legacy,persisted,conflict,draft,notice,setNotice,unsaved,exportNotice,setExportNotice,pdfReady,setPdfReady,confirmation,setConfirmation,desktopLayout,setDesktopLayout,setActiveQuestion,setQuestionFocus,mobilePane,setMobilePane,leaveConfirmation,persist,finish,begin,submitted,sections,answered,invalidCount,seconds,startDisabled,startLabel,retake} = state;
  const [exitedAttempt,setExitedAttempt]=useState<string|null>(null);
  const focused=phongThiV2&&!!draft&&!submitted&&exitedAttempt!==draft.attemptId;
  if(isHomework&&submitted)return <section className="r106-assessment r106-submit-feedback" aria-label="Xác nhận nộp BTVN"><p role={onRetrySave||onAcceptClosed?"alert":"status"}>{onRetrySave||onAcceptClosed?saveStatus:"Đang chờ máy chủ MTM xác nhận bài nộp của em…"}</p>{onRetrySave&&<button type="button" onClick={onRetrySave}>Gửi lại bài đang giữ</button>}{onAcceptClosed&&<button type="button" onClick={onAcceptClosed}>Chấp nhận bản máy chủ đã chấm</button>}</section>;
  return <section className="ep-attempt r106-assessment">{leaveConfirmation}{state.serverBusy&&<p role="status">Đang chờ máy chủ xác nhận lượt thi…</p>}
    {focused?<FocusRoom key={draft.attemptId} props={props} state={state} onExit={()=>setExitedAttempt(draft.attemptId)}/>:<>
    {phongThiV2&&draft&&!submitted&&<button type="button" className="ep-primary" onClick={()=>setExitedAttempt(null)}>Vào lại phòng tập trung</button>}
    {phongThiV2&&!draft&&<section className="ep-card ep-room-intake"><strong className="r106-intake-title">{isHomework?'Phòng làm BTVN MTM':kind==='exam'?'Phòng thi thử MTM':'Phòng tự luyện MTM'}</strong><RoomNotice isHomework={isHomework}/><details><summary>Nguồn và cách chấm</summary><p>MTM sưu tầm và biên soạn</p><p>Thang 10 điểm. Điểm mỗi câu hiện ở phiếu; câu trống hoặc sai định dạng được 0 điểm.</p>{exam.questions.find(q=>q.kind==='tf')?.kind==='tf'&&<p>Đúng/sai: {exam.questions.filter(q=>q.kind==='tf').slice(0,1).map(q=>q.kind==='tf'?q.pointsByCorrectCount.map((v,i)=>i+' ý đúng: '+(v/1000).toLocaleString('vi-VN')+' điểm').join(' · '):'')}</p>}<p>Hết giờ tự nộp. Toàn màn hình giúp tập trung, không xác thực kỳ thi hay chống gian lận.</p></details></section>}
    <AttemptHeader {...props}/>
    {/* LT-15 (Đợt 4): trên điện thoại phiếu trả lời (có nút Bắt đầu) bị ẩn sau thẻ "Đọc câu hỏi"; nút này đưa việc bắt đầu lên màn đầu.
        Cùng điều kiện và cùng hàm begin() với nút trong phiếu; chỉ hiện ở màn hẹp (exams.css). */}
    {!draft&&<div className="ep-mobile-start"><button type="button" className="ep-primary ep-wide" disabled={startDisabled} onClick={begin}>{startLabel}</button><p>{persisted.current?`Hạn nộp bài đang làm: ${formatAttemptDeadline(persisted.current.deadline)}.`:`Đồng hồ ${exam.durationMinutes} phút chỉ chạy khi bấm nút. Có thể đọc đề trước ở mục bên dưới.`}{erratum&&!acceptedErratum?' Hãy đọc và đánh dấu điều kiện đính chính ở ngay dưới trước khi bắt đầu.':''}</p></div>}
    {isExposedExam(exam.id)&&<p className="ep-notice" role="note">{PRACTICE_ONLY_NOTICE}</p>}
    {exam.preAttemptNotice&&<div className="ep-notice"><strong>Điều kiện đính chính của bản MTM</strong><p>{exam.preAttemptNotice}</p><p>Bản nguồn và lịch sử cũ được giữ riêng.</p></div>}
    {newAttemptsClosed&&<div className="ep-notice" role="status"><strong>Tạm chưa mở lượt mới</strong><p>{newAttemptsClosed}</p></div>}
    {notice&&<p className="ep-notice" role="alert">{notice}</p>}
    {erratum&&<div className="ep-notice"><strong>Bản luyện tập MTM đính chính v37 · điều kiện áp dụng khi chấm</strong><p>{erratum.condition}</p><p>Thành đã duyệt đính chính này. PDF nguồn giữ nguyên; lượt mới dùng mã phiên bản riêng. Lịch sử cũ giữ điểm theo khóa trước đính chính.</p>{<label className="ep-erratum-accept"><input type="checkbox" checked={acceptedErratum} onChange={event=>setAcceptedErratum(event.target.checked)}/> Tôi đã đọc điều kiện đính chính và làm bài theo điều kiện này.</label>}{legacy?.ok&&legacy.value&&<p>Đã giữ bản lưu trước đính chính. {legacy.value.submittedAt===null?<button type="button" onClick={()=>setExportNotice(exportDraft(legacy.value!)?'Đã yêu cầu tải bản lưu bài cũ.':'Chưa tải được bản lưu; hãy giữ trang mở.')}>Tải bản lưu bài cũ đang làm</button>:<Link href={catalogUrl}>Xem lượt cũ trong lịch sử</Link>}</p>}</div>}
    {sourceIssue&&<div className="ep-notice" role="alert"><strong>Đề đang chờ đính chính · tạm ngừng lượt mới.</strong><p>{sourceIssue}</p><p>PDF gốc và lịch sử cũ được giữ. Điểm cũ dùng khóa trước khi phát hiện vấn đề này; cần đọc phần đối chiếu để hiểu giới hạn của kết quả.</p>{persisted.current&&persisted.current.submittedAt===null&&<button type="button" onClick={()=>setExportNotice(exportDraft(persisted.current!)?'Đã yêu cầu tải bản lưu bài đang làm.':'Chưa tải được bản lưu; hãy giữ trang mở.')}>Tải bản lưu bài đang làm</button>}</div>}
    {unsaved&&<p className="ep-notice" role="status">Chưa xác nhận bài làm được lưu bền vững trên trình duyệt. Câu trả lời vẫn giữ trên trang. Hãy tải bản lưu bài làm trước khi đóng hoặc tải lại trang.</p>}
    <div className="ep-mobile-panes" role="group" aria-label="Chọn vùng làm bài"><button type="button" aria-pressed={mobilePane==='pdf'} onClick={()=>setMobilePane('pdf')}>{exam.sourcePdf?'Đọc đề PDF':'Đọc câu hỏi'}</button><button type="button" aria-pressed={mobilePane==='answers'} onClick={()=>setMobilePane('answers')}>{submitted?'Kết quả và lời giải':'Phiếu trả lời'}</button>{draft&&!submitted&&<span className="ep-mobile-timer" role="timer" aria-label="Thời gian còn lại" aria-live="off">Còn {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span>}</div>
    {!submitted&&<div className="ep-desktop-layout" role="group" aria-label="Bố cục đọc đề và phiếu trả lời"><span>Bố cục làm bài</span>{([['balanced','Cân đối'],['reading','Ưu tiên đọc đề'],['answers','Ưu tiên phiếu']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={desktopLayout===value} onClick={()=>setDesktopLayout(value)}>{label}</button>)}</div>}
    <div className={`ep-exam-layout ep-pane-${mobilePane}${submitted?questionReader?' ep-chapter-submitted':' ep-submitted':''}`} data-layout={desktopLayout} onErrorCapture={event=>{
      if(!submitted&&event.target instanceof HTMLImageElement&&event.target.closest('.mtm-source-content')){
        const id=event.target.closest('[data-question-id]')?.getAttribute('data-question-id');if(id)state.setQuestionAssetReady(id,false);setNotice('Một phần đề chưa tải. Em vẫn làm câu khác và nộp phần đã làm; dùng nút Thử tải lại ảnh ở câu lỗi.');
      }
    }} onLoadCapture={event=>{if(event.target instanceof HTMLImageElement&&event.target.closest('.mtm-source-content')){const article=event.target.closest('[data-question-id]');const id=article?.getAttribute('data-question-id');if(id&&!article?.querySelector('.mtm-source-content [role="alert"]')&&Array.from(article!.querySelectorAll<HTMLImageElement>('.mtm-source-content img')).every(image=>image.complete&&image.naturalWidth>0))state.setQuestionAssetReady(id,true);}}}>
      <div className="ep-pdf-pane">
        {submitted&&!questionReader&&exam.sourcePdf&&<h2 className="ep-pdf-after">Đề bài đã làm</h2>}
        {submitted&&questionReader?<details className="ep-read-again"><summary>Đọc lại toàn bộ đề bài</summary>{questionReader}</details>:questionReader}
        {exam.sourcePdf&&<Suspense fallback={<p role="status">Đang mở bản câu hỏi…</p>}><QuestionPdf file={exam.sourcePdf} title={titleText(exam.title)} onReady={setPdfReady}/></Suspense>}
        {exam.sourcePdf&&!pdfReady&&exam.sourceUrl&&<p><a href={exam.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Xem nguồn để đối chiếu</a> · Nguồn gốc có thể chứa đáp án hoặc mã đề khác; chưa mở làm bài khi không xem được bản câu hỏi.</p>}
      </div>
      <div className="ep-answer-pane" aria-label={submitted?'Kết quả bài làm':'Phiếu trả lời'}>
        {isHomework&&draft&&!submitted&&homeworkSelfCheck}
        {!draft?<section className="ep-card">
          <h2>Phiếu trả lời</h2><p>{isHomework?homeworkStorageNotice:storeOverride?'Bản xem thử chỉ giữ trong bộ nhớ của trang quản trị, không ghi lịch sử học sinh.':'Bài làm và kết quả lưu trên trình duyệt này. Thời gian tiếp tục tính khi bạn rời trang.'}</p>
          <p>{sections.map(s=>`${s.name}: ${s.count} câu`).join(' · ')}</p>
          {persisted.current&&<p>Đã có bài đang làm. Hạn nộp: {formatAttemptDeadline(persisted.current.deadline)}.</p>}
          <button type="button" className="ep-primary ep-wide" disabled={startDisabled} onClick={begin}>{startLabel}</button>
        </section>:<>
          <div className="ep-toolbar ep-answer-toolbar">
            {submitted?<strong role="status">{unsaved?'Đã nộp trên trang · chưa xác nhận lưu':'Đã nộp và lưu kết quả'}</strong>:<><span role="timer" aria-label="Thời gian còn lại" aria-live="off">Còn {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span><span>{answered}/{scoredQuestionCount(exam)} câu đã trả lời đầy đủ{invalidCount>0?` · ${invalidCount} câu sai định dạng`:''}</span></>}
          </div>
          {submitted?<>
            <AttemptResult props={props} state={state}/>
          </>:<>
            <AttemptAnswerSheet props={props} state={state}/>
          </>}
          <div className="ep-toolbar ep-backup-row">{unsaved&&!conflict.current&&<button type="button" onClick={()=>persist(draft)}>Thử lưu lại</button>}<details className="ep-backup" open={unsaved||conflict.current||undefined}><summary>Bản lưu bài làm</summary><p>Tải một tệp dự phòng bài làm về máy này, dùng khi trình duyệt bị xóa dữ liệu. Tệp chỉ nằm trên máy, không tự gửi đi đâu.</p><button type="button" onClick={()=>setExportNotice(exportDraft(draft)?'Đã yêu cầu tải bản lưu bài làm.':'Chưa tải được bản lưu. Hãy giữ trang mở và thử lại.')}>Tải bản lưu bài làm</button></details></div>
        </>}
      </div>
    </div>
    {exportNotice&&<p role="status">{exportNotice}</p>}
    </>}
    {confirmation==='submit'&&draft&&(()=>{const pending=pendingQuestions(exam,draft.answers),count=(s:string)=>pending.filter(p=>p.state===s).length,parts=[[count('blank'),'câu trống'],[count('partial'),'câu Đúng/Sai chưa chọn đủ 4 ý'],[count('invalid'),'câu sai định dạng']].filter(([n])=>n).map(([n,t])=>`${n} ${t}`);const stateText={blank:'chưa trả lời',partial:'chưa chọn đủ 4 ý',invalid:'sai định dạng'} as const;return <ExamConfirm title="Nộp bài khi còn câu chưa xong?" message={`Còn ${pending.length} câu chưa trả lời đầy đủ (${parts.join(', ')}). Bấm vào một câu để quay lại làm; nộp bài sẽ kết thúc lượt này.`} itemsLabel="Câu chưa trả lời đầy đủ" items={pending.map(p=>{const original=questionLabel(exam,p.index),label=isHomework?{...original,number:p.index+1,full:`Câu ${p.index+1} · ${original.part}`}:original;return {key:p.id,group:label.part,label:`Câu ${label.number}`,detail:p.state==='blank'?undefined:stateText[p.state],warn:p.state==='invalid',ariaLabel:`${label.full}: ${stateText[p.state]}`,onSelect:()=>{setConfirmation(null);setActiveQuestion(p.index);setMobilePane('answers');setQuestionFocus(true);}};})} cancelLabel="Ở lại làm tiếp" confirmLabel="Vẫn nộp bài" onCancel={()=>setConfirmation(null)} onConfirm={()=>finish(false,true)}/>;})()}
    {confirmation==='retake'&&<ExamConfirm title="Làm một lượt mới?" message="Bài đã nộp giữ trong lịch sử trước khi bắt đầu lượt mới." confirmLabel="Bắt đầu lượt mới" onCancel={()=>setConfirmation(null)} onConfirm={()=>retake(true)}/>}
  </section>;
}
