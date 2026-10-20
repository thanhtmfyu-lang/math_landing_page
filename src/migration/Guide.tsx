import {useEffect,useState,type KeyboardEvent} from 'react';
import {Link,navigate,useRoute} from './navigation';
import {ArrowUpRight} from 'lucide-react';
import './guide.css';
import './guide-quick-nav.css';
import StudyCompass from './StudyCompass';
import GuideGraphLauncher from './GuideGraphLauncher';
import R106PageIntro from './R106PageIntro';

import {ZALO_ASSISTANT_URL} from '../components/mtm-contact';
export {ZALO_ASSISTANT_URL} from '../components/mtm-contact';
type Audience='hoc-sinh'|'phu-huynh';
const readAudience=():Audience=>new URLSearchParams(location.search).get('cho')==='phu-huynh'?'phu-huynh':'hoc-sinh';

function Steps({parent}:{parent:boolean}){
 const asks=parent?['Xin nghỉ','Học online','Link Zoom','Tài liệu','Video buổi học','Học phí']:['Xin nghỉ','Học online','Link Zoom','Tài liệu','Video buổi học','Hỏi bài'];
 return <section className="mg-card mg-steps" aria-label="Ba bước dùng Zalo trợ lý lớp">
  <div className="mg-step mg-step-zalo">
   <span className="mg-num" aria-hidden="true">1</span>
   <div className="mg-step-body">
    <h2>Kết bạn Zalo trợ lý lớp</h2>
    <p>Trợ lý "Toán Thầy Thành" trực cả ngày lẫn đêm. Quét mã QR hoặc bấm nút, chọn <b>Kết bạn</b>.</p>
    <a className="mg-button" href={ZALO_ASSISTANT_URL} target="_blank" rel="noopener noreferrer">Mở Zalo Toán Thầy Thành <ArrowUpRight size={16} aria-hidden="true"/></a>
   </div>
   <img className="mg-qr" src="/zalo-toan-thay-thanh-qr.svg" width={140} height={140} alt="Mã QR kết bạn Zalo Toán Thầy Thành"/>
  </div>
  <div className="mg-step">
   <span className="mg-num" aria-hidden="true">2</span>
   <div className="mg-step-body">
    <h2>Nhắn riêng một tin</h2>
    <p className="mg-template">{parent?'Họ tên phụ huynh / Họ tên học sinh / Lớp đang học':'Họ tên / Lớp đang học'}</p>
    <p className="mg-sub">Trung tâm đối chiếu với danh sách lớp rồi nhắn lại xác nhận. {parent?'Anh/chị':'Em'} đã nhắn rồi thì không cần nhắn lại.</p>
   </div>
  </div>
  <div className="mg-step">
   <span className="mg-num" aria-hidden="true">3</span>
   <div className="mg-step-body">
    <h2>Cần gì nhắn trợ lý, bất cứ lúc nào</h2>
    <p>Sau khi được xác nhận, {parent?'anh/chị':'em'} nhắn trợ lý những việc như:</p>
    <ul className="mg-chips">{asks.map(a=><li key={a}>{a}</li>)}</ul>
   </div>
  </div>
 </section>;}

function Btvn({parent}:{parent:boolean}){return <section id="mg-homework-help" tabIndex={-1} className="mg-card mg-web mg-quick-target">
 <h2>Bài tập về nhà trên web</h2>
 <div className="mg-web-links"><Link className="mg-link" href="/btvn">Vào làm BTVN</Link></div>
 <p className="mg-sub">Đã mở cho các lớp 2K9 (8+, 9+, XPT), 2K10 (9+, 8+, Thứ 3-6, XPT), 2K11 (8+, 9+, XPT).</p>
 <p>{parent?'Con bấm':'Bấm'} <b>Không có mã</b>, nhập họ tên ({parent?'của con hoặc phụ huynh':'của em hoặc phụ huynh'}), số điện thoại đã đăng ký với trung tâm và chọn lớp.</p>
 <ul className="mg-list">
  <li>Xem hạn nộp ghi trên từng bài; nộp sau hạn đã xác minh vẫn được nhưng ghi muộn.</li>
  <li>Mỗi bài làm tối đa 5 lần, điểm tính lần cao nhất, cần đạt từ 7 điểm; nộp xong xem ngay lời giải.</li>
  <li>Bài chưa đạt thì làm lại trên web; vẫn thấy quá khó thì nên tham gia buổi bổ trợ miễn phí của lớp.</li>
  <li>Lớp HSA tạm thời vẫn làm BTVN như hiện tại.</li>
 </ul>
 <p className="mg-sub">{parent?'Anh/chị đã đổi số điện thoại':'Đã đổi số điện thoại'} hoặc không vào được thì nhắn Zalo trợ lý để trung tâm cập nhật.</p>
</section>;}

