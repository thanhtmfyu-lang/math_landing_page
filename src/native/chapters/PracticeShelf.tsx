// KT-06 (Đợt 3): phần Luyện tập cần ngân hàng đề. Nạp trễ (React.lazy) từ PracticeLibrary.tsx để chữ giới thiệu,
// nhóm và danh sách chương hiện trước khi gói đề về. Hiển thị và hành vi giữ nguyên như bản nhập tĩnh.
import {lazy,Suspense,useState} from 'react';
import {Link,useRoute} from '../../migration/navigation';
import {readHistory,readDraft} from '../exams/store';
import {localStore} from '../exams/local-store';
import {readItems,chapterIds,savedExamId,metadata,sequences,sequenceNumber} from './practice-loader';
import {lessonName,routeGroupsOf,practiceURL,testLabel,tracks,type Chapter,type PracticeItem,type Track} from './practice-shared';
import {awaitingReview,AWAITING_REVIEW_NOTICE,historyOnlyAttempt,isWarmup,shelfVisible,WARMUP_LABEL} from './library-rules';
import {PracticeHistory,PracticeResume} from './PracticeSavedWork';

const ChapterPractice=lazy(()=>import('./ChapterPractice'));
const OnChuongPanel=lazy(()=>import('./OnChuongSync'));
const ON_CHUONG=new Set(['10:8','10:9','11:8']);

/** Trang một bài (?id=) hoặc một lượt đã lưu (?luot=). */
export function PracticeDetail(){
  const route=useRoute(),params=new URLSearchParams(route.search);
  const selected=tracks.find(t=>t.id===params.get('nhom'))??tracks[0];
  const chapter=selected?.chapters.find(c=>c.id===params.get('chuong'))??selected?.chapters[0];
  const requested=params.get('id'),view=params.get('luot');
  const resolvedId=view?savedExamId(localStore(),view):requested;
  const items=readItems('exam:'+resolvedId,resolvedId?[resolvedId]:[]);
  const bank=items.filter(p=>!metadata[p.exam.id]?.archived),pilotBank=items.filter(p=>metadata[p.exam.id]?.archived);
  const item=bank.find(p=>p.exam.id===resolvedId),pilot=pilotBank.find(p=>p.exam.id===resolvedId);
  const actualTrack=item?.track??(pilot?pilot.track:selected?.id??'10');
  const actualChapter=item?.chapter??(pilot?pilot.chapter:chapter?.id??'1');
  const returnURL=practiceURL(actualTrack,actualChapter);
  // DL-01: chỉ ngân hàng hiện hành (practice-tests + exact-tests) dùng cổng chờ phản biện; bản lưu trữ giữ như cũ.
  const closedNotice=(id:string)=>{const p=bank.find(b=>b.exam.id===id);return p&&awaitingReview(p)?AWAITING_REVIEW_NOTICE:undefined;};
  return <>{ON_CHUONG.has(actualTrack+':'+actualChapter)&&!view&&<div className="mig-container"><Suspense fallback={null}><OnChuongPanel/></Suspense></div>}<ChapterPractice closedNotice={closedNotice} additionalBank={items} catalogUrl={returnURL} contextLabel={['HSA','TSA'].includes(actualTrack)?'Luyện tập theo chủ đề':'Luyện tập theo chương'} audienceLabel={tracks.find(t=>t.id===actualTrack)?.label}/></>;
}

