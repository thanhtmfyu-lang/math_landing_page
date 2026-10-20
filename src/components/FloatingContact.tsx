import {useEffect,useState} from 'react';
import {MessageCircle,ArrowUpRight} from 'lucide-react';
import {Link} from '../migration/navigation';
import {ZALO_ASSISTANT_URL} from './mtm-contact';
import {ZaloIcon} from './SocialLinks';
import './home-consultation.css';
export function contactAllowed(pathname:string,search=''){
 return !(pathname==='/btvn'||pathname==='/phu-huynh'||pathname.startsWith('/btvn/')||pathname==='/quan-tri'||pathname.startsWith('/quan-tri/')||pathname==='/admin'||pathname.startsWith('/admin/')||pathname.startsWith('/thi-thu/')||(pathname==='/luyen-tap'&&['id','luot'].some(key=>new URLSearchParams(search).has(key))));
}
export function FloatingContact({pathname,search=''}:{pathname:string;search?:string}){
 const [nearForm,setNearForm]=useState(false),[pastHero,setPastHero]=useState(false),allowed=contactAllowed(pathname,search);
 useEffect(()=>{if(pathname!=='/')return;const check=()=>setPastHero(window.scrollY>window.innerHeight*0.8);check();window.addEventListener('scroll',check,{passive:true});return()=>window.removeEventListener('scroll',check);},[pathname]);
 useEffect(()=>{
  setNearForm(false);if(!allowed)return;
  let observer:IntersectionObserver|undefined,form:HTMLElement|null=null;
  const watch=()=>{const next=document.getElementById('register');if(next===form)return;observer?.disconnect();form=next;setNearForm(false);if(form){observer=new IntersectionObserver(entries=>setNearForm(entries.some(entry=>entry.isIntersecting)),{rootMargin:'80px 0px 80px 0px'});observer.observe(form);}};
  watch();const mutations=new MutationObserver(watch);mutations.observe(document.getElementById('main-content')??document.body,{childList:true,subtree:true});
  return()=>{observer?.disconnect();mutations.disconnect();};
 },[pathname,search,allowed]);
 if(!allowed)return null;
 if(pathname==='/')return <nav className="mtm-home-consultation-dock" hidden={nearForm||!pastHero} aria-label="Tư vấn khóa học qua Zalo"><a href={ZALO_ASSISTANT_URL} target="_blank" rel="noopener noreferrer" aria-label="Tư vấn ngay về khóa học, mở Zalo ở tab mới"><ZaloIcon/><span>Tư vấn ngay</span><ArrowUpRight size={18} aria-hidden="true"/></a></nav>;
 return <nav className="mtm-contact-dock" aria-label="Liên hệ nhanh" hidden={nearForm}><a href={ZALO_ASSISTANT_URL} aria-label="Nhắn Zalo tư vấn lớp mới: 0967 365 413" target="_blank" rel="noopener noreferrer"><ZaloIcon/><span>Nhắn Zalo tư vấn</span></a><a href={ZALO_ASSISTANT_URL} aria-label="Zalo trợ lý lớp đang học: 0967 365 413" target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true"/><span>Zalo trợ lý</span></a><Link className="mtm-contact-register" href="/#register"><ArrowUpRight size={18} aria-hidden="true"/><span>Đăng ký tư vấn</span></Link></nav>;
}
