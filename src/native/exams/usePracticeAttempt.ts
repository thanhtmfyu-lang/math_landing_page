import {useCallback,useEffect,useRef,useState} from 'react';
import {createDraft,matchingStorageEvent,retakeDraft,readDraft,remainingMs,saveDraft,submitDraft,validateDraft,type Draft,type Response} from './store';
import {localStore} from './local-store';
import {resultFor} from './result';
import {examSections} from './flexible-profile';
import {answerState} from './attempt-ui';
import {useUnsavedGuard} from './navigation-guard';
import {SOURCE_HOLDS} from './source-holds';
import {erratumFor} from './practice-errata';
import type {PracticeAttemptProps} from './attempt-types';

/** Một instance cho mỗi lượt đang mở; RAM, đồng hồ và kiểm xung đột giữ cùng vòng đời. */
export function usePracticeAttempt({exam,previousExam,storeOverride,newAttemptsClosed,onRetake,isHomework=false,deadlineAt,clockOffsetMs=0,onServerStart,onServerSubmit,serverScore}: PracticeAttemptProps) {
  const validation={allowQuestionOnly:isHomework};
  const clockNow=()=>Date.now()+clockOffsetMs;
  const timeLeft=(value:Draft,at:number)=>remainingMs({deadline:Math.min(value.deadline,deadlineAt??Infinity)},at);
  const [failedQuestions,setFailedQuestions]=useState<Set<string>>(()=>new Set(exam.questions.filter(q=>q.sourceContent?.questions.some(segment=>segment.privateUnavailable)).map(q=>q.id)));
  const unavailableQuestions=useRef(new Set(failedQuestions));
  const setQuestionAssetReady=(id:string,ready:boolean)=>setFailedQuestions(previous=>{const next=new Set(previous);if(ready)next.delete(id);else next.add(id);return next;});
  useEffect(()=>{
    const ids=new Set(exam.questions.map(q=>q.id));
    const missing=new Set(exam.questions.filter(q=>q.sourceContent?.questions.some(segment=>segment.privateUnavailable)).map(q=>q.id));
    const previousMissing=unavailableQuestions.current;unavailableQuestions.current=missing;
    setFailedQuestions(previous=>{
      const next=new Set([...previous].filter(id=>ids.has(id)&&(!previousMissing.has(id)||missing.has(id))));
      for(const id of missing)next.add(id);
      return next.size===previous.size&&[...next].every(id=>previous.has(id))?previous:next;
    });
  },[exam]);
  const getStore=useCallback(()=>storeOverride??localStore(),[storeOverride]);
  const sourceIssue=SOURCE_HOLDS[exam.id];
  const erratum=erratumFor(exam.id);
  const [acceptedErratum,setAcceptedErratum]=useState(false);
  const [legacy]=useState(()=>previousExam?readDraft(getStore(),previousExam):null);
  const [initial] = useState(() => readDraft(getStore(), exam,validation));
  const persisted = useRef<Draft | null>(initial.ok ? initial.value : null);
  const ram = useRef<Draft | null>(initial.ok && initial.value && initial.value.submittedAt !== null ? initial.value : null);
  const dirty = useRef(false), conflict = useRef(false);
  const remotePending=useRef(false);
  const [serverBusy,setServerBusy]=useState(false);
  const [draft, setDraft] = useState<Draft | null>(ram.current);
  const [notice, setNotice] = useState(initial.ok ? '' : initial.message);
  useEffect(()=>{if(!failedQuestions.size&&notice.startsWith('Một phần đề chưa tải.'))setNotice('');},[failedQuestions,notice]);
  const [unsaved, setUnsaved] = useState(false);
  const [now, setNow] = useState(clockNow);
  const [exportNotice, setExportNotice] = useState('');
  const [pdfReady,setPdfReady]=useState(!exam.sourcePdf);
  const [confirmation,setConfirmation]=useState<'submit'|'retake'|null>(null);
  const [desktopLayout,setDesktopLayout]=useState<'balanced'|'reading'|'answers'>('balanced');
  const [activeQuestion,setActiveQuestion]=useState(0),[questionFocus,setQuestionFocus]=useState(false),[mobilePane,setMobilePane]=useState<'pdf'|'answers'>(ram.current?.submittedAt!=null?'answers':'pdf');
  useEffect(()=>{if(questionFocus){const target=document.getElementById(`ep-question-${activeQuestion}`);target?.focus();setQuestionFocus(false);}},[activeQuestion,questionFocus]);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (draft?.submittedAt != null) resultHeading.current?.focus();
  }, [draft?.attemptId, draft?.submittedAt,clockOffsetMs]);
  // BTVN có một guard theo ACK máy chủ ở HomeworkSession, tránh hai guard tranh popstate.
  const leaveConfirmation=useUnsavedGuard(() => dirty.current,undefined,!isHomework);

  const persist = useCallback((next: Draft) => {
    // RAM is authoritative for this mounted attempt, even when storage refuses.
    ram.current = next;
    if (conflict.current) {
      dirty.current = true;
      setUnsaved(true);
      setNotice('Bản lưu đã thay đổi ở nơi khác. Câu trả lời trên trang này được giữ nguyên và chưa được lưu. Hãy tải bản lưu bài làm (mục "Bản lưu bài làm" bên dưới) trước khi rời trang.');
    } else {
      const saved = saveDraft(getStore(), exam, next, persisted.current,validation);
      dirty.current = !saved.ok;
      setUnsaved(!saved.ok);
      if (saved.ok) { persisted.current = saved.value; setNotice(''); }
      else {
        if (saved.code === 'conflict' || saved.code === 'version') conflict.current = true;
        setNotice(saved.message);
      }
    }
    setDraft(next);
  }, [exam,getStore,isHomework]);

  useEffect(() => {
    const captured=getStore();
    const changed = (event: StorageEvent) => {
      if (!matchingStorageEvent(event,captured,exam.id)) return;
      conflict.current = true;
      if (ram.current) { dirty.current = true; setUnsaved(true); }
      setNotice('Bản lưu đã thay đổi hoặc bị xóa ở cửa sổ khác. Bài đang mở được giữ nguyên. Hãy tải bản lưu bài làm (mục "Bản lưu bài làm" bên dưới) trước khi tải lại trang.');
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [exam.id,getStore]);

  const finish = useCallback(async (automatic: boolean, confirmed=false) => {
    const current = ram.current;
    if (!current || current.submittedAt !== null||remotePending.current) return;
    if(!automatic&&!pdfReady){setNotice('Chưa thể nộp thủ công khi có phần câu hỏi chưa hiển thị. Bài làm vẫn được giữ; hãy tải lại trang để đọc đủ đề.');return;}
    const clock = clockNow();
    const unanswered = exam.questions.filter(q => q.kind!=='self' && answerState(exam, q, current.answers) !== 'answered').length;
    if (!automatic && timeLeft(current, clock) > 0 && unanswered > 0 && !confirmed) {setConfirmation('submit');return;}
    const result = submitDraft(exam, current, clockNow(),validation);
    if (!result.ok) { setNotice(result.message); return; }
    if(onServerSubmit){
      remotePending.current=true;setServerBusy(true);
      try{const acceptedAnswers=await onServerSubmit(result.value);if(acceptedAnswers)result.value={...result.value,answers:acceptedAnswers};}catch(e){setNotice(e instanceof Error?e.message:'Chưa nộp được bài. Em hãy thử lại.');return;}
      finally{remotePending.current=false;setServerBusy(false);}
    }
    setConfirmation(null);setMobilePane('answers');
    persist(result.value); // Sets the ref synchronously before another click/tick.
  }, [exam, persist, pdfReady,deadlineAt,clockOffsetMs,onServerSubmit]);

  useEffect(() => {
    if (!draft || draft.submittedAt !== null) return;
    const tick = () => setNow(clockNow());
    tick();
    const interval = window.setInterval(tick, 500);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(interval); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, [draft?.attemptId, draft?.submittedAt,clockOffsetMs]);
  useEffect(() => {
    if (draft && draft.submittedAt === null && timeLeft(draft, now) === 0) finish(true);
  }, [draft, now, finish]);

  const begin = async () => {
    if(sourceIssue||(erratum&&!acceptedErratum))return;
    if(!pdfReady){setNotice('Chưa mở làm bài khi bản câu hỏi chưa hiển thị.');return;}
    if (ram.current) return;
    const old = persisted.current;
    if(remotePending.current)return;
    if (!old && newAttemptsClosed) return; // DL-01: không mở lượt mới; bài dở và lượt đã nộp vẫn mở.
    if(onServerStart&&old?.submittedAt==null){remotePending.current=true;setServerBusy(true);try{await onServerStart(old);}catch(e){setNotice(e instanceof Error?e.message:'Chưa mở được lượt thi.');return;}finally{remotePending.current=false;setServerBusy(false);}}
    if (old) {
      if (old.submittedAt !== null) { persist(old); return; }
      const resumed = validateDraft({...old, updatedAt: Math.max(old.updatedAt, clockNow()), revision: old.revision + 1}, exam,validation);
      if (resumed.ok) persist(resumed.value); else setNotice(resumed.message);
    } else {
      const attemptId = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const made = createDraft(exam, attemptId, clockNow(),validation);
      if (made.ok) persist(made.value); else setNotice(made.message);
    }
    setNow(clockNow());setMobilePane('answers');
  };
  const changeAnswer = (id: string, answer: Response) => {
    if(!pdfReady||failedQuestions.has(id)||remotePending.current)return;
    const current = ram.current;
    if (!current || current.submittedAt !== null) return;
    const clock = clockNow();
    if (timeLeft(current, clock) === 0) { finish(true); return; }
    const next = validateDraft({...current, answers: {...current.answers, [id]: answer}, updatedAt: Math.max(clock, current.updatedAt), revision: current.revision + 1}, exam,validation);
    if (!next.ok) { setNotice(next.message); return; }
    persist(next.value);
  };
  const submitted = !!draft && draft.submittedAt !== null;
  const result = draft && submitted&&!isHomework&&!exam.responseMode ? resultFor(exam, draft) : null;
  const score = serverScore??result?.score;
  const sections=examSections(exam);
  const states = draft ? exam.questions.map(q => answerState(exam, q, draft.answers)) : [];
  const answered = states.filter(state => state === 'answered').length, invalidCount = states.filter(state => state === 'invalid').length;
  const seconds = draft ? Math.ceil(timeLeft(draft, now) / 1000) : 0;
  const startDisabled=serverBusy||!pdfReady||!!sourceIssue||!!erratum&&!acceptedErratum||!!newAttemptsClosed&&!persisted.current;
  const startLabel=sourceIssue?'Chờ đính chính điều kiện':persisted.current?'Tiếp tục làm bài':newAttemptsClosed?'Chờ phản biện · chưa mở lượt mới':'Bắt đầu làm bài';
  const retake=async(confirmed=false)=>{
    if(onRetake){onRetake();return;}
    if(sourceIssue||newAttemptsClosed)return;
    const old=ram.current;if(!old||old.submittedAt===null||dirty.current||conflict.current)return;
    if(!pdfReady)return;
    if(!confirmed){setConfirmation('retake');return;}
    if(onServerStart){if(remotePending.current)return;remotePending.current=true;setServerBusy(true);try{await onServerStart(old);}catch(e){setNotice(e instanceof Error?e.message:'Chưa mở được lượt thi mới.');return;}finally{remotePending.current=false;setServerBusy(false);}}
    setConfirmation(null);setActiveQuestion(0);setMobilePane('answers');
    const id=typeof crypto.randomUUID==='function'?crypto.randomUUID():`local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next=retakeDraft(getStore(),exam,old,id,Date.now());
    if(!next.ok){setNotice(next.message);return;}
    persisted.current=next.value;ram.current=next.value;setDraft(next.value);setNow(Date.now());setNotice('');setExportNotice('');setUnsaved(false);
  };

  return {serverBusy,failedQuestions,setQuestionAssetReady,sourceIssue,erratum,acceptedErratum,setAcceptedErratum,legacy,persisted,conflict,draft,notice,setNotice,unsaved,exportNotice,setExportNotice,pdfReady,setPdfReady,confirmation,setConfirmation,desktopLayout,setDesktopLayout,activeQuestion,setActiveQuestion,setQuestionFocus,mobilePane,setMobilePane,resultHeading,leaveConfirmation,persist,finish,begin,changeAnswer,submitted,score,sections,states,answered,invalidCount,seconds,startDisabled,startLabel,retake};
}
export type PracticeAttemptState = ReturnType<typeof usePracticeAttempt>;
