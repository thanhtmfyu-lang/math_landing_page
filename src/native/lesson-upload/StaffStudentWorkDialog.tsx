import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {openDialogCompat} from '../exams/dialog-compat';
import '../exams/dialog-compat.css';
import {
  historyDate,historyDateTime,historyRowKey,historyScore,historyStudentName,
  historyWorkLabel,historyWorkStatus,validateHistoryPage,
  type StaffHistoryHomework,type StaffHistoryMode,type StaffHistoryPage,
  type StaffHistoryQuery,type StaffHistoryRow
} from './staff-history';
import {
  canOpenStudentWork,validateStaffStudentWork,
  type StaffStudentWorkAnswer,type StaffStudentWorkData,type StaffStudentWorkRequest
} from './staff-student-work';
import './staff-history.css';

type Props={
  row:StaffHistoryRow;
  initialItem?:StaffHistoryHomework;
  mode:StaffHistoryMode;
  loadPage:(query:StaffHistoryQuery)=>Promise<StaffHistoryPage>;
  loadWork:(request:StaffStudentWorkRequest,signal?:AbortSignal)=>Promise<StaffStudentWorkData>;
  onClose:()=>void;
};
type LoadResult={revision:number}&(
  {kind:'list';items:StaffHistoryHomework[]}|
  {kind:'work';data:StaffStudentWorkData}|
  {kind:'error'}
);

function Answer({value}:{value:StaffStudentWorkAnswer['answer']}){
  if(!Array.isArray(value))return <>{value?.trim()?value:'Bỏ trống'}</>;
  return <ul className="sh-work-choices" aria-label="Các ý Đúng/Sai">
    {value.map((choice,index)=><li key={index}>{'abcd'[index]}) {choice===null?'Bỏ trống':choice?'Đúng':'Sai'}</li>)}
  </ul>;
}

function SubmittedWork({data}:{data:StaffStudentWorkData}){
  if(data.status!=='ready')return <p role="status">{data.status==='not_released'?'Chưa công bố kết quả đề kiểm tra.':'Chưa có bài làm lưu trên web.'}</p>;
  return <>
    <h3>{data.title}</h3>
    {data.attempts.map(attempt=><section className="sh-work-attempt" key={attempt.number}>
      <header>
        <div><h4>Lượt {attempt.number}</h4><p>Đã nộp {historyDateTime(new Date(attempt.submitted_at).toISOString())}</p></div>
        <strong>{attempt.score===null?'Chưa có điểm':`Điểm ${historyScore(attempt.score)}`}</strong>
      </header>
      {attempt.answers.length?<dl className="sh-work-answers">
        {attempt.answers.map((answer,index)=><div key={`${answer.number}|${index}`}>
          <dt>{answer.label||`Câu ${answer.number}`}</dt><dd><Answer value={answer.answer}/></dd>
        </div>)}
      </dl>:<p>Chưa có đáp án đã nộp để hiển thị.</p>}
    </section>)}
  </>;
}

function ExamList({items,onSelect}:{items:StaffHistoryHomework[];onSelect:(item:StaffHistoryHomework)=>void}){
  if(!items.length)return <p role="status">Buổi này chưa có đề kiểm tra cho học sinh.</p>;
  return <ul className="sh-work-exam-list">
    {items.map(item=><li key={item.assignment_id}>
      <div>
        <strong>{item.title||'Đề kiểm tra'}</strong>
        <small>{historyWorkStatus(item.status)}{item.status!=='not_released'&&item.submitted_at?` · ${historyDateTime(item.submitted_at)}`:''}</small>
        {item.status!=='not_released'&&item.score!==null&&<span>Điểm {historyScore(item.score)}</span>}
      </div>
      {canOpenStudentWork(item)&&<button type="button" onClick={()=>onSelect(item)} aria-label={`Xem bài làm · ${item.title||'Đề kiểm tra'}`}>Xem bài làm</button>}
    </li>)}
  </ul>;
}

