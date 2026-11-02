# Worker cổng giáo viên — bản mã chờ Claude duyệt và triển khai

## Bổ sung 02/11 theo thư 1745 và 1905

Luật thường trực: **BTVN luôn đủ 2 đề, HS chọn 1, khóa đề kia lượt 1**. Quy trình chi tiết: [BTVN_QUY_TRINH.md](BTVN_QUY_TRINH.md). Migration `202611020102_btvn_two_papers.sql` thêm nguồn riêng của Đề 2, sáu trạng thái riêng, khóa chọn và bảng khóa đề private. Hai đề được worker dựng/kiểm riêng rồi đăng nguyên tử dưới một buổi. Không thêm hàng lesson/work thứ hai để tránh đếm hai lần trong bảng điểm, hạng và J39. Chưa áp migration thật.

Publisher vẫn nhận một đề và lưu cảnh báo thiếu Đề 2; dashboard quản lý hiển thị cảnh báo từ publisher theo đúng lớp/ngày, kể cả nguồn Sheet. Thanh BTVN và đáp án đếm số đề trên tổng số buổi nhân 2.

`MTM_LESSON_WEB_PRECEDENCE` mặc định TẮT, lưu trong `lesson_upload_settings.web_precedence`. Service-only RPC `mtm_lesson_upload_api({p:{action:'worker_web_precedence',enabled:true}})` chỉ bật khi đã có biên nhận web thật hoàn thành; `enabled:false` tắt. Đây là cờ DB của route, không phải biến môi trường được giả định đã bật. Giữ Sheet dự phòng cho đến khi worker web thực chạy.

**Phụ thuộc chưa hoàn tất của thư 1625:** adapter native, đăng ký identity web vào ledger/reconciler hiện có, hàng review PC Grok/agy và biên nhận provider thật; xử lý đăng bằng đáp án GV sau 20 phút với trạng thái vàng và review bù; tuyến handout xác thực bền vững với trạng thái vàng; launcher riêng cùng `worker.lock`, cài VPS ở trạng thái TẮT và chạy thử `is_test`. Không được coi interface hiện tại là adapter đã nối hoặc báo đạt ≤15 phút. Worker hiện tại vẫn chặn khi chưa có review thật; không dựng biên nhận AI từ đáp án GV để giả hoàn thành ngoại lệ 20 phút. Không bật worker/preference trước khi các phụ thuộc này được kiểm trên tuyến thật.

Kiểm bổ sung local: full schema + hai source/khóa khác nhau; chọn Đề 2 chấm đúng khóa Đề 2; khóa Đề 1 sau start; chỉ một lesson/work; giữ receipt cũ và luyện lại. Đây là dữ liệu giả trong PGlite, không có tác động DB thật.

Không áp migration, không tạo cron và không chạy đăng thật trong đợt này. Chưa có bằng chứng worker đang chạy, đủ hạn mức AI hoặc up → tài khoản học sinh ≤ 15 phút. Bộ test dùng nguồn giả, không gửi AI thật và không đăng dữ liệu thật.

## Đường thực thi

`lesson_uploads → mtm_lesson_upload_api(worker_claim) → Codex đọc/dựng → Grok hoặc agy giải độc lập → createBtvnPublishHandler → worker_publish → mtm_btvn_pipeline → BTVN hiện hành`.

Đây là adapter nguồn mới cho publisher hiện có. Không thêm API Vercel, không sửa các tệp PR #148. Toàn bộ mã mới nằm dưới `server/lesson-upload/` và runner `scripts/lesson-upload-worker.mjs`.

Đã đọc nguồn hiện hành qua cầu nối Brain ngày 02/11 (chỉ đọc, không chạy): launcher `Javis/scripts/btvn-tu-dang.py`, `Javis/scripts/btvn-native-v1/btvn-native-worker.py` và các module `btvn_native/{worker,pipeline,bridge,reviewer_backends,btvn_strict_core,btvn_native_contracts,runtime}.py`. Khóa `worker.lock` và các hàm native được xác minh **trong mã nguồn**, chưa phải bằng chứng tiến trình đang chạy. Cron `r_b0771bcacf` chỉ xuất hiện trong snapshot bàn giao 20/10, chưa kiểm lại lịch thực tế. Claude/Javis phải gắn nhánh nguồn web vào chính khóa/nhịp worker hiện hữu; không bật thêm publisher hay cron thứ hai.

Nguồn vừa đọc cho thấy ba phụ thuộc cụ thể, không thể nối bằng một import giả:

