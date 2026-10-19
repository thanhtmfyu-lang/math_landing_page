import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import './center-board.css';
// Anh Thành chốt 19/10/2026: mở trang chủ là Bảng tin trung tâm bật lên, đọc xong tắt đi thì về trang chủ.
// Mọi người vào trang chủ đều thấy, kể cả ảnh, video lớp (quy tắc anh chốt 19/10 17:45: công khai để marketing).
// Tắt rồi thì cả phiên duyệt web không bật lại.
const CenterBoard=lazy(()=>import('./CenterBoard'));
const SEEN='mtm-bang-tin-da-xem';
export default function HomeBoardPopup(){
 const [posts,setPosts]=useState<unknown[]|null>(null),closeRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  // Khách bấm "Tư vấn" từ khóa học/lộ trình về /?quan-tam=…#register: để họ đăng ký luôn, không chắn bằng bảng tin.
  if(new URLSearchParams(location.search).has('quan-tam')||location.hash==='#register')return;
  try{if(sessionStorage.getItem(SEEN))return;}catch{}
  const controller=new AbortController();
  fetch('/api/bang-tin',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal})
   .then(r=>r.ok?r.json():null).then(d=>{if(!controller.signal.aborted)setPosts(d?.enabled&&Array.isArray(d.posts)?d.posts:[]);}).catch(()=>{if(!controller.signal.aborted)setPosts([]);});
  return()=>controller.abort();
 },[]);
 const close=()=>{try{sessionStorage.setItem(SEEN,'1');}catch{}setPosts(null);};
 useEffect(()=>{
  if(!posts)return;
  const prev=document.body.style.overflow;document.body.style.overflow='hidden';closeRef.current?.focus();
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('.mtm-board-viewer'))close();};
  addEventListener('keydown',onKey);return()=>{document.body.style.overflow=prev;removeEventListener('keydown',onKey);};
 },[posts]);
 if(!posts)return null;
 return <div className="mtm-board-popup" role="dialog" aria-modal="true" aria-label="Bảng tin trung tâm" onClick={e=>{if(e.target===e.currentTarget)close();}}>
  <button type="button" className="mtm-board-popup-x" aria-label="Đóng bảng tin" onClick={close}>×</button>
  <div className="mtm-board-popup-box">
   <Suspense fallback={null}><CenterBoard initial={posts}/></Suspense>
   <button ref={closeRef} type="button" className="mtm-board-popup-close" onClick={close}>Đã xem, vào trang chủ</button>
  </div>
 </div>;
}
