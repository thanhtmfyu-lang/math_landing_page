export const SEMESTER_GRADES = ['10', '11', '12'] as const;
export type SemesterGrade = typeof SEMESTER_GRADES[number];
export const SEMESTER_START = '16/11/2026';
/** Lộ trình 4 tuần ôn cuối kỳ I theo SGK Kết nối tri thức tập 1 (MTM chốt 29/10/2026). Mỗi tuần: bài cơ bản + bài nâng cao (mã sách). */
const plan: Record<SemesterGrade, [string, string][]> = {
  '10': [
    ['Mệnh đề, tập hợp và các phép toán trên tập hợp', 'Bài toán tập hợp có tham số, đếm phần tử bằng biểu đồ Ven'],
    ['Bất phương trình, hệ bất phương trình bậc nhất hai ẩn', 'Bài toán tối ưu: tìm giá trị lớn nhất, nhỏ nhất trên miền nghiệm'],
    ['Hệ thức lượng trong tam giác: định lí côsin, sin, diện tích', 'Giải tam giác và bài toán thực tế đo khoảng cách, chiều cao'],
    ['Vectơ, tích vô hướng và các số đặc trưng của mẫu số liệu', 'Đề tổng ôn cuối kỳ I lớp 10 có lời giải'],
  ],
  '11': [
    ['Giá trị lượng giác, công thức lượng giác, hàm số lượng giác', 'Phương trình lượng giác: đặt ẩn phụ, điều kiện nghiệm, đếm nghiệm'],
    ['Dãy số, cấp số cộng và cấp số nhân', 'Bài toán thực tế lãi suất, dân số dùng cấp số nhân'],
    ['Mẫu số liệu ghép nhóm và quan hệ song song trong không gian', 'Thiết diện và chứng minh song song trong hình chóp, lăng trụ'],
    ['Giới hạn dãy số, giới hạn hàm số, hàm số liên tục', 'Đề tổng ôn cuối kỳ I lớp 11 có lời giải'],
  ],
  '12': [
    ['Tính đơn điệu, cực trị, giá trị lớn nhất và nhỏ nhất của hàm số', 'Bài toán tối ưu thực tế bằng đạo hàm'],
    ['Đường tiệm cận, khảo sát và vẽ đồ thị hàm số', 'Đọc đồ thị, bảng biến thiên kiểu đề tốt nghiệp'],
    ['Vectơ và hệ trục tọa độ trong không gian', 'Bài toán tọa độ Oxyz ứng dụng thực tế'],
    ['Số đặc trưng đo độ phân tán của mẫu số liệu ghép nhóm', 'Đề tổng ôn cuối kỳ I lớp 12 theo cấu trúc mới, có lời giải'],
  ],
};
export const semesterLessons = (grade: SemesterGrade) => plan[grade].flatMap((pair, i) => [false, true].map(advanced => ({
  id: `hk1-${grade}-w${i + 1}-${advanced ? 'advanced' : 'core'}`,
  week: i + 1, title: pair[advanced ? 1 : 0], advanced,
})));
export type SemesterState = {registered: boolean; advanced: boolean; lessons: {id: string; views: number; limit: number; available: boolean}[]};
