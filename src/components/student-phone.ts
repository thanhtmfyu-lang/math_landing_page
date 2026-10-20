// Anh Thành 20/10/2026: phiếu kỳ thi bắt buộc có SĐT học sinh (ngoài SĐT phụ huynh). Lead chỉ có một cột phone (phụ huynh),
// nên SĐT học sinh nằm trong notes ở dòng "SĐT học sinh: 0xxxxxxxxx"; máy chủ kiểm lại dòng này với các nguồn bên dưới.
export const SDT_HS='SĐT học sinh: ';
/** Chuẩn hóa số di động Việt Nam 10 chữ số; sai khuôn thì trả null. */
export function chuanSdt(v:string){const s=v.replace(/[\s().-]/g,'').replace(/^\+84/,'0');return /^0[35789]\d{8}$/.test(s)?s:null;}
/** Nguồn lead của các phiếu kỳ thi bắt buộc SĐT học sinh. */
export const canSdtHs=(leadSource:string)=>/^(ky-khao-sat|de-giua-ky)/.test(leadSource);
export const coSdtHs=(notes:string)=>notes.split('\n').some(l=>l.startsWith(SDT_HS)&&chuanSdt(l.slice(SDT_HS.length))!==null);
