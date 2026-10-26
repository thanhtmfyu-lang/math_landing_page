# Một nguồn lịch Lich_lop — chờ triển khai

Nguồn giờ học cho BTVN, phiếu học thử và các consumer mới là provider `lich-lop.ts`. Chỉ đọc bốn cột Lớp, Thứ, Bắt đầu, Kết thúc; một cache 10 phút và một tệp snapshot. Không lấy học phí, danh sách lớp hoặc dữ liệu cá nhân từ sheet. `MTM_LICH_LOP_CSV` trỏ CSV riêng tab Lich_lop; chưa có URL hợp lệ thì ghi nguồn là snapshot, không báo lịch live.

Cache dùng chung implementation trong mỗi runtime; các instance Vercel/Edge vẫn có bộ nhớ riêng và có thể lệch tới một chu kỳ cache. Đây không phải bộ nhớ đồng bộ toàn hệ thống.

Snapshot chuyển nguyên lịch Lich_lop 20/10 đang có. Riêng TSA giữ ca dự phòng từ cấu hình BTVN cũ, có `legacyOnly`, chưa xác minh trong Lich_lop; không đưa vào phiếu học thử. Không tạo lịch mới. Cần chủ lịch đối chiếu dòng TSA trước nghiệm thu toàn bộ lịch hiện hành.

`class-rules.json` chỉ giữ chính sách mở bài/hạn nộp, không chứa giờ học. Ca T6 của 2K10 9+ là lựa chọn hạn theo điểm danh lấy giờ từ lịch 8+, không được hiển thị thành ca học cố định mới. Các cặp mở bài, hạn theo ca và ngoại lệ hiện có được kiểm hồi quy. Không suy ra quyền xem học sinh từ lịch này.

Handler phát hành và native assignment/readiness lấy một bộ luật theo lịch cho từng request; không thay biến toàn cục giữa các request. Khi publish yêu cầu lớp không có ca trong nguồn đang dùng, chặn thay vì đoán giờ mở. Hàm cũ dùng snapshot để tương thích các caller đồng bộ.

CHỜ TRIỂN KHAI: đã dựng lại `handler.generated.js` từ source và loại các catalog fixture khỏi bundle (publisher kiểm đề trong payload đã xác thực). Chủ repo kiểm bundle, nạp CSV đúng tab và đối chiếu các ca thật trước deploy Edge. PR không deploy Edge/Vercel và không chạy sync_due/apply. Bundle đang phục vụ chưa đổi chỉ vì bản dựng được commit vào PR.
