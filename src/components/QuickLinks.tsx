import {CalendarDays,ClipboardCheck,GraduationCap,MonitorPlay,ShieldCheck,Trophy} from 'lucide-react';
import {Link} from '../migration/navigation';
import {contactAllowed} from './FloatingContact';
import './quick-links.css';

// 20/10 anh Thành: các nút chức năng phải ở đầu web, thấy ngay khi mở trang, không để ở chân trang.
export const QUICK_LINKS=[
 ['/btvn','Vào BTVN',GraduationCap],
 ['/huong-dan?cho=phu-huynh','Hướng dẫn phụ huynh',ShieldCheck],
 ['/kiem-tra-dau-vao','Kiểm tra đầu vào',ClipboardCheck],
 ['/#timetable','Lịch học',CalendarDays],
 ['/hoc-online','Học online',MonitorPlay],
 ['/thi-thu','Thi thử',Trophy],
] as const;
// Các trang còn lại (trước nằm ở khối 3 cột chân trang) đưa lên ngay dưới hàng nút.
export const QUICK_GROUPS=[
 ['Học tập',[['/khoa-hoc','Khóa học'],['/luyen-tap','Luyện tập theo chương'],['/so-tay','Sổ tay'],['/tai-lieu','Tài liệu']]],
 ['Thi và xếp hạng',[['/de-giua-ky-1','Thi giữa kỳ I'],['/phong-thi-thu','Phòng thi thử'],['/thi-thu-hsa','Thi thử HSA'],['/ky-khao-sat','Kỳ khảo sát MTM'],['/xep-hang','Bảng xếp hạng']]],
 ['Phụ huynh',[['/phu-huynh','Góc phụ huynh']]],
] as const;
export function QuickLinks({pathname,search=''}:{pathname:string;search?:string}){
 if(!contactAllowed(pathname,search))return null;
 const here=(href:string)=>href===pathname||href===pathname+search?'page' as const:undefined;
 return <nav className="mtm-quick-links" aria-label="Lối tắt học tập"><div className="mtm-quick-row">{QUICK_LINKS.map(([href,label,Icon],i)=><Link key={href} href={href} className={i===0?'is-primary':undefined} aria-current={here(href)}><Icon size={17} aria-hidden="true"/><span>{label}</span></Link>)}</div><div className="mtm-quick-more">{QUICK_GROUPS.map(([group,links])=><div key={group} className="mtm-quick-group"><b>{group}</b>{links.map(([href,label])=><Link key={href} href={href} aria-current={here(href)}>{label}</Link>)}</div>)}</div></nav>;
}
