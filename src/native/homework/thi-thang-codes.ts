/** Mã bài thi kết thúc tháng, dùng chung trình duyệt và máy chủ (không chứa đáp án).
 * <kỳ>-thi-ma-1|2: bài thi online 1 lượt trong ca; <kỳ>-btvn-ma-1|2: BTVN mở sau ca. */
export const THI_THANG_CODE=/^(thi-thang-\d{4}-\d{2}-[a-z0-9-]+?)-(thi|btvn)-ma-([12])$/;
export type ThiThangPart={base:string;phase:'thi'|'btvn';ma:1|2};
export function thiThangPart(lessonCode:string):ThiThangPart|null{
  const m=THI_THANG_CODE.exec(lessonCode);return m?{base:m[1],phase:m[2] as 'thi'|'btvn',ma:Number(m[3]) as 1|2}:null;
}
/** Số in trên đề giấy và trên web. */
export const maDeLabel=(ma:1|2)=>'Mã đề 10'+ma;
/** Tháng của kỳ thi, ví dụ thi-thang-2026-10-... → "10/2026". */
export const thiThangMonth=(base:string)=>{const m=/^thi-thang-(\d{4})-(\d{2})/.exec(base);return m?m[2]+'/'+m[1]:'';};
