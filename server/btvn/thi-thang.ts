import {createHash} from 'node:crypto';
import type {HomeworkLesson} from '../../src/native/homework/btvn-contract';
import {thiThangPart,maDeLabel} from '../../src/native/homework/thi-thang-codes';
export {THI_THANG_CODE,thiThangPart} from '../../src/native/homework/thi-thang-codes';

/** Thi kết thúc tháng (anh Thành chốt 20/10/2026): mỗi lớp mỗi kỳ 2 mã đề.
 * HS online được chia mã cố định theo tên + lớp; sau ca, mã còn lại là BTVN.
 * HS offline thi giấy, sau ca tự chọn mã đã làm bằng cách làm BTVN mã kia. */
/** Chia đôi tất định, không cần lưu: cùng HS + cùng kỳ luôn ra một mã. */
export function assignedMa(base:string,fullName:string,className:string):1|2{
  const digest=createHash('sha256').update(base+'|'+fullName.normalize('NFC').trim().toLowerCase()+'|'+className.trim()).digest();
  return (digest[0]&1)===0?1:2;
}
type Card=Pick<HomeworkLesson,'lessonCode'|'submittedAt'>;
const submitted=(cards:Card[],code:string)=>cards.some(card=>card.lessonCode===code&&card.submittedAt!=null);
/** Mã HS đã làm: bài thi online đã nộp, nếu không thì BTVN mã kia đã nộp (HS offline tự chọn). */
export function doneMa(base:string,cards:Card[]):1|2|null{
  for(const ma of [1,2] as const)if(submitted(cards,`${base}-thi-ma-${ma}`))return ma;
  for(const ma of [1,2] as const)if(submitted(cards,`${base}-btvn-ma-${ma}`))return ma===1?2:1;
  return null;
}
/** null = được mở; chuỗi = lý do chặn (cả xem đề, để HS online không thấy mã bạn bên cạnh trong ca). */
export function thiThangBlock(lessonCode:string,cards:Card[],fullName:string,className:string):string|null{
  const part=thiThangPart(lessonCode);if(!part)return null;
  if(part.phase==='thi'){
    const own=assignedMa(part.base,fullName,className);
    return part.ma===own?null:`Em làm ${maDeLabel(own)}. ${maDeLabel(part.ma)} sẽ là BTVN sau ca thi.`;
  }
  const done=doneMa(part.base,cards);
  return done===part.ma?`Em đã làm ${maDeLabel(done)}. BTVN của em là ${maDeLabel(done===1?2:1)}.`:null;
}
export function visibleThiThangCards<T extends Card>(cards:T[],fullName:string,className:string):T[]{
  return cards.filter(card=>thiThangBlock(card.lessonCode,cards,fullName,className)===null);
}
