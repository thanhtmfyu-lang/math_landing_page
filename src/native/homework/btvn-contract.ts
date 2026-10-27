import type {PracticeExam} from '../exams/data';
import type {Draft, Answers} from '../exams/store';
import type {MtmScore} from '../exams/mtm-scoring';
import type {ClassOverview} from '../../../server/btvn/class-overview';

export type GateInput = {studentCode:string}|{fullName:string; phone:string; className:string; pin?:string; newPin?:string};
export type HomeworkReceipt = {attemptId:string; attemptNumber:number; submittedAt:number; elapsedSeconds:number; score:number|null; gradingPending?:boolean;officialScore?:number;rubricVersion?:string;mtm?:MtmScore; late:boolean|null; timedOut:boolean};
export type LessonMaterial = {kind?:'btvn'|'kiem-tra-thang';opensAt?:number;closesAt?:number;classOpensAt?:Record<string,string>;lessonCode:string;classNames:string[];classDates?:Record<string,string>;date:string;title:string;titleSource?:'sheet'|'auto';videoId:string|null;videoUrl?:string|null;homeworkUrls?:string[];homeworkNote?:string;homeworkScope?:string;homeworkScopeSource?:'sheet'|'auto'|'whole_file';homeworkTitle?:string;materialUrl:string|null;handoutUrl:string|null;homeworkUrl:string|null};
export type HomeworkLesson = LessonMaterial & {pendingGrading?:boolean;locked?:boolean;expectedDueAt?:number|null;videoEmbeddable?:boolean|null;dueAt:number|null;bestScore:number|null;late:boolean|null;submittedAt:number|null;available:boolean};
export type HomeworkState = {essayUploadAvailable?:boolean;classOverview?:ClassOverview;assetWarnings?:string[];serverNow?:number;clientReceivedAt?:number;saveOnly?:boolean;revision?:number;assetsExpiresAt?:number;kind?:'btvn'|'kiem-tra-thang';opensAt?:number;closesAt?:number;solutionsAvailable?:boolean;canStart?:boolean;exam:PracticeExam|null; classMismatch?:boolean; fullName:string; className:string; lessonCode:string; dueAt:number|null; maxAttempts:number; attemptsUsed:number; draft:Draft|null; receipts:HomeworkReceipt[]; bestScore:number|null; demo:boolean;lessons?:HomeworkLesson[]};
export type HomeworkAction = 'login'|'state'|'start'|'save'|'submit'|'logout'|'select';
/** Giao diện duy nhất giữa trình duyệt và máy chủ; không chứa danh sách học sinh. */
export interface HomeworkGateway {
  call(action:HomeworkAction, body?:{lessonCode?:string;gate?:GateInput;attemptId?:string;answers?:Answers}):Promise<HomeworkState>;
}
