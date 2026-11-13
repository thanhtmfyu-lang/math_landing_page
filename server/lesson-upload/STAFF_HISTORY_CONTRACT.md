# Tra cứu nhân sự — ứng viên migration109, 13/11/2026

Chưa áp production. Migration mới `202611130109_lesson_staff_history.sql` đứng sau
107/108 và phụ thuộc bộ báo cáo real100 hiện có. Không sửa 107/108 hoặc checkpoint
108; không cấp quyền quản trị đề thi cho tài khoản mới.

Gọi `mtm_lesson_upload_api` bằng phiên staff hiện hữu:

```json
{"action":"staff_history","mode":"session","from_date":"2026-11-01","to_date":"2026-11-07","class_id":"UUID tùy chọn","student_id":"UUID tùy chọn","name":"tên hoặc lớp tùy chọn","page":1,"page_size":50}
```

- `mode=session`: một dòng HS × lớp × ngày ca từ `hv_ca_rows_real100`. Mỗi dòng
  chứa mọi BTVN giao ở **ngày giao gần nhất trước ngày ca**, không gộp theo tên đề.
  `score_basis=previous_assignment_day`.
- `mode=assignment`: một dòng HS × lớp × ngày giao BTVN trong khoảng tra. Không
  đòi ngày giao trùng ngày có ca; trả mọi bài của ngày đó.
  `score_basis=assignment_date`.
- Hai mode dùng cùng filter lớp/UUID HS/tên, phân trang. Khoảng tối đa31ngày/lần,
  `to_date` không sau hôm nay tại Việt Nam; page≥1, page_size1..100. Mặc định7ngày
  gần nhất và50dòng. Tên tìm không dấu; `%` là ký tự thường, không là wildcard.

Response có `ok,mode,score_basis,score_snapshot,authorization_basis,from_date,
to_date,classes,rows,total,page,page_size,has_more,generated_at,summary`.

Mỗi class: `{class_id,class_name}`. Mỗi row:

```text
record_id, student_id, student_name, display_name,
class_id, class_name, lesson_date, start_time,
attendance_status, attendance_source, enrollment_status,
homework:[{assignment_id,title,lesson_date,due_at,score,status,submitted_at}]
```

`student_name` và `display_name` giống nhau: họ tên chuẩn đã bỏ ghi chú trong ngoặc
theo cách hiển thị hiện hữu; không phải alias công khai. Khóa là UUID, không ghép
hai HS trùng tên. `record_id` ổn định theo mode/ngày/lớp/HS.

Điểm lấy từ `btvn_official_receipts_real100`: **điểm chính thức cao nhất hiện tại**,
không phải snapshot điểm tại giờ ca cũ (`score_snapshot=current_official_best`).
`submitted_at` là giờ nộp thật của lượt được chọn. Có thể nộp sau ngày ca đang tra.
Điểm0 giữ0. Chưa có điểm giữNULL: `pending` nếu đã nộp/chưa có điểm chính thức;
`not_submitted` nếu chưa có biên nhận; `submitted` khi có điểm. Ngày/hạn/giờ trảISO;
trường thiếu trảNULL, không thay bằng0 hoặc vắng. Phiên bản cũ đã mất class_ids
vẫn giữ được điểm **của đúng HS đã có biên nhận và đúng lịch sử enrollment** qua
classNames/classDates; bài chưa từng đăng không thành bài đã giao.

Điểm danh lấy đúng bảng `mtm_hw_private.attendance`, không dùng nhãn vắng suy ra
từ projection khi thiếu dấu vân tay/Zoom. Enumstatus:
`co_mat,hoc_online,di_muon,ve_som,vang_phep,vang,chuyen_buoi,du_kien` hoặcNULL.
Enumsource: `van_tay,zoom,quan_ly,phu_huynh,hoc_sinh,chuyen_buoi` hoặcNULL.

Quyền: staff phải active và đã đổi mật khẩu bắt buộc. GV chỉ thấy lớp có phân công
teacher_key trong **timetable hiện hành**; QL/admin chỉ trong owner scope trung tâm.
Không có lịch sử phân công GV bất biến trong nguồn đã kiểm, nên không tự cấp
quyền theo giáo viên cũ (`authorization_basis=current_class_timetable`).

HS chuyển lớp/nghỉ: dùng projection ngày ca, `lop_tai`, class_transfers/memberships
và ngày nghỉ có hiệu lực; không áp class_id hiện tại ngược vào quá khứ. Lớp mới
không được thấy điểm của lớp cũ; bài dùng chung nhiều lớp cũng phải kiểm enrollment
của HS ở ngày giao, không lấy việc có một receipt làm bằng chứng thuộc mọi lớp.
Ngày chưa đủ lịch sử enrollment có thể thiếu bài hoặc ghi enrollment_statusunknown;
không dựng thêm roster lịch sử bằng suy đoán. Lịch tạm/chuyển buổi do projection
hiện hữu quyết định; không lôi điểm lớp khác của HS sang dòng lớp đang xem.
Projection hiện hữu có thể không còn ca của lớp đã tắt; không tự phục dựng roster
đó. Modeassignment vẫn giữ bài/điểm có nguồn lịch sử enrollment và biên nhận đủ.

Summary đếm số dòng/HS, dòng điểm danh có/thiếu, số bài graded/pending/not_submitted;
không suy NULL thành thiếu bài/vắng. Không trả SĐT, PIN, token, địa chỉ, ngày sinh,
đáp án, lịch sử profile, nội dung biên nhận, ghi chú nội bộ hoặc toàn bộ roster.

Lỗi xác định: `STAFF_REQUIRED`, `PASSWORD_CHANGE_REQUIRED`,
`STAFF_REPORT_SCOPE_UNAVAILABLE`, `STAFF_HISTORY_CLASS_DENIED`,
`STAFF_HISTORY_FILTER_INVALID`, `STAFF_HISTORY_RANGE`, `STAFF_HISTORY_PAGE`.
Lookup chỉ đọc, không gọi `mtm_dd_api*`, `dd_apply_transfers`, sync_due hoặc bất kỳ
nhánh chấm/đổi lớp/ghi điểm danh nào. Test chạy trong transaction READ ONLY và so
hash dữ liệu trước/sau. Không thay quyền hoặc triển khai ở phần Codex này.
