import {useEffect,useState} from 'react';
import type {HomeworkState} from './btvn-contract';
import {displayClassName} from './presentation';
import {homeworkServerNow} from './asset-renewal';
import {requestLeaderboard,subscribeLeaderboardRefresh} from './leaderboard-refresh';
import {renderCertificate,type CertificateData} from '../../components/mtm-certificate';
import {BTVN_CERT_KINDS,btvnCertificate,btvnCertificateFileName,btvnCohort,type BtvnCertKind} from './btvn-certificate';
import './btvn-certificate.css';

type Earned={kind:BtvnCertKind;data:CertificateData;fileName:string};
const LABEL:Record<BtvnCertKind,string>={'btvn-tuan':'tuần','btvn-thang':'tháng'};

/** Góc học tập: em vào top 10 khối (tuần hoặc tháng) thì có nút "Nhận giấy khen". Chỉ đọc hạng của chính em qua phiên BTVN. */
export default function BtvnCertificates({state}:{state:HomeworkState}){
 const cohort=btvnCohort(state.className),classLabel=displayClassName(state);
 const [rows,setRows]=useState<Partial<Record<BtvnCertKind,unknown>>>({}),[retry,setRetry]=useState(0),[open,setOpen]=useState<BtvnCertKind|null>(null);
 useEffect(()=>subscribeLeaderboardRefresh(event=>{if(event.reason==='session'){setRows({});setOpen(null);}setRetry(n=>n+1);}),[]);
 useEffect(()=>{
  let live=true;if(!cohort){setRows({});return;}
  // Cùng body với ô "Điểm & hạng của em" nên dùng chung request đang chạy.
  Promise.all(BTVN_CERT_KINDS.map(kind=>requestLeaderboard<{enabled:boolean;row:unknown}>('/api/xep-hang-cua-em',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({khoi:cohort,loai:kind})})
   .then(r=>r.ok&&r.data?.enabled?r.data.row??null:null,()=>null)))
   .then(list=>{if(live)setRows(Object.fromEntries(BTVN_CERT_KINDS.map((kind,i)=>[kind,list[i]])));});
  return()=>{live=false;};
 },[cohort,retry,state.fullName,state.className]);
 const now=homeworkServerNow(state);
 const earned=BTVN_CERT_KINDS.flatMap((kind):Earned[]=>{const data=btvnCertificate({kind,row:rows[kind],fullName:state.fullName,classLabel,cohort,now});return data?[{kind,data,fileName:btvnCertificateFileName(kind,data.rank,now)}]:[];});
 if(!earned.length)return null;
 const shown=earned.find(e=>e.kind===open)??null;
 return <section className="btvn-cert" aria-labelledby="btvn-cert-title">
  <div className="btvn-cert-head"><span className="btvn-cert-icon" aria-hidden="true">🏅</span><div><h2 id="btvn-cert-title">Em đang trong top 10 bảng xếp hạng BTVN!</h2><p>{earned.map(e=>'Hạng '+e.data.rank+' '+LABEL[e.kind]+' này').join(' · ')} · khối {cohort}. MTM gửi em giấy khen điện tử.</p></div></div>
  <div className="btvn-cert-actions">{earned.map(e=><button type="button" key={e.kind} className={'btvn-cert-btn'+(open===e.kind?' is-on':'')} aria-expanded={open===e.kind} aria-controls="btvn-cert-panel" onClick={()=>setOpen(o=>o===e.kind?null:e.kind)}>Nhận giấy khen {LABEL[e.kind]}</button>)}</div>
  {shown&&<div id="btvn-cert-panel"><CertificatePanel key={shown.kind} earned={shown}/></div>}
 </section>;
}

function CertificatePanel({earned}:{earned:Earned}){
 const {data,fileName}=earned;
 const [png,setPng]=useState<{blob:Blob;url:string}|null>(null),[failed,setFailed]=useState(false),[note,setNote]=useState('');
 const key=JSON.stringify(data);
 useEffect(()=>{let alive=true,url='';setPng(null);setFailed(false);renderCertificate(JSON.parse(key)).then(blob=>{url=URL.createObjectURL(blob);if(alive)setPng({blob,url});else URL.revokeObjectURL(url);},()=>{if(alive)setFailed(true);});return()=>{alive=false;if(url)URL.revokeObjectURL(url);};},[key]);
 const file=png&&typeof File!=='undefined'?new File([png.blob],fileName,{type:'image/png'}):null;
 const canShare=!!file&&typeof navigator!=='undefined'&&typeof navigator.canShare==='function'&&(()=>{try{return navigator.canShare({files:[file]});}catch{return false;}})();
 const download=()=>{if(!png)return;const a=document.createElement('a');a.href=png.url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();setNote('Đã tải giấy khen về máy.');};
 const share=async()=>{if(!file)return;try{await navigator.share({files:[file],title:'Giấy khen BTVN · MTM',text:data.achievementTitle+' tại minhthanhmath.vn'});}catch(e){if((e as Error)?.name!=='AbortError')setNote('Chưa chia sẻ được. Em tải ảnh về rồi gửi nhé.');}};
 if(failed)return <p className="btvn-cert-note" role="status">Chưa tạo được giấy khen trên máy này. Em thử lại bằng trình duyệt khác nhé.</p>;
 return <div className="btvn-cert-panel">
  {png?<img className="btvn-cert-preview" src={png.url} width={1080} height={1350} alt={'Giấy khen: '+data.name+', '+data.achievementTitle}/>:<p className="btvn-cert-wait" role="status">Đang tạo giấy khen…</p>}
  <div><p className="btvn-cert-meta">Ảnh chỉ có tên, lớp, điểm trung bình và hạng của em. Hạng tính đến hôm nay; bảng {earned.kind==='btvn-tuan'?'tuần chốt 24:00 Chủ nhật':'tháng chốt 24:00 ngày cuối tháng'}.</p>
   <p className="btvn-cert-row"><button type="button" className="btvn-cert-btn is-primary" onClick={download} disabled={!png}>Tải giấy khen</button>{canShare&&<button type="button" className="btvn-cert-btn" onClick={()=>void share()}>Chia sẻ ảnh</button>}</p>
   {note&&<p className="btvn-cert-note" role="status">{note}</p>}</div>
 </div>;
}
