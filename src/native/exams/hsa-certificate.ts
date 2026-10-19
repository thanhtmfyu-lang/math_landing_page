/** Giấy khen điện tử cho Thi thử HSA (/thi-thu-hsa): chỉ cho lượt đã vào top 10 bảng xếp hạng do máy chủ xác nhận.
 * Vẽ bằng mẫu giấy khen MTM dùng chung (src/components/mtm-certificate.ts). Chỉ có tên hiển thị, đề, điểm, hạng và ngày:
 * không số điện thoại, trường, lớp hay dữ liệu nào khác. Ghi rõ đây là kết quả thi thử, không phải điểm HSA chính thức. */
import {CERT_H,CERT_W,certificateDate,certificateLines,drawCertificate,renderCertificate,type CertificateData} from '../../components/mtm-certificate';
export const HSA_CERT_TOP=10,HSA_CERT_W=CERT_W,HSA_CERT_H=CERT_H;
export const HSA_CERT_DISCLAIMER='Kết quả thi thử tại MTM, không phải điểm HSA chính thức';
export const HSA_CERT_FOOTER='minhthanhmath.vn/thi-thu-hsa';
export type HsaCertificateData={name:string;paper:string;scoreText:string;rank:number;date:string};
/** Chỉ lượt máy chủ ghi nhận vào bảng (accepted/already) và hạng 1–10. */
export function hsaCertificateRank(state:unknown):number|null{
 const s=state as {status?:unknown;rank?:unknown}|null;
 if(!s||(s.status!=='accepted'&&s.status!=='already')||!Number.isSafeInteger(s.rank))return null;
 const rank=s.rank as number;return rank>=1&&rank<=HSA_CERT_TOP?rank:null;
}
export const hsaCertificateDate=certificateDate;
/** Dữ liệu HSA → mẫu giấy khen chung. */
export const hsaCertificate=(d:HsaCertificateData):CertificateData=>({name:d.name,achievementTitle:d.paper,subtitle:'Thi thử HSA miễn phí',scoreText:d.scoreText,rank:d.rank,dateText:d.date,footerUrl:HSA_CERT_FOOTER,disclaimer:HSA_CERT_DISCLAIMER});
/** Các dòng chữ trên giấy khen, theo thứ tự vẽ (để kiểm thử nội dung mà không cần canvas). */
export const hsaCertificateLines=(d:HsaCertificateData)=>certificateLines(hsaCertificate(d));
export const hsaCertificateFileName=(paper:string,rank:number)=>{const n=paper.match(/(\d+)\s*$/)?.[1];return 'giay-khen-mtm-hsa'+(n?'-'+n:'')+'-hang-'+rank+'.png';};
export const drawHsaCertificate=(ctx:CanvasRenderingContext2D,d:HsaCertificateData,logo:CanvasImageSource|null=null)=>drawCertificate(ctx,hsaCertificate(d),logo);
/** Vẽ giấy khen 1080×1350 và trả PNG. */
export const renderHsaCertificate=(d:HsaCertificateData)=>renderCertificate(hsaCertificate(d));
