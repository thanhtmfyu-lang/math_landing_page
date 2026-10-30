import type {HomeworkLesson} from '../../src/native/homework/btvn-contract';
import {thiThangPart,maDeLabel} from '../../src/native/homework/thi-thang-codes';
export {THI_THANG_CODE,thiThangPart} from '../../src/native/homework/thi-thang-codes';

/** Thi kết thúc tháng (anh Thành chốt 20/10/2026): mỗi lớp mỗi kỳ 2 mã đề.
 * HS online chọn một mã; bắt đầu là khóa mã còn lại. Sau ca, mã còn lại là BTVN.
 * HS offline thi giấy, sau ca tự chọn mã đã làm bằng cách làm BTVN mã kia. */
type Card=Pick<HomeworkLesson,'lessonCode'|'submittedAt'|'startedAt'>;
/** Thành giao 27/10/2026: tạm ẩn các bài chờ đối soát lịch DB.
 * 28/10 19:21 anh Thành chốt: 28/10 lớp 8+ thi, 29/10 lớp 9+ thi. DB đã đúng lịch (20261028_1925 ĐẠT) nên mở cả 8 bài 2K11; giờ mở theo DB.
 * 30/10: theo LENH-CODEX-THI-THANG-2, mở lại đúng 4 bài 2K10 8+; ca thi 19:30–21:30 theo DB, không còn mã tạm ẩn.
 * Chặn tại cổng server hiện có, cả đọc đề và ghi bài; gỡ bằng PR riêng sau nghiệm thu.
 * Không tự hết hạn theo đồng hồ hoặc theo lịch chưa xác minh; không thay DB. */
const TEMPORARILY_HIDDEN_LESSONS:ReadonlySet<string>=new Set([
]);
const submitted=(cards:Card[],code:string)=>cards.some(card=>card.lessonCode===code&&card.submittedAt!=null);
/** Khóa từ lượt thi đã bắt đầu, kể cả chưa nộp hoặc đã hết giờ.
 * Bài cũ chỉ có biên nhận vẫn giữ lựa chọn; HS offline chọn qua BTVN đã nộp. */
export function doneMa(base:string,cards:Card[]):1|2|null{
  // Cùng thứ tự với guard SQL nếu dữ liệu cũ có nhiều mã đã bắt đầu.
  const begun=cards.filter(card=>(card.lessonCode===`${base}-thi-ma-1`||card.lessonCode===`${base}-thi-ma-2`)&&(card.startedAt!=null||card.submittedAt!=null))
    .sort((a,b)=>(a.startedAt??Infinity)-(b.startedAt??Infinity)||a.lessonCode.localeCompare(b.lessonCode));
  if(begun.length)return thiThangPart(begun[0].lessonCode)!.ma;
  for(const ma of [1,2] as const)if(submitted(cards,`${base}-btvn-ma-${ma}`))return ma===1?2:1;
  return null;
}
/** null = được mở; chuỗi = lý do chặn (cả xem đề, để HS online không thấy mã bạn bên cạnh trong ca). */
export function thiThangBlock(lessonCode:string,cards:Card[],_fullName?:string,_className?:string):string|null{
  if(TEMPORARILY_HIDDEN_LESSONS.has(lessonCode))return 'Bài đang tạm ẩn để kiểm tra lịch mở. Em quay lại sau thông báo của thầy.';
  const part=thiThangPart(lessonCode);if(!part)return null;
  const done=doneMa(part.base,cards);
  if(part.phase==='thi'){
    return done===null||part.ma===done?null:`Em đã chọn ${maDeLabel(done)}. Đã bắt đầu thì không đổi được. ${maDeLabel(part.ma)} sẽ là BTVN sau ca thi.`;
  }
  return done===part.ma?`Em đã làm ${maDeLabel(done)}. BTVN của em là ${maDeLabel(done===1?2:1)}.`:null;
}
export function visibleThiThangCards<T extends Card>(cards:T[],fullName:string,className:string):T[]{
  return cards.filter(card=>thiThangBlock(card.lessonCode,cards,fullName,className)===null);
}
