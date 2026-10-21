# Đề có khóa từng nằm trong Git công khai

Nhánh V13 chỉ đề nghị thay đổi qua PR. Chưa áp SQL, chưa triển khai.

`exposed-exams.json` là danh sách cách ly để tự luyện, không phải danh sách đã thu hồi khỏi lịch sử Git. Gồm các mã từ seed 062 và các đề HSA/giữa kỳ có bản công khai. Không được xóa tên khỏi danh sách bằng cách giấu lại đáp án hoặc đổi bản build.

Đường mở đề và chấm máy chủ hiện có được giữ. API xếp hạng HSA chặn cả đọc và ghi các đề trong danh sách trước khi gọi RPC; trang làm bài ghi rõ chỉ tự luyện. Migration V13 đi kèm khóa ghi vào bảng xếp hạng tại cơ sở dữ liệu và đóng các bảng xếp hạng liên quan. Điểm/lượt làm lịch sử được giữ.

Bản bàn giao gọi là “13 đề” nhưng không kèm mã. Danh sách cách ly hiện rộng hơn; chủ repo cần đối chiếu đúng 13 mã và kho đáp án riêng trước nghiệm thu toàn bộ mục chuyển khóa. Không coi PR này là bằng chứng đã chuyển đủ 13 khóa hoặc đã sửa web thật.