export function WebHelp({parent=false}:{parent?:boolean}={}){return <section id="mg-troubleshooting" tabIndex={-1} className="mg-card mg-web mg-quick-target">
 <h2>Gặp khó khi dùng web</h2>
 <ul className="mg-list">
  <li><b>Bài chưa mở:</b> trạng thái “🔒 Chưa mở · mở” và nút “🔒 Chưa mở, mở lúc” kèm thời gian cho biết giờ mở bài. {parent?'Anh/chị và con':'Em'} xem giờ mở và hạn nộp trên từng thẻ. Tới giờ mở, tải lại trang rồi bấm <b>Làm BTVN</b>. Nếu thời gian chỉ ghi “sau buổi học” hoặc hạn ghi “Chờ xác minh”, nhắn <a href={ZALO_ASSISTANT_URL} target="_blank" rel="noopener noreferrer">Zalo trợ lý</a> để trung tâm kiểm tra lịch lớp.</li>
  <li><b>Không đăng nhập được:</b> chọn đúng lớp, nhập số điện thoại đã đăng ký với trung tâm (có thể là số của bố hoặc mẹ). Tên gõ không dấu cũng được. Nếu đã đổi số, nhắn trợ lý để trung tâm kiểm tra.</li>
  <li><b>Trang báo “Chưa tải được nội dung” hoặc trắng trang:</b> tải lại trang, vẫn lỗi thì đóng hẳn trình duyệt rồi mở lại. Nếu mở link trong Zalo, bấm dấu ba chấm và mở bằng Chrome hoặc Safari.</li>
  <li><b>Vẫn lỗi:</b> nhắn <a href={ZALO_ASSISTANT_URL} target="_blank" rel="noopener noreferrer">Zalo trợ lý</a> kèm ảnh chụp toàn màn hình báo lỗi, điện thoại hay máy tính đang dùng, mở từ Zalo hay trình duyệt, lớp và buổi học muốn làm. Che tên, số điện thoại, mã học sinh và thông tin riêng trong thanh địa chỉ trước khi gửi ảnh.</li>
 </ul>
</section>;}

function Web({parent}:{parent:boolean}){return <section className="mg-card mg-web">
 <h2>{parent?'Con luyện đề trên web':'Luyện đề trên web'}</h2>
 <div className="mg-web-links"><Link className="mg-link" href="/luyen-tap">Luyện tập</Link><Link className="mg-link" href="/thi-thu">Thi thử</Link></div>
 <p>{parent?'Con luyện đề theo từng chương và làm đề thi thử. Nộp bài xong xem ngay điểm và lời giải chi tiết, không cần tạo tài khoản.':<>Chọn chương đang học hoặc đề thi thử, bấm <b>Bắt đầu làm bài</b>, làm xong bấm <b>Nộp bài</b> là xem ngay điểm và lời giải chi tiết. Không cần tạo tài khoản.</>}</p>
</section>;}

