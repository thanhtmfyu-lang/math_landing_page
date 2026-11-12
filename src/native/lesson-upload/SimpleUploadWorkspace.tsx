import {useEffect,useRef,useState,type FormEvent} from 'react';
import {submitLesson,uploadLessonFile} from './backend';
import {pendingAfterFailure} from './submission-receipt';
import {privatePdf} from './files';
import {latestForSession,nearestSession,normalizedVideoUrl,sessionKey,STEP_LABELS,validateUpload,type LessonSession,type LessonUpload,type UploadDashboard} from './model';
import {defaultDueLocal,dueLocalToIso,uploadState,uploadTitle} from './simple-intake';

const dateLabel=(date:string)=>new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(`${date}T12:00:00+07:00`));
type Files={homework:File[];answer:File[];homework2:File[];answer2:File[];handout:File[]};
const emptyFiles=():Files=>({homework:[],answer:[],homework2:[],answer2:[],handout:[]});

function FilePicker({label,files,onChange,required=false,images=true}:{label:string;files:File[];onChange:(files:File[])=>void;required?:boolean;images?:boolean}){
  const input=useRef<HTMLInputElement>(null);
  return <div className="lu-file-card lu-simple-file"><label>{label}{required&&<span className="lu-required">Bắt buộc khi giao BTVN</span>}
    <input ref={input} type="file" accept={images?'application/pdf,image/jpeg,image/png,image/webp':'application/pdf'} multiple={images} onChange={e=>onChange(Array.from(e.target.files??[]))}/>
    <small>{images?'Một PDF hoặc nhiều ảnh JPG, PNG, WebP · tối đa 20 MB.':'Một tệp PDF · tối đa 20 MB.'}</small></label>
    {files.length>0&&<><p className="lu-filenames">{files.map(f=>f.name).join(' · ')}</p><button type="button" onClick={()=>{onChange([]);if(input.current)input.current.value='';}}>Bỏ tệp</button></>}
  </div>;
}

function Status({upload}:{upload:LessonUpload}){
  const status=uploadState(upload);
  return <article className="lu-simple-status" data-state={status.state}>
    <span className="lu-badge">Bản {upload.version}</span><h3>{status.label}</h3><p>{status.detail}</p><small>{upload.title}</small>
    <details><summary>Xem chi tiết xử lý</summary>{[upload.steps,...(upload.homework2_uploaded?[upload.paper2_steps??[]]:[])].map((steps,paper)=><div key={paper}>
      {upload.homework2_uploaded&&<h4>Đề {paper+1}</h4>}<ol className="lu-steps">{STEP_LABELS.map((label,i)=>{const step=steps.find(s=>s.step===i+1);return <li key={label} data-state={step?.status??'cho'}><span className="lu-step-icon" aria-hidden="true">{step?.status==='xong'?'✓':i+1}</span><div><strong>{label}</strong>{step?.detail&&<p>{step.detail}</p>}</div></li>;})}</ol>
    </div>)}</details>
  </article>;
}

