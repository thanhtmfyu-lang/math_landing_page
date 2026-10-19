import {useEffect,useRef,useState} from 'react';
import {useUnsavedGuard} from '../exams/navigation-guard';
import './document-homework.css';

type Answer=string|[boolean|null,boolean|null,boolean|null,boolean|null]|null;
type Question={id:string;sourceRef:string;kind:'mc'|'tf'|'short';prompt:string;choices?:string[];statements?:string[]};
type ReleaseCard={releaseId:string;label:string;sourceCount:number;acceptedCount:number;pendingCount:number;opensAt:string;dueAt:string|null};
type View=ReleaseCard&{manifestHash:string;mode:'partial'|'pdf-simple';locked:boolean;instructions?:string;teacherKeyCoverage?:{complete:boolean;coveredSourceRefs:string[];missingSourceRefs:string[]};assignedPdfSourceRefs?:string[];questions:Question[];pending:{id:string;sourceRef:string;status:string}[];questionsPdf:string|null;answersPdf:string|null;assetsUnavailable?:boolean;attempt:null|{attemptId:string;revision:number;submittedAt:string|null;answers:Record<string,Answer>;note:string;attachmentIds:string[];receipt:null|{receiptId:string;submittedAt:string;late:boolean|null;gradingPending:true}}};
const when=(date:string|null)=>date?new Date(date).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chờ xác minh';
const MESSAGES:Record<string,string>={UNAUTHORIZED:'Em đăng nhập tại trang BTVN trước khi vào phần này.',INTEGRATION_NOT_READY:'BTVN bản đơn giản chưa mở trên máy chủ.',NOT_OPEN:'Bài chưa đến giờ mở.',PREVIOUS_DRAFT_ACTIVE:'Em còn một lượt đang làm ở bản đã mở trước đó. Về danh sách và tiếp tục lượt ấy trước nhé.',REVISION_CONFLICT:'Bài đã đổi ở tab khác. Bản em đang nhập vẫn được giữ, hãy kiểm tra lại trước khi lưu.',ALREADY_SUBMITTED:'Lượt này đã nộp. Em kiểm tra lại biên nhận.',NO_SUBMISSION:'Em cần tải tệp bài làm lên trước khi nộp bản đơn giản.',MUTATION_OUTCOME_UNKNOWN:'Chưa xác nhận được kết quả. Giữ trang mở và bấm lại cùng thao tác để kiểm tra.',RATE_LIMITED:'Em chờ một chút rồi thử lại.',ATTACHMENT_LIMIT:'Mỗi lượt nhận tối đa 5 tệp.'};
async function call<T>(body:unknown):Promise<T>{
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),35000);
 try{const response=await fetch('/api/btvn-documents',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctrl.signal});const data=await response.json();if(!response.ok)throw Error(MESSAGES[data.error_code]??'Chưa thực hiện được. Nội dung em nhập vẫn được giữ, hãy thử lại.');return data;}
 catch(error){if(error instanceof Error&&error.name==='AbortError')throw Error(MESSAGES.MUTATION_OUTCOME_UNKNOWN);throw error;}finally{clearTimeout(timer);}
}
export default function DocumentHomework(){
 const[cards,setCards]=useState<ReleaseCard[]>([]),[view,setView]=useState<View|null>(null),[answers,setAnswers]=useState<Record<string,Answer>>({}),[note,setNote]=useState(''),[attachments,setAttachments]=useState<string[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('Đang tải BTVN…'),[dirty,setDirty]=useState(false);
 const dirtyRef=useRef(false),busyRef=useRef(false),keys=useRef(new Map<string,string>()),generation=useRef(0);
 dirtyRef.current=dirty;busyRef.current=busy;
 const leave=useUnsavedGuard(()=>dirtyRef.current||busyRef.current,'Bài làm đang gửi hoặc chưa lưu. Giữ trang mở để lưu xong trước khi rời bài.');
 useEffect(()=>{const current=++generation.current;void call<{releases:ReleaseCard[]}>({action:'list'}).then(value=>{if(generation.current===current){setCards(value.releases);setMessage(value.releases.length?'':'Lớp em chưa có bài ở phần này.');}}).catch(error=>{if(generation.current===current)setMessage(error.message);});return()=>{generation.current++;};},[]);
 const commandKey=(value:unknown)=>{const fingerprint=JSON.stringify(value);let key=keys.current.get(fingerprint);if(!key){key=crypto.randomUUID();keys.current.set(fingerprint,key);}return key;};
 function apply(next:View){setView(next);setAnswers(next.attempt?.answers??{});setNote(next.attempt?.note??'');setAttachments(next.attempt?.attachmentIds??[]);setDirty(false);}
 async function task(work:()=>Promise<void>){if(busyRef.current)return;busyRef.current=true;setBusy(true);setMessage('Đang xử lý…');try{await work();setMessage('Đã cập nhật trạng thái.');}catch(error){setMessage(error instanceof Error?error.message:'Chưa thực hiện được.');}finally{busyRef.current=false;setBusy(false);}}
 const selected=view,attempt=selected?.attempt,submitted=!!attempt?.submittedAt;
 async function save(action:'save'|'submit'){
  if(!selected||!attempt)return;
  const body={action,releaseId:selected.releaseId,attemptId:attempt.attemptId,revision:attempt.revision,answers,note,attachmentIds:attachments};
  await task(async()=>apply(await call<View>({...body,idempotencyKey:commandKey(body)})));
 }
 async function upload(file:File){
  if(!selected||!attempt||submitted)return;
  if(file.size<8||file.size>10*1024*1024||!['application/pdf','image/png','image/jpeg'].includes(file.type)){setMessage('Chọn PDF, PNG hoặc JPEG có dung lượng tối đa 10 MB.');return;}
  await task(async()=>{
   const bytes=new Uint8Array(await file.arrayBuffer()),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),sha256=Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');
   const base={releaseId:selected.releaseId,attemptId:attempt.attemptId,revision:attempt.revision,file:{sha256,contentType:file.type,bytes:file.size}},key=commandKey(base);
   const init=await call<{uploadUrl:string}>({...base,action:'upload_init',idempotencyKey:key});
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),90000);
   try{const response=await fetch(init.uploadUrl,{method:'PUT',headers:{'Content-Type':file.type,'x-upsert':'false'},body:bytes,signal:ctrl.signal});if(!response.ok&&response.status!==409&&response.status!==400)throw Error('Chưa tải được tệp. Bài đang nhập vẫn được giữ.');}finally{clearTimeout(timer);}
   const result=await call<{attachmentId:string}>({...base,action:'upload_commit',idempotencyKey:key});
   setAttachments(previous=>[...new Set([...previous,result.attachmentId])]);setDirty(true);
  });
 }
 function answer(id:string,value:Answer){setAnswers(previous=>({...previous,[id]:value}));setDirty(true);}
 return <section className="mtm-document-homework"><div className="btvn-entry-bar"><a href="/btvn">← BTVN của em</a><img src="/mtm-original-logo-420w.webp" alt="Minh Thành Math"/></div><h1>Bài tập về nhà</h1>{leave}
 <p role="status">{message}</p>
 {!view?<><h2>Bài đã mở và bản đang bổ sung</h2>{cards.map(card=><article className="doc-card" key={card.releaseId}><h3>{card.label}</h3><p>{card.sourceCount} câu nguồn · {card.acceptedCount} câu làm trực tuyến</p><p>Mở {when(card.opensAt)} · Hạn {when(card.dueAt)}</p><button type="button" disabled={busy} onClick={()=>void task(async()=>apply(await call<View>({action:'state',releaseId:card.releaseId})))}>Xem bài</button></article>)}</>:<>
 <button type="button" disabled={busy||dirty} onClick={()=>setView(null)}>← Danh sách bài</button><h2>{view.label}</h2><p>Mở {when(view.opensAt)} · Hạn {when(view.dueAt)}</p>
 {view.locked?<p>Bài chưa đến giờ mở. Em quay lại đúng lịch của lớp nhé.</p>:<><p>{view.instructions}</p>{view.questionsPdf?<a href={view.questionsPdf} target="_blank" rel="noreferrer">Mở PDF đề</a>:<p>Chưa tải được PDF đề. Em chưa nên bắt đầu lượt làm.</p>}
 {!!view.assignedPdfSourceRefs?.length&&<p><strong>Câu được giao trong PDF:</strong> {view.assignedPdfSourceRefs.join('; ')}.</p>}
 {!!view.teacherKeyCoverage?.missingSourceRefs.length&&<p>Chờ bổ sung đáp án, chưa giao: {view.teacherKeyCoverage.missingSourceRefs.join('; ')}.</p>}
 {!attempt?<button type="button" disabled={busy||!view.questionsPdf} onClick={()=>void task(async()=>{const body={action:'start',releaseId:view.releaseId};apply(await call<View>({...body,idempotencyKey:commandKey(body)}));})}>Bắt đầu làm bài</button>:<>
 {submitted?<><h3>Đã nộp bài</h3>{attempt.receipt?<p>Biên nhận {attempt.receipt.receiptId} · {when(attempt.receipt.submittedAt)} · {attempt.receipt.late===null?'Chờ xác minh hạn':attempt.receipt.late?'Nộp muộn':'Đúng hạn'} · Chờ giáo viên chấm.</p>:<p>Đang đối soát biên nhận.</p>}{view.answersPdf&&<a href={view.answersPdf} target="_blank" rel="noreferrer">Xem PDF đáp án</a>}</>:<fieldset disabled={busy}><legend>Bài làm của em</legend>
 {view.questions.map(q=><article className="doc-card" key={q.id}><h3>{q.sourceRef}</h3><p className="doc-prompt">{q.prompt}</p>{q.kind==='mc'?q.choices?.map((choice,i)=><label key={i}><input type="radio" name={q.id} checked={answers[q.id]===String.fromCharCode(65+i)} onChange={()=>answer(q.id,String.fromCharCode(65+i))}/>{String.fromCharCode(65+i)}. {choice}</label>):q.kind==='tf'?q.statements?.map((statement,i)=><label key={i}>{String.fromCharCode(97+i)}. {statement}<select value={Array.isArray(answers[q.id])?String(answers[q.id][i]):'null'} onChange={event=>{const next=(Array.isArray(answers[q.id])?[...answers[q.id]]:[null,null,null,null])as [boolean|null,boolean|null,boolean|null,boolean|null];next[i]=event.target.value==='null'?null:event.target.value==='true';answer(q.id,next);}}><option value="null">Chưa chọn</option><option value="true">Đúng</option><option value="false">Sai</option></select></label>):<label>Đáp án<input maxLength={20000} value={typeof answers[q.id]==='string'?answers[q.id]:''} onChange={event=>answer(q.id,event.target.value)}/></label>}</article>)}
 <label>Ghi chú hoặc phần trình bày<textarea value={note} maxLength={20000} rows={5} onChange={event=>{setNote(event.target.value);setDirty(true);}}/></label>
 <label>Tệp bài làm, tối đa 5 tệp PDF, PNG hoặc JPEG<input type="file" accept="application/pdf,image/png,image/jpeg" disabled={attachments.length>=5} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}}/></label><p>Đã tải {attachments.length}/5 tệp. Tệp sẽ được gắn vào bài khi em lưu hoặc nộp.</p>
 <div className="doc-actions"><button type="button" onClick={()=>void save('save')}>Lưu bài</button><button type="button" onClick={()=>void save('submit')}>Nộp bài</button></div><p>{dirty?'Có nội dung chưa lưu.':'Nội dung đã được lưu trên máy chủ.'}</p>
 </fieldset>}
 </>}{view.pending.length>0&&<details><summary>Trạng thái {view.pending.length} câu trong PDF</summary><ul>{view.pending.map(item=><li key={item.id}>{item.sourceRef}: {item.status}</li>)}</ul></details>}
 {view.assetsUnavailable&&<p role="status">Một số tài liệu chưa tải được. Biên nhận đã lưu vẫn được giữ.</p>}
 </>}
 </>}
 </section>;
}
