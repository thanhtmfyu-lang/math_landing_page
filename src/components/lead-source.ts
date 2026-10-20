// Ghi nguồn khách (quảng cáo, mạng xã hội, mã ?nguon= của phòng marketing) để biết lead đến từ đâu. Không lưu dữ liệu cá nhân.
// Mã ?nguon= giữ 30 ngày trên máy (bấm link hôm nay, mai mới đăng ký vẫn ghi đúng chương trình).
export type LeadSource={ma?:string;source?:string;medium?:string;campaign?:string;content?:string;ad?:string;landing?:string;referrer?:string};
const KEY='mtm-lead-source',KEYS:[keyof LeadSource,string][]=[['source','utm_source'],['medium','utm_medium'],['campaign','utm_campaign'],['content','utm_content']];
const clip=(v:string|null|undefined)=>(v||'').trim().slice(0,120);
const LOCAL='mtm-nguon',GIU_MS=30*864e5;
const maNguon=(v:string|null)=>{const m=(v||'').trim().slice(0,60);return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(m)?m:'';};
export function readLeadSource(search:string,referrer='',path=''):LeadSource|null{
 const p=new URLSearchParams(search),found:LeadSource={};
 const ma=maNguon(p.get('nguon'));if(ma)found.ma=ma;
 for(const[k,q]of KEYS){const v=clip(p.get(q));if(v)found[k]=v;}
 if(p.get('fbclid')){found.ad='Facebook/Instagram';if(!found.source)found.source='facebook';}
 else if(p.get('gclid')){found.ad='Google';if(!found.source)found.source='google';}
 let host='';try{host=referrer?new URL(referrer).hostname.replace(/^www\./,''):''}catch{host=''}
 if(host&&!host.endsWith('minhthanhmath.vn')&&!host.endsWith('vercel.app'))found.referrer=host;
 if(!Object.keys(found).length)return null;
 found.landing=clip(path);return found;
}
export function captureLeadSource(){try{const next=readLeadSource(location.search,document.referrer,location.pathname);if(next&&(next.ma||next.source||next.ad||!sessionStorage.getItem(KEY)))sessionStorage.setItem(KEY,JSON.stringify(next));if(next?.ma)localStorage.setItem(LOCAL,JSON.stringify({...next,luc:Date.now()}));}catch{/* trình duyệt chặn lưu thì bỏ qua */}}
export function storedLeadSource(now=Date.now()):LeadSource|null{
 let s:LeadSource|null=null;try{const raw=sessionStorage.getItem(KEY);s=raw?JSON.parse(raw) as LeadSource:null}catch{s=null}
 if(s?.ma)return s;
 try{const raw=localStorage.getItem(LOCAL),l=raw?JSON.parse(raw) as LeadSource&{luc?:number}:null;if(l?.ma&&typeof l.luc==='number'&&now-l.luc<GIU_MS){const {luc:_,...giu}=l;return s?{...s,ma:giu.ma}:giu;}}catch{/* bỏ qua */}
 return s;
}
export function describeLeadSource(s:LeadSource|null|undefined){if(!s)return 'Vào thẳng web (không rõ nguồn)';return [s.ma&&'Mã nguồn: '+s.ma,s.source&&'Nguồn: '+s.source,s.medium&&'kênh: '+s.medium,s.campaign&&'chiến dịch: '+s.campaign,s.content&&'mẫu: '+s.content,s.ad&&!s.source?.includes(s.ad.toLowerCase())&&'quảng cáo '+s.ad,s.referrer&&'từ trang '+s.referrer,s.landing&&'trang vào: '+s.landing].filter(Boolean).join(' · ')}
