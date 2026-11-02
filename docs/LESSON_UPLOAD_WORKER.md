# Worker cổng BTVN giáo viên

Theo thư 1625/1745 và duyệt 1905 ngày 02/11/2026. Đã có adapter native hữu hạn; cài VPS ở chế độ TẮT. Chưa xác minh upload → tài khoản thử production hoặc SLA 15 phút. Merge, migration, publish và bật worker chỉ sau 22:30 VN theo bên phát hành.

## Tuyến và quyền

`lesson_uploads → Edge publisher → worker_claim → NativeAI trích nguồn GV → draft private → queue PC Grok/agy question-only → production validator → worker_publish → BTVN hiện hữu`.

Edge dùng publish secret hiện hữu và whitelist RPC trong gateway.ts. SQL giữ lease/version/class/date/is_test fence. File nguồn private chỉ đọc sau fence. Asset chỉ ghi/đọc namespace `btvn/web-<UUID>/<sourceSHA>/`. Gateway kiểm lại từng paper bằng production validator trước commit. Service-role giữ ở Edge, không chép ra PC/VPS. Không thêm API Vercel.

Launcher `tools/lesson-upload/btvn-web-upload.py`: mỗi `--once` tối đa một upload, `--review-once` tối đa một upload hậu kiểm, cùng `/data/state/btvn/worker.lock`. Mặc định OFF, không cron/heartbeat. Chỉ kiểm mốc duyệt 02/11/2026 22:30 một lần; không đặt HOLD hằng ngày lên runtime cũ. Hết 850 giây giết cả process group; child có timeout 780 giây. Native phải qua native_guard.verify_baseline và require_lock. Không sửa core, guards hoặc policy.

## Native và ngân sách

native-adapter.ts tải byte qua gateway. native-driver.py dùng VersionWorker.extract_visual_pdf, NativeAI.ask_stage('extract'), strict_assemble và mtm_grading.seal có thật. Hỗ trợ PDF/PNG/JPEG; khóa gõ tay thành PDF private ghi nguyên tử. Phạm vi từng đề theo task_scope. Source/draft/receipt giữ trong state 0700/0600. Provider/model lấy từ receipt thật; không đổi nhãn ChatGPT thành Codex/Grok. Child không nhận publish secret/service-role.

native-budget.py là subclass reconciler hiện có: ghim registry SHA, đọc toàn bộ legacy calls/audit/structured state, giữ cap 1024/ngày và pool nguồn/buổi cap 3. UUID mới cùng byte/buổi dùng lại pool và legacy aliases. UUID + paper + byte SHA + task_scope SHA bất biến trong cùng structured ledger. Nguồn đã biết nhưng không ghép đúng nhóm/buổi thì HOLD. Không sửa registry hoặc reset ledger. QA offline bằng core/reconciler hiện có xác nhận pool đã hết vẫn từ chối UUID web mới.

## PC collector hữu hạn, auto-poll OFF

Queue riêng trong Brain: `cau-noi/lesson-upload-review/requests/<requestSHA>.json` và `results/<requestSHA>.json`. Schema 1 chỉ có questions, task_scope, sourceVersion, request_hash. Hash là SHA256 JSON UTF-8 sort_keys/separators cố định của ba trường nội dung. Không gửi khóa/lời giải GV, upload gốc, credentials hoặc dữ liệu HS.

pc-review-once.py gọi Grok CLI/agy CLI thật, plan/no-tools; agy luôn có “KHONG chay lenh shell”. Mỗi hash claim nguyên tử một lần; outcome chưa rõ không tự gọi lại. Có fallback Grok → agy, không API-key fallback. Receipt giữ provider/model thật, request/session ID, kết quả giải và SHA. VPS kiểm hash/coverage/slot rồi production validator so khóa GV. Chưa đính ảnh vào CLI: chỉ được display_complete nếu text đủ xác định; bài thiếu hình phải uncertain/giữ chờ. Không coi crop locator là ảnh đã xem.

PC dùng `python tools/lesson-upload/pc-review-once.py --status`. Trong B sau 22:30, `--once --manual` xử lý một request mà vẫn giữ cờ enabled OFF. Không hook nhip-va-drive-tam.cmd, không đổi tác vụ/lịch cũ. Auto-poll vẫn OFF và cần lệnh bật riêng. Các lệnh --enable/--disable chỉ quản lý cờ cho phép gọi hữu hạn; không tự sinh tiến trình.

