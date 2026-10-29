import {SocialLinks} from './SocialLinks';
import {ZALO_ASSISTANT_URL} from './mtm-contact';
// 20/10 anh Thành: các nút chức năng đã lên đầu trang (QuickLinks); chân trang chỉ còn 1 dòng thương hiệu + hotline.
// 29/10 anh Thành: thêm lối vào Quản trị (GV/QL đăng nhập; trang quản trị tự chặn tài khoản không có quyền).
export function Footer(){return <footer className="mtm-footer is-compact"><div className="mtm-shell mtm-footer-line"><b>Minh Thành Math</b><span>82 Chùa Láng, Hà Nội</span><a href={ZALO_ASSISTANT_URL}>Hotline/Zalo 0967 365 413</a><a href="/chinh-sach-bao-mat">Quyền riêng tư</a><a href="/quan-tri/de-thi" rel="nofollow">Quản trị</a><SocialLinks label="Kênh Minh Thành Math ở chân trang"/></div></footer>}
