import {useEffect,useId,useRef,useState} from 'react';
import {openDialogCompat} from '../exams/dialog-compat';
import '../exams/dialog-compat.css';
import {isHttpsUrl} from '../exams/data';
import {HomeworkReader} from '../homework/HomeworkSession';
import {loadPublishedLessonPreview} from './backend';
import type {PublishedLessonPreviewData} from './published-preview';

type Props={
  owner:string; uploadId:string; classId:string; className:string; title:string;
  isTest:boolean; hasSecondPaper:boolean; onClose:()=>void;
};
type LoadResult={paper:1|2;revision:number}&
  ({data:PublishedLessonPreviewData}|{error:string});

export default function PublishedLessonPreview({owner,uploadId,classId,className,title,isTest,hasSecondPaper,onClose}:Props){
  const headingId=useId(),dialog=useRef<HTMLDialogElement>(null),closeButton=useRef<HTMLButtonElement>(null);
  const [paper,setPaper]=useState<1|2>(1),[revision,setRevision]=useState(0),[result,setResult]=useState<LoadResult>();
  useEffect(()=>{
    const node=dialog.current;
    if(node)return openDialogCompat(node,{onCancel:onClose,initialFocus:closeButton.current});
  },[onClose]);
  useEffect(()=>{
    const controller=new AbortController();
    void loadPublishedLessonPreview(owner,{uploadId,classId,paper,isTest},controller.signal).then(
      data=>{if(!controller.signal.aborted)setResult({paper,revision,data});},
      error=>{if(!controller.signal.aborted)setResult({paper,revision,error:error instanceof Error?error.message:'Chưa mở được bài đã đăng.'});}
    );
    return ()=>controller.abort();
  },[owner,uploadId,classId,paper,isTest,revision]);
  useEffect(()=>{
    const refresh=()=>setRevision(value=>value+1);
    window.addEventListener('mtm:retry-assets',refresh);
    return ()=>window.removeEventListener('mtm:retry-assets',refresh);
  },[]);
  const current=result?.paper===paper&&result.revision===revision?result:undefined;
  const data=current&&'data' in current?current.data:undefined;
  const candidatePdf=data?.exam.sourcePdf?.url??data?.exam.mtmDocuments?.questions?.url;
  return <dialog ref={dialog} className="lu-published-preview" aria-labelledby={headingId} onCancel={event=>{event.preventDefault();onClose();}}>
    <header className="lu-preview-header">
      <div><h2 id={headingId}>{data?.title??title}</h2><p className="lu-muted">{className} · Bài đã đăng</p></div>
      <button ref={closeButton} type="button" onClick={onClose}>Đóng</button>
    </header>
    <div className="lu-preview-body">
      {hasSecondPaper&&<div className="lu-preview-papers" role="group" aria-label="Chọn đề BTVN để kiểm tra">
        {([1,2] as const).map(value=><button key={value} type="button" aria-pressed={paper===value} onClick={()=>setPaper(value)}>Đề {value}</button>)}
      </div>}
      {!current?<p role="status">Đang mở bài đã đăng…</p>:data?<div key={paper}>
        {isHttpsUrl(candidatePdf)&&<p><a href={candidatePdf} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Mở PDF đề gốc</a></p>}
        <HomeworkReader exam={data.exam} label={data.kind==='exam'?'Câu hỏi đề kiểm tra':'Câu hỏi BTVN'}/>
      </div>:<><p role="alert">{'error' in current?current.error:''}</p><button type="button" onClick={()=>setRevision(value=>value+1)}>Thử mở lại</button></>}
    </div>
  </dialog>;
}
