import verifiedCatalog from './catalog.json';
import type {Assessment, Question, Validation} from './assessment';
import type {SourceSegment} from './MtmSourceContent';
import {FLEX_RUBRIC,validatePracticeProfile,type ExamSection} from './flexible-profile';
import {MTM_PROFILE} from './mtm-profile';
import {MTM_SCORING_VERSION} from './mtm-scoring';
import {isMtmQuestionPoints} from './mtm-assessment';
import {validPublicShortFormat,type PublicShortFormat} from './short-format';

export const GRADES = [10, 11, 12] as const;
export const PERIODS = ['GK1', 'CK1', 'GK2', 'CK2'] as const;
export type Grade = typeof GRADES[number];
export type Period = typeof PERIODS[number];
export const PERIOD_LABELS: Record<Period, string> = {
  GK1: 'Giữa kỳ I', CK1: 'Cuối kỳ I', GK2: 'Giữa kỳ II', CK2: 'Cuối kỳ II',
};
export type PracticeQuestion = Exclude<Question, {kind: 'essay'}> & {
  solutionBlocks?:({type:'text';text:string}|{type:'math';latex:string}|{type:'table';headers:string[];rows:string[][]})[];
  prompt?: string;
  text?: string;
  solution?: string;
  /** Optional verbatim statement texts; otherwise sourceRef + a/b/c/d locates them. */
  statements?: [string, string, string, string];
  /** Trang PDF chứa đúng câu này, thuộc sourcePdf.questionPages. Cần khi dùng
   * PDF làm nguồn trình bày thay cho văn bản bốn ý Đúng/Sai. */
  sourcePdfPage?: number;
  sourceContent?:{questions:SourceSegment[];solutions?:SourceSegment[]};
  correctionNote?:string;
  convertedFrom?:'essay';
  /** Public input requirements only. No answer key or verification evidence. */
  shortFormat?:PublicShortFormat;

};
export interface PracticeExam extends Assessment {
  serverGraded?:true;
  /** Transport for server-graded homework. Never sufficient for local scoring. */
  responseMode?:'questions-only';
  sections?:ExamSection[];
  grade: Grade;
  period: Period;
  title: string;
  durationMinutes: number;
  versionHash: string;
  rubricVersion: string;
  sourceUrl: string;
  publicationVerified: true;
  questionDisplayVerified: true;
  sourceMaterial: {title: string; publisher: string; version: string; locator: string};
  answerVerificationNote?: string;
  preAttemptNotice?: string;
  /** Non-fatal server warnings when optional document assets cannot be loaded. */
  assetWarnings?:string[];
  /** Only expose a PDF before submission when it is separately verified to
   * contain questions only, without an answer key or solutions. */
  sourcePdf?: {url: string; verified: true; sha256: string; bytes: number; totalPages: number; questionPages: number[]};
  sourceInstructions?:SourceSegment[];
  solutionInstructions?:SourceSegment[];
  mtmDocuments?:{questions:{url:string;sha256:string};solutions?:{url:string;sha256:string}};
  questions: PracticeQuestion[];
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const boundedText = (value: unknown, max = 500): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-fA-F0-9]{64}$/.test(value);
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096 || value !== value.trim()) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
}
export function validPdfUrl(value: unknown, sha256: unknown): value is string {
  if(typeof value!=='string'||!isSha256(sha256))return false;
  if(value.startsWith('/'))return sha256===sha256.toLowerCase()&&(value===`/exam-assets/${sha256}.pdf`||value===`/qa-exam-assets/${sha256}.pdf`);
  return isHttpsUrl(value);
}
export function validSourcePdf(value:unknown):boolean {
  if(!isRecord(value)||value.verified!==true||!validPdfUrl(value.url,value.sha256)||!Number.isSafeInteger(value.bytes)||(value.bytes as number)<8||(value.bytes as number)>15*1024*1024||!Number.isSafeInteger(value.totalPages)||(value.totalPages as number)<1||(value.totalPages as number)>200)return false;
  return Array.isArray(value.questionPages)&&value.questionPages.length>0&&new Set(value.questionPages).size===value.questionPages.length&&Array.from(value.questionPages).every(p=>Number.isSafeInteger(p)&&p>=1&&p<=(value.totalPages as number));
}
export function validSourceSegments(value:unknown):value is SourceSegment[] {
  if(!Array.isArray(value)||value.length<1||value.length>12)return false;
  return value.every(segment=>isRecord(segment)&&typeof segment.path==='string'&&segment.path.length<=300&&/^[a-zA-Z0-9][a-zA-Z0-9_/-]*\.png$/.test(segment.path)&&!segment.path.includes('//')&&!segment.path.split('/').includes('..')&&isSha256(segment.sha256)&&Number.isSafeInteger(segment.sourcePage)&&((segment.sourcePage as number)>=1||(segment.mtmAuthored===true&&segment.sourcePage===0))&&Number.isSafeInteger(segment.width)&&(segment.width as number)>=1&&(segment.width as number)<=20000&&Number.isSafeInteger(segment.height)&&(segment.height as number)>=1&&(segment.height as number)<=30000)&&new Set(value.map(segment=>segment.path)).size===value.length;
}
export function validatePracticeExam(input: unknown): Validation {
  const gate = validatePracticeProfile(input);
  if (!gate.valid || !isRecord(input)) return gate;
  if (input.responseMode !== undefined) return {valid:false,errors:['Question-only transport is not a complete scoring exam']};
  return validatePracticePresentation(input, false);
}

