import type {PracticeExam,PracticeQuestion} from './data';

/** Chỉ mở trang có ánh xạ của chính câu đang đọc, không đoán trang đầu phiếu. */
export function sourceQuestionPage(exam:Pick<PracticeExam,'sourcePdf'>,question:PracticeQuestion):number|undefined {
  const page=question.sourcePdfPage??question.sourceContent?.questions[0]?.sourcePage??Number(question.sourceRef.match(/(?:trang|tr\.)\s*(\d+)/i)?.[1]);
  return Number.isSafeInteger(page)&&exam.sourcePdf?.questionPages.includes(page)?page:undefined;
}

export function roomSectionLabel(name:string,index:number):string {
  return /^Phần\s/i.test(name)?name:`Phần ${index+1} · ${name}`;
}

export type SourceQuestionLookup={number:number;occurrence:number};
const sourceNumber=(q:PracticeQuestion)=>Number((q.sourceRef.match(/C[âa]u\s*(\d+)/i)??(q.prompt??q.text??'').match(/^\s*C[âa]u\s*(\d+)/i))?.[1]);
/** Câu thiếu ánh xạ trang: lấy số câu trên phiếu (từ nguồn/đề) và lần xuất hiện thứ mấy của số đó
 * (phiếu nhiều phần đánh số lại từ Câu 1) để tìm đúng chữ "Câu N" trong PDF. */
export function sourceQuestionLookup(exam:Pick<PracticeExam,'questions'>,index:number):SourceQuestionLookup|undefined {
  const q=exam.questions[index];if(!q)return undefined;
  const number=sourceNumber(q);if(!Number.isSafeInteger(number)||number<1)return undefined;
  return {number,occurrence:exam.questions.slice(0,index).filter(prev=>sourceNumber(prev)===number).length};
}
/** Chuẩn hóa chữ trang PDF: bỏ dấu (Câu → Cau), gộp khoảng trắng. */
export function normalizePdfText(text:string):string {
  return text.normalize('NFD').replace(/\p{M}/gu,'').replace(/[đĐ]/g,m=>m==='đ'?'d':'D').replace(/\s+/g,' ');
}
/** Trả chỉ số trang (theo thứ tự pageTexts) chứa lần thứ `occurrence` của tiêu đề "Câu N"; không thấy thì undefined. */
export function findQuestionPageIndex(pageTexts:string[],lookup:SourceQuestionLookup):number|undefined {
  let seen=0;
  for(let i=0;i<pageTexts.length;i++){
    const text=normalizePdfText(pageTexts[i]),pattern=/(?<!\p{L})C ?[aA] ?[uU] ?(\d+)(?!\d)/gu;
    for(const match of text.matchAll(pattern))if(Number(match[1])===lookup.number){if(seen===lookup.occurrence)return i;seen++;}
  }
  return undefined;
}
