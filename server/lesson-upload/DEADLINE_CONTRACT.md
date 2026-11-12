# Hạn nộp và chống gửi trùng ở cổng BTVN

Ứng viên ngày 12/11/2026, chưa áp production. Phụ thuộc migration 101, 102, 103;
migration mới `202611120107_lesson_upload_deadline.sql` chỉ nằm trong pending.

`mtm_lesson_upload_api({action:'create', ...})` nhận thêm:

- `due_at_by_class?: Record<classId, ISO8601 có múi giờ>`: map đầy đủ hoặc một phần.
  Lớp thiếu giữ mặc định ngày buổi + 7 ngày, giờ bắt đầu − 30 phút. Map chỉ chứa
  các lớp trong nhóm buổi đã được máy chủ xác minh. Mỗi hạn phải sau giờ kết thúc
  buổi tương ứng, là mốc mở BTVN của luồng này.
- `client_request_id?: UUID`: mỗi lần gửi mới dùng một mã; giữ nguyên mã, toàn bộ
  payload và đường dẫn tệp khi đối soát hoặc thử lại sau khi mất phản hồi.

Cùng người gửi + mã + payload trả lại `ok`, `already_received:true`, `upload_id`,
`version`, `due_at_by_class` của lần nhận trước. Đổi nội dung với cùng mã trả
`CLIENT_REQUEST_CONFLICT`; không được tự đổi mã để vượt lỗi. Việc nộp lại hợp lệ
với một yêu cầu mới vẫn tạo phiên bản mới như trước. Tài khoản không còn hoạt
động hoặc còn bắt buộc đổi mật khẩu không được đọc biên nhận qua mã cũ.

Mã lỗi xác định: `INVALID_CLIENT_REQUEST_ID`, `CLIENT_REQUEST_CONFLICT`,
`INVALID_HOMEWORK_DEADLINE`, `CLASS_SCOPE_MISMATCH`. Lỗi kết nối không chứng minh
máy chủ chưa nhận; giữ payload đã chụp và thử lại cùng mã.

Máy chủ tự tạo `due_at_overrides` riêng tư; client không được gửi trường này.
Worker kiểm map được lưu trong phiên bản đã claim. Luồng default cũ vẫn kiểm
đúng hạn mặc định từng lớp. Không thêm thời hạn vào payload xuất bản do client
cung cấp; các hàm `lesson_web_due` và trigger công việc đọc chính map private đã
lưu, dưới capability/lease hiện hữu. Không sửa hạn, khóa hoặc điểm bản đã đăng.

Phát hành phải phối hợp migration 107 và worker bundle mới trước khi đưa UI tùy
chỉnh hạn vào sử dụng. Worker cũ sẽ giữ chặn các hạn khác mặc định. Không tự bật
worker, auto-poll, ưu tiên web hoặc bộ gửi tin từ thay đổi này.