/** Phần thân một chương (sau tiêu đề chương): đề theo tài liệu, bài luyện, bài kết thúc chương, lịch sử. */
export function ChapterShelf({selected,chapter}:{selected:Track;chapter:Chapter}){
  const scope=selected.id+':'+chapter.id;
  const [refresh,setRefresh]=useState({scope:'',count:0});
  const snapshotAt=Date.now();
  const items=readItems('chapter:'+selected.id+':'+chapter.id,chapterIds(selected.id,chapter.id));
  const bank=items.filter(p=>!metadata[p.exam.id].archived),pilotBank=items.filter(p=>metadata[p.exam.id].archived);
  const history=readHistory(localStore(),items.map(p=>p.exam));
  const returnURL=practiceURL(selected.id,chapter.id);
  const chapterBank=bank.filter(p=>p.track===selected.id&&p.chapter===chapter.id).sort((a,b)=>a.order-b.order);
  const routeGroups=routeGroupsOf(sequences[`${selected.id}:${chapter.id}`]).map(g=>({...g,items:g.items.flatMap(it=>{const p=bank.find(b=>b.exam.id===it.id);return p?[{...it,p}]:[];})})).filter(g=>g.items.length>0);
  const chapterRoute=routeGroups.flatMap(g=>g.items.map(i=>i.p));
  const inRoute=new Set(chapterRoute.map(p=>p.exam.id));
  let draftReadFailed=false;
  const attempts=new Map(chapterBank.map(p=>{const r=readDraft(localStore(),p.exam);if(!r.ok)draftReadFailed=true;return [p.exam.id,r.ok?r.value:null] as const}));
  const actionLabel=(p:PracticeItem)=>reviewOnly(p)?'Xem kết quả bài '+p.order:attempts.get(p.exam.id)?.submittedAt===null?'Làm tiếp bài '+p.order:attempts.get(p.exam.id)?.submittedAt!=null?'Xem kết quả bài '+p.order:'Làm bài '+p.order;
  const samples=pilotBank.filter(p=>p.track===selected.id&&p.chapter===chapter.id);
  const visibleIds=new Set([...chapterBank,...samples].map(p=>p.exam.id));
  const entries=history.items.filter(p=>visibleIds.has(p.exam.id));
  const pending=chapterBank.flatMap(p=>{const draft=attempts.get(p.exam.id);return draft&&draft.submittedAt===null?[{id:p.exam.id,title:p.presentationTitle??p.exam.title,href:practiceURL(selected.id,chapter.id,p.exam.id),updatedAt:draft.updatedAt,deadline:draft.deadline}]:[];});
  const saved=entries.map(e=>({attemptId:e.draft.attemptId,examId:e.exam.id,title:bank.find(p=>p.exam.id===e.exam.id&&p.exam.versionHash===e.exam.versionHash)?.presentationTitle??e.exam.title,href:returnURL+'&luot='+encodeURIComponent(e.draft.attemptId),submittedAt:e.draft.submittedAt!}));
  const hasAttempt=(p:PracticeItem)=>!!attempts.get(p.exam.id)||entries.some(e=>e.exam.id===p.exam.id);
  // DL-01 (review Codex vòng 2): bài chờ phản biện chỉ còn lượt trong lịch sử thì thẻ dẫn thẳng tới lượt đã nộp gần nhất.
  const reviewOnly=(p:PracticeItem)=>historyOnlyAttempt(p,!!attempts.get(p.exam.id),entries.filter(e=>e.exam.id===p.exam.id).map(e=>e.draft));
  const cardHref=(p:PracticeItem)=>{const luot=reviewOnly(p);return luot?practiceURL(selected.id,chapter.id)+'&luot='+encodeURIComponent(luot):practiceURL(selected.id,chapter.id,p.exam.id);};
  const available=chapterBank.filter(p=>!p.isChapterEnd&&!p.sourceEdition&&!inRoute.has(p.exam.id)&&shelfVisible(p,hasAttempt(p))),final=chapterBank.find(p=>p.isChapterEnd&&!p.sourceEdition&&!inRoute.has(p.exam.id)&&shelfVisible(p,hasAttempt(p))),exact=chapterBank.filter(p=>p.sourceEdition&&!inRoute.has(p.exam.id));
  const openCount=available.filter(p=>!awaitingReview(p)).length;
  const targetCount=Math.max(chapter.plannedPracticeTests??10,available.length);
  const thpt=['10','11','12'].includes(selected.id);
  const sourceGroups=Array.from(new Set(exact.map(p=>`${p.sourceSequence?.fileId??p.exam.sourceHash}:${p.sourceSequence?.lesson??p.order}`))).map(key=>exact.filter(p=>`${p.sourceSequence?.fileId??p.exam.sourceHash}:${p.sourceSequence?.lesson??p.order}`===key).sort((a,b)=>(a.sourceSequence?.sequence??a.order)-(b.sourceSequence?.sequence??b.order)));
  const sourceAction=(p:PracticeItem)=>`${attempts.get(p.exam.id)?.submittedAt===null?'Làm tiếp':attempts.get(p.exam.id)?.submittedAt!=null?'Xem kết quả':'Làm'} bài ${p.sourceSequence?.sequence??p.order}`;
  return <>
        {ON_CHUONG.has(scope)&&<Suspense fallback={null}><OnChuongPanel/></Suspense>}
        <section className="cp-saved-work" aria-label="Đọc lại bài đã lưu"><p>Nếu em vừa làm bài ở tab khác, đọc lại danh sách để xem bản lưu mới. Thao tác này giữ nguyên câu trả lời, lịch sử và các tiện ích đang mở.</p><button type="button" onClick={()=>setRefresh(old=>({scope,count:old.scope===scope?old.count+1:1}))}>Đọc lại bài đã lưu</button>{refresh.scope===scope&&<p role="status" aria-live="polite" aria-atomic="true">Đã đọc lại phần lưu truy cập được, lần {refresh.count}. Nếu có cảnh báo, danh sách có thể thiếu bài.</p>}</section>
        <PracticeResume key={'pending:'+scope} items={pending} incomplete={draftReadFailed||history.messages.length>0} snapshotAt={snapshotAt} label={['HSA','TSA'].includes(selected.id)?'chủ đề':'chương'}/>
        {chapterRoute.length>0&&<section className="cp-exact-list cp-route" aria-label="Lộ trình luyện chương"><h3>Lộ trình luyện chương</h3><p>Bài 1 hệ thống công thức và lý thuyết; sau đó luyện theo từng bài học, chuyên đề và dạng, đề sau khó hơn đề trước, có bài toán thực tế; cuối cùng là đề tổng hợp, kiểm tra chương.</p>{routeGroups.map(g=><section key={g.title||'route'} className="cp-route-group">{g.title?<h4>{g.title}</h4>:null}{g.note?<p>{g.note}</p>:null}<ol className="cp-test-grid">{g.items.map(({p,level,dangs})=>{const n=sequenceNumber.get(p.exam.id)??0;return <li key={p.exam.id}><article><span className="cp-test-index">Bài {n}{p.isFoundation?<> · Hệ thống lý thuyết</>:null}{p.isChapterEnd?<> · Tổng hợp cuối chương</>:null}{!p.isFoundation&&p.sourceSequence?.test?<> · {testLabel(p.sourceSequence.test)}</>:null}{level?<> · Mức {level}</>:null}</span><h3>{p.coverage}</h3>{dangs?.length?<p>Dạng: {dangs.join('; ')}</p>:null}<p>{p.exam.questions.length} câu · 3 phần · {p.exam.durationMinutes} phút · thang 10</p><p>{entries.filter(e=>e.exam.id===p.exam.id).length} lượt đã nộp</p><Link className="mig-button cp-action-button" href={practiceURL(selected.id,chapter.id,p.exam.id)}>{attempts.get(p.exam.id)?.submittedAt===null?'Làm tiếp':attempts.get(p.exam.id)?.submittedAt!=null?'Xem kết quả':'Làm'} bài {n}<span aria-hidden="true">→</span></Link></article></li>;})}</ol></section>)}</section>}
        {thpt&&(exact.length>0||chapterRoute.length===0)&&<section className="cp-exact-list" aria-label="Đề theo bộ tài liệu MTM"><h3>Luyện theo thứ tự tài liệu</h3><p>Mỗi đề giữ trọn câu hỏi, hình và bảng; đi theo từng bài của file nguồn rồi đến ôn tập cuối chương.</p>{sourceGroups.length?sourceGroups.map(group=><section key={`${group[0].sourceSequence?.fileId}:${group[0].sourceSequence?.lesson}`}><h4>{lessonName(group[0].sourceSequence?.lessonTitle??group[0].coverage)}</h4><ol className="cp-test-grid">{group.map(p=><li key={p.exam.id}><article><span className="cp-test-index">Bài {p.sourceSequence?.sequence??p.order}{p.sourceSequence?.test?<> · {testLabel(p.sourceSequence.test)}</>:null}</span><h3>{p.coverage}</h3><p>{p.exam.questions.length} câu · 3 phần · {p.exam.durationMinutes} phút · thang 10</p><p>{entries.filter(e=>e.exam.id===p.exam.id).length} lượt đã nộp</p><Link className="mig-button cp-action-button" href={practiceURL(selected.id,chapter.id,p.exam.id)}>{sourceAction(p)}<span aria-hidden="true">→</span></Link></article></li>)}</ol></section>):<p>Đề theo tài liệu của chương này đang được đối chiếu đủ câu, hình và lời giải trước khi mở.</p>}</section>}
        <details className="cp-previous-bank" open={thpt?undefined:true}><summary>{thpt?'Các bài luyện đã có · giữ riêng với lịch sử cũ':'Các bài luyện đang có'}</summary>
        <p className="cp-ready-count" role="status">{openCount}/{targetCount} bài luyện đã mở.</p>
        {available.length>0?<ol className="cp-test-grid">{available.map(p=><li key={p.exam.id}><article>
          <span className="cp-test-index">Bài {p.order}/{targetCount}</span>{isWarmup(p)&&<span className="cp-warmup-badge">{WARMUP_LABEL}</span>}{awaitingReview(p)&&<span className="cp-review-badge">Chờ phản biện · chỉ làm tiếp hoặc xem lại</span>}<h3>{p.coverage}</h3><p>{p.exam.questions.length} câu · {p.exam.durationMinutes} phút · thang 10</p>
          <p>{entries.filter(e=>e.exam.id===p.exam.id).length} lượt đã nộp</p>
          <Link className="mig-button cp-action-button" href={cardHref(p)}>{actionLabel(p)}<span aria-hidden="true">→</span></Link>
        </article></li>)}</ol>:<div className="cp-empty"><h3>{['HSA','TSA'].includes(selected.id)?'Chủ đề':'Chương'} này chưa có bộ bài đã kiểm</h3><p>Bài sẽ được mở khi đề, đáp án và lời giải đã được đối chiếu. Có thể chọn Chương I lớp 10 để luyện ngay.</p><Link href={practiceURL('10','1')} className="mig-button outline">Luyện Mệnh đề và tập hợp</Link></div>}
        {final?<article className="cp-final"><p className="mig-eyebrow">TỰ KIỂM TRA SAU KHI LUYỆN</p>{awaitingReview(final)&&<span className="cp-review-badge">Chờ phản biện · chỉ làm tiếp hoặc xem lại</span>}<h3>Kiểm tra kết thúc chương</h3><p>{final.exam.questions.length} câu · {final.exam.durationMinutes} phút · thang 10 · bao phủ các dạng của chương.</p><p>{entries.filter(e=>e.exam.id===final.exam.id).length} lượt đã nộp</p><Link className="mig-button cp-action-button" href={cardHref(final)}>{reviewOnly(final)?'Xem kết quả bài kết thúc chương':attempts.get(final.exam.id)?.submittedAt===null?'Làm tiếp bài kết thúc chương':attempts.get(final.exam.id)?.submittedAt!=null?'Xem kết quả bài kết thúc chương':'Làm bài kết thúc chương'}<span aria-hidden="true">→</span></Link></article>:<p className="cp-end-note">Bài kiểm tra kết thúc {['HSA','TSA'].includes(selected.id)?'chủ đề':'chương'}: chưa có bản đã kiểm.</p>}
        </details>
        {samples.some(p=>entries.some(e=>e.exam.id===p.exam.id))&&<details className="cp-source-samples"><summary>Phiên bản ngắn trước đây · giữ để đọc lịch sử</summary>{samples.map(p=><article key={p.exam.id}><h3>{p.exam.title}</h3><p>{p.limits[0]}</p><Link className="mig-button outline" href={practiceURL(selected.id,chapter.id,p.exam.id)}>Mở phiên bản cũ lớp {p.exam.grade}</Link></article>)}</details>}
        <PracticeHistory key={'history:'+scope} items={saved} messages={history.messages} label={['HSA','TSA'].includes(selected.id)?'chủ đề':'chương'}/>
  </>;
}
