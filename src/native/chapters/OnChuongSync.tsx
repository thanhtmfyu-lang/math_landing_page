import {useEffect,useState} from 'react';
import {Link} from '../../migration/navigation';
import {readDraft,readHistory,type Draft} from '../exams/store';
import {localStore} from '../exams/local-store';
import type {PracticeExam} from '../exams/data';
import {chapterIds,readItems} from './practice-loader';

/** 29/10/2026 (anh Thành): 2K9 XPS bắt buộc làm 22 đề ôn 3 chương xác suất, hạn hết CN 08/11, tính như điểm danh.
 * Bài nộp vẫn lưu trên trình duyệt như mọi đề luyện; khi em đã đăng nhập tài khoản học sinh, trang tự gửi từng lượt
 * đã nộp về máy chủ (máy chủ tự chấm lại). Chưa đăng nhập thì giữ lượt, đăng nhập rồi mở lại trang là gửi bù. */
export const ON_CHUONG_HAN='hết Chủ nhật 08/11';
export const ON_CHUONG_SCOPES:readonly string[]=['10:8','10:9','11:8'];
const SENT_KEY='mtm:on-chuong:sent:v1';
type Status={kind:'idle'}|{kind:'login'}|{kind:'ok';ten:string;done:number;total:number}|{kind:'error'};
const readSent=():string[]=>{try{const v=JSON.parse(localStore()?.getItem(SENT_KEY)??'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string').slice(-400):[];}catch{return [];}};
const writeSent=(ids:string[])=>{try{localStore()?.setItem(SENT_KEY,JSON.stringify(ids.slice(-400)));}catch{/* chỉ là tiện ích */}};
async function call(body:Record<string,unknown>){
  const r=await fetch('/api/btvn',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  return {status:r.status,data:await r.json().catch(()=>null) as Record<string,unknown>|null};
}
function submitted(exams:readonly PracticeExam[]):{exam:PracticeExam;draft:Draft}[]{
  const store=localStore(),items=readHistory(store,exams).items;
  for(const exam of exams){const d=readDraft(store,exam);if(d.ok&&d.value?.submittedAt!=null&&!items.some(i=>i.draft.attemptId===d.value!.attemptId))items.push({exam,draft:d.value});}
  return items.filter(i=>i.draft.submittedAt!=null);
}
let running:Promise<Status>|null=null;
/** Gửi các lượt chưa gửi; trả trạng thái mới nhất. Mỗi lúc chỉ một vòng. */
export function syncOnChuong(exams:readonly PracticeExam[]):Promise<Status>{
  running??=(async():Promise<Status>=>{
    try{
      const sent=readSent();let last:Status={kind:'idle'};
      for(const {exam,draft} of submitted(exams)){
        if(sent.includes(draft.attemptId))continue;
        const r=await call({action:'on-chuong-ghi',examId:exam.id,examVersionHash:exam.versionHash,attemptId:draft.attemptId,answers:draft.answers});
        if(r.status===200&&r.data?.status==='login')return {kind:'login'};
        // 400/409: bản lưu không còn khớp đề, bỏ qua để không gửi lặp mãi.
        if(r.status===200&&r.data?.status==='ok'||r.status===400||r.status===409){sent.push(draft.attemptId);writeSent(sent);}
        if(r.status===200&&r.data?.status==='ok')last={kind:'ok',ten:String(r.data.ten??''),done:Number(r.data.done),total:Number(r.data.total)};
        else if(r.status>=500)return {kind:'error'};
      }
      if(last.kind==='ok')return last;
      const r=await call({action:'on-chuong-cua-em'});
      if(r.status===200&&r.data?.status==='login')return {kind:'login'};
      if(r.status===200&&r.data?.status==='ok')return {kind:'ok',ten:String(r.data.ten??''),done:Array.isArray(r.data.done)?r.data.done.length:0,total:Number(r.data.total)};
      return {kind:'error'};
    }catch{return {kind:'error'};}
    finally{running=null;}
  })();
  return running;
}

/** Khung trên trang chương và trang làm bài của 3 chương xác suất; nạp đủ 22 đề để gửi bù mọi lượt. */
export default function OnChuongPanel(){
  const items=readItems('on-chuong-xs',ON_CHUONG_SCOPES.flatMap(k=>{const [t,c]=k.split(':');return chapterIds(t,c);}));
  const [exams]=useState(()=>items.map(p=>p.exam));
  return <OnChuongSync exams={exams}/>;
}

function OnChuongSync({exams}:{exams:readonly PracticeExam[]}){
  const [status,setStatus]=useState<Status>({kind:'idle'});
  useEffect(()=>{
    let alive=true;
    const tick=()=>{void syncOnChuong(exams).then(s=>{if(alive)setStatus(s);});};
    tick();const timer=setInterval(tick,15000);
    const onFocus=()=>tick();addEventListener('focus',onFocus);
    return ()=>{alive=false;clearInterval(timer);removeEventListener('focus',onFocus);};
  },[exams]);
  return <aside className="cp-on-chuong mig-panel" aria-live="polite">
    <p><strong>Bài bắt buộc lớp 12 (2K9 XPS):</strong> làm đủ 22 đề của 3 chương xác suất ({ON_CHUONG_HAN}). Bài được tính như điểm danh; em nào chưa làm đủ sẽ chưa được học tiếp chương xác suất.</p>
    {status.kind==='ok'?<p>Đã ghi nhận cho <strong>{status.ten}</strong>: {status.done}/{status.total} đề.</p>
    :status.kind==='login'?<p>Em chưa đăng nhập nên bài chưa được ghi nhận. <Link href="/btvn">Đăng nhập ở trang BTVN</Link> (chọn Nhớ đăng nhập) rồi quay lại trang này, các bài em đã nộp trên máy này sẽ tự được gửi.</p>
    :status.kind==='error'?<p>Chưa kết nối được máy chủ. Bài em nộp vẫn được giữ trên máy và sẽ tự gửi lại khi mở lại trang.</p>
    :<p>Đang kiểm tra bài đã ghi nhận…</p>}
  </aside>;
}
