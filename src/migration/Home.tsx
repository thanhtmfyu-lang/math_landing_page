import './r106-shell.css';
import HonorBoard from '../native/homework/HonorBoard';
import {useEffect} from 'react';
import {MtmLifeTabs} from '../components/MtmLifeTabs';import {MtmTimetable} from '../components/MtmTimetable';import {MtmNewsSection} from '../components/MtmNewsSection';
import {FAQSection} from '../components/FAQSection';import {TeachersSection} from '../components/TeachersSection';
import {PromotionsSection} from '../components/PromotionsSection';import {RegisterSection} from '../components/RegisterSection';import {requestRegistration} from '../components/registration-context';
import {HomeGradePicker,HomeStudentLinks} from './HomeGradePicker';
import R106Hero from './R106Hero';
import {HomeConsultation} from '../components/HomeConsultation';
export default function Home(){useEffect(()=>{const p=new URLSearchParams(location.search),interest=p.get('quan-tam'),grade=p.get('lop');if(interest&&interest.length<=300){const timer=setTimeout(()=>requestRegistration({grade:grade||undefined,interest}),180);return()=>clearTimeout(timer);}},[]);return <><HomeConsultation/><HonorBoard/><R106Hero/><HomeGradePicker/><TeachersSection/><MtmNewsSection/><PromotionsSection/><RegisterSection/><FAQSection/><MtmTimetable/><HomeStudentLinks/><div className="mtm-shell"><MtmLifeTabs/></div></>;}
