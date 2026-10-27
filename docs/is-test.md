# Tài khoản và bài thử — ứng viên 20261027

Chỉ chuẩn bị. Không áp DB, không push từ Codex. Claude phản biện, push/mở PR; chỉ áp sau 22:30 giờ Việt Nam theo lệnh Thành. Migration: `supabase/migrations-pending/202610270100_is_test.sql`, sau 099 đã có trên main #97. Không đưa migration này sang thư mục tự áp.

## Phạm vi và dữ liệu

- Thêm `students.is_test`, `btvn_lessons.is_test`, `mtm_phong_thi.tai_khoan.is_test`, NOT NULL DEFAULT false. Không UPDATE/DELETE dữ liệu cũ khi migrate; không thay hàm/ACL cũ. Cờ bất biến sau INSERT để tránh biến tài khoản thật thành mục tiêu xóa. `trial` vẫn là học sinh học thử thật, không phải QA.
- Thêm view và bản hàm báo cáo `_real100`; lọc tài khoản/bài thử trước AVG, COUNT, ROW_NUMBER, LIMIT. Giữ chuỗi wrapper đang có trên DB; lưu SHA định nghĩa nguồn trong `mtm_test100.report_sources`. Dừng migration nếu có nguồn đọc không chuyển được hoặc SQL động ngoài thiết kế. Khi các hàm gốc thay đổi sau này, phải cập nhật bản báo cáo cùng phiên bản; clone không tự theo thay đổi tương lai.
- Web đổi tuyến xếp hạng/đấu trường/hạng riêng, bảng điểm, Góc phụ huynh, xuất điểm, ảnh chờ chấm và Phòng thi sang hàm đã lọc. Transport HS dùng `mtm_btvn_read_scoped100`; chỉ tài khoản thử làm bài thử, tài khoản thật làm bài thật. Trigger bảo vệ cả commit/nộp ảnh. Trigger chặn chấm chính thức trong `btvn_manual_grades` cho tài khoản hoặc bài thử, kể cả bộ chấm còn gọi RPC cũ.
- Các hàm/bảng báo cáo gốc vẫn tồn tại vì yêu cầu chỉ thêm. Không tạo tài khoản thử production trước khi mọi consumer ngoài web chuyển nguồn theo bảng dưới.

## Các consumer ngoài web phải đổi trước khi tạo dữ liệu QA thật

| Consumer | Nguồn cần chuyển/lọc | Điều kiện kiểm |
|---|---|---|
| Bảng PH, ảnh gửi nhóm | `mtm_btvn_scorebook_real100(from,false)` | Không có student/lesson is_test; tiếp tục bỏ `trial=true` theo luật riêng của bảng PH |
| Danh sách ca, nhắc buổi, xuất CSV/Sheets | `mtm_btvn_sheet_csv6_real100(tab)`; nội bộ `hv_ca_rows_real100` | Bỏ test trước COUNT, danh sách ca và mọi nhắc/gửi; web không tự đổi công thức Sheet ngoài repo |
| Bộ dựng L45 | Chỉ lấy danh sách từ scorebook đã lọc; khi ghép roster/lesson, `NOT s.is_test AND NOT l.is_test` | Lọc trước dựng ảnh, cache, tổng số học sinh và xếp hạng; xóa cache QA cũ nếu từng có |
| Bộ chấm Javis/PC | Queue JOIN students + lessons, cùng điều kiện trên; `mtm_tu_luan_teacher_real100` cho hàng ảnh thật | Bỏ test trước download ảnh/gọi model/tốn credit; trigger SQL chỉ là chốt cuối, không thay lọc queue |
| Điểm giấy/PH/Phòng thi ngoài web | Dùng RPC `_real100` tương ứng, đặc biệt `mtm_pt_bao_phu_huynh_real100(tu,den)`; không đọc bảng gốc trực tiếp | Không có QA trong đầu ra và thống kê tổng |
| Đồng bộ roster/lịch/hạn, sync_events, mọi sender | Không nhận tài khoản/bài thử vào bộ dữ liệu thật; lọc is_test khi lấy DB, không nhập QA từ Sheet | Không tạo lịch/nhắc/gửi cho tài khoản thử; không đưa QA vào `sync_due` hoặc bộ chuyển lớp thật |

Không sửa, chạy hoặc tự nghiệm thu các bộ ngoài repo trong lượt này. Claude/Javis phải giữ HOLD việc tạo QA production cho tới khi các nguồn ngoài đã đổi và đối soát thật. Không gửi Zalo từ phương án này.

## Tạo một cặp thử — chỉ lệnh mẫu, chưa chạy

