# 071b: phần chênh lệch bảng tin của PR56

## Bằng chứng chỉ đọc ngày 21/10/2026

- `gh run view 39570697997 --log-failed`: migration `202610190071_bang_tin_trung_tam.sql` lỗi HTTP 400, SQLSTATE 42P07, `relation "ngay_le" already exists`. Job metadata xác nhận bước Deploy Edge bị skipped. Tệp SQL ở SHA `1c6a5ada7a86f7a080dc916ea690a8edbf5f2079` có BEGIN/COMMIT: lần chạy lỗi này không commit thay đổi nào.
- So sánh 071 tại `f965f4b1` với SHA trên: phần SQL thay đổi là overload đọc `mtm_bang_tin_doc(text)` thành `mtm_bang_tin_doc()`, bỏ kiểm phiên trong overload mới và đổi chữ ký cấp quyền. Bảng, bucket, seed và RPC ghi/duyệt giữ nguyên.
- Không có workflow chỉ đọc catalog Supabase trong main. Các workflow chẩn đoán còn trong danh mục chỉ kiểm web, không cung cấp catalog bảng/hàm. Không dispatch workflow nào và không gửi SQL lên DB thật.
- **Đã xác minh trên DB qua log:** relation tên `ngay_le` đã tồn tại tại thời điểm chạy lỗi; suy ra schema `mtm_bang_tin` từ câu CREATE TABLE có tiền tố schema trong 071. **Suy luận từ lịch sử, chưa xác minh catalog hiện tại:** 071 cũ đã áp và phần còn thiếu là overload `public.mtm_bang_tin_doc()` cùng quyền EXECUTE cho service_role. Không khẳng định các bảng/RPC khác đang đủ hoặc hàm mới chắc chắn đang vắng.

## Phạm vi migration

`202610210071b_bang_tin_doc_con_thieu.sql` kiểm sự tồn tại ba bảng và bốn RPC ghi/duyệt nền trước khi bổ sung duy nhất overload không tham số, nếu nó chưa có. Nếu cấu trúc nền thiếu, transaction dừng với lỗi rõ để kiểm catalog; không tự dựng lại hoặc sửa dữ liệu dựa trên suy luận. Nếu overload đã có thì giữ nguyên body. Chạy lại chỉ tái xác lập quyền service_role, thu hồi PUBLIC/anon/authenticated.

Giữ nguyên overload có tham số, bucket riêng tư, dữ liệu/ngày lễ, index, RLS và migration 071. Hàm mới chỉ trả bài `da-dang` trong 180 ngày có ảnh `da-dang`, tối đa 30 bài/60 ảnh mỗi bài; giữ cùng logic PR56. Không tự duyệt hoặc đăng ảnh.

Edge `mtm-bang-tin` kiểm header `x-mtm-token` với `MTM_DD_TOKEN`, từ chối khi token cấu hình rỗng hoặc không khớp trước khi đọc request body. Thêm cấu hình `verify_jwt = false` chỉ cho function này để gateway không chặn token riêng trước handler.

PR là sản phẩm bàn giao. Việc áp 071b, deploy Edge và kiểm catalog/luồng thật thuộc lượt phát hành được giao riêng; lượt này không merge, áp DB hoặc deploy.

Workflow `ap-supabase.yml` chỉ áp đúng tên tệp nhập thủ công, không tự quét thư mục hoặc quản lý version bằng `supabase db push`. Khi được giao phát hành, chọn riêng 071b; không chạy lại 071 bản PR56. Chưa có bằng chứng cần `migration repair`, nên không đề xuất sửa lịch sử DB từ lỗi này.

Giới hạn: guard kiểm sự tồn tại, chưa kiểm cột hoặc định nghĩa hàm đang có trên DB thật. Nếu `doc()` đã có, cần đọc định nghĩa và ACL khi nghiệm thu live; migration này giữ body hiện hữu. Lượt SQL QA cục bộ dùng PGlite RAM, original 071 tại `f965f4b1`, bao phủ tạo delta/chạy lặp/giữ dữ liệu và RPC cũ/phân quyền/lọc bài và ảnh/giữ body có sẵn/chặn nền thiếu. Script và biên nhận lượt QA nằm trong gói bằng chứng PC, không phải log áp DB thật; file assertions trong PR chỉ chứa phần fixture đọc và ACL.
