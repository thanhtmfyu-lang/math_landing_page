import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {prepareEssayImage,type PreparedEssay} from './tu-luan-image';
import {essayRequest,sendEssayImage,type EssayReceipt,type EssayScope} from './tu-luan-client';
import {maDeLabel,thiThangPart} from './thi-thang-codes';
import './tu-luan.css';

type Queued={id:number;file:File;status:'ready'|'processing'|'uploading'|'received'|'error';progress:number;prepared?:PreparedEssay;receipt?:EssayReceipt;error?:string};
export const ESSAY_FALLBACK='Nếu không tải được thì gửi Zalo trung tâm 0967 365 413, ghi họ tên và mã đề.';
const time=(at:number|string)=>new Date(at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'});
/** Lives above ManagedAttempt so automatic MC submission cannot drop uploads. */
export default function TuLuanUpload({scope,fullName,closesAt,open,onOpenChange,onPendingChange}:{scope:EssayScope;fullName:string;closesAt:number;open:boolean;onOpenChange:(open:boolean)=>void;onPendingChange:(pending:boolean)=>void}){
 const [queue,setQueue]=useState<Queued[]>([]),[received,setReceived]=useState<EssayReceipt[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 const [deadline,setDeadline]=useState(closesAt+15*60000),[clockOffset,setClockOffset]=useState(0),[now,setNow]=useState(Date.now());
 const values=useRef(queue),running=useRef(false),sequence=useRef(0),alive=useRef(true),dialog=useRef<HTMLDivElement>(null),returnFocus=useRef<HTMLElement|null>(null);
 values.current=queue;
 const update=(id:number,patch:Partial<Queued>)=>{if(!alive.current)return;setQueue(previous=>{const next=previous.map(item=>item.id===id?{...item,...patch}:item);values.current=next;return next;});};
 const refresh=async()=>{
  try{const data=await essayRequest<{items:EssayReceipt[];deadline:number;serverNow:number}>(scope,'essay-list');if(!alive.current)return;setReceived(previous=>[...new Map([...previous,...data.items].map(item=>[item.id,item])).values()].sort((a,b)=>a.pageNumber-b.pageNumber));setDeadline(data.deadline);setClockOffset(data.serverNow-Date.now());setLoaded(true);setMessage('');}
  catch(error){if(alive.current){setLoaded(false);setMessage((error instanceof Error?error.message:'Chưa tải được biên nhận ảnh.')+' Em vẫn chọn ảnh và bấm Gửi được.');}}
 };
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(open)void refresh();},[open]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const pending=queue.some(item=>item.status!=='received');
 useEffect(()=>{onPendingChange(pending);return()=>onPendingChange(false);},[pending,onPendingChange]);
 useEffect(()=>{
  if(!open)return;returnFocus.current=document.activeElement as HTMLElement;
  const focus=()=>dialog.current?.focus();
  if(document.fullscreenElement&&document.exitFullscreen)void document.exitFullscreen().then(focus,focus);else focus();
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.stopPropagation();event.preventDefault();onOpenChange(false);}
   if(event.key==='Tab'){
    const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')??[]).filter(node=>node.getClientRects().length);
    const first=nodes[0],last=nodes.at(-1);
    if(!first){event.preventDefault();dialog.current?.focus();}
    else if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  };
  document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);returnFocus.current?.focus();};
 },[open,onOpenChange]);
 const add=(files:FileList|null)=>{
  if(!files?.length||running.current)return;
  const remaining=values.current.filter(item=>item.status!=='received');
  if(files.length+remaining.length>8){setMessage('Mỗi lần chọn tối đa 8 ảnh. Em gửi xong rồi bổ sung ảnh tiếp.');return;}
  const next=[...remaining,...Array.from(files,file=>({id:++sequence.current,file,status:'ready' as const,progress:0}))];values.current=next;setQueue(next);setMessage('');
 };
 const upload=async()=>{
  if(running.current)return;running.current=true;setBusy(true);setMessage('');
  try{
   if(!loaded)await refresh();
   for(const item of values.current){
    if(item.status==='received')continue;
    if(closed&&!item.prepared)break;
    try{
     update(item.id,{status:'processing',error:undefined});
     const prepared=item.prepared??await prepareEssayImage(item.file);if(!alive.current)break;update(item.id,{prepared,status:'uploading'});
     const receipt=await sendEssayImage(scope,prepared,progress=>update(item.id,{progress}));
     if(!receipt?.receivedAt)throw Error('Chưa có biên nhận ảnh. Em giữ ảnh và thử lại.');
     update(item.id,{status:'received',receipt,progress:100});
     if(alive.current)setReceived(previous=>[...previous.filter(row=>row.id!==receipt.id),receipt].sort((a,b)=>a.pageNumber-b.pageNumber));
    }catch(error){update(item.id,{status:'error',error:error instanceof Error?error.message:'Chưa nhận được ảnh. Em thử lại.'});break;}
   }
  }finally{running.current=false;if(alive.current)setBusy(false);}
 };
 const closed=now+clockOffset>=deadline,canRecover=queue.some(item=>item.status==='error'&&!!item.prepared),part=thiThangPart(scope.lessonCode),code=part?maDeLabel(part.ma):scope.lessonCode;
 return <section className="tu-luan-entry" aria-label="Bài tự luận của em"><button type="button" className="btvn-btn" onClick={()=>onOpenChange(true)}>Nộp ảnh tự luận</button>{received.length>0&&<p>Đã nhận {received.length} ảnh tự luận.</p>}
 {open&&createPortal(<div className="tu-luan-overlay"><div ref={dialog} className="tu-luan-dialog" role="dialog" aria-modal="true" aria-labelledby="tu-luan-title" tabIndex={-1}>
  <header><h2 id="tu-luan-title">Nộp ảnh tự luận</h2><button type="button" onClick={()=>onOpenChange(false)} aria-label="Đóng nộp ảnh tự luận">Đóng</button></header>
  <p><strong>{fullName} · {code}</strong></p><p className="tu-luan-code">{scope.lessonCode}</p>
  <p>Chụp rõ từng trang, đủ bốn góc, theo thứ tự. Chọn tối đa 8 ảnh mỗi lần, ảnh gốc tối đa 20 MB. Có thể bổ sung hoặc nộp lại; ảnh đã nhận vẫn được giữ, ảnh trùng chỉ tính một lần.</p>
  <p>Hạn nhận ảnh: <strong>{time(deadline)}</strong> (kết thúc ca + 15 phút). Nút Nộp bài trắc nghiệm và việc gửi ảnh được xác nhận riêng.</p>
  <p className="tu-luan-fallback">{ESSAY_FALLBACK}</p>
  {message&&<p role="alert">{message}</p>}
  {!loaded&&<button type="button" disabled={busy} onClick={()=>void refresh()}>Thử kết nối lại</button>}
  {closed&&<p role="status">Đã hết hạn nộp ảnh. Ảnh đã có biên nhận vẫn được giữ. Nếu đã gửi ảnh trước hạn nhưng mất kết nối, bấm Thử lại ảnh chưa nhận để kiểm tra biên nhận.</p>}
  <fieldset disabled={busy||closed}><legend>Chọn ảnh bài làm</legend>
   <label className="tu-luan-pick">Chụp ảnh<input aria-label="Chụp ảnh tự luận" type="file" accept="image/*" capture="environment" onChange={event=>{add(event.currentTarget.files);event.currentTarget.value='';}}/></label>
   <label className="tu-luan-pick">Chọn từ thư viện<input aria-label="Chọn ảnh tự luận từ thư viện" type="file" multiple accept="image/*" onChange={event=>{add(event.currentTarget.files);event.currentTarget.value='';}}/></label>
  </fieldset>
  <ol className="tu-luan-queue">{queue.map(item=><li key={item.id}><strong>{item.file.name}</strong><span role="status">{item.status==='ready'?'Chờ gửi':item.status==='processing'?'Đang nén / đổi ảnh…':item.status==='uploading'?`Đang tải ${item.progress}%`:item.status==='received'?`Đã nhận · Trang ${item.receipt?.pageNumber}`:'Chưa nhận ảnh'}</span>{item.error&&<p role="alert">{item.error}</p>}{!busy&&item.status!=='received'&&<button type="button" onClick={()=>setQueue(previous=>previous.filter(row=>row.id!==item.id))}>Bỏ ảnh chưa gửi</button>}</li>)}</ol>
  <button type="button" className="tu-luan-send" disabled={busy||!pending||(closed&&!canRecover)} onClick={()=>void upload()}>{busy?'Đang gửi ảnh…':queue.some(item=>item.status==='error')?'Thử lại ảnh chưa nhận':'Gửi ảnh đã chọn'}</button>
  <section aria-label="Biên nhận ảnh"><h3>Ảnh máy chủ đã nhận ({received.length})</h3>{received.length===0?<p>Chưa có biên nhận ảnh. Chỉ chữ Đã nhận kèm số trang mới xác nhận gửi thành công.</p>:<ol>{received.map(item=><li key={item.id}>Trang {item.pageNumber} · Đã nhận {time(item.receivedAt)}</li>)}</ol>}</section>
 </div></div>,document.body)}
 </section>;
}
