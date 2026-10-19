import {useEffect,useRef,useState} from 'react';
import {boardEvents,countdownLabel,dayLabel,kindLabels,parseServerPost,staticPosts,upcomingEvents,visiblePosts,type BoardPhoto,type BoardPost} from './center-board-data';

const still=(p:BoardPhoto)=>p.video?p.poster??p.thumb??'':p.url;
const small=(p:BoardPhoto)=>p.thumb??still(p);
import './center-board.css';

type Viewer={post:BoardPost;index:number}|null;
const COLLAPSE_KEY='mtm-bang-tin-thu-gon';
const readCollapsed=()=>{try{return localStorage.getItem(COLLAPSE_KEY)==='1';}catch{return false;}};

/** Bảng tin trung tâm: đứng đầu Góc học tập. Ảnh máy chủ chỉ trả khi phiên BTVN hợp lệ. */
export default function CenterBoard({onSkip,initial,guest}:{onSkip?:()=>void;initial?:unknown[];guest?:boolean}){
 const [now,setNow]=useState(Date.now),[remote,setRemote]=useState<BoardPost[]>(initial?initial.map(parseServerPost).filter((p):p is BoardPost=>!!p):[]),[viewer,setViewer]=useState<Viewer>(null),[collapsed,setCollapsed]=useState(readCollapsed);
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),60_000);return()=>clearInterval(t);},[]);
 useEffect(()=>{
  if(initial)return;
  const controller=new AbortController();
  fetch('/api/bang-tin',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal})
   .then(r=>r.ok?r.json():null).then(data=>{if(data&&Array.isArray(data.posts))setRemote(data.posts.map(parseServerPost).filter((p:BoardPost|null):p is BoardPost=>!!p));})
   .catch(()=>{});
  return()=>controller.abort();
 },[]);
 const posts=visiblePosts([...remote,...staticPosts],now),events=upcomingEvents(boardEvents,now);
 const toggle=()=>setCollapsed(v=>{const next=!v;try{localStorage.setItem(COLLAPSE_KEY,next?'1':'0');}catch{}return next;});
 if(!posts.length&&!events.length)return null;
 const [lead,...rest]=posts;
 return <section className={'mtm-board'+(collapsed?' is-collapsed':'')} aria-labelledby="mtm-board-title">
  <header className="mtm-board-head">
   <div><p className="mtm-board-eyebrow"><i aria-hidden="true"/>Bảng tin trung tâm</p><h2 id="mtm-board-title">Tin mới ở MTM<span>.</span></h2></div>
   <div className="mtm-board-head-tools">{onSkip&&<button type="button" className="mtm-board-skip" onClick={onSkip}>Việc hôm nay ↓</button>}<button type="button" className="mtm-board-toggle" aria-expanded={!collapsed} onClick={toggle}>{collapsed?'Mở bảng tin':'Thu gọn'}</button></div>
  </header>
  {!collapsed&&<div className="mtm-board-body">
   {lead&&<button type="button" className={'mtm-board-lead mtm-board-kind--'+lead.kind} onClick={()=>setViewer({post:lead,index:0})}>
    <span className="mtm-board-lead-media"><img src={still(lead.photos[0])} alt={lead.photos[0].alt} width={lead.photos[0].width} height={lead.photos[0].height} decoding="async"/></span>
    <span className="mtm-board-lead-copy"><span className="mtm-board-tags"><b>{kindLabels[lead.kind]}</b><em>{dayLabel(lead.date)}</em>{lead.photos.length>1&&<em>{mediaCount(lead)}</em>}</span>
     <strong>{lead.title}</strong><span className="mtm-board-summary">{lead.summary}</span><span className="mtm-board-open">Xem {lead.photos.length>1?'ảnh':'chi tiết'} <span aria-hidden="true">→</span></span></span>
   </button>}
   <div className="mtm-board-side">
    {guest&&<a className="mtm-board-login" href="/btvn"><strong>Ảnh, video thật ở lớp</strong><span>Học sinh MTM đăng nhập BTVN để xem <span aria-hidden="true">→</span></span></a>}
    {events.length>0&&<div className="mtm-board-events" aria-labelledby="mtm-board-events-title"><h3 id="mtm-board-events-title">Sắp tới ở trung tâm</h3><ol>{events.map(e=><li key={e.date}><span className="mtm-board-date"><b>{e.date.slice(8,10)}</b><i>Th{Number(e.date.slice(5,7))}</i></span><span><strong>{e.title}</strong><small>{e.note}</small></span><em className={e.daysLeft<=1?'is-soon':''}>{countdownLabel(e.daysLeft)}</em></li>)}</ol></div>}
    {rest.length>0&&<div className="mtm-board-list"><h3>Bài trước</h3><ul>{rest.map(p=><li key={p.id}><button type="button" className={'mtm-board-item mtm-board-kind--'+p.kind} onClick={()=>setViewer({post:p,index:0})}><img src={small(p.photos[0])} alt="" loading="lazy" decoding="async"/><span><b>{kindLabels[p.kind]} · {dayLabel(p.date)}</b><strong>{p.title}</strong><small>{mediaCount(p)}</small></span></button></li>)}</ul></div>}
   </div>
  </div>}
  {viewer&&<PhotoViewer post={viewer.post} index={viewer.index} onIndex={index=>setViewer({post:viewer.post,index})} onClose={()=>setViewer(null)}/>}
 </section>;
}

