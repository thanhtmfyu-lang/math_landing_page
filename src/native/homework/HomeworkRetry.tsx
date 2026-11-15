import {lazy,Suspense,useEffect,useId,useRef,useState} from 'react';
import {openDialogCompat,closeDialogCompat} from '../exams/dialog-compat';
import '../exams/dialog-compat.css';
import type {HomeworkState} from './btvn-contract';
import type {PracticeExam,PracticeQuestion} from '../exams/data';
import type {Response} from '../exams/store';
import {normalizedShort} from '../exams/assessment';
import {MTM_SCORING_VERSION,normalizeMtmShort} from '../exams/mtm-scoring';
import {displayAnswer,reviewRows,statementLetters} from '../exams/review';
import {questionLabel,shortInterpretationMessage} from '../exams/attempt-ui';
import {hasReadableTfStatements} from '../exams/question-statements';
import {acknowledgedHomeworkReceipt} from './result-summary';
import MathText from '../math/MathText';
import MtmSourceContent from '../exams/MtmSourceContent';
import './homework-retry.css';

const DetailedSolution=lazy(()=>import('../exams/DetailedSolution'));
type RetryQuestion={question:PracticeQuestion;index:number};

/** Only the acknowledged submitted snapshot can supply this optional local exercise. */
export function homeworkRetryQuestions(state:HomeworkState):RetryQuestion[]{
  const {exam,draft}=state;
  if(!exam||!draft||state.solutionsAvailable===false||!acknowledgedHomeworkReceipt(state)||!draft.answers||typeof draft.answers!=='object'||Array.isArray(draft.answers))return [];
  return reviewRows(exam,draft).filter(({q,status})=>
    (status==='wrong'||status==='partial'||status==='unanswered')&&
    !!(q.prompt?.trim()||q.text?.trim()||q.sourceContent?.questions?.length)&&
    // Phần ôn không mở PDF đề: ảnh nguồn không thay thế văn bản của bốn mệnh đề Đ/S.
    (q.kind!=='tf'||hasReadableTfStatements(q))&&
    !!(q.solution?.trim()||q.sourceContent?.solutions?.length)
  ).map(({q,index})=>({question:q,index}));
}

/** Chỉ trích bước khi không phải bỏ mất phần mở đầu hoặc điều kiện của nguồn. */
export function sourceRetryStepInfo(solution:string|undefined):{steps:string[];reason:'available'|'none'|'preamble'}{
  const steps:string[]=[];
  let preamble=false;
  for(const line of (solution??'').split(/\r?\n/)){
    if(/^\s*(?:Đáp án\s*:\s*[ABCD]\.?|Lời giải\s*:?)\s*$/iu.test(line))continue;
    const marker=/^\s*Bước\s+(\d+)\s*[:.)-]/iu.exec(line);
    if(marker){
      if(Number(marker[1])!==steps.length+1)return {steps:[],reason:'none'};
      steps.push(line.trim());
    }
    else if(line.trim()){
      if(steps.length)steps[steps.length-1]+='\n'+line.trim();
      else preamble=true;
    }
  }
  if(preamble&&steps.length)return {steps:[],reason:'preamble'};
  return steps.length>=2?{steps,reason:'available'}:{steps:[],reason:'none'};
}
export function sourceRetrySteps(solution:string|undefined):string[]{
  return sourceRetryStepInfo(solution).steps;
}