Xem `is-test-seed.example.sql`. Thay UUID lớp bằng lớp đúng owner đã xác minh. Chạy trong phiên quản trị đã xác thực khi được phép, sau migration100 và các gate ngoài web. Tài khoản mới có tên QA riêng và is_test=true ngay từ INSERT; không đổi cờ HS cũ. Bài thi QA chỉ có 1 câu MC đơn giản và 1 yêu cầu ảnh, 120 phút; fixture nằm tại `scripts/fixtures/is-test-exam.json`. Đây là mẫu tự soạn để kiểm luồng, không phải đề chuẩn MTM hay đề đưa học sinh.

Nếu cần mã HS để đăng nhập, dùng RPC cấp mã hiện có `mtm_hw_admin_issue_code(p_student_id,p_days)` cho UUID thử vừa tạo; nhận mã qua phiên quản trị riêng. Không chép mã/phiên/JWT vào log, Brain, commit hoặc chat. Không dùng profile/học sinh thật để thử. Web không thêm màn quản trị mới trong nhánh này.

## Dọn sạch bài thử

POST `/api/btvn`, cùng origin web, `Authorization: Bearer <JWT quản trị hiện có>`, JSON duy nhất `{"action":"test-cleanup","studentId":"<UUID tài khoản thử>"}`. Route dùng chung các chặn POST, origin/host và proxy của BTVN. Không truyền path, bucket, owner, is_test hoặc service key từ client. RPC `prepare100`/`finish100` chỉ cấp EXECUTE cho authenticated, kiểm admin hiện có + đúng owner + is_test=true; service_role/anon/HS không gọi được.

1. Prepare khóa tài khoản thử và ghi tombstone, lấy tất cả ảnh đã xác nhận, pending và object mồ côi trong đúng prefix owner/student của bucket `mtm-tu-luan`.
2. Server dùng Storage API `.remove()` để xóa byte/object, theo lô 100. Không `DELETE storage.objects` trong migration/RPC production.
3. Finish đọc lại Storage metadata; còn object thì từ chối. Sau đó mới xóa `tu_luan_images`, `btvn_work` (draft/receipt), điểm chấm/điểm tháng, legacy attempts và lượt Phòng thi của đúng tài khoản thử. Không xóa tài khoản, bài/lesson, roster, điểm danh, lịch sử lớp, ảnh đại diện, bucket khác hoặc tài khoản khác.

Nếu lỗi giữa chừng, dữ liệu nộp còn nguyên để chạy lại cùng UUID; các ảnh đã xóa được xóa idempotent. Khi hoàn tất, tài khoản thử bị khóa vĩnh viễn cho lần QA đó, không dùng lại. Tombstone ngăn metadata ảnh mới theo URL cũ. Sau dọn, tạo tài khoản thử mới cho đợt tiếp theo.

## Kiểm chứng và giới hạn

`npm test` có test PostgreSQL thật chạy qua WASM PGlite trong RAM, schema bảng/hàm từ repo và dữ liệu tổng hợp. Fixture khai báo riêng hạ tầng auth/storage; không có DB live/roster thật. `scripts/is-test-db.mjs` ghi rõ: bỏ thao tác gộp người thật043 nhưng giữ bảng backup; bỏ068 đã bị075 thay; bỏ075 vì nguồn chỉ áp cho hash cloud và không thay schema; bỏ kiểm băm lịch sử063/066, chuẩn hóa LF và hai khác biệt tiền nhiệm050/066. Do đó đây là QA schema tái dựng từ repo, không xác nhận schema live/luật hạn075.

Ảnh thử đi qua handler upload thật + RPC099, lưu byte JPEG trong Storage emulator local rồi xóa byte và metadata. Chưa thử daemon Storage/S3 Supabase thật. Trigger trên `storage.objects` đòi quyền TRIGGER của môi trường đích: Claude phải kiểm quyền trước apply; không bỏ chốt này để chạy cho qua. Storage có thể ghi byte trước metadata khi dùng URL cũ; không coi trigger metadata là chứng minh S3 không còn object mồ côi. Cần kiểm Storage native sau triển khai có phép, kể cả URL ký trước khi dọn. Chưa có QA UI do Thành cấm UI/SendKeys/Chrome.

Trước phát hành, Claude kiểm migration trên staging Supabase có Storage thật, quyền TRIGGER, consumer ngoài web và chuỗi hàm clone từ chính nguồn hiện hành. Sau apply phải kiểm test account không vào bảng điểm/PH/L45/queue chấm, upload rồi dọn và đọc lại Storage. Không mặc định kết quả local là production đã sạch.
