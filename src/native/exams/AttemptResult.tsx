import {Link} from '../../migration/navigation';
import {useState} from 'react';
import ResultSummary from './ResultSummary';
import ExamReview from './ExamReview';
import ResultRecallTool from './ResultRecallTool';
import ResultReflectionTool from './ResultReflectionTool';
import ResultCounterexampleTool from './ResultCounterexampleTool';
import type {PracticeAttemptProps} from './attempt-types';
import type {PracticeAttemptState} from './usePracticeAttempt';
export default function AttemptResult({props,state}:{props:PracticeAttemptProps;state:PracticeAttemptState}) {
  const {exam,catalogUrl,questionReader,renderText,renderSolutionExtra,kind='practice',newAttemptsClosed}=props;
  const {draft,resultHeading,score,unsaved,conflict,pdfReady,sourceIssue,erratum,acceptedErratum,retake}=state;
  const [reviewTarget,setReviewTarget]=useState({id:'',revision:0});
  if(!draft)return null;
  return <><section className="ep-card r106-result-card" aria-label="Kết quả"><h2 ref={resultHeading} tabIndex={-1}>{kind==='exam'?'Kết quả thi thử':'Kết quả luyện tập'}</h2><ResultSummary exam={exam} draft={draft} serverScore={props.serverScore}/>{!score?.ok&&<p role="alert">Chưa tính được điểm. Bài làm vẫn giữ nguyên để đối chiếu.</p>}
              <p>Nộp lúc {new Date(draft.submittedAt!).toLocaleString('vi-VN')}.</p>{exam.answerVerificationNote&&<p>{questionReader?'Câu hỏi, đáp án và lời giải đã được đối chiếu. Điểm được tính theo thang ghi tại từng câu.':exam.answerVerificationNote}</p>}
              <p><Link className="ep-link" href={catalogUrl}>Trở về danh sách đề</Link></p>
              {newAttemptsClosed?<p>Bài đang chờ phản biện nên chưa mở lượt làm lại; lượt này vẫn giữ trong lịch sử.</p>:<button type="button" disabled={unsaved||conflict.current||!pdfReady||!!sourceIssue||!!erratum&&!acceptedErratum} onClick={()=>retake()}>Làm lại đề · giữ bài cũ trong lịch sử</button>}
            </section>
            {kind==='exam'&&!props.isHomework&&draft.submittedAt!==null&&<ResultRecallTool key={draft.attemptId} exam={exam} draft={draft} renderText={renderText} renderSolutionExtra={renderSolutionExtra}/>}
            {kind==='exam'&&!props.isHomework&&draft.submittedAt!==null&&<ResultReflectionTool key={draft.attemptId+':'+exam.versionHash} exam={exam} draft={draft} onReview={id=>setReviewTarget(value=>({id,revision:value.revision+1}))}/>}
            {kind==='exam'&&!props.isHomework&&draft.submittedAt!==null&&<ResultCounterexampleTool key={draft.attemptId+':'+exam.versionHash}/>}
            <ExamReview key={[draft.attemptId,exam.versionHash,exam.answerKeyVersion].join(':')} exam={exam} draft={draft} initialQuestionId={reviewTarget.id||undefined} reviewRequestRevision={reviewTarget.revision} showSummary={false} advancedFilters={kind==='exam'&&!props.isHomework} renderText={renderText} renderSolutionExtra={renderSolutionExtra}/></>;
}
