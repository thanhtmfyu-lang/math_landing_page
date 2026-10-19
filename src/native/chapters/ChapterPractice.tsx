import {lazy,Suspense,useContext,useMemo,useState,type ReactNode} from 'react';
import {Link,useRoute} from '../../migration/navigation';
import PracticeAttempt,{localStore} from '../exams/PracticeAttempt';
import ExamReview from '../exams/ExamReview';
import {readHistory} from '../exams/store';
import {resultFor} from '../exams/result';
import {validatePracticeExam,type PracticeExam,type PracticeQuestion} from '../exams/data';
import RoomChoice from '../exams/RoomChoice';
import MathText from '../math/MathText';
import MtmSourceContent from '../exams/MtmSourceContent';
import MtmSourceQuestion from '../exams/MtmSourceQuestion';
import TheorySummary from './TheorySummary';
import ZoomableImage from '../exams/ZoomableImage';
import FitTable from '../exams/FitTable';
import {RoomQuestionContext} from '../exams/RoomQuestionContext';
import {questionLabel} from '../exams/attempt-ui';
import questionPdfs from './mtm-question-pdfs.json';
import {isWarmup,WARMUP_LABEL} from './library-rules';

import '../exams/exams.css';
import './chapters.css';

type VariationTable={caption:string;headers:string[];rows:string[][]};
type DisplayQuestion=PracticeQuestion&{image?:string;imageAlt?:string;solutionTables?:VariationTable[];questionTables?:VariationTable[];statementSolutions?:string[]};
export type PracticeBankItem={exam:PracticeExam;note:string;limits:string[];scope:string;published:boolean;presentationTitle?:string;track?:string};
export const rich=(text:string):ReactNode=><MathText text={text}/>;
const QuestionPdf=lazy(()=>import('../exams/QuestionPdf'));
const pdfMeta=questionPdfs as Record<string,{bytes:number;totalPages:number}>;
/** Bản đề MTM dạng trang (logo, watermark) cho khung đọc đề; null khi chưa có số trang đã kiểm. */
function mtmQuestionPdf(exam:PracticeExam){
  const doc=exam.mtmDocuments?.questions,meta=doc&&pdfMeta[doc.sha256.toLowerCase()];
  return doc&&meta?{url:doc.url,sha256:doc.sha256,bytes:meta.bytes,totalPages:meta.totalPages,questionPages:Array.from({length:meta.totalPages},(_,i)=>i+1),verified:true as const}:null;
}
const wideScreen=()=>typeof matchMedia==='function'&&matchMedia('(min-width: 900px)').matches;
const noop=()=>{};
const points=(value:number)=>(value/1000).toLocaleString('vi-VN',{maximumFractionDigits:3});

export function QuestionReader({exam}:{exam:PracticeExam}) {
  const roomQuestion=useContext(RoomQuestionContext);
  const pdf=useMemo(()=>mtmQuestionPdf(exam),[exam]);
  const [mode,setMode]=useState<'pages'|'questions'>(()=>pdf&&wideScreen()?'pages':'questions');
  return <section className="cp-reader" aria-label="Đề bài luyện chương">
    {roomQuestion===null&&<TheorySummary exam={exam}/>}<h2>Đề bài</h2>{roomQuestion===null&&pdf&&<div className="cp-reader-mode" role="group" aria-label="Cách đọc đề"><button type="button" aria-pressed={mode==='pages'} onClick={()=>setMode('pages')}>Bản đề theo trang</button><button type="button" aria-pressed={mode==='questions'} onClick={()=>setMode('questions')}>Từng câu</button></div>}
    {roomQuestion===null&&mode==='pages'&&pdf?<Suspense fallback={<p role="status">Đang mở bản đề…</p>}><QuestionPdf file={pdf} title={exam.title} onReady={noop}/></Suspense>:<>{roomQuestion===null&&<p>Cuộn vùng này để đọc các câu. Điền bài làm ở phiếu trả lời.</p>}{roomQuestion===null&&exam.mtmDocuments&&<p><a href={exam.mtmDocuments.questions.url} target="_blank" rel="noopener noreferrer">Tải đề PDF theo mẫu MTM</a></p>}{roomQuestion===null&&exam.sourceInstructions&&<details><summary>Hướng dẫn làm ba phần</summary><MtmSourceContent segments={exam.sourceInstructions} assetBase="/practice-media/source-crops" label="Hướng dẫn đề" kind="question"/></details>}
    {(exam.questions as DisplayQuestion[]).map((q,index)=>roomQuestion!==null&&roomQuestion!==index?null:<article key={q.id} className="cp-source-question">
      <h3>{questionLabel(exam,index).full} · {points(q.maxMillipoints)} điểm</h3>
      <p><MathText text={q.prompt??q.text??''}/></p>{q.sourceContent&&<MtmSourceQuestion question={q}/>}<Tables tables={q.questionTables}/>
      {q.kind==='mc'&&!q.sourceContent&&<ol className="cp-choices" type="A">{q.choices.map((choice,i)=><li key={i}><RoomChoice questionId={q.id} choice={['A','B','C','D'][i]}><MathText text={choice}/></RoomChoice></li>)}</ol>}
      {q.kind==='tf'&&!q.sourceContent&&<ol className="cp-statements" type="a">{q.statements?.map((statement,i)=><li key={i}><MathText text={statement}/></li>)}</ol>}
      {q.image&&(q.imageAlt?<figure><ZoomableImage src={q.image} alt={q.imageAlt} label={`Hình ${questionLabel(exam,index).full}`}/><figcaption>{q.imageAlt}</figcaption></figure>:<details><summary>Xem ảnh câu trong nguồn</summary><ZoomableImage src={q.image} alt={`Câu ${index+1} trong PDF gốc; nội dung đã chép ở trên`} label={`Ảnh ${questionLabel(exam,index).full}`}/></details>)}
      <p className="cp-question-source"><small>MTM sưu tầm và biên soạn</small></p>
    </article>)}</>}
  </section>;
}

