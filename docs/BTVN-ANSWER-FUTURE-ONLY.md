# Sửa khóa cho lượt mới, giữ nguyên điểm đã nộp

Theo duyệt gộp 02/11/2026 18:59, bước chấm lại HSA 25/10 được tách khỏi kế hoạch thực thi. Không gọi `answer_correction_apply` từ lệnh đó. Migration 0002 chỉ thay định nghĩa hàm, không tự chấm bài; route legacy vẫn chỉ chấm lại khi người vận hành gọi explicit apply theo một lệnh riêng còn hiệu lực.

Migration `202611020003_btvn_answer_future_only.sql` bổ sung đường chuẩn:

1. `answer_correction_future_only_preview`: cùng schema binding/patch như preview cũ; kiểm đề mới hợp lệ, SHA ràng buộc toàn snapshot và mode `future_only`. Không chấm bài đã nộp, không ghi dữ liệu.
2. `answer_correction_future_only_apply`: bắt buộc SHA preview còn khớp. RPC mới khóa buổi và work, kiểm CAS; chỉ ghi đề và audit backup. Không UPDATE bất kỳ hàng `btvn_work` nào; receipts, drafts và revision giữ nguyên. Báo `corrected_future_only`, attempts=0, changed=0.

Có lượt đang làm thì HOLD để tránh khóa mới làm kẹt lượt cũ. Câu self/lời giải, điểm và nhận xét giáo viên giữ nguyên. Mã câu/đáp án/mode phải đọc từ nguồn thật; API không phải quyền tự sửa khóa thật.

Chỉ với bài đã có audit `mode=future_only`, wrapper commit cho phép các draft đã nộp đã lưu được gửi lại nguyên vẹn bên cạnh lượt mới, yêu cầu toàn bộ receipts và draft đã nộp cũ còn nguyên. Trường `late` do trigger hiện hữu phục hồi từ receipt đã lưu; các trường điểm không được bỏ hoặc đổi. Draft mới/đang làm phải khớp khóa hiện hành; trình duyệt cũ không thể khôi phục đáp án hay điểm cũ. Bài chưa sửa future-only giữ guard0001. Bảng điểm đọc các receipt đã lưu.

Đã chạy PGlite bằng chain commit và receipt trigger thật lấy qua một giao dịch READ ONLY, không có dòng học sinh. Adapter `SupabaseHomeworkRepository` thật nhận snapshot, nộp lượt mới, mở lượt tiếp và đọc lại DB: draft/receipt lịch sử còn nguyên, kể cả `late` được trigger gắn trước khi thử. Bộ kiểm có bài thường không thuộc future-only, quyền commit/base, khóa cũ, CAS, bất biến điểm và guard active attempt. Các resolver danh tính/quyền/lịch trong fixture được giả lập; chưa phải nghiệm thu cloud hay tài khoản học sinh thật.

Migration chỉ định nghĩa hàm và quyền. Triển khai theo workflow Áp Supabase với danh sách tệp tường minh, sau 22:30 giờ Việt Nam, `gio_cao_diem=false`; dựng lại handler trước deploy `mtm-btvn-publish`. Workflow `refresh_reports()` dựng lại bản hàm/view báo cáo và danh mục nguồn, không chạy correction hoặc chấm điểm. Đây là kiểm mã, chưa chứng minh cloud đã áp.
