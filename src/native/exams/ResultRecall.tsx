import {lazy,Suspense,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import type {PracticeExam,PracticeQuestion} from './data';
import type {Draft} from './store';
import {resultRecallItems,recallPdfPage,type RecallItem} from './result-recall';
import {questionLabel,displayKeyAnswer} from './attempt-ui';
import {statementLetters} from './review';
import {erratumFor} from './practice-errata';
import MathText from '../math/MathText';
import MtmSourceQuestion from './MtmSourceQuestion';
import MtmSourceContent from './MtmSourceContent';
import './result-recall.css';

type RecallProps={exam:PracticeExam;draft:Draft;renderText?:(text:string)=>ReactNode;renderSolutionExtra?:(q:PracticeQuestion)=>ReactNode;focusOnMount?:boolean};
type Session={items:RecallItem[];index:number;revealed:boolean;remembered:string[];again:string[]};
type CardKind='all'|'mc'|'tf'|'short';

export default function ResultRecall(props:RecallProps){
  const items=resultRecallItems(props.exam,props.draft);
  if(!items.length)return <section className="ep-card ep-recall"><h2>Thẻ tự ôn 5 phút</h2><p>Chưa có câu phù hợp để tạo thẻ ôn từ lượt này. Thẻ cần câu chưa đủ điểm, đủ nội dung đề và lời giải cùng phiên bản. Em vẫn có thể đối chiếu bài ở bên dưới.</p></section>;
  return <RecallSession key={props.draft.attemptId+':'+props.exam.versionHash+':'+props.exam.answerKeyVersion} {...props} items={items}/>;
}

/** Phiên tự đánh giá chỉ ở RAM. Mỗi thao tác kiểm đúng thẻ để không nhận lại nhấp cũ. */
export function RecallSession({exam,items,renderText,renderSolutionExtra,focusOnMount=false}:RecallProps&{items:RecallItem[]}){
  // Mỗi lần khôi phục tiện ích có lazy mới, kể cả khi chunk PDF/lời giải từng lỗi.
  const [{DetailedSolution,QuestionPdf}]=useState(()=>({DetailedSolution:lazy(()=>import('./DetailedSolution')),QuestionPdf:lazy(()=>import('./QuestionPdf'))}));
  const [limit,setLimit]=useState(3),[session,setSession]=useState<Session|null>(null),[focus,setFocus]=useState(focusOnMount?1:0),[pdfReady,setPdfReady]=useState<Session|null>(null);
  const [kind,setKind]=useState<CardKind>('all'),[onlyBlank,setOnlyBlank]=useState(false);
  const selected=items.filter(value=>(kind==='all'||value.q.kind===kind)&&(!onlyBlank||value.status==='unanswered'));
  const settings=kind+':'+onlyBlank+':'+limit,activeSettings=useRef(settings);activeSettings.current=settings;
  const activeSession=useRef(session);activeSession.current=session;
  const instance=useId(),heading=useRef<HTMLHeadingElement>(null),card=useRef<HTMLHeadingElement>(null),solution=useRef<HTMLDivElement>(null),summary=useRef<HTMLDivElement>(null);
  const item=session?.items[session.index],finished=!!session&&!item;
  const needsPdf=!!item&&!!exam.sourcePdf&&!item.q.sourceContent;
  const erratum=erratumFor(exam.id);
  useEffect(()=>{if(!focus)return;(finished?summary.current:!session?heading.current:session.revealed?solution.current:card.current)?.focus();},[focus,finished,session]);
  const rich=(value:string)=>renderText?renderText(value):<MathText text={value}/>;
  const start=(selected:RecallItem[])=>{if(activeSession.current!==session||!selected.length)return;const current=session;setSession(value=>value===current?{items:selected.slice(0,5),index:0,revealed:false,remembered:[],again:[]}:value);setFocus(n=>n+1);};
  const reveal=()=>{if(activeSession.current!==session||!session||!item||needsPdf&&pdfReady!==session)return;const current=session;setSession(value=>value===current?{...value,revealed:true}:value);setFocus(n=>n+1);};
  const mark=(remembered:boolean)=>{if(activeSession.current!==session||!session||!item||!session.revealed)return;const current=session;setSession(value=>value!==current?value:{...value,index:value.index+1,revealed:false,remembered:remembered?[...value.remembered,item.q.id]:value.remembered,again:remembered?value.again:[...value.again,item.q.id]});setFocus(n=>n+1);};
  const stop=()=>{if(activeSession.current!==session)return;const current=session;setSession(value=>value===current?null:value);setFocus(n=>n+1);};
  return <section className="ep-card ep-recall" data-version="v2" aria-labelledby={instance+'-title'}>
    <p className="ep-recall-eyebrow">NHỚ LẠI RỒI ĐỐI CHIẾU</p><h2 id={instance+'-title'} ref={heading} tabIndex={-1}>Thẻ tự ôn 5 phút</h2>
    <p>Dành khoảng 5 phút cho vài câu chưa đủ điểm trong lượt thi thử này. Tự giải ra giấy trước khi mở đáp án, rồi chọn mức em hiểu. Không bấm giờ, không chấm lại hoặc đổi điểm.</p>
    <p className="ep-recall-note">Lựa chọn tự đánh giá chỉ giữ khi còn ở trang này. Đóng phiên ôn, rời trang hoặc tải lại sẽ bỏ các dấu đã chọn; bài thi và lịch sử vẫn được giữ nguyên.</p>
    {erratum&&<p className="ep-notice"><strong>{exam.id===erratum.id?'Điều kiện bản MTM đính chính: ':'Lưu ý lượt trước đính chính: '}</strong>{erratum.condition} PDF gốc giữ nguyên; lời giải dùng đúng phiên bản của lượt đã nộp.</p>}
    {!session?<><p>Có {items.length} câu đủ nội dung để ôn. Mỗi phiên tối đa 5 thẻ, theo thứ tự trong đề.</p><label className="ep-recall-limit">Số thẻ trong phiên<select value={limit} onChange={e=>setLimit(Number(e.target.value)===5?5:3)}><option value={3}>Tối đa 3 thẻ</option><option value={5}>Tối đa 5 thẻ</option></select></label>
      <div className="ep-recall-filters"><label className="ep-recall-limit">Dạng câu muốn ôn<select value={kind} onChange={e=>{const value=e.target.value;setKind(value==='mc'||value==='tf'||value==='short'?value:'all');}}><option value="all">Tất cả dạng câu</option><option value="mc">Trắc nghiệm nhiều lựa chọn</option><option value="tf">Đúng/Sai</option><option value="short">Trả lời ngắn</option></select></label><label className="ep-recall-blank"><input type="checkbox" checked={onlyBlank} onChange={e=>setOnlyBlank(e.target.checked)}/>Chỉ ôn câu bỏ trống toàn bộ</label></div>
      <p role="status">{selected.length} câu khớp lựa chọn.{onlyBlank?' Câu Đúng/Sai chỉ được tính bỏ trống khi cả bốn ý chưa trả lời.':''}</p>{!selected.length&&<p>Không có câu phù hợp với bộ lọc này. Em chọn dạng khác hoặc bỏ lọc câu trống để tiếp tục.</p>}
      <button type="button" className="ep-recall-primary" disabled={!selected.length} onClick={()=>{if(activeSettings.current===settings)start(selected.slice(0,limit));}}>Bắt đầu ôn {Math.min(limit,selected.length)} thẻ</button></>:finished?<div ref={summary} tabIndex={-1} className="ep-recall-summary" aria-label="Tổng kết tự ôn" aria-describedby={instance+'-counts'}>
      <h3>Em đã đối chiếu {session.items.length} thẻ</h3><p id={instance+'-counts'}>Tự đánh dấu đã hiểu: {session.remembered.length}. Cần ôn lại: {session.again.length}. Đây là tự đánh giá, không phải điểm hoặc chứng nhận đã nắm vững.</p>
      {session.again.length>0&&<><ul>{session.items.filter(value=>session.again.includes(value.q.id)).map(value=><li key={value.q.id}>{questionLabel(exam,value.index).full}</li>)}</ul><button type="button" className="ep-recall-primary" onClick={()=>start(session.items.filter(value=>session.again.includes(value.q.id)))}>Ôn lại {session.again.length} thẻ đã chọn</button></>}
      <button type="button" onClick={stop}>Kết thúc phiên ôn</button>
    </div>:item&&<div className="ep-recall-card">
      <p aria-live="polite">Thẻ {session.index+1}/{session.items.length}</p><h3 ref={card} tabIndex={-1}>{questionLabel(exam,item.index).full}</h3>
      {(item.q.prompt||item.q.text)&&<div className="ep-recall-prompt">{rich(item.q.prompt??item.q.text!)}</div>}
      {needsPdf&&exam.sourcePdf?<><Suspense fallback={<p role="status">Đang mở bản câu hỏi PDF…</p>}><QuestionPdf key={item.q.id} file={exam.sourcePdf} title={exam.title} targetPage={recallPdfPage(exam,item.q)} allowFullscreen={false} onReady={ready=>setPdfReady(value=>activeSession.current===session?(ready?session:null):value)}/></Suspense>{!recallPdfPage(exam,item.q)&&<p>Chưa có vị trí trang cho câu này. Em chọn trang trong bản đề theo nguồn ghi bên dưới.</p>}{item.q.kind==='tf'&&!item.q.statements&&<p>Em đọc đủ bốn mệnh đề Đúng/Sai trong PDF trước khi tự giải.</p>}</>:item.q.sourceContent?<MtmSourceQuestion question={item.q}/>:item.q.kind==='mc'&&<ol type="A">{item.q.choices.map((choice,i)=><li key={i}>{rich(choice)}</li>)}</ol>}
      {item.q.kind==='tf'&&item.q.statements&&<ol type="a">{item.q.statements.map((statement,i)=><li key={i}>{rich(statement)}</li>)}</ol>}
      <p className="ep-recall-source">MTM sưu tầm và biên soạn · {item.q.sourceRef}</p>
      {!session.revealed?<><p>Em thử giải và kiểm tra điều kiện, dấu, đơn vị nếu có. Khi sẵn sàng, mở lời giải để tự đối chiếu.</p>{needsPdf&&pdfReady!==session&&<p role="status">Chờ bản đề PDF tải và kiểm tra xong trước khi mở đáp án. Nếu chưa tải được, em có thể dừng phiên ôn.</p>}<button type="button" className="ep-recall-primary" disabled={needsPdf&&pdfReady!==session} onClick={reveal}>Em đã thử, xem đáp án và lời giải</button></>:<div className="ep-recall-solution" ref={solution} tabIndex={-1} aria-label="Đáp án và lời giải thẻ ôn" aria-describedby={instance+'-answer'}>
        <h4 id={instance+'-answer'}>Đáp án: {item.q.kind==='mc'?item.q.answer:item.q.kind==='tf'?item.q.answer.map((value,i)=>`${statementLetters[i]}) ${value?'Đúng':'Sai'}`).join('; '):item.q.kind==='short'?item.q.acceptedAnswers.map(value=>displayKeyAnswer(item.q.kind==='short'?item.q.mode:'exact',value)).join(' hoặc '):''}</h4>
        {item.q.correctionNote&&<p><strong>Đính chính MTM:</strong> {rich(item.q.correctionNote)}</p>}
        {item.q.sourceContent?.solutions&&<MtmSourceContent segments={item.q.sourceContent.solutions} assetBase="/practice-media/source-crops" label={item.q.sourceRef} kind="solution" context="review"/>}
        {item.q.solution&&<Suspense fallback={<p role="status">Đang mở lời giải…</p>}><DetailedSolution examId={exam.id} versionHash={exam.versionHash} questionId={item.q.id} fallback={item.q.solution} blocks={item.q.solutionBlocks}/>{renderSolutionExtra?.(item.q)}</Suspense>}
        <p>Em tự đối chiếu cách làm của mình với lời giải:</p><div className="ep-recall-actions"><button type="button" className="ep-recall-primary" onClick={()=>mark(true)}>Đã hiểu, sang thẻ tiếp</button><button type="button" onClick={()=>mark(false)}>Cần ôn lại, sang thẻ tiếp</button></div>
      </div>}
      <button type="button" onClick={stop}>Dừng phiên ôn</button>
    </div>}
  </section>;
}
