import {Fragment,useContext,type ReactNode} from 'react';
import MathText from '../math/MathText';
import RoomChoice from './RoomChoice';
import {RoomQuestionContext} from './RoomQuestionContext';
import type {PracticeExam,PracticeQuestion} from './data';
import '../chapters/chapters.css';

/** Câu chùm: một dữ liệu dùng chung cho các câu liền nhau. Văn bản giữ nguyên như tệp đề của tổ Học liệu. */
export type HsaGroup={id:string;questionIds:string[];text:string};
/** Chỉ thêm chỗ được ngắt dòng (\allowbreak, không in ra chữ nào) giữa các phần tử của mảng dài như
 * $[[0,20),[20,40),...]$ để màn hình điện thoại không cắt mất dữ liệu; nội dung công thức giữ nguyên. */
export const hsaBreakable=(text:string)=>text.split(/(\$[^$\n]+\$)/g).map(part=>part.length>40&&part.startsWith('$')&&part.endsWith('$')?part.replace(/([)\]]),(?=[[(])/g,'$1,\\allowbreak '):part).join('');
/** Văn bản đề HSA: giữ xuống dòng, **chữ đậm** và công thức $...$ (KaTeX qua MathText như phần Luyện tập). */
export function HsaText({text}:{text:string}){
 return <>{hsaBreakable(text).split('\n').map((line,i)=><span key={i} className="hsa-line">{line.split(/(\*\*[^*\n]+\*\*)/g).map((part,j)=>part.length>4&&part.startsWith('**')&&part.endsWith('**')?<strong key={j}><MathText text={part.slice(2,-2)}/></strong>:<MathText key={j} text={part}/>)}</span>)}</>;
}
export const hsaRich=(text:string):ReactNode=><HsaText text={text}/>;
export const hsaGroupOf=(groups:readonly HsaGroup[],id:string)=>groups.find(g=>g.questionIds.includes(id));
function Stimulus({group}:{group:HsaGroup}){return <div className="hsa-stimulus" role="note" aria-label={'Dữ liệu dùng chung, chùm '+group.id}><HsaText text={group.text}/></div>;}
/** Sau khi nộp: hiện lại dữ liệu chùm cạnh lời giải của từng câu trong chùm. */
export function HsaSolutionExtra({groups,question}:{groups:readonly HsaGroup[];question:PracticeQuestion}){const g=hsaGroupOf(groups,question.id);return g?<Stimulus group={g}/>:null;}

/** Đọc đề: danh sách đủ 50 câu (dữ liệu chùm hiện một lần trước câu đầu của chùm);
 * trong phòng tập trung chỉ hiện câu đang làm, kèm dữ liệu chùm của câu đó. */
export default function HsaPaperReader({exam,groups}:{exam:PracticeExam;groups:readonly HsaGroup[]}){
 const room=useContext(RoomQuestionContext);
 return <section className="cp-reader hsa-reader" aria-label="Đề thi">
  {room===null&&<><h2>Đề bài</h2><p>Cuộn vùng này để đọc các câu. Điền bài làm ở phiếu trả lời.</p></>}
  {exam.questions.map((q,index)=>{
   if(room!==null&&room!==index)return null;
   const g=hsaGroupOf(groups,q.id),first=g?.questionIds[0]===q.id;
   return <Fragment key={q.id}>{g&&(room!==null||first)&&<Stimulus group={g}/>}
    <article className={'cp-source-question hsa-question'+(g?' hsa-in-group':'')}>
     <h3>Câu {index+1}{g?<span className="hsa-group-tag">Chùm {g.id}</span>:null}</h3>
     <div className="hsa-prompt"><HsaText text={q.prompt??q.text??''}/></div>
     {q.kind==='mc'&&<ol className="cp-choices" type="A">{q.choices.map((choice,i)=><li key={i}><RoomChoice questionId={q.id} choice={['A','B','C','D'][i]}><HsaText text={choice}/></RoomChoice></li>)}</ol>}
     {q.kind==='short'&&room===null&&<p className="hsa-short-note">Câu điền đáp án: nhập một số vào phiếu trả lời, dùng dấu phẩy thập phân (ví dụ 2,46).</p>}
    </article></Fragment>;
  })}
 </section>;
}
