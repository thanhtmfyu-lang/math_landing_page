import {MTM_SOCIAL_CHANNELS,type MtmSocialChannel} from './mtm-contact';
import './social-links.css';

export function ZaloIcon(){
 return <svg className="mtm-social-icon" viewBox="0 0 40 40" width="30" height="30" aria-hidden="true" focusable="false"><rect width="40" height="40" rx="12" fill="#fff"/><path d="M10 9h20a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5H18l-7 4 1-5a5 5 0 0 1-5-5V14a5 5 0 0 1 3-5Z" fill="#0068ff"/><text x="21" y="24" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="800" fontFamily="Arial,sans-serif">Zalo</text></svg>;
}

function SocialIcon({channel}:{channel:MtmSocialChannel}){
 if(channel==='zalo')return <ZaloIcon/>;
 return <svg className="mtm-social-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
  {channel==='facebook'&&<path d="M14 22v-9h3l.5-4H14V7c0-1.1.3-2 2-2h2V1.4A25 25 0 0 0 15 1c-3 0-5 1.8-5 5v3H7v4h3v9Z"/>}
  {channel==='tiktok'&&<path d="M15.5 2h3a5 5 0 0 0 4 4v3a9 9 0 0 1-4-1.2V16a6 6 0 1 1-6-6v3a3 3 0 1 0 3 3Z"/>}
  {channel==='youtube'&&<><path d="M22 7a3 3 0 0 0-2-2c-2-.5-14-.5-16 0a3 3 0 0 0-2 2 29 29 0 0 0 0 10 3 3 0 0 0 2 2c2 .5 14 .5 16 0a3 3 0 0 0 2-2 29 29 0 0 0 0-10Z"/><path d="m10 8 6 4-6 4Z" fill="#fff"/></>}
  {channel==='threads'&&<path d="M19.7 7.2C18.8 3.8 16.3 2 12.3 2 6.8 2 4 5.4 4 12s2.9 10 8.3 10c4.4 0 7.5-2.7 7.5-6.4 0-3.4-2.6-5.5-6.6-5.5-3.2 0-5 1.5-5 3.7 0 2 1.6 3.3 3.7 3.3 3.2 0 5-2.1 5-5.4 0-3-1.7-4.8-4.4-4.8-1.7 0-3.1.6-3.8 1.7m7.6 4c1.6.6 2.6 1.6 2.6 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>}
  {channel==='instagram'&&<><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1.2"/></>}
 </svg>;
}

export function SocialLinks({label='Kênh của Minh Thành Math',showLabels=false,includeZalo=true}:{label?:string;showLabels?:boolean;includeZalo?:boolean}){
 return <nav className={'mtm-social-links'+(showLabels?' mtm-social-links-labelled':'')} aria-label={label}>{MTM_SOCIAL_CHANNELS.filter(channel=>includeZalo||channel.id!=='zalo').map(channel=><a key={channel.id} href={channel.url} target="_blank" rel="noopener noreferrer" aria-label={`${channel.id==='zalo'?'Zalo Toán Thầy Thành tư vấn lớp học':channel.label+' Minh Thành Math'}, mở tab mới`} title={channel.id==='zalo'?'Tư vấn lớp học qua Zalo':channel.label}><SocialIcon channel={channel.id}/>{showLabels&&<span>{channel.label}</span>}</a>)}</nav>;
}