export type RetryVerdict='correct'|'wrong'|'incomplete'|'invalid';
type RetryDraft={answer:Response;verdict:RetryVerdict|null;hints:number;solution:boolean;solutionViewed:boolean;hintsViewed:boolean;needsRecheck:boolean};
const emptyRetryDraft=(q:PracticeQuestion):RetryDraft=>({answer:q.kind==='tf'?[null,null,null,null]:null,verdict:null,hints:0,solution:false,solutionViewed:false,hintsViewed:false,needsRecheck:false});
const hasRetryAnswer=(answer:Response)=>Array.isArray(answer)?answer.some(value=>typeof value==='boolean'):typeof answer==='string'&&!!answer.trim();
/** Answer comparison only; no score, submission, storage or attempt is created. */
export function checkRetryAnswer(q:PracticeQuestion,answer:Response,rubricVersion?:string):RetryVerdict{
  if(q.kind==='self')return 'invalid';
  if(q.kind==='tf'){
    if(!Array.isArray(q.answer)||q.answer.length!==4||Array.from(q.answer).some(v=>typeof v!=='boolean'))return 'invalid';
    if(!Array.isArray(answer)||answer.length!==4||Array.from(answer).some(v=>typeof v!=='boolean'))return 'incomplete';
    return q.answer.every((value,i)=>value===answer[i])?'correct':'wrong';
  }
  if(typeof answer!=='string'||!answer.trim())return 'incomplete';
  if(q.kind==='mc')return !['A','B','C','D'].includes(answer)?'invalid':answer===q.answer?'correct':'wrong';
  if(rubricVersion===MTM_SCORING_VERSION){
    if(!q.shortRule||q.shortRule.verified!==true)return 'invalid';
    const value=normalizeMtmShort(answer,q.shortRule);
    if(value===null)return 'invalid';
    return q.acceptedAnswers.some(expected=>normalizeMtmShort(expected,q.shortRule!)===value)?'correct':'wrong';
  }
  const value=normalizedShort(q.mode,answer);
  if(value===null)return 'invalid';
  return q.acceptedAnswers.some(expected=>normalizedShort(q.mode,expected)===value)?'correct':'wrong';
}

/** Tính các ý lệch để chỉ trình bày sau khi mở lời giải hoặc hết lượt tính điểm. */
export function retryMismatchStatements(q:PracticeQuestion,answer:Response):string[]{
  if(q.kind!=='tf'||!Array.isArray(answer)||checkRetryAnswer(q,answer)!=='wrong')return [];
  return q.answer.flatMap((value,i)=>value===answer[i]?[]:[statementLetters[i]]);
}

