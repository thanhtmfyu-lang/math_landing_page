import {step,displayCourseTitle,type Course} from './catalogue';
export {displayCourseTitle};

// Lộ trình công khai theo năm học 2026-2027 (bản dự kiến của MTM, cập nhật 19/10/2026).
// Chỉ ghi mốc đã có trong lộ trình trung tâm hoặc nguồn chính thức; lịch thi 2027 chưa công bố.
export type TrackId='10'|'11'|'12'|'hsa';
export type Stage={period:string;title:string;detail:string;courses:string};
export type Placement={level:string;start:string;slug?:string};
export type Group={name:string;start:string;now:string;fit:string};
export type Track={id:TrackId;tab:string;cohort:string;title:string;goal:string;exam:string;schedule:string;groups:Group[];stages:Stage[];placements:Placement[];notes:string[]};
// Tiến độ lớp đối chiếu sổ dạy ngày 19/10/2026; cập nhật lại mỗi đầu tháng.
export const PROGRESS_UPDATED='19/10/2026';

export const TRACKS:Track[]=[
 {id:'12',tab:'Lớp 12',cohort:'2K9',title:'Lộ trình Toán 12 · thi tốt nghiệp THPT 2027',
  goal:'Học chắc Toán 12 theo từng bước, vá các mảng 10-11 cần dùng, đến tháng 3/2027 chuyển hẳn sang luyện đề 90 phút.',
  exam:'Tốt nghiệp THPT 2027: dự kiến tháng 6/2027, chờ lịch chính thức của Bộ GDĐT. Đề Toán 90 phút theo cấu trúc áp dụng từ 2025.',
  schedule:'3 buổi/tuần · 2 giờ/buổi',
  groups:[
   {name:'Nhóm XPT',start:'Học từ tháng 9/2026',now:'Đã xong chương hàm số và kiểm tra chương; đang học vectơ trong không gian.',fit:'Học sinh mới được ưu tiên xếp vào nhóm này trước. Em học theo tiến độ trường, kể cả khi mới bắt đầu hoặc cần học chắc từ gốc.'},
   {name:'Nhóm XPS 8+ và XPS 9+',start:'Học từ tháng 6/2026',now:'Đã đi hết một vòng kiến thức 12; từ 28/9 học vòng 2 nâng cao, đang ở ứng dụng đạo hàm và bài toán thực tế.',fit:'Nhóm học từ hè. Học sinh mới chỉ xếp vào nhóm này khi chưa thể vào nhóm XPT, lớp còn chỗ và em theo kịp tiến độ sau kiểm tra đầu vào.'},
  ],
  stages:[
   {period:'06-09/2026',title:'Vòng 1 cho nhóm học sớm',detail:'Nhóm XPS đã học hết kiến thức 12 trong hè: hàm số, vectơ và Oxyz, nguyên hàm - tích phân, thống kê.',courses:'Step 1 hoặc Step 2'},
   {period:'10-12/2026',title:'Vòng 2 nâng cao và học chắc học kỳ I',detail:'Nhóm XPS học lại theo chuyên đề ở mức vận dụng và vận dụng cao. Nhóm XPT học ứng dụng đạo hàm, vectơ và tọa độ trong không gian, số liệu ghép nhóm, mở đầu nguyên hàm. Mỗi tuần ôn một mảng lớp 10-11 nối vào bài đang học.',detail:'Ứng dụng đạo hàm và đồ thị, vectơ và tọa độ trong không gian, số liệu ghép nhóm, mở đầu nguyên hàm. Mỗi tuần ôn lại một mảng lớp 10-11 nối vào bài đang học.',courses:'Step 1, 2 hoặc 3 theo mức của em'},
   {period:'01-02/2027',title:'Tích phân, Oxyz, xác suất',detail:'Hai nhóm cùng về đích kiến thức: tích phân và ứng dụng, phương pháp tọa độ trong không gian, xác suất có điều kiện. Tuần Tết (Tết Nguyên đán 06/02/2027) giảm tải, cuối tháng 2 kiểm tra 10 mảng nền, mảng nào dưới 7/10 thì bù.',courses:'Tiếp tục Step đang học'},
   {period:'03-04/2027',title:'Luyện đề theo nhóm lỗi',detail:'Mỗi tuần một đề 90 phút, chữa lỗi theo nhóm: hàm số, hình học, tích phân, thống kê - xác suất, bài thực tế, phân bổ thời gian.',courses:'Step 4: Tổng ôn và luyện đề'},
   {period:'05-06/2027',title:'Tổng duyệt đến ngày thi',detail:'Thi thử mô phỏng, chốt công thức và điều kiện, giảm tải dần và giữ nhịp theo ngày thi chính thức.',courses:'Step 4: Tổng ôn và luyện đề'},
  ],
  placements:[
   {level:'Điểm Toán trên lớp dưới 6,5 hoặc còn hổng nhiều phần lớp 10-11',start:'Bắt đầu từ Step 1 Nền tảng'},
   {level:'Làm chắc bài cơ bản, điểm khoảng 6,5-8, muốn lên 8+',start:'Bắt đầu từ Step 2 Vận dụng'},
   {level:'Đã vững vận dụng, điểm từ 8 trở lên, mục tiêu 9+',start:'Bắt đầu từ Step 3 Vận dụng cao'},
   {level:'Từ tháng 3/2027, mọi mức',start:'Chuyển sang Step 4 Tổng ôn và luyện đề'},
  ],
  notes:['Em định xét tuyển bằng HSA có thể học thêm lộ trình HSA song song từ bây giờ.','Mốc học điều chỉnh khi Bộ GDĐT công bố lịch thi 2027.']},
 {id:'11',tab:'Lớp 11',cohort:'2K10',title:'Lộ trình Toán 11 · nền cho mùa thi 2028',
  goal:'Học chắc lớp 11 theo tiến độ trường, điểm cao trên lớp, và có nền đủ để lên lớp 12 bước vào mùa thi 2028.',
  exam:'Kỳ thi gần nhất: kiểm tra học kỳ trên trường. Tốt nghiệp THPT và HSA của 2K10 vào năm 2028, chưa có lịch.',
  schedule:'2 buổi/tuần · 2 giờ/buổi, một buổi Đại số và một buổi Hình học',
  groups:[
   {name:'Nhóm XPT',start:'Học từ tháng 9/2026',now:'Đại số đang học phương trình lượng giác; Hình học đang học giao tuyến và thiết diện.',fit:'Học sinh mới được ưu tiên xếp vào nhóm này trước. Em học theo tiến độ trường, kể cả khi mới bắt đầu hoặc cần học chắc từ gốc.'},
   {name:'Nhóm XPS 8+ và XPS 9+',start:'Học từ tháng 6/2026',now:'Đại số đã qua lượng giác, dãy số và đang học giới hạn; Hình học đã xong quan hệ song song và thống kê, đang ôn thi giữa kỳ I.',fit:'Nhóm học từ hè. Học sinh mới chỉ xếp vào nhóm này khi chưa thể vào nhóm XPT, lớp còn chỗ và em theo kịp tiến độ sau kiểm tra đầu vào.'},
  ],
  stages:[
   {period:'10-12/2026',title:'Toán 11 học kỳ I',detail:'Hàm số lượng giác và phương trình lượng giác, dãy số - cấp số, số liệu ghép nhóm, giới hạn và hàm số liên tục, quan hệ song song trong không gian. Ôn thi giữa kỳ cuối tháng 10, cuối kỳ tháng 12.',courses:'Step 1, 2 hoặc 3 theo mức của em'},
   {period:'01-05/2027',title:'Toán 11 học kỳ II',detail:'Mũ - logarit, đạo hàm, quan hệ vuông góc, xác suất. Từ tháng 3 làm bài có giờ theo chương, ôn thi cuối năm.',courses:'Step 4: Tổng ôn và luyện đề lớp 11'},
   {period:'06-08/2027',title:'Hè: chốt lớp 11, vá nền 10-11',detail:'Đọc lại sổ lỗi, sửa 2-3 mảng yếu nhất, làm quen dạng đề đánh giá năng lực HSA.',courses:'Tư vấn theo kết quả cuối năm'},
   {period:'Từ 09/2027',title:'Lên lớp 12',detail:'Vào lộ trình lớp 12 của MTM và chọn thêm HSA nếu em xét tuyển bằng đánh giá năng lực.',courses:'Lộ trình lớp 12'},
  ],
  placements:[
   {level:'Điểm Toán trên lớp dưới 6,5 hoặc chưa chắc lớp 10',start:'Bắt đầu từ Step 1 Nền tảng'},
   {level:'Làm chắc bài cơ bản, muốn đạt 8, 9 trên lớp',start:'Bắt đầu từ Step 2 Vận dụng'},
   {level:'Đã vững, mục tiêu 9+ và đi sớm cho kỳ thi',start:'Bắt đầu từ Step 3 Vận dụng cao'},
   {level:'Trước kỳ thi học kỳ',start:'Ôn thêm Step 4 Tổng ôn và luyện đề lớp 11'},
  ],
  notes:['Khóa Step 1-3 trên web hiện có bài của học kỳ I; phần học kỳ II học trực tiếp tại lớp và được cập nhật lên web sau.','Nội dung không học vượt tiến độ trường.']},
 {id:'10',tab:'Lớp 10',cohort:'2K11',title:'Lộ trình Toán 10 · ba năm xây nền THPT',
  goal:'Em có ba năm để xây nền Toán THPT: học chắc từng chương, sửa lỗi sớm và chỉ tăng độ khó khi phần trước đã vững.',
  exam:'Kỳ thi gần nhất: kiểm tra học kỳ trên trường. Mùa thi của 2K11 vào năm 2029, chưa có lịch.',
  schedule:'2 buổi/tuần · 2 giờ/buổi, một buổi Đại số và một buổi Hình học',
  groups:[
   {name:'Nhóm XPT',start:'Học từ tháng 9/2026',now:'Đang học bất phương trình bậc nhất hai ẩn và tổng, hiệu hai vectơ.',fit:'Học sinh mới được ưu tiên xếp vào nhóm này trước. Em học theo tiến độ trường, kể cả khi mới bắt đầu hoặc cần học chắc từ gốc.'},
   {name:'Nhóm XPS 8+ và XPS 9+',start:'Học từ tháng 7/2026',now:'Đã xong mệnh đề - tập hợp, bất phương trình bậc nhất hai ẩn, hệ thức lượng; đang học vectơ và ôn thi giữa kỳ I.',fit:'Nhóm học từ hè. Học sinh mới chỉ xếp vào nhóm này khi chưa thể vào nhóm XPT, lớp còn chỗ và em theo kịp tiến độ sau kiểm tra đầu vào.'},
  ],
  stages:[
   {period:'10/2026-01/2027',title:'Nửa đầu lớp 10',detail:'Mệnh đề - tập hợp, bất phương trình và hệ bất phương trình bậc nhất hai ẩn, hàm số bậc hai, hệ thức lượng trong tam giác, vectơ, thống kê theo trường.',courses:'Step 1, 2 hoặc 3 theo mức của em'},
   {period:'02-05/2027',title:'Hoàn thiện lớp 10',detail:'Tọa độ trong mặt phẳng, tổ hợp, xác suất. Từ tháng 3 làm bài có giờ theo phần đã học, ôn thi cuối năm.',courses:'Step 4: Tổng ôn và luyện đề toán 10'},
   {period:'06-08/2027',title:'Hè: vá nền trước lớp 11',detail:'Ôn lại 2-3 mảng dễ quên, luyện đọc đề và trình bày lời giải đủ bước.',courses:'Tư vấn theo kết quả cuối năm'},
   {period:'2027-2029',title:'Lớp 11, lớp 12 và năm thi',detail:'Đi tiếp lộ trình lớp 11 rồi lớp 12 của MTM; năm 2029 luyện đề theo lịch chính thức khi được công bố.',courses:'Lộ trình lớp 11 → lớp 12'},
  ],
  placements:[
   {level:'Mới vào cấp 3, điểm Toán vào 10 chưa cao hoặc còn hổng THCS',start:'Bắt đầu từ Step 1 Nền tảng'},
   {level:'Nền ổn, muốn đạt 8, 9 trên lớp',start:'Bắt đầu từ Step 2 Vận dụng'},
   {level:'Học sinh khá giỏi, trường chuyên, mục tiêu 9+',start:'Bắt đầu từ Step 3 Vận dụng cao'},
   {level:'Trước kỳ thi học kỳ',start:'Ôn thêm Step 4 Tổng ôn và luyện đề toán 10'},
  ],
  notes:['Khóa Step 1-3 trên web hiện có bài của bốn chương đầu; các chương sau học trực tiếp tại lớp và được cập nhật lên web sau.','Nội dung không học vượt tiến độ trường.']},
 {id:'hsa',tab:'HSA',cohort:'2K9',title:'Lộ trình HSA 2027 · phần Toán và xử lý số liệu',
  goal:'Từ chuyên đề hàm số, mũ - logarit, tích phân, Oxyz đến đề Toán 75 phút. Đủ nền trước tháng 3/2027 để sẵn sàng cho các đợt thi sớm.',
  exam:'HSA (ĐHQG Hà Nội): phần Toán và xử lý số liệu 50 câu/75 phút (35 trắc nghiệm, 15 điền đáp án). Lịch thi 2027 chưa công bố; năm 2026 đợt đầu diễn ra tháng 3. Theo dõi hsa.edu.vn từ tháng 11/2026.',
  schedule:'1 buổi/tuần · 3 giờ/buổi',
  groups:[
   {name:'Lớp HSA',start:'Học từ tháng 7/2026',now:'Đã qua chuyên đề hàm số; đang học nguyên hàm - tích phân.',fit:'Em đã học HSA từ hè.'},
   {name:'Lớp HSA.2',start:'Khai giảng 01/10/2026',now:'Đang học đơn điệu, tham số m và hàm hợp, đúng tuần 3 của lộ trình 33 tuần.',fit:'Học sinh mới đăng ký HSA từ tháng 10 vào lớp này để theo kịp từ đầu.'},
  ],
  stages:[
   {period:'10-12/2026',title:'Chuyên đề trọng tâm',detail:'Hàm số chuyên sâu (đơn điệu, cực trị, max-min, hàm hợp, tiệm cận, tương giao), mũ - logarit, nguyên hàm - tích phân, Oxyz.',courses:'Đọc vị đề ĐGNL HSA'},
   {period:'01-02/2027',title:'Dữ liệu, xác suất, đề 75 phút',detail:'Đọc bảng và biểu đồ, xác suất - thống kê, ôn mảng lớp 10-11 hay ra. Từ cuối tháng 1 làm đề Toán 75 phút, phân loại lỗi kiến thức, đọc đề, thời gian.',courses:'Đọc vị đề ĐGNL HSA'},
   {period:'03-05/2027',title:'Luyện đề theo ca thi',detail:'Thi đúng ca đã đăng ký. Nếu chọn đợt muộn, cứ 2 tuần một đề, tuần xen kẽ chữa lỗi.',courses:'Đọc vị đề ĐGNL HSA'},
  ],
  placements:[
   {level:'2K9 xét tuyển bằng HSA, Toán 12 đã ở mức vận dụng',start:'Vào thẳng lộ trình HSA'},
   {level:'2K9 muốn thi HSA nhưng Toán 12 còn hổng',start:'Học HSA song song với Step 1 hoặc Step 2 lớp 12'},
   {level:'2K10 muốn đi sớm',start:'Nhờ MTM tư vấn thời điểm bắt đầu phù hợp'},
  ],
  notes:['MTM dạy phần Toán và xử lý số liệu. Phần Văn học - Ngôn ngữ và phần tự chọn cần kế hoạch riêng.','Mốc học điều chỉnh khi ĐHQG Hà Nội công bố lịch thi 2027.']},
];

