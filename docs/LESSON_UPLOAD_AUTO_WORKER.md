# Bộ chạy tự động BTVN

Mã ngày 13/11/2026 do agent ChatGPT/Codex viết. Đây là hướng dẫn triển khai;
việc có tệp và test đạt chưa chứng minh worker đã được cài, bật hoặc giao bài thật.
Ngày 13/11, Claude hết hạn mức tuần; Grok thật đã ACK điều phối dự phòng theo
luật chia việc 10/11. Codex thực thi các bước đã ghim SHA và kiểm theo quyền
Thành đã duyệt. ACK kế hoạch không phải kết quả review code hoặc đã phát hành.

## Phạm vi

`tools/lesson-upload/auto-worker.py` gọi các launcher hữu hạn hiện có:

- `--role vps`: lần lượt `btvn-web-upload.py --once --auto` rồi
  `btvn-web-upload.py --review-once --auto`. Lỗi lượt dựng bài không chặn lượt
  hậu kiểm các bài trước. Launcher vẫn kiểm enabled, DB automation/cutoff,
  native guard, ngân sách, capability, version và shared worker lock.
- `--role pc`: `pc-review-once.py --once`, giữ nguyên cổng enabled và cơ chế
  claim chống gọi lại AI. Supervisor không truyền `--manual` hoặc `--enable`.
- `--once` thực hiện tối đa một chu kỳ; `--watch` chờ giữa các chu kỳ;
  `--status` chỉ đọc nhịp và OS lock, không nhập runtime native hay gọi mạng.
- `--interval` mặc định 60 giây, tối thiểu 30 giây, tính từ cuối chu kỳ trước.
  Không có hai chu kỳ chồng nhau trong cùng supervisor.

Tệp này không bật flag, không tạo service/lịch Windows/cron, không sửa Javis core,
không tự lấy hoặc chép credentials. Đường chạy tự động phải được bên phát hành
ghép vào job hiện hành, giữ một publisher và khóa native chung.

## Đóng gói trước khi kích hoạt

1. Ghim SHA code cuối, chạy test supervisor và regression launcher/worker.
2. Gói VPS cần `auto-worker.py`, launcher, `runner.mjs`, native driver và budget
   đúng phiên bản. Gói PC cần `auto-worker.py` và `pc-review-once.py`, cùng cầu
   nối/CLI đã được cấp quyền. Bổ sung các tệp này vào manifest của bước build;
   không coi bản build cũ đã chứa chúng.
3. Chép theo installer/tuyến triển khai hiện hữu, đọc lại SHA tệp đã cài.
   Không bật trong bước chép. SQL/Edge/worker phải đồng bộ trước UI.
4. Kiểm trạng thái và E2E `is_test` qua tuyến thật rồi mới kích hoạt trong phạm vi
   được duyệt. Flag enabled, tiến trình chạy và receipt đã giao bài là ba bằng
   chứng khác nhau. Không đổi web precedence trước receipt đúng cổng hiện hành.

## Tham số và nơi lưu

Các đường mặc định:

| Role | Thư mục trạng thái supervisor |
|---|---|
| VPS | `/data/state/btvn/web-upload/auto-worker` |
| PC | `<MTM_LESSON_PC_STATE>/auto-worker`, mặc định `T:/Work/MTM/Website-Native/state/lesson-upload-pc-review/auto-worker` |

Có thể chỉ định `--state-dir` và `--launcher-dir`; phải dùng cùng một thư mục
trạng thái cho mọi lần chạy cùng role trên cùng máy để khóa chống trùng có hiệu
lực. Không dùng một thư mục mới để chạy song song, né stop flag hoặc né khóa.

Trong mỗi thư mục có `<role>.lock`, `<role>.heartbeat.json`, và stop flag tùy
chọn `<role>.stop`. Lock là OS lock; file còn lại sau crash không có nghĩa khóa
còn được giữ. Instance thứ hai thoát mã 75, không ghi đè nhịp của instance đầu.