const feedback:Record<RetryVerdict,string>={
  correct:'Em đã làm đúng câu này. Hãy đối chiếu lời giải để hiểu rõ cách làm.',
  wrong:'Chưa khớp đáp án. Em có thể thử lại hoặc mở lời giải để đối chiếu.',
  incomplete:'Em trả lời đủ câu rồi chọn Kiểm tra lại nhé.',
  invalid:'Câu trả lời chưa đúng định dạng. Em xem hướng dẫn ngay dưới ô trả lời.',
};
const letters=['A','B','C','D'] as const;
function RetryExercise({exam,item,submittedAnswer,onCorrect,onNext,hasNext,complete,corrected,focusTitle,focusSeq=0,canAttemptAgain,savedDraft,onDraftChange}:{exam:PracticeExam;item:RetryQuestion;submittedAnswer:Response|undefined;onCorrect:(id:string)=>void;onNext:()=>void;hasNext:boolean;complete:boolean;corrected:boolean;focusTitle:boolean;focusSeq?:number;canAttemptAgain:boolean;savedDraft?:RetryDraft;onDraftChange?:(draft:RetryDraft)=>void}){
  const {question:q,index}=item,instance=useId();
  const focused=useRef<{sequence:number|undefined;restoreFeedback:boolean;checkFeedback:boolean}>({sequence:undefined,restoreFeedback:!!(savedDraft?.verdict||savedDraft?.needsRecheck),checkFeedback:false});
  const [retry,setRetry]=useState<RetryDraft>(()=>{
    const draft=savedDraft??emptyRetryDraft(q);
    return {...draft,solution:canAttemptAgain?false:draft.solution,solutionViewed:draft.solutionViewed||draft.solution,hintsViewed:!!(draft.hintsViewed||draft.hints)};
  });
  const [confirmSource,setConfirmSource]=useState<'hint'|'solution'|null>(null);
  const solutionButton=useRef<HTMLButtonElement|null>(null),hintButton=useRef<HTMLButtonElement|null>(null);
  const sourceDialog=useRef<HTMLDialogElement|null>(null),cancelSourceButton=useRef<HTMLButtonElement|null>(null),focusHints=useRef(false);
  const {answer,verdict,hints,solution,solutionViewed,hintsViewed,needsRecheck}=retry;
  const revise=(patch:Partial<RetryDraft>)=>{const next={...retry,...patch};setRetry(next);onDraftChange?.(next);};
  const {steps,reason}=sourceRetryStepInfo(q.solution),label=questionLabel(exam,index).full;
  const feedbackId=instance+'-feedback';
  const shortRule=q.kind==='short'&&exam.rubricVersion===MTM_SCORING_VERSION?q.shortRule:undefined;
  const mtmFormat=shortRule?[shortRule.mode==='exact'?'Nhập chính xác theo đề, có phân biệt chữ hoa và chữ thường.':shortRule.mode==='rational'?'Nhập số nguyên, số thập phân hoặc phân số.':shortRule.decimalPlaces===0?'Nhập số nguyên, không có chữ số thập phân.':shortRule.decimalPlaces!==undefined?'Nhập đúng '+shortRule.decimalPlaces+' chữ số sau dấu thập phân.':'Nhập số nguyên hoặc số thập phân bằng dấu phẩy hoặc dấu chấm. Dấu chấm và dấu phẩy là dấu thập phân, không tách hàng nghìn.',shortRule.unit===undefined?(shortRule.mode==='exact'?'':'Không nhập đơn vị.'):'Ghi đơn vị '+shortRule.unit+' ở cuối.',shortRule.whitespace==='collapse'?'Các khoảng trắng liên tiếp được hiểu là một khoảng trắng.':''].filter(Boolean).join(' '):null;
  const interpreted=shortRule?normalizeMtmShort(answer,shortRule):null;
  const rawShort=typeof answer==='string'?answer.trim():'';
  const unitStart=shortRule?.unit===undefined?-1:rawShort.length-shortRule.unit.length;
  const hasExpectedUnit=shortRule?.unit!==undefined&&rawShort.endsWith(shortRule.unit)&&(unitStart===0||unitStart>0&&/\s/u.test(rawShort[unitStart-1]));
  const numericShort=hasExpectedUnit?rawShort.slice(0,unitStart).trim():rawShort;
  const interpretedDisplay=shortRule?.mode==='decimal'?numericShort.replace('.',','):interpreted;
  const interpretation=shortRule?(interpreted===null?rawShort&&shortRule.unit!==undefined&&!hasExpectedUnit?'Đơn vị chưa đúng. Ghi đơn vị '+shortRule.unit+' ở cuối, cách số bằng một khoảng trắng.':'':'Máy đang hiểu là '+interpretedDisplay+(shortRule.unit?' '+shortRule.unit:'')+'.'):q.kind==='short'?shortInterpretationMessage(q.mode,answer):'';
  const ambiguousShort=shortRule?.decimalPlaces===undefined&&shortRule?.mode!=='exact'&&/^[+-]?\d+[.,]\d{3}$/.test(numericShort);
  // Với hai lựa chọn Đúng/Sai, chỉ đích danh ý lệch cũng suy ra đáp án của ý đó.
  const canShowMismatches=!canAttemptAgain||solution;
  const mismatches=verdict==='wrong'&&canShowMismatches?retryMismatchStatements(q,answer):[];
  const showComplete=complete&&!needsRecheck&&(!verdict||verdict==='correct');
  const hasFeedback=!!verdict||needsRecheck||showComplete;
  const change=(next:Response)=>{focused.current.checkFeedback=false;revise({answer:next,verdict:null,needsRecheck:true});};
  const restoreSourceFocus=()=>{(confirmSource==='hint'?hintButton:solutionButton).current?.focus();};
  const cancelSource=()=>{closeDialogCompat(sourceDialog.current);setConfirmSource(null);restoreSourceFocus();};
  useEffect(()=>{const node=sourceDialog.current;if(!confirmSource||!node)return;return openDialogCompat(node,{onCancel:cancelSource,initialFocus:cancelSourceButton.current});},[confirmSource]);
  const revealHint=()=>{
    const nextHints=Math.min(steps.length,hints+1),last=nextHints===steps.length;
    // Focus sau commit để không ở lại trên nút vừa bị disabled khi mở bước cuối.
    if(last)focusHints.current=true;
    revise({hints:nextHints,hintsViewed:true});
    return last;
  };
  return <div className="btvn-retry-exercise">
    <h3 tabIndex={-1} ref={node=>{if(node&&focusTitle&&!focused.current.restoreFeedback&&focused.current.sequence!==focusSeq){focused.current.sequence=focusSeq;node.focus();}}}>{label}</h3>
    {(q.prompt||q.text)&&<p className="btvn-retry-text"><MathText text={q.prompt??q.text!}/></p>}
    {!!q.sourceContent?.questions?.length&&<MtmSourceContent segments={q.sourceContent.questions} assetBase="/practice-media/source-crops" label={q.sourceRef} kind="question" context="review"/>}
    <p className="btvn-footnote">Nguồn: {q.sourceRef} · MTM sưu tầm và biên soạn</p>
    <details className="btvn-retry-submitted"><summary>{'Xem câu trả lời đã nộp của '+label}</summary><p className="btvn-retry-text">Câu trả lời đã nộp: {displayAnswer(submittedAnswer)}</p><p>Em thử lại ở phần bên dưới. Câu trả lời đã nộp được giữ nguyên.</p></details>
    <form onSubmit={event=>{event.preventDefault();const next=checkRetryAnswer(q,answer,exam.rubricVersion);focused.current.checkFeedback=true;revise({verdict:next,needsRecheck:false});if(next==='correct')onCorrect(q.id);}}>
      {q.kind==='mc'&&<fieldset><legend>Em chọn lại đáp án</legend><div className="btvn-retry-choices">{q.choices.map((choice,i)=><label key={letters[i]}><input type="radio" name={instance+'-mc'} value={letters[i]} checked={answer===letters[i]} onChange={()=>change(letters[i])}/><span>{letters[i]}. <MathText text={choice}/></span></label>)}</div></fieldset>}
      {q.kind==='tf'&&<div className="btvn-retry-tf">{[0,1,2,3].map(i=>{
        const mismatch=mismatches.includes(statementLetters[i]);
        return <fieldset key={i} className={mismatch?'is-mismatch':undefined} aria-invalid={mismatch||undefined} aria-describedby={instance+'-statement-'+i+(mismatch?' '+feedbackId:'')}><legend>Ý {statementLetters[i]}</legend><div className="btvn-retry-tf-row"><p id={instance+'-statement-'+i} className="btvn-retry-text btvn-retry-statement"><MathText text={q.statements?.[i]??''}/></p><div className="btvn-retry-choices">{[true,false].map(value=><label key={String(value)}><input type="radio" name={instance+'-tf-'+i} checked={Array.isArray(answer)&&answer[i]===value} onChange={()=>{const next=Array.isArray(answer)?[...answer]:[null,null,null,null];next[i]=value;change(next);}}/><span>{value?'Đúng':'Sai'}</span></label>)}</div></div></fieldset>;
      })}</div>}
      {q.kind==='short'&&<div><label htmlFor={instance+'-answer'}>Em thử lại câu trả lời</label><input id={instance+'-answer'} className="btvn-retry-short" type="text" maxLength={500} autoComplete="off" spellCheck={false} value={typeof answer==='string'?answer:''} aria-invalid={verdict==='invalid'||undefined} aria-describedby={`${instance}-format ${instance}-interpretation`+(hasFeedback?' '+feedbackId:'')} onChange={event=>change(event.target.value)}/><p className="btvn-footnote" id={instance+'-format'}>{mtmFormat??(q.mode==='numeric'?'Nhập số nguyên hoặc thập phân bằng dấu phẩy hoặc dấu chấm, không nhập đơn vị hay biểu thức.':q.mode==='rational'?'Nhập số nguyên, số thập phân hoặc phân số, ví dụ -3/4; không nhập đơn vị hay biểu thức.':'Nhập chính xác theo yêu cầu đề, có phân biệt chữ hoa và chữ thường.')}</p><p className={'btvn-footnote ep-short-interpretation'+(ambiguousShort?' is-ambiguous':'')} id={instance+'-interpretation'} aria-live="polite" aria-atomic="true">{interpretation}</p></div>}
      <div className="btvn-overview-actions"><button type="submit" className="btvn-btn primary">Kiểm tra lại</button><button type="button" className="btvn-btn" aria-label="Thử lại từ đầu câu này" onClick={()=>{setConfirmSource(null);focused.current.checkFeedback=false;revise({...emptyRetryDraft(q),solutionViewed,hintsViewed});}}>Thử lại từ đầu</button></div>
    </form>
    {/* Phản hồi được đọc khi nhận focus, không phát thêm cùng nội dung qua vùng live. */}
    <div id={feedbackId} role="group" aria-label="Phản hồi câu ôn" aria-live="off" aria-describedby={hasFeedback?feedbackId+'-message':undefined} tabIndex={-1} ref={node=>{if(node&&hasFeedback&&(focused.current.restoreFeedback||focused.current.checkFeedback)){focused.current.restoreFeedback=false;focused.current.checkFeedback=false;focused.current.sequence=focusSeq;node.focus();}}} className={hasFeedback?'btvn-retry-feedback '+(verdict&&verdict!=='correct'?'btvn-retry-error':verdict==='correct'||showComplete?'btvn-retry-success':'btvn-retry-notice'):undefined}><div id={feedbackId+'-message'}>{verdict&&<p>{q.kind==='tf'&&verdict==='wrong'&&!canShowMismatches?'Có ý chưa khớp. Em đọc lại từng mệnh đề hoặc mở lời giải.':feedback[verdict]}</p>}{!verdict&&needsRecheck&&<p>Em đã đổi lựa chọn. Bấm Kiểm tra lại để chấm lại câu này.</p>}{mismatches.length>0&&<p>Các ý chưa khớp: {mismatches.map(letter=>'Ý '+letter).join(', ')}. Em đọc lại từng mệnh đề rồi thử lại.</p>}{showComplete&&<p>Em đã làm đúng các câu trong phiên ôn này. Em có thể nghỉ hoặc xem lại cách làm.</p>}</div></div>
    <div className="btvn-retry-next-bar"><button type="button" className={'btvn-btn'+(corrected&&hasNext?' btvn-retry-start':'')} disabled={!hasNext} aria-describedby={!hasNext&&!complete?instance+'-remaining':undefined} onClick={onNext}>Ôn câu chưa xong tiếp theo</button>{!hasNext&&!complete&&<p id={instance+'-remaining'} className="btvn-footnote">Em đang ở câu còn lại chưa đúng hoặc còn bỏ trống.</p>}</div>
    {q.correctionNote&&<p><strong>Đính chính MTM:</strong> <MathText text={q.correctionNote}/></p>}
    <div className="btvn-retry-support">
      {steps.length>0&&<button type="button" ref={hintButton} className="btvn-btn" disabled={hints>=steps.length} aria-controls={instance+'-hints'} aria-describedby={confirmSource==='hint'?instance+'-solution-warning':undefined} onClick={()=>{if(!hintsViewed&&canAttemptAgain){setConfirmSource('hint');return;}setConfirmSource(null);revealHint();}}>{hints>=steps.length?'Đã mở hết các bước nguồn':'Xem gợi ý bước '+(hints+1)}</button>}
      <button type="button" ref={solutionButton} className="btvn-btn" aria-expanded={solution} aria-controls={instance+'-solution'} aria-describedby={confirmSource==='solution'?instance+'-solution-warning':undefined} onClick={()=>{if(!solution&&!solutionViewed&&canAttemptAgain){setConfirmSource('solution');return;}setConfirmSource(null);revise({solution:!solution,solutionViewed:true});}}>{solution?'Đóng lời giải câu ôn':solutionViewed?'Mở lại lời giải đã xem':'Xem lời giải đầy đủ của câu ôn'}</button>
    </div>
    {confirmSource&&<dialog className="btvn-retry-feedback btvn-retry-notice btvn-retry-confirm" role="dialog" aria-modal="true" aria-labelledby={instance+'-source-title'} aria-describedby={instance+'-solution-warning'} ref={sourceDialog} onCancel={event=>{event.preventDefault();cancelSource();}}><h4 id={instance+'-source-title'}>{confirmSource==='hint'?'Mở gợi ý từ lời giải?':'Mở lời giải đầy đủ?'}</h4><p id={instance+'-solution-warning'}>Em còn lượt tính điểm. {confirmSource==='hint'?'Gợi ý trích từ lời giải có thể cho biết đáp án. ':''}Lượt làm sau khi đã xem lời giải vẫn tính điểm.</p><div className="btvn-overview-actions"><button type="button" className="btvn-btn" onClick={()=>{closeDialogCompat(sourceDialog.current);setConfirmSource(null);if(confirmSource==='hint'){if(!revealHint())restoreSourceFocus();}else{revise({solution:true,solutionViewed:true});restoreSourceFocus();}}}>{confirmSource==='hint'?'Vẫn mở gợi ý':'Vẫn mở lời giải'}</button><button type="button" ref={cancelSourceButton} className="btvn-btn" onClick={cancelSource}>Tiếp tục tự làm</button></div></dialog>}
    {steps.length>0?<><div id={instance+'-hints'} className="btvn-retry-hints" aria-live="polite" aria-label="Các bước gợi ý đã mở" tabIndex={-1} ref={node=>{if(node&&focusHints.current){focusHints.current=false;node.focus();}}}>{steps.slice(0,hints).map((step,i)=><p className="btvn-retry-text" key={i}><MathText text={step}/></p>)}</div>{hints>0&&<p className="btvn-footnote">Các bước được trích nguyên văn từ lời giải của câu này. Em xem bản đầy đủ để đối chiếu.</p>}</>:<p className="btvn-footnote">{reason==='preamble'?'Em mở lời giải đầy đủ để xem trọn phần mở đầu, điều kiện và cách làm.':'Em mở lời giải đầy đủ để xem cách làm của câu này.'}</p>}
    {solution&&<div id={instance+'-solution'}>{q.sourceContent?.solutions?.length?<MtmSourceContent segments={q.sourceContent.solutions} assetBase="/practice-media/source-crops" label={q.sourceRef} kind="solution" context="review" errorFallback={q.solution?.trim()?<p className="btvn-retry-text"><MathText text={q.solution}/></p>:undefined}/>:<Suspense fallback={<p>Đang mở lời giải…</p>}><DetailedSolution examId={exam.id} versionHash={exam.versionHash} questionId={q.id} fallback={q.solution!}/></Suspense>}</div>}
  </div>;
}

