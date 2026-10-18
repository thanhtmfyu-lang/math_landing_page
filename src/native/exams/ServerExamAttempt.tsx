import {useEffect,useRef,useState} from 'react';
import PracticeAttempt from './PracticeAttempt';
import {localStore} from './local-store';
import {draftKey,type Draft} from './store';
import type {PracticeExam} from './data';
import {readRemote,saveRemote,startRemote,submitRemote,remoteSolutionPdf,validateRemoteResult,hydrateRemoteReview,needsFreshRemote,type RemoteResult} from './server-attempt';

/** Keys arrive only in the server receipt after submission. The capability is
 * kept on this browser and never placed in a URL or sent to analytics. */
export default function ServerExamAttempt({exam,previousExam,catalogUrl}:{exam:PracticeExam;previousExam?:PracticeExam;catalogUrl:string}){
 const store=localStore(),session=useRef(readRemote(store,exam));
 const [review,setReview]=useState<RemoteResult|null>(()=>{try{const a=session.current,d=JSON.parse(store?.getItem(draftKey(exam.id))??'null');return a?.result&&a.localAttemptId===d?.attemptId?hydrateRemoteReview(validateRemoteResult(a.result,exam.id,exam.versionHash),exam):null;}catch{return null;}});
 const [message,setMessage]=useState('');
 const [timing,setTiming]=useState(session.current);
 const [restoring,setRestoring]=useState(false);
 useEffect(()=>{let active=true;let d:Draft|null=null;try{d=JSON.parse(store?.getItem(draftKey(exam.id))??'null');}catch{}if(d?.submittedAt!=null&&!review){setRestoring(true);void (async()=>{if(!session.current){const a=await startRemote(exam);saveRemote(store,exam.id,a);session.current=a;}await submit(d!);})().catch(()=>{if(active)setMessage('Chưa lấy được xác nhận bài đã lưu. Em hãy tải lại trang khi kết nối ổn định.');}).finally(()=>{if(active)setRestoring(false);});}return()=>{active=false;};},[]);
 async function begin(previous:Draft|null){
  if(!session.current||session.current.result||previous===null||previous.submittedAt!==null){const a=await startRemote(exam);saveRemote(store,exam.id,a);session.current=a;setReview(null);setTiming(a);}
 }
 async function submit(draft:Draft){
  if(needsFreshRemote(session.current,draft))await begin(null);
  const r=await submitRemote(session.current!,draft);
  const a={...session.current!,localAttemptId:draft.attemptId,result:r};
  // A failed browser write does not discard an acknowledged server receipt.
  session.current=a;setReview(hydrateRemoteReview(r,exam));try{saveRemote(store,exam.id,a);}catch{setMessage('Máy chủ đã nhận bài. Chưa lưu được quyền xem lại trên trình duyệt; hãy giữ trang mở.');}
  return r.answers;
 }
 if(restoring)return <p role="status">Đang xác nhận bài đã lưu với máy chủ…</p>;
 return <>{message&&<p role="status">{message}</p>}<PracticeAttempt exam={review?.exam??exam} previousExam={previousExam} catalogUrl={catalogUrl} kind="exam" onServerStart={begin} onServerSubmit={submit} serverScore={review?.score} deadlineAt={timing?.deadline} clockOffsetMs={timing?.clientReceivedAt!==undefined?timing.serverNow-timing.clientReceivedAt:0} renderSolutionExtra={q=>review&&q.id===exam.questions[0]?.id?<button type="button" onClick={()=>{void remoteSolutionPdf(session.current!).then(url=>window.open(url,'_blank','noopener,noreferrer')).catch(e=>setMessage(e.message));}}>Mở PDF lời giải sau khi nộp</button>:null}/></>;
}
