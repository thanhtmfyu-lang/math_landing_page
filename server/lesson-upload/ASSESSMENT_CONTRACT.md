# BTVN và đề kiểm tra theo lớp

`work_kind` là `homework` hoặc `exam`; thiếu trường ở yêu cầu cũ có nghĩa BTVN. Giá trị lạ/null bị từ chối. `is_test` chỉ là cờ QA, độc lập với loại bài. Tiêu đề không quyết định quyền hoặc tuyến xuất bản.

BTVN giữ lịch ghép lớp, phạm vi, hạn nộp, hai đề tùy chọn và chính sách phiên bản cũ. Mỗi đề kiểm tra có `assessment_id` UUID riêng, một lớp, `exam_type` monthly/custom và tên giáo viên nhập. Nhiều đề cùng buổi cùng tồn tại; sửa một đề chỉ thay phiên bản của đề đó. Khi đã có lượt học sinh, cần tạo đề khác để giữ đề và kết quả đã dùng.

`exam_config` chứa `opens_at`, `closes_at` có múi giờ và `duration_minutes` nguyên1–240, đủ trong cửa sổ mở bài. Mặc định từ ca học đã được máy chủ xác minh, giáo viên có thể chỉnh. Đề kiểm tra giữ một lượt, đóng ở min(hạn lượt, giờ đóng), không nhận câu trả lời mới sau hạn; máy chủ công bố điểm/lời giải theo giờ đóng và trạng thái nộp. Không đổi trường deadline nguồn làm sai kiểm phiên bản.

AI nhận tiêu đề/phạm vi như dữ liệu cùng tệp thật. Không bịa câu theo tiêu đề hoặc ép12+4+6. Đáp án được lưu riêng tư, giải độc lập nhận câu hỏi không có khóa. Kiểm tra mới yêu cầu kết quả độc lập, không dùng chế độ BTVN chờ kiểm chéo20phút. Trước giờ công bố, response không có khóa, lời giải chữ/cấu trúc, PDF lời giải hoặc điểm dẫn xuất.

Tuyến mới xuất bản `kind=kiem-tra` qua capability của upload trong cùng giao dịch, theo đúng lớp, nguồn, tiêu đề, cấu hình và lease. Không đưa vào catalog tự luyện công khai hoặc áp quy tắc hai mã của thi tháng cũ. Phòng làm bài dùng phiên học sinh và ACL lớp hiện hữu. Tiến độ/nhắc/xếp hạng BTVN không tính đề kiểm tra. Tra cứu có bộ lọc loại riêng, giữ UUID học sinh, lịch sử chuyển lớp, điểm0 và dữ liệu thiếu.

Worker mới gửi `worker_protocol=110`; worker cũ chỉ nhận BTVN. Không thêm mặc định vào payload pending cũ: giữ nguyên UUID/nội dung/đường tệp khi kết quả chưa rõ. Retry cùng phiên bản vẫn giới hạn và không cấp quyền tự động. Năm upload thật trước cutoff không được chạy lại trong đợt nâng cấp.

Phát hành cần kiểm SQL110 bằng rehearsal rollback, gói worker được ghim SHA, Edge validator mới, kiểm thử bằng upload QA qua tài khoản quản lý thường, biên nhận AI/xuất bản và đường xem học sinh. Test fixture hoặc build thành công không thay cho biên nhận đã đăng.
