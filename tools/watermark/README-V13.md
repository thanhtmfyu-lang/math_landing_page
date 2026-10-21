# Watermark V13 — chờ nghiệm thu và triển khai

Tái dùng nguyên công cụ `dong_dau.py`, checker `kiem_watermark.py` và logo màu trong thư mục watermark của Công ty AI trên Drive (bản 20/10/2026), không viết bộ đóng dấu PDF thứ hai.

`python scripts/prepare-public-watermarks.py --output <thư-mục-ngoài-repo>` chỉ lập danh mục SHA/bytes, không đổi PDF. Thêm `--stage` mới tạo bản đóng dấu để review ở thư mục ngoài repo. Không ghi đè nguồn, không sửa hàng loạt URL hoặc SHA trong catalog: các pin nguồn/phiên bản cần chủ repo đối chiếu riêng, không thay bằng phép replace chuỗi.

CSS của đề được mở rộng sang phần đề BTVN và ảnh câu hỏi; không chặn thao tác, khi in giữ lớp dấu. Lớp phủ HTML không chứng minh tệp tải xuống đã có dấu. Chưa chạy đóng dấu hàng loạt PDF công khai, chưa đổi byte ảnh câu hỏi tải xuống và chưa render nghiệm thu các bản đó. Giữ PR nháp tới khi đủ các bước này và các pin được kiểm lại.

Chỉ chủ repo merge và triển khai. Codex không sửa PDF đã phát hành trong lượt CODE này.
