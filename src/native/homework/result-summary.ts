import type {HomeworkReceipt,HomeworkState} from './btvn-contract';
import {MTM_SCORING_VERSION,roundMtmTotal,type MtmScore,type MtmType} from '../exams/mtm-scoring';
import {validOfficialHomeworkScore} from './grading-policy';

type SummaryState=Pick<HomeworkState,'draft'|'receipts'|'kind'|'solutionsAvailable'>;
export const monthlyResultsHidden=(state:Pick<HomeworkState,'kind'|'solutionsAvailable'>)=>state.kind==='kiem-tra-thang'&&state.solutionsAvailable===false;
const MAX_TIME=253402300799999;
const validTime=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=MAX_TIME;
export const isMtmHomeworkReceipt=(receipt:HomeworkReceipt)=>receipt.rubricVersion===MTM_SCORING_VERSION||receipt.mtm?.versions?.rubricVersion===MTM_SCORING_VERSION;
const matchingMtmSnapshot=(receipt:HomeworkReceipt)=>receipt.rubricVersion===MTM_SCORING_VERSION&&receipt.mtm?.versions?.rubricVersion===MTM_SCORING_VERSION&&receipt.mtm.attemptId===receipt.attemptId;
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown):value is string=>typeof value==='string'&&!!value.trim()&&value.length<=20000;
type Ratio={n:bigint;d:bigint};
const ratio=(value:unknown):Ratio|null=>{
  if(!record(value)||typeof value.numerator!=='string'||typeof value.denominator!=='string'||
    !/^(?:0|[1-9]\d{0,95})$/.test(value.numerator)||!(/^[1-9]\d{0,95}$/).test(value.denominator))return null;
  return {n:BigInt(value.numerator),d:BigInt(value.denominator)};
};
const equalRatio=(a:Ratio,b:Ratio)=>a.n*b.d===b.n*a.d;
const addRatio=(a:Ratio,b:Ratio):Ratio=>{
  let n=a.n*b.d+b.n*a.d,d=a.d*b.d,x=n,y=d;
  while(y){[x,y]=[y,x%y];}n/=x;d/=x;
  return {n,d};
};
const zero:Ratio={n:0n,d:1n},ten:Ratio={n:10n,d:1n};
const inRange=(value:Ratio,max=ten)=>value.n*max.d<=max.n*value.d;
const issueKeys=(value:unknown):string[]|null=>{
  if(!Array.isArray(value))return null;
  const keys:string[]=[];
  for(const item of value){
    if(!record(item)||!text(item.code)||!text(item.message)||item.questionId!==undefined&&!text(item.questionId))return null;
    keys.push(JSON.stringify([item.code,item.message,item.questionId??null]));
  }
  return keys;
};

/** Kiểm dữ liệu dẫn xuất trong biên nhận đã lưu, không chấm lại câu trả lời.
 * Bảng phần và tổng phải cùng khớp snapshot phân số của engine. Không suy ra
 * tính bất biến hoặc quyền ghi của kho chỉ từ việc các định danh đang khớp. */
