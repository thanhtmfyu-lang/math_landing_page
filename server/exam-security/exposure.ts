import policy from './exposed-exams.json';

const exposed = new Set<string>(policy.practiceOnly);
export const PRACTICE_ONLY_NOTICE = 'Đề này chỉ dùng để tự luyện vì đáp án đã từng công khai. Kết quả không dùng cho bài thi tính điểm hoặc bảng xếp hạng.';
/** Changing a filename or hiding an answer in a new build cannot restore exam secrecy. */
export function isExposedExam(id: unknown): boolean {
  return typeof id === 'string' && exposed.has(id);
}