function WorkDialog({row,initialItem,mode,loadPage,loadWork,onClose}:Props){
  const heading=useId(),dialog=useRef<HTMLDialogElement>(null),closeButton=useRef<HTMLButtonElement>(null);
  const close=useRef(onClose);
  close.current=onClose;
  const [item,setItem]=useState(initialItem);
  const [revision,setRevision]=useState(0),[result,setResult]=useState<LoadResult>();
  const {student_id,class_id,lesson_date}=row,direct=!!initialItem;
  const blocked=!!item&&!canOpenStudentWork(item);
  useEffect(()=>{
    const node=dialog.current;
    if(node)return openDialogCompat(node,{onCancel:()=>close.current(),initialFocus:closeButton.current});
  },[]);
  useEffect(()=>{
    if(blocked)return;
    const controller=new AbortController(),signal=controller.signal;
    async function read():Promise<LoadResult>{
      if(item){
        const request:StaffStudentWorkRequest={student_id,class_id,lesson_date,
          assignment_id:item.assignment_id,work_kind:item.work_kind??'homework',mode:direct?mode:'session'};
        const data=validateStaffStudentWork(await loadWork(request,signal),request);
        return {revision,kind:'work',data};
      }
      const data=validateHistoryPage(await loadPage({mode:'session',work_kind:'exam',
        student_id,class_id,from_date:lesson_date,to_date:lesson_date,page:1,page_size:1}),'exam');
      if((data.mode&&data.mode!=='session')||data.page!==1)throw Error('Kết quả tra cứu sai phạm vi.');
      const match=data.rows.find(entry=>entry.student_id===student_id&&entry.class_id===class_id&&entry.lesson_date===lesson_date);
      return {revision,kind:'list',items:match?.homework??[]};
    }
    void read().then(
      value=>{if(!signal.aborted)setResult(value);},
      ()=>{if(!signal.aborted)setResult({revision,kind:'error'});}
    );
    return ()=>controller.abort();
  },[blocked,class_id,direct,item,lesson_date,loadPage,loadWork,mode,revision,student_id]);
  function refresh(){setRevision(value=>value+1);}
  function select(value?:StaffHistoryHomework){
    closeButton.current?.focus({preventScroll:true});
    setItem(value);
    refresh();
  }
  const current=result?.revision===revision?result:undefined;
  let body:ReactNode;
  if(blocked)body=<p role="status">{historyWorkStatus(item?.status)}</p>;
  else if(!current)body=<p role="status">{item?'Đang mở bài làm…':'Đang tải đề kiểm tra…'}</p>;
  else if(current.kind==='error')body=<>
    <p role="alert">{item?'Chưa mở được bài làm.':'Chưa tải được danh sách đề kiểm tra.'}</p>
    <button type="button" onClick={refresh}>Thử lại</button>
  </>;
  else if(current.kind==='work')body=<SubmittedWork data={current.data}/>;
  else body=<ExamList items={current.items} onSelect={select}/>;

  return <dialog ref={dialog} className="sh-work-dialog" aria-labelledby={heading}
    onCancel={event=>{event.preventDefault();onClose();}}>
    <header className="sh-work-header">
      <div><h2 id={heading}>{item?'Bài làm học sinh':'Đề kiểm tra trong buổi'}</h2>
        <p>{historyStudentName(row)} · {row.class_name} · {historyDate(lesson_date)}</p></div>
      <button ref={closeButton} type="button" onClick={onClose}>Đóng</button>
    </header>
    <div className="sh-work-body">
      {item&&!direct&&<button className="sh-work-back" type="button" onClick={()=>select()}>Quay lại danh sách đề</button>}
      {blocked&&item&&<p>{item.title||historyWorkLabel(item.work_kind)}</p>}
      {body}
    </div>
  </dialog>;
}

export default function StaffStudentWorkDialog(props:Props){
  const {row,initialItem,mode}=props;
  const key=JSON.stringify([historyRowKey(row),mode,initialItem?.work_kind,initialItem?.assignment_id,initialItem?.status]);
  return <WorkDialog key={key} {...props}/>;
}
