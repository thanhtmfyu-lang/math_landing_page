import {ArrowUpRight} from 'lucide-react';
import {ZALO_ASSISTANT_URL} from './mtm-contact';
import {SocialLinks,ZaloIcon} from './SocialLinks';
import './home-consultation.css';

export {ZaloIcon} from './SocialLinks';

export function HomeConsultation(){
 return <aside className="mtm-home-consultation" aria-label="Kênh của Minh Thành Math"><h2>Kênh của Minh Thành Math</h2><a className="mtm-zalo-consultation" href={ZALO_ASSISTANT_URL} target="_blank" rel="noopener noreferrer" aria-label="Tư vấn lớp học qua Zalo Toán Thầy Thành, mở tab mới"><ZaloIcon/><span>Tư vấn lớp học qua Zalo</span><ArrowUpRight size={19} aria-hidden="true"/></a><SocialLinks includeZalo={false} showLabels label="Theo dõi Minh Thành Math"/></aside>;
}
