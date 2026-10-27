# Biên bản QA ứng viên IS_TEST

ChatGPT/Codex triển khai. Anthropic Claude Code (`claude-opus-5-5`, model do CLI trả về) phản biện độc lập 2 lượt, chỉ nhận mã liên quan, không dùng tool/sửa tệp. Hai phản hồi thật được lưu tại `T:/Claude/SanPham/p0-web-2k10/is-test-audit/claude-review.json` và `claude-review-2.json`. Claude chưa đọc lại bản sửa sau lượt 2; không ghi là Claude đã duyệt bản cuối.

| Nhận xét | Quyết định và bằng chứng |
|---|---|
| Rewrite FROM có thể chạm DELETE; luồng ghi Phòng thi | Bảo vệ DELETE trước rewrite, giữ nguyên đích INSERT, kiểm đúng một neo sau INSERT và đúng tên tham số/jsonb. Test ghi thật có hạng2 khi QA10đ bị loại; ghi QA trả luyện tập, cùng nonce chỉ một dòng |
| Helper và bảng ngoài clone có thể làm lọt test | Thêm arena_group, official_receipts và view monthly/manual/attempts. Kiểm SQL động/tham chiếu không chuyển được; bắt buộc search_path rỗng, từ chối row-lock trong report. Source definition + SHA lưu trong schema khóa. Không khẳng định bao phủ mọi custom helper live; đối soát graph trước rollout là HOLD |
| Cần coalesce NULL thành false cho orphan | Không áp gợi ý này: nguồn schema có FK student/lesson; không được biến danh tính không rõ thành tài khoản thật. Giữ fail-closed; không xóa dữ liệu cũ |
| Khóa hot path | Đổi guard ghi/upload sang FOR KEY SHARE; prepare/finish vẫn FOR UPDATE, khóa tài khoản thử trước khi dọn |
| Chọn bài mặc định/chéo scope | Đối chiếu read_before_rank gốc: active + lớp + order date/code; thêm owner và parity. Wrapper giờ mở gốc tiếp tục che bài. Kiểm material.lessonCode trả về đúng bài đã chọn; test gọi chéo hai chiều bị từ chối |
| Lọc draft/receipt theo lessonCode | Không lọc theo trường không tồn tại trong draft/receipt. Bảng work có khóa chính(student_id,lesson_code), snapshot lấy chính dòng đó. Test repository thật save/submit/commit bài QA; không gộp work từ bài khác |
| UUID viết hoa/orphan Storage | Dùng regex UUID đầy đủ không phân biệt hoa thường, so prefix bằng lower, xóa đúng tên object gốc. Test orphan prefix hoa bị dọn, URL cũ hoa bị chặn; bucket khác cùng tên còn nguyên |
| Service key của client quản trị | Client RPC dùng publishable key + JWT quản trị; service key chỉ ở client Storage server. RPC deny service_role/anon/non-admin/admin khác/HS thật trước Storage |
| Quyền Storage native, ảnh byte mồ côi S3, consumer ngoài web | Ghi giới hạn/HOLD rõ tại is-test.md. Không thử DB/Storage live; không tự nới quyền hoặc bỏ trigger |

PostgreSQL PGlite trong RAM tái dựng 91 migration nguồn với các điều chỉnh fixture nêu trong `scripts/is-test-db.mjs` và `is-test.md`. Không phải readback schema live. Bộ `tests/exams-is-test.test.mts` kiểm 17 nhóm: tính cộng thêm, bất biến cờ, quyền/owner, scope hai chiều, bảng điểm, xếp hạng và thống kê, PH, ca/CSV, Phòng thi, chấm tay, save/submit, byte ảnh, lỗi Storage và retry, dọn idempotent, tombstone/UUID hoa, bảo toàn dữ liệu thật và bucket khác, cổng HTTP.

Storage là emulator chứa byte JPEG cùng metadata PostgreSQL, không phải Supabase Storage/S3 native. Test thật 099 reserve/confirm và handler upload, không chỉ xóa metadata. Không dùng UI/SendKeys/Chrome. Lệnh SQL seed chỉ là mẫu, không chạy mẫu này hoặc tạo dữ liệu trên DB thật.

Các mock hồi quy được cập nhật đúng tên RPC mới; giữ nguyên điều kiện quyền, dữ liệu riêng tư, giới hạn và các assertion khác. Không bỏ test hoặc đổi runner để làm xanh. PGlite được ghim devDependency để npm ci/npm test chạy độc lập, không phụ thuộc thư mục công cụ của máy cũ.

Artifact local: `.qa-temp/is-test/results.json`, `npm-ci.log`, `npm-test-final.log`, `vite-build.log`, `build-verified/`. Quét build giữ riêng; không đưa output build hoặc dữ liệu riêng vào commit. Việc worktree kế thừa sparse checkout đã được sửa bằng thêm public trong cấu hình riêng của worktree, không sửa checkout khác.

Chỉ là ứng viên chuẩn bị. Thứ tự bàn giao: Claude push/PR và review; sau 22:30 áp migration cùng phiên bản code, kiểm native Storage + consumer ngoài, rồi mới tạo cặp QA. Chưa push/PR/deploy/apply bởi Codex.
