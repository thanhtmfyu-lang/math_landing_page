import {useState} from 'react';
import {renderResultCard,type ResultCardData} from './mtm-result-card';
import {certificateDate} from './mtm-certificate';
import './result-share-card.css';

/** Nút "Lưu ảnh kết quả" (W2) cho mọi trang kết quả đợt thi. Tên chỉ in lên ảnh khi em tự gõ và tick đồng ý. */
export function ResultShareCard({dot,scoreText,scale,percentile,sbd,url,fileName}:{dot:string;scoreText:string;scale?:string;percentile?:number|null;sbd?:string;url:string;fileName:string}){
 const [name,setName]=useState(''),[ok,setOk]=useState(false),[busy,setBusy]=useState(false),[note,setNote]=useState('');
 const data=():ResultCardData=>({dot,scoreText,scale,percentile,sbd,name:ok?name:'',dateText:certificateDate(),url});
 const save=async(share:boolean)=>{
  setBusy(true);setNote('');
  try{
   const blob=await renderResultCard(data()),file=typeof File!=='undefined'?new File([blob],fileName,{type:'image/png'}):null;
   if(share&&file&&typeof navigator.canShare==='function'&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:dot,text:'Kết quả '+dot+' tại '+url.replace(/^https?:\/\//,'')});setNote('Đã mở chia sẻ.');}
   else{const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=fileName;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);setNote('Đã lưu ảnh kết quả về máy.');}
  }catch(e){if((e as Error)?.name!=='AbortError')setNote('Chưa tạo được ảnh. Em thử lại nhé.');}
  finally{setBusy(false);}
 };
 return <div className="mtm-share-card">
  <p className="mtm-share-head"><strong>Lưu ảnh kết quả để khoe bạn bè</strong><span>Ảnh dọc cho story, có điểm và logo MTM, không có số điện thoại.</span></p>
  <label className="mtm-share-consent"><input type="checkbox" checked={ok} onChange={e=>setOk(e.target.checked)}/><span>In tên em lên ảnh</span></label>
  {ok&&<input className="mtm-share-name" value={name} maxLength={40} onChange={e=>setName(e.target.value)} placeholder="Tên em muốn hiện" aria-label="Tên hiện trên ảnh"/>}
  <p className="mtm-share-actions"><button type="button" onClick={()=>void save(false)} disabled={busy}>{busy?'Đang tạo ảnh…':'Lưu ảnh kết quả'}</button><button type="button" className="is-ghost" onClick={()=>void save(true)} disabled={busy}>Chia sẻ</button></p>
  {note&&<p className="mtm-share-note" role="status">{note}</p>}
 </div>;
}
