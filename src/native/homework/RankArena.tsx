import {useEffect,useRef,useState} from 'react';
import './rank-arena.css';
import {StudentAvatar} from '../../components/StudentAppearance';
import {DEFAULT_APPEARANCE,type StudentAppearance} from '../../components/student-appearance';
import {requestLeaderboard,subscribeLeaderboardRefresh} from './leaderboard-refresh';
import type {RankRow} from './HomeLeaderboard';

/** 18/10 anh Thành: bảng xếp hạng công khai đầy đủ, "phô trương, đẹp, thích thú, muốn cạnh tranh".
 * Thứ tự anh chốt: bảng TỪNG LỚP (mọi lớp hiện sẵn, không phải bấm) rồi bảng TOÀN KHỐI kèm đua lớp. Một lượt gọi lấy cả 3 khối. */
type Row=RankRow&{schoolClass?:string};
type ClassRace={className:string;students:number;avg:number;best:number;leader:string;top:(Row&{cohortRank:number})[]};
type Cohort={cohort:string;ranked:number;perfect:number;top:Row[];classes:ClassRace[]};
const KINDS=[['btvn-tuan','BTVN tuần này'],['btvn-thang','BTVN tháng này'],['kiem-tra-thang','Kiểm tra tháng']] as const;
const fmt=(n:number)=>n.toLocaleString('vi-VN',{maximumFractionDigits:2});
const look=(row:Row):StudentAppearance=>({avatar:row.avatar??DEFAULT_APPEARANCE.avatar,photo:row.photo??''});
const place=(row:Row)=>[row.schoolClass&&'Lớp '+row.schoolClass,row.school].filter(Boolean).join(' · ');
const shortClass=(cohort:string,label:string)=>label.startsWith(cohort+' ')?label.slice(cohort.length+1):label;

/** Mốc chốt bảng theo giờ Việt Nam: tuần chốt 24:00 Chủ nhật, tháng chốt 24:00 ngày cuối tháng. */
export function closesIn(kind:string,now=Date.now()){
 const vn=new Date(now+7*3600_000),y=vn.getUTCFullYear(),m=vn.getUTCMonth(),d=vn.getUTCDate(),dow=(vn.getUTCDay()+6)%7;
 const end=kind==='btvn-tuan'?Date.UTC(y,m,d-dow+7)-7*3600_000:Date.UTC(y,m+1,1)-7*3600_000;
 const left=Math.max(0,end-now),days=Math.floor(left/86_400_000),hours=Math.floor(left%86_400_000/3_600_000),mins=Math.floor(left%3_600_000/60_000);
 return days?days+' ngày '+hours+' giờ':hours?hours+' giờ '+mins+' phút':mins+' phút';
}

function Podium({rows,small=false}:{rows:Row[];small?:boolean}){
 return <div className={'ar-podium'+(small?' ar-podium-sm':'')}>{[1,0,2].map(i=>{const row=rows[i];if(!row)return <div key={i} className="ar-step ar-step-empty" aria-hidden="true"/>;
  return <article key={row.rank} className={'ar-step ar-step-'+row.rank}>
   {row.rank===1&&<span className="ar-crown" aria-hidden="true">👑</span>}
   <div className="ar-step-avatar"><StudentAvatar appearance={look(row)} size={small?(row.rank===1?46:38):row.rank===1?64:52}/><b className="ar-medal" aria-label={'Hạng '+row.rank}>{row.rank}</b></div>
   <strong className="ar-step-name">{row.fullName||'Học sinh MTM'}</strong>
   <span className="ar-chip">{row.className}</span>
   {place(row)&&<small className="ar-step-school">{place(row)}</small>}
   <span className="ar-step-score">{fmt(row.score)}<small>/10</small></span>
   <div className="ar-plinth"><span>{row.rank===1?'Vô địch':row.rank===2?'Á quân':'Hạng ba'}</span></div>
  </article>;})}</div>;
}