1. Launcher hiện tại thoát trong khung 17:00–22:30. Nếu giữ toàn bộ đường cũ, mục tiêu ≤15 phút sau giờ dạy không thể đạt. Cần Claude/Javis thiết kế nhánh web đọc/ghi gọn và giữ nguyên giờ HOLD của việc DB nặng; nhánh này không tự bỏ HOLD launcher.
2. `btvn_strict_core.PROVIDERS` hiện chỉ có `chatgpt-oauth` và `openai`; `reviewer_backends.validate_chain` yêu cầu extractor/reviewer đều `chatgpt-oauth`. Chưa có Grok/agy ở tuyến native này. Vì thư giao bắt buộc AI thứ hai Grok/agy, không thể coi reviewer ChatGPT hiện tại là hoàn thành yêu cầu hoặc đổi nhãn thành Grok. Adapter mới phải dùng kết nối Grok/agy thật được cấp và giữ hạn mức/biên nhận; không sửa policy chung để lách.
3. `bridge.NativeAI._ask_stage` yêu cầu source/session budget binding do `native_budget_reconcile` đối soát. `execute_batch` hiện ghim source bytes và phạm vi với dòng Sheet. Nguồn web mới phải đăng ký identity từ upload UUID + SHA bytes + task_scope vào cùng ledger/reconciler trước gọi AI. Không thể chỉ thay URL rồi bỏ bước đối soát, reset budget hoặc gọi model trực tiếp vòng ngoài.

Các snapshot phục vụ kiểm được giữ local trong `.qa-temp/vps-source` (không commit); không đọc/in file credential. Mã trong nhánh không phụ thuộc PC/ổ T khi triển khai VPS.

## Những gì mã đã làm

- Claim do DB khóa nguyên tử; mỗi bước kiểm token/lease và phiên bản mới nhất. Phiên bản mới chồng cùng lớp/ngày làm bản cũ mất quyền tiếp tục.
- Bước 1 do RPC nhận bài đánh dấu. Worker cập nhật bước 2–6 lần lượt `dang/xong/loi`. Các bước AI không áp dụng khi buổi chỉ có học liệu/video ghi rõ “Không áp dụng”, không dựng đề giả.
- Bản dựng phải khớp toàn bộ slot đáp án GV và câu đã trích. Reviewer chỉ nhận phép chiếu câu hỏi, phần cần làm và SHA nguồn, không nhận đáp án GV, lời giải, bản dựng có đáp án hoặc toàn bộ upload.
- Chỉ nhận biên nhận độc lập có provider `grok` hoặc `agy`, model thật, SHA256 biên nhận và đủ slot. Cùng factory validator của publisher kiểm trắc nghiệm/Đ-S/số, chuẩn hóa số và kiểm conversion. Lệch/chưa có kiểm độc lập dừng trước mọi upload/publish. Không sửa đáp án GV để vượt gate.
- Nếu có file đáp án, extraction phải cung cấp SHA file; asset có đúng SHA đó bị chặn khỏi manifest học sinh. Adapter nguồn vẫn chịu trách nhiệm tách riêng bản đề sạch và không nhúng ảnh/lời giải đáp án vào trang đề.
- Hạn được kiểm độc lập cho **từng lớp**: ngày học riêng của lớp + 7 ngày, giờ vào ca đúng GV − 30 phút. Không lấy ngày/giờ của lớp đầu tiên cho cả cặp. DB là nguồn lịch đồng bộ, thiếu teacher/date/start không đoán từ snapshot.
- Publisher gốc kiểm định dạng đề/tệp/hash/proof. PublishPort mới chỉ gọi RPC service-role có fence, không gọi đường sheet trực tiếp. Code `web-<upload UUID không dấu gạch>` riêng cho mỗi phiên bản; transaction DB ghi biên nhận, thay thế phần cùng lớp/ngày của bản sheet/web cũ, giữ lịch sử/bài làm.
- Upload asset vào bucket private `mtm-btvn`, `upsert:false`. Khi upload dở hoặc timeout, tải đối chiếu SHA; không ghi đè tệp khác. File đáp án đầu vào không trở thành URL học sinh.
- Đầu ra từng stage lưu file JSON hash trên **đĩa bền vững riêng của worker VPS**, quyền Unix thư mục 0700/tệp 0600. Checkpoint DB chỉ giữ tên/hash tham chiếu. Sau crash dùng lại đúng trích xuất/bản dựng/review; commit DB lưu receipt trong cùng giao dịch nên crash sau publish không đăng lần hai.
- Log runner chỉ có trạng thái/mã lỗi; không in hàng DB, key, đáp án, URL có chữ ký hoặc phản hồi provider.

## Hợp đồng adapter pipeline VPS

Runner yêu cầu module ESM tại đường tuyệt đối do người triển khai cấu hình, export `createLessonUploadPipeline({db})`. Hàm trả interface `Pipeline` trong `server/lesson-upload/worker.ts`:

