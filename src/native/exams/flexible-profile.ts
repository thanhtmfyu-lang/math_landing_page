import {validateAssessment,scoreAssessment,type Assessment,type Validation} from './assessment';
import {validateMtmAssessment} from './mtm-profile';
import {MTM_SCORING_VERSION} from './mtm-scoring';
/** kind 'mixed': một phần gồm trắc nghiệm, đúng/sai và điền số xen kẽ theo thứ tự đề gốc (đề HSA), đánh số câu liền mạch. */
export type ExamSection={label:string;kind:'mc'|'tf'|'short'|'self'|'mixed';count:number};
export const FLEX_RUBRIC='MTM-FLEX-10-v1';
export function validatePracticeProfile(input:unknown):Validation {
 const e=input as Assessment&{rubricVersion?:string;sections?:ExamSection[]};
 const equalQuestion=e?.rubricVersion===MTM_SCORING_VERSION;
 if(!equalQuestion&&e?.rubricVersion!==FLEX_RUBRIC&&e?.rubricVersion!=='MTM-BTVN-10-v1')return validateMtmAssessment(input);
 const gate=validateAssessment(input);if(!gate.valid)return gate;
 const errors:string[]=[];
 if(!equalQuestion&&!e.id.startsWith('mtm-custom-')&&!e.id.startsWith('mtm-preview-')&&!e.id.startsWith('mtm-practice-')&&!e.id.startsWith('mtm-hsa-'))errors.push('Flexible profile requires a custom edition');
 if(equalQuestion&&e.sections===undefined)return gate;
 if(!Array.isArray(e.sections)||!e.sections.length||(!equalQuestion&&e.sections.length>12))return{valid:false,errors:[...errors,'Sections required']};
 let offset=0;for(const section of e.sections){if(!section||typeof section.label!=='string'||!section.label.trim()||section.label.length>100||!(e.rubricVersion==='MTM-BTVN-10-v1'?['mc','tf','short','self']:['mc','tf','short','mixed']).includes(section.kind)||!Number.isSafeInteger(section.count)||section.count<1||(!equalQuestion&&section.count>300)){errors.push('Invalid section');continue;}
 if(e.questions.slice(offset,offset+section.count).length!==section.count||e.questions.slice(offset,offset+section.count).some(q=>section.kind==='mixed'?!['mc','tf','short'].includes(q.kind):q.kind!==section.kind))errors.push('Section/question mismatch');offset+=section.count;}
 if(offset!==e.questions.length||(!equalQuestion&&offset>300))errors.push('Complete section counts required');
 return{valid:!errors.length,errors};
}
export function scorePracticeAssessment(input:unknown,answers:unknown,attemptId?:string){const g=validatePracticeProfile(input);return g.valid?scoreAssessment(input,answers,attemptId):{ok:false as const,errors:g.errors};}
export function examSections(e:{rubricVersion?:string;sections?:ExamSection[];questions:{kind:string}[]}) {
 let derived:ExamSection[]|undefined;
 if(e.rubricVersion===MTM_SCORING_VERSION&&!e.sections){
  derived=[];const labels={mc:'Trắc nghiệm',tf:'Đúng/sai',short:'Trả lời ngắn'};
  for(const q of e.questions){
   const kind=q.kind as 'mc'|'tf'|'short',last=derived.at(-1);
   if(last?.kind===kind)last.count++;
   else derived.push({label:labels[kind],kind,count:1});
  }
 }
 const source=e.sections??derived??[{label:'I · Trắc nghiệm',kind:'mc',count:12},{label:'II · Đúng/sai',kind:'tf',count:4},{label:'III · Trả lời ngắn',kind:'short',count:6}];
 let from=0;return source.map(s=>{const part={...s,name:s.label,from,to:from+s.count};from=part.to;return part;});
}

export function displayQuestionPoints(exam:{rubricVersion:string;questions:{maxMillipoints:number}[]},value:number){const total=exam.questions.reduce((n,q)=>n+q.maxMillipoints,0);return exam.rubricVersion==='MTM-BTVN-10-v1'&&total>0?value*10000/total:value;}
