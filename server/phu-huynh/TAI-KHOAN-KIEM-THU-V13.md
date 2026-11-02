# Tài khoản phụ huynh kiểm thử — chờ triển khai

Lượt V13 chỉ chuẩn bị PR. Không tạo hoặc xóa tài khoản, không áp SQL.

Hai biến cần Thành điền ở GitHub Actions secrets: `MTM_PH_KIEM_SDT`, `MTM_PH_KIEM_PIN`. Chỉ ghi tên biến vào danh sách việc 07:45, không ghi giá trị. Không dùng Actions outputs, artifacts hoặc log để chuyển PIN.

Tệp đặc tả `ra-soat-web/TAI_KHOAN_PH_KIEM_THU.md` được nhắc trong bàn giao chưa tìm thấy trong thư mục Drive đã cung cấp. Chủ repo cần đối chiếu SQL bước 1 và đúng học sinh thử trước khi áp; PR này chỉ đóng đường lộ kết quả SQL và lỗi qua workflow công khai, chưa xác nhận đã tạo tài khoản kiểm thử.

Workflow chỉ in đạt/lỗi và HTTP status. Không giải mã hay lưu response SQL, kể cả trường hợp SQL trả PIN hoặc lỗi trả lại tham số. Edge lỗi cũng không in log nhà cung cấp. Giữ nguyên tài khoản xem thử hiện có.