export function validatedMtmReceiptSnapshot(receipt:HomeworkReceipt):MtmScore|null{
  if(!matchingMtmSnapshot(receipt))return null;
  const score:unknown=receipt.mtm;
  if(!record(score)||!record(score.versions)||
    !Array.isArray(score.rows)||!score.rows.length||!Array.isArray(score.sections)||!score.sections.length)return null;
  const versions=score.versions;
  if(!['examId','examVersion','answerKeyVersion','rubricVersion'].every(key=>text(versions[key])))return null;
  const pending=issueKeys(score.pending);if(!pending)return null;
  const pendingSet=new Set(pending),ids=new Set<string>();
  const parts=new Map<MtmType,{raw:Ratio;max:Ratio}>();
  let sum=zero,maxSum=zero;
  for(const row of score.rows){
    if(!record(row)||!text(row.id)||ids.has(row.id)||typeof row.type!=='string'||!['TN','DS','TLN','UNKNOWN'].includes(row.type)||
      typeof row.status!=='string'||!['graded','ungradable'].includes(row.status))return null;
    ids.add(row.id);
    const max=ratio(row.maxScore),earned=ratio(row.earned),issues=issueKeys(row.issues);
    if(!max||max.n===0n||max.n*BigInt(score.rows.length)!==10n*max.d||!issues)return null;
    if(row.correctCount!==null&&(!Number.isSafeInteger(row.correctCount)||(row.correctCount as number)<0||(row.correctCount as number)>4))return null;
    if(row.type!=='DS'&&row.correctCount!==null)return null;
    if(row.status==='ungradable'){
      if(row.earned!==null||!issues.length||issues.some(key=>!pendingSet.has(key)))return null;
    }else{
      if(!earned||!inRange(earned,max)||issues.length||row.type==='UNKNOWN')return null;
      if(row.type==='DS'){
        if(row.correctCount===null)return null;
        const [n,d]=[[0n,1n],[1n,10n],[1n,4n],[1n,2n],[1n,1n]][row.correctCount as number];
        if(!equalRatio(earned,{n:max.n*n,d:max.d*d}))return null;
      }else if(earned.n!==0n&&!equalRatio(earned,max))return null;
    }
    const raw=earned??zero,type=row.type as MtmType,part=parts.get(type)??{raw:zero,max:zero};
    parts.set(type,{raw:addRatio(part.raw,raw),max:addRatio(part.max,max)});
    sum=addRatio(sum,raw);maxSum=addRatio(maxSum,max);
  }
  const raw=ratio(score.rawTotal);
  if(!raw||!inRange(raw)||!equalRatio(raw,sum)||!equalRatio(maxSum,ten)||
    score.displayTotal!==roundMtmTotal({numerator:String(raw.n),denominator:String(raw.d)})||score.sections.length!==parts.size)return null;
  const sectionTypes=new Set<string>();
  for(const section of score.sections){
    if(!record(section)||typeof section.type!=='string'||sectionTypes.has(section.type))return null;
    sectionTypes.add(section.type);
    const expected=parts.get(section.type as MtmType),sectionRaw=ratio(section.rawTotal),sectionMax=ratio(section.maxScore);
    if(!expected||!sectionRaw||!sectionMax||!equalRatio(sectionRaw,expected.raw)||!equalRatio(sectionMax,expected.max))return null;
  }
  if(pending.length){
    if(receipt.score!==null||score.officialTotal!==null||score.officialDisplayTotal!==null)return null;
  }else{
    const official=ratio(score.officialTotal);
    if(!official||!equalRatio(official,raw)||score.officialDisplayTotal!==score.displayTotal||
      typeof receipt.score!=='number'||!Number.isFinite(receipt.score)||receipt.score!==Number(score.displayTotal))return null;
  }
  return receipt.mtm!;
}
export const pendingHomeworkReceipt=(receipt:HomeworkReceipt)=>!validOfficialHomeworkScore(receipt.officialScore)&&(receipt.gradingPending===true||!!validatedMtmReceiptSnapshot(receipt)&&receipt.mtm!.pending.length>0);
export function provisionalHomeworkReceiptScore(receipt:HomeworkReceipt):string|null{
  // Snapshot MTM có câu chưa chấm được không công bố tổng thiếu phần.
  if(isMtmHomeworkReceipt(receipt))return null;
  return validOfficialHomeworkScore(receipt.score)?receipt.score.toLocaleString('vi-VN',{maximumFractionDigits:3}):null;
}
export function homeworkReceiptScore(receipt:HomeworkReceipt):string|null{
  if(validOfficialHomeworkScore(receipt.officialScore))return receipt.officialScore.toLocaleString('vi-VN',{maximumFractionDigits:3});
  if(isMtmHomeworkReceipt(receipt)){
    const score=validatedMtmReceiptSnapshot(receipt);
    return score?.officialDisplayTotal?.replace('.',',')??null;
  }
  if(receipt.score===null||!Number.isFinite(receipt.score)||receipt.score<0||receipt.score>10)return null;
  return receipt.score.toLocaleString('vi-VN',{maximumFractionDigits:3});
}

/** Chỉ chọn biên nhận duy nhất của bản nộp đang xem, không lấy lượt lịch sử thay thế. */
function submittedHomeworkReceipt(state:SummaryState):HomeworkReceipt|null{
  const {draft}=state;
  if(!draft||typeof draft.attemptId!=='string'||!draft.attemptId.trim()||!validTime(draft.submittedAt)||!Array.isArray(state.receipts))return null;
  const matching=state.receipts.filter(receipt=>receipt?.attemptId===draft.attemptId);
  return matching.length===1?matching[0]:null;
}

/** Quyền xem điểm MTM cần snapshot khớp bản nộp và qua cổng tính nhất quán. */
export function acknowledgedHomeworkReceipt(state:SummaryState):HomeworkReceipt|null{
  if(monthlyResultsHidden(state))return null;
  const receipt=submittedHomeworkReceipt(state),draft=state.draft;
  if(!receipt||!draft)return null;
  if((draft.rubricVersion===MTM_SCORING_VERSION||isMtmHomeworkReceipt(receipt))&&(receipt.submittedAt!==draft.submittedAt||!matchingMtmSnapshot(receipt)||receipt.mtm!.versions.examId!==draft.examId||receipt.mtm!.versions.examVersion!==draft.examVersionHash||receipt.mtm!.versions.answerKeyVersion!==draft.answerKeyVersion||receipt.mtm!.versions.rubricVersion!==draft.rubricVersion))return null;
  // Metadata thời lượng của phiếu không khóa điểm đã được xác nhận.
  return homeworkReceiptScore(receipt)!==null||pendingHomeworkReceipt(receipt)?receipt:null;
}

