/** Shared with the gateway; never log a student's access code. */
export const STUDENT_CODE_ERROR='Mã học sinh gồm 32 ký tự 0-9 và a-f (có thể bắt đầu bằng HS-). Em kiểm tra lại mã.';
export function normalizeStudentCode(value:string):string {
  return value.replace(/[\s\u200B-\u200D\uFEFF\-‐‑‒–—−]/gu,'').replace(/^hs/i,'').toLowerCase();
}
export const validStudentCode=(value:string)=>/^[0-9a-f]{32}$/.test(value);