function mediaCount(p:BoardPost){const v=p.photos.filter(x=>x.video).length,a=p.photos.length-v;return [a&&a+' ảnh',v&&v+' video'].filter(Boolean).join(' · ');}

function PhotoViewer({post,index,onIndex,onClose}:{post:BoardPost;index:number;onIndex:(i:number)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDivElement>(null),touch=useRef<number|null>(null),count=post.photos.length,photo=post.photos[index];
 const go=(step:number)=>onIndex((index+step+count)%count);
 useEffect(()=>{
  const back=document.activeElement as HTMLElement|null;dialog.current?.focus();
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  return()=>{document.body.style.overflow=overflow;back?.focus?.();};
 },[]);
 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();else if(e.key==='ArrowRight'&&count>1)go(1);else if(e.key==='ArrowLeft'&&count>1)go(-1);};
  document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
 });
 return <div className="mtm-board-viewer" role="dialog" aria-modal="true" aria-label={post.title} tabIndex={-1} ref={dialog} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="mtm-board-viewer-bar"><span><b>{kindLabels[post.kind]} · {dayLabel(post.date)}</b><strong>{post.title}</strong></span><button type="button" onClick={onClose} aria-label="Đóng">✕</button></div>
  <figure onTouchStart={e=>{touch.current=e.touches[0].clientX;}} onTouchEnd={e=>{const start=touch.current;touch.current=null;if(start===null||count<2)return;const dx=e.changedTouches[0].clientX-start;if(Math.abs(dx)>40)go(dx<0?1:-1);}}>
   {photo.video?<video key={photo.url} src={photo.url} poster={photo.poster} controls playsInline autoPlay muted aria-label={photo.alt}/>:<img key={photo.url} src={photo.url} alt={photo.alt}/>}
   {count>1&&<><button type="button" className="mtm-board-nav is-prev" onClick={()=>go(-1)} aria-label="Ảnh trước">‹</button><button type="button" className="mtm-board-nav is-next" onClick={()=>go(1)} aria-label="Ảnh sau">›</button></>}
   <figcaption>{count>1&&<b>{index+1}/{count}</b>}{index===0?post.summary:photo.alt}{post.place&&index===0&&<small> · {post.place}</small>}</figcaption>
  </figure>
  {count>1&&<div className="mtm-board-thumbs">{post.photos.map((p,i)=><button key={p.url} type="button" aria-label={'Ảnh '+(i+1)} aria-current={i===index} onClick={()=>onIndex(i)}><img src={small(p)} alt="" loading="lazy"/>{p.video&&<i aria-hidden="true">▶</i>}</button>)}</div>}
 </div>;
}