/** Checks the public homework transport without inventing answer keys or using
 * the scoring validator. Acceptance only permits collecting responses; grading
 * remains exclusively on the server. */
export function validateQuestionOnlyPracticeExam(input: unknown): Validation {
  if (!isRecord(input)) return {valid:false,errors:['exam: object required']};
  if(input.rubricVersion===MTM_SCORING_VERSION)return validateEqualQuestionPublicExam(input);
  const errors:string[]=[];
  if(input.responseMode!=='questions-only')errors.push('Explicit question-only homework transport required');
  const homework=input.rubricVersion==='MTM-BTVN-10-v1';
  const flexible=homework||input.rubricVersion===FLEX_RUBRIC;
  if(!boundedText(input.sourceRef,20000)||!isSha256(input.sourceHash)||input.answerKeyVerified!==true||input.rubricVerified!==true)errors.push('Invalid verified source or rubric');
  if(!Array.isArray(input.questions)||!input.questions.length||input.questions.length>300)return {valid:false,errors:[...errors,'Complete bounded questions required']};
  if(input.questionCount!==input.questions.length||!Number.isSafeInteger(input.questionCount))errors.push('Question count mismatch');
  const id=input.id;
  if(flexible&&(!boundedText(id,120)||!['mtm-custom-','mtm-preview-','mtm-practice-'].some(prefix=>id.startsWith(prefix))))errors.push('Flexible profile requires a custom edition');
  const units=(n:unknown)=>Number.isSafeInteger(n)&&(n as number)>=0&&(n as number)<=10000;
  const ids=new Set<string>();let total=0;
  for(const q of input.questions){
    if(!isRecord(q)){errors.push('Question object required');continue;}
    if(!boundedText(q.id,120)||q.id!==q.id.trim()||ids.has(q.id))errors.push('Invalid or duplicate question id');else ids.add(q.id);
    if(!boundedText(q.sourceRef,20000))errors.push('Question source required');
    if(!units(q.maxMillipoints)||(q.kind==='self'?q.maxMillipoints!==0:q.maxMillipoints===0))errors.push('Invalid question points');else total+=q.maxMillipoints as number;
    if('answer' in q||'acceptedAnswers' in q||'solution' in q||'solutionBlocks' in q||'shortRule' in q)errors.push('Private answer fields must be absent');
    if('shortFormat' in q)errors.push('Public short format requires the explicit MTM rubric');
    if(q.kind==='mc'){
      if(!Array.isArray(q.choices)||q.choices.length!==4||!Array.from(q.choices).every(c=>boundedText(c,20000))||new Set(q.choices).size!==4)errors.push('Four distinct choices required');
    }else if(q.kind==='tf'){
      const schedule=q.pointsByCorrectCount;
      if(!Array.isArray(schedule)||schedule.length!==5||!Array.from(schedule).every(units)||schedule[0]!==0||schedule[4]!==q.maxMillipoints||schedule.some((n,i)=>i>0&&n<schedule[i-1]))errors.push('Invalid true/false point schedule');
    }else if(q.kind==='short'){
      if(!['numeric','rational','exact'].includes(q.mode as string))errors.push('Explicit short answer mode required');
    }else if(q.kind!=='self'||!homework)errors.push('Unsupported homework question kind');
  }
  if(homework?total<=0:total!==10000)errors.push(homework?'Homework needs a positive scored total':'Total must equal 10000 millipoints');
  if(!flexible){
    if(input.questionCount!==MTM_PROFILE.questionCount)errors.push('MTM profile requires exactly 22 questions');
    input.questions.forEach((q,i)=>{
      const expected=i<MTM_PROFILE.mc?'mc':i<MTM_PROFILE.mc+MTM_PROFILE.tf?'tf':'short';
      if(!isRecord(q)||q.kind!==expected)errors.push('MTM profile requires source order: 12 MC, 4 TF, 6 short');
    });
  }
  if(flexible||input.sections!==undefined){
    if(!Array.isArray(input.sections)||!input.sections.length||input.sections.length>12)errors.push('Sections required');
    else{
      let offset=0;
      for(const section of input.sections){
        if(!isRecord(section)||!boundedText(section.label,100)||!(homework?['mc','tf','short','self']:['mc','tf','short']).includes(section.kind as string)||!Number.isSafeInteger(section.count)||(section.count as number)<1||(section.count as number)>300){errors.push('Invalid section');continue;}
        const count=section.count as number,questions=input.questions.slice(offset,offset+count);
        if(questions.length!==count||questions.some(q=>!isRecord(q)||q.kind!==section.kind))errors.push('Section/question mismatch');
        offset+=count;
      }
      if(offset!==input.questions.length)errors.push('Complete section counts required');
    }
  }
  if(errors.length)return {valid:false,errors};
  return validatePracticePresentation(input,true);
}

