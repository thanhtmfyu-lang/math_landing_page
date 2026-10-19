import {useContext,type ReactNode} from 'react';
import MathText from '../math/MathText';
import RoomChoice from './RoomChoice';
import {RoomQuestionContext} from './RoomQuestionContext';
import {questionLabel} from './attempt-ui';
import type {PracticeExam} from './data';
import '../chapters/chapters.css';

/** Văn bản đề giữa kỳ (tệp của tổ soạn đề): giữ xuống dòng, **chữ đậm** và công thức $...$ (KaTeX qua MathText). Không sửa chữ nào. */
export function GkText({text}:{text:string}){
 return <>{text.split('\n').map((line,i)=><span key={i} className="gk1-line">{line.split(/(\*\*[^*\n]+\*\*)/g).map((part,j)=>part.length>4&&part.startsWith('**')&&part.endsWith('**')?<strong key={j}><MathText text={part.slice(2,-2)}/></strong>:<MathText key={j} text={part}/>)}</span>)}</>;
}
export const gkRich=(text:string):ReactNode=><GkText text={text}/>;
const TF=['a','b','c','d'];

/** Đọc đề: đủ 22 câu theo ba phần; trong phòng tập trung chỉ hiện câu đang làm. Không có đáp án (đề công khai). */
export default function GiuaKyReader({exam}:{exam:PracticeExam}){
 const room=useContext(RoomQuestionContext);
 return <section className="cp-reader gk1-reader" aria-label="Đề thi">
  {room===null&&<><h2>Đề bài</h2><p>Cuộn vùng này để đọc các câu. Điền bài làm ở phiếu trả lời.</p></>}
  {exam.questions.map((q,index)=>{
   if(room!==null&&room!==index)return null;
   const label=questionLabel(exam,index);
   return <article key={q.id} className="cp-source-question gk1-question" data-kind={q.kind}>
    <h3>{label.full}<span className="gk1-points">{(q.maxMillipoints/1000).toLocaleString('vi-VN')} điểm</span></h3>
    <div className="gk1-prompt"><GkText text={q.prompt??q.text??''}/></div>
    {q.kind==='mc'&&<ol className="cp-choices" type="A">{q.choices.map((choice,i)=><li key={i}><RoomChoice questionId={q.id} choice={['A','B','C','D'][i]}><GkText text={choice}/></RoomChoice></li>)}</ol>}
    {q.kind==='tf'&&<ol className="gk1-statements">{q.statements?.map((s,i)=><li key={i}><span className="gk1-tf-letter" aria-hidden="true">{TF[i]})</span><span><GkText text={s}/></span></li>)}</ol>}
    {q.kind==='tf'&&room===null&&<p className="gk1-note">Chọn Đúng hoặc Sai cho từng ý ở phiếu trả lời.</p>}
    {q.kind==='short'&&room===null&&<p className="gk1-note">Câu trả lời ngắn: nhập một số vào phiếu trả lời, dùng dấu phẩy thập phân (ví dụ 1,6).</p>}
   </article>;
  })}
 </section>;
}
