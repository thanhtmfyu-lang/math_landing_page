import {displayTitle} from '../components/display-text';
import {useEffect, useMemo, useRef, useState} from 'react';
import {Link, navigate} from '../migration/navigation';
import {filterSearch, GRADES, PERIODS, PERIOD_LABELS, PRACTICE_EXAMS, readFilters, readyExams, titleTerm, type Filters, type PracticeExam} from './exams/data';
import PracticeAttempt, {localStore} from './exams/PracticeAttempt';
import ServerExamAttempt from './exams/ServerExamAttempt';
import {STORAGE_PREFIX} from './exams/store';
import {resultFor} from './exams/result';
import {SEO} from '../components/SEO';
import {examRouteMetadata} from './exams/route-metadata';
import ExamReview from './exams/ExamReview';
import MistakeQueue from './exams/MistakeQueue';
import type {Draft} from './exams/store';
import {historySummary} from './exams/history-summary';
import {formatPoints} from './exams/review';
import {SOURCE_HOLDS} from './exams/source-holds';
import {erratumFor,originalExamId,practiceVersion} from './exams/practice-errata';
import {visibleBuckets} from './exams/attempt-ui';
import R106PageIntro from '../migration/R106PageIntro';
import ExamSearchField from './exams/ExamSearchField';
import './exams/exams.css';

function SavedAttemptReview({exam,draft}:{exam:PracticeExam;draft:Draft}) {
  const [open,setOpen]=useState(false);
  return <details open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary>Xem lại lượt đã nộp</summary>{open&&<>
    <p>MTM sưu tầm và biên soạn</p>
    {exam.answerVerificationNote&&<p>{exam.answerVerificationNote}</p>}
    {erratumFor(exam.id)&&<p className="ep-notice">{exam.id===originalExamId(exam.id)?'Lượt trước đính chính: điểm giữ theo khóa cũ, cần đọc giới hạn điều kiện.':'Lượt dùng bản MTM đính chính v37.'} {erratumFor(exam.id)!.condition}</p>}
    {SOURCE_HOLDS[exam.id]&&<p className="ep-notice">Đề đang chờ đính chính. Điểm lượt cũ dùng khóa trước khi phát hiện vấn đề: {SOURCE_HOLDS[exam.id]}</p>}
    {!exam.id.startsWith('mtm-custom-')&&<Link className="ep-link" href={`/thi-thu/${encodeURIComponent(originalExamId(exam.id))}`}>Mở lại đề gốc</Link>}
    <ExamReview key={draft.attemptId} exam={exam} draft={draft}/>
  </>}</details>;
}

function useLocalSummary(catalog:readonly PracticeExam[],search:string) {
  const [summary, setSummary] = useState(() => historySummary(localStore(),catalog));
  useEffect(() => {
    const captured=localStore();
    const refresh = () => setSummary(historySummary(localStore(),catalog));
    const changed = (event: StorageEvent) => {
      if (!captured||event.storageArea!==captured) return;
      if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) refresh();
    };
    refresh();
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [catalog,search]);
  return summary;
}
function LocalHistory({summary}: {summary:ReturnType<typeof historySummary>}) {
  const history=summary.history;
  return <section className="ep-card" aria-labelledby="ep-history-heading">
    <h2 id="ep-history-heading">Lịch sử trên trình duyệt này</h2>
    <p>Đã làm {summary.completedExams} đề · {summary.totalAttempts} lượt đã nộp. Lịch sử thuộc trình duyệt này; xóa dữ liệu trình duyệt sẽ mất bản lưu. Chưa đồng bộ sang tài khoản hoặc thiết bị khác.</p>
    {history.messages.map((message, i) => <p className="ep-notice" role="status" key={i}>{message}</p>)}
    {!history.items.length && <p>Chưa có bài nộp đã lưu để hiển thị.</p>}
    <ul className="ep-history">{history.items.map(({exam, draft}) => {
      const result = resultFor(exam, draft);
      return <li key={draft.attemptId + ':' + exam.id}><strong>{displayTitle(exam.title)}</strong><span>{new Date(draft.submittedAt!).toLocaleString('vi-VN')} · {result?.score.ok ? `${formatPoints(result.score.earnedMillipoints)} / 10` : 'Chưa tính được điểm'}</span><SavedAttemptReview exam={exam} draft={draft}/></li>;
    })}</ul>
  </section>;
}

/** Explicit catalog prop is for an external owner QA entry module. Production
 * App passes no catalog, and this entry imports no synthetic test material. */
