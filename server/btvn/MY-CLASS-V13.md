# Lớp của em — chờ triển khai

API chỉ gắn phần tổng hợp vào snapshot BTVN đã đăng nhập. Không có endpoint nhận tên/mã lớp tùy ý. Mỗi thẻ được lọc lại theo đúng lớp phiên; dữ liệu đưa sang client không có danh sách học sinh hoặc tài liệu bị khóa. Lịch lấy từ provider Lich_lop của PR nguồn lịch, chỉ là giờ học, không cấp quyền xem dữ liệu.

Giao diện gom lịch tuần/buổi tới, BTVN, video/handout buổi gần nhất, đề tháng, tiến độ nộp bài của em và mốc lộ trình lớp. Mốc lộ trình giữ ngày nguồn 19/10/2026, ghi rõ là lịch sử và không coi là tiến độ mới xác minh. Nếu chưa ghép được nhóm, không tự tạo mốc tiến độ. Xếp hạng của em trong dashboard được lọc đúng lớp thay cho toàn khối.

CHỜ TRIỂN KHAI: cần merge sau PR lịch, kiểm response theo phiên thật, điều hướng chọn bài/video/handout, trạng thái khóa và giao diện điện thoại/máy tính. SSR và test mô hình chỉ kiểm cấu trúc và phân quyền dữ liệu, chưa phải kiểm giao diện hiển thị thực tế. Lượt Codex không điều khiển Chrome, không merge/deploy.