function Chasers({rows}:{rows:Row[]}){
 if(!rows.length)return null;
 return <ol className="ar-list" start={rows[0].rank}>{rows.map(row=><li key={row.rank}>
  <b className="ar-list-rank">{row.rank}</b><StudentAvatar appearance={look(row)} size={28}/>
  <div className="ar-list-who"><strong>{row.fullName||'Học sinh MTM'}</strong><small>{[row.className,place(row)].filter(Boolean).join(' · ')}</small></div>
  <div className="ar-list-score"><span>{fmt(row.score)}</span><i style={{width:Math.max(4,row.score*10)+'%'}}/><small>Nộp {row.submitted}/{row.total}</small></div>
 </li>)}</ol>;
}

export default function RankArena({compact=false}:{compact?:boolean}){
 const [kind,setKind]=useState('btvn-tuan'),[data,setData]=useState<Cohort[]>([]),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 const [own,setOwn]=useState<Row|null>(null),[tick,setTick]=useState(0),[retry,setRetry]=useState(0),[flash,setFlash]=useState(0);
 const snapshot=useRef(''),latest=useRef(kind);latest.current=kind;
 useEffect(()=>subscribeLeaderboardRefresh(()=>setRetry(n=>n+1)),[]);
 useEffect(()=>{const t=setInterval(()=>setTick(n=>n+1),30_000);return()=>clearInterval(t);},[]);
 useEffect(()=>{snapshot.current='';setStatus('loading');},[kind]);
 useEffect(()=>{let live=true;
  requestLeaderboard<{enabled:boolean;cohorts:Cohort[]}>('/api/xep-hang?dau-truong=1&loai='+kind,{credentials:'omit'}).then(r=>{
   if(!live||latest.current!==kind)return;const d=r.data;if(!r.ok||!d||!Array.isArray(d.cohorts))throw Error();
   const next=JSON.stringify(d.cohorts);if(snapshot.current&&snapshot.current!==next)setFlash(n=>n+1);snapshot.current=next;
   setData(d.cohorts);setStatus('ready');
  }).catch(()=>{if(live&&latest.current===kind)setStatus(s=>s==='ready'?s:'error');});
  return()=>{live=false;};
 },[kind,retry]);
 useEffect(()=>{let live=true;
  Promise.all(['2K9','2K10','2K11'].map(khoi=>requestLeaderboard<{row:Row|null}>('/api/xep-hang-cua-em',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({khoi,loai:kind})}).catch(()=>null)))
   .then(list=>{if(live)setOwn(list.find(r=>r?.ok&&r.data?.row)?.data?.row??null);});
  return()=>{live=false;};
 },[kind,retry]);
 const ranked=data.reduce((n,c)=>n+c.ranked,0),perfect=data.reduce((n,c)=>n+c.perfect,0);
 void tick;
 return <section id="bang-xep-hang" className={'mtm-arena'+(flash?(flash%2?' ar-flash-a':' ar-flash-b'):'')} aria-labelledby="ar-title">
  <header className="ar-head">
   <div className="ar-head-text"><p className="ar-eyebrow"><span className="ar-live" aria-hidden="true"/>Cập nhật trực tiếp</p>
    <h2 id="ar-title">Đấu trường <span>MTM</span></h2>
    <p>Bảng vàng của mọi lớp. Làm BTVN đúng hạn, điểm lần nộp đầu tiên quyết định thứ hạng.</p></div>
   <div className="ar-head-side">
    <div className="ar-kinds" role="group" aria-label="Chọn kỳ xếp hạng">{KINDS.map(([id,label])=><button type="button" key={id} aria-pressed={kind===id} onClick={()=>setKind(id)}>{label}</button>)}</div>
    {kind!=='kiem-tra-thang'&&<p className="ar-countdown">⏳ Chốt bảng {kind==='btvn-tuan'?'tuần':'tháng'} sau <b>{closesIn(kind)}</b></p>}
    {status==='ready'&&<p className="ar-stats"><b>{ranked}</b> em lên bảng · <b>{perfect}</b> em đạt điểm 10</p>}
   </div>
  </header>
  {own&&<aside className="ar-own" aria-live="polite"><StudentAvatar appearance={look(own)} size={52}/><div><small>Hạng của em</small><strong>#{own.rank} {own.fullName}</strong><span>{own.className} · {fmt(own.score)}/10 · nộp {own.submitted}/{own.total}</span></div><a href="/btvn">Leo hạng ↗</a></aside>}
  {status==='loading'&&<p className="ar-note" role="status">Đang tải đấu trường…</p>}
  {status==='error'&&<p className="ar-note" role="alert">Chưa tải được bảng xếp hạng. <button type="button" onClick={()=>setRetry(n=>n+1)}>Thử lại</button></p>}
  {status==='ready'&&<>
   <h3 className="ar-section">🏫 Bảng xếp hạng từng lớp{compact&&<a href="/xep-hang">Mở Đấu trường đầy đủ ↗</a>}</h3>
   {data.map(c=><div key={c.cohort} className="ar-cohort-classes"><h4 className="ar-cohort-label">{c.cohort}</h4><div className="ar-class-grid">{c.classes.map((k,i)=>
    <article key={k.className} id={'ar-lop-'+encodeURIComponent(k.className)} className="ar-card ar-class-card" aria-label={'Bảng xếp hạng lớp '+k.className}>
     <header className="ar-card-head"><h3>{k.className}</h3><span>{k.students?(i<3&&k.students?['🥇','🥈','🥉'][i]+' ':'')+'TB '+fmt(k.avg)+' · '+k.students+' em':'Chưa có ai'}</span></header>
     {k.top.length?<><Podium rows={k.top.slice(0,3)} small/><Chasers rows={k.top.slice(3,compact?5:10)}/>{compact&&k.top.length>5&&<a className="ar-more" href={'/xep-hang#ar-lop-'+encodeURIComponent(k.className)}>Xem đủ top 10 lớp {k.className} ↗</a>}</>:<p className="ar-empty">Chưa có ai lên bảng. Nộp BTVN để giành ngôi đầu lớp! 🚀</p>}
    </article>)}</div></div>)}
   <h3 className="ar-section">🏆 Bảng xếp hạng toàn khối</h3>
   <div className="ar-grid">{data.map(c=>{const maxAvg=Math.max(10,...c.classes.map(k=>k.avg));
    return <article key={c.cohort} className="ar-card" aria-labelledby={'ar-'+c.cohort}>
     <header className="ar-card-head"><h3 id={'ar-'+c.cohort}>Khối {c.cohort}</h3><span>{c.ranked} em lên bảng{c.perfect?' · '+c.perfect+' điểm 10':''}</span></header>
     {c.top.length?<><Podium rows={c.top.slice(0,3)}/><Chasers rows={c.top.slice(3,10)}/></>:<p className="ar-empty">Chưa có ai lên bảng. Nộp BTVN sớm để giành ngôi đầu! 🚀</p>}
     {c.classes.some(k=>k.students)&&<div className="ar-race"><h4>🏁 Đua lớp <small>điểm trung bình</small></h4><ul>{c.classes.filter(k=>k.students).map((k,i)=><li key={k.className}>
      <a href={'#ar-lop-'+encodeURIComponent(k.className)} className="ar-race-row">
       <span className="ar-race-pos">{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</span>
       <span className="ar-race-name">{shortClass(c.cohort,k.className)}<small>{k.students} em · dẫn đầu: {k.leader}</small></span>
       <span className="ar-race-bar"><i style={{width:Math.max(4,k.avg/maxAvg*100)+'%'}}/></span>
       <b className="ar-race-avg">{fmt(k.avg)}</b>
      </a></li>)}</ul></div>}
    </article>;})}</div>
  </>}
  <p className="ar-foot">Xếp theo điểm trung bình lần nộp đầu của các bài trong kỳ; bằng điểm thì ai nộp nhiều bài hơn, rồi ai nộp sớm hơn đứng trên. Bài quá hạn chưa nộp tính 0. {!own&&<a href="/btvn">Vào BTVN để lên bảng ↗</a>}</p>
 </section>;
}
