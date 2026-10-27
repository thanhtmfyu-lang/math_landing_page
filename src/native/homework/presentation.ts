import type {HomeworkState,HomeworkLesson,LessonMaterial} from './btvn-contract';
export const isDemoVideo=(id:string)=>id==='abcdefghijk';
export const displayClassName=(state:HomeworkState)=>state.demo&&/^LOP-TEST-/i.test(state.className)?'Lớp học thử':state.className;
// Giữ nguyên các bài trong đợt thi tháng, kể cả thẻ BTVN đi kèm.
export const protectedMonthlyLesson=(lesson:LessonMaterial)=>lesson.kind==='kiem-tra-thang'||/^thi-thang-/.test(lesson.lessonCode);
const titleText=(raw:string='')=>raw.normalize('NFC').replace(/_/g,' ');
export function cleanHomeworkTitle(raw:string=''){
  return titleText(raw).replace(/\[L\d+\]/gi,' ')
    .replace(/\[(?:Có đính chính|tự luận nộp vở)[^\]]*\]|\((?:Có đính chính|tự luận nộp vở)[^)]*\)/gi,' ')
    .replace(/\b\d{4}[-_. /]\d{1,2}[-_. /]\d{1,2}\b|\b\d{1,2}[-_. /]\d{1,2}[-_. /]\d{4}\b/g,' ')
    .replace(/(?:\.pdf)+\b/gi,' ').replace(/\s+/g,' ').trim().replace(/(?:\s+pdf)+$/gi,'').replace(/^[\s·:–-]+|[\s·:–-]+$/g,'').trim();
}
/** Chú thích học vụ vẫn hiện riêng, không bị mất khi dọn tiêu đề. */
export function homeworkDisplayNote(lesson?:LessonMaterial,examTitle?:string){
  if(lesson&&protectedMonthlyLesson(lesson))return lesson.homeworkNote?.trim()||'';
  const notes=[lesson?.homeworkTitle,lesson?.title,examTitle].flatMap(raw=>
    [...titleText(raw).matchAll(/\[((?:Có đính chính|tự luận nộp vở)[^\]]*)\]|\(((?:Có đính chính|tự luận nộp vở)[^)]*)\)/gi)].map(m=>(m[1]??m[2]).trim()));
  return [...new Set([...notes,lesson?.homeworkNote?.trim()].filter(Boolean))].join(' · ');
}
const descriptiveTitle=(title:string)=>!!title&&!/^(?:đề|bài tập về nhà|btvn|buổi học|hslt|pdf)$/i.test(title);
export function homeworkTitle(state:HomeworkState){
  const lesson=state.lessons?.find(l=>l.lessonCode===state.lessonCode);
  if(state.kind==='kiem-tra-thang'||(lesson&&protectedMonthlyLesson(lesson)))return state.exam?.title??'Bài tập về nhà';
  const title=cleanHomeworkTitle(state.exam?.title);
  return descriptiveTitle(title)?title:lesson?lessonHomeworkTitle(lesson):title||'Bài tập về nhà';
}
export function lessonHomeworkTitle(lesson:LessonMaterial){
  if(protectedMonthlyLesson(lesson))return lesson.homeworkTitle?.trim()||lesson.homeworkNote?.trim()||'Bài tập về nhà';
  const title=cleanHomeworkTitle(lesson.homeworkTitle),materialTitle=cleanHomeworkTitle(lesson.title);
  return descriptiveTitle(title)?title:descriptiveTitle(materialTitle)?materialTitle:cleanHomeworkTitle(lesson.homeworkNote)||'Bài tập về nhà';
}
export function lessonCaption(lesson:LessonMaterial,demo=false){return 'Buổi học '+lesson.date.slice(8,10)+'/'+lesson.date.slice(5,7)+': '+(demo?lesson.title.replace(/^Bài mẫu thử: /,''):protectedMonthlyLesson(lesson)?lesson.title:cleanHomeworkTitle(lesson.title));}
export function homeworkLessonCaption(state:HomeworkState){const lesson=state.lessons?.find(l=>l.lessonCode===state.lessonCode);return lesson?lessonCaption(lesson,state.demo):null;}

export const MISSING_HOMEWORK_DEADLINE='Hạn nộp: em liên hệ trợ lý lớp để được hỗ trợ.';
const validTime=(at:unknown):at is number=>typeof at==='number'&&Number.isSafeInteger(at)&&at>0&&at<=253402300799999;
export const deadlineTime=(at:number)=>new Date(at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
/** Hạn thật của bài đang chọn có thể chỉ nằm ở state, không có trên thẻ.
 * Không nâng expectedDueAt/lịch dự phòng thành hạn thật, không đổi chấm muộn. */
export function displayHomeworkDeadline(lesson?:HomeworkLesson,selectedDueAt?:number|null){
  const actual=lesson?.kind==='kiem-tra-thang'?lesson.closesAt:validTime(selectedDueAt)?selectedDueAt:lesson?.dueAt;
  if(validTime(actual))return (lesson?.kind==='kiem-tra-thang'?'Đóng: ':'Hạn: trước ')+deadlineTime(actual)+' (theo lịch lớp, giờ Việt Nam)';
  if(validTime(lesson?.expectedDueAt))return 'Hạn dự kiến: trước '+deadlineTime(lesson.expectedDueAt)+' (theo lịch lớp, giờ Việt Nam)';
  return MISSING_HOMEWORK_DEADLINE;
}
/** Chỉ gộp cùng lessonCode: tên/URL PDF giống nhau không chứng minh cùng bài.
 * Không gộp khác mã khi chưa có định danh nội dung/phạm vi được xác nhận. */
export function displayHomeworkLessons(lessons:HomeworkLesson[]){
  const unique=new Map<string,number>(),result:HomeworkLesson[]=[];
  for(const lesson of lessons){
    if(protectedMonthlyLesson(lesson)){result.push(lesson);continue;}
    const index=unique.get(lesson.lessonCode);
    if(index===undefined){unique.set(lesson.lessonCode,result.length);result.push(lesson);continue;}
    const previous=result[index];
    // Giữ snapshot có biên nhận mới nhất khi payload lặp cùng bài.
    if((lesson.submittedAt??-1)>(previous.submittedAt??-1))result[index]=lesson.dueAt===undefined&&validTime(previous.dueAt)?{...lesson,dueAt:previous.dueAt}:lesson;
  }
  return result;
}
/** Khác mã, cùng tên/ngày: đánh số để chọn đúng thẻ, không suy là trùng nội dung. */
export function distinctHomeworkTitle(lesson:HomeworkLesson,lessons:HomeworkLesson[]){
  const title=lessonHomeworkTitle(lesson);
  if(protectedMonthlyLesson(lesson))return title;
  const matching=displayHomeworkLessons(lessons).filter(l=>l.date===lesson.date&&lessonHomeworkTitle(l)===title);
  const peers=matching.filter(l=>!protectedMonthlyLesson(l)).sort((a,b)=>a.lessonCode.localeCompare(b.lessonCode,'en',{numeric:true}));
  return peers.length>1?title+' · Bài '+(peers.findIndex(l=>l.lessonCode===lesson.lessonCode)+1):matching.length>1?title+' · Bài bổ sung':title;
}
