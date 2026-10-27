import type {ReactNode} from 'react';
import type {PracticeExam,PracticeQuestion} from './data';
import type {Store,Draft} from './store';
import type {ScoreResult} from './assessment';
export type PracticeAttemptProps = {onOpenEssay?:()=>void;onServerStart?:(previous:Draft|null)=>Promise<void>;onServerSubmit?:(draft:Draft)=>Promise<Draft['answers']|void>;serverScore?:ScoreResult;exam: PracticeExam; previousExam?:PracticeExam; catalogUrl: string; storeOverride?:Store;questionReader?:ReactNode;renderText?:(text:string)=>ReactNode;renderSolutionExtra?:(q:PracticeQuestion)=>ReactNode;contextLabel?:string;audienceLabel?:string;displayTitle?:string;kind?:'practice'|'exam';isHomework?:boolean;homeworkSelfCheck?:ReactNode;deadlineAt?:number;clockOffsetMs?:number;newAttemptsClosed?:string;storageNotice?:string;saveStatus?:string;savePending?:boolean;onRetrySave?:()=>void;onAcceptClosed?:()=>void;onRetake?:()=>void};
