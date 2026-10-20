import {lazy,Suspense,useCallback,useEffect,useState} from 'react';
import {ResultShareCard} from '../../components/ResultShareCard';
import {Link} from '../../migration/navigation';
import R106PageIntro from '../../migration/R106PageIntro';
import {ZALO_ASSISTANT_URL} from '../../components/mtm-contact';
import {RegisterSection} from '../../components/RegisterSection';
import {requestRegistration} from '../../components/registration-context';
import PracticeAttempt from './PracticeAttempt';
import {localStore} from './local-store';
import {readDraft,type Draft} from './store';
import {resultFor} from './result';
import {readRemote,type RemoteResult} from './server-attempt';
import type {PracticeExam} from './data';
import GiuaKyReader,{gkRich} from './GiuaKyReader';
import {GK1_GRADES,GK1_MA,GK1_PAPERS,formatGk1Score,gk1Gaps,gk1Interest,gk1Paper,gk1Url,parseGk1Grade,parseGk1Ma,type Gk1Grade,type Gk1Ma,type Gk1Paper,type Gk1Topic} from './de-giua-ky';
import './exams.css';
import './de-giua-ky.css';
const ServerExamAttempt=lazy(()=>import('./ServerExamAttempt'));

type Rows={id:string;earnedMillipoints:number|null;maxMillipoints:number}[];
type Outcome={score:number;elapsedMs:number;rows:Rows};
type PublicPaper={exam:PracticeExam;topics:Record<string,Gk1Topic>};
/** Bản công khai: câu hỏi + chủ đề/mức độ từng câu, không đáp án, không lời giải. */
const PAPER_PUBLIC=import.meta.glob<PublicPaper>('./de-giua-ky/*.public.json',{import:'default'});
/** Bản có đáp án và lời giải, chỉ để chấm trên trình duyệt khi chưa có máy chủ chấm (máy dev, bản xem thử).
 * Build với VITE_HSA_KEY_IN_BUNDLE=0 (đang đặt trên production) thì tệp này không vào bản build: bài chấm bằng
 * mtm_exam_start / mtm_exam_submit (migration 060 + 072 seed khóa đề). */
const PAPER_KEYS:Record<string,()=>Promise<PracticeExam>>=import.meta.env.VITE_HSA_KEY_IN_BUNDLE==='0'?{}:import.meta.glob<PracticeExam>('./de-giua-ky/*.key.json',{import:'default'});
async function loadPublic(paper:Gk1Paper){const load=PAPER_PUBLIC['./de-giua-ky/'+paper.examId+'.public.json'];if(!load)throw Error('missing');const p=await load();if(p.exam.id!==paper.examId)throw Error('missing');return p;}
async function loadKey(paper:Gk1Paper,pub:PracticeExam){const load=PAPER_KEYS['./de-giua-ky/'+paper.examId+'.key.json'];if(!load)return null;const exam=await load();if(exam.id!==pub.id||exam.versionHash!==pub.versionHash)throw Error('version');return exam;}
function localOutcome(exam:PracticeExam,draft:Draft|null):Outcome|null{
 if(!draft||draft.submittedAt===null)return null;const score=resultFor(exam,draft)?.score;if(!score?.ok)return null;
 return {score:score.finalMillipoints??score.earnedMillipoints,elapsedMs:Math.max(0,Math.min(draft.submittedAt,draft.deadline)-draft.startedAt),rows:score.rows};
}
const remoteOutcome=(r:RemoteResult):Outcome=>({score:r.score.ok?r.score.finalMillipoints??r.score.earnedMillipoints:0,elapsedMs:Math.max(0,Math.min(r.submittedAt,r.deadline)-r.startedAt),rows:r.score.ok?r.score.rows:[]});
const LEVEL:Record<Gk1Topic['mucDo'],string>={NB:'Nhận biết',TH:'Thông hiểu',VD:'Vận dụng',VDC:'Vận dụng cao'};
const scrollToRegister=()=>document.getElementById('register')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});

function MaPicker({grade,current}:{grade:Gk1Grade;current:Gk1Ma}){
 return <nav className="gk1-ma" aria-label="Chọn mã đề">
  {GK1_MA.map(m=><Link key={m} href={gk1Url(grade,m)} className="gk1-ma-link" aria-current={current===m?'page':undefined}>Đề {m}</Link>)}
 </nav>;
}

