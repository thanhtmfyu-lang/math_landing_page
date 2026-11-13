# SQL110: bài kiểm tra riêng theo lớp

Migration chọn riêng `202611130110_lesson_assessment.sql`, một transaction. Chỉ
rehearsal/áp qua release owner, không chạy tự động từ tài liệu này. Phụ thuộc
100/101/102/103/107/108/109; kiểm106 riêng trong integration fixture.

## Intake và phiên bản

`create` giữ payload BTVN cũ; thiếu `work_kind` nghĩa `homework`. Giá trị lạ/null
bị từ chối. Homework không nhận assessment_id/exam_type/exam_config; stripped
work_kind=homework trước107 để giữ idempotency của request cũ.

Exam gửi `work_kind:exam`, assessment_id UUID client giữ ổn định, client_request_id
UUID, exam_type monthly/custom, đúng một class_id trong class_ids, lesson_date,
teacher_key, title, đề và đáp án riêng tư. exam_config chứa opens_at/closes_at
có múi giờ và duration_minutes nguyên1–240, đủ trong cửa sổ. Không Đề2/video/
handout/hạn BTVN; không ép12+4+6. Task_scope rỗng dùng “Toàn bộ đề”.

Defaults từ đúng ca/lớp được server xác minh: mở đầu ca, đóng cuối ca, thời lượng
min(120, độ dài cửa sổ theo phút). Ca mặc định qua ngày cộng một ngày nếu end<start;
end=start bị từ chối. Không đoán ngày cho explicit closes_at.

Assessment identity không dùng title. Hai assessment_id cùng ngày cùng tồn tại.
Sửa giữ cùng actor-owner, teacher, lớp/ngày/is_test; chỉ tăng version cùng ID.
Không sửa một assessment đã có lượt HS. Trong khi AI dựng bản thay thế, bản cũ
còn hoạt động; create/publish/student commit dùng cùng advisory lock. Publisher
kiểm lại old-family drafts/receipts trước deactivate, nên HS bắt đầu bản cũ sau
create cũng chặn publish mới, giữ oldactive/work. BTVN pairing và5job cũ không đổi.

## Worker và xuất bản

worker_claim/worker_pending_review nhận worker_protocol=110 số JSON. Thiếu chỉ
được homework; giá trị khác/string/null bị từ chối. Job exam trả exam_config
object từ cột bất biến, bên cạnh work_kind/assessment_id/exam_type. Claim giữ
cutoff enabled/activated_at, lease/current/test/retry/budget fences như108.

Exam luôn cần review độc lập. worker_wait_review giữ110s lease và credit lần chờ
đúng một lần mỗi claim; không bật teacher-pending sau20phút và không reset native
budget/ledger. Homework giữ nguyên policy cũ. Exam không có hai paper.

Newkind `kiem-tra` chỉ xuất qua capability của upload trong cùng transaction,
không dùng public exam catalog/mtm_exam_admins. SQL bind chính xác assessment ID,
exam_type, title cả material/exam, một lớp/ngày, opens/closes, duration, source và
claim/current. Kind downgrade vềbtvn bị chặn cả API và publisher. Private source
bucket/path không được có trong payload. Asset manifest phải khớp object riêng
tư đã upload. Canonical insert is_test từ upload; không đổi testflag sau insert.
Chỉ old canonical của cùng assessment_id bị supersede, không gỡ BTVN hoặc đề khác.

## Runtime metadata

worker_automation_config/worker_heartbeat giữ nguyên automation object và thêm:

```json
{
  "assessment_protocol": 110,
  "runtime_readiness": true,
  "active_leases": {"count": 0, "observed_at": "server timestamp"},
  "old_auto_eligible": 0
}
```

Readiness ở đây là schema/contract. Không chứng minh worker bundle/AI đang chạy.
old_auto_eligible đếm non-test trướccutoff thực sự đủ claimauto, gồm explicit retry
saucutoff, theo cùng current/lease/attempt/backoff/step/material predicates.
Không đổi enabled/cutoff khi chỉ đọc. Exam receipt không bật BTVN web_precedence.

## Học sinh và tra cứu

Dùng student session và class/is_test ACL hiện hữu, RPC service_role-only.
Material/cards thêm kind=kiem-tra, workKind=exam, examType, assessmentId, title,
opensAt/closesAt milliseconds, durationMinutes, maxAttempts1. Không đưa vào catalog
công khai và không áp regex hai mã của oldkind kiem-tra-thang.

SQL commit giữ một lượt/phiên bản, deadline đúng startedAt+duration (không cắt
deadline nguồn), hiệu lực min(deadline,closes). Hết giờ chỉ nhận answers đã lưu;
không khởi tạo sau đóng, không đổi attempt identity hay submitted work.
SQL asset signer chỉ nhận question refs trướcclose và trướcsubmit; solutions
chỉ sauclose và đãnộp. Private grading snapshot vẫn có key cho trusted server,
API TS phải dùng timed projection trước khi trả browser. Trướcopen SQL không trả
exam. Thẻ chưaclose không có score; signedbucket vẫn private.

staff_history thêm work_kind mặc địnhhomework; vẫn rows.homework[] tương thích.
Exam gồm newkiem-tra và oldkiem-tra-thang, score_basis=assessment_date, item thêm
exam_type/title/assessment_id/window/duration. Trướcclose score=null và
status=not_released kể cả có official grade; sauclose giữ official0/null. Giữ
permission lớp, historical enrollment/transfer, pagination, không copy roster.

Rank/hv_ca/sheetCSV/opening-material predicates đã chỉ homeworkkindbtvn.110 còn
khóa newkiem-tra khỏi legacy sync_due loop và admin set_due: chúng không được
đổi expected_due/actual_due/late/revision của bài kiểm tra. Oldmonthly giữ nguyên.

## Kiểm chứng và giới hạn

PGlite là dữ liệu tổng hợp, không live/provider: create→claim→worker/repository→
validator→publisher45phút/title chính xác;106publication không preinsert work,
student room tạo work lazy0→1 và card xem được; sync_due có attendee matched thật
trong fixture nhưng không đổi examwork; race replacement→oldstart→publish bị chặn.
Student/history test riêng kiểm role/class/test/time/asset/key/score và old2mã.

Không gán kết quả các fixture thành nativeAI E2E hoặc đã phát hành. Cần release
owner rehearsal rollback đúng source, catalog/Edge/bundle readback và canary mới
sau normal-auth upload/source-byte readback. Canary408 cũ đang HOLD; không dùng
manifest/bundle/hash cũ cho contract110. Không mở quyền, sender hoặc Javis core.
