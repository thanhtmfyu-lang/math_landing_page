# Quy trình BTVN MTM

Quyết định thường trực của Thành ngày 02/11/2026, thư `20261102-1745-CONG-UP-BTVN-2-DE.md`, được duyệt lại trong thư `20261102-1905-DUYET-GOP.md`.

BTVN luôn đủ 2 đề, học sinh chọn 1, khóa đề kia ở lượt 1. Hai đề cùng dạng, cùng mức độ và đúng tiến độ buổi học; mỗi đề có đáp án riêng. Không lấy đáp án đề này để chấm đề kia. Không sinh đề chỉ bằng đổi tham số theo khuôn.

Giáo viên gửi Đề 1 + đáp án Đề 1, Đề 2 + đáp án Đề 2, phần cần làm chung hoặc phần riêng của Đề 2. Tài liệu/video dùng chung cho buổi. Mỗi đề đi riêng qua sáu bước nhận, đọc nguồn, dựng đề, giải độc lập/đối chiếu đúng đáp án, gắn học liệu và giao. Đề/đáp án đầu vào và khóa chấm nằm trong vùng riêng tư.

Thiếu Đề 2 vẫn được đăng Đề 1. Publisher ghi cảnh báo **Thiếu Đề 2 — HS chưa được chọn 2 đề** trong biên nhận và bảng quản lý; không được báo buổi đã đủ. Thanh BTVN/đáp án tính theo đề, mẫu số bằng số buổi đã học nhân 2. Chỉ một đề thì học sinh làm đề đó và không hiện bộ chọn.

Hai đề dùng chung một `lessonCode` gốc, một `btvn_work` của mỗi học sinh, hạn nộp, bảng điểm và hạng của buổi. Đề 2 lưu riêng trong bảng private, không thêm buổi hoặc mẫu số. Hậu tố `-de-1`/`-de-2` chỉ là lựa chọn truy cập. Trước lượt đầu có thể đổi đề; commit lượt đầu khóa lựa chọn dưới cùng khóa giao dịch của học sinh/buổi. Tải lại, tab khác hoặc request cũ không mở khóa. Luyện lại giữ số lượt hiện hành trên đề đã chọn. Các biên nhận đã nộp được giữ nguyên.

Trước bàn giao phải kiểm hai khóa khác nhau, chọn Đề 2 chấm theo khóa Đề 2, không lộ khóa trước nộp, khóa đề kia sau bắt đầu, tiến độ khi thiếu Đề 2, chỉ một buổi trong bài làm/bảng điểm và không sửa biên nhận cũ. Test local không thay cho đăng nhập học sinh thử trên bản đã triển khai.

Triển khai theo thư duyệt hiện hành. Với thư 1905 ngày 02/11, merge/migration/đăng/bảng điểm chỉ sau 22:30 giờ Việt Nam và đủ điều kiện của từng bước; gặp lỗi dừng bước đó. Không gửi PH/HS, không sửa tay CSDL, không sửa các guard bảo vệ. Hợp đồng worker và các phụ thuộc triển khai còn thiếu nằm trong [LESSON_UPLOAD_WORKER.md](LESSON_UPLOAD_WORKER.md).

## Bổ sung bài đã kiểm qua publisher hiện có

Edge `mtm-btvn-publish` có hai action hữu hạn, xác thực bằng publish secret hiện hành. Không cấp service-role cho PC/VPS và không dùng tài khoản giáo viên giả để nhập bù.

```json
{
  "action": "publish_variant",
  "lesson_key": "canonical-buoi-da-co",
  "expected_source_version": "SHA256-cua-nguon-de-1-dang-phuc-vu",
  "paper": "payload publish chuan cua De 2",
  "review_evidence": {
    "grok": {"model": "model-thuc", "receipt_hash": "SHA256-bien-nhan"},
    "agy": {"model": "model-thuc", "receipt_hash": "SHA256-bien-nhan"},
    "sympy": {"status": "PASS", "receipt_hash": "SHA256-ket-qua-kiem"}
  }
}
```

`paper` là **object**, gồm các trường của action `publish` hiện có: `action:'publish'`, `kind:'btvn'`, `lesson_key` bằng canonical, `source_version` SHA256, `material`, `exam` đúng `PracticeExam`, `assets` có byte base64 và SHA, `verification` đầy đủ từng slot theo production validator. Không nhận trực tiếp pack đề + map đáp án thô. `material.classNames`, `classDates`, `date` phải khớp chính xác bài gốc; `exam.id` của hai đề phải khác nhau. Ghim và đọc lại nguồn trước khi đăng. Đề 1, hạn, bài làm và biên nhận không bị thay. Học sinh đã có lượt trước khi bổ sung Đề 2 giữ khóa Đề 1, không bị chuyển đề hoặc chấm lại.

Buổi hoàn toàn chưa có bài dùng `{action:'publish_pair',primary:<payload publish Đề 1>,second:<payload publish Đề 2>,review_evidence:<như trên>}`. Hai payload cùng canonical và cùng lớp/ngày; validator kiểm cả hai trước khi ghi tệp. RPC commit đăng một lesson + khóa Đề 2 riêng trong cùng giao dịch. Bài đã có một đề phải dùng `publish_variant`; không thay bằng `publish_pair` để ghi đè bài cũ.

Replay cùng source/exam/assets trả `already_published` và không tải lại tệp; khác source hoặc khóa Đề 2 đã nhận thì dừng. Các action chỉ trả trạng thái, mã buổi, số đề và xác nhận giữ receipt, không trả dữ liệu học sinh. Ảnh/PDF đề và lời giải tiếp tục nằm private và chỉ ký theo quyền đọc hiện hành.