// Các bước tư vấn chung cho mọi khóa: từ lúc phụ huynh để lại thông tin đến khi theo dõi tiến độ.
export const CONSULTATION_STEPS=[
 {title:'Để lại thông tin',detail:'Phụ huynh hoặc học sinh điền biểu mẫu; MTM liên hệ lại để hỏi lớp, trường và mục tiêu.'},
 {title:'Kiểm tra đầu vào',detail:'Làm bài kiểm tra ngắn theo lớp để thấy em vững phần nào, hổng phần nào.'},
 {title:'Tư vấn và chọn bước',detail:'Dựa trên kết quả, MTM đề xuất bước bắt đầu, lớp, lịch học; học phí được xác nhận trước khi đăng ký.'},
 {title:'Vào lớp, nhận lộ trình tuần',detail:'Em nhận lộ trình theo tuần, sổ lỗi và các mốc tự kiểm cho cả năm.'},
 {title:'Kiểm tra cuối chặng',detail:'Sau mỗi chặng có bài kiểm tra; MTM báo phụ huynh và điều chỉnh bước học khi cần.'},
] as const;

export const isHsaCourse=(c:Course)=>step(c)>4;
export const courseTrack=(c:Course)=>TRACKS.find(t=>t.id===(isHsaCourse(c)?'hsa':String(c.grade)))!;