function More({parent}:{parent:boolean}){return <details className="mg-card mg-more">
 <summary>Xem thêm</summary>
 {parent?<ul>
  <li><b>Giờ phản hồi</b> việc cần thầy, kế toán: trong ngày; tin sau 22h trả lời trước 9h sáng hôm sau.</li>
  <li><b>Sau mỗi buổi</b>, nhóm phụ huynh nhận link tài liệu, BTVN, video và ảnh bảng điểm, điểm danh.</li>
  <li><b>Học phí</b>: kế toán gửi riêng ngày 1, hạn mùng 5. Bill chuyển khoản gửi riêng Zalo trung tâm, không gửi vào nhóm.</li>
  <li><b>An toàn</b>: trợ lý chỉ trao đổi thông tin của chính con mình. Trung tâm không bao giờ xin mật khẩu, mã OTP.</li>
  <li><b>Kết quả luyện đề</b> lưu trên máy con đang dùng; xem lại ở trang Luyện tập, Thi thử trên chính máy đó.</li>
  <li>Phụ huynh mới tìm lớp: nhắn Zalo trợ lý hoặc điền mục <Link href="/#register">Tư vấn</Link>.</li>
 </ul>:<ul>
  <li><b>Hỏi bài</b>: gửi đề, nói muốn giải chi tiết hay hướng dẫn từng bước. Trợ lý không gửi đáp án BTVN.</li>
  <li>Tài liệu, link chỉ gửi sau khi trung tâm xác nhận đúng lớp. Lớp THCS không có Zoom, video.</li>
  <li><b>Kết quả luyện đề</b> lưu trên máy đang dùng: nên luyện trên một máy cố định.</li>
  <li><b>Cách chấm</b> đề 22 câu: trắc nghiệm 3 điểm, đúng/sai 4 điểm, trả lời ngắn 3 điểm.</li>
  <li>Lỗi khi làm bài: thử bằng laptop, vẫn lỗi thì nhắn trợ lý.</li>
 </ul>}
</details>;}

export default function Guide(){const [who,setWho]=useState<Audience>(readAudience);
 const {search}=useRoute();
 useEffect(()=>{setWho(readAudience());},[search]);
 const pick=(next:Audience)=>{setWho(next);const url=new URL(location.href);url.searchParams.set('cho',next);navigate(url.pathname+url.search,{replace:true});};
 const tabKey=(event:KeyboardEvent<HTMLButtonElement>)=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const next=event.key==='Home'?'hoc-sinh':event.key==='End'?'phu-huynh':who==='hoc-sinh'?'phu-huynh':'hoc-sinh';
  pick(next);document.getElementById(next==='hoc-sinh'?'mg-tab-hs':'mg-tab-ph')?.focus();
 };
 const parent=who==='phu-huynh';
 return <div className="mtm-guide"><div className="mg-shell">
  <R106PageIntro className="mg-head" eyebrow="Minh Thành Math" title="Hướng dẫn nhanh" description={<p className="mg-lead">{parent?'Ba kênh giúp anh/chị theo dõi việc học của con thuận tiện hơn: Zalo trợ lý lớp, bài tập về nhà trên web và web luyện đề có lời giải.':'Ba kênh học cùng MTM: Zalo trợ lý lớp để hỏi lịch, xin nghỉ, lấy tài liệu, hỏi bài; bài tập về nhà trên web; web luyện đề có lời giải.'}</p>}/>
  <div className="mg-tabs" role="tablist" aria-label="Hướng dẫn dành cho">
   <button type="button" role="tab" id="mg-tab-hs" tabIndex={parent?-1:0} aria-selected={!parent} aria-controls="mg-panel" onKeyDown={tabKey} onClick={()=>pick('hoc-sinh')}>Học sinh</button>
   <button type="button" role="tab" id="mg-tab-ph" tabIndex={parent?0:-1} aria-selected={parent} aria-controls="mg-panel" onKeyDown={tabKey} onClick={()=>pick('phu-huynh')}>Phụ huynh</button>
  </div>
  <nav className="mg-quick-nav" aria-label="Đi nhanh trong hướng dẫn">
   {parent&&<a href="/phu-huynh">Vào Góc phụ huynh: điểm danh, BTVN, điểm của con →</a>}
   <a href="#mg-homework-help" onClick={()=>document.getElementById('mg-homework-help')?.focus()}>Cách vào BTVN ↓</a>
   <a href="#mg-troubleshooting" onClick={()=>document.getElementById('mg-troubleshooting')?.focus()}>Đang gặp lỗi? Xem cách xử lý ↓</a>
  </nav>
  <div id="mg-panel" role="tabpanel" tabIndex={0} aria-labelledby={parent?'mg-tab-ph':'mg-tab-hs'}><Steps parent={parent}/><Btvn parent={parent}/><Web parent={parent}/>{!parent&&<StudyCompass/>}{!parent&&<GuideGraphLauncher/>}<WebHelp parent={parent}/><More parent={parent}/></div>
  <p className="mg-slogan">Minh Thành Math - Thinking gets sharp!</p>
 </div></div>;}