function GradePicker({current}:{current:Gk1Grade|null}){
 return <nav className={'gk1-picker'+(current?' is-compact':'')} aria-label="Chọn lớp">
  {GK1_GRADES.map(g=>{const p=GK1_PAPERS[g];return <Link key={g} href={gk1Url(g)} className={'gk1-grade tone-'+p.tone} aria-current={current===g?'page':undefined}>
   <span className="gk1-grade-num" aria-hidden="true">{g}</span>
   <span className="gk1-grade-text"><strong>Toán {g}</strong>{!current&&<small>{p.scope}</small>}<em>{current===g?'Đang làm':'Làm đề lớp '+g+' →'}</em></span>
  </Link>;})}
 </nav>;
}

const PARTS:[string,string,string][]=[['Phần I','12 câu trắc nghiệm 4 phương án','Mỗi câu đúng 0,25 điểm'],['Phần II','4 câu đúng/sai, mỗi câu 4 ý','Đúng 1 ý 0,1 · 2 ý 0,25 · 3 ý 0,5 · cả 4 ý 1 điểm'],['Phần III','6 câu trả lời ngắn','Mỗi câu đúng 0,5 điểm']];
function Overview(){
 return <section className="gk1-card gk1-overview" aria-labelledby="gk1-how">
  <h2 id="gk1-how">Cấu trúc đề theo định dạng mới của Bộ GD&amp;ĐT</h2>
  <ol className="gk1-parts">{PARTS.map(([n,what,pts],i)=><li key={n} className={'is-part-'+(i+1)}><strong>{n}</strong><span>{what}</span><small>{pts}</small></li>)}</ol>
  <h2>Làm đề trên web thế nào?</h2>
  <ol className="gk1-steps"><li><strong>Chọn lớp</strong> ở trên và bấm Bắt đầu. Đồng hồ 90 phút chỉ chạy khi em bấm.</li><li><strong>Nộp bài</strong> để xem điểm thang 10, đúng sai từng câu, từng ý.</li><li><strong>Đọc lời giải chi tiết</strong> và 3 chỗ cần vá trước ngày kiểm tra.</li></ol>
  <p className="gk1-muted">Bài làm lưu trên trình duyệt của em. Không cần đăng nhập, không cần để lại số điện thoại để làm bài.</p>
 </section>;
}

function ResultCard({paper,outcome,topics}:{paper:Gk1Paper;outcome:Outcome;topics:Record<string,Gk1Topic>}){
 const gaps=gk1Gaps(outcome.rows,topics),scoreText=formatGk1Score(outcome.score),minutes=Math.floor(outcome.elapsedMs/60000),timeText=minutes<1?'dưới 1 phút':minutes+' phút';
 const register=()=>{requestRegistration({grade:String(paper.grade),interest:gk1Interest(paper.grade,scoreText,gaps)});scrollToRegister();};
 return <section className="gk1-card gk1-result" aria-live="polite" aria-labelledby="gk1-result-title">
  <div className="gk1-result-head"><p className="gk1-score"><strong>{scoreText}</strong><span>/10 điểm</span></p><div><h2 id="gk1-result-title">Kết quả đề giữa kỳ I Toán {paper.grade}</h2><p className="gk1-muted">Thời gian làm: {timeText}. Lời giải chi tiết từng câu nằm ngay bên dưới phần kết quả.</p></div></div>
  {gaps.length?<><h3>3 chỗ cần vá trước ngày kiểm tra</h3><ol className="gk1-gaps">{gaps.map(g=><li key={g.chuDe}><span>{g.chuDe}</span><small>{LEVEL[g.mucDo]}</small></li>)}</ol></>:<p className="gk1-perfect">Em làm đúng toàn bộ đề. Giữ phong độ này đến ngày kiểm tra nhé!</p>}
  <ResultShareCard dot={'Đề giữa kỳ I Toán '+paper.grade+' · MTM'} scoreText={scoreText} url="https://minhthanhmath.vn/de-giua-ky-1" fileName={'ket-qua-giua-ky-1-toan-'+paper.grade+'.png'}/>
  <div className="gk1-cta"><p><strong>Muốn vá những chỗ này trước ngày thi?</strong> MTM có kiểm tra đầu vào miễn phí và buổi học thử đầu tiên. Gửi điểm qua Zalo để thầy xem bài cùng em.</p>
   <div className="gk1-actions"><button type="button" className="gk1-primary" onClick={register}>Đăng ký kiểm tra đầu vào miễn phí</button><a className="gk1-zalo" href={ZALO_ASSISTANT_URL} target="_blank" rel="noopener noreferrer">Nhắn Zalo 0967 365 413</a></div></div>
 </section>;
}

