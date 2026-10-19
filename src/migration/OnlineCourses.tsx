import {ArrowRight,MessageCircle,MonitorPlay} from 'lucide-react';
import {ZALO_ASSISTANT_URL} from '../components/mtm-contact';
import {RegisterSection} from '../components/RegisterSection';
import {requestRegistration} from '../components/registration-context';
import {Link} from './navigation';
import './online.css';

// Landing /hoc-online: chữ lấy đúng mục 4 của GOI_KHOA_ONLINE_TOAN12_HSA.md. Không giá, không hứa điểm, một số liên hệ duy nhất.
const BENEFITS:[string,string][]=[['Lớp nhỏ, thầy nhìn thấy em.','Em không phải một cái tên giữa hàng nghìn người xem livestream. Em học trong lớp thật, thầy trẻ hỏi bài và gọi tên từng bạn.'],['Sai ở đâu, chữa đúng chỗ đó.','Bài làm được gom theo nhóm lỗi. Buổi bổ trợ Chủ nhật chữa riêng từng nhóm lỗi, và mỗi tuần em nhận phiếu lỗi của mình.'],['Học xong là có đề.','Web minhthanhmath.vn có đề theo chương, chấm điểm ngay, có bảng xếp hạng, lời giải mở sau khi nộp. Giai đoạn luyện đề làm 5–10 đề mỗi tuần.'],['Hỏi lúc 11 giờ đêm vẫn có trả lời.','Trợ lý Zalo trả lời 24/7. Câu khó có trợ giảng trả lời trong ngày.'],['Bố mẹ ở xa vẫn biết con học thế nào.','Sau mỗi buổi, phụ huynh nhận điểm danh và điểm bài tập qua Zalo.']];
const PACKS:{tone:string;name:string;cls:string;rhythm:string;href:string}[]=[{tone:'s4',name:'Toán 12 Online',cls:'Vào lớp 2K9 XPT',rhythm:'3 buổi mỗi tuần',href:'/khoa-hoc?lop=12'},{tone:'hsa',name:'HSA Online',cls:'Vào lớp HSA.2',rhythm:'1 buổi 3 giờ mỗi tuần',href:'/khoa-hoc?lop=hsa'},{tone:'navy',name:'Toán 12 + HSA Online',cls:'Gộp cả hai lớp trên',rhythm:'Học cả lớp 2K9 XPT và lớp HSA.2',href:'/khoa-hoc?lop=12'}];
const FAQ:[string,string][]=[['Học online có giống học tại lớp không?','Có. Em vào đúng lớp đang học ở 82 Chùa Láng, cùng giờ, cùng thầy, cùng bài tập. Thầy giảng trên bảng, camera quay bảng, em hỏi trực tiếp qua mic hoặc khung chat.'],['Em vào lúc lớp đã học được một thời gian thì có theo kịp không?','Em làm bài kiểm tra đầu vào để MTM biết em đang ở đâu. Phần lớp đã học, em xem lại video và học bù ở buổi bổ trợ online Chủ nhật.'],['Lỡ một buổi thì sao?','Mỗi buổi đều có video xem lại, gửi trong nhóm lớp trong vòng 24 giờ.'],['Mạng nhà em yếu thì có học được không?','Em nên có laptop hoặc máy tính bảng và mạng ổn định. Khi mạng chập chờn, em tắt camera để giữ tiếng và xem lại phần bị mất bằng video. Trước buổi học thử, MTM kiểm tra thiết bị cùng em 10 phút.'],['Kỳ thi HSA 2027 thi khi nào?','ĐHQGHN chưa công bố lịch chính thức. Năm 2026, kỳ thi có 6 đợt từ đầu tháng 3 đến cuối tháng 5. MTM cập nhật trên web ngay khi có lịch.'],['MTM có cam kết điểm không?','MTM không hứa điểm. MTM cam kết những việc trung tâm làm: lớp đúng lịch, có video, bài chấm ngay, lỗi được chữa, phụ huynh nhận báo cáo sau mỗi buổi.'],['Học phí thế nào? Có ưu đãi không?','Học phí đóng theo tháng. MTM báo cụ thể khi tư vấn. Đăng ký theo nhóm bạn được giảm học phí tháng đầu 10%, 15% hoặc 25% tùy số bạn. Học thử buổi đầu: không học tiếp thì không tính phí.'],['Phụ huynh theo dõi con học thế nào?','Sau mỗi buổi, phụ huynh nhận điểm danh và điểm bài tập qua Zalo, cuối tháng nhận nhận xét.'],['Sau này lên Hà Nội, em có chuyển sang học tại lớp được không?','Được, vì em đang học chính lớp đó.']];
const ONLINE_INTEREST='Học online qua Zoom (Toán 12 / HSA)';
/** Nút chính: điền sẵn lớp 12 + hình thức online rồi cuộn tới form #register ngay trên trang này (không dùng liên kết dấu # vì App chuyển nó về trang chủ). */
export function openOnlineRegistration(grade='12'){requestRegistration({grade,interest:ONLINE_INTEREST,mode:'online'});document.getElementById('register')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
function Actions(){
 return <div className="mtm-ol-actions"><div className="mtm-ol-buttons"><Link className="mtm-ol-btn is-main" href="/kiem-tra-dau-vao?khoi=12">Làm bài kiểm tra đầu vào miễn phí</Link><a className="mtm-ol-btn is-zalo" href={ZALO_ASSISTANT_URL} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true"/>Nhắn Zalo 0967 365 413</a><Link className="mtm-ol-btn is-ghost" href="/thi-thu-hsa">Thi thử HSA miễn phí</Link></div><p className="mtm-ol-note">Học thử buổi đầu: không học tiếp thì không tính phí.</p></div>;
}
export default function OnlineCourses(){
 return <div className="mtm-online">
  <section className="mtm-ol-hero" aria-labelledby="mtm-ol-title"><div className="mtm-ol-wrap">
   <p className="mtm-ol-eyebrow"><MonitorPlay size={16} aria-hidden="true"/>MTM ONLINE · HỌC CÙNG LỚP THẬT</p>
   <h1 id="mtm-ol-title">Ở xa vẫn học cùng lớp thật: <span>Toán 12 và HSA online</span> cùng MTM</h1>
   <p className="mtm-ol-sub">Vào học đúng lớp đang học ở Hà Nội, cùng giờ, cùng thầy, qua Zoom. Lộ trình theo tuần cho 2K9 đến kỳ HSA và tốt nghiệp 2027.</p>
   <p className="mtm-ol-format">Học tại 82 Chùa Láng, Đống Đa, Hà Nội <b>hoặc online qua Zoom</b>. Có video xem lại sau mỗi buổi.</p>
   <Actions/>
  </div></section>
  <section className="mtm-ol-section" aria-labelledby="mtm-ol-why"><div className="mtm-ol-wrap"><p className="mtm-ol-kicker">VÌ SAO HỌC ONLINE CÙNG MTM</p><h2 id="mtm-ol-why">Năm điều em có khi học online</h2>
   <ol className="mtm-ol-benefits">{BENEFITS.map(([t,d],i)=><li key={t}><span className="mtm-ol-num" aria-hidden="true">{i+1}</span><div><h3>{t}</h3><p>{d}</p></div></li>)}</ol></div></section>
  <section className="mtm-ol-section is-soft" aria-labelledby="mtm-ol-packs"><div className="mtm-ol-wrap"><p className="mtm-ol-kicker">GÓI HỌC ONLINE</p><h2 id="mtm-ol-packs">Chọn lớp em vào học</h2><p className="mtm-ol-lead">Học theo lịch lớp đang học ở Hà Nội. Mọi gói đều kèm web luyện đề, bổ trợ online Chủ nhật, chữa bài theo nhóm lỗi và trợ lý Zalo 24/7.</p>
   <div className="mtm-ol-packs">{PACKS.map(p=><article key={p.name} className={'mtm-ol-pack tone-'+p.tone}><h3>{p.name}</h3><p className="mtm-ol-class">{p.cls}</p><p className="mtm-ol-rhythm">{p.rhythm}</p><Link href={p.href} className="mtm-ol-more">Xem lộ trình <ArrowRight size={16} aria-hidden="true"/></Link></article>)}</div></div></section>
  <section className="mtm-ol-section" aria-labelledby="mtm-ol-faq"><div className="mtm-ol-wrap is-narrow"><p className="mtm-ol-kicker">CÂU HỎI THƯỜNG GẶP</p><h2 id="mtm-ol-faq">Hỏi trước khi học online</h2>
   <div className="mtm-ol-faq">{FAQ.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></div></section>
  <RegisterSection/>
  <p className="mtm-ol-foot">Minh Thành Math · 82 Chùa Láng, Đống Đa, Hà Nội · Hotline và Zalo <a href="tel:0967365413">0967 365 413</a></p>
 </div>;
}