/** The new rubric is admitted by its exact version only. The public transport
 * carries exact question maxima, but never a key or the private short rule. */
function validateEqualQuestionPublicExam(input:Record<string,unknown>):Validation {
  const errors:string[]=[];
  if(input.responseMode!=='questions-only')errors.push('Explicit question-only homework transport required');
  if(!boundedText(input.sourceRef,20000)||!isSha256(input.sourceHash)||input.answerKeyVerified!==true||input.rubricVerified!==true)errors.push('Invalid verified source or rubric');
  if(!boundedText(input.answerKeyVersion,160))errors.push('Explicit answer key version required');
  if(input.sourceComplete!==undefined&&typeof input.sourceComplete!=='boolean')errors.push('Invalid sourceComplete');
  if(!Array.isArray(input.questions)||!input.questions.length)return {valid:false,errors:[...errors,'Complete questions required']};
  if(!Number.isSafeInteger(input.questionCount)||input.questionCount!==input.questions.length)errors.push('Question count mismatch');
  const milli=10000/input.questions.length;
  const ids=new Set<string>();
  for(const q of input.questions){
    if(!isRecord(q)){errors.push('Question object required');continue;}
    if(!boundedText(q.id,120)||q.id!==q.id.trim()||ids.has(q.id))errors.push('Invalid or duplicate question id');else ids.add(q.id);
    if(!boundedText(q.sourceRef,20000))errors.push('Question source required');
    if(!isMtmQuestionPoints(q.maxPoints,input.questions.length))errors.push('Question maxPoints must equal exact 10/N');
    if(q.maxMillipoints!==milli)errors.push('Question millipoints must derive from 10000/N');
    if('answer' in q||'acceptedAnswers' in q||'solution' in q||'solutionBlocks' in q||'shortRule' in q)errors.push('Private answer fields must be absent');
    if((q.kind==='short'||'shortFormat' in q)&&(q.kind!=='short'||!validPublicShortFormat(q.shortFormat,String(q.mode))))errors.push('Invalid public short input format');
    if(q.kind==='mc'){
      if(!Array.isArray(q.choices)||q.choices.length!==4||!Array.from(q.choices).every(c=>boundedText(c,20000))||new Set(q.choices).size!==4)errors.push('Four distinct choices required');
    }else if(q.kind==='tf'){
      if(!validEqualQuestionSchedule(q.pointsByCorrectCount,milli))errors.push('Invalid MTM true/false compatibility schedule');
    }else if(q.kind==='short'){
      if(!['numeric','rational','exact'].includes(q.mode as string))errors.push('Explicit short answer mode required');
    }else errors.push('Unsupported MTM question kind');
  }
  if(input.sections!==undefined){
    if(!Array.isArray(input.sections)||!input.sections.length)errors.push('Invalid sections');
    else{
      let offset=0;
      for(const section of input.sections){
        if(!isRecord(section)||!boundedText(section.label,100)||!['mc','tf','short'].includes(section.kind as string)||!Number.isSafeInteger(section.count)||(section.count as number)<1){errors.push('Invalid section');continue;}
        const count=section.count as number,questions=input.questions.slice(offset,offset+count);
        if(questions.length!==count||questions.some(q=>!isRecord(q)||q.kind!==section.kind))errors.push('Section/question mismatch');
        offset+=count;
      }
      if(offset!==input.questions.length)errors.push('Complete section counts required');
    }
  }
  if(errors.length)return {valid:false,errors};
  return validatePracticePresentation(input,true);
}

