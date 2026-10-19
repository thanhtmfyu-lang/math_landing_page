import {PortalLinks} from './PortalLinks';
import {SocialLinks} from './SocialLinks';
import {ZALO_ASSISTANT_URL} from './mtm-contact';
export function Footer(){return <footer className="mtm-footer"><div className="mtm-shell"><div className="mtm-three"><div><h2>Minh Thành Math</h2><p>Học Toán với lời giải rõ ràng, đủ bước.</p></div><div><h3>Liên hệ</h3><p>82 Chùa Láng, Hà Nội</p><a href={ZALO_ASSISTANT_URL}>Zalo 0967 365 413</a><SocialLinks label="Kênh Minh Thành Math ở chân trang" showLabels/></div><div><h3>Thông tin</h3><a href="/#register">Đăng ký tư vấn</a><p><a href="/huong-dan">Hướng dẫn học sinh, phụ huynh</a></p><p><a href="/#data-notice">Thông tin dữ liệu đăng ký</a></p></div></div><PortalLinks footer/><p className="mtm-note">Minh Thành Math · minhthanhmath.vn</p></div></footer>}
