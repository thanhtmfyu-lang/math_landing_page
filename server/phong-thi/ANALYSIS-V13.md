# Phân tích sau thi V13 — chờ triển khai

Ba chủ đề cần ôn được tính từ số điểm mất của chính lượt nộp, có liên kết đến câu tương ứng trong lời giải. Dùng dữ liệu chấm máy chủ hiện có, không đoán bài BTVN tương đương khi chưa có bảng ghép câu/chủ đề/bài lớp.

Phổ điểm chỉ nhận qua vé có chữ ký của lượt thi và chỉ đọc khi lượt đó đã lưu ở database. So trong cùng mã đề và cùng đợt (hoặc cùng mã đề không theo đợt). Mỗi người lấy lượt đầu không quá giờ; quy về thang 10. Dưới 5 mẫu không trả số lượng hay các bin. Không trả tên, mã học sinh, liên hệ hoặc đáp án.

Chủ repo áp migration 096 sau kiểm bằng Postgres, rồi bật `MTM_PHONG_THI_ANALYSIS=1` cùng `MTM_PHONG_THI_DB=1` và triển khai. Cờ mới mặc định tắt. Lượt Codex chưa áp SQL, chưa bật cờ và chưa kiểm web thật. Cần kiểm thực tế thứ tự ôn, neo câu, biểu đồ ở điện thoại, dữ liệu nhiều thang điểm và vé không hợp lệ trước nghiệm thu giao diện.
