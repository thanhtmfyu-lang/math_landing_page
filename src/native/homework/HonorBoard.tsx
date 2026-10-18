import {useEffect,useState} from 'react';
import './rank-arena.css';
import './honor-board.css';
import {StudentAvatar} from '../../components/StudentAppearance';
import {requestLeaderboard,subscribeLeaderboardRefresh} from './leaderboard-refresh';
import {closesIn,fmt,look,place,type Row} from './RankArena';

/** 18/10 anh Thành: trang chủ phải thấy "Hiểu bản chất" trước; bảng xếp hạng gọn nhưng vẫn to, tự hào:
 * top 3 mỗi khối có ảnh mặt + trường, học sinh đã đăng nhập thấy hạng của mình. Bảng từng lớp ở /xep-hang. */
type Cohort={cohort:string;ranked:number;perfect:number;top:Row[]};
export default function HonorBoard(){
 const [data,setData]=useState<Cohort[]>([]),[own,setOwn]=useState<Row|null>(null),[retry,setRetry]=useState(0);
 useEffect(()=>subscribeLeaderboardRefresh(()=>setRetry(n=>n+1)),[]);
 useEffect(()=>{let live=true;
  requestLeaderboard<{cohorts:Cohort[]}>('/api/xep-hang?dau-truong=1&loai=btvn-tuan&gon=1',{credentials:'omit'}).then(r=>{if(live&&r.ok&&r.data&&Array.isArray(r.data.cohorts))setData(r.data.cohorts);}).catch(()=>{});
  Promise.all(['2K9','2K10','2K11'].map(khoi=>requestLeaderboard<{row:Row|null}>('/api/xep-hang-cua-em',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({khoi,loai:'btvn-tuan'})}).catch(()=>null)))
   .then(list=>{if(live)setOwn(list.find(r=>r?.ok&&r.data?.row)?.data?.row??null);});
  return()=>{live=false;};
 },[retry]);
 const shown=data.filter(c=>c.top.length);
 if(!shown.length)return null;
 const face=(row:Row,big:boolean)=><figure key={row.rank} className={'hs-face hs-face-'+row.rank}>
  <span className="hs-pic">{row.rank===1&&<b className="hs-crown" aria-hidden="true">👑</b>}<StudentAvatar appearance={look(row)} size={big?84:64}/><i aria-label={'Hạng '+row.rank}>{row.rank}</i></span>
  <figcaption><strong>{row.fullName||'Học sinh MTM'}</strong>{place(row)&&<small>{place(row)}</small>}<em>{fmt(row.score)}</em></figcaption>
 </figure>;
 return <section id="bang-xep-hang" className="mtm-arena mtm-honorstrip" aria-labelledby="hb-title">
  <div className="hs-side">
   <h2 id="hb-title"><span aria-hidden="true">🏆</span> Bảng xếp hạng <em>BTVN tuần này</em></h2>
   <p className="hs-meta"><span className="ar-live" aria-hidden="true"/>{shown.reduce((n,c)=>n+c.ranked,0)} em lên bảng · chốt sau <b>{closesIn('btvn-tuan')}</b></p>
   {own?<a className="hs-own" href="/xep-hang"><StudentAvatar appearance={look(own)} size={30}/><span>Hạng của em: <b>#{own.rank}</b> · {fmt(own.score)}đ</span></a>:<a className="hs-join" href="/btvn">Làm BTVN để có tên trên bảng →</a>}
  </div>
  <div className="hs-cohorts">{shown.map(c=><article key={c.cohort} className="hs-card" aria-label={'Top 3 khối '+c.cohort}>
   <h3>{c.cohort}</h3>
   <div className="hs-faces">{[1,0,2].map(i=>c.top[i]?face(c.top[i],i===0):<span key={i} className="hs-face"/>)}</div>
   <a className="hs-go" href={'/xep-hang#ar-khoi-'+c.cohort}>Xem bảng xếp hạng khối {c.cohort} ↗</a>
  </article>)}</div>
 </section>;
}