export default function HomeworkRetry({state}:{state:HomeworkState}){
  const key=state.draft?.attemptId+':'+state.exam?.versionHash;
  type Session={key:string;selected:string;open:boolean;correct:string[];focusQuestion?:string;focusSeq?:number;drafts?:Record<string,RetryDraft>};
  const initial=():Session=>({key,selected:'',open:false,correct:[],drafts:{}});
  const [session,setSession]=useState<Session>(initial),instance=useId();
  const questions=homeworkRetryQuestions(state);
  // Nháp chỉ sống trong RAM của đúng phiên ôn được phép; thu hồi quyền thì bỏ bản cũ.
  const current=session.key===key&&questions.length?session:initial();
  if(session.key!==key||(!questions.length&&(session.open||session.correct.length||Object.keys(session.drafts??{}).length)))setSession(current);
  const update=(change:(value:Session)=>Session)=>setSession(value=>change(value.key===key?value:initial()));
  if(!questions.length||!state.exam)return null;
  const item=questions.find(item=>item.question.id===current.selected)??questions[0];
  const correctedCount=questions.filter(({question})=>current.correct.includes(question.id)).length;
  const selectedIndex=questions.indexOf(item);
  const next=Array.from({length:questions.length-1},(_,i)=>questions[(selectedIndex+i+1)%questions.length]).find(({question})=>!current.correct.includes(question.id));
  return <section className="btvn-sheet btvn-retry" aria-labelledby={instance+'-title'}>
    <h2 id={instance+'-title'}>Ôn một câu, hiểu thêm một chút</h2>
    <p>Em muốn ôn một câu sai hoặc bỏ trống trong lượt vừa nộp? Phần ôn này không tính điểm và không dùng thêm lượt BTVN.</p>
    {current.open&&<p className="btvn-footnote">Câu trả lời thử được giữ khi em đổi câu hoặc đóng phần ôn. Tải lại trang, đổi lượt, gặp bản đề khác, mất biên nhận của lượt hoặc mất quyền xem lời giải sẽ xóa phần thử này.</p>}
    <button type="button" className={'btvn-btn'+(current.open?'':' btvn-retry-start')} aria-expanded={current.open} aria-controls={instance+'-practice'} onClick={()=>update(value=>({...value,open:!value.open}))}>{current.open?'Đóng phần ôn':'Ôn một câu của lượt này'}</button>
    {current.open&&<div id={instance+'-practice'}><p className="btvn-retry-status"><span>Đã làm đúng {correctedCount}/{questions.length} câu trong phiên ôn.</span> <span aria-live="polite" aria-atomic="true">Đang ôn {questionLabel(state.exam,item.index).full}.</span></p><div className="btvn-retry-nav" role="group" aria-label="Chọn câu để ôn">{questions.map(({question,index})=>{
      const corrected=current.correct.includes(question.id),label=questionLabel(state.exam!,index);
      const hasDraft=!corrected&&hasRetryAnswer(current.drafts?.[question.id]?.answer??null);
      const part=label.part.split(' · ')[0].replace(/^Phần\s+/iu,''),compact=(part?part+' · ':'')+'Câu '+label.number;
      return <button type="button" key={question.id} className={'btvn-retry-pill'+(corrected?' is-correct':'')+(hasDraft?' has-draft':'')} aria-pressed={item.question.id===question.id} aria-label={label.full+(corrected?' · Đã làm đúng trong phiên ôn':hasDraft?' · Có nháp đang làm dở':'')} onClick={()=>update(value=>({...value,selected:question.id,focusQuestion:question.id,focusSeq:(value.focusSeq??0)+1}))}>{corrected&&<span aria-hidden="true">✓ </span>}<span className="btvn-retry-pill-full" aria-hidden="true">{label.full}</span><span className="btvn-retry-pill-compact" aria-hidden="true">{compact}</span>{corrected&&<span className="btvn-retry-complete" aria-hidden="true"> · Đã làm đúng</span>}</button>;
    })}</div><RetryExercise key={key+':'+item.question.id} exam={state.exam} item={item} submittedAnswer={state.draft?.answers[item.question.id]} savedDraft={current.drafts?.[item.question.id]} onDraftChange={draft=>update(value=>({...value,correct:draft.verdict==='correct'?value.correct:value.correct.filter(id=>id!==item.question.id),drafts:{...value.drafts,[item.question.id]:draft}}))} onCorrect={id=>update(value=>value.correct.includes(id)?value:{...value,correct:[...value.correct,id]})} onNext={()=>{if(next)update(value=>({...value,selected:next.question.id,focusQuestion:next.question.id,focusSeq:(value.focusSeq??0)+1}));}} hasNext={!!next} complete={correctedCount===questions.length} corrected={current.correct.includes(item.question.id)} focusTitle={current.focusQuestion===item.question.id} focusSeq={current.focusSeq??0} canAttemptAgain={state.attemptsUsed<state.maxAttempts}/></div>}
  </section>;
}