| Thành phần | Hợp đồng bắt buộc |
| --- | --- |
| `extractor` | `{provider:'codex',model:<model thực tế>}`. Không ghi model giả hoặc tự fallback provider. |
| `read(job)` | Tải đề/đáp án qua service-role từ bucket riêng; kiểm byte thật, task_scope, lớp/ngày và SHA nguồn. Trả `{sourceVersion,questions,teacherSlots,privateAnswerHashes}`. `questions` phải đúng phép chiếu `reviewQuestions(exam)` của bản dựng, không có đáp án/lời giải. `sourceVersion` là SHA256 nội dung nguồn+phạm vi, không phải UUID hoặc timestamp. |
| `build(job,source)` | Tái dùng Codex/gói native đã đăng BTVN thật để trả `{exam,assets}` theo `PracticeExam` và `PublishAsset`. Bản đề chỉ chứa câu trong phạm vi GV giao; không tự mở rộng sang toàn PDF. |
| `review({questions,task_scope,sourceVersion})` | Phiên Grok/agy độc lập giải từ đề trước xem đáp án. Trả `{provider,model,receipt_hash,slots:[{question_id,slot,actual,conversion_verified?}]}`. Lưu phản hồi thật riêng tư để xác minh SHA. Không chế kết quả từ `teacherSlots` hoặc từ `exam.answer`. Provider timeout/không kết nối/hết hạn mức phải throw. |
| `materials(job,idempotencyKey)` | Chỉ chuẩn bị bản học sinh sạch và liên kết học liệu private/durable đã được kiểm quyền; thao tác có cùng key phải idempotent. Trả `{handoutUrl,materialUrl}`; nếu có link phải kèm `access:'authenticated',studentSafe:true,receipt_hash:<SHA256 biên nhận kiểm quyền và bản sạch thật>`. Worker chặn URL Storage public/signed hoặc token ngắn hạn. Không cập nhật bài thật riêng ngoài transaction worker. Video giữ YouTube/Zoom record hợp lệ từ job. |

Module này là phần phụ thuộc triển khai **chưa nối được với VPS do ba điểm khác hợp đồng hiện hữu vừa xác minh ở trên**. Không có module, runner dừng trước claim. Không có endpoint AI giả, lệnh gọi model giả hoặc đường executable ngầm định. Claude/Javis cần nối bốn hàm với pipeline/provider thật dưới khóa publisher hiện hữu sau khi migration được duyệt. Native source có sẵn các điểm nối thật: `pipeline.extract_pdf`, `bridge.NativeAI.ask_stage('extract',...)`, `worker.strict_assemble`, `pipeline.compare`, `pipeline.validate`; Grok/agy và binding web vẫn cần adapter riêng, không thay bằng gọi native `run_batch` vì hàm đó tự đọc Sheet và có tác dụng đồng bộ/thông báo khác.

Học liệu PDF mới không được dùng URL Storage public hoặc URL ký ngắn hạn lưu vĩnh viễn. Cổng hiện có ký tài sản đề qua `hydratePrivateAssets`; liên kết handout/material là trường HTTPS. Adapter phải dùng tuyến xác thực bền vững đang có trên VPS hoặc triển khai ký lại đúng quyền trước khi bật attachment. Chưa có tuyến đó thì để bước 5 lỗi, không ghi xanh bằng link hết hạn. Worker kiểm HTTPS, không có credentials trong URL và không chứa answer_path; đây không thay thế kiểm quyền server của tuyến học liệu.

Buổi chỉ up học liệu/video dùng `worker_materials`: RPC chỉ cập nhật BTVN **đã có đúng lớp/ngày và cùng phạm vi test/thật**, không tạo exam rỗng. Khi chưa có bài được phát hành, job giữ chờ và chưa được claim; không chặn đường Sheet tạo BTVN đầu tiên cho buổi đó. Sau khi bài đúng buổi xuất hiện, worker mới claim để gắn học liệu. RPC vẫn chặn `MATERIAL_LESSON_NOT_PUBLISHED` nếu bài biến mất giữa claim và commit. Đây chưa phải registry buổi độc lập; luồng học liệu-only không thể báo hoàn thành cho học sinh trước khi có BTVN nền. Không đánh dấu bước 6 xong khi chưa có receipt.

Mỗi bản upload mới có đề BTVN phải kèm đáp án của chính bản đó (file hoặc nhập nhanh), không ngầm lấy đáp án phiên bản cũ. Upload chỉ đáp án bị từ chối: cần gửi lại cả đề+đáp án cùng phiên bản để kiểm toàn bộ nguồn/phạm vi. Đây không phải tuyến sửa đáp án PR #148.

