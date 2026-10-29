import React from 'react';
import {displayQuestionPoints} from './flexible-profile';
import {Link} from '../../migration/navigation';
import type {Choice} from './assessment';
import {MAX_SHORT_LENGTH} from './store';
import {shortAnswerStatus,shortFormatMessage,shortInterpretationMessage,shortHelpMessage,shortHasAmbiguousSeparator} from './attempt-ui';
import {questionShortFormat} from './short-format';
import MtmSourceQuestion from './MtmSourceQuestion';
import type {PracticeAttemptProps} from './attempt-types';
import type {PracticeAttemptState} from './usePracticeAttempt';
const letters: Choice[] = ['A', 'B', 'C', 'D'];
const statementLetters = ['a', 'b', 'c', 'd'];
const formatPoints = (millipoints: number) => (millipoints / 1000).toLocaleString('vi-VN', {maximumFractionDigits: 3});

export default function AttemptAnswerSheet({props,state,compact=false}:{props:PracticeAttemptProps;state:PracticeAttemptState;compact?:boolean}) {
  const {exam,catalogUrl,renderText,kind='practice'}=props;
  const {draft,sections,states,activeQuestion,setActiveQuestion,setQuestionFocus,pdfReady,changeAnswer,finish}=state;
  if(!draft)return null;
  return <>{!compact&&<><h2>Phiếu trả lời</h2>
            <nav aria-label="Chuyển đến câu hỏi">{sections.map(part=><section key={part.name}><h3>{part.name}</h3><div className="ep-question-nav">{exam.questions.slice(part.from,part.to).map((q,j)=>{const index=part.from+j;return <button type="button" key={q.id} className={states[index]==='answered'?'is-answered':states[index]==='invalid'?'is-invalid':''} aria-current={activeQuestion===index?'step':undefined} aria-label={`${part.name}, câu ${j+1}: ${q.kind==='self'?'tự làm, không tính điểm':states[index]==='answered'?'đã trả lời đầy đủ':states[index]==='invalid'?'sai định dạng, chưa được tính':'chưa trả lời đầy đủ'}`} onClick={()=>{setActiveQuestion(index);setQuestionFocus(true);}}>{j+1}</button>;})}</div></section>)}</nav>
            <p className="ep-source-ref">Ô tô màu: đã trả lời đầy đủ. Ô viền đỏ: sai định dạng. Viền nổi: câu đang chọn.</p>
            </>}
            {exam.questions.map((q,index)=>{
              if(index!==activeQuestion)return null;
              const answer=draft.answers[q.id],tfAnswers=Array.isArray(answer)?answer:[null,null,null,null];
              const shortFormat=questionShortFormat(exam,q);
              const questionReady=pdfReady&&!state.failedQuestions?.has(q.id);
              const section=sections.find(s=>index>=s.from&&index<s.to)!,part=section.name,number=index-section.from+1;
              return <section className="ep-question ep-card" key={q.id} id={`${compact?'ep-answer':'ep-question'}-${index}`} tabIndex={-1} aria-labelledby={`ep-heading-${index}`}>
                <h3 id={`ep-heading-${index}`}>{part} · Câu {number} <small>({formatPoints(displayQuestionPoints(exam,q.maxMillipoints))} điểm)</small></h3>
                {(!compact||!props.questionReader)&&(q.prompt||q.text)&&<p className="ep-source-text">{renderText?renderText(q.prompt??q.text!):q.prompt??q.text}</p>}{(!compact||!props.questionReader)&&q.sourceContent&&<MtmSourceQuestion question={q}/>}{(!compact||!props.questionReader)&&<p className="ep-source-ref">MTM sưu tầm và biên soạn</p>}
                {q.kind==='self'&&<p role="note">{props.onOpenEssay?'Tự luận trên giấy — GV chấm. Chụp cả bài tự luận, gửi một lần bằng nút Nộp ảnh cả bài tự luận; điểm máy chỉ tạm tính.':'Tự làm trên giấy, xem lời giải sau khi nộp bài. Câu này không tính điểm và không cần nhập đáp án.'}</p>}
                {q.kind==='mc'&&<fieldset disabled={!questionReady} className="ep-mc-grid"><legend>Chọn đáp án câu {number}</legend>{q.choices.map((choice,i)=><label className={`ep-option ${answer===letters[i]?'is-selected':''}`} key={letters[i]}><input type="radio" name={`ep-mc-${index}`} value={letters[i]} checked={answer===letters[i]} onChange={()=>changeAnswer(q.id,letters[i])}/><span>{letters[i]}{choice!==letters[i]?<>{'. '}{renderText?renderText(choice):choice}</>:''}</span>{answer===letters[i]&&<span aria-hidden="true">✓</span>}</label>)}<button type="button" className="ep-clear-answer" onClick={()=>changeAnswer(q.id,null)}>Bỏ chọn</button></fieldset>}
                {q.kind==='tf'&&<div>{statementLetters.map((letter,i)=><fieldset key={letter} disabled={!questionReady}><legend className="ep-source-text">Ý {letter}: {renderText&&q.statements?.[i]?renderText(q.statements[i]):q.statements?.[i]??(q.sourceContent?`Xem ý ${letter} trong đề ở trên`:`${q.sourceRef}, ý ${letter}`)}</legend>{[true,false].map(value=><label className={`ep-tf-option ${tfAnswers[i]===value?'is-selected':''}`} key={String(value)}><input type="radio" name={`ep-tf-${index}-${i}`} checked={tfAnswers[i]===value} onChange={()=>{const next=[...tfAnswers] as (boolean|null)[];next[i]=value;changeAnswer(q.id,next);}}/>{value?'Đúng':'Sai'}</label>)}{tfAnswers[i]===null?<span className="ep-tf-empty">Chưa chọn</span>:<button type="button" className="ep-tf-clear" aria-label={`Xóa lựa chọn ý ${letter}`} onClick={event=>{event.currentTarget.closest('fieldset')?.querySelector<HTMLInputElement>('input[type=radio]')?.focus();const next=[...tfAnswers] as (boolean|null)[];next[i]=null;changeAnswer(q.id,next);}}>Xóa lựa chọn</button>}</fieldset>)}</div>}
                {q.kind==='short'&&<div><label htmlFor={`ep-short-${index}`}>Trả lời câu {number}</label><input id={`ep-short-${index}`} className="ep-short" type="text" inputMode="text" disabled={!questionReady} maxLength={MAX_SHORT_LENGTH} autoComplete="off" spellCheck={false} value={typeof answer==='string'?answer:''} aria-invalid={shortAnswerStatus(q.mode,answer,shortFormat)==='invalid'||undefined} aria-describedby={`ep-format-${index} ep-interpretation-${index} ep-help-${index}`} onChange={event=>changeAnswer(q.id,event.target.value)}/><div className="ep-short-feedback"><p id={`ep-format-${index}`} className="ep-format-error" aria-live="polite">{shortAnswerStatus(q.mode,answer,shortFormat)==='invalid'?shortFormatMessage(q.mode,shortFormat):''}</p><p id={`ep-interpretation-${index}`} className={`ep-short-interpretation${shortHasAmbiguousSeparator(q.mode,answer,shortFormat)?' is-ambiguous':''}`}>{shortInterpretationMessage(q.mode,answer,shortFormat)}</p></div><p id={`ep-help-${index}`}>{shortHelpMessage(q.mode,shortFormat)}</p></div>}
              </section>;
            })}
            {!compact&&<><div className="ep-question-step"><button type="button" disabled={activeQuestion===0} onClick={()=>{setActiveQuestion(i=>i-1);setQuestionFocus(true);}}>Câu trước</button><button type="button" disabled={activeQuestion===exam.questions.length-1} onClick={()=>{setActiveQuestion(i=>i+1);setQuestionFocus(true);}}>Câu tiếp</button></div>
            <div className="ep-submit-row"><Link className="ep-link" href={catalogUrl}>{kind==='exam'?'Rời bài thi':'Rời bài luyện'}</Link><button type="button" className="ep-primary" disabled={!pdfReady} onClick={()=>finish(false)}>Nộp bài</button></div></>}</>;
}