function Room({paper}:{paper:Gk1Paper}){
 const [pub,setPub]=useState<PublicPaper|null>(null),[exam,setExam]=useState<PracticeExam|null>(null),[mode,setMode]=useState<'local'|'server'|null>(null);
 const [loadError,setLoadError]=useState(false),[noKey,setNoKey]=useState(false),[outcome,setOutcome]=useState<Outcome|null>(null);
 useEffect(()=>{let alive=true;loadPublic(paper).then(p=>{if(alive)setPub(p);},()=>{if(alive)setLoadError(true);});return()=>{alive=false;};},[paper]);
 // Có máy chủ chấm (Supabase công khai) thì làm bài trên máy chủ với bản không đáp án; không có thì chấm trên trình duyệt nếu bản build có khóa đề.
 useEffect(()=>{void import('../admin/backend').then(m=>setMode(m.backend()?'server':'local'),()=>setMode('local'));},[]);
 useEffect(()=>{if(!pub||!mode)return;let alive=true;if(mode==='server'){setExam(pub.exam);return;}
  loadKey(paper,pub.exam).then(e=>{if(!alive)return;if(e)setExam(e);else setNoKey(true);},()=>{if(alive)setLoadError(true);});return()=>{alive=false;};},[paper,pub,mode]);
 // Bài đã nộp từ lượt trước: hiện lại điểm và chỗ cần vá.
 useEffect(()=>{if(!exam||!mode)return;const store=localStore();
  if(mode==='server'){const a=readRemote(store,exam);if(a?.result){setOutcome(remoteOutcome(a.result));return;}}
  const d=readDraft(store,exam);if(d.ok&&mode==='local')setOutcome(localOutcome(exam,d.value));
 },[exam,mode]);
 const done=useCallback((o:Outcome|null)=>{if(o)setOutcome(o);},[]);
 const attemptProps={questionReader:exam?<GiuaKyReader exam={exam}/>:undefined,renderText:gkRich,displayTitle:exam?.title,contextLabel:'Đề giữa kỳ I'};
 return <div className="gk1-room">
  {outcome&&pub&&<ResultCard paper={paper} outcome={outcome} topics={pub.topics}/>}
  {noKey&&!loadError?<section className="gk1-card" role="status"><h2>Chưa mở chấm bài</h2><p>Phòng thi đề này đang chờ máy chủ chấm điểm. Em quay lại sau ít phút hoặc nhắn Zalo 0967 365 413 để nhận đề PDF nhé.</p></section>
  :loadError?<section className="gk1-card" role="alert"><h2>Chưa mở được đề</h2><p>Kết nối có thể đã gián đoạn. Em tải lại trang để thử lại.</p></section>
  :!exam||!mode?<p className="gk1-card" role="status">Đang chuẩn bị phòng thi…</p>
  :mode==='server'?<Suspense fallback={<p className="gk1-card" role="status">Đang chuẩn bị phòng thi…</p>}><ServerExamAttempt key={exam.id} exam={exam} catalogUrl={gk1Url(paper.grade)} attemptProps={attemptProps} onResult={(_a,r)=>done(remoteOutcome(r))}/></Suspense>
  :<PracticeAttempt key={exam.id} kind="exam" exam={exam} catalogUrl={gk1Url(paper.grade)} {...attemptProps} onServerSubmit={async d=>{done(localOutcome(exam,d));}}/>}
 </div>;
}

export default function DeGiuaKy({search}:{search:string}){
 const grade=parseGk1Grade(search),ma=parseGk1Ma(search);
 return <div className="gk1-page ep-root">
  <R106PageIntro className="gk1-intro" eyebrow="MINH THÀNH MATH · MIỄN PHÍ" title={<>Đề giữa kỳ I Toán 10, 11, 12 <span className="gk1-hl">có lời giải</span></>} description={<><p>Đề ôn luyện giữa kỳ I năm học 2026–2027 do MTM biên soạn theo cấu trúc đề kiểm tra mới: 22 câu, 90 phút, thang 10 điểm. Làm ngay trên web, nộp bài là có điểm, lời giải chi tiết từng câu và 3 chỗ cần vá.</p><p>Mỗi câu đã được tổ soạn đề tính lại độc lập trước khi phát.</p></>}>
   <ul className="gk1-facts"><li><strong>22</strong><span>câu</span></li><li><strong>90</strong><span>phút</span></li><li><strong>10</strong><span>điểm</span></li></ul>
  </R106PageIntro>
  <GradePicker current={grade}/>
  {grade&&<MaPicker grade={grade} current={ma}/>}
  {grade?<Room key={grade+'-'+ma} paper={gk1Paper(grade,ma)}/>:<Overview/>}
  <p className="gk1-more">Ôn thêm: <Link href="/thi-thu">Thi thử Toán theo lớp</Link> · <Link href="/luyen-tap">Luyện tập theo chương</Link> · Hotline và Zalo <a href="tel:0967365413">0967 365 413</a></p>
  <RegisterSection/>
 </div>;
}