Patch `worker_materials` chỉ gửi các trường được pipeline cập nhật học liệu gốc cho phép: `videoId`, `videoUrl`, `materialUrl`, `handoutUrl`, `homeworkNote`, `title`, `classOpensAt`; không gửi `titleSource`, classNames/classDates hoặc metadata publish đầy đủ. Trường `titleSource` vẫn hợp lệ ở payload publish mới.

## RPC và trạng thái bền vững

Tất cả lời gọi tới `public.mtm_lesson_upload_api({p:{action,...}})` bằng service-role server; không đưa key vào trình duyệt.

| action | Tham số / đầu ra |
| --- | --- |
| `worker_claim` | `worker_id,lease_seconds:900` → `{job:null}` hoặc `{job:{id,...,claim_token,checkpoint,lesson_code,class_ids,class_names,class_dates,start_times,due_at_by_class}}`. Các map lịch dùng UUID lớp làm key. |
| `worker_assert_current` | `upload_id,claim_token` → `{ok:true}`; token sai/hết lease/bản cũ fail closed. |
| `worker_checkpoint` | `upload_id,claim_token,step,status,detail,checkpoint` → `{ok:true}`. DB **merge** checkpoint để giữ `publish_receipts` đã commit. |
| `worker_publish` | `upload_id,claim_token,payload` (payload đã qua production validator, assets chỉ metadata private) → `{ok:true,status?,publish_receipts}`. Transaction chịu trách nhiệm quyền/teacher/lịch, supersession và idempotency; receipt từng class. |
| `worker_materials` | `upload_id,claim_token,material` → `{status:'da_dang'|'already_published',publish_receipts}` khi cập nhật đúng bài hiện hữu. |
| `worker_finish` | `upload_id,claim_token`; chỉ hoàn thành sau bước 6 và đầy đủ receipt. |
| `sheet_precedence` | `class_id,lesson_date` → `{web_wins,upload_id}`; chỉ upload **có đề BTVN** trong cùng phạm vi test/thật chiếm ưu tiên web. Job chỉ video/học liệu đang chờ không chặn Sheet. Sheet reader phải bỏ buổi web thắng; gate publisher DB bổ sung chặn đường sheet bỏ sót kiểm này. |

DB khóa tối đa 3 lần claim (lần đầu + 2 lần tiếp tục sau lease); lần thứ ba hết lease chưa xong chuyển lỗi rõ để up lại. Lỗi đối chiếu/provider cuối cùng ghi `loi`, không tự claim tiếp. Lỗi mạng/RPC hoặc kết quả commit chưa rõ giữ `dang`; tiếp tục cùng identity/biên nhận sau lease, không tạo job khác. Runner hữu hạn không tự tạo lịch hoặc retry trong vòng lặp. Mục tiêu ≤15 phút cần đo queue/provider/timeouts sau khi nối thật; nhịp 2 phút một mình không chứng minh SLA.

## Chạy sau khi Claude duyệt

Không chứa giá trị bí mật trong lệnh/shell history. Cấu hình qua môi trường server bảo vệ:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: service-role đúng dự án, chỉ server.
- `MTM_LESSON_UPLOAD_ADAPTER`: đường tuyệt đối module adapter thật.
- `MTM_LESSON_UPLOAD_STATE_DIR`: đường tuyệt đối thư mục riêng bền vững trên VPS, ngoài webroot; không dùng thư mục tạm hoặc chia sẻ công khai. Mọi lần retry phải vào cùng vùng state. Quyền Unix cần kiểm lại thực tế; Windows không có bảo đảm ACL từ mode 0600.
- `MTM_LESSON_UPLOAD_WORKER_ID`: định danh worker thật, không phải account/model.

Gọi hữu hạn bên trong khóa/nhịp publisher hiện có:

```sh
node scripts/lesson-upload-worker.mjs --once
```

Giữ đường sheet dự phòng một tuần theo quyết định Claude, không tự tắt. Không mở thêm khóa/cron riêng từ lệnh trên. Sau duyệt migration và adapter: chạy một buổi `is_test`, xem đủ 6 bước, đăng nhập học sinh thử xác minh bài/hạn/tài liệu/video và không lộ đáp án; thử reupload, worker crash và sheet trùng; đo thời gian thực rồi mới báo đã chạy.

## Kiểm đã thực hiện

`node scripts/run-tests.mjs tests/exams-lesson-upload-worker.test.mts`: nguồn giả, production validator thật; đúng hạn riêng từng lớp, xử lý qua nửa đêm, chặn review thiếu/sai provider/lệch đáp án, chặn draft khác GV, mất claim, resume từ state, crash sau commit chỉ một publish và private upload collision đối chiếu hash. Đây chưa phải test AI thật/Storage thật/VPS thật/tài khoản học sinh thật.
