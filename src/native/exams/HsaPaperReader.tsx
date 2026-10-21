import {Fragment,useContext,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import MathText from '../math/MathText';
import RoomChoice from './RoomChoice';
import {RoomQuestionContext} from './RoomQuestionContext';
import type {PracticeExam,PracticeQuestion} from './data';
import '../chapters/chapters.css';

/** Câu chùm: một dữ liệu dùng chung cho các câu liền nhau. Văn bản giữ nguyên như tệp đề của tổ Học liệu. */
/** Bảng số liệu của đề (từ trường bang của tệp đề), chữ giữ nguyên; ô có thể có công thức $...$. */
export type HsaTable={title:string;columns:string[];rows:string[][]};
export type HsaGroup={id:string;questionIds:string[];text:string;table?:HsaTable};
export type HsaTables=Readonly<Record<string,HsaTable>>;
/** Chỉ thêm chỗ được ngắt dòng (\allowbreak, không in ra chữ nào) giữa các phần tử của mảng dài như
 * $[[0,20),[20,40),...]$ để màn hình điện thoại không cắt mất dữ liệu; nội dung công thức giữ nguyên. */
export const hsaBreakable=(text:string)=>text.split(/(\$[^$\n]+\$)/g).map(part=>part.length>40&&part.startsWith('$')&&part.endsWith('$')?part.replace(/([)\]]),(?=[[(])/g,'$1,\\allowbreak '):part).join('');
/** Văn bản đề HSA: giữ xuống dòng, **chữ đậm** và công thức $...$ (KaTeX qua MathText như phần Luyện tập). */
export function HsaText({text}:{text:string}){
 return <>{hsaBreakable(text).split('\n').map((line,i)=><span key={i} className="hsa-line">{line.split(/(\*\*[^*\n]+\*\*)/g).map((part,j)=>part.length>4&&part.startsWith('**')&&part.endsWith('**')?<strong key={j}><MathText text={part.slice(2,-2)}/></strong>:<MathText key={j} text={part}/>)}</span>)}</>;
}
export const hsaRich=(text:string):ReactNode=><HsaText text={text}/>;
export const hsaGroupOf=(groups:readonly HsaGroup[],id:string)=>groups.find(g=>g.questionIds.includes(id));
/** Bảng thật: tiêu đề bảng nằm ngoài vùng cuộn (luôn đọc được), hàng tiêu đề cột, cột đầu là tiêu đề hàng;
 * trên điện thoại chỉ phần bảng cuộn ngang trong khung. */
/** Ô ngắn (số, khoảng như [20; 25)) không xuống dòng; ô dài được xuống dòng để bảng vừa màn hình hẹp. */
const nw=(cell:string)=>cell.length<=12?'hsa-nw':undefined;
export function HsaDataTable({table}:{table:HsaTable}){
 const titleId=useId(),wrap=useRef<HTMLDivElement>(null),[scrolls,setScrolls]=useState(false);
 // Chỉ nhắc vuốt ngang khi bảng thật sự rộng hơn khung.
 useEffect(()=>{const el=wrap.current;if(!el)return;const check=()=>setScrolls(el.scrollWidth>el.clientWidth+1);check();if(typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(check);ro.observe(el);return()=>ro.disconnect();},[]);
 return <figure className="hsa-figure">
  <figcaption id={titleId} className="hsa-table-title"><HsaText text={table.title}/></figcaption>
  <div ref={wrap} className="hsa-table-wrap" role="region" aria-labelledby={titleId} tabIndex={0}><table className="hsa-table" aria-labelledby={titleId}>
   <thead><tr>{table.columns.map((c,i)=><th key={i} scope="col" className={nw(c)}><HsaText text={c}/></th>)}</tr></thead>
   <tbody>{table.rows.map((r,i)=><tr key={i}>{r.map((c,j)=>j===0?<th key={j} scope="row" className={nw(c)}><HsaText text={c}/></th>:<td key={j} className={nw(c)}><HsaText text={c}/></td>)}</tr>)}</tbody>
  </table></div>
  {scrolls&&<p className="hsa-table-hint" aria-hidden="true">Vuốt ngang trong bảng để xem đủ các cột.</p>}
 </figure>;
}
function Stimulus({group}:{group:HsaGroup}){return <div className="hsa-stimulus" role="note" aria-label={'Dữ liệu dùng chung, chùm '+group.id}><HsaText text={group.text}/>{group.table&&<HsaDataTable table={group.table}/>}</div>;}
/** Sau khi nộp: hiện lại dữ liệu chùm (hoặc bảng của câu) cạnh lời giải. */
export function HsaSolutionExtra({groups,tables,question}:{groups:readonly HsaGroup[];tables?:HsaTables;question:PracticeQuestion}){const g=hsaGroupOf(groups,question.id),t=tables?.[question.id];return g?<Stimulus group={g}/>:t?<HsaDataTable table={t}/>:null;}

/** Đọc đề: danh sách đủ 50 câu (dữ liệu chùm hiện một lần trước câu đầu của chùm);
 * trong phòng tập trung chỉ hiện câu đang làm, kèm dữ liệu chùm của câu đó. */
export default function HsaPaperReader({exam,groups,tables}:{exam:PracticeExam;groups:readonly HsaGroup[];tables?:HsaTables}){
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
     {tables?.[q.id]&&<HsaDataTable table={tables[q.id]}/>}
     {q.kind==='mc'&&<ol className="cp-choices" type="A">{q.choices.map((choice,i)=><li key={i}><RoomChoice questionId={q.id} choice={['A','B','C','D'][i]}><HsaText text={choice}/></RoomChoice></li>)}</ol>}
     {q.kind==='short'&&room===null&&<p className="hsa-short-note">Câu điền đáp án: theo quy chế HSA chỉ nhập số nguyên hoặc phân số tối giản vào phiếu trả lời (ví dụ 12, -3 hoặc 5/4).</p>}
    </article></Fragment>;
  })}
 </section>;
}
