import type {PracticeExam} from '../exams/data';

export type PublishedLessonPreviewRequest = {
  uploadId:string;
  classId:string;
  paper:1|2;
  isTest:boolean;
};

export type PublishedLessonPreviewData = {
  uploadId:string;
  classId:string;
  className:string;
  kind:'homework'|'exam';
  paper:1|2;
  lessonCode:string;
  sourceVersion:string;
  title:string;
  exam:PracticeExam;
};

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parsePublishedLessonPreviewRequest(value:unknown):PublishedLessonPreviewRequest|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const {uploadId,classId,paper,isTest}=value as Record<string,unknown>;
  if(typeof uploadId!=='string'||!uuid.test(uploadId)||typeof classId!=='string'||!uuid.test(classId)
    ||(paper!==1&&paper!==2)||typeof isTest!=='boolean')return null;
  return {uploadId,classId,paper,isTest};
}

export function readPublishedLessonPreview(value:unknown,request:PublishedLessonPreviewRequest):PublishedLessonPreviewData|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const {uploadId,classId,className,kind,paper,lessonCode,sourceVersion,title,exam}=value as Partial<PublishedLessonPreviewData>;
  if(uploadId!==request.uploadId||classId!==request.classId||paper!==request.paper)return null;
  if((kind!=='exam'&&kind!=='homework')||(kind==='exam'&&paper!==1))return null;
  if(typeof className!=='string'||!className.trim()||typeof title!=='string'||!title.trim())return null;
  if(typeof lessonCode!=='string'||!/^[a-z0-9][a-z0-9-]{0,159}$/.test(lessonCode)
    ||typeof sourceVersion!=='string'||!/^[a-f0-9]{64}$/.test(sourceVersion))return null;
  if(!exam||typeof exam!=='object'||!Array.isArray(exam.questions)||exam.questions.length===0
    ||exam.questions.some(q=>!q||typeof q.id!=='string'||!['mc','tf','short','self'].includes(q.kind)))return null;
  return {uploadId,classId,className,kind,paper,lessonCode,sourceVersion,title,exam};
}
