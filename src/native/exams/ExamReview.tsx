import {displayQuestionPoints} from './flexible-profile';
import ResultSummary from './ResultSummary';
import {examSections} from './flexible-profile';
import React,{lazy,Suspense,useEffect,useId,useState,type ReactNode} from 'react';
import type {PracticeExam,PracticeQuestion} from './data';
import type {Draft} from './store';
import {validateDraft} from './store';
import MtmSourceContent from './MtmSourceContent';
import MtmSourceQuestion from './MtmSourceQuestion';
import {displayAnswer,formatPoints,reviewRows,statementLetters,STATUS_LABELS,type ReviewStatus} from './review';
import {displayKeyAnswer,questionLabel} from './attempt-ui';
import {hasReadableTfStatements} from './question-statements';
import {MTM_SCORING_VERSION} from './mtm-scoring';
import './review-filters-v2.css';
import ResultSpacedReviewTool from './ResultSpacedReviewTool';
const DetailedSolution=lazy(()=>import('./DetailedSolution'));
const SolutionPdf=lazy(()=>import('../admin/SolutionPdf'));
const hasReviewableKey=(q:PracticeQuestion)=>q.kind==='mc'?['A','B','C','D'].includes(q.answer):q.kind==='tf'?Array.isArray(q.answer)&&q.answer.length===4&&q.answer.every(value=>typeof value==='boolean'):q.kind==='short'?Array.isArray(q.acceptedAnswers)&&q.acceptedAnswers.length>0&&q.acceptedAnswers.every(value=>typeof value==='string'&&!!value.trim()):false;

