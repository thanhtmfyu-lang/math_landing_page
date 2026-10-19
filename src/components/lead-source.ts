// Ghi nguồn khách (quảng cáo, mạng xã hội) để biết lead đến từ đâu. Chỉ lưu trong phiên trình duyệt, không lưu dữ liệu cá nhân.
export type LeadSource={source?:string;medium?:string;campaign?:string;content?:string;ad?:string;landing?:string;referrer?:string};
const KEY='mtm-lead-source',KEYS:[keyof LeadSource,string][]=[['source','utm_source'],['medium','utm_medium'],['campaign','utm_campaign'],['content','utm_content']];
const clip=(v:string|null|undefined)=>(v||'').trim().slice(0,120);
export function readLeadSource(search:string,referrer='',path=''):LeadSource|null{
 const p=new URLSearchParams(search),found:LeadSource={};
 for(const[k,q]of KEYS){const v=clip(p.get(q));if(v)found[k]=v;}
 if(p.get('fbclid')){found.ad='Facebook/Instagram';if(!found.source)found.source='facebook';}
 else if(p.get('gclid')){found.ad='Google';if(!found.source)found.source='google';}
 let host='';try{host=referrer?new URL(referrer).hostname.replace(/^www\./,''):''}catch{host=''}
 if(host&&!host.endsWith('minhthanhmath.vn')&&!host.endsWith('vercel.app'))found.referrer=host;
 if(!Object.keys(found).length)return null;
 found.landing=clip(path);return found;
}
export function captureLeadSource(){try{const next=readLeadSource(location.search,document.referrer,location.pathname);if(next&&(next.source||next.ad||!sessionStorage.getItem(KEY)))sessionStorage.setItem(KEY,JSON.stringify(next));}catch{/* trình duyệt chặn lưu thì bỏ qua */}}
export function storedLeadSource():LeadSource|null{try{const raw=sessionStorage.getItem(KEY);return raw?JSON.parse(raw) as LeadSource:null}catch{return null}}
export function describeLeadSource(s:LeadSource|null|undefined){if(!s)return 'Vào thẳng web (không rõ nguồn)';return [s.source&&'Nguồn: '+s.source,s.medium&&'kênh: '+s.medium,s.campaign&&'chiến dịch: '+s.campaign,s.content&&'mẫu: '+s.content,s.ad&&!s.source?.includes(s.ad.toLowerCase())&&'quảng cáo '+s.ad,s.referrer&&'từ trang '+s.referrer,s.landing&&'trang vào: '+s.landing].filter(Boolean).join(' · ')}
