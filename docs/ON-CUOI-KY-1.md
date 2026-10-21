# Ôn cuối kỳ I Toán 10–12 — bản nháp chờ luồng khóa học kiểm

Nguồn giao việc: `20261021-1115-web-on-cuoi-ky-1.md`. Nhánh `codex/on-cuoi-ky-1-20261021` được tạo bằng worktree mới từ `origin/main` tại `f2353b7d`. Không sửa worktree/nhánh khác, không merge, không áp migration, không phát hành.

## Phần đã triển khai

- `/on-cuoi-ky-1`: ba khối 10/11/12, bốn tuần mẫu, mỗi tuần có bài ôn và phần sách nâng cao. Giữ giao diện R106, logo gốc, navy/vàng và hotline 0967 365 413. Khối sách chỉ giới thiệu và kích hoạt.
- Dùng lại `RegisterSection` và `/api/dang-ky`, kind `on-cuoi-ky-1`; lưu lead và enrollment trong cùng transaction. Không dùng EmailJS dự phòng cho đăng ký khóa ôn, vì email không chứng minh enrollment đã lưu.
- Danh tính lấy từ cookie HttpOnly BTVN và resolver `btvn_student` trên máy chủ. Không nhận studentId hay coi tên/số điện thoại do form gửi là danh tính. Enrollment không reset khi gửi lại form hoặc đổi thiết bị.
- RPC PostgreSQL đếm lượt theo học sinh và video, N mặc định 3, có thể đổi theo khối hoặc từng video. UUID yêu cầu giúp retry không tăng lượt; khóa transaction theo học sinh ngăn tranh chấp bộ đếm. UI giữ UUID theo video trong trang hiện tại, đóng/mở lại trong thời gian lượt vẫn dùng cùng grant.
- Video ở bucket private `mtm-semester`, chỉ ký URL sau khi kiểm phiên, đăng ký, khối, tuần, quyền nâng cao và hạn mức. Mỗi grant mặc định tối đa 60 phút. Retry không gia hạn grant; lỗi ký URL vẫn dùng lại cùng UUID. Tải lại hẳn trang hoặc hết thời gian grant sẽ cần lượt mới.
- Mã sách sinh bằng `crypto.randomBytes(20)` trên máy chủ quản trị, kiểm bằng SHA-256 có tiền tố. DB chỉ nhận/lưu băm. Mã đúng khối và còn hạn chỉ gắn được một học sinh; học sinh đó thử lại được. Giới hạn 10 lần kích hoạt/15 phút/tài khoản được commit kể cả mã sai.
- API khóa ôn được ghép vào `api/exam?muc=on-cuoi-ky-1`, không tăng số hàm Vercel. Timeout RPC/ký URL 8 giây.

## Cách luồng phát hành kiểm và cấu hình

1. Kiểm lại main và số migration mới nhất trước merge. Migration mới `202610210093_on_cuoi_ky_1.sql`, phụ thuộc BTVN 005 và lead 073/074. Không sửa migration đã áp. Constraint kind hiện hành ở main có `dang-ky`, `thi-thu-hsa`, `kiem-tra-dau-vao`; 093 giữ ba kind đó và thêm kind mới.
2. Backup và áp 093 trong môi trường preview riêng trước. Chưa bật `MTM_SEMESTER_ENABLED` thì API khóa ôn đóng. Đăng ký cần thêm `MTM_LEAD_ENABLED=1`, `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` trên server, không đặt bí mật vào biến `VITE_*`.
3. Nạp video đã kiểm quyền/nội dung vào bucket private, đường dẫn bắt đầu `hk1/`. Cấu hình `mtm_hk1.videos.private_path` và `enabled=true`. Cả 24 dòng seed hiện chỉ là placeholder tắt, không có media hay đáp án thật. Tên bài hiển thị hiện là mẫu; muốn thay lộ trình phải cập nhật catalogue tương ứng và kiểm lại.
4. Mốc mặc định 16/11/2026 lúc 00:00 Asia/Saigon, tuần sau cộng bảy ngày. Có thể đổi `settings.opens_at`, `max_views` và `watch_seconds` trong giới hạn constraint. `videos.max_views` không null sẽ ghi đè N của khối. Giảm N không hoàn lại hoặc xóa lượt cũ.
5. Học sinh dùng tài khoản BTVN đã được MTM cấp. Học sinh ngoài trung tâm chưa có tài khoản cần đi qua luồng cấp tài khoản hiện hành của MTM; PR này không thêm cơ chế tự xác minh danh tính mới. Giao diện ghi rõ bước liên hệ MTM, không hứa form tự tạo tài khoản.
6. Cấp mã khi có lệnh in sách, trên máy chủ quản trị: `node scripts/issue-semester-codes.mjs 12 YYYY-MM-DD 10`. Thay ngày mẫu bằng hạn dùng thật. Mỗi mã chỉ in ra một lần sau khi DB nhận băm; không ghi stdout vào repo, log CI hoặc PR. Lượt làm này cấp **0 mã thật**.
7. Trước bật thật: dùng hai connection PostgreSQL/staging và nhiều tab/thiết bị của hồ sơ QA để kiểm tranh chấp quota, đổi cùng mã sách, hết phiên, retry mất mạng, video thật phát/seek và thời hạn URL. Kiểm cả học sinh có/không có enrollment. Chỉ sau đó mới nghiệm thu và bật cờ.

