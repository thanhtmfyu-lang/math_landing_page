# BTVN HIEN THI 3 LOI — 27/10/2026

Owner Codex theo lệnh trực tiếp Thành. Nhánh `codex/btvn-hien-thi-20261027`, worktree `T:/Claude/SanPham/p0-web-2k10/wt-btvn-hien-thi`. Bắt đầu sạch từ origin/main `bcbb3f8f6071ae5d53f09f342c022d480092cc56` sau fetch. Chỉ local code + fixture + báo cáo; không push/deploy/ghi DB/Zalo/UI/SendKeys/Chrome. Claude giữ bước push sau 21:45; không deploy 19:30–21:45; dữ liệu gộp lượt migration sau 22:30. Không chạy lịch hoặc publisher mới.

## Phần mã đã xử lý (3/3 kiểu hiển thị)

1. Tiêu đề thẻ lấy `homeworkTitle` (RPC dựng từ `btvn_lessons.exam.title`). Nếu chỉ là tên tệp chung như “Đề”, ưu tiên tên buổi có nghĩa từ `material.title`. Schema không có cột `lesson_name` trên btvn_lessons. Dọn mã [Lxxxx], ngày, đuôi PDF và chú thích trong tiêu đề. Chú thích đính chính/nộp vở giữ riêng dưới tiêu đề. Nếu cả hai nguồn đều chung chung, hiện “Bài tập về nhà”; không tự đặt tên nội dung chưa đọc. Nguồn title thực tế 25/10 cần owner xác nhận trong SELECT mẫu, chưa có payload ngày đó để khẳng định đã phục hồi đúng tên nội dung.
2. Hạn hiển thị dùng `lesson.dueAt`, hoặc `state.dueAt` chỉ cho đúng bài đang chọn. Giữ nhãn dự kiến cho `expectedDueAt`; không biến lịch tham khảo thành hạn thật. Không còn chữ “chờ xác minh” trong module màn hình BTVN; khi thiếu hạn, hướng dẫn liên hệ trợ lý và giữ trạng thái nộp/điểm. **Chưa xác minh hạn thật bài 09/10**. Mã bài đã định danh từ metadata 22/10: `btvn-5096431031b527b6d8370147d5d5fb86f609151f-v-88aa45310c6f81ff2846ba56609ad9e6b3724692`, lớp `2K10 9+`. SQL mẫu yêu cầu đối chiếu legacy `assignments.due_at` bằng class + exam id + version; nếu thiếu, phân xử ca kế tiếp theo L45 (đủ nguồn, chuyển ca/QL), rồi đưa dueAt vào payload kể cả khi chưa có work. Luật `plannedDueAt` hiện trừ 30 phút; yêu cầu lượt này là giờ vào ca kế tiếp. Không đổi global rule hoặc tự chọn một hạn khi chưa có chứng cứ.
3. Chỉ gộp payload lặp cùng `lessonCode`, giữ snapshot nộp mới nhất. Trường hạn bị bỏ sót không xoá hạn đã biết; null tường minh vẫn giữ null. Khác mã cùng tên/ngày được đánh “Bài 1/2”; khi đụng tên thẻ thi tháng, chỉ thẻ thường thêm “Bài bổ sung”. Không dùng tên hay URL PDF để kết luận cùng nội dung. **Chưa chứng minh hai mã bài 27/10 trùng nội dung hay khác bài**: public read không cung cấp đề/phạm vi/hash. SELECT mẫu liệt kê hai mã và so payload/phạm vi để owner xử lý sau 22:30; không xoá bài hay lịch sử nộp.

8 thẻ thuộc đợt thi tối nay (`thi-thang-*`, cả thi và BTVN) bỏ qua làm sạch/đánh số/gộp. Fixture metadata tổng hợp kiểm giữ nguyên 8/8; không đọc hay sửa nội dung/đáp án của 8 bài đó trong lượt này. Đây không phải xác nhận production đã đổi.

## Rà các lớp khác

Nguồn: metadata có sẵn của QA ngày22/10, trích đúng className/lessonCode/title/date, 53 bài–lớp/12 lớp. Không sao chép tài khoản, mã HS, PIN, điểm hay đáp án. Payload công khai `action=classes` đọc lúc18:48:33+07 ngày27/10: HTTP200, 18 tên lớp, không cookie/auth/login; không có due/content nên không dùng để khẳng định live hết lỗi. Sáu lớp còn lại chỉ xác nhận danh mục, chưa có fixture bài: 2K12, 2K12 lớp 9.1, 2K12 lớp 9.2, 2K13, 2K14, 2K15.

