import {CalendarDays,ClipboardCheck,GraduationCap,MonitorPlay,ShieldCheck,Trophy} from 'lucide-react';
import {Link} from '../migration/navigation';
import {contactAllowed} from './FloatingContact';
import './quick-links.css';

// 20/10 anh Thành: các nút chức năng phải ở đầu web, thấy ngay khi mở trang, không chỉ ở chân trang.
export const QUICK_LINKS=[
 ['/btvn','Vào BTVN',GraduationCap],
 ['/huong-dan?cho=phu-huynh','Hướng dẫn phụ huynh',ShieldCheck],
 ['/kiem-tra-dau-vao','Kiểm tra đầu vào',ClipboardCheck],
 ['/#timetable','Lịch học',CalendarDays],
 ['/hoc-online','Học online',MonitorPlay],
 ['/thi-thu','Thi thử',Trophy],
] as const;
export function QuickLinks({pathname,search=''}:{pathname:string;search?:string}){
 if(!contactAllowed(pathname,search))return null;
 return <nav className="mtm-quick-links" aria-label="Lối tắt học tập"><div className="mtm-quick-row">{QUICK_LINKS.map(([href,label,Icon],i)=><Link key={href} href={href} className={i===0?'is-primary':undefined}><Icon size={17} aria-hidden="true"/><span>{label}</span></Link>)}</div></nav>;
}
