import type {PdfAsset} from '../admin/model';
export type Profile={fullName:string;school:string;schoolClass:string;centerClass:string;classId:string;publicAlias:string};
export type Answers=Record<string,string|Array<boolean|null>>;
export type HwQuestion={id:string;kind:'mc'|'tf'|'short';partId:string;partLabel:string;sourceRef:string;maxMillipoints:number;mode?:string;answer?:string|boolean[];acceptedAnswers?:string[];solution?:string};
export type HwExam={title:string;durationMinutes:number;questionCount:number;questionPdf:PdfAsset;questions:HwQuestion[]};
export type Assignment={id:string;title:string;opensAt:string;dueAt:string;durationMinutes:number;month:string;versionHash:string;questionCount:number};
export type Attempt={kind?:'btvn'|'kiem-tra-thang'|'kiem-tra';closesAt?:string;attemptId:string;attemptNumber:number;startedAt:string;deadline:string;serverNow:string;revision:number;answers:Answers;versionHash:string;exam:HwExam};
export type Score={earnedMillipoints:number;maxMillipoints:number;parts:Array<{id:string;label:string;earnedMillipoints:number;maxMillipoints:number}>;rows:Array<{id:string;status:'blank'|'correct'|'partial'|'wrong';earnedMillipoints:number;maxMillipoints:number}>};
export type History={attemptId:string;assignmentId:string;title:string;attemptNumber:number;submittedAt:string;elapsedMs:number;qualifying:boolean;late:boolean;score:Score};
export type Result=Omit<History,'assignmentId'>&{answers:Answers;reviewQuestions:HwQuestion[];solutionPdf?:PdfAsset};
export type Rank={alias:string;cohort:string;rank:number;percentage:number;assignedCount:number;completedCount:number;attemptCount:number;elapsedMs:number};
export interface HomeworkApi{
 resolve(code:string):Promise<{ok:boolean;message?:string;challenge?:string;profile?:Profile}>;
 confirm(challenge:string):Promise<{ok:boolean;session?:string;expiresAt?:string;profile?:Profile}>;
 logout(session:string):Promise<void>;
 assignments(session:string):Promise<Assignment[]>;
 history(session:string):Promise<History[]>;
 leaderboard(classId:string,month:string):Promise<Rank[]>;
 start(session:string,id:string):Promise<Attempt>;
 save(session:string,attempt:string,revision:number,answers:Answers):Promise<{revision:number;answers:Answers;serverNow:string}>;
 submit(session:string,attempt:string,revision:number,answers:Answers,key:string):Promise<Result>;
 result(session:string,attempt:string):Promise<Result>;
 pdf(session:string,attempt:string,kind:'questions'|'solutions'):Promise<Blob>;
}
export const points=(n:number)=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:3}).format(n/1000);
export const time=(ms:number)=>`${Math.floor(ms/60000)} phút ${Math.floor(ms/1000)%60} giây`;
export const date=(s:string)=>new Date(s).toLocaleString('vi-VN');
