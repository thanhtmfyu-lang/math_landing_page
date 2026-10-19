import React,{useMemo} from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import bank from './detailed-solutions.json';
import {schoolLatex,schoolText} from './notation';
import {authoredFormula} from '../math/MathText';
import FitTable from './FitTable';
type Block={type:'text';text:string}|{type:'math';latex:string}|{type:'table';headers:string[];rows:string[][]};
type DetailedExam={examId:string;versionHash:string;questions:{id:string;sourceRef:string;blocks:Block[];answer:string}[]};
export function Formula({latex,inline=false}:{latex:string;inline?:boolean}) {
  const mathml=authoredFormula(latex);
  const html=useMemo(()=>{if(mathml)return mathml;try{return katex.renderToString(schoolLatex(latex),{displayMode:!inline,output:'htmlAndMathml',throwOnError:true,trust:false,maxSize:20,maxExpand:1000,strict:'warn',macros:{}});}catch{return null;}},[latex,inline,mathml]);
  return html?<span className={`${inline?'ep-inline-math':'ep-formula'}${mathml?' mtm-math-authored':''}`} data-math-author={mathml?'MathType Web':undefined} dangerouslySetInnerHTML={{__html:html}}/>:<code className="ep-formula-source">{latex}</code>;
}
function MathRun({text}:{text:string}) {
  return <>{schoolText(text).split(/(\$[^$\n]+\$)/g).map((part,i)=>part.startsWith('$')&&part.endsWith('$')?<Formula key={i} latex={part.slice(1,-1)} inline/>:part)}</>;
}
/** **chữ đậm** trong lời giải (ví dụ "**Đúng.**" ở đề giữa kỳ) hiện thành chữ đậm thay vì dấu sao. */
function RichText({text}:{text:string}) {
  return <>{text.split(/(\*\*[^*\n]+\*\*)/g).map((part,i)=>part.length>4&&part.startsWith('**')&&part.endsWith('**')?<strong key={i}><MathRun text={part.slice(2,-2)}/></strong>:<MathRun key={i} text={part}/>)}</>;
}
export default function DetailedSolution({examId,versionHash,questionId,fallback,blocks}:{examId:string;versionHash:string;questionId:string;fallback:string;blocks?:Block[]}) {
  const question=blocks?{blocks}:(bank as unknown as DetailedExam[]).find(exam=>exam.examId===examId&&exam.versionHash===versionHash)?.questions.find(q=>q.id===questionId);
  if(!question)return <div className="ep-math-text">{fallback.split(/\r?\n/).map((line,i)=><p key={i}><RichText text={line}/></p>)}</div>;
  return <div className="ep-detailed-solution">{question.blocks.map((block,i)=>block.type==='text'?<p key={i}><RichText text={block.text}/></p>:block.type==='math'?<div className="ep-formula-line" key={i}><Formula latex={block.latex}/></div>:<FitTable key={i} table={block} rowHeaders={false} renderCell={text=><RichText text={text}/>}/>)}</div>;
}
