import type {HomeworkLesson} from './btvn-contract';
export const isClassTest=(lesson:Pick<HomeworkLesson,'kind'>)=>lesson.kind==='kiem-tra';
export function classTestState(lesson:HomeworkLesson,now:number){
 if(lesson.submittedAt!=null)return 'submitted' as const;
 if(lesson.startedAt!=null)return 'started' as const;
 if(lesson.locked===true||lesson.opensAt!==undefined&&now<lesson.opensAt)return 'locked' as const;
 if(lesson.closesAt!==undefined&&now>=lesson.closesAt)return 'closed' as const;
 return lesson.available?'open' as const:'preparing' as const;
}
/** Only display server-provided cards. Selecting a card does not start an attempt. */
export default function ClassTestsSection({lessons,now,busy,onSelect}:{lessons:HomeworkLesson[];now:number;busy:boolean;onSelect:(code:string)=>void}){
 const tests=lessons.filter(isClassTest).sort((a,b)=>b.date.localeCompare(a.date)||a.lessonCode.localeCompare(b.lessonCode));
 if(!tests.length)return null;
 const date=(at:number|undefined)=>at!==undefined&&Number.isFinite(at)?new Date(at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Chờ lịch từ máy chủ';
 const labels={submitted:'Đã nộp',started:'Có lượt đang làm',locked:'Chưa mở',closed:'Đã đóng',open:'Đang mở',preparing:'Đang chuẩn bị'};
 return <section className="mtm-class-tests" aria-labelledby="mtm-class-tests-heading"><header><div><p>KIỂM TRA CỦA LỚP</p><h2 id="mtm-class-tests-heading">Đề kiểm tra</h2></div><span>{tests.length} đề</span></header><p>Đề kiểm tra có lượt làm và kết quả riêng. Máy chủ xác nhận giờ mở, giờ đóng và thời điểm công bố.</p><div className="mtm-class-test-list">{tests.map(lesson=>{const status=classTestState(lesson,now);return <article key={lesson.assessmentId??lesson.lessonCode}><p>{lesson.examType==='monthly'?'Kiểm tra kết thúc tháng':'Kiểm tra khác'} · {labels[status]}</p><h3>{lesson.title}</h3><dl><div><dt>Mở</dt><dd>{date(lesson.opensAt)}</dd></div><div><dt>Đóng</dt><dd>{date(lesson.closesAt)}</dd></div>{lesson.durationMinutes!==undefined&&<div><dt>Thời lượng</dt><dd>{lesson.durationMinutes} phút</dd></div>}<div><dt>Số lượt</dt><dd>{lesson.maxAttempts??'Theo máy chủ'}</dd></div></dl>{lesson.submittedAt!=null&&<p>{lesson.solutionsAvailable===true&&lesson.bestScore!==null?`Điểm: ${lesson.bestScore.toLocaleString('vi-VN')}/10`:'Đã nộp · chờ máy chủ công bố kết quả'}</p>}<button type="button" className="r104-hw-primary" disabled={busy||['locked','preparing'].includes(status)} onClick={()=>onSelect(lesson.lessonCode)}>{status==='submitted'?'Xem bài đã nộp':status==='started'?'Tiếp tục bài kiểm tra':'Xem thông tin đề'}</button></article>;})}</div></section>;
}