Nhịp JSON chỉ có sáu trường: `pid`, `role`, `last_seen` (UTC), `status`,
`last_error_type`, `cycles`. Không có đề, đáp án, source URL, stdout/stderr AI,
token hoặc nội dung lỗi thô. Nhịp được cập nhật nguyên tử mỗi khoảng 5 giây cả
khi child đang chạy/chờ. `cycles` là số chu kỳ đã thử, không phải số BTVN đã đăng.

`--status` đối chiếu OS lock và tuổi nhịp (60 giây); PID đơn lẻ không chứng minh
tiến trình còn chạy. Với job gọi `--once` định kỳ, trạng thái `stopped` giữa các
lượt là bình thường; đối chiếu lịch/job và thời điểm nhịp gần nhất riêng.

## Ví dụ lệnh cho bên phát hành

Đây là lệnh mẫu, không được tự coi là đã thực thi. Thay đường thư mục triển khai
bằng đường đã xác minh; không chép secret vào tham số.

VPS, đọc trạng thái hoặc một chu kỳ hữu hạn:

```sh
python3 /DUONG_DAN_DA_CAI/auto-worker.py --role vps --status
python3 /DUONG_DAN_DA_CAI/auto-worker.py --role vps --once
```

PC, dùng Python đã cài và trạng thái trên T:

```powershell
python 'T:\DUONG_DAN_DA_CAI\auto-worker.py' --role pc --status
python 'T:\DUONG_DAN_DA_CAI\auto-worker.py' --role pc --once
```

Khi job hiện hành đã được duyệt dùng vòng chạy liên tục, truyền `--watch
--interval 60` thay `--once`. Không tạo job thứ hai cùng role. Nếu launcher hoặc
collector đang disabled, supervisor chỉ ghi lỗi hữu hạn; không tự bật để vượt
cổng đó. Cần kiểm đúng DB automation/cutoff và enabled của cả hai role riêng.

## Dừng và giới hạn thời gian

- Tạo `<role>.stop` đúng thư mục trạng thái để dừng trước child tiếp theo hoặc
  ngắt child đang chạy; cũng hỗ trợ Ctrl+C/KeyboardInterrupt và SIGTERM.
- Stop flag được giữ nguyên; supervisor không tự xóa để chạy tiếp. Bên phát
  hành phải đối soát trạng thái, lưu/đổi tên flag theo quy trình rồi mới tiếp tục.
- Mỗi child VPS có trần ngoài 900 giây; launcher bên trong giữ trần 850 giây.
  Child PC có trần 1.920 giây: hai provider tối đa 660 giây mỗi bên, bốn lượt
  bridge tối đa 120 giây, thêm khoảng đệm 120 giây. Đây là trần, không phải độ
  trễ cố ý. Một hàng đợi lớn hoặc mạng chậm vẫn có thể chạm trần và cần đối soát
  claim/receipt; không tự xóa claim để gọi lại AI.
- Khi dừng, chỉ ngắt process group/tree do chính supervisor sinh ra. Unix gửi
  SIGINT, chờ tối đa 15 giây rồi SIGKILL nếu cần. Windows dùng `taskkill /T` cho
  đúng PID child, không tìm/diệt các worker khác.
- **Phụ thuộc bắt buộc của launcher VPS:** Node được tạo bằng
  `start_new_session=True`, nên launcher phải xử lý signal/KeyboardInterrupt và
  dọn group Node trong `finally`. Supervisor không quét PID toàn máy để thay
  việc này. Chưa kiểm/sửa cleanup đó thì chưa kích hoạt production.

Mã thoát supervisor: 0 = chu kỳ kết thúc hoặc stop flag; 1 = child/IO lỗi;
75 = đã có supervisor cùng role; 130 = bị ngắt bằng signal/keyboard. Mã 0 không
chứng minh có bài đã đăng: phải đọc receipt và trạng thái SQL đúng phiên bản.

## Kiểm đã thực hiện

```powershell
python -m unittest discover -s tests -p test_lesson_upload_auto_worker.py -v
```

24 ca đạt trên Windows với fake subprocess/clock và fixture trên T. Có kiểm OS
file lock thật trong fixture, timeout, stop, heartbeat, dữ liệu lỗi, output kín,
hai role và cleanup process group mô phỏng. Chưa chạy launcher, AI, cloud,
service/scheduler thật hoặc kiểm process group Unix trên VPS trong bộ test này.
