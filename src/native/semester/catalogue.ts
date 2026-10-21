export const SEMESTER_GRADES = ['10', '11', '12'] as const;
export type SemesterGrade = typeof SEMESTER_GRADES[number];
export const SEMESTER_START = '16/11/2026';
const weeks = ['Củng cố kiến thức', 'Luyện theo dạng', 'Kết nối các chủ đề', 'Tổng ôn cuối kỳ'];
/** Dữ liệu mẫu cho PR; không phải lịch bài giảng đã được MTM nghiệm thu. */
export const semesterLessons = (grade: SemesterGrade) => weeks.flatMap((title, i) => [false, true].map(advanced => ({
  id: `hk1-${grade}-w${i + 1}-${advanced ? 'advanced' : 'core'}`,
  week: i + 1, title: `${title}${advanced ? ' · Nâng cao' : ''}`, advanced,
})));
export type SemesterState = {registered: boolean; advanced: boolean; lessons: {id: string; views: number; limit: number; available: boolean}[]};