| Mã lớp | Bài kiểm metadata | Tên tệp thô | Chú thích dính tiêu đề |
|---|---:|---:|---:|
| 2K10 8+ | 3 | 0 | 2 |
| 2K10 9+ | 5 | 0 | 4 |
| 2K10 Thứ 3, 6 | 4 | 1 | 3 |
| 2K10 XPT | 3 | 1 | 1 |
| 2K11 8+ | 5 | 1 | 4 |
| 2K11 9+ | 4 | 0 | 3 |
| 2K11 XPT | 4 | 0 | 2 |
| 2K9 8+ | 8 | 1 | 5 |
| 2K9 9+ | 7 | 1 | 4 |
| 2K9 HSA (CN) | 1 | 0 | 1 |
| 2K9 HSA (THỨ 5) | 3 | 0 | 1 |
| 2K9 XPT | 6 | 3 | 5 |

Lớp khác có cùng lỗi tên tệp trong snapshot: 2K10 Thứ 3, 6, 2K10 XPT, 2K11 8+, 2K9 8+, 2K9 9+, 2K9 XPT. Không có dueAt hay định danh nội dung trong snapshot, nên hai kiểu lỗi hạn/trùng nội dung chưa được kiểm live ở các lớp khác. Chi tiết mã bài: `tests/fixtures/btvn-display-historical-20261022.json` và artifact `btvn-display-class-audit.json`.

## Kiểm chứng và phản biện

- `npm ci`: thành công, 0 vulnerabilities, không sửa lockfile/dependency.
- `node node_modules/vite/bin/vite.js build`: đạt; `node scripts/quet-cong-khai.mjs --build build`: đạt.
- `npm test`: 177/177 tệp đạt trên bản cuối; test mới có title raw/NFD/chú thích, due thật/dự kiến/thiếu/không gán sang bài khác, trùng định danh/cùng tên khác mã/cùng PDF khác phạm vi, receipt lặp và 8 thẻ bảo vệ; SSR của dashboard/thẻ/chi tiết + overview máy chủ.
- Quét `--diff origin/main` chạy SAU commit, biên nhận riêng; không gọi diff rỗng trước commit là bằng chứng.
- QA giao diện bằng HTML SSR, không mở trình duyệt theo lệnh cấm UI. Chưa có screenshot/render trình duyệt thật cho bản sửa.
- Claude Anthropic thật `claude-opus-5-5`: 1 phản hồi hoàn tất, phạm vi presentation.ts inline; đã lưu nguyên phản hồi. Lần đầu 150giây timeout chưa có phản hồi, không tính một vòng. Gói thứ hai thu nhỏ và bỏ round-trip Read, nhận 7 nhóm nhận xét; không có Claude PASS bản cuối.
- Đã sửa Unicode/chú thích ở 3 nguồn/ngoặc lồng, trim dấu sau pdf, tách đánh số thẻ thường khỏi protected, giữ due khi trường bị bỏ sót. Ý kiến giữ due khi null: chỉ áp cho undefined, vì null có thể là thu hồi hạn; thêm test. Ý kiến selectedDueAt: caller R104 đã ràng đúng lessonCode, thêm SSR chứng minh không tràn sang bài khác. Test kiểm lại đạt.
- Skill React trong danh mục bị từ chối đọc bởi sandbox; không đổi đường hay quyền để vượt. Đã tự rà hook, key, render, callback và type theo phạm vi sửa. Không báo đã dùng skill. Không ghi Notion ngoài phạm vi báo cáo Brain cụ thể được giao trong lượt không ghi DB.

## Dữ liệu chờ owner sau22:30

`reports/20261027-btvn-hien-thi-migration.sql`: mẫu READ ONLY/SELECT/ROLLBACK + pseudocode, ngoài thư mục migration tự áp. Chưa thực thi SQL ở PC/VPS. Cần chốt tên nguồn25/10; due09/10; mã/phạm vi/nội dung27/10. L45: không quy thiếu nguồn/hạn thành “Chưa làm”; giữ đủ nguồn/ca trước khi phân xử. Chưa có quyền và không thực hiện thay đổi dữ liệu ở lượt này.

## Bài học thực tế

1. Dọn tiêu đề phải dùng cùng chuẩn NFC và giữ chú thích học vụ ở cả tên đề/tên buổi; loại chữ khỏi heading không đồng nghĩa được bỏ hướng dẫn nộp vở.
2. Hai bản snapshot cùng lessonCode có thể khác độ đầy đủ của trường dueAt: phân biệt undefined với null tường minh, không khôi phục hạn đã bị rút bằng dữ liệu cũ.
3. Metadata cũ đủ kiểm mẫu hiển thị nhưng thiếu hạn/hash thì không đủ kết luận live về hạn nộp hoặc trùng nội dung; giữ lớp/ngày nguồn trong báo cáo.

Artifact PC đã kiểm: `T:/Claude/SanPham/p0-web-2k10/btvn-hien-thi-audit` gồm test/build/scan logs, phản biện/timeout, public classes, HTML SSR và bảng rà lớp. Bản build đã quét được giữ ngoài commit; mã gốc build/ trong repo được phục hồi nguyên HEAD. Tệp biên tập/sản phẩm ở T.