## Timer 20 phút và hậu kiểm

Cả hai đề gửi request ngay cùng lượt đầu. lesson_review_requests ghim UUID/paper/hash/source và thời gian server bất biến. Trước 20 phút trả waiting_review, giữ checkpoint, không publish hoặc gọi trích xuất lại. Claim chủ động chờ chỉ credit một lần dù có hai đề; giữ failed attempts trước đó. Đây không phải bộ đếm native AI.

Sau 20 phút dùng proof trung thực `validator:true,independent:false,teacher_source:true,status:'teacher-pending'`. Bước 4 vàng “Chưa kiểm chéo — máy sẽ kiểm sau”. SQL chỉ nhận khi có capability giao dịch web, source/request/paper đúng và đủ thời gian server. Đường Sheet/publish thường vẫn đòi independent review.

`--review-once` so kết quả PC đến sau bằng production validator, chỉ cập nhật receipt kiểm và bước 4. Mismatch chuyển lỗi cho QL xem dashboard; giữ nguyên exam/key/hạn/điểm/receipt đã nộp. Không gửi QL/PH/HS trong phiên này. last_attempt_at/cooldown tránh kẹt đầu hàng.

Handout chưa có route xác thực bền vững: bước 5 vàng, BTVN vẫn giao. Không lưu URL ký ngắn hạn hoặc ghi xanh giả. materials() trả pending:true khi có handout. Video YouTube/Zoom hợp lệ giữ từ job. Materials-only chỉ gắn BTVN đã có đúng lớp/ngày/is_test, không tạo exam rỗng.

## Hai đề, một buổi và lịch sử

Hai source, hai khóa và hai bộ 6 bước riêng; một canonical lesson/work/hạn/bảng điểm/hạng/J39. Start lượt 1 chọn và khóa; luyện lại cùng đề. Khóa Đề 2 private. Lịch sử đã nộp bất biến kể cả future-only key Đề 1. Thiếu Đề 2 vẫn đăng với cảnh báo đỏ QL.

publish_variant ghim primary source, thay toàn bộ normalized material bằng canonical material sau preflight; commit đòi byte-equal. Không dùng lịch tính lại để đổi mốc cũ. Buổi thiếu hoàn toàn dùng publish_pair. Xem schema tại [BTVN_QUY_TRINH.md](BTVN_QUY_TRINH.md).

## Đóng gói và phát hành

`node scripts/build-lesson-upload-adapter.mjs` tạo bundle Node độc lập + ba Python + manifest SHA tại `.qa-temp/lesson-upload-adapter-off/`. VPS không cần esbuild/Supabase SDK. Cài riêng `Javis/scripts/btvn-web-upload-20261102-1905/`; native hiện hữu tại `Javis/scripts/btvn-native-v1`. Installer chỉ chép code/readback SHA, không bật/claim/publish.

Migration 100 là dependency đã có trên live (catalog READ ONLY ngày 02/11 xác nhận mtm_test100, is_test, scoped reader và real reports). Không áp lại 100 vì không idempotent; không áp lại 0001 đã có. Sau đúng điều kiện phát hành, kiểm catalog rồi áp các phần còn thiếu theo thứ tự `0002 → 0003 → 101 → 102 → 103` bằng workflow chuẩn và deploy Edge. Không coi có file trong Git là đã áp DB.

Kiểm status OFF, người phụ trách gọi launcher `--once --manual --is-test`, PC collector `--once --manual` và kiểm tài khoản thử thật. Cờ enabled vẫn OFF. Hậu kiểm hữu hạn dùng `--review-once --manual --is-test`. Không tạo cron từ tài liệu này. Giữ Sheet dự phòng một tuần. web_precedence=false mặc định; RPC worker_web_precedence chỉ bật sau receipt web thật non-test hoàn thành. Chưa có receipt đó thì không bật.

QA local: full schema idempotent; hai khóa khác nhau; chọn Đề 2 chấm đúng, khóa Đề 1; một lesson/work; future-only giữ lịch sử; timer 20 phút/handout pending/late mismatch giữ điểm; Edge/private namespace; PC claim/no replay; pool budget hết. Đây là dữ liệu giả, không thay nghiệm thu production hoặc SLA.