export default function ExamReview({exam,draft,initialQuestionId,reviewRequestRevision=0,renderText,renderSolutionExtra,showSummary=true,advancedFilters=false}:{exam:PracticeExam;draft:Draft;initialQuestionId?:string;reviewRequestRevision?:number;showSummary?:boolean;advancedFilters?:boolean;renderText?:(text:string)=>ReactNode;renderSolutionExtra?:(q:PracticeQuestion)=>ReactNode}) {
  const requestIndex=initialQuestionId&&draft.submittedAt!==null&&validateDraft(draft,exam).ok?exam.questions.findIndex(q=>q.id===initialQuestionId):-1;
  const [filter,setFilter]=useState<'all'|'mistakes'|ReviewStatus>('all');
  const [section,setSection]=useState('all');
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set(requestIndex>=0&&initialQuestionId?[initialQuestionId]:[]));
  const [focusQuestion,setFocusQuestion]=useState<number|null>(()=>requestIndex>=0?requestIndex:null);
  const instance=useId();
  useEffect(()=>{if(requestIndex<0||!initialQuestionId)return;setFilter('all');setSection('all');setExpanded(prior=>new Set([...prior,initialQuestionId]));setFocusQuestion(requestIndex);},[initialQuestionId,reviewRequestRevision,requestIndex,draft.attemptId,exam.versionHash,exam.answerKeyVersion]);
  useEffect(()=>{if(focusQuestion!==null){const target=document.getElementById(`${instance}-card-${focusQuestion}`);target?.focus();target?.scrollIntoView({block:'start'});setFocusQuestion(null);}},[focusQuestion,instance]);
  if(draft.submittedAt===null)return null;
  const mtm=exam.rubricVersion===MTM_SCORING_VERSION;
  // Đề chấm trên máy chủ không mang đáp án trong bundle: thiếu khóa thì báo chưa có, không đọc .map (trang trắng 29/10).
  const keyReady=(q:PracticeQuestion,status:string)=>hasReviewableKey(q)&&(!mtm||status!=='unscored');
  const parts=examSections(exam),selectedPart=advancedFilters?parts.find(part=>String(part.from)===section):undefined;
  const rows=reviewRows(exam,draft),visible=rows.filter(r=>(!selectedPart||r.index>=selectedPart.from&&r.index<selectedPart.to)&&(filter==='all'||(filter==='mistakes'?r.status!=='correct'&&r.status!=='self':r.status===filter)));
  const wrong=rows.filter(r=>r.status!=='correct'&&r.status!=='self').length,blank=rows.filter(r=>r.status==='unanswered').length;
  const allOpen=visible.length>0&&visible.every(r=>expanded.has(r.q.id));
  return <section className="ep-result-review" aria-label="Đối chiếu bài đã nộp">
    {exam.id.startsWith('mtm-custom-')&&<Suspense fallback={<p>Đang mở công cụ lời giải…</p>}><SolutionPdf examId={exam.id} kind="questions"/><SolutionPdf examId={exam.id}/></Suspense>}
    {exam.mtmDocuments?.solutions&&<p><a href={exam.mtmDocuments.solutions.url} target="_blank" rel="noopener noreferrer">Tải đáp án và lời giải PDF theo mẫu MTM</a></p>}{exam.solutionInstructions&&<details><summary>Hướng dẫn lời giải</summary><MtmSourceContent segments={exam.solutionInstructions} assetBase="/practice-media/source-crops" label="Hướng dẫn giải" kind="solution"/></details>}
    {showSummary&&<ResultSummary exam={exam} draft={draft}/>}
    {advancedFilters&&<ResultSpacedReviewTool key={[draft.attemptId,exam.versionHash,exam.answerKeyVersion].join(':')} exam={exam} draft={draft} onReview={id=>{const row=rows.find(value=>value.q.id===id);if(!row)return;setFilter('all');setSection('all');setExpanded(prior=>new Set([...prior,id]));setFocusQuestion(row.index);}}/>}
    <h2>Tổng quan câu trả lời</h2>
    <nav className="ep-result-nav-wrap" aria-label="Tổng quan đúng sai">{parts.map(part=><section key={part.name}><h3>{part.name}</h3><div className="ep-question-nav ep-result-nav">{rows.slice(part.from,part.to).map(r=><button type="button" key={r.q.id} className={`ep-verdict-${r.status}`} aria-label={`${questionLabel(exam,r.index).full}: ${STATUS_LABELS[r.status]}`} onClick={()=>{setFilter('all');setSection('all');setFocusQuestion(r.index);}}>{r.index-part.from+1}</button>)}</div></section>)}</nav>
    <p>Đúng toàn bộ: {rows.filter(r=>r.status==='correct').length} · Đúng một phần: {rows.filter(r=>r.status==='partial').length} · Chưa đúng: {rows.filter(r=>r.status==='wrong').length} · Bỏ trống: {blank}.</p>
    <div className="ep-review-filters" role="group" aria-label="Lọc câu đã nộp">
      <button type="button" aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>Tất cả câu ({rows.length})</button>
      <button type="button" aria-pressed={filter==='mistakes'} onClick={()=>setFilter('mistakes')}>Câu sai / chưa đủ điểm ({wrong})</button>
      <button type="button" aria-pressed={filter==='unanswered'} onClick={()=>setFilter('unanswered')}>Câu bỏ trống ({blank})</button>
      {advancedFilters&&(['correct','partial','wrong','unscored','self'] as const).map(status=><button type="button" key={status} aria-pressed={filter===status} onClick={()=>setFilter(status)}>{STATUS_LABELS[status]} ({rows.filter(row=>row.status===status).length})</button>)}
      <button type="button" disabled={!visible.length} onClick={()=>setExpanded(previous=>{const next=new Set(previous);for(const r of visible)allOpen?next.delete(r.q.id):next.add(r.q.id);return next;})}>{allOpen?'Thu gọn lời giải':'Mở lời giải các câu đang xem'}</button>
    </div>
    {advancedFilters&&<label className="ep-review-section-filter">Lọc theo phần của đề<select value={selectedPart?section:'all'} onChange={event=>setSection(event.target.value)}><option value="all">Tất cả phần</option>{parts.map(part=><option key={part.from} value={String(part.from)}>{part.label}</option>)}</select><small>Kết hợp với trạng thái đã chọn. Số trên các nút tính cho toàn đề.</small></label>}
    <p role="status">Đang xem {visible.length}/{rows.length} câu. Câu đúng/sai có đủ văn bản được đối chiếu từng ý; câu đúng một phần vẫn nằm trong mục chưa đủ điểm.</p>
    {!visible.length&&<p>Không có câu trong mục này.</p>}
    {visible.map(({q,index,answer,earned,status,invalidNumeric})=><section className="ep-question ep-card" key={q.id} id={`${instance}-card-${index}`} tabIndex={-1} aria-labelledby={`${instance}-q-${index}`}>
      <h3 id={`${instance}-q-${index}`}>{questionLabel(exam,index).full} <small>({formatPoints(displayQuestionPoints(exam,q.maxMillipoints))} điểm)</small></h3>
      <p className={`ep-verdict ep-verdict-${status}`}>{STATUS_LABELS[status]}</p>
      {(q.prompt||q.text)&&<p className="ep-source-text">{renderText?renderText(q.prompt??q.text!):q.prompt??q.text}</p>}
      {q.sourceContent&&<MtmSourceQuestion question={q}/>}<p className="ep-source-ref">MTM sưu tầm và biên soạn</p>
      <div className="ep-review">
        <p><strong>Bài làm:</strong> {displayAnswer(answer)}</p>
        <p><strong>Đáp án:</strong> {!keyReady(q,status)?'Chưa có đáp án đã xác minh':q.kind==='mc'?q.answer:q.kind==='tf'?q.answer.map((v,i)=>`${statementLetters[i]}) ${v?'Đúng':'Sai'}`).join('; '):q.kind==='self'?'Xem lời giải để tự kiểm tra':q.acceptedAnswers.map(value=>displayKeyAnswer(q.mode,value)).join(' hoặc ')}</p>
        {q.kind==='tf'&&keyReady(q,status)&&(hasReadableTfStatements(q)?<ul className="ep-statement-review">{q.answer.map((expected,i)=>{
          const value=Array.isArray(answer)?answer[i]:null;
          return <li key={i}><strong>Ý {statementLetters[i]}:</strong> {value===null?'Chưa trả lời':value===expected?'Khớp đáp án':'Chưa khớp đáp án'}{q.statements?.[i]&&<p>{renderText?renderText(q.statements[i]):q.statements[i]}</p>}</li>;
        })}</ul>:<p className="ep-statement-unavailable">{exam.sourcePdf?'Các mệnh đề nằm trong PDF đề. Màn này không mở PDF; em xem lại đề gốc để đối chiếu từng ý.':'Màn này chưa có đủ văn bản bốn mệnh đề. Em xem lại các ý trong đề gốc để đối chiếu.'}</p>)}
        {invalidNumeric&&<p>Câu trả lời không đúng định dạng số: 0 điểm.</p>}
        <p><strong>Điểm câu này:</strong> {status==='self'?'Không tính điểm':status==='unscored'?'Chưa tính được':formatPoints(displayQuestionPoints(exam,earned))} / {formatPoints(displayQuestionPoints(exam,q.maxMillipoints))}</p>
      </div>
      {q.correctionNote&&<p className="ep-source-erratum"><strong>Đính chính MTM:</strong> {renderText?renderText(q.correctionNote):q.correctionNote}</p>}
      {q.sourceContent?.solutions&&keyReady(q,status)&&<details className="ep-solution" open={expanded.has(q.id)} onToggle={event=>{const open=event.currentTarget.open;setExpanded(previous=>{if(previous.has(q.id)===open)return previous;const next=new Set(previous);open?next.add(q.id):next.delete(q.id);return next;});}}><summary>Đáp án và lời giải đầy đủ theo mẫu MTM</summary>{expanded.has(q.id)&&<MtmSourceContent segments={q.sourceContent.solutions} assetBase="/practice-media/source-crops" label={q.sourceRef} kind="solution"/>}</details>}
      {q.solution&&keyReady(q,status)&&<details className="ep-solution" open={expanded.has(q.id)} onToggle={event=>{const open=event.currentTarget.open;setExpanded(previous=>{if(previous.has(q.id)===open)return previous;const next=new Set(previous);open?next.add(q.id):next.delete(q.id);return next;});}}><summary>Lời giải · {questionLabel(exam,index).full}</summary>{expanded.has(q.id)&&<Suspense fallback={<p>Đang mở lời giải…</p>}><DetailedSolution examId={exam.id} versionHash={exam.versionHash} questionId={q.id} fallback={q.solution} blocks={q.solutionBlocks}/>{renderSolutionExtra?.(q)}</Suspense>}</details>}
    </section>)}
  </section>;
}
