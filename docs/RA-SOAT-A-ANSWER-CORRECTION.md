# Sửa đáp án và chấm lại BTVN — bản nháp, chưa triển khai

Khóa BTVN đã đăng hiện bất biến ở publisher. Nhánh này thêm `answer_correction_preview` và `answer_correction_apply` qua chính publisher có xác thực. Không ghi tay CSDL và không gửi tin PH/HS. Không áp cho kiểm tra tháng hoặc bài tự luận cần chấm tay.

Preview đọc snapshot được giới hạn bởi owner và class scope, rồi dùng đúng `resultFor`/engine hiện hữu để chấm mọi lượt đã nộp. Apply bắt buộc SHA kế hoạch preview còn khớp; RPC khóa theo buổi, đọc lại toàn snapshot, sao lưu đề/bài làm/biên nhận cũ và ghi đề + toàn bộ điểm trong một giao dịch. Cùng request ID + cùng nội dung chỉ trả kết quả cũ; khác nội dung bị chặn. Không sửa câu trả lời, thời gian, hạn nộp, số lượt hay cờ nộp muộn. Lượt đang làm giữ câu trả lời và được chuyển sang khóa mới; trình duyệt còn khóa cũ phải tải lại. Điểm cao nhất lấy từ các receipt đã chấm lại như luồng hiện hữu, không ghi một bảng điểm khác.

MTM có phiên bản đáp án riêng; thang cũ được tăng `versionHash` vì draft cũ không có trường khóa đáp án. Wrapper của commit chia sẻ cùng khóa buổi, giữ quyền service-role và kiểm phiên bản trước gọi commit hiện hữu. Bản sao commit cũ bị thu quyền gọi trực tiếp. Có điểm thủ công hoặc nguồn/đáp án chưa đủ chấm thì giữ HOLD.

Nguồn quyền phải là `lenh_ref` và `approved_via` do người vận hành đối chiếu lệnh thật, không tự tạo chứng cứ duyệt bằng chuỗi reviewer. Secret publisher xác thực người gọi; các trường này là locator audit, không phải chữ ký điện tử của Thành.

## Trình tự triển khai do bên phát hành thực hiện

1. Kiểm diff và nguồn lệnh hiện hành; kiểm native scope, rubric và dữ liệu của đúng buổi. Áp migration `202611020001_btvn_answer_correction.sql`, dựng handler bằng `node scripts/build-btvn-publish.mjs`, triển khai riêng publisher. Nhánh bị tắt Vercel auto-deployment để việc mở PR không thành preview/deploy.
2. Gửi preview với `lesson_key`, `request_id` cố định cho nguồn lệnh, `lenh_ref`, `approved_via`, `patches`. Patch dùng **ID câu đã đọc từ exam**, không suy ID từ số thứ tự. MC chỉ sửa `answer`; TLN chỉ sửa `acceptedAnswers` và giữ quy tắc/đơn vị. Không tự đổi chế độ TLN để ép khớp.
3. Kiểm preview: đúng câu, đúng số lượt, SHA và nguồn. Apply gửi lại cùng nội dung và `expected_plan_sha256`. Khi stale, đọc preview mới và đối chiếu; không phát lại tự động.
4. Đọc lại kết quả theo cùng request, kiểm web thật và nguồn bảng điểm/J39 hiện có. Migration/fixture/test không chứng minh live đã đổi. Giữ bản sao `btvn_answer_corrections` trong schema riêng RLS. Không tạo lịch gửi hoặc gửi đính chính.

## Đầu việc cụ thể đang chờ đường chuẩn

- 2K10 XPT 19/10: số câu 7 → A, số câu 8 → D theo chỉ định Thành; chưa đọc được exam live để ghim ID câu và giá trị trước sửa.
- HSA Chủ nhật 25/10: số câu 20 → 2/3 theo chỉ định Thành; phải đối chiếu mode/shortRule của câu thật.
- HSA câu 23: chưa có đề thật trong lượt này và chưa đủ hai lời giải độc lập, vì vậy chưa có patch.

Hai mã buổi hiện hành được đọc từ catalog chỉ đọc và lưu trong bằng chứng RA-SOAT-A trên PC; chúng không được chép vào fixture. Không gán kết quả của candidate cache cho exam live.

## Kiểm đã chạy

21 ca logic correction, 21 ca SQL PGlite về giao dịch/quyền/backup/CAS/replay và chống ghi khóa cũ cho cả rubric MTM/lẫn thang cũ, cùng hồi quy BTVN và MTM. Các nguồn đều là fixture. Chưa triển khai cloud; chưa chấm lại điểm thật.

Rollback giữ nguyên ledger/bản sao, không xóa lịch sử. Nếu chưa có correction live thì có thể quay publisher về bản trước và thu quyền RPC mới sau khi xác minh không có caller đang dùng. Nếu đã áp correction, không tự copy điểm cũ trở lại; lập kế hoạch correction mới từ snapshot hiện hành để tránh đè bài nộp sau lần sửa.
