# NM8: trạng thái và tài khoản học sinh mới

Thư nguồn: `20261021-0028-NM8-hs-moi.md`. Base triển khai: main `0bde972b`.

Bốn nhãn nội bộ: `HOC_THU`, `DA_HOC_THU`, `CHINH_THUC`, `KHONG_HOC`. Quản trị sửa tại `/quan-tri/btvn`, có xác nhận, kiểm đúng owner và phiên bản để tránh ghi đè thay đổi từ phiên khác. Hồ sơ cũ chưa có bằng chứng giữ “Chưa phân loại”; hồ sơ INSERT mới mặc định “Học thử”. Nhãn không tự đổi `active`, lịch học, thành viên lớp, mã hoặc PIN. Chưa có quy tắc tự chuyển trạng thái từ điểm danh/chốt học được duyệt trong nguồn NM8 này.

## Nguồn đang thiếu

Đọc bản hiện có của `hoc-sinh-moi/QUY_TRINH_HS_MOI_TU_DONG.md` trên Drive ngày 21/10: bản sửa cuối 20/10, chưa có mục 0 bản 2. Thư mục tại thời điểm đọc chỉ có tệp quy trình, không có bộ hồ sơ riêng để cấp tài khoản. Không đưa danh tính hay dữ liệu liên hệ vào PR.

Chưa tìm thấy màn hình hay action “HS mới tự tạo hồ sơ” trong main. Hiện có `student_upsert` ở Edge Function `mtm-diem-danh`, RPC `mtm_dd_api15`, và đường tự thêm từ sổ điểm danh khi thông tin khớp. Cả hai cần nguồn đã xác nhận. Biểu mẫu kiểm tra đầu vào/đăng ký là nguồn lead, chưa phải tài khoản BTVN. Không dựng cổng tự ghi danh công khai hoặc cho phép khách tự nhận hồ sơ cũ từ tên và số liên hệ.

## Kế hoạch trước 07:30 ngày 24/10/2026

1. Claude/owner đối soát bộ hồ sơ học thử: họ tên, nhãn lớp web chính xác, trường/lớp trường, liên hệ đã xác nhận, ca học thử và khóa nguồn không đổi. Đọc và xử lý dữ liệu riêng trong kênh nội bộ, không log SĐT/PIN/token.
2. Có thể tạo hồ sơ bằng `student_upsert` hiện có qua kênh bot đã xác thực, không cần đợi PR này. Dùng `sourceMsg` ổn định và `sync_execute`/`sync_status` để chống tạo trùng; kiểm kết quả đúng lớp và đúng hồ sơ. Đây là phương án hiện có cần owner vận hành, không phải bằng chứng đã tạo tài khoản.
3. Nếu dùng nhánh tự thêm từ sổ điểm danh, phải có bản ghi tên và liên hệ khớp trong roster trước; không nhận một lead chưa xác nhận làm danh tính đăng nhập. Đường này chưa được kiểm live trong NM8.
4. Học sinh vào `/btvn` bằng thông tin đã đăng ký, tự đặt PIN theo luồng hiện có. Người thực hiện không đặt hộ, ghi log hoặc gửi PIN. Kiểm mở đúng hồ sơ và đúng lớp trước hạn; số hồ sơ/mã đã cấp phải có biên nhận riêng.
5. Để có nhãn NM8: Claude duyệt migration `092` trong `migrations-pending`, đối soát dependency hiện hành và áp trong cửa sổ phát hành được phép, rồi merge/deploy theo quyền riêng. Codex không áp migration, merge hoặc phát hành. Sau áp, các hồ sơ đã tạo trước đó cần quản trị phân loại theo nguồn, không tự suy “Chính thức”.

Tại bàn giao PR: chưa cấp tài khoản thật, chưa kiểm đăng nhập live, chưa áp migration. Cần nguồn mục 0 bản 2 hoặc đường dẫn luồng tự tạo để hoàn thiện đúng nhánh được giao. Không tạo lịch hay sender từ kế hoạch này.

## Thứ tự triển khai và khôi phục

Ưu tiên áp migration 092 trước frontend. RPC nhãn chưa có hoặc bị lỗi sẽ chỉ khóa ô nhãn và hiện nút tải lại, vẫn giữ chức năng quản trị cũ. Danh sách quản trị hiện lấy tối đa 100 hồ sơ mỗi trang; RPC trạng thái và RPC ảnh đều theo giới hạn này. Không mở rộng phân trang trong NM8.

Các đường tạo đã kiểm trong main: `mtm_hw_admin_student`, `student_upsert` migration 049 và `btvn_auto_add_from_attendance` migration 016 đều INSERT với danh sách cột, không truyền cột mới, do đó nhận mặc định HOC_THU sau migration. Nhánh ghi rõ NULL vẫn giữ NULL; không coi default là cưỡng chế mọi INSERT.

Nếu phải rollback: gỡ frontend NM8 trước, sao lưu nội bộ lịch sử nhãn theo chính sách vận hành, sau đó owner mới chạy tệp `supabase/migrations-pending/rollback/202610210092_nm8_enrollment_status.sql`. Không đưa tệp rollback vào chuỗi apply thuận. Bản sửa này không thực thi bước nào trên kho thật.

Lịch sử nhãn dùng ON DELETE CASCADE có chủ đích để không chặn đường xóa hồ sơ đã được duyệt; không có chức năng xóa mới trong NM8. Chưa đếm học sinh thật trong lượt này. Giới hạn danh sách 100 là tồn tại sẵn; nếu đủ 100 mục cần đối soát kho nội bộ để tránh bỏ sót hồ sơ thứ 101, không coi danh sách trang là toàn bộ trung tâm.
