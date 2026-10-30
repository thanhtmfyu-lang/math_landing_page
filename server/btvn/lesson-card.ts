import type {HomeworkLesson,LessonMaterial} from '../../src/native/homework/btvn-contract';
import {visibleLesson} from './opening-policy';

type LessonProgress=Partial<Pick<HomeworkLesson,'startedAt'|'pendingGrading'|'dueAt'|'bestScore'|'late'|'submittedAt'|'available'>>;

/** Cùng một chính sách công bố cho thẻ do service hoặc snapshot DB dựng lên.
 * Biên nhận vẫn giữ thời điểm nộp; liên kết và điểm chỉ mở sau giờ đóng. */
export function homeworkLessonCard(material:LessonMaterial,className:string,now:number,progress:LessonProgress=material as Partial<HomeworkLesson>):HomeworkLesson {
  const visible=visibleLesson(material,className,now),hidden=material.kind==='kiem-tra-thang'&&now<(material.closesAt??Infinity);
  const card:HomeworkLesson={...visible,startedAt:progress.startedAt??null,pendingGrading:!visible.locked&&!hidden&&progress.pendingGrading===true,dueAt:progress.dueAt??null,bestScore:visible.locked||hidden?null:progress.bestScore??null,
    late:visible.locked||hidden?null:progress.late??null,submittedAt:visible.locked?null:progress.submittedAt??null,available:!visible.locked&&progress.available===true};
  return hidden?{...card,materialUrl:null,handoutUrl:null,homeworkUrl:null,homeworkUrls:[],videoId:null,videoUrl:null}:card;
}