export type CourseAdvice={role:string;forWho:string;when:string;next:string};
export type CourseCardInfo={step:string;fit:string;period:string;next:string};
// Nội dung ngắn trên thẻ khóa học: dành cho ai, học lúc nào, học xong sang đâu.
export function courseCard(c:Course):CourseCardInfo{
 const n=step(c),g=c.grade,y12=g===12;
 if(n>4)return{step:'HSA · ĐGNL',fit:'2K9 xét tuyển bằng HSA',period:'10/2026 - 05/2027',next:'Sau khi thi: Step 4 lớp 12'};
 if(n===1)return{step:'Bước 1 · Nền tảng',fit:'Điểm dưới 6,5 hoặc còn hổng nền',period:y12?'Đến hết 02/2027':'Theo tiến độ trường',next:'Tiếp theo: Step 2 Vận dụng'};
 if(n===2)return{step:'Bước 2 · Vận dụng',fit:'Điểm 6,5-8, muốn lên 8+',period:y12?'Đến hết 02/2027':'Theo tiến độ trường',next:'Tiếp theo: Step 3 hoặc Step 4'};
 if(n===3)return{step:'Bước 3 · Vận dụng cao',fit:'Từ 8 điểm, mục tiêu 9+',period:y12?'Đến hết 02/2027':'Theo tiến độ trường',next:'Tiếp theo: Step 4 Tổng ôn'};
 return{step:'Bước 4 · Tổng ôn & luyện đề',fit:'Mọi mức, sau khi học xong kiến thức',period:y12?'03/2027 đến ngày thi':'3-4 tuần trước kỳ thi học kỳ',next:y12?'Giữ nhịp đề đến ngày thi':'Lên lớp '+(g+1)+' theo lộ trình'};
}
export function courseAdvice(c:Course):CourseAdvice{
 const n=step(c),g=c.grade;
 if(n>4)return{role:'Khóa HSA',forWho:'2K9 xét tuyển bằng đánh giá năng lực HSA. Nên vững Toán 12 ở mức vận dụng; nếu còn hổng, học song song Step 1 hoặc Step 2 lớp 12.',when:'Học từ tháng 10/2026, làm đề 75 phút từ cuối tháng 1/2027, luyện đề theo ca thi từ tháng 3/2027.',next:'Sau khi thi HSA, em tiếp tục Step 4 lớp 12 để ôn tốt nghiệp THPT.'};
 const after=g===12?'Step 4: Tổng ôn và luyện đề từ tháng 3/2027.':'Step 4: Tổng ôn và luyện đề trước kỳ thi học kỳ.';
 if(n===1)return{role:'Bước 1 · Nền tảng',forWho:'Em còn hổng kiến thức hoặc điểm Toán trên lớp dưới 6,5. Học lại từ khái niệm, dạng cơ bản và cách trình bày.',when:g===12?'Học từ bây giờ đến hết tháng 2/2027, song song vá nền 10-11.':'Học song song tiến độ trường trong năm học.',next:'Khi làm chắc bài cơ bản, chuyển lên Step 2 Vận dụng, rồi '+after};
 if(n===2)return{role:'Bước 2 · Vận dụng',forWho:'Em làm được bài cơ bản, điểm khoảng 6,5-8, muốn lên 8+. Luyện các dạng bài và cách phân tích đề.',when:g===12?'Học từ bây giờ đến hết tháng 2/2027.':'Học song song tiến độ trường trong năm học.',next:'Em mục tiêu 9+ học tiếp Step 3, còn lại vào '+after};
 if(n===3)return{role:'Bước 3 · Vận dụng cao',forWho:'Em đã vững vận dụng, điểm từ 8 trở lên, mục tiêu 9+. Rèn bài nhiều bước, lập luận và kiểm tra lời giải.',when:g===12?'Học từ bây giờ đến hết tháng 2/2027.':'Học song song tiến độ trường trong năm học.',next:'Tiếp theo: '+after};
 return{role:'Bước 4 · Tổng ôn và luyện đề',forWho:'Mọi mức, sau khi đã học xong phần kiến thức tương ứng ở Step 1, 2 hoặc 3.',when:g===12?'Từ tháng 3/2027 đến ngày thi tốt nghiệp THPT.':'Khoảng 3-4 tuần trước mỗi kỳ thi học kỳ.',next:g===12?'Giữ nhịp một đề mỗi tuần đến ngày thi chính thức.':'Lên lớp '+(g+1)+' theo lộ trình của MTM.'};
}
