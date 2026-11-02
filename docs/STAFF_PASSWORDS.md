# Cổng nhân sự: mật khẩu V2 (PR #150, pending)

Không merge, không áp migration, không gửi mail thử đến người thật trong lượt sửa mã này.

## Tạo tài khoản và chặn lần đầu

Migration `202611020101_cong_up_btvn_gv.sql` không còn bcrypt đặt sẵn. Chỉ tài khoản mới được tạo với `crypt(encode(gen_random_bytes(32),'hex'),gen_salt('bf',12))`, tra schema thật của extension `pgcrypto`. Giá trị thô chỉ tồn tại trong biểu thức INSERT; không gán biến, in, ghi log hay trả về. Cần bật pgcrypto trước khi áp; thiếu extension thì dừng transaction. Tài khoản có `must_change_password=true`. Chạy lại không reset mật khẩu/quyền hay khóa tài khoản đã có.

`mtm_lesson_staff` chỉ trả hồ sơ tối thiểu để hiện form đổi mật khẩu. Dashboard/create RPC và Storage đọc/ghi chặn cờ chưa đổi. Không có RPC cho trình duyệt tự bỏ cờ. Trigger `auth.users` chỉ bỏ cờ khi hash mật khẩu thực sự đổi, qua Auth updateUser hoặc thao tác quản trị Auth hợp lệ. Metadata của người dùng, cập nhật email hoặc ghi lại cùng hash không bỏ cờ. Chưa có grant quản trị đề thi cho seed GV.

## Đặt lại và kênh nhận

Kho trước PR150 V2 không có luồng khôi phục nhân sự. Mã mới tái dùng **Supabase Auth recovery email và updateUser**, không tạo/sao chép mã đặt lại hay mật khẩu vào UI quản lý.

- Quản lý/admin đã đổi mật khẩu mở `/quan-tri`, nút **Đặt lại mật khẩu** theo từng nhân sự.
- POST `/api/exam?muc=staff-password` dùng bearer đã xác minh bằng `getUser`. Máy chủ xác định actor; body chỉ có action và UUID nhân sự.
- RPC service-only kiểm lại quyền/active/cờ, khóa actor + hàng nhân sự, giới hạn một yêu cầu/phút cho cả actor và target. Hồ sơ phải có `recovery_email`, `recovery_email_verified_at`; email khớp `auth.users.email` và email Auth đã xác nhận. Không nhận địa chỉ, actor hoặc redirect từ trình duyệt.
- Địa chỉ alias seed **không tự coi là email đã xác minh trong hồ sơ**. Ba trường hồ sơ trên không được seed giả. Nếu chưa có, dừng và báo rõ. Người phụ trách hồ sơ cần đối chiếu chủ hộp thư thật, ghi nhận xác minh và bảo đảm email đăng nhập Auth là đúng email đó. Nếu dùng email cá nhân khác alias, tạm đăng nhập bằng email đầy đủ (ô đăng nhập đã hỗ trợ); không tự đổi email/quyền trong PR này.
- Sau reserve hợp lệ, cờ đổi mật khẩu được bật trước yêu cầu mail. Gửi mail lỗi hoặc kết quả mơ hồ giữ tài khoản khóa, không tự thử lại; quản lý kiểm kênh trước khi gửi lại sau hạn. Ledger chỉ giữ actor/target/thời điểm, không giữ email/token/mật khẩu.
- Mail do Supabase Auth gửi trực tiếp tới địa chỉ đã tra; redirect cố định `https://minhthanhmath.vn/quan-tri/doi-mat-khau`. Client máy chủ cố định `flowType: 'implicit'` (không PKCE) để link không phụ thuộc code verifier của tiến trình server. `/quan-tri/doi-mat-khau` nhận recovery session từ fragment, xóa fragment ngay, buộc nhập/nhập lại mật khẩu mới. Phiên không thuộc nhân sự bị xóa ngay. Auth write dùng session riêng không persist, gắn tài khoản nguồn; đổi tài khoản giữa chừng không gửi mật khẩu sang tài khoản mới.
- Chỉ báo máy chủ nhận yêu cầu mail, không khẳng định hộp thư đã nhận. Quản lý không thấy link/token/mật khẩu. Không có self-service anonymous tìm nhân sự.

## Điều kiện nghiệm thu thật của bên phát hành

Giữ PR Draft. Người phát hành phải kiểm pgcrypto, schema Auth/trigger, SMTP Supabase + rate limit, cấu hình recovery email template/allowlist redirect (implicit flow), kênh nhận của từng nhân sự và tài khoản quản lý đã tồn tại để bootstrap. Không có thông tin liên hệ được phép thì để pending, không dùng Zalo trực tiếp hay gửi vào alias đoán. Thử bằng nhân sự QA được phép: quản lý gửi → chính hộp thư nhận → link một lần/hết hạn → mật khẩu mới → vào cổng, tài khoản khác/đã khóa bị chặn, không lộ đáp án/credential.

Không thêm Vercel function (vẫn dùng api/exam), không sửa vercel.json hoặc publisher. Static build có `/quan-tri`, `/quan-tri/doi-mat-khau` và `/quan-tri/len-bai`.

SQL fixture hiện dùng PGlite 0.2.17, pgcrypto WASM không nạp được (`EVP_bf_cbc`). Namespace fixture_crypto chỉ kiểm cách gọi, randomness/seed và trigger/quyền bằng digest giả, **không chứng minh bcrypt thật**. SQL production vẫn giữ pgcrypto thật; không đưa namespace fixture vào migration.

Nguồn kỹ thuật đã đối chiếu 02/11/2026: [Supabase recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [password Auth](https://supabase.com/docs/guides/auth/passwords), [PostgreSQL pgcrypto](https://www.postgresql.org/docs/current/pgcrypto.html).
