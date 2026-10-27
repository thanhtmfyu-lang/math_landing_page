import {studentSessionChanged} from '../../components/student-appearance';
import {LoadingCards} from '../../components/LoadingCards';
import HomeworkBrowserHelp from './HomeworkBrowserHelp';
import {Link} from '../../migration/navigation';
import {createAssetRenewal,mergeHomeworkSave,mergeHomeworkRenewal,homeworkServerNow} from './asset-renewal';
import {scheduleOpeningRefresh,mergeOpeningState} from './opening-refresh';
import {useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import TuLuanUpload from './TuLuanUpload';
import {displayClassName} from './presentation';
import EntryNotice,{entryFailure} from './EntryNotice';
import LessonCards from './LessonCards';
import HomeworkOverview from './HomeworkOverview';
import R104Dashboard from './R104Dashboard';
import BtvnCertificates from './BtvnCertificates';
import HomeworkGate,{PIN_SETUP_NOTICE,PIN_REQUIRED_NOTICE} from './HomeworkGate';
import HomeworkTimePlan from './HomeworkTimePlan';
import HomeworkStudyRhythmTool from './HomeworkStudyRhythmTool';
import HomeworkSelfCheckTool from './HomeworkSelfCheckTool';
import HomeworkWarmupTool from './HomeworkWarmupTool';
import PracticeAttempt from '../exams/PracticeAttempt';
import type {Draft,Store} from '../exams/store';
import {draftKey} from '../exams/store';
import type {PracticeExam} from '../exams/data';
import type {GateInput,HomeworkGateway,HomeworkState} from './btvn-contract';
import MtmSourceContent from '../exams/MtmSourceContent';
import {RoomQuestionContext} from '../exams/RoomQuestionContext';
import {questionLabel} from '../exams/attempt-ui';
import {useUnsavedGuard} from '../exams/navigation-guard';
import {createHomeworkSaver,REMOTE_SAVE_INITIAL,REMOTE_LEAVE_MESSAGE} from './remote-save';
import {notifyLeaderboardSubmitted} from './leaderboard-refresh';
import {acknowledgedHomeworkSubmission} from './result-summary';
import '../exams/exams.css';
import './btvn-session.css';
import './btvn-mobile.css';

const ACCESS_ENDED='Máy chủ không còn xác nhận quyền xem bài. Em nhập lại mã để xem bản máy chủ đang giữ hoặc liên hệ trợ lý lớp.';
const ACCESS_ENDED_PENDING=ACCESS_ENDED+' Phần bài chưa gửi xong có thể chưa được tính.';

function HomeworkReader({exam}:{exam:PracticeExam}){
  const active=useContext(RoomQuestionContext);
  return <section aria-label="Đề BTVN">{exam.questions.map((q,index)=>active!==null&&active!==index?null:<article key={q.id} data-question-id={q.id} className="btvn-question"><h2>{active===null?questionLabel(exam,index).full:`Câu ${index+1}`}</h2>{active!==null&&<p className="fr-original-label">Trong phiếu gốc: {questionLabel(exam,index).full}</p>}{q.sourceContent&&<MtmSourceContent segments={q.sourceContent.questions} assetBase="/practice-media/source-crops" label={questionLabel(exam,index).full} kind="question"/>}<small>MTM sưu tầm và biên soạn</small></article>)}</section>;
}
function ManagedAttempt({state,gateway,onState,onPendingChange,saverRef,onOpenEssay}:{state:HomeworkState & {exam:PracticeExam};gateway:HomeworkGateway;onState:(state:HomeworkState)=>void;onPendingChange:(pending:boolean)=>void;saverRef:{current:ReturnType<typeof createHomeworkSaver>|null};onOpenEssay?:()=>void}){
  const checkSelection=useState<string[]>([]);
  const [save,setSave]=useState(REMOTE_SAVE_INITIAL),[notice,setNotice]=useState('');
  const last=useRef<Draft|null>(state.draft);
  const saver=useMemo(()=>createHomeworkSaver({
    send:draft=>gateway.call(draft.submittedAt===null?'save':'submit',{lessonCode:state.lessonCode,attemptId:draft.attemptId,answers:draft.answers}),
    onSaved:next=>{onState(next);if(acknowledgedHomeworkSubmission(next))notifyLeaderboardSubmitted();},
    onStatus:status=>{onPendingChange(status.pending);setSave(status);},
  }),[state.draft?.attemptId,gateway]);
  useEffect(()=>{saverRef.current=saver;return()=>{saver.dispose();if(saverRef.current===saver)saverRef.current=null;onPendingChange(false);};},[saver]);
  const store=useMemo<Store>(()=>{
    const values=new Map<string,string>();if(state.draft)values.set(draftKey(state.exam.id),JSON.stringify(state.draft));
    return {getItem:key=>values.get(key)??null,setItem:(key,value)=>{
      if(key===draftKey(state.exam.id)){
        const draft=JSON.parse(value) as Draft;
        if(draft.attemptId!==state.draft?.attemptId)throw new Error('Chỉ máy chủ mở lượt mới.');
        values.set(key,value);last.current=draft;saver.update(draft);
      }else values.set(key,value);
    }};
  },[state.draft?.attemptId,saver]);
  const saveStatus=save.failed?'Chưa lưu máy chủ':save.pending?'Chờ máy chủ lưu':'Đã lưu máy chủ';
  return <><p className="r106-assessment r106-save-feedback" role="status">{save.message||notice}</p>{save.failed&&!save.closed&&<button disabled={save.saving} onClick={saver.retry}>Gửi lại bài đang giữ</button>}
    <PracticeAttempt isHomework exam={state.exam} catalogUrl={location.pathname} contextLabel="BTVN" audienceLabel={displayClassName(state)} storeOverride={store}
      homeworkSelfCheck={<HomeworkSelfCheckTool selection={checkSelection}/>} onOpenEssay={onOpenEssay}
      saveStatus={save.failed?save.message:saveStatus} savePending={save.pending} onRetrySave={save.failed&&!save.closed?saver.retry:undefined} onAcceptClosed={save.closed?saver.acceptClosed:undefined}
      deadlineAt={state.closesAt} clockOffsetMs={state.serverNow!==undefined&&state.clientReceivedAt!==undefined?state.serverNow-state.clientReceivedAt:0}
      storageNotice="Bài làm gửi đến máy chủ MTM theo tài khoản em. Chỉ thông báo nhận bài từ máy chủ mới xác nhận đã nộp BTVN."
      onRetake={()=>{setNotice('Dùng nút Làm lượt tiếp ở phần kết quả BTVN.');document.getElementById('btvn-summary')?.scrollIntoView({behavior:'smooth'});}}
      questionReader={<HomeworkReader exam={state.exam}/>}/>
  </>;
}
const READ_ACTIONS=new Set(['state','select','login','logout']),READ_TIMEOUT_MS=40000;
const SLOW_SERVER='Máy chủ đang chậm nên chưa tải được bài. Em đăng nhập lại hoặc tải lại trang sau ít phút.';
export default function HomeworkSession({pathname,profileControl}:{pathname:string;profileControl?:(state:HomeworkState)=>ReactNode}){
  const parts=/^\/btvn\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(pathname);
  const [state,setState]=useState<HomeworkState|null>(null),[gate,setGate]=useState({fullName:'',phone:'',className:''});
  const [studentCode,setStudentCode]=useState('');
  const [pinMode,setPinMode]=useState<'enter'|'setup'>('enter');
  const [classNames,setClassNames]=useState<string[]>([]),[classesLoading,setClassesLoading]=useState(true),[classesError,setClassesError]=useState(false);
  const classesGeneration=useRef(0);
  const loadClasses=async()=>{
    const generation=++classesGeneration.current;setClassesLoading(true);setClassesError(false);
    try{
      const response=await fetch('/api/btvn',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'classes'})});
      const data=await response.json();
      if(!response.ok||!Array.isArray(data.classNames)||data.classNames.length>200||data.classNames.some((name:unknown)=>typeof name!=='string'||!name.trim()||name.length>100))throw Error('Danh sách lớp chưa sẵn sàng');
      if(generation===classesGeneration.current){setClassNames([...new Set<string>(data.classNames)]);setGate(previous=>({...previous,className:data.classNames.includes(previous.className)?previous.className:''}));}
    }catch{if(generation===classesGeneration.current){setClassNames([]);setClassesError(true);}}
    finally{if(generation===classesGeneration.current)setClassesLoading(false);}
  };
  useEffect(()=>{void loadClasses();return()=>{classesGeneration.current++;};},[pathname]);
  const [room,setRoom]=useState(false);
  const remotePending=useRef(false),essayPending=useRef(false),saverRef=useRef<ReturnType<typeof createHomeworkSaver>|null>(null);
  const onEssayPending=useRef((pending:boolean)=>{essayPending.current=pending;}).current;
  const essayScope=useRef({key:'',available:false});
  const currentEssayKey=state?.lessonCode+':'+state?.draft?.attemptId;
  if(essayScope.current.key!==currentEssayKey)essayScope.current={key:currentEssayKey,available:false};
  if(state?.essayUploadAvailable||state?.exam?.questions.some(q=>q.kind==='self'))essayScope.current.available=true;
  const canUploadEssay=!!state?.draft&&state.kind==='kiem-tra-thang'&&!!state.closesAt&&essayScope.current.available;
  const leaveConfirmation=useUnsavedGuard(()=>remotePending.current||essayPending.current,REMOTE_LEAVE_MESSAGE+' Ảnh tự luận chưa có biên nhận cũng sẽ mất nếu rời trang.');
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[checking,setChecking]=useState(true),[exitClosed,setExitClosed]=useState(false);
  const [essayOpen,setEssayOpen]=useState(false);
  // 21/10: trên điện thoại nút "Bắt đầu làm bài" ở xa dưới, báo lỗi ở đầu trang nên HS tưởng bấm không ăn. Cuộn tới báo lỗi.
  useEffect(()=>{if(notice)document.querySelector('.btvn-notice-alert')?.scrollIntoView({block:'center'});},[notice]);
  const requestExit=async(run:()=>void|Promise<void>)=>{
    if(essayPending.current){setNotice('Còn ảnh tự luận chưa nhận. Em mở Nộp ảnh tự luận, gửi lại hoặc bỏ ảnh chưa gửi trước khi rời bài.');setEssayOpen(true);return;}
    const generation=sessionGeneration.current,current=()=>mounted.current&&sessionGeneration.current===generation;
    let completed=false;
    setBusy(true);setNotice('');setExitClosed(false);
    try{
      const saver=saverRef.current,flushed=saver?await saver.flush():true;
      if(!current())return;
      if(!flushed&&saver){
        const closed=saver.closed();setExitClosed(closed);
        setNotice(closed?'Máy chủ đã chấm bản đã lưu. Bấm Chấp nhận bản máy chủ đã chấm rồi mới rời bài. Phần sửa chưa được nhận không tính điểm.':'Chưa rời bài vì máy chủ chưa nhận bản mới nhất. Giữ trang mở và bấm Gửi lại bài đang giữ.');return;
      }
      await run();completed=true;
    }catch(error){if(current())setNotice(error instanceof Error?error.message:'Chưa rời bài được. Em thử lại sau.');}finally{if(mounted.current&&(current()||completed))setBusy(false);}
  };
  const mounted=useRef(true),sessionGeneration=useRef(0);
  const hasSession=useRef(false);hasSession.current=state!==null;
  const imageNeedsRenewal=useRef(false);
  const renewAssets=useRef<(failed?:boolean)=>void>(()=>{});
  const renewalState=useRef(state);renewalState.current=state;
  const selectedLesson=useRef<string|undefined>(parts?.[2]);
  useEffect(()=>{if(state)selectedLesson.current=state.lessonCode||undefined;},[state?.lessonCode]);
  const gateway=useMemo<HomeworkGateway>(()=>({async call(action,body={}){
    const generation=sessionGeneration.current;
    const current=()=>mounted.current&&sessionGeneration.current===generation;
    // Chỉ lệnh đọc có hạn chờ: máy chủ chậm thì báo và cho thử lại, không đứng mãi. Lệnh ghi bài giữ nguyên để không cắt giữa lúc lưu.
    const abort=READ_ACTIONS.has(action)?new AbortController():null,timer=abort?setTimeout(()=>abort.abort(),READ_TIMEOUT_MS):undefined;
    const response=await fetch('/api/btvn',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},signal:abort?.signal,
      body:JSON.stringify({action,classKey:parts?.[1],lessonCode:action==='login'?parts?.[2]:selectedLesson.current,...body})}).catch(()=>{throw new Error(abort?.signal.aborted?SLOW_SERVER:'Chưa kết nối được máy chủ. Em thử lại sau.');}).finally(()=>clearTimeout(timer));
    if(!current())throw new Error(ACCESS_ENDED);
    // 401/403 là từ chối quyền thật, không phải lỗi mạng để tiếp tục giữ nội dung riêng.
    // Kiểm trước JSON vì cổng từ chối có thể trả HTML hoặc thân rỗng.
    if(action!=='login'&&(response.status===401||response.status===403)){
      const accessNotice=hasSession.current?(remotePending.current?ACCESS_ENDED_PENDING:ACCESS_ENDED):'';
      sessionGeneration.current++;studentSessionChanged();saverRef.current?.dispose({flushPending:false});saverRef.current=null;
      remotePending.current=false;selectedLesson.current=parts?.[2];imageNeedsRenewal.current=false;renewAssets.current=()=>{};
      setState(null);setRoom(false);setExitClosed(false);setBusy(false);setChecking(false);setNotice(accessNotice);
      throw new Error(ACCESS_ENDED);
    }
    const data=await response.json().catch(()=>{throw new Error('Máy chủ chưa trả lời hợp lệ. Em thử lại sau.');});
    if(!current())throw new Error(ACCESS_ENDED);
    if(!response.ok)throw new Error(action==='login'?entryFailure(response.status,data.message):data.message??'Chưa kết nối được máy chủ.');
    // Các response cũ không được khôi phục nội dung sau đăng nhập hoặc đăng xuất.
    if(action==='login'||action==='logout'){sessionGeneration.current++;studentSessionChanged();}
    return {...data,clientReceivedAt:Date.now()} as HomeworkState;
  }}),[pathname]);
  useEffect(()=>{mounted.current=true;void gateway.call('state').then(next=>{if(mounted.current){setState(next);setRoom(!!next.draft&&next.draft.submittedAt===null);}}).catch(error=>{if(mounted.current&&error instanceof Error&&error.message!==ACCESS_ENDED)setNotice(error.message);}).finally(()=>{if(mounted.current)setChecking(false);});return()=>{mounted.current=false;sessionGeneration.current++;};},[gateway]);
  const refreshingReceipt=useRef(false);
  const refreshReceipt=async()=>{
    if(busy||refreshingReceipt.current||!state?.draft||state.draft.submittedAt===null||remotePending.current)return;
    const generation=sessionGeneration.current,lesson=state.lessonCode,attempt=state.draft.attemptId;
    const current=()=>mounted.current&&sessionGeneration.current===generation;
    refreshingReceipt.current=true;setBusy(true);setNotice('');
    try{
      const next=await gateway.call('state',{lessonCode:lesson});
      if(!current())return;
      setState(previous=>previous?.lessonCode===lesson&&previous.draft?.attemptId===attempt?mergeHomeworkRenewal(previous,next):previous);
      setNotice('Đã kiểm tra lại biên nhận. Trạng thái xác nhận hiện ở phần kết quả bên dưới.');
    }catch(error){if(current())setNotice(error instanceof Error?error.message:'Chưa kiểm tra được biên nhận. Em giữ trang và thử lại.');}
    finally{refreshingReceipt.current=false;if(current())setBusy(false);}
  };
  useEffect(()=>{
    if(!state?.lessons)return;
    let alive=true;const lessonCode=state.lessonCode;
    const cancel=scheduleOpeningRefresh(state.lessons,async()=>{const next=await gateway.call('state',{lessonCode});if(alive)setState(previous=>previous?.lessonCode===lessonCode?mergeOpeningState(previous,next):previous);},()=>homeworkServerNow(renewalState.current??state));
    return ()=>{alive=false;cancel();};
  },[gateway,state?.lessonCode,state?.lessons,state?.serverNow,state?.clientReceivedAt]);
  // Link ảnh/PDF sống 150 phút; chỉ gia hạn khi còn tối đa 30 phút hoặc ảnh lỗi.
  useEffect(()=>{
    if(!state||state.demo||(!state.exam&&!state.opensAt))return;
    let alive=true;const lesson=state.lessonCode;
    const renew=createAssetRenewal(async()=>{try{
      const next=await gateway.call('state',{lessonCode:lesson});
      imageNeedsRenewal.current=!!next.exam?.questions.some(q=>q.sourceContent?.questions.some(segment=>segment.privateUnavailable));
      if(alive)setState(previous=>previous?.lessonCode===lesson?mergeHomeworkRenewal(previous,next):previous);
    }catch{ /* Giữ bài hiện tại khi mất mạng; lần kiểm sau thử lại. */ }},()=>homeworkServerNow(renewalState.current??state));
    const check=(failed=false)=>{if(failed)imageNeedsRenewal.current=true;void renew(state.assetsExpiresAt,imageNeedsRenewal.current);};
    renewAssets.current=check;
    const timer=setInterval(()=>{const now=homeworkServerNow(renewalState.current??state);check((!state.exam&&!!state.opensAt&&now>=state.opensAt)||(state.kind==='kiem-tra-thang'&&!state.solutionsAvailable&&!!state.closesAt&&now>=state.closesAt));},60000);
    const retry=()=>renewAssets.current(true);window.addEventListener('mtm:retry-assets',retry);
    const visible=()=>{if(document.visibilityState==='visible')check();};document.addEventListener('visibilitychange',visible);
    return()=>{alive=false;renewAssets.current=()=>{};clearInterval(timer);window.removeEventListener('mtm:retry-assets',retry);document.removeEventListener('visibilitychange',visible);};
  },[gateway,state?.lessonCode,state?.demo,state?.assetsExpiresAt,state?.opensAt,state?.closesAt,state?.solutionsAvailable,!!state?.exam]);
  const run=async(action:'login'|'start',input?:GateInput)=>{
    const generation=sessionGeneration.current,current=()=>mounted.current&&sessionGeneration.current===generation;let completed=false;
    setBusy(true);setNotice('');try{
      const next=await gateway.call(action,action==='login'?{gate:input}:{});
      if(!mounted.current||sessionGeneration.current!==generation+(action==='login'?1:0))return;
      completed=true;setState(next);setRoom(action==='start'||!!next.draft);setGate({fullName:'',phone:'',className:''});setStudentCode('');setPinMode('enter');
    }catch(error){if(current()){const message=error instanceof Error?error.message:'Chưa kết nối được máy chủ. Em thử lại sau.';if(message==='PIN_SETUP')setPinMode('setup');else if(message==='PIN_REQUIRED')setPinMode('enter');setNotice(message==='PIN_SETUP'?PIN_SETUP_NOTICE:message==='PIN_REQUIRED'?PIN_REQUIRED_NOTICE:message);}}finally{if(mounted.current&&(current()||completed))setBusy(false);}
  };
  const selectLesson=async(code:string)=>{
    const generation=sessionGeneration.current,current=()=>mounted.current&&sessionGeneration.current===generation;
    setBusy(true);setNotice('');
    try{const next=await gateway.call('select',{lessonCode:code});if(!current())return;setState(next);setRoom(true);requestAnimationFrame(()=>{if(current())document.getElementById('btvn-summary')?.scrollIntoView({behavior:'smooth'});});}
    catch(error){if(current())setNotice(error instanceof Error?error.message:'Chưa mở được bài.');}
    finally{if(current())setBusy(false);}
  };
  if(!parts&&pathname!=='/btvn')return <section className="mig-container mig-panel"><Link href="/" className="btvn-home-link">← Trang chủ</Link><h1>Đường dẫn BTVN không hợp lệ</h1></section>;
  return <section className="ep-root btvn-session" onErrorCapture={event=>{if(event.target instanceof HTMLImageElement&&event.target.closest('.mtm-source-content'))renewAssets.current(true);}}>
    {leaveConfirmation}
    {state?.demo&&<p className="btvn-demo" role="note">Bản thử với học sinh giả và buổi mẫu. Chưa giao BTVN cho lớp thật.</p>}{state&&notice&&<p role="alert" className="btvn-notice-alert">{notice}</p>}{exitClosed&&<button type="button" className="btvn-btn" onClick={()=>{saverRef.current?.acceptClosed();setExitClosed(false);setNotice('Đã chọn bản máy chủ đã chấm. Em có thể rời bài.');}}>Chấp nhận bản máy chủ đã chấm</button>}
    {!state&&<header className="btvn-entry-heading"><div className="btvn-entry-bar"><Link href="/" className="btvn-home-logo" aria-label="Minh Thành Math, về trang chủ"><img src="/mtm-original-logo-420w.webp" alt="Minh Thành Math"/></Link><Link href="/" className="btvn-home-link">← Trang chủ</Link></div><h1>Bài tập về nhà</h1><p>Vào lớp để xem bài giảng và hoàn thành BTVN của em.</p></header>}
    {checking?<LoadingCards label="Đang kiểm tra phiên và tải danh sách buổi học…"/>:!state?<HomeworkGate studentCode={studentCode} identity={gate} busy={busy} classNames={classNames} classesLoading={classesLoading} classesError={classesError} onReloadClasses={()=>void loadClasses()} onCode={setStudentCode} onIdentity={setGate} onLogin={input=>void run('login',input)} pinMode={pinMode} notice={notice}/>:<>
      <header className="btvn-top"><Link href="/" className="btvn-home-logo" aria-label="Minh Thành Math, về trang chủ"><img src="/mtm-original-logo-420w.webp" alt="Minh Thành Math"/></Link><div><b>Bài tập về nhà</b><p>Video buổi học và BTVN của lớp em</p></div><div className="btvn-me"><Link href="/" className="btvn-home-link">← Trang chủ</Link><b>{state.fullName}</b><span>{displayClassName(state)}</span><button disabled={busy} onClick={()=>void requestExit(async()=>{await gateway.call('logout');setState(null);setRoom(false);})}>Thoát</button></div></header>
      <HomeworkBrowserHelp/>
      {state.classMismatch&&<EntryNotice className={state.className}/>}
      {!room&&<><BtvnCertificates state={state}/><R104Dashboard state={state} busy={busy} onSelect={code=>void selectLesson(code)} profileControl={profileControl?.(state)}/><a href="/btvn/tai-lieu" className="btvn-btn">Bài đang bổ sung và bản đơn giản</a><details className="r104-lesson-list r106-lesson-archive" id="r104-lesson-list"><summary><span>Toàn bộ buổi học</span><small>Video, tài liệu và nhắc lịch hạn nộp của từng buổi</small></summary><LessonCards headingLevel={2} serverNow={state.serverNow} clientReceivedAt={state.clientReceivedAt} demo={state.demo} lessons={state.lessons??[]} busy={busy} onHomework={code=>void selectLesson(code)}/></details></>}
      {room&&(state.exam||state.opensAt!==undefined||state.kind==='kiem-tra-thang')&&<><button className="btvn-btn btvn-back" disabled={busy} onClick={()=>void requestExit(()=>setRoom(false))}>← Các buổi học</button>
        {state.exam&&state.draft&&state.draft.submittedAt===null?<ManagedAttempt key={state.draft.attemptId} state={{...state,exam:state.exam}} gateway={gateway} saverRef={saverRef} onOpenEssay={canUploadEssay?()=>setEssayOpen(true):undefined} onState={next=>setState(previous=>previous?mergeHomeworkSave(previous,next):next)} onPendingChange={pending=>{remotePending.current=pending;}}/>:<HomeworkOverview key={state.lessonCode+':'+(state.draft?.attemptId??'new')} state={state} busy={busy} onRefreshReceipt={()=>void refreshReceipt()} onStart={()=>void run('start')}/>}
        {canUploadEssay&&<TuLuanUpload key={state.lessonCode+':'+state.draft!.attemptId} scope={{lessonCode:state.lessonCode,attemptId:state.draft!.attemptId}} fullName={state.fullName} closesAt={state.closesAt!} open={essayOpen} onOpenChange={setEssayOpen} onPendingChange={onEssayPending}/>}
      </>}

    </>}
    {!checking&&(!state||!room)&&<HomeworkTimePlan/>}
    {!checking&&(!state||!room)&&<HomeworkStudyRhythmTool/>}
    {!checking&&(!state||!room)&&<HomeworkWarmupTool key={'warmup:'+(state?.lessonCode??'')}/>}
    {!checking&&(!state||!room)&&<HomeworkSelfCheckTool key={'entry:'+(state?.lessonCode??'')}/>}
    {!checking&&(!state||!room)&&<aside className="btvn-self-check" aria-label="Đổi nhịp luyện Toán"><Link href="/san-choi" className="btvn-btn">Đổi nhịp với Sân chơi Toán</Link><p>Luyện riêng để đổi nhịp sau khi học, không tính điểm BTVN.</p></aside>}
  </section>;
}
