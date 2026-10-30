# Ẩn hồ sơ trùng — bản chờ duyệt, 30/10/2026

## Nhánh và bàn giao

- Nhánh: `codex/an-ho-so-trung`, cắt từ `origin/main` = `dfe41de0de10e68d3a73deb4e96ab5b1115b7973`.
- [Compare để owner tạo PR draft](https://github.com/thanhtmfyu-lang/math_landing_page/compare/main...codex/an-ho-so-trung?expand=1).
- Chưa tạo PR: không có `gh` trong PATH của phiên; dùng phương án đẩy nhánh và bàn giao compare theo thư giao.
- Worktree riêng: `T:/Work/MTM/Website-Native/work/claude-v65/wt-an-ho-so-trung`, cùng repository với `repo` được giao. Giữ nguyên nhánh `claude/v66-chuong4` trong `repo`.
- Không merge, không áp migration/CSDL thật, không deploy Edge. `vercel.json` chặn tự triển khai đúng nhánh này.

## Cách làm

Migration: `supabase/migrations-pending/202610300201_an_ho_so_trung.sql`.

1. Bảng private `student_duplicate_links` liên kết hồ sơ trùng về hồ sơ chính. Không đổi `students.active`, điện thoại, PIN, membership; không tạo leave, xóa, chuyển hoặc gộp hàng lịch sử.
2. RPC service_role-only `mtm_student_hide_duplicate(uuid,uuid,text,text,text)` nhận hai ID, hai nhãn lớp kỳ vọng và mã nguồn. Kiểm cùng owner thuộc roster scope, cùng tên chuẩn hóa, lớp khớp nguồn, hồ sơ chính còn hoạt động. Chặn liên kết vòng/chuỗi, xung đột nguồn/đích; lặp đúng lệnh vô hại. Khóa advisory và khóa hàng theo thứ tự ID.
3. Lọc hồ sơ ẩn tại `dd_find_student` (cả gợi ý), `mtm_btvn_forgot`, `session_student`, `btvn_student_before_sync063`, `mtm_hw_resolve_code`, `mtm_hw_confirm`. Không chuyển phiên/mã cũ sang hồ sơ chính. `profile()` dùng chung vẫn nguyên vẹn để lịch sử tiếp tục đọc được.
4. Sáu hàm phải có SECURITY DEFINER và cùng chủ với helper. SHA256 toàn bộ `prosrc` phải khớp baseline đã kiểm hoặc đúng bản vá tương ứng. Sai nguồn/chủ thì rollback migration, không ghi đè hotfix lạ. Chạy lại không lồng thêm guard.
5. Không cần đổi Edge: đường đăng nhập hiện hữu gọi `forgot_pin` → `forgot`; mã học sinh gọi resolve/confirm. RPC ghi riêng dành cho owner áp sau duyệt, chưa mở action mới cho bot.

Migration chỉ cài cơ chế, không chứa tên/ID học sinh thật và không tự ẩn hàng nào. Bộ tham số cho đúng hai hồ sơ của thư được giữ riêng trên PC tại `T:/Claude/SanPham/cau-noi-javis-codex/work/an-ho-so-trung-20261030/CHO_DUYET_AP_DUNG.sql`; có `ROLLBACK` cố định, **chưa thực thi**. Không đưa tệp này lên GitHub/Notion/cầu nối.

## Kiểm chứng

- `node scripts/run-tests.mjs tests/exams-an-ho-so-trung-sql.test.mts`: **13/13 đạt**, schema/RPC thật trên PGlite, toàn bộ danh tính giả. Migration mới phải nằm trong danh sách applied, không được bỏ qua.
- Các ca gồm: find trước/sau, gợi ý, chọn lớp cũ, nhánh số không khớp, phiên/mã cũ bị từ chối, hồ sơ chính vẫn HTTP **428 / PIN_SETUP** qua repository và handler thật; chọn lớp cũ cũng tới bước PIN của hồ sơ chính.
- Snapshot nguyên hàng của 9 bảng (`students`, `memberships`, `student_leaves`, `paper_scores`, `btvn_work`, `attendance`, `student_pins`, `codes`, `sessions`) giữ nguyên sau ẩn; lịch sử không bị chuyển ID.
- Kiểm lặp migration, xung đột/chuỗi liên kết, cập nhật trường hồ sơ không mở lại dấu ẩn, quyền bảng/RPC, gọi thật bằng `SET ROLE service_role`, khác owner/SECURITY INVOKER/SHA thì dừng và rollback.
- `npm test`: **193/193 tệp đạt** ở bản SQL cuối. Sau đó bổ sung các assert lớp cũ/SECURITY INVOKER/rollback và chạy lại bộ riêng: 13/13 đạt. Log: `ALL_TESTS_FINAL.log`, `TARGETED_FINAL.log` trong thư mục bằng chứng PC trên.
- `npm run build -- --outDir .qa-build/an-ho-so-trung`: đạt. Có cảnh báo tham chiếu asset chưa phân giải và chunk lớn; không sửa UI/asset trong đầu việc này.
- Quét bản build bằng `scripts/quet-cong-khai.mjs`: đạt. Không có dữ liệu học sinh thật, thông tin liên hệ thật hay PIN thật trong phần mã mới.
- Không đổi giao diện; chưa kiểm browser/live và không coi PGlite/build là bằng chứng đã sửa hồ sơ thật.

## Phản biện thật và phối hợp

Codex sửa và chạy kiểm; Claude Code/Anthropic thật (`claude-opus-5-5` do công cụ trả về) phản biện trong hai ngữ cảnh độc lập chỉ nhận mã và fixture giả, không được cấp tool sửa tệp. Hai phản hồi đã lưu tại `CLAUDE_REVIEW.md`, `CLAUDE_REVIEW_V2.md` trong thư mục bằng chứng PC.

Vòng 1 PASS cho bản nháp, yêu cầu siết quyền, nguồn SQL và rà đường đăng nhập. Đã bổ sung guard owner/SECURITY DEFINER/SHA, test theo role, giữ `profile()` dùng chung. Vòng 2 **PASS cho bản nháp, không còn lỗi chặn từ việc đọc mã**; reviewer không chạy test và không xác nhận production. Các góp ý kiểm lớp cũ, SECURITY INVOKER và rollback đã được thêm vào bộ kiểm đạt.

Sổ Notion: https://app.notion.com/p/409453240883815caebafd0db273994f. Chỉ ghi tiến độ/bằng chứng kỹ thuật, không ghi dữ liệu hồ sơ thật.

## Việc cần duyệt trước áp thật

1. Owner xem diff/compare và tạo/duyệt PR draft. Chưa có quyền merge hay áp CSDL từ đầu việc này.
2. Dùng `supabase/tests/an_ho_so_trung_preflight.sql` để đọc metadata live: đối chiếu owner/SECURITY DEFINER/SHA và rà thêm các đường xác thực thực có trên live. Chưa chạy preflight này trên production. Khác SHA (kể cả CRLF/LF) thì dừng, đối soát phiên bản rồi kiểm lại; không tự bỏ guard.
3. Khi có lệnh áp riêng, đọc lại thư nguồn, đúng hai ID/nhãn lớp và quyền hiện hành; áp migration và gọi RPC là hai bước tách biệt. Kiểm `ok=true`, find/đăng nhập, lịch sử và HTTP 428 trên đích thật rồi mới kết luận hoàn thành nghiệp vụ.
4. Hồ sơ ẩn vẫn giữ hàng dữ liệu và có thể nhận thao tác quản trị theo ID; không tự chuyển điểm/lịch sử hay sửa luồng phụ huynh. Nếu mở rộng phạm vi này cần yêu cầu riêng.

Kết quả của đợt: mã, kiểm cục bộ, phản biện và nhánh chờ duyệt. Việc ẩn trên CSDL thật chưa được thực hiện.
