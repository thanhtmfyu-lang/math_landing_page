import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import {Link} from '../../migration/navigation';
import R106PageIntro from '../../migration/R106PageIntro';
import {ZALO_ASSISTANT_URL} from '../../components/mtm-contact';
import {describeLeadSource,storedLeadSource} from '../../components/lead-source';
import PracticeAttempt from './PracticeAttempt';
import {localStore} from './local-store';
import {readDraft,type Draft} from './store';
import {resultFor} from './result';
import {readRemote,type RemoteAttempt,type RemoteResult} from './server-attempt';
import type {PracticeExam} from './data';
import {QuestionReader,ExtraSolution,rich} from '../chapters/ChapterPractice';
import HsaPaperReader,{HsaSolutionExtra,hsaRich,type HsaGroup} from './HsaPaperReader';
import {HSA_MOCK_EXAMS,hsaMockExam,hsaLeadPayload,normalizeHsaPhone,type HsaMockExam} from './hsa-mock';
import {HSA_GRADES,HSA_GRADE_LABEL,formatHsaDuration,formatHsaScore,hsaStatusMessage,isHsaGrade,sanitizeDisplayName,type HsaGrade,type HsaRankRow,type HsaSubmitStatus} from '../../../server/hsa/rank';
import './exams.css';
import './hsa-mock.css';
const ServerExamAttempt=lazy(()=>import('./ServerExamAttempt'));