function validEqualQuestionSchedule(value:unknown,milli:number):boolean {
  const expected=[0,milli/10,milli/4,milli/2,milli];
  return Array.isArray(value)&&value.length===5&&Array.from(value).every((v,i)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v-expected[i])<=Math.max(1,expected[i])*Number.EPSILON*4);
}

function validatePracticePresentation(input: Record<string,unknown>, questionOnly:boolean):Validation {
  const errors: string[] = [];
  const equalQuestion=input.rubricVersion===MTM_SCORING_VERSION;
  if (!boundedText(input.id, 120) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(input.id)||input.id==='history') errors.push('Invalid or reserved route id');
  if (!GRADES.includes(input.grade as Grade) || !PERIODS.includes(input.period as Period)) errors.push('Invalid grade or period');
  if (!boundedText(input.title, 300)) errors.push('Missing title');
  if (!Number.isSafeInteger(input.durationMinutes) || (input.durationMinutes as number) < 1 || (input.durationMinutes as number) > 1440) errors.push('Invalid duration');
  if (!isSha256(input.versionHash) || !boundedText(input.rubricVersion, 120)) errors.push('Invalid exam/rubric version');
  if (!(input.serverGraded===true&&!('sourceUrl' in input)||isHttpsUrl(input.sourceUrl)) || input.publicationVerified !== true || input.questionDisplayVerified!==true) errors.push('Publication/question display not verified');
  const material = input.sourceMaterial;
  if (!isRecord(material) || !['title', 'publisher', 'version', 'locator'].every(key => boundedText(material[key], 1000))) errors.push('Incomplete source material');
  if (input.answerVerificationNote !== undefined && !boundedText(input.answerVerificationNote, 2000)) errors.push('Invalid answer verification note');
  if (input.preAttemptNotice !== undefined && !boundedText(input.preAttemptNotice, 2000)) errors.push('Invalid pre-attempt notice');
  if (input.sourcePdf !== undefined && !validSourcePdf(input.sourcePdf)) errors.push('PDF question-page asset not verified');
  if(input.sourceInstructions!==undefined&&!validSourceSegments(input.sourceInstructions))errors.push('Invalid question instructions');
  if(questionOnly?'solutionInstructions' in input:input.solutionInstructions!==undefined&&!validSourceSegments(input.solutionInstructions))errors.push('Invalid solution instructions');
  if(input.mtmDocuments!==undefined){
    const files=input.mtmDocuments;
    if(!isRecord(files)||!isRecord(files.questions)||!validPdfUrl(files.questions.url,files.questions.sha256)||(questionOnly?'solutions' in files:!isRecord(files.solutions)||!validPdfUrl(files.solutions.url,files.solutions.sha256)||files.questions.sha256===files.solutions.sha256))errors.push('Invalid separate MTM documents');
  }
  for (const q of (input as unknown as PracticeExam).questions) {
    if (!boundedText(q.id, 120) || ['__proto__', 'constructor', 'prototype'].includes(q.id)) errors.push('Unsafe question id');
    if (!boundedText(q.prompt ?? q.text ?? q.sourceRef, 20000)) errors.push('Missing question text or source locator');
    if (q.prompt !== undefined && !boundedText(q.prompt, 20000)) errors.push('Invalid prompt');
    if (q.text !== undefined && !boundedText(q.text, 20000)) errors.push('Invalid text');
    if(q.convertedFrom!==undefined&&(input.rubricVersion!=='MTM-BTVN-10-v1'||q.kind!=='short'||q.convertedFrom!=='essay'))errors.push('Invalid essay conversion');
    if(!questionOnly&&q.kind==='self'&&!boundedText(q.solution,20000)&&!q.sourceContent?.solutions?.length) errors.push('Self question requires a solution');
    if (q.solution !== undefined && !boundedText(q.solution, 20000)) errors.push('Invalid solution');
    if(q.correctionNote!==undefined&&!boundedText(q.correctionNote,2000))errors.push('Invalid correction note');
    if(q.sourceContent!==undefined){
      if(!isRecord(q.sourceContent)||!validSourceSegments(q.sourceContent.questions)||(questionOnly?'solutions' in q.sourceContent:!validSourceSegments(q.sourceContent.solutions)))errors.push('Invalid complete source fragments');
      else if(!questionOnly&&q.sourceContent.solutions!.some(segment=>q.sourceContent!.questions.some(question=>question.path===segment.path||question.sha256.toLowerCase()===segment.sha256.toLowerCase())))errors.push('Question and solution fragments must be separate');
    }
    if (!questionOnly && q.kind === 'short' && (!equalQuestion||Array.isArray(q.acceptedAnswers)) && !q.acceptedAnswers.every(answer => boundedText(answer, 500))) errors.push('Short answer exceeds input limit');
    if(equalQuestion&&q.kind==='tf'&&!validEqualQuestionSchedule(q.pointsByCorrectCount,10000/(input as unknown as PracticeExam).questions.length))errors.push('Invalid MTM true/false compatibility schedule');
    if (q.statements !== undefined && (q.kind !== 'tf' || !Array.isArray(q.statements) || (!equalQuestion&&q.statements.length !== 4) || !Array.from(q.statements).every(s => boundedText(s, 10000)))) errors.push('Invalid statement texts');
    if(input.sourcePdf===undefined&&q.sourceContent===undefined&&(!boundedText(q.prompt??q.text,20000)||(q.kind==='tf'&&!q.statements)))errors.push('Question content is missing; a source locator is insufficient');
  }
  return {valid: errors.length === 0, errors};
}

