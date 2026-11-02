import {useEffect,useRef,useState,type FormEvent} from 'react';
import {monthlyDashboard,submitMonthly,uploadLessonFile} from './backend';
import {FilePicker} from './FilePicker';
import {privatePdf} from './files';
import {monthlyWindow,validateMonthlyPapers,type MonthlyDashboard} from './monthly-model';
import {vietnamToday} from './model';

export function MonthlyExamUpload({owner,initialData}:{owner:string;initialData?:MonthlyDashboard}){
 const [data,setData]=useState<MonthlyDashboard|null>(initialData??null),[date,setDate]=useState(vietnamToday()),[open,setOpen]=useState('19:30'),[close,setClose]=useState('21:30'),[title,setTitle]=useState(''),[ids,setIds]=useState<string[]>([]),[files,setFiles]=useState<File[][]>([[],[]]),[answers,setAnswers]=useState<File[][]>([[],[]]),[text,setText]=useState(['','']),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[epoch,setEpoch]=useState(0);
 const alive=useRef(true),sending=useRef(false),revision=useRef(0);
 const [essayMax,setEssayMax]=useState(['','']),[essayRubric,setEssayRubric]=useState(['','']);
 useEffect(()=>{alive.current=true;let inFlight=false;const generation=++revision.current;
  async function load(){if(inFlight)return;inFlight=true;try{const value=await monthlyDashboard(owner,date);if(alive.current&&revision.current===generation){setData(value);setIds(current=>current.filter(id=>value.classes.some(c=>c.class_id===id)));}}catch(e){if(alive.current&&revision.current===generation)setMessage(e instanceof Error?e.message:'Chưa tải được lịch thi.');}finally{inFlight=false;}}
  setData(null);void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},30000);
  return()=>{alive.current=false;revision.current++;clearInterval(timer);};
 },[owner,date,epoch]);
 async function send(e:FormEvent){e.preventDefault();if(sending.current||!data)return;
  const error=validateMonthlyPapers(files.map((f,i)=>({files:f,answers:answers[i],text:text[i]})));
  if(error||!ids.length||!title.trim()){setMessage(error||'Chọn lớp và điền tên kỳ thi.');return;}
  let window;try{window=monthlyWindow(date,open,close);}catch(e){setMessage((e as Error).message);return;}
  sending.current=true;setBusy(true);setMessage('Đang tải đề và đáp án vào kho riêng tư…');
  try{const batch=crypto.randomUUID(),paths:Record<string,string|null>={};
   for(const i of [0,1])for(const [kind,items] of [[`monthly${101+i}`,files[i]],[`monthly${101+i}-answer`,answers[i]]] as const){
    paths[kind]=items.length?await uploadLessonFile(owner,batch,kind,await privatePdf(items,true)):null;if(!alive.current)return;
   }
   const result=await submitMonthly(owner,{title:title.trim(),class_ids:ids,exam_date:date,opens_at:window.opensAt,closes_at:window.closesAt,papers:[0,1].map(i=>({code:101+i,homework_path:paths[`monthly${101+i}`],answer_path:paths[`monthly${101+i}-answer`],answer_text:text[i].trim()||null,essay_max_score:essayMax[i]?Number(essayMax[i]):null,essay_rubric:essayRubric[i].trim()||null}))});
   if(!alive.current)return;if(!result.ok)throw Error('Chưa có xác nhận nhận bài.');
   setFiles([[],[]]);setAnswers([[],[]]);setText(['','']);setEssayMax(['','']);setEssayRubric(['','']);setEpoch(n=>n+1);setMessage(`Đã nhận bản ${result.version}. Bài chờ đủ 2 AI và SymPy kiểm đáp án; chưa đạt sẽ giữ chờ.`);
  }catch(e){if(alive.current)setMessage(e instanceof Error?e.message:'Chưa nhận được bài. Giữ tệp để thử lại.');}finally{sending.current=false;if(alive.current)setBusy(false);}
 }
 return <section className="lu-panel" aria-label="Đề thi tháng"><p className="lu-eyebrow">ĐỀ THI THÁNG</p><h2>Hai mã đề, hai đáp án riêng</h2>
 {data?<><div className="lu-progress" data-state={data.blocked_classes?'loi':undefined}><label>Thi tháng · {data.ready_classes}/{data.scheduled_classes} lớp có lịch thi đã đủ hai mã và đáp án đạt kiểm<progress aria-label="Thi tháng" max={Math.max(1,data.scheduled_classes)} value={data.ready_classes}/></label>{data.blocked_classes>0&&<p className="is-missing" role="alert">{data.blocked_classes} lớp có đáp án chưa khớp hoặc chưa xử lý được. Bài giữ chờ.</p>}</div>
 <form onSubmit={e=>void send(e)}><fieldset disabled={busy}><label>Tên kỳ thi<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Kiểm tra kết thúc tháng"/></label>
 <div className="lu-field-row"><label>Ngày thi<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label><label>Giờ mở<input type="time" required value={open} onChange={e=>setOpen(e.target.value)}/></label><label>Giờ đóng<input type="time" required value={close} onChange={e=>setClose(e.target.value)}/></label></div>
 <fieldset className="lu-monthly-classes"><legend>Lớp dùng cùng đề</legend>{data.classes.map(c=><label key={c.class_id+c.teacher_key}><input type="checkbox" checked={ids.includes(c.class_id)} onChange={e=>setIds(current=>e.target.checked?[...new Set([...current,c.class_id])]:current.filter(id=>id!==c.class_id))}/>{c.class_name}</label>)}{!data.classes.length&&<p>Chưa có lớp được cấp quyền trong lịch. Quản lý kiểm tra dữ liệu đồng bộ.</p>}</fieldset>
 {data.staff.role!=='gv'&&<p>Quản lý/admin được đăng thay. Giáo viên phụ trách từng lớp được máy chủ xác minh từ lịch.</p>}
 <div className="lu-assets">{[0,1].map(i=><div className="lu-file-card" key={i}><h3>Tự luận mã {101+i} (nếu có)</h3><label>Điểm tối đa phần tự luận<input type="number" min="0.25" max="10" step="0.25" value={essayMax[i]} onChange={e=>setEssayMax(current=>current.map((x,n)=>n===i?e.target.value:x))}/></label><label>Đáp án và điểm từng bước<textarea rows={3} maxLength={16000} required={!!essayMax[i]} value={essayRubric[i]} onChange={e=>setEssayRubric(current=>current.map((x,n)=>n===i?e.target.value:x))}/></label></div>)}</div>
 <div className="lu-assets" key={epoch}>{[0,1].map(i=><div className="lu-file-card" key={i}><h3>Mã đề {101+i}</h3><FilePicker nested images label={`Đề mã ${101+i}`} description="PDF hoặc ảnh; bao gồm phần tự luận nếu có" files={files[i]} onChange={v=>setFiles(current=>current.map((x,n)=>n===i?v:x))}/><FilePicker nested images label={`Đáp án mã ${101+i}`} description="Đáp án TN, Đ/S, TLN và lời giải/rubric tự luận nếu có" files={answers[i]} onChange={v=>setAnswers(current=>current.map((x,n)=>n===i?v:x))}/><label>Hoặc gõ nhanh đáp án<textarea data-paper-key={101+i} rows={4} maxLength={16000} value={text[i]} onChange={e=>setText(current=>current.map((x,n)=>n===i?e.target.value:x))} placeholder="TN: 1A 2B · Đ/S: 1 Đ S Đ S · TLN: 1: 2,5"/></label></div>)}</div>
 <p className="lu-muted">Học sinh chọn một mã; bắt đầu là khóa mã còn lại. Lời giải mở sau giờ đóng. Điểm gửi phụ huynh theo bảng điểm hiện hành.</p><button className="lu-primary" disabled={busy||!ids.length}>{busy?'Đang nhận đề…':'Gửi đề thi tháng để kiểm'}</button></fieldset></form>
 <div aria-label="Tiến độ thi tháng">{data.uploads.map(u=><article className="lu-upload-status" key={u.id}><h3>{u.title} · Bản {u.version}</h3><p>{Object.values(u.class_names).join(' · ')} · {u.exam_date}</p><p className={u.status==='blocked'?'is-missing':''} role={u.status==='blocked'?'alert':'status'}>{u.status==='ready'?'Đã dựng hai mã và đạt kiểm; mở theo giờ đã chọn':u.status==='blocked'?'Bài giữ chờ — '+u.detail:u.status==='reviewing'?'Đang kiểm đáp án bằng hai AI và SymPy':'Đã nhận, chờ máy xử lý'}</p></article>)}</div></>:<p role="status">Đang tải lịch và tiến độ thi tháng…</p>}{message&&<p className="lu-message" role="status">{message}</p>}</section>;
}
