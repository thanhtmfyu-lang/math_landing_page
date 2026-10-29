import {ClipboardCheck,GraduationCap,Trophy,Users} from 'lucide-react';
import {Link} from '../migration/navigation';
import {contactAllowed} from './FloatingContact';
import './quick-links.css';

// 20/10 anh Thành: ít cửa thôi. Đầu trang chỉ 4 nút lớn; mỗi nút là một mối gom mọi trang cùng loại.
export const QUICK_LINKS=[
 ['/btvn','Vào BTVN',GraduationCap],
 ['/thi-thu','Thi',Trophy],
 ['/phu-huynh','Phụ huynh',Users],
 ['/kiem-tra-dau-vao','Kiểm tra đầu vào',ClipboardCheck],
] as const;
// Mối "Thi": mọi kỳ thi, đề thi thử và bảng xếp hạng.
export const THI_TABS=[['/thi-thu','Tất cả đề'],['/on-cuoi-ky-1','Ôn cuối kỳ I'],['/de-giua-ky-1','Giữa kỳ I'],['/phong-thi-thu','Phòng thi thử THPT'],['/thi-thu-hsa','Thi thử HSA'],['/ky-khao-sat','Kỳ khảo sát MTM'],['/xep-hang','Bảng xếp hạng']] as const;
// Mối "Phụ huynh": xem kết quả của con, hướng dẫn, lịch học.
export const PHU_HUYNH_TABS=[['/phu-huynh','Xem kết quả của con'],['/huong-dan?cho=phu-huynh','Hướng dẫn phụ huynh'],['/#timetable','Lịch học']] as const;
const SAP_MO=['Giữa kỳ II','Cuối kỳ II'];
export function hubOf(pathname:string,search=''):'thi'|'phu-huynh'|null{
 if(THI_TABS.some(([h])=>h===pathname))return 'thi';
 if(pathname==='/phu-huynh'||(pathname==='/huong-dan'&&new URLSearchParams(search).get('cho')==='phu-huynh'))return 'phu-huynh';
 return null;
}
export function QuickLinks({pathname,search=''}:{pathname:string;search?:string}){
 const hub=hubOf(pathname,search);
 if(!hub&&!contactAllowed(pathname,search))return null;
 const here=(href:string)=>href===pathname||href===pathname+search?'page' as const:undefined;
 if(hub)return <nav className="mtm-quick-links is-hub" aria-label={hub==='thi'?'Các kỳ thi':'Dành cho phụ huynh'}><div className="mtm-hub-tabs"><b>{hub==='thi'?'Thi':'Phụ huynh'}</b>{(hub==='thi'?THI_TABS:PHU_HUYNH_TABS).map(([href,label])=><Link key={href} href={href} aria-current={here(href)}>{label}</Link>)}{hub==='thi'&&SAP_MO.map(t=><span key={t} className="is-soon" title="Sẽ mở khi đến kỳ">{t} · sắp mở</span>)}</div></nav>;
 return <nav className="mtm-quick-links" aria-label="Lối tắt"><div className="mtm-quick-row">{QUICK_LINKS.map(([href,label,Icon],i)=><Link key={href} href={href} className={i===0?'is-primary':undefined}><Icon size={17} aria-hidden="true"/><span>{label}</span></Link>)}</div></nav>;
}