/** Real source packs admitted after independent source, key, rubric and PDF review.
 * QA may pass an external module's fixtures as NativeExams.catalog; no globals,
 * query switches, fetches or fixture imports in the production entry point. */
export const PRACTICE_EXAMS: readonly PracticeExam[] = /* @__PURE__ */ Object.freeze(verifiedCatalog as unknown as PracticeExam[]);
export function readyExams(catalog: readonly unknown[]): PracticeExam[] {
  const valid = catalog.filter((exam): exam is PracticeExam => (isRecord(exam)&&exam.serverGraded===true&&exam.responseMode==='questions-only'?validateQuestionOnlyPracticeExam(exam):validatePracticeExam(exam)).valid);
  return valid.filter(exam => valid.filter(other => other.id === exam.id).length === 1);
}

export type Filters = {lop: 'all' | '10' | '11' | '12'; ky: 'all' | Period; q: string};
export function readFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  const grade = params.get('lop') ?? /^grade-(10|11|12)$/.exec(params.get('muc') ?? '')?.[1], period = params.get('ky');
  return {
    lop: grade === '10' || grade === '11' || grade === '12' ? grade : 'all',
    ky: PERIODS.includes(period as Period) ? period as Period : 'all',
    q: (params.get('q') ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').slice(0, 120),
  };
}
export function filterSearch(filters: Filters): string {
  return '?' + new URLSearchParams({lop: filters.lop, ky: filters.ky, q: filters.q}).toString();
}
export const titleTerm = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLocaleLowerCase('vi').trim();
