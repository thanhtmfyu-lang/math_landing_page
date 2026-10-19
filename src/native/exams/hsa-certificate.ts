/** Giấy khen điện tử cho Thi thử HSA (/thi-thu-hsa): chỉ cho lượt đã vào top 10 bảng xếp hạng do máy chủ xác nhận.
 * Ảnh vẽ trên trình duyệt (canvas → PNG), không gửi đi đâu. Chỉ có tên hiển thị, đề, điểm, hạng và ngày:
 * không số điện thoại, trường, lớp hay dữ liệu nào khác. Ghi rõ đây là kết quả thi thử, không phải điểm HSA chính thức. */
export const HSA_CERT_TOP=10,HSA_CERT_W=1080,HSA_CERT_H=1350;
export const HSA_CERT_FONT="'Be Vietnam Pro','Be Vietnam Pro Fallback',Arial,sans-serif";
export const HSA_CERT_DISCLAIMER='Kết quả thi thử tại MTM, không phải điểm HSA chính thức';
export const HSA_CERT_FOOTER='minhthanhmath.vn/thi-thu-hsa';
export type HsaCertificateData={name:string;paper:string;scoreText:string;rank:number;date:string};
/** Chỉ lượt máy chủ ghi nhận vào bảng (accepted/already) và hạng 1–10. */
export function hsaCertificateRank(state:unknown):number|null{
 const s=state as {status?:unknown;rank?:unknown}|null;
 if(!s||(s.status!=='accepted'&&s.status!=='already')||!Number.isSafeInteger(s.rank))return null;
 const rank=s.rank as number;return rank>=1&&rank<=HSA_CERT_TOP?rank:null;
}
export const hsaCertificateDate=(at:Date=new Date())=>at.toLocaleDateString('vi-VN',{timeZone:'Asia/Saigon',day:'2-digit',month:'2-digit',year:'numeric'});
/** Các dòng chữ trên giấy khen, theo thứ tự vẽ (để kiểm thử nội dung mà không cần canvas). */
export function hsaCertificateLines(d:HsaCertificateData){
 return {brand:'Minh Thành Math · MTM',title:'Giấy khen',lead:'Chúc mừng',name:d.name,reason:'đã đạt thành tích cao tại',paper:d.paper,rank:'Hạng '+d.rank,score:d.scoreText,date:'Ngày '+d.date,disclaimer:HSA_CERT_DISCLAIMER,footer:HSA_CERT_FOOTER};
}
export const hsaCertificateFileName=(paper:string,rank:number)=>{const n=paper.match(/(\d+)\s*$/)?.[1];return 'giay-khen-mtm-hsa'+(n?'-'+n:'')+'-hang-'+rank+'.png';};