export default function NativeExams({pathname, search, catalog = PRACTICE_EXAMS, historyCatalog = catalog}: {pathname: string; search: string; catalog?: readonly unknown[]; historyCatalog?: readonly unknown[]}) {
  const searchResult=useRef<HTMLParagraphElement>(null);
  const ready = useMemo(() => readyExams(catalog), [catalog]);
  const filters = readFilters(search), normalizedSearch = filterSearch(filters);
  const catalogUrl = '/thi-thu' + normalizedSearch;
  const retained = useMemo(() => readyExams(historyCatalog), [historyCatalog]);
  const localSummary=useLocalSummary(retained,pathname+normalizedSearch);
  useEffect(() => {
    if (search !== normalizedSearch) navigate(pathname + normalizedSearch + location.hash, {replace: true});
  }, [pathname, search, normalizedSearch]);
  let id: string | null = null;
  if (pathname !== '/thi-thu') {
    try { id = decodeURIComponent(pathname.slice('/thi-thu/'.length)); } catch { id = ''; }
  }
  const exam = id !== null ? ready.find(item => item.id === id) : undefined;
  const changeFilters = (patch: Partial<Filters>) => navigate('/thi-thu' + filterSearch({...filters, ...patch}), {replace: true});
  const matches = ready.filter(item => (filters.lop === 'all' || item.grade === Number(filters.lop)) && (filters.ky === 'all' || item.period === filters.ky) && titleTerm(item.title).includes(titleTerm(filters.q)));

  return <div className="ep-root">
    <SEO {...examRouteMetadata(exam,id!==null)}/>
    {id !== null ? exam ? exam.serverGraded ? <ServerExamAttempt key={exam.id} exam={practiceVersion(exam)} previousExam={practiceVersion(exam)===exam?undefined:exam} catalogUrl={catalogUrl}/> : <PracticeAttempt key={exam.id + ':' + exam.versionHash + ':' + exam.rubricVersion} kind="exam" exam={practiceVersion(exam)} previousExam={practiceVersion(exam)===exam?undefined:exam} catalogUrl={catalogUrl}/> : <section className="ep-card"><h1>Chưa mở được đề này</h1><p>Đề trong đường dẫn chưa có trong danh sách đã kiểm tra hoặc đường dẫn không đúng.</p><p>Đề đang được kiểm tra nguồn và đáp án trước khi mở làm bài.</p><Link className="ep-link" href={catalogUrl}>Về danh sách đề</Link></section> : <>
      <R106PageIntro className="ep-intro" eyebrow="Minh Thành Math · Tự luyện" title="Thi thử Toán" description={<><p>Đọc đề, làm bài có thời gian và xem đáp án, lời giải sau khi nộp.</p><p><Link className="ep-link" href="/btvn">BTVN theo mã học sinh · lịch sử và bảng tháng</Link></p></>}><p className="ep-total"><strong>{ready.filter(e=>!SOURCE_HOLDS[e.id]).length}</strong> đề mở làm bài · điều kiện đính chính được ghi rõ trước khi bắt đầu</p></R106PageIntro>
      <div className="ep-filters" role="search" aria-label="Lọc đề thi">
        <label>Lớp<select value={filters.lop} onChange={event => changeFilters({lop: event.target.value as Filters['lop']})}><option value="all">Tất cả lớp</option>{GRADES.map(grade => <option key={grade} value={grade}>Lớp {grade}</option>)}</select></label>
        <label>Kỳ kiểm tra<select value={filters.ky} onChange={event => changeFilters({ky: event.target.value as Filters['ky']})}><option value="all">Tất cả kỳ</option>{PERIODS.map(period => <option key={period} value={period}>{PERIOD_LABELS[period]}</option>)}</select></label>
        <ExamSearchField query={filters.q} onChange={q=>changeFilters({q})} onSearch={()=>searchResult.current?.focus()}/>
        <button type="button" onClick={() => changeFilters({lop: 'all', ky: 'all', q: ''})}>Xóa bộ lọc</button>
      </div>
      <section aria-label="Đề theo lớp và kỳ" className="ep-buckets">{visibleBuckets(ready, GRADES, PERIODS, {grade: filters.lop === 'all' ? 'all' : Number(filters.lop) as typeof GRADES[number], period: filters.ky}).map(({grade, period, count}) => <button type="button" className="ep-bucket" key={`${grade}-${period}`} aria-pressed={filters.lop === String(grade) && filters.ky === period} onClick={() => changeFilters({lop: String(grade) as Filters['lop'], ky: period})}><span>Lớp {grade} · {PERIOD_LABELS[period]}</span><strong>{count} đề</strong></button>)}</section>
      <p ref={searchResult} tabIndex={-1} className="ep-exam-search-result" role="status" aria-live="polite">{matches.length} đề phù hợp bộ lọc</p>
      <p>Trên trình duyệt này: đã làm {localSummary.completedExams} đề, {localSummary.totalAttempts} lượt đã nộp.</p>
      <div className="ep-catalog">{matches.map(item => {const saved=localSummary.exams.find(e=>e.examId===item.id);return <article className="ep-card" key={item.id}><p>Lớp {item.grade} · {PERIOD_LABELS[item.period]}</p><h2>{displayTitle(item.title)}</h2><p>{item.questions.length} câu · {item.durationMinutes} phút</p>{erratumFor(item.id)&&<p className="ep-notice">Bản MTM đính chính v37 · giữ PDF nguồn</p>}{SOURCE_HOLDS[item.id]&&<p className="ep-notice">Chờ đính chính điều kiện · chưa mở lượt mới</p>}<p className="ep-progress-label">{saved?.count?`Đã làm ${saved.count} lượt`: 'Chưa có lượt đã nộp'}{saved?.inProgress?' · Có bài đang làm':''}</p>{saved&&saved.count>0&&<p>Gần nhất: {saved.latestScore===null?'Chưa tính được':formatPoints(saved.latestScore)} / 10 · Cao nhất: {saved.best===null?'Chưa tính được':formatPoints(saved.best)} / 10</p>}<Link className="ep-link" href={`/thi-thu/${encodeURIComponent(item.id)}${normalizedSearch}`}>{saved?.inProgress?'Tiếp tục làm bài →':'Làm đề thi thử →'}</Link></article>;})}</div>
      {!matches.length && <p className="ep-card">{ready.length ? 'Chưa có đề phù hợp. Hãy thử đổi bộ lọc.' : 'Chưa có đề mở làm bài.'}</p>}
      <MistakeQueue history={localSummary.history}/>
      <LocalHistory summary={localSummary}/>
    </>}
  </div>;
}
