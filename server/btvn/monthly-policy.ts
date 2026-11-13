import type {PracticeExam} from '../../src/native/exams/data';
import {MTM_SCORING_VERSION} from '../../src/native/exams/mtm-scoring';
import {publicShortFormatFromRule} from '../../src/native/exams/short-format';
/** Đề gửi trước khi nộp chỉ có câu hỏi. Khóa thật vẫn ở bản nguồn phía server;
 * không tạo đáp án giữ chỗ cho bộ chấm hay giao diện. */
export function concealMonthlySolutions(exam:PracticeExam):PracticeExam {
 const copy=structuredClone(exam);
 Object.assign(copy,{responseMode:'questions-only'});
 delete copy.solutionInstructions;delete copy.answerVerificationNote;
 // Nguồn ngoài có thể kèm đáp án. Bản câu hỏi đã kiểm vẫn giữ trong sourcePdf.
 copy.sourceUrl='https://minhthanhmath.vn';
 if(copy.mtmDocuments)delete (copy.mtmDocuments as Partial<NonNullable<PracticeExam['mtmDocuments']>>).solutions;
 for(const q of copy.questions){
  delete q.solution;delete q.solutionBlocks;delete q.correctionNote;
  // Không tin shortFormat có sẵn trong nguồn; chỉ xuất bốn yêu cầu nhập từ rule.
  delete q.shortFormat;
  if(copy.rubricVersion===MTM_SCORING_VERSION&&q.kind==='short'){
   const format=publicShortFormatFromRule(q.shortRule,q.mode);
   if(format)q.shortFormat=format;
  }
  delete (q as {shortRule?:unknown}).shortRule;
  if(q.sourceContent)delete q.sourceContent.solutions;
  delete (q as {answer?:unknown}).answer;
  delete (q as {acceptedAnswers?:unknown}).acceptedAnswers;
 }
 return copy;
}