type Ctx=CanvasRenderingContext2D;
const NAVY='#213269',NAVY_DEEP='#14204a',RED='#c8344a',YELLOW='#ffcf24',MUTED='#4f6a91',CREAM='#fffaf0';
const font=(weight:number,size:number)=>weight+' '+size+'px '+HSA_CERT_FONT;
/** Cỡ chữ lớn nhất (≤ max) để dòng vừa chiều rộng. */
function fit(ctx:Ctx,text:string,weight:number,max:number,min:number,width:number){let size=max;ctx.font=font(weight,size);while(size>min&&ctx.measureText(text).width>width){size-=2;ctx.font=font(weight,size);}return size;}
function round(ctx:Ctx,x:number,y:number,w:number,h:number,r:number){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function star(ctx:Ctx,cx:number,cy:number,outer:number,inner:number,points:number){ctx.beginPath();for(let i=0;i<points*2;i++){const r=i%2?inner:outer,a=-Math.PI/2+i*Math.PI/points;ctx.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a));}ctx.closePath();}
/** Nạp đủ các độ đậm Be Vietnam Pro (kèm ký tự có dấu) trước khi vẽ; lỗi tải phông thì vẫn vẽ bằng phông dự phòng. */
export async function loadHsaCertificateFonts(){
 const fonts=typeof document!=='undefined'?document.fonts:undefined;if(!fonts)return;
 try{await Promise.all([400,600,700].map(w=>fonts.load(w+" 40px 'Be Vietnam Pro'",'Giấy khen Hạng Nguyễn Đề thi thử ỹ')));await fonts.ready;}catch{/* dùng phông dự phòng */}
}
export function drawHsaCertificate(ctx:Ctx,d:HsaCertificateData){
 const t=hsaCertificateLines(d),W=HSA_CERT_W,H=HSA_CERT_H,cx=W/2;
 ctx.save();ctx.textAlign='center';ctx.textBaseline='alphabetic';
 // Nền kem, khung đôi xanh đậm.
 ctx.fillStyle=CREAM;ctx.fillRect(0,0,W,H);
 // Dải đầu xanh đậm pha đỏ HSA như khối đầu trang.
 const band=430;let g=ctx.createLinearGradient(0,0,W,band);g.addColorStop(0,'#1d2c5e');g.addColorStop(1,NAVY_DEEP);ctx.fillStyle=g;ctx.fillRect(0,0,W,band);
 let rg=ctx.createRadialGradient(W,0,0,W,0,620);rg.addColorStop(0,'rgba(200,52,74,.6)');rg.addColorStop(1,'rgba(200,52,74,0)');ctx.fillStyle=rg;ctx.fillRect(0,0,W,band);
 rg=ctx.createRadialGradient(0,band,0,0,band,460);rg.addColorStop(0,'rgba(217,130,43,.35)');rg.addColorStop(1,'rgba(217,130,43,0)');ctx.fillStyle=rg;ctx.fillRect(0,0,W,band);
 ctx.fillStyle=YELLOW;ctx.fillRect(0,band,W,10);ctx.fillStyle=RED;ctx.fillRect(0,band+10,W,6);
 ctx.strokeStyle=NAVY;ctx.lineWidth=6;ctx.strokeRect(24,24,W-48,H-48);
 ctx.strokeStyle=YELLOW;ctx.lineWidth=2;ctx.strokeRect(40,40,W-80,H-80);
 // Thương hiệu: ô chữ MTM + tên.
 ctx.font=font(700,30);const brandW=ctx.measureText(t.brand).width,mark=64,gap=18,startX=cx-(mark+gap+brandW)/2;
 round(ctx,startX,92,mark,mark,14);ctx.fillStyle=RED;ctx.fill();
 ctx.fillStyle='#fff';ctx.font=font(700,22);ctx.fillText('MTM',startX+mark/2,132);
 ctx.textAlign='left';ctx.fillStyle=YELLOW;ctx.font=font(700,30);ctx.fillText(t.brand,startX+mark+gap,135);ctx.textAlign='center';
 // Tiêu đề.
 ctx.fillStyle='#fff';ctx.font=font(700,132);ctx.fillText(t.title,cx,300);
 ctx.fillStyle='rgba(255,255,255,.82)';ctx.font=font(400,32);ctx.fillText('Thi thử HSA miễn phí',cx,370);
 // Người nhận.
 ctx.fillStyle=MUTED;ctx.font=font(400,34);ctx.fillText(t.lead,cx,530);
 ctx.fillStyle=NAVY;fit(ctx,t.name,700,84,40,W-200);ctx.fillText(t.name,cx,630);
 ctx.strokeStyle=YELLOW;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(cx-170,668);ctx.lineTo(cx+170,668);ctx.stroke();
 ctx.fillStyle=MUTED;ctx.font=font(400,32);ctx.fillText(t.reason,cx,730);
 ctx.fillStyle=NAVY;fit(ctx,t.paper,600,44,28,W-200);ctx.fillText(t.paper,cx,786);
 // Huy hiệu hạng: ngôi sao vàng, chữ hạng đỏ.
 const by=934;ctx.fillStyle=YELLOW;star(ctx,cx,by,124,102,16);ctx.fill();ctx.strokeStyle='#e0a800';ctx.lineWidth=4;ctx.stroke();
 ctx.beginPath();ctx.arc(cx,by,84,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=RED;ctx.lineWidth=6;ctx.stroke();
 ctx.fillStyle=MUTED;ctx.font=font(600,24);ctx.fillText('HẠNG',cx,by-22);
 ctx.fillStyle=RED;ctx.font=font(700,68);ctx.fillText(String(d.rank),cx,by+46);
 // Điểm.
 ctx.fillStyle=RED;fit(ctx,t.score,700,50,30,W-200);ctx.fillText(t.score,cx,1122);
 ctx.fillStyle=NAVY;ctx.font=font(600,32);ctx.fillText(t.rank+' · '+t.date,cx,1176);
 // Ghi chú và chân trang.
 ctx.fillStyle=MUTED;ctx.font=font(400,24);ctx.fillText(t.disclaimer,cx,1240);
 ctx.fillStyle=NAVY;ctx.font=font(600,24);ctx.fillText(t.footer,cx,1282);
 ctx.restore();
}
/** Vẽ giấy khen 1080×1350 và trả PNG. */
export async function renderHsaCertificate(d:HsaCertificateData):Promise<Blob>{
 await loadHsaCertificateFonts();
 const canvas=document.createElement('canvas');canvas.width=HSA_CERT_W;canvas.height=HSA_CERT_H;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('canvas');drawHsaCertificate(ctx,d);
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('png')),'image/png'));
}