/** All writes use the authenticated staff adapter; this view also accepts synthetic dashboard fixtures for QA. */
export function SimpleUploadWorkspace({data,owner,onRefresh,onSignOut}:{data:UploadDashboard;owner:string;onRefresh:()=>Promise<void>;onSignOut:()=>void}){
  const first=nearestSession(data.sessions),[picked,setPicked]=useState(first?sessionKey(first):'');
  const [files,setFiles]=useState<Files>(emptyFiles),[scope,setScope]=useState(''),[scope2,setScope2]=useState(''),[title,setTitle]=useState('');
  const [answer,setAnswer]=useState(''),[answer2,setAnswer2]=useState(''),[video,setVideo]=useState('');
  const [deadlines,setDeadlines]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[stage,setStage]=useState(''),[message,setMessage]=useState(''),[fileKey,setFileKey]=useState(0);
  const [pending,setPending]=useState<Record<string,unknown>|null>(null);
  const alive=useRef(true),submitting=useRef(false),formRef=useRef<HTMLElement>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const session=data.sessions.find(s=>sessionKey(s)===picked),manager=data.staff.role!=='gv';
  const classes=[...new Map(data.sessions.map(s=>[s.class_id,s])).values()];
  const sessions=data.sessions.filter(s=>s.class_id===session?.class_id);
  const current=session?latestForSession(data.uploads,session):undefined;
  const history=session?data.uploads.filter(u=>u.class_ids.includes(session.class_id)&&(u.class_dates?.[session.class_id]??u.lesson_date)===session.lesson_date&&u.teacher_key===session.teacher_key).sort((a,b)=>b.version-a.version):[];
  const targets=session?(session.class_ids??[session.class_id]).map(id=>{
    const date=session.class_dates?.[id]??session.lesson_date;
    const peer=id===session.class_id?session:data.sessions.find(s=>s.class_id===id&&s.lesson_date===date&&s.teacher_key===session.teacher_key);
    return {id,name:peer?.class_name??id,session:peer};
  }):[];
  const dirty=!!pending||Object.values(files).some(f=>f.length>0)||!!(scope||scope2||title||answer||answer2||video)||Object.keys(deadlines).length>0;
  useEffect(()=>{if(!picked&&data.sessions.length){const s=nearestSession(data.sessions);if(s)setPicked(sessionKey(s));}},[data.sessions,picked]);
  useEffect(()=>{if(!dirty)return;const handler=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
  function reset(){setFiles(emptyFiles());setScope('');setScope2('');setTitle('');setAnswer('');setAnswer2('');setVideo('');setDeadlines({});setFileKey(n=>n+1);}
  function selectSession(s:LessonSession){if(busy||pending||sessionKey(s)===picked)return;if(dirty&&!window.confirm('Đổi buổi học và bỏ phần chưa gửi?'))return;setPicked(sessionKey(s));reset();setMessage('');}
  function changeFiles(kind:keyof Files,value:File[]){setFiles(old=>({...old,[kind]:value}));setMessage('');}
  async function refresh(){try{await onRefresh();}catch(e){if(alive.current)setMessage(e instanceof Error?e.message:'Chưa cập nhật được tiến độ.');}}
  async function deliver(payload:Record<string,unknown>){
    try{
      const result=await submitLesson(owner,payload);if(!alive.current)return;
      setPending(null);reset();setMessage(`${result.already_received?'Đã xác nhận':'Đã nhận'} bản ${result.version}. AI sẽ xử lý và đối chiếu trước khi giao bài.`);
      try{await onRefresh();}catch{if(alive.current)setMessage(`Đã nhận bản ${result.version}. Bấm Cập nhật để xem tiến độ.`);}
    }catch(e){if(alive.current)setPending(current=>pendingAfterFailure(current,payload,e));throw e;}
  }
  async function retry(){if(!pending||submitting.current)return;submitting.current=true;setBusy(true);setMessage('Đang kiểm tra lại cùng yêu cầu…');try{await deliver(pending);}catch(e){if(alive.current)setMessage((e as Error).message);}finally{if(alive.current){submitting.current=false;setBusy(false);}}}
  async function send(event:FormEvent){
    event.preventDefault();if(submitting.current||pending||!session)return;
    const finalTitle=uploadTitle(title,[...files.homework,...files.handout].map(f=>f.name),session);
    const error=validateUpload({title:finalTitle,scope,homework:files.homework.length>0,answer:files.answer.length>0||!!answer.trim(),handout:files.handout.length>0,video:video.trim()});
    if(error){setMessage(error);return;}
    if(files.homework.length&&!files.answer.length&&!answer.trim()){setMessage('Thêm tệp đáp án BTVN để AI đối chiếu trước khi giao bài.');return;}
    if(files.answer.length&&answer.trim()||files.answer2.length&&answer2.trim()){setMessage('Mỗi đề chỉ dùng một cách gửi đáp án: tải tệp hoặc gõ nhanh.');return;}
    if(files.homework2.length&&!files.homework.length){setMessage('Gửi Đề 1 cùng Đề 2.');return;}
    if(files.homework2.length&&!files.answer2.length&&!answer2.trim()){setMessage('Thêm đáp án riêng cho Đề 2.');return;}
    if(!files.homework2.length&&(files.answer2.length||answer2.trim()||scope2.trim())){setMessage('Thêm Đề 2 hoặc bỏ thông tin riêng của Đề 2.');return;}
    let dueAt:Record<string,string>={};
    try{if(files.homework.length)for(const target of targets){const value=deadlines[target.id]??(target.session?defaultDueLocal(target.session):'');if(!value){if(target.id===session.class_id)throw Error('Chưa có hạn nộp hợp lệ. Kiểm tra lịch buổi học.');continue;}const iso=dueLocalToIso(value);if(target.session){const opens=Date.parse(`${target.session.lesson_date}T${target.session.end_time||target.session.start_time}+07:00`);if(!Number.isFinite(opens)||Date.parse(iso)<=opens)throw Error('Hạn nộp phải sau giờ kết thúc buổi học.');}dueAt[target.id]=iso;}}catch(e){setMessage((e as Error).message);return;}
    submitting.current=true;setBusy(true);setMessage('');const captured={session,files,scope:scope.trim(),scope2:scope2.trim(),title:finalTitle,answer:answer.trim(),answer2:answer2.trim(),video:video.trim(),dueAt};
    try{
      const batch=crypto.randomUUID(),paths:Record<string,string|null>={homework_path:null,answer_path:null,handout_path:null};
      const labels={homework:'đề BTVN',answer:'đáp án',homework2:'Đề 2',answer2:'đáp án Đề 2',handout:'tài liệu'};
      for(const kind of ['homework','answer','homework2','answer2','handout'] as const){if(!captured.files[kind].length)continue;setStage(`Đang tải ${labels[kind]}…`);const pdf=await privatePdf(captured.files[kind],kind!=='handout');if(!alive.current)return;paths[`${kind}_path`]=await uploadLessonFile(owner,batch,kind,pdf);if(!alive.current)return;}
      setStage('Đang gửi cho AI…');
      await deliver({client_request_id:batch,class_ids:captured.session.class_ids??[captured.session.class_id],lesson_date:captured.session.lesson_date,teacher_key:captured.session.teacher_key,title:captured.title,task_scope:captured.scope,...paths,answer_text:captured.answer||null,answer2_text:captured.answer2||null,task_scope2:captured.scope2||null,video_url:captured.video?normalizedVideoUrl(captured.video):null,on_behalf_of:manager?captured.session.teacher_key:null,...(captured.files.homework.length?{due_at_by_class:captured.dueAt}:{})});
    }catch(e){if(alive.current)setMessage(e instanceof Error?e.message:'Chưa gửi được bài. Tệp đã chọn vẫn được giữ để thử lại.');}
    finally{if(alive.current){submitting.current=false;setBusy(false);setStage('');}}
  }
  return <>
    <div className="lu-account"><span><b>{data.staff.display_name}</b><span className="lu-badge">{manager?'Quản lý':'Giáo viên'}</span></span><button type="button" onClick={onSignOut} disabled={busy||!!pending}>Đăng xuất</button></div>
    <div className="lu-columns lu-simple-columns">
      <section className="lu-panel lu-form-panel" ref={formRef}><h2>Giao bài tập về nhà</h2><p className="lu-muted">Tải đề và đáp án, ghi phần cần làm. AI xử lý phần còn lại.</p>
        {!data.sessions.length?<p role="status">Chưa có lịch lớp được cấp cho tài khoản. Quản lý cần kiểm tra lịch đồng bộ.</p>:<form onSubmit={event=>void send(event)}><fieldset disabled={busy||!!pending}>
          <div className="lu-field-row"><label>Lớp<select required value={session?.class_id??''} onChange={e=>{const s=nearestSession(data.sessions.filter(s=>s.class_id===e.target.value));if(s)selectSession(s);}}>{classes.map(s=><option key={s.class_id} value={s.class_id}>{s.class_name}</option>)}</select></label>
            <label>Buổi học<select required value={picked} onChange={e=>{const s=data.sessions.find(s=>sessionKey(s)===e.target.value);if(s)selectSession(s);}}>{sessions.map(s=><option key={sessionKey(s)} value={sessionKey(s)}>{dateLabel(s.lesson_date)} · {s.start_time.slice(0,5)}</option>)}</select></label></div>
          {targets.length>1&&<p className="lu-pair">Cùng bài cho: {targets.map(t=>t.name).join(' · ')}. Hạn nộp riêng theo lịch từng lớp.</p>}
          <div className="lu-assets" key={fileKey}><FilePicker label="Đề BTVN" required files={files.homework} onChange={value=>changeFiles('homework',value)}/><FilePicker label="Đáp án BTVN" required files={files.answer} onChange={value=>changeFiles('answer',value)}/></div>
          <label>Phạm vi bài tập<textarea required={files.homework.length>0} maxLength={300} rows={2} value={scope} onChange={e=>setScope(e.target.value)} placeholder="Ví dụ: Câu 5–15 trang 3, bỏ câu 6; hoặc toàn bộ phiếu"/></label>
          <div className="lu-deadlines">{targets.map(target=>target.session?<label key={target.id}>{targets.length>1?`Hạn nộp · ${target.name}`:'Hạn nộp'}<input type="datetime-local" value={deadlines[target.id]??defaultDueLocal(target.session)} onChange={e=>setDeadlines(old=>({...old,[target.id]:e.target.value}))}/></label>:<p key={target.id} className="lu-muted">{target.name}: máy chủ lấy hạn theo lịch đã đồng bộ.</p>)}</div>
          <p className="lu-muted lu-deadline-note">Giờ Việt Nam. Hạn được điền theo lịch; thầy cô có thể chỉnh.</p>
          <details className="lu-extra"><summary>Thêm tài liệu, Đề 2 hoặc tùy chọn khác</summary>
            <label>Tên bài (không bắt buộc)<input maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Để trống để dùng tên tệp đề"/></label>
            <label>Hoặc gõ đáp án Đề 1<textarea maxLength={16000} rows={2} value={answer} onChange={e=>setAnswer(e.target.value)} placeholder="1A 2B 3C · Chỉ gõ khi không tải tệp đáp án"/></label>
            <div className="lu-assets" key={`extra-${fileKey}`}><FilePicker label="Tài liệu buổi học" images={false} files={files.handout} onChange={value=>changeFiles('handout',value)}/><div className="lu-file-card"><label>Video buổi học<input type="url" value={video} onChange={e=>setVideo(e.target.value)} placeholder="Link YouTube hoặc Zoom record"/></label></div><FilePicker label="Đề 2 (nếu có)" files={files.homework2} onChange={value=>changeFiles('homework2',value)}/><FilePicker label="Đáp án Đề 2" files={files.answer2} onChange={value=>changeFiles('answer2',value)}/></div>
            <label>Hoặc gõ đáp án Đề 2<textarea maxLength={16000} rows={2} value={answer2} onChange={e=>setAnswer2(e.target.value)}/></label><label>Phạm vi riêng của Đề 2<textarea maxLength={300} rows={2} value={scope2} onChange={e=>setScope2(e.target.value)} placeholder="Để trống nếu giống Đề 1"/></label>
          </details>
          <button className="lu-primary lu-submit" type="submit" disabled={busy||!session}>{busy?stage||'Đang gửi…':current?'Gửi bản mới cho AI':'Gửi cho AI lên bài'}</button>
          <p className="lu-muted">Đáp án được lưu riêng tư. AI đọc đề, chuẩn hóa theo mẫu, đối chiếu rồi giao đúng lớp và hạn nộp.</p>
        </fieldset></form>}
        {message&&<p className="lu-message" role="status">{message}</p>}{pending&&<div className="lu-pending" role="alert"><p>Chưa rõ máy chủ đã lưu hay chưa. Nội dung được giữ nguyên để tránh giao bài trùng.</p><button type="button" className="lu-primary" disabled={busy} onClick={()=>void retry()}>{busy?'Đang kiểm tra…':'Gửi lại cùng yêu cầu'}</button></div>}
      </section>
      <aside className="lu-panel lu-processing lu-simple-processing"><div className="lu-section-head"><h2>Trạng thái bài</h2><button type="button" disabled={busy} onClick={()=>void refresh()}>Cập nhật</button></div><p className="lu-muted">{session?`${session.class_name} · ${dateLabel(session.lesson_date)}`:'Chọn lớp và buổi học'}</p>
        {current?<Status upload={current}/>:<div className="lu-empty"><span aria-hidden="true">↑</span><h3>Chưa gửi bài</h3><p>Chọn tệp rồi bấm Gửi cho AI lên bài. Trạng thái sẽ tự cập nhật.</p></div>}
        {current?.due_at_by_class&&<dl className="lu-saved-due">{Object.entries(current.due_at_by_class).map(([id,due])=><div key={id}><dt>Hạn · {data.sessions.find(s=>s.class_id===id)?.class_name??id}</dt><dd>{new Date(due).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</dd></div>)}</dl>}
        {history.length>0&&<details className="lu-history"><summary>Lịch sử · {history.length} bản</summary>{history.map(u=><div key={u.id}><b>Bản {u.version} · {u.title}</b><small>{new Date(u.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} · {uploadState(u).label}</small></div>)}</details>}
        <p className="lu-muted">Tự cập nhật mỗi 30 giây khi mở trang.</p>
      </aside>
    </div>
    {data.publisher_warnings?.map(w=><p className="lu-message" role="alert" key={w.class_id+w.lesson_code}>{data.sessions.find(s=>s.class_id===w.class_id)?.class_name} · {dateLabel(w.lesson_date)}: {w.warnings.join(' · ')}</p>)}
    {manager&&<details className="lu-panel lu-week-overview"><summary>Các buổi trong tuần · {dateLabel(data.week_start)}–{dateLabel(data.week_end)}</summary><div className="lu-table-scroll"><table><thead><tr><th>Lớp · buổi học</th><th>BTVN</th><th>Trạng thái</th></tr></thead><tbody>{data.sessions.map(s=>{const u=latestForSession(data.uploads,s);return <tr key={sessionKey(s)}><th scope="row"><button type="button" disabled={busy} onClick={()=>{selectSession(s);formRef.current?.scrollIntoView({behavior:'smooth'});}}>{s.class_name}<small>{dateLabel(s.lesson_date)} · {s.start_time.slice(0,5)}</small></button></th><td>{u?.homework_uploaded||u?.has_homework?u.homework2_uploaded?'2 đề':'1 đề':'Chưa tải'}</td><td>{u?uploadState(u).label:'Chưa gửi'}</td></tr>;})}</tbody></table></div></details>}
  </>;
}
