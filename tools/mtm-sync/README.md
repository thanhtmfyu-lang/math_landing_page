# Đồng bộ dữ liệu MTM

Mã vận hành dùng cùng Edge `mtm-diem-danh` và migrations063 trở đi. Không tạo một kho roster khác hoặc lịch chạy mới.

- `mtm_dd.py`: helper native, đọc cấu hình runtime tại chỗ, không in khóa. `thuc_hien(command, source_msg)` dùng một lệnh nghiệp vụ có idempotency; `dong_bo_trang_thai` đọc các đích. CLI báo lỗi cả khi HTTP200 có lỗi nghiệp vụ.
- `mtm_sync_worker.py`: tận dụng lượt quét yêu cầu quản lý hiện có. Mỗi lượt áp lifecycle tới hạn bằng `sync_tick`, nhận tối đa10 delivery có lease và ghi receipt. Không gửi Zalo. Adapter chưa có hoặc chưa được kiểm giữ `blocked`, không tự nhận `verified`.

Thứ tự triển khai: kiểm transaction rollback dữ liệu giả, áp migrations đúng hash, deploy Edge trỏ API15, chép helper/worker, rồi vá duy nhất scanner hiện có với so khớp hash nguồn. Giữ lịch cũ. Đọc lại hash tệp và receipt lượt thực thi. Chỉ import module thử không chứng minh process phục vụ đã nạp mã.

Scanner gọi `run_once` tại đầu `main` và ghi `worker-latest.json` ở vùng internal của Brain Default. Prompt xử lý quản lý trỏ hợp đồng hành động có nguồn, đọc sync_status, giữ riêng phần kho đã ghi và đích còn thiếu. Không chép toàn bộ scanner có định danh nhóm/quản lý lên repo để làm bản mẫu.

Worker chỉ đánh dấu verified khi adapter trả bytes đọc lại thật và receiptRef hợp lệ. Ba lần thử mỗi chu kỳ gồm một lần đầu và hai lần thử lại. 401/403 dừng đúng đích. Sau khi nguyên nhân được khắc phục, `sync_requeue` dùng version và lý do để mở lại bounded; không reset hàng đợi hoặc tạo vòng thử vô hạn.

Kiểm Python: `python test_runtime.py` và `python test_sync_worker.py` trong thư mục này. Kiểm SQL transaction rollback và kiểm quyền public/service nằm trong `supabase/tests`. Các kiểm kho không chứng minh bot, Sheet, báo PH hoặc giao diện production đã đạt đầu cuối.
