# Cổng đề thi tháng GV/QL — bản nháp ngoại tuyến

Migration mới: `supabase/migrations-pending/202611030101_thi_thang_gv.sql`. Chưa áp DB. Cần is_test100, guard chọn mã của PR #146, PR #148 và ba migration 101/102/103 của PR #150 trước. Không áp lại migration lịch sử chỉ vì có trong danh sách dependency.

`/quan-tri/len-bai` → **Đề thi tháng**: chọn một/nhiều lớp, ngày, giờ mở/đóng, đề 101 và 102 với đáp án riêng. PDF/ảnh dùng lại bộ ghép PDF và bucket `mtm-lesson-private`. Có thể gõ khóa TN/ĐS/TLN; khi có tự luận phải bổ sung rubric và điểm tối đa. GV chỉ lớp theo lịch đã xác minh; mọi tài khoản role `ql` (gồm hang/vietanh/dung/quanly) và admin được đăng thay. Không mở quyền exam-admin cho GV/QL.

Máy dùng `monthly_uploads` riêng trong `mtm_hw_private`, khóa lớp/ngày/phạm vi test, giữ phiên bản và lease. Không thay hạn hay lesson BTVN. Bản đã phát hành không ghi đè; nhóm lớp đang chờ không bị thu hẹp âm thầm. Trường hợp đã có bài thi hiện hành cùng lớp/ngày phải dùng quy trình sửa riêng.

## Worker và cổng kiểm

Launcher/bundle PR #150 giữ OFF, không thêm lịch. Một lượt `--once` theo thứ tự BTVN → khi idle mới xét một upload thi tháng → khi vẫn idle mới xét một bài tự luận. Dùng cùng `worker.lock`, native budget, state private và Edge publisher. Không thêm API Vercel; service-role vẫn ở Edge. Bản bundle phải được xây lại sau thay đổi này; không cài/bật từ phiên sandbox.

Mỗi mã được trích/dựng riêng. Cùng production validator hiện có kiểm hai kết quả giải độc lập từ Grok và agy, cộng kết quả CAS. Request schema 2 dùng đúng provider đã chỉ định, hai hash/ngữ cảnh riêng, không dùng fallback của schema 1 để giả làm hai AI. Đề và khóa không đi vào repo; request giải chỉ có câu hỏi. Biên nhận thật phải có model, request/session và hash, không thay nhãn provider.

Không có ngoại lệ “20 phút rồi giao trước”. Thiếu hoặc lệch kiểm giữ chờ/đỏ; quá giờ mở mà chưa đạt cũng giữ chờ. Cả hai mã được validate lại tại Edge từ byte đã lưu trước một giao dịch DB. Mã 102 lỗi thì giao dịch hoàn tác cả mã 101. Capability DB ngăn route publish thường bỏ qua gate này.

Mã bài có dạng `thi-thang-YYYY-MM-web-<UUID>-thi-ma-1|2`, hiển thị 101/102 theo cơ chế hiện có. Giữ nguyên cơ chế chọn và khóa mã, đồng hồ, ảnh tự luận, chấm khách quan, giấu lời giải tới closesAt và luật `paper_scores`. Bản này tạo hai bài thi; chưa tự tạo cặp BTVN bù mã sau ca.

## Giới hạn CAS hiện hành — không được coi là đã kiểm toàn bộ Toán

`monthly-sympy.py` chỉ xác nhận các biểu thức số đọc trực tiếp được từ đề/lựa chọn và mệnh đề Đ/S dạng đẳng thức. Kết quả của hai AI phải khớp phép tính gắn với chính câu hỏi. Một đẳng thức đúng nhưng không liên quan do AI gửi không thể chứng minh đáp án. AST giới hạn, không dùng eval/parse_expr/sympify trên chuỗi không tin cậy; giới hạn lũy thừa, RAM/CPU trên Linux và timeout riêng 15 giây.

Đề có văn xuôi, hình học, biểu thức chưa hỗ trợ hoặc chứng minh tự luận sẽ **giữ chờ**. Chưa có adapter CAS tổng quát/đối soát rubric tự luận đủ bằng chứng trong sandbox; không đánh dấu những câu này đã được SymPy xác nhận. Phải hoàn thiện và nghiệm thu phần này trước khi dùng cổng cho đề tháng thực tế có các dạng đó.

## Tự luận và điểm

Sau closesAt + 15 phút, dùng hàng ảnh đã xác nhận của PR #146/099. Worker chỉ đưa câu tự luận, ảnh và rubric vào hàng PC schema 3; không đưa tên, lớp, số điện thoại, student ID hay attempt ID vào request. SHA ảnh được kiểm trước khi chuyển. Tối đa tổng 20 MB mỗi bài; vượt hạn giữ chờ để xử lý riêng.

Grok và agy nhận hai request độc lập; lệch **lớn hơn** 0,25 mới yêu cầu Codex (hoặc Claude qua hàm điều phối). Receipt bắt buộc provider/model/request ID, SHA bài/rubric, ảnh đã xem và điểm hợp lệ. Kết quả chỉ là đề xuất private trong `monthly_essay_reviews`; không tự quyết cách gộp điểm, ghi `paper_scores`, sửa điểm gốc hoặc gửi phụ huynh.

PC phải cấu hình `MTM_MONTHLY_IMAGE_REVIEWER` thành JSON mảng lệnh tuyệt đối của bridge đa phương thức đã xác minh. Bridge nhận `--provider <tên>` và request JSON qua stdin; phải xem ảnh thật và trả envelope có provider, model/modelUsage, request/session ID, result gồm submission_hash/rubric_hash/max_score/score/images_seen/image_shas/reasoning. Đây là hợp đồng tích hợp, **chưa có bridge thật được kiểm trong phiên này**. Thiếu bridge, collector bỏ qua request ảnh để vẫn xử lý BTVN/key; không claim hoặc gọi CLI bằng cờ đoán. Không gửi base64 như văn bản rồi coi là đã xem ảnh.

## QA và ranh giới

Các test Node/SQL/Edge/React SSR dùng dữ liệu giả, RPC/Storage trong bộ nhớ, không gọi provider thật. Python test CAS và queue được cung cấp riêng; cần Python + SymPy để chạy. Test browser/viewport cần Chrome CDP hoạt động. SSR không thay kiểm giao diện trình duyệt.

Chưa nghiệm thu upload thật, provider thật, ảnh HS thật, lịch chạy, migration cloud hoặc SLA. Không bật worker, không gửi Notion/Claude/Javis và không publish từ lệnh sandbox không mạng. Báo cáo cụ thể và kết quả chạy ở `BAO-CAO-THI-THANG-GV.tmp.md`.
