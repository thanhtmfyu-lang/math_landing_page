# Bảng tin 071 và Edge — CHỜ TRIỂN KHAI

Nguồn giao việc: BAN_GIAO_WEB_CHO_CODEX_21_10.md ngày 21/10/2026. Lượt Codex chỉ mở PR; các bước dưới dành cho chủ repo sau nghiệm thu. Không phải biên nhận đã áp.

1. Đọc trạng thái database và lịch sử triển khai hiện hành, tránh chạy lại migration đã áp. Đối chiếu đúng dự án Supabase và các migration BTVN tiền đề của 071.
2. Khi được phép triển khai, chủ repo chạy workflow **Áp Supabase** với migration `202610190071_bang_tin_trung_tam.sql`, Edge `mtm-bang-tin`. Tôn trọng cổng giờ cao điểm của workflow. Không gửi kèm nội dung ảnh, thông tin học sinh hoặc bí mật vào log.
3. Đọc lại bucket `mtm-bang-tin`: private, chỉ ảnh được duyệt mới đọc được; kiểm truy cập Edge thiếu/sai thông tin xác thực bị từ chối. Không gọi hành động nhận/duyệt/ẩn ảnh thật chỉ để thử.
4. Sau kiểm backend, luồng có quyền Vercel mới bật `MTM_BANG_TIN_ENABLED=1` và triển khai. Codex chưa đặt biến và chưa triển khai.
5. Kiểm trên web thật: bài đã duyệt hiện đúng, ảnh chưa duyệt/ẩn không hiện, URL ký hết hạn không còn truy cập, video Range nếu nguồn có video. Ghi phiên bản, thời điểm và biên nhận đọc lại. Chỉ HTTP 200 hoặc workflow xanh không đủ chứng minh đã hiển thị đúng ảnh.

Nếu lỗi, chủ repo tắt cờ hiển thị để giữ dữ liệu và xử lý nguyên nhân; không xóa ảnh hoặc khởi tạo lại bảng. Các bài đóng gói đang có là nguồn độc lập, không coi chúng là bằng chứng Edge 071 hoạt động.

PR này không sửa ảnh, không duyệt ảnh, không đăng và không thay đổi quyền chia sẻ. Các nhánh V13 đã chặn preview tự động.
