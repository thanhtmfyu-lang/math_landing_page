import './home-picker.css';
import {ArrowRight} from 'lucide-react';
import {Link} from './navigation';
import {ZALO_ASSISTANT_URL} from '../components/mtm-contact';
// Trang chủ chỉ giữ phần chọn lớp gọn; lộ trình đầy đủ nằm ở /khoa-hoc.
const grades=[
 {lop:'10',tone:'s1',title:'Toán 10',text:'Học chắc theo tiến độ trường, một buổi Đại số và một buổi Hình học, tăng dần từ nền tảng đến vận dụng cao.',meta:'2 buổi/tuần · 2 giờ/buổi'},
 {lop:'11',tone:'s2',title:'Toán 11',text:'Học chắc theo tiến độ trường, một buổi Đại số và một buổi Hình học, tăng dần từ nền tảng đến vận dụng cao.',meta:'2 buổi/tuần · 2 giờ/buổi'},
 {lop:'12',tone:'s4',title:'Toán 12',text:'Học chắc Toán 12 và vá nền 10-11 đến hết tháng 2, từ tháng 3/2027 luyện 5-10 đề/tuần cho kỳ thi tốt nghiệp THPT.',meta:'3 buổi/tuần · 2 giờ/buổi'},
 {lop:'hsa',tone:'hsa',title:'HSA',text:'Phần Toán và xử lý số liệu: chuyên đề trọng tâm, đề 75 phút từ cuối tháng 1, luyện đề theo ca thi 2027.',meta:'1 buổi/tuần · 3 giờ/buổi'},
];
export function HomeGradePicker(){return <section id="courses" className="mtm-gp" aria-labelledby="mtm-gp-title"><div className="mig-container">
 <p className="mig-eyebrow">CHỌN LỚP CỦA EM</p><h2 id="mtm-gp-title">Em đang học lớp mấy?</h2>
 <p className="mtm-gp-lead">Chọn lớp để xem lộ trình cả năm và nên bắt đầu từ bước nào. Học trực tiếp tại Chùa Láng hoặc online.</p>
 <div className="mtm-gp-grid">{grades.map(g=><Link key={g.lop} href={'/khoa-hoc?lop='+g.lop} className={'mtm-gp-card is-'+g.tone}><span className="mtm-gp-title">{g.title}</span><span className="mtm-gp-text">{g.text}</span><span className="mtm-gp-meta">{g.meta}</span><span className="mtm-gp-go">Xem lộ trình <ArrowRight size={16} aria-hidden="true"/></span></Link>)}</div>
 <p className="mtm-gp-foot">Học sinh THCS (lớp 6-9): <a href="#register">để lại thông tin</a> hoặc <a href={ZALO_ASSISTANT_URL}>nhắn Zalo</a> để MTM xếp lớp phù hợp.</p>
</div></section>}
export function HomeStudentLinks(){const links:[string,string,string][]=[['/btvn','BTVN','Làm bài đã mở, xem kết quả'],['/thi-thu','Thi thử','Đề có giờ, xem lời giải sau khi nộp'],['/luyen-tap','Luyện tập','Luyện từng dạng theo chương'],['/xep-hang','Bảng xếp hạng','Xem thứ hạng của em'],['/#timetable','Lịch học','Tra ca học theo lớp'],['/tai-lieu','Thư viện','Học liệu tham khảo']];
 return <section className="mtm-sl" aria-labelledby="mtm-sl-title"><div className="mig-container"><h2 id="mtm-sl-title">Dành cho học sinh đang học tại MTM</h2><div className="mtm-sl-grid">{links.map(([h,t,d])=><Link key={h} href={h} className="mtm-sl-card"><strong>{t}</strong><span>{d}</span></Link>)}</div><p className="mtm-sl-note">Phụ huynh xem <Link href="/huong-dan">hướng dẫn vào bài của con</Link>; cổng phụ huynh riêng chưa được kết nối.</p></div></section>}