/** ACK nộp MTM độc lập với quyền xem điểm. Một biên nhận cùng lượt xác nhận
 * bài đã được nhận; snapshot hoặc metadata lệch chỉ đóng cổng công bố điểm.
 * Bản tháng đang ẩn luôn giữ kín điểm và phiếu, kể cả khi đã ACK. */
export function acknowledgedHomeworkSubmission(state:SummaryState):HomeworkReceipt|null{
  const receipt=submittedHomeworkReceipt(state);
  if(!receipt)return null;
  if(monthlyResultsHidden(state)||state.draft?.rubricVersion===MTM_SCORING_VERSION||isMtmHomeworkReceipt(receipt))return receipt;
  return acknowledgedHomeworkReceipt(state);
}

/** Phiếu ACK riêng cho BTVN thường đang đối soát. Chỉ literal, không chọn
 * metadata mâu thuẫn làm sự thật và không nới cổng công bố điểm hoặc phiếu tháng. */
export function createHomeworkSubmissionSummary(state:SummaryState):string|null{
  if(state.kind==='kiem-tra-thang'||!acknowledgedHomeworkSubmission(state)||acknowledgedHomeworkReceipt(state))return null;
  return [
    'MINH THÀNH MATH',
    'Phiếu xác nhận đã nộp BTVN',
    'Máy chủ đã xác nhận nhận bản nộp đang xem.',
    'Điểm đang đối soát.',
    'Phiếu này không xác nhận điểm, thời gian hoặc hạn nộp.',
    'Phiếu này không được gửi tự động.',
  ].join('\n');
}

/** Phiếu tự gửi cần đủ metadata hợp lệ; thiếu phiếu không khóa điểm hoặc lượt tiếp. */
function shareableHomeworkReceipt(state:SummaryState):HomeworkReceipt|null{
  const receipt=acknowledgedHomeworkReceipt(state),draft=state.draft;
  if(!receipt||!draft||!validTime(draft.startedAt)||!validTime(draft.updatedAt)||!validTime(draft.submittedAt)||draft.submittedAt<draft.startedAt||draft.submittedAt>draft.updatedAt)return null;
  if(!Number.isSafeInteger(receipt.attemptNumber)||receipt.attemptNumber<1||!validTime(receipt.submittedAt)||receipt.submittedAt<draft.startedAt||!Number.isSafeInteger(receipt.elapsedSeconds)||receipt.elapsedSeconds<0||receipt.elapsedSeconds>Math.floor(MAX_TIME/1000)||(receipt.late!==null&&typeof receipt.late!=='boolean')||typeof receipt.timedOut!=='boolean')return null;
  return receipt;
}

/** Nội dung tự gửi chỉ có các trường kết quả được chọn rõ, không có trường văn bản riêng. */
export function createHomeworkResultSummary(state:SummaryState):string|null{
  const receipt=shareableHomeworkReceipt(state);
  if(!receipt)return null;
  const date=new Date(receipt.submittedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'});
  const minutes=Math.floor(receipt.elapsedSeconds/60),seconds=receipt.elapsedSeconds%60;
  return [
    'MINH THÀNH MATH',
    state.kind==='kiem-tra-thang'?'Kết quả kiểm tra cuối tháng':'Kết quả BTVN',
    'Lượt làm: '+receipt.attemptNumber,
    'Điểm: '+(pendingHomeworkReceipt(receipt)?(provisionalHomeworkReceiptScore(receipt)??'Chưa công bố tổng điểm')+(provisionalHomeworkReceiptScore(receipt)!==null?'/10':'')+' (Tạm tính)':homeworkReceiptScore(receipt)===null?'Chưa công bố tổng điểm':homeworkReceiptScore(receipt)+'/10'),
    ...(pendingHomeworkReceipt(receipt)?['Chờ chấm đủ các phần; điểm tạm chưa được tính vào hạng chính thức.']:[]),
    ...(isMtmHomeworkReceipt(receipt)&&!validOfficialHomeworkScore(receipt.officialScore)?['Tổng tính từ điểm gốc bằng phân số chính xác, làm tròn ROUND_HALF_UP đến 2 chữ số thập phân.']:[]),
    ...(validOfficialHomeworkScore(receipt.officialScore)?['Điểm chính thức được giáo vụ xác nhận sau khi chấm đủ các phần.']:[]),
    'Nộp lúc: '+date+' (giờ Việt Nam)',
    'Thời gian làm bài: '+minutes+' phút '+seconds+' giây',
    'Hạn nộp: '+(receipt.late===null?'Đã ghi nhận bài nộp':receipt.late?'Nộp muộn':'Đúng hạn'),
    ...(receipt.timedOut?['Kết thúc lượt: Hết giờ tự nộp']:[]),
    'Kết quả của lượt đã được máy chủ xác nhận.',
    'Phiếu này không được gửi tự động.',
  ].join('\n');
}
