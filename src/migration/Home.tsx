import './r106-shell.css';
import RankArena from '../native/homework/RankArena';
import {useEffect} from 'react';
import {MtmLifeTabs} from '../components/MtmLifeTabs';import {MtmTimetable} from '../components/MtmTimetable';import {MtmNewsSection} from '../components/MtmNewsSection';
import {CoursesSection} from '../components/CoursesSection';import {FAQSection} from '../components/FAQSection';import {BenefitsSection} from '../components/BenefitsSection';import {TeachersSection} from '../components/TeachersSection';
import {PromotionsSection} from '../components/PromotionsSection';import {RegisterSection} from '../components/RegisterSection';import {requestRegistration} from '../components/registration-context';
import {SourceGallery} from './Experience';import {Catalogue} from './Courses';import {Link} from './navigation';
import R106Hero from './R106Hero';
import {HomeConsultation} from '../components/HomeConsultation';
export default function Home(){useEffect(()=>{const p=new URLSearchParams(location.search),interest=p.get('quan-tam'),grade=p.get('lop');if(interest&&interest.length<=300){const timer=setTimeout(()=>requestRegistration({grade:grade||undefined,interest}),180);return()=>clearTimeout(timer);}},[]);return <><HomeConsultation/><RankArena compact/><R106Hero/><Catalogue embedded/><div className="mig-programme-summary"><CoursesSection/></div><MtmTimetable/><TeachersSection/><SourceGallery/><BenefitsSection/><MtmNewsSection/><PromotionsSection/><RegisterSection/><FAQSection/><section className="mig-container mig-reference-callout"><BookIcon/><div><h2>Thư viện tham khảo vẫn ở đây</h2><p>Tiếp tục dùng danh mục học liệu và các bộ lọc hiện có của MTM.</p></div><Link href="/tai-lieu" className="mig-button outline">Mở thư viện →</Link></section><div className="mtm-shell"><MtmLifeTabs/></div></>;}
function BookIcon(){return <span aria-hidden="true" className="mig-reference-symbol">∑</span>;}