type Entry={name:string;grade:HsaGrade;phone:string;consent:true};
type Board={state:'loading'|'off'|'on'|'error';open:boolean;rows:HsaRankRow[]};
type RankState={status:HsaSubmitStatus;rank:number|null}|{status:'pending'|'error';message?:string};
type Outcome={attemptId:string;score:number;elapsedMs:number;server:boolean};
const ENTRY_KEY='mtm:hsa:entry:v1',DEVICE_KEY='mtm:hsa:device:v1',rankKey=(id:string)=>'mtm:hsa:rank:v1:'+id,leadKey=(examId:string)=>'mtm:hsa:lead:v1:'+examId;
const read=(key:string)=>{try{return localStore()?.getItem(key)??null;}catch{return null;}};
const write=(key:string,value:string)=>{try{localStore()?.setItem(key,value);}catch{/* trình duyệt chặn lưu thì vẫn làm bài được */}};
function readEntry():Entry|null{try{const e=JSON.parse(read(ENTRY_KEY)??'null');return e&&typeof e.name==='string'&&sanitizeDisplayName(e.name)===e.name&&isHsaGrade(e.grade)&&typeof e.phone==='string'&&e.consent===true?e:null;}catch{return null;}}
function deviceId(){let id=read(DEVICE_KEY);if(!id||!/^[a-f0-9]{32}$/.test(id)){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);id=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');write(DEVICE_KEY,id);}return id;}
/** Điểm hiển thị theo thang của đề (đề HSA thật: thang 50, mỗi câu đúng 1 điểm); bộ chấm luôn tính trên 10 000 phần nghìn. */
const onScale=(millipoints:number,scale:number)=>Math.round(millipoints)*scale/10000;
const scoreTextFor=(scale:number)=>(millipoints:number)=>scale===10?formatHsaScore(millipoints/1000)+'/10':formatHsaScore(onScale(millipoints,scale))+'/'+scale+' (quy ra '+formatHsaScore(millipoints/1000)+'/10)';
function localOutcome(exam:PracticeExam,draft:Draft|null):Outcome|null{
 if(!draft||draft.submittedAt===null)return null;const score=resultFor(exam,draft)?.score;if(!score?.ok)return null;
 return {attemptId:draft.attemptId,score:score.finalMillipoints??score.earnedMillipoints,elapsedMs:Math.max(0,Math.min(draft.submittedAt,draft.deadline)-draft.startedAt),server:false};
}
const remoteOutcome=(r:RemoteResult):Outcome=>({attemptId:r.attemptId,score:r.score.ok?r.score.finalMillipoints??r.score.earnedMillipoints:0,elapsedMs:Math.max(0,Math.min(r.submittedAt,r.deadline)-r.startedAt),server:true});

type HsaPaperPublic={exam:PracticeExam;groups:HsaGroup[];scale:number};
/** Bản công khai của đề HSA thật: chỉ câu hỏi và dữ liệu chùm, không đáp án. */
const PAPER_PUBLIC=import.meta.glob<HsaPaperPublic>('./hsa-papers/*.public.json',{import:'default'});
/** Bản có đáp án và lời giải, chỉ dùng khi chấm trên trình duyệt (bảng xếp hạng chưa mở).
 * Build với VITE_HSA_KEY_IN_BUNDLE=0 thì tệp này không vào bản build: chỉ đặt khi máy chủ chấm đề (migration 069) đã chạy. */
const PAPER_KEYS:Record<string,()=>Promise<PracticeExam>>=import.meta.env.VITE_HSA_KEY_IN_BUNDLE==='0'?{}:import.meta.glob<PracticeExam>('./hsa-papers/*.key.json',{import:'default'});
type Paper={exam:PracticeExam;groups:HsaGroup[]};
/** Đề để hiện số câu, thời gian và chơi ở chế độ máy chủ (với hsa-paper: bản không đáp án). */
async function loadPaper(cfg:HsaMockExam):Promise<Paper>{
 if(cfg.source==='hsa-paper'){const load=PAPER_PUBLIC['./hsa-papers/'+cfg.examId+'.public.json'];if(!load)throw Error('missing');const p=await load();if(p.exam.id!==cfg.examId)throw Error('missing');return {exam:p.exam,groups:p.groups};}
 return {exam:await loadExam(cfg),groups:[]};
}
/** Đề có đáp án để chấm trên trình duyệt; null khi bản build không chứa đáp án. */
async function loadLocalExam(cfg:HsaMockExam,paper:Paper):Promise<PracticeExam|null>{
 if(cfg.source!=='hsa-paper')return paper.exam;
 const load=PAPER_KEYS['./hsa-papers/'+cfg.examId+'.key.json'];if(!load)return null;const exam=await load();
 if(exam.id!==paper.exam.id||exam.versionHash!==paper.exam.versionHash)throw Error('version');return exam;
}
async function loadExam(cfg:HsaMockExam):Promise<PracticeExam>{
 if(cfg.source==='practice-bank'){const {loaders}=await import('../chapters/generated-bank');const load=loaders[cfg.examId];if(!load)throw Error('missing');return (await load()).exam;}
 const {PRACTICE_EXAMS}=await import('./data');const exam=PRACTICE_EXAMS.find(e=>e.id===cfg.examId);if(!exam)throw Error('missing');return exam;
}
function useBoard(examId:string){
 const [board,setBoard]=useState<Board>({state:'loading',open:false,rows:[]});
 const refresh=useCallback(async()=>{try{const r=await fetch('/api/hsa-xep-hang?de='+encodeURIComponent(examId),{headers:{Accept:'application/json'}});const data=await r.json();
  if(r.ok&&data?.enabled===false)return setBoard({state:'off',open:false,rows:[]});if(!r.ok||data?.enabled!==true||!Array.isArray(data.rows))throw Error();setBoard({state:'on',open:data.open===true,rows:data.rows});}
  catch{setBoard(b=>({...b,state:b.state==='on'?'on':'error'}));}},[examId]);
 useEffect(()=>{void refresh();},[refresh]);
 return {board,refresh};
}

function EntryForm({initial,onSave,onCancel}:{initial:Entry|null;onSave:(e:Entry)=>void;onCancel?:()=>void}){
 const [name,setName]=useState(initial?.name??''),[grade,setGrade]=useState<HsaGrade|''>(initial?.grade??''),[phone,setPhone]=useState(initial?.phone??''),[consent,setConsent]=useState(!!initial),[error,setError]=useState('');
 const errorRef=useRef<HTMLParagraphElement>(null);useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
 const submit=(event:React.FormEvent)=>{event.preventDefault();setError('');
  const clean=sanitizeDisplayName(name);if(!clean)return setError('Tên hiển thị cần 2–24 ký tự, không chứa số điện thoại, đường dẫn hay từ ngữ không phù hợp.');
  if(!grade)return setError('Em chọn lớp đang học.');
  let normalized='';try{normalized=normalizeHsaPhone(phone);}catch(e){return setError(e instanceof Error?e.message:'Số điện thoại chưa đúng.');}
  if(!consent)return setError('Em cần đồng ý với cách MTM dùng thông tin trước khi vào thi.');
  onSave({name:clean,grade,phone:normalized,consent:true});};
 return <form className="hsa-card hsa-entry" onSubmit={submit} noValidate aria-labelledby="hsa-entry-title">
  <h2 id="hsa-entry-title">Thông tin trước khi vào thi</h2>
  <label className="hsa-field"><span>Tên hiển thị trên bảng xếp hạng *</span><input value={name} onChange={e=>setName(e.target.value)} maxLength={40} autoComplete="nickname" required aria-describedby="hsa-name-help"/><small id="hsa-name-help">Có thể dùng biệt danh. Tên hiện công khai, tối đa 24 ký tự.</small></label>
  <fieldset className="hsa-field hsa-grades"><legend>Lớp *</legend><div>{HSA_GRADES.map(g=><label key={g} className={'hsa-grade'+(grade===g?' is-on':'')}><input type="radio" name="hsa-grade" value={g} checked={grade===g} onChange={()=>setGrade(g)}/>{HSA_GRADE_LABEL[g]}</label>)}</div></fieldset>
  <label className="hsa-field"><span>Số điện thoại (không bắt buộc, nên có)</span><input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={20} aria-describedby="hsa-phone-help"/><small id="hsa-phone-help">Để MTM gửi kết quả chi tiết và tư vấn. Số điện thoại không bao giờ hiện trên bảng xếp hạng.</small></label>
  <label className="hsa-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/><span>Em đồng ý hiển thị tên hiển thị, lớp và điểm trên bảng xếp hạng; MTM chỉ dùng số điện thoại (nếu có) để gửi kết quả và tư vấn theo <Link href="/chinh-sach-bao-mat">Chính sách quyền riêng tư</Link>.</span></label>
  {error&&<p ref={errorRef} tabIndex={-1} className="hsa-error" role="alert">{error}</p>}
  <div className="hsa-actions"><button type="submit" className="hsa-primary">{initial?'Lưu thông tin':'Vào phòng thi'}</button>{onCancel&&<button type="button" className="hsa-ghost" onClick={onCancel}>Hủy</button>}</div>
 </form>;
}

function Leaderboard({board,refresh,title,scale}:{board:Board;refresh:()=>void;title:string;scale:number}){
 return <section className="hsa-card hsa-board" aria-labelledby="hsa-board-title">
  <div className="hsa-board-head"><h2 id="hsa-board-title">Bảng xếp hạng</h2><span>{title}{scale!==10?' · thang '+scale+' điểm':''}</span></div>
  {board.state==='loading'?<p role="status">Đang tải bảng xếp hạng…</p>
  :board.state==='off'?<p className="hsa-soon" role="status">Bảng xếp hạng sẽ mở sớm. Em vẫn làm bài, xem điểm và lời giải như bình thường.</p>
  :board.state==='error'?<p role="status">Chưa tải được bảng xếp hạng. <button type="button" className="hsa-ghost" onClick={refresh}>Thử lại</button></p>
  :!board.open?<p className="hsa-soon" role="status">Đề này chưa mở bảng xếp hạng.</p>
  :!board.rows.length?<p role="status">Chưa có lượt nào. Em có thể là người đầu tiên.</p>
  :<ol className="hsa-rows">{board.rows.map(r=><li key={r.rank} className={r.rank<=3?'is-top is-top-'+r.rank:''}><span className="hsa-rank">{r.rank}</span><span className="hsa-who"><strong>{r.name}</strong><small>{HSA_GRADE_LABEL[r.grade]} · {r.date.split('-').reverse().join('/')}</small></span><span className="hsa-score"><strong>{formatHsaScore(scale===10?r.score:onScale(r.score*1000,scale))}</strong><small>{formatHsaDuration(r.seconds)}</small></span></li>)}</ol>}
  <details className="hsa-rules"><summary>Cách xếp hạng</summary><ul><li>Điểm do máy chủ MTM chấm, không nhận điểm gửi từ trình duyệt.</li><li>Điểm cao hơn đứng trên; bằng điểm thì ai làm ít thời gian hơn đứng trên.</li><li>Mỗi đề chỉ tính lượt nộp đầu tiên của mỗi thiết bị và mỗi tên hiển thị. Các lượt sau vẫn chấm điểm để tự luyện.</li><li>Lượt nộp quá giờ, hoặc nộp quá nhanh so với thời gian đề, không tính.</li><li>Tên không phù hợp sẽ bị ẩn. Số điện thoại không bao giờ hiển thị.</li></ul></details>
 </section>;
}

export default function HsaMock({search}:{search:string}){
 const cfg=hsaMockExam(new URLSearchParams(search).get('de'));
 if(!cfg)return <div className="hsa-page"><R106PageIntro eyebrow="MINH THÀNH MATH" title="Thi thử HSA miễn phí" description={<p>Chưa có đề mở. Em quay lại sau nhé.</p>}/></div>;
 return <HsaMockRoom key={cfg.slug} cfg={cfg}/>;
}
function HsaMockRoom({cfg}:{cfg:HsaMockExam}){
 const [paper,setPaper]=useState<Paper|null>(null),[exam,setExam]=useState<PracticeExam|null>(null),[loadError,setLoadError]=useState(false),[noKey,setNoKey]=useState(false);
 const scale=cfg.pointsScale??10,scoreText=scoreTextFor(scale);
 const {board,refresh}=useBoard(cfg.examId);
 const [entry,setEntry]=useState<Entry|null>(readEntry),[editing,setEditing]=useState(false);
 const [mode,setMode]=useState<'local'|'server'|null>(null);
 const [outcome,setOutcome]=useState<Outcome|null>(null),[rank,setRank]=useState<RankState|null>(null),[lead,setLead]=useState<'sent'|'error'|'skipped'|null>(null);
 useEffect(()=>{let alive=true;loadPaper(cfg).then(p=>{if(alive)setPaper(p);},()=>{if(alive)setLoadError(true);});return()=>{alive=false;};},[cfg]);
 // Chế độ cố định khi đã biết trạng thái bảng: chỉ dùng lượt máy chủ khi bảng mở và có cấu hình máy chủ đề thi.
 useEffect(()=>{if(mode||board.state==='loading')return;if(board.state==='on'&&board.open){void import('../admin/backend').then(m=>setMode(m.backend()?'server':'local'),()=>setMode('local'));}else setMode('local');},[board.state,board.open,mode]);
 // Chế độ máy chủ chơi bản không đáp án (đáp án về sau khi nộp); chế độ trình duyệt mới tải bản có đáp án.
 useEffect(()=>{if(!paper||!mode)return;let alive=true;if(mode==='server'){setExam(paper.exam);return;}
  loadLocalExam(cfg,paper).then(e=>{if(!alive)return;if(e)setExam(e);else setNoKey(true);},()=>{if(alive)setLoadError(true);});return()=>{alive=false;};},[cfg,paper,mode]);
 const entryRef=useRef(entry);entryRef.current=entry;
 const submitRank=useCallback(async(a:Pick<RemoteAttempt,'attemptId'|'attemptToken'>)=>{
  const e=entryRef.current;if(!e)return;setRank({status:'pending'});
  try{const r=await fetch('/api/hsa-xep-hang',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({de:cfg.examId,attemptId:a.attemptId,attemptToken:a.attemptToken,name:e.name,grade:e.grade,device:deviceId()})});const data=await r.json().catch(()=>null);
   if(!r.ok)return setRank({status:'error',message:typeof data?.message==='string'?data.message:undefined});
   if(data?.enabled===false)return setRank(null);
   const next={status:data.status as HsaSubmitStatus,rank:typeof data.rank==='number'?data.rank:null};setRank(next);write(rankKey(a.attemptId),JSON.stringify(next));void refresh();}
  catch{setRank({status:'error'});}
 },[cfg.examId,refresh]);
 const sendLead=useCallback(async(o:Outcome)=>{
  const e=entryRef.current;if(!e?.phone)return;if(read(leadKey(cfg.examId)))return setLead('sent');
  if(!import.meta.env.VITE_SERVICE_KEY||!import.meta.env.VITE_TEMPLATE_KEY||!import.meta.env.VITE_PUBLIC_KEY)return setLead('skipped');
  try{write(leadKey(cfg.examId),o.attemptId);const emailjs=(await import('@emailjs/browser')).default;
   await emailjs.send(import.meta.env.VITE_SERVICE_KEY,import.meta.env.VITE_TEMPLATE_KEY,{...hsaLeadPayload({name:e.name,grade:e.grade,phone:e.phone,scoreText:scoreText(o.score)+' trong '+formatHsaDuration(o.elapsedMs/1000),examTitle:cfg.title,leadSource:describeLeadSource(storedLeadSource())}),time:new Date().toLocaleString('vi-VN',{timeZone:'Asia/Saigon'})},import.meta.env.VITE_PUBLIC_KEY);setLead('sent');}
  catch{try{window.localStorage.removeItem(leadKey(cfg.examId));}catch{/* bỏ qua */}setLead('error');}
 },[cfg.examId,cfg.title,scoreText]);
 const finished=useCallback((o:Outcome,remote?:RemoteAttempt)=>{
  setOutcome(o);void sendLead(o);
  if(!remote)return;let saved:RankState|null=null;try{saved=JSON.parse(read(rankKey(o.attemptId))??'null');}catch{saved=null;}
  if(saved&&'rank' in saved)setRank(saved);else void submitRank(remote);
 },[sendLead,submitRank]);
 // Bài đã nộp từ lượt trước: hiện lại điểm (và ghi bảng nếu lần trước chưa ghi được).
 useEffect(()=>{if(!exam||!mode)return;const store=localStore();
  if(mode==='server'){const a=readRemote(store,exam);if(a?.result){finished(remoteOutcome(a.result),a);return;}}
  const d=readDraft(store,exam);if(d.ok&&mode==='local'){const o=localOutcome(exam,d.value);if(o){setOutcome(o);setLead(read(leadKey(cfg.examId))?'sent':'skipped');}}
 },[exam,mode]);
 const saveEntry=(e:Entry)=>{write(ENTRY_KEY,JSON.stringify(e));setEntry(e);setEditing(false);};
 const groups=paper?.groups??[];
 const attemptProps=cfg.source==='hsa-paper'
  ?{questionReader:exam?<HsaPaperReader exam={exam} groups={groups}/>:undefined,renderText:hsaRich,renderSolutionExtra:(q:PracticeExam['questions'][number])=><HsaSolutionExtra groups={groups} question={q}/>,displayTitle:cfg.title,contextLabel:'Thi thử HSA'}
  :{questionReader:exam?<QuestionReader exam={exam}/>:undefined,renderText:rich,renderSolutionExtra:(q:PracticeExam['questions'][number])=><ExtraSolution question={q}/>,displayTitle:cfg.title,contextLabel:'Thi thử HSA'};
 const facts=exam??paper?.exam;
 return <div className="hsa-page ep-root">
  <R106PageIntro className="hsa-intro" eyebrow="MINH THÀNH MATH · MIỄN PHÍ" title="Thi thử HSA miễn phí" description={<><p>Đề Toán và xử lý số liệu theo dạng bài thi Đánh giá năng lực của ĐHQG Hà Nội (HSA). Đề thi thử làm trong 75 phút như lớp luyện HSA của MTM, chấm điểm tự động, xem đáp án và lời giải ngay sau khi nộp, rồi so điểm trên bảng xếp hạng.</p><p>Điểm thi thử để em tự đánh giá, không quy đổi thành điểm HSA chính thức.</p></>}>
   <ul className="hsa-facts"><li><strong>{facts?facts.questions.length:'…'}</strong><span>câu</span></li><li><strong>{facts?facts.durationMinutes:'…'}</strong><span>phút</span></li><li><strong>{scale}</strong><span>{scale===10?'điểm, chấm tự động':'điểm, mỗi câu đúng '+formatHsaScore(scale/(facts?.questions.length||scale))+' điểm'}</span></li></ul>
  </R106PageIntro>
  {cfg.placeholder&&<p className="hsa-placeholder" role="note"><strong>Đề mẫu, đề thi thử chính thức sẽ cập nhật.</strong> Đề mẫu do MTM biên soạn, ngắn hơn đề 75 phút, để em làm quen phòng thi và cách chấm.</p>}
  {HSA_MOCK_EXAMS.length>1&&<nav className="hsa-picker" aria-label="Chọn đề">{HSA_MOCK_EXAMS.map(e=><Link key={e.slug} href={'/thi-thu-hsa?de='+e.slug} aria-current={e.slug===cfg.slug?'page':undefined}>{e.title}</Link>)}</nav>}
  <div className="hsa-layout">
   <div className="hsa-main">
    {!entry||editing?<EntryForm initial={entry} onSave={saveEntry} onCancel={entry?()=>setEditing(false):undefined}/>:<>
     <div className="hsa-card hsa-who-bar"><span>Thí sinh: <strong>{entry.name}</strong> · {HSA_GRADE_LABEL[entry.grade]}{entry.phone?' · đã để lại số liên hệ':''}</span><button type="button" className="hsa-ghost" onClick={()=>setEditing(true)}>Sửa thông tin</button></div>
     {outcome&&<section className="hsa-card hsa-result" aria-live="polite"><h2>Kết quả của em</h2><p className="hsa-result-score"><strong>{scoreText(outcome.score)}</strong><span>Thời gian làm: {formatHsaDuration(outcome.elapsedMs/1000)}</span></p>
      <p>{!outcome.server?board.state==='off'?'Bảng xếp hạng sẽ mở sớm; lượt này chưa vào bảng.':'Lượt này chấm trên trình duyệt nên chưa vào bảng xếp hạng.':!rank?'':rank.status==='pending'?'Đang ghi bảng xếp hạng…':rank.status==='error'?(rank.message??'Chưa ghi được bảng xếp hạng.'):'rank' in rank?hsaStatusMessage(rank.status,rank.rank):''}{outcome.server&&rank?.status==='error'&&<> <button type="button" className="hsa-ghost" onClick={()=>{const a=exam&&readRemote(localStore(),exam);if(a)void submitRank(a);}}>Thử lại</button></>}</p>
      {entry.phone?<p>{lead==='sent'?'MTM sẽ liên hệ qua số em để lại để gửi kết quả chi tiết và tư vấn.':lead===null?'Đang gửi kết quả cho MTM…':'Chưa gửi được thông tin cho MTM. Em nhắn Zalo để nhận kết quả chi tiết và tư vấn.'}</p>:<p>Muốn nhận phân tích kết quả và lộ trình HSA? Em thêm số điện thoại ở <button type="button" className="hsa-link" onClick={()=>setEditing(true)}>Sửa thông tin</button> trước lượt sau, hoặc nhắn Zalo cho MTM.</p>}
      <p className="hsa-actions"><Link className="hsa-primary" href="/khoa-hoc?lop=hsa">Xem lộ trình HSA</Link><a className="hsa-ghost" href={ZALO_ASSISTANT_URL} target="_blank" rel="noopener noreferrer">Nhắn Zalo tư vấn</a></p>
     </section>}
     {noKey&&!loadError?<section className="hsa-card" role="status"><h2>Chưa mở chấm bài</h2><p>Phòng thi đề này đang chờ máy chủ chấm điểm. Em quay lại sau ít phút hoặc nhắn Zalo cho MTM nhé.</p></section>
     :loadError?<section className="hsa-card" role="alert"><h2>Chưa mở được đề</h2><p>Kết nối có thể đã gián đoạn. Em tải lại trang để thử lại.</p></section>
     :!exam||!mode?<p className="hsa-card" role="status">Đang chuẩn bị phòng thi…</p>
     :mode==='server'?<Suspense fallback={<p className="hsa-card" role="status">Đang chuẩn bị phòng thi…</p>}><ServerExamAttempt key={exam.id} exam={exam} catalogUrl="/thi-thu-hsa" attemptProps={attemptProps} onResult={(a,r)=>finished(remoteOutcome(r),a)}/></Suspense>
     :<PracticeAttempt key={exam.id} kind="exam" exam={exam} catalogUrl="/thi-thu-hsa" {...attemptProps} onServerSubmit={async d=>{const o=localOutcome(exam,d);if(o)finished(o);}}/>}
    </>}
   </div>
   <aside className="hsa-side"><Leaderboard board={board} refresh={()=>void refresh()} title={cfg.title} scale={scale}/></aside>
  </div>
 </div>;
}
