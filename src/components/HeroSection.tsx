import { ArrowUpRight, ArrowRight } from 'lucide-react';
import { PortalLinks } from './PortalLinks';
import { ZALO_ASSISTANT_URL } from './mtm-contact';

export function HeroSection() {
  return <>
    <section id="home" className="mtm-hero mtm-hero-community" aria-labelledby="hero-heading">
      <div className="mtm-shell mtm-hero-grid">
        <div className="mtm-hero-copy">
          <p className="mtm-eyebrow">MINH THÀNH MATH · MỘT NƠI ĐỂ CÙNG NHAU LỚN LÊN</p>
          <h1 id="hero-heading">Học cùng nhau.<br /><span>Vững vàng</span> từng bước.</h1>
          <p className="mtm-lead">MTM lớn lên từ tình yêu thương của học sinh, sự tin tưởng của phụ huynh và tâm huyết của cả đội ngũ. Ở đây, chúng mình cùng học Toán, cùng hỏi, cùng sửa sai · và cùng giữ thật nhiều kỷ niệm.</p>
          <div className="mtm-subjects" aria-label="Chương trình học"><span>THCS</span><span>THPT</span><span>HSA</span><span>TSA</span></div>
          <div className="mtm-actions">
            <a className="mtm-primary" href="#register">Tìm lớp phù hợp <ArrowUpRight size={21} aria-hidden="true" /></a>
            <a className="mtm-secondary" href="#courses">Khám phá khóa học <ArrowRight size={18} aria-hidden="true" /></a>
          </div>
          <p className="mtm-contact">82 Chùa Láng, Hà Nội <span aria-hidden="true">·</span> <a href={ZALO_ASSISTANT_URL}>Zalo 0967 365 413</a></p>
        </div>
        <figure className="mtm-hero-photo mtm-community-photo">
          <a href="/mtm-class-moment-v1.jpg" target="_blank" rel="noopener noreferrer" aria-label="Xem ảnh tập thể MTM đầy đủ"><img src="/mtm-class-moment-v1.jpg" alt="Khoảnh khắc thầy trò và tập thể MTM quây quần trong lớp học" width="2048" height="1282" {...{'fetchpriority':'high'}} loading="eager" decoding="async" /></a>
          <figcaption><span>CHÚNG MÌNH LÀ MTM ✦</span><strong>Có Toán. Có bạn. Có những ngày thật vui.</strong><small>Bấm vào ảnh để xem đầy đủ.</small></figcaption>
        </figure>
      </div>
    </section>
    <section id="portals" className="mtm-portal-strip" aria-labelledby="portal-heading">
      <div className="mtm-shell mtm-portal-strip-inner">
        <div><p className="mtm-eyebrow">ĐÃ CÓ TÀI KHOẢN?</p><h2 id="portal-heading">Vào không gian của bạn</h2><p>Tài khoản do trung tâm cấp, quyền xem theo vai trò và lớp học.</p></div>
        <PortalLinks />
      </div>
    </section>
  </>;
}


