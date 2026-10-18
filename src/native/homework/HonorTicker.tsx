import {useEffect,useState} from 'react';
import './honor-ticker.css';
import {requestLeaderboard,subscribeLeaderboardRefresh} from './leaderboard-refresh';

/** 18/10 anh Thành: đầu trang web lúc nào cũng có dải vinh danh: gọi tên vô địch từng lớp, em điểm 10, lớp dẫn đầu.
 * Dùng chế độ gon=1 (không ảnh, vài trăm byte), tự làm mới khi có bài nộp. */
type Mini={fullName?:string;className:string;score:number};
type Arena={cohorts:{cohort:string;top:Mini[];classes:{className:string;avg:number;students:number;top:Mini[]}[]}[]};
const fmt=(n:number)=>n.toLocaleString('vi-VN',{maximumFractionDigits:2});
export function honorItems(a:Arena){
 const out:string[]=[];
 for(const c of a.cohorts){
  const lead=c.classes.find(k=>k.students);if(lead)out.push('🏁 Lớp dẫn đầu khối '+c.cohort+': '+lead.className+' (TB '+fmt(lead.avg)+')');
  if(c.top[0])out.push('🏆 Quán quân khối '+c.cohort+': '+(c.top[0].fullName||'Học sinh MTM')+' '+fmt(c.top[0].score)+'đ');
  for(const k of c.classes)if(k.top[0])out.push('👑 Vô địch lớp '+k.className+': '+(k.top[0].fullName||'Học sinh MTM')+' '+fmt(k.top[0].score)+'đ');
  for(const r of c.top)if(r.score>=10)out.push('⭐ '+(r.fullName||'Học sinh MTM')+' ('+r.className+') đạt 10 tuyệt đối');
 }
 return [...new Set(out)];
}
export default function HonorTicker(){
 const [items,setItems]=useState<string[]>([]),[retry,setRetry]=useState(0);
 useEffect(()=>subscribeLeaderboardRefresh(()=>setRetry(n=>n+1)),[]);
 useEffect(()=>{let live=true;
  requestLeaderboard<Arena>('/api/xep-hang?dau-truong=1&loai=btvn-tuan&gon=1',{credentials:'omit'}).then(r=>{if(live&&r.ok&&r.data&&Array.isArray(r.data.cohorts))setItems(honorItems(r.data));}).catch(()=>{});
  return()=>{live=false;};
 },[retry]);
 if(!items.length)return null;
 const line=items.map((t,i)=><span key={i}>{t}</span>);
 return <a className="mtm-honor" href="/xep-hang" aria-label={'Bảng vinh danh tuần: '+items.join('; ')}>
  <b className="mtm-honor-tag">🔥 Vinh danh tuần</b>
  <span className="mtm-honor-track" aria-hidden="true"><span className="mtm-honor-run" style={{animationDuration:Math.max(25,items.length*5)+'s'}}>{line}{line}</span></span>
  <b className="mtm-honor-cta">Xem bảng ↗</b>
 </a>;
}