// TH-05 (Đợt 4): bảng biến thiên không tràn khung ở màn hẹp (FitTable chuyển dạng dọc khi dạng ngang không vừa).
function Tables({tables}:{tables?:VariationTable[]}){return <>{tables?.map((table,index)=><FitTable key={index} table={table} renderCell={rich}/>)}</>;}
export function ExtraSolution({question}:{question:PracticeQuestion}) {const q=question as DisplayQuestion;return <>{q.statementSolutions&&<ol className="cp-statements">{q.statementSolutions.map((text,index)=><li key={index}><MathText text={text}/></li>)}</ol>}<Tables tables={q.solutionTables}/></>;}

export default function ChapterPractice({additionalBank=[],catalogUrl='/luyen-tap',contextLabel='Luyện Chương I',audienceLabel,closedNotice}:{additionalBank?:PracticeBankItem[];catalogUrl?:string;contextLabel?:string;audienceLabel?:string;closedNotice?:(examId:string)=>string|undefined}) {
  const bank=additionalBank;
  const route=useRoute(),id=new URLSearchParams(route.search).get('id');
  const history=readHistory(localStore(),bank.map(p=>p.exam));
  const entries=history.items.filter(item=>bank.some(p=>p.exam.id===item.exam.id));
  const view=new URLSearchParams(route.search).get('luot'),saved=entries.find(item=>item.draft.attemptId===view);
  const savedResult=saved?resultFor(saved.exam,saved.draft):null;
  if(view&&!saved)return <section className="mig-container mig-panel"><h1>Không tìm thấy lượt đã lưu</h1><p>Lượt này không còn trong lịch sử trên trình duyệt này.</p><Link href={catalogUrl}>Về danh sách bài luyện</Link></section>;
  if(view&&saved)return <section className="mig-container cp-attempt ep-root">
    <h1>Lượt làm đã lưu · {audienceLabel??'Lớp '+saved.exam.grade}</h1><p>{bank.find(p=>p.exam.id===saved.exam.id&&p.exam.versionHash===saved.exam.versionHash)?.presentationTitle??saved.exam.title}</p>
    <p>Nộp lúc {new Date(saved.draft.submittedAt!).toLocaleString('vi-VN')} · Điểm {savedResult?.score.ok?points(savedResult.score.earnedMillipoints):'Chưa tính được'}/10</p>
    <ExamReview exam={saved.exam} draft={saved.draft} renderText={rich} renderSolutionExtra={q=><ExtraSolution question={q}/>}/>
    <Link href={catalogUrl} className="mig-button outline">Về danh sách bài luyện</Link>
  </section>;
  const pilot=bank.find(p=>p.exam.id===id);
  // LT-14 (Đợt 4): bỏ danh mục "Luyện theo chương" cũ (ngân hàng rỗng, nút dẫn tới /luyen-chuong không có trang).
  // Trang này chỉ mở với ?id= hoặc ?luot= từ /luyen-tap; thiếu id thì đưa về danh sách bài.
  if(!id)return <section className="mig-container mig-panel"><h1>Chưa chọn bài luyện</h1><Link href={catalogUrl}>Về danh sách bài luyện</Link></section>;
  if(!pilot)return <section className="mig-container mig-panel"><h1>Không tìm thấy bài thử</h1><Link href={catalogUrl}>Chọn bài luyện</Link></section>;
  const gate=validatePracticeExam(pilot.exam);
  if(!gate.valid)return <section className="mig-container mig-panel" role="alert"><h1>Bài chưa đủ điều kiện mở</h1><p>Giữ bản lưu cũ; cần kiểm lại cấu trúc đề và điểm.</p><Link href={catalogUrl}>Chọn bài khác</Link></section>;
  const tf=pilot.exam.questions.find(q=>q.kind==='tf');
  return <div className="mig-container cp-attempt ep-root">
    {/* LT-15 (Đợt 4): màn đầu chỉ còn một dòng tóm tắt; giới thiệu và thang điểm vào "Xem chi tiết" để nút Bắt đầu lên màn đầu. */}
    <section className="cp-intake mig-panel"><p><strong>{isWarmup(pilot)?WARMUP_LABEL:'Đề luyện tập Minh Thành Math'}</strong> · MTM sưu tầm và biên soạn</p>
      <details className="cp-intake-more"><summary>Xem chi tiết đề và cách chấm</summary>{isWarmup(pilot)&&<p>{pilot.exam.questions.length} câu ngắn để làm quen dạng bài; điểm theo thang luyện tập riêng, không quy đổi sang điểm HSA/TSA.</p>}<p>{pilot.note}</p>
      {tf?.kind==='tf'&&<p>Đúng–sai: {tf.pointsByCorrectCount.map((value,count)=>`${count} ý đúng: ${points(value)} điểm`).join(' · ')}.</p>}<p>Điểm trắc nghiệm và trả lời ngắn ghi tại từng câu.</p></details>
    </section>
    <PracticeAttempt key={pilot.exam.id} newAttemptsClosed={closedNotice?.(pilot.exam.id)} exam={pilot.exam} displayTitle={pilot.presentationTitle} catalogUrl={catalogUrl} contextLabel={contextLabel} audienceLabel={audienceLabel} renderText={rich} renderSolutionExtra={q=><ExtraSolution question={q}/>} questionReader={<QuestionReader exam={pilot.exam}/>}/>
  </div>;
}
