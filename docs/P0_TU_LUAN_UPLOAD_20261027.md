# Nộp ảnh tự luận trong bài thi tháng — 27/10/2026

Bản gốc: `origin/main` = `298fe316e99fe2c0ec0125e04da129739dfbe40c` (sau PR #94).
Nhánh: `codex/tu-luan-upload-20261027`. Codex làm và kiểm local; Claude/Anthropic phản biện 2 lượt thật. Không push, không merge, không áp migration thật trong lượt Codex này.

## Hành vi

- HS đã mở lượt thi tháng có câu tự luận bấm **Nộp ảnh tự luận** ngay trong phòng thi hoặc phần kết quả. Ảnh và bài trắc nghiệm có biên nhận riêng.
- Chụp camera hoặc chọn thư viện, tối đa 8 ảnh mỗi lần. Client xử lý tuần tự, thử giải mã native trước rồi tải lười `heic2any@0.0.4` nếu HEIC cần chuyển đổi. Không gửi ảnh sang dịch vụ chuyển đổi ngoài.
- Ảnh gốc tối đa 20 MiB, JPEG gửi lên tối đa 3 MiB, cạnh dài tối đa 2560 px. Canvas bỏ EXIF; có FileReader fallback cho trình duyệt thiếu `Blob.arrayBuffer`.
- Hàng đợi sống ngoài `ManagedAttempt`, nên nộp/tự nộp trắc nghiệm hoặc response `exam=null` không làm mất ảnh đang giữ. Có cảnh báo rời trang; hàng đợi chưa gửi chỉ nằm trong RAM, tải lại trang vẫn mất phần chưa có biên nhận.
- Ảnh đã nhận bất biến. Nộp lại/bổ sung không xóa ảnh cũ. Khóa trùng là HS + mã bài + SHA-256 **byte JPEG sau nén**, không phải so khớp ảnh bằng thị giác. Ảnh cắt/nén khác trên máy khác có thể thành trang mới.
- Dừng ở ảnh lỗi đầu tiên để giữ thứ tự trang khi thử lại; chống bấm hai lần ở client và ràng buộc/khóa DB cho nhiều tab.
- Hạn = `closes_at + 15 phút`, tính trên DB. Khi ACK mất, chỉ phục hồi xác nhận nếu object đã được Storage tạo **trước hạn**; object tạo sau hạn không được nhận. Sau hạn không cấp đường upload mới cho ảnh chưa lên kho.
- Số trang chỉ cấp khi xác nhận, tối đa 64 ảnh đã nhận / 128 lần đặt chỗ mỗi HS+bài; giới hạn batch client là 8.
- Hướng dẫn dự phòng giữ đúng câu: “Nếu không tải được thì gửi Zalo trung tâm 0967 365 413, ghi họ tên và mã đề.” Tính năng không gửi Zalo.

## API, quyền và lưu trữ

Không tạo hàm Vercel mới: vẫn **12 tệp route API** như base.

`POST /api/btvn` dùng lại kiểm origin/host/proxy và cookie HttpOnly `mtm_btvn_demo` hiện hành:

| action | Trường client được gửi thêm | Kết quả |
|---|---|---|
| `essay-list` | `lessonCode`, `attemptId` | Biên nhận của HS, hạn, giờ server |
| `essay-sign` | như trên + `sha256`, `bytes` | Biên nhận cũ hoặc URL upload có chữ ký |
| `essay-confirm` | như sign | Kiểm bytes/JPEG/hash rồi xác nhận trong DB |

Client tải JPEG thẳng tới Supabase Storage qua signed PUT; ảnh không đi qua request body Vercel. Server tải tối đa 3 MiB về để đối chiếu SHA trước ACK. Signed URL không được log/đưa vào báo cáo.

Migration mới chỉ tạo cấu trúc cho tính năng: `supabase/migrations-pending/202610270099_tu_luan_upload.sql`. Không thay đề, đáp án, dữ liệu hoặc policy cũ.

- Bucket **private** `mtm-tu-luan`, chỉ JPEG, giới hạn 3 MiB.
- Bảng private `mtm_hw_private.tu_luan_images`: HS, owner, mã bài, attempt, hash, đường dẫn, thứ tự trang, thời điểm upload/xác nhận.
- HS dùng phiên BTVN, không có JWT Supabase Auth. Vì vậy RLS chặn ghi trực tiếp; chỉ RPC `mtm_tu_luan_student` dành cho `service_role` mới ghi, sau `btvn_student(p_session)`, kiểm lớp/owner/mã chia/attempt/hạn. Không tin `studentId`, owner, path, page hoặc deadline từ client.
- `btvn_work` được khóa ngắn trong RPC; không giữ khóa trong lúc truyền ảnh. Dùng lại hash chia mã của `thi-thang.ts`, đã kiểm đối chiếu Unicode/NFC/JS trim.
- GV/QL dùng quyền quản trị sẵn có, chỉ đọc ảnh thuộc owner mình qua RPC và Storage policy. Link đọc 5 phút, ký theo batch 100.
- Trang GV: `/quan-tri/btvn` → **Chấm ảnh tự luận** → nhập `lessonCode` → **Tải lại ảnh tự luận**. Nhóm theo HS/lớp/mã, ảnh có số trang và giờ nhận; không tự công bố điểm.
- Không cần secret hoặc runtime flag mới. Dùng lại cấu hình Supabase/BTVN sẵn có, khóa service chỉ ở server.

## Phát hành — phần chủ phát hành phải làm

**Merge không tự áp migration.** `.github/workflows/ap-supabase.yml` chỉ có `workflow_dispatch`, áp đúng tên tệp được nhập. Workflow mặc định chặn 17:00–22:30 giờ Việt Nam; có input `gio_cao_diem` cho ngoại lệ đã được chủ phát hành xác nhận. Không thay giờ chặn toàn cục.

1. Claude kiểm commit, push/mở PR, đợi CI thật xanh theo duyệt của Thành lúc 15:56 ngày 27/10. Local xanh không thay CI.
2. Với đúng bản mã đã duyệt, chạy workflow **Áp Supabase** với migration `202610270099_tu_luan_upload.sql`; không chọn thêm Edge hoặc migration khác. Nếu đang cao điểm, chủ phát hành phải xử lý input ngoại lệ hiện hữu theo quyền của mình.
3. Kiểm biên nhận áp migration, bucket private và quyền thật. Merge/deploy theo duyệt; không báo tính năng hoạt động chỉ vì migration hoặc CI xanh.
4. Trên môi trường triển khai, kiểm một HS QA tổng hợp: upload, ACK đúng HS+mã, nộp lại không trùng, ảnh mở trên trang GV. Không dùng dữ liệu HS thật để thử. Giữ Zalo dự phòng nếu live QA chưa đạt.

## Bằng chứng local

Toàn bộ nhật ký và ảnh: `T:/Claude/SanPham/p0-web-2k10/qa-tuluan/`.

- `cases.json`: **13/13** Playwright; mỗi ca có ảnh. WebKit 320/360/375 và Chromium giả lập điện thoại Android; camera là `capture` + tệp tổng hợp, không camera vật lý.
- `sql-results.json`: **14/14**, áp chính migration lên PGlite PostgreSQL WASM; kiểm RLS/quyền, khác HS/mã, concurrent hash, hạn, ACK muộn, Unicode. Bảng nền/session resolver và metadata Storage là fixture.
- `extra-results.json`: **4/4**, giữ queue sau nộp trắc nghiệm với `exam=null`, mất Storage ACK, modal/fullscreen/phím, FileReader fallback.
- Storage là adapter bộ nhớ qua HTTPS localhost, truyền Blob thật của engine; không phải Supabase Storage thật. Browser/HTTP service dùng mã sản phẩm; trạng thái bài thi và loader trang GV có adapter tổng hợp đúng hợp đồng.
- `npm ci`, Vite build, quét build và `npm test` **175/175 tệp** đạt; có test service async được await đầy đủ. Quét diff chạy trên commit bàn giao.
- Type-check riêng phần thay đổi đạt. Type-check toàn kho còn lỗi nền ngoài phạm vi; không sửa các phần đó trong P0 này.
- `claude-review-1.md`, `claude-review-2.md` và receipt giữ phản biện thật, phạm vi và giới hạn. Claude đọc code, không chạy browser.
- Chưa kiểm iPhone/Safari cũ vật lý, mạng di động thật, migration/Storage/deployment production. Không có tuyên bố HS thật đã nộp ảnh.

Tham chiếu hợp đồng Storage: [createSignedUploadUrl](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl), [uploadToSignedUrl](https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl). HEIC: [heic2any](https://github.com/alexcorvi/heic2any).