Giới hạn: đây là hạn mức **cấp lượt truy cập** video. Một URL còn hạn có thể phát lại hoặc sao chép, không phải DRM và không thể ngăn quay màn hình. Chưa có video thật, mã thật, hồ sơ học sinh thật hoặc bằng chứng Supabase/Vercel live trong đợt này.

## Kiểm chứng và phản biện

Lệnh kiểm: `node scripts/run-tests.mjs`, `node scripts/test-semester-sql.mjs`, Vite build, TypeScript phạm vi mới, quét công khai và ngân sách bundle. Script SQL dùng PGlite trong RAM, `btvn_student` nguyên bản với bảng/phiên tổng hợp và token digest fixture; không là kiểm hạ tầng live hoặc concurrency đa connection.

Đã kiểm route build thật trên Microsoft Edge headless, profile mới riêng, HTTP API tổng hợp, ở 390px và 1366px: tab ba khối, tám bài mỗi khối, form lead đúng kind, kích hoạt, retry cùng request, đóng/mở lại không tăng lượt, phản hồi cũ khi đổi khối, sự kiện tư vấn không thay form, không tràn ngang. Không điều khiển Chrome hoặc chuột/bàn phím trên PC. Ảnh đã xem trực tiếp. API fixture không thay thế kiểm auth/video/Postgres thật.

Claude Anthropic thật phản biện một lượt, chỉ đọc payload. Đã sửa giữ grant khi mở lại video, tách form khỏi registration-context, dọn UI khi 401, thông báo request play không khớp, timeout. Đối chiếu đúng constraint kind 073/074, test body RPC khớp đủ chữ ký SQL, xác nhận Supabase SDK trong dependencies và build đạt. Phản hồi gốc/biên nhận và nhật ký quyết định nằm local trong `.qa-temp`, không đưa dữ liệu nội bộ lên kho công khai.

Kết quả cuối: **170/170 tệp hồi quy đạt**, 9 nhóm SQL đạt, build và TypeScript phạm vi khóa ôn đạt, quét công khai đạt. Hai viewport Edge đạt các luồng nêu trên. Không tự quy số phép kiểm thành số vòng phản biện.

Đã dựng riêng bản nguồn sạch `f2353b7d` để đối chiếu: TypeScript toàn dự án có đúng ba lỗi tại `DocumentHomework.tsx:54` (nullable Answer/iterator/value); bản PR có cùng ba lỗi, TypeScript phạm vi khóa ôn đạt. Ngân sách bundle còn một lỗi nền: CSS tải đầu 125,3 kB vượt ngưỡng 125 kB; CSS bản PR trùng nguyên byte với bản nền, không nâng ngưỡng. Những mục JS của PR đều trong ngân sách (JS tải đầu 424 kB, gzip 128,6 kB). Không ghi toàn dự án TypeScript hoặc bundle budget xanh.

Test HSA mới từ main so SQL CRLF với prompt JSON LF đã được sửa bằng chuẩn hóa xuống dòng, vẫn so nguyên văn nội dung. Test danh sách hub được bổ sung đúng route mới, không xóa ca kiểm. Không sửa đề, đáp án hoặc migration đã áp để làm xanh test.
