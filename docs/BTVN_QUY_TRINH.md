# Quy trình BTVN MTM

Quyết định thường trực của Thành ngày 02/11/2026, thư `20261102-1745-CONG-UP-BTVN-2-DE.md`, được duyệt lại trong thư `20261102-1905-DUYET-GOP.md`.

BTVN luôn đủ 2 đề, học sinh chọn 1, khóa đề kia ở lượt 1. Hai đề cùng dạng, cùng mức độ và đúng tiến độ buổi học; mỗi đề có đáp án riêng. Không lấy đáp án đề này để chấm đề kia. Không sinh đề chỉ bằng đổi tham số theo khuôn.

Giáo viên gửi Đề 1 + đáp án Đề 1, Đề 2 + đáp án Đề 2, phần cần làm chung hoặc phần riêng của Đề 2. Tài liệu/video dùng chung cho buổi. Mỗi đề đi riêng qua sáu bước nhận, đọc nguồn, dựng đề, giải độc lập/đối chiếu đúng đáp án, gắn học liệu và giao. Đề/đáp án đầu vào và khóa chấm nằm trong vùng riêng tư.

Thiếu Đề 2 vẫn được đăng Đề 1. Publisher ghi cảnh báo **Thiếu Đề 2 — HS chưa được chọn 2 đề** trong biên nhận và bảng quản lý; không được báo buổi đã đủ. Thanh BTVN/đáp án tính theo đề, mẫu số bằng số buổi đã học nhân 2. Chỉ một đề thì học sinh làm đề đó và không hiện bộ chọn.

Hai đề dùng chung một `lessonCode` gốc, một `btvn_work` của mỗi học sinh, hạn nộp, bảng điểm và hạng của buổi. Đề 2 lưu riêng trong bảng private, không thêm buổi hoặc mẫu số. Hậu tố `-de-1`/`-de-2` chỉ là lựa chọn truy cập. Trước lượt đầu có thể đổi đề; commit lượt đầu khóa lựa chọn dưới cùng khóa giao dịch của học sinh/buổi. Tải lại, tab khác hoặc request cũ không mở khóa. Luyện lại giữ số lượt hiện hành trên đề đã chọn. Các biên nhận đã nộp được giữ nguyên.

Trước bàn giao phải kiểm hai khóa khác nhau, chọn Đề 2 chấm theo khóa Đề 2, không lộ khóa trước nộp, khóa đề kia sau bắt đầu, tiến độ khi thiếu Đề 2, chỉ một buổi trong bài làm/bảng điểm và không sửa biên nhận cũ. Test local không thay cho đăng nhập học sinh thử trên bản đã triển khai.

Triển khai theo thư duyệt hiện hành. Với thư 1905 ngày 02/11, merge/migration/đăng/bảng điểm chỉ sau 22:30 giờ Việt Nam và đủ điều kiện của từng bước; gặp lỗi dừng bước đó. Không gửi PH/HS, không sửa tay CSDL, không sửa các guard bảo vệ. Hợp đồng worker và các phụ thuộc triển khai còn thiếu nằm trong [LESSON_UPLOAD_WORKER.md](LESSON_UPLOAD_WORKER.md).
