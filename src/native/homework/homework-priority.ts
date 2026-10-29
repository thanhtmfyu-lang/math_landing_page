import type {HomeworkLesson} from './btvn-contract';

export const isHomeworkLocked=(lesson:HomeworkLesson,now:number)=>Number.isFinite(lesson.opensAt)?now<lesson.opensAt!:lesson.locked===true;
export const homeworkPriorityDeadline=(lesson:HomeworkLesson)=>{
  const at=lesson.kind==='kiem-tra-thang'?lesson.closesAt:lesson.dueAt;
  return at!=null&&Number.isFinite(at)?at:null;
};
const deadline=homeworkPriorityDeadline;
const category=(lesson:HomeworkLesson,now:number)=>{const due=deadline(lesson);return due===null?2:due>now?0:1;};

/** Chỉ gợi ý từ danh sách trong phiên; không tự tạo lượt hoặc thay quyền mở/hạn. */
export function nextHomework(lessons:HomeworkLesson[],now:number):HomeworkLesson|undefined{
  if(!Number.isFinite(now))return undefined;
  return lessons.filter(l=>l.available&&!isHomeworkLocked(l,now)&&l.bestScore===null&&l.submittedAt==null&&(l.kind!=='kiem-tra-thang'||(deadline(l)!==null&&now<deadline(l)!))).sort((a,b)=>{
    const group=category(a,now)-category(b,now);if(group)return group;
    const ad=deadline(a),bd=deadline(b);
    if(ad!==null&&bd!==null&&ad!==bd)return ad-bd;
    return a.date.localeCompare(b.date)||a.lessonCode.localeCompare(b.lessonCode);
  })[0];
}

export function homeworkPriorityReason(lesson:HomeworkLesson,now:number):string{
  const group=category(lesson,now);
  return group===0?'Bài đang mở có hạn nộp gần nhất.':group===1?'BTVN chưa nộp đã quá hạn. Nộp bài sẽ ghi nhận muộn theo quy định.':'Em có thể mở bài để xem nội dung và hạn nộp.';
}
