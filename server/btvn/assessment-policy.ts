import type {LessonMaterial} from '../../src/native/homework/btvn-contract';

/** Timed class tests share attempt/reveal rules, not the legacy two-code policy. */
export function isTimedAssessment(material:Pick<LessonMaterial,'kind'>|undefined){
 return material?.kind==='kiem-tra-thang'||material?.kind==='kiem-tra';
}
export function validAssessmentDuration(value:unknown){return Number.isInteger(value)&&Number(value)>=1&&Number(value)<=240;}
