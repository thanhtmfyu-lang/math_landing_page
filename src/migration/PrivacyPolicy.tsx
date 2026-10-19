import {ZALO_ASSISTANT_URL} from '../components/mtm-contact';
import R106PageIntro from './R106PageIntro';
import './privacy.css';

// Chính sách quyền riêng tư công khai cho biểu mẫu tư vấn trên web và biểu mẫu quảng cáo Meta.
export const PRIVACY_UPDATED='19/10/2026';
export default function PrivacyPolicy(){
 return <div className="mtm-privacy"><R106PageIntro eyebrow="MINH THÀNH MATH" title="Chính sách quyền riêng tư" description={<p>Cập nhật ngày {PRIVACY_UPDATED}. Trang này nói rõ MTM thu thông tin gì khi bạn đăng ký tư vấn, dùng vào việc gì và bạn liên hệ thế nào để sửa hoặc xóa.</p>}/>
  <article className="mtm-privacy-body">
   <section><h2>1. Đơn vị tiếp nhận thông tin</h2><p>Trung tâm Minh Thành Math (MTM), website minhthanhmath.vn, cơ sở tại Chùa Láng, Đống Đa, Hà Nội.</p></section>
   <section><h2>2. Thông tin MTM thu thập</h2><p>Khi bạn điền biểu mẫu đăng ký tư vấn trên website hoặc biểu mẫu trên Facebook, Instagram, MTM nhận các thông tin bạn tự nhập:</p><ul><li>Họ tên học sinh hoặc phụ huynh.</li><li>Số điện thoại liên hệ.</li><li>Lớp, khối đang học và nhu cầu học (khóa quan tâm, học trực tiếp hay online).</li><li>Ghi chú thêm nếu bạn muốn gửi.</li></ul><p>MTM không yêu cầu mật khẩu, giấy tờ tùy thân hay thông tin thanh toán qua các biểu mẫu này.</p></section>
   <section><h2>3. Mục đích sử dụng</h2><p>Thông tin chỉ dùng để liên hệ tư vấn lộ trình học, sắp xếp kiểm tra đầu vào, xếp lớp và gửi thông tin về lớp bạn đã hỏi. Việc gửi biểu mẫu không tự đăng ký lớp, không tạo tài khoản và không phải là đồng ý nhận quảng cáo.</p></section>
   <section><h2>4. Chia sẻ thông tin</h2><p>MTM không bán, không cho thuê và không trao đổi thông tin của bạn cho bên khác. Thông tin chỉ đi qua các dịch vụ dùng để chuyển biểu mẫu tới trung tâm: dịch vụ gửi email EmailJS (biểu mẫu trên website) và Meta (biểu mẫu trên Facebook, Instagram).</p></section>
   <section><h2>5. Lưu giữ và bảo vệ</h2><p>Chỉ người phụ trách tư vấn của MTM được xem thông tin đăng ký. MTM giữ thông tin trong thời gian cần để tư vấn và theo dõi việc đăng ký, và xóa khi bạn yêu cầu.</p></section>
   <section><h2>6. Học sinh dưới 16 tuổi</h2><p>Nếu học sinh dưới 16 tuổi, MTM đề nghị phụ huynh điền biểu mẫu hoặc đồng ý trước khi học sinh gửi thông tin.</p></section>
   <section><h2>7. Xem, sửa hoặc xóa thông tin</h2><p>Bạn có thể yêu cầu xem, sửa hoặc xóa thông tin đã gửi bất cứ lúc nào qua:</p><ul><li>Điện thoại và Zalo: <a href="tel:0967365413">0967 365 413</a> (<a href={ZALO_ASSISTANT_URL}>nhắn Zalo</a>)</li><li>Email: <a href="mailto:quanlytoanminhthanhmath@gmail.com">quanlytoanminhthanhmath@gmail.com</a></li></ul></section>
   <section><h2>8. Thay đổi chính sách</h2><p>Khi có thay đổi, MTM cập nhật trang này và ghi ngày cập nhật ở đầu trang.</p></section>
  </article></div>;
}
