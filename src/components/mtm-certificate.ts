/** Giấy khen điện tử MTM dùng chung (Thi thử HSA, bảng xếp hạng BTVN): vẽ trên trình duyệt (canvas → PNG), không gửi đi đâu.
 * Nhận diện theo logo thật /mtm-original-logo.png: nền sáng, chữ và khung xanh navy, điểm nhấn vàng.
 * Màu lấy trực tiếp từ điểm ảnh logo (trung vị vùng chữ "minh" và "thành"), nền trùng nền ảnh logo để logo liền mạch. */
export const CERT_W=1080,CERT_H=1350;
export const CERT_FONT="'Be Vietnam Pro','Be Vietnam Pro Fallback',Arial,sans-serif";
export const CERT_LOGO_SRC='/mtm-original-logo.png';
/** NAVY/YELLOW/PAPER: lấy mẫu từ mtm-original-logo.png. Các tông còn lại pha từ hai màu đó. */
export const CERT_COLORS={navy:'#233064',yellow:'#f9c418',paper:'#fafafa',muted:'#5b6487',yellowDeep:'#d9a400',yellowSoft:'#fdf0c4'} as const;
export type CertificateData={name:string;achievementTitle:string;subtitle:string;scoreText?:string;rank:number;dateText:string;footerUrl:string;disclaimer?:string};
/** Các dòng chữ trên giấy khen, theo thứ tự vẽ (để kiểm thử nội dung mà không cần canvas). */
export function certificateLines(d:CertificateData){
 return {brand:'Minh Thành Math',title:'Giấy khen',subtitle:d.subtitle,lead:'Trân trọng chúc mừng',name:d.name,reason:'đã đạt thành tích',achievement:d.achievementTitle,rank:'Hạng '+d.rank,score:d.scoreText??'',date:'Ngày '+d.dateText,disclaimer:d.disclaimer??'',footer:d.footerUrl};
}
/** Ngày theo giờ Việt Nam, dạng 20/10/2026. */
export const certificateDate=(at:Date=new Date())=>at.toLocaleDateString('vi-VN',{timeZone:'Asia/Saigon',day:'2-digit',month:'2-digit',year:'numeric'});

type Ctx=CanvasRenderingContext2D;
const C=CERT_COLORS;
const font=(weight:number,size:number)=>weight+' '+size+'px '+CERT_FONT;
/** Cỡ chữ lớn nhất (≤ max) để dòng vừa chiều rộng. */
function fit(ctx:Ctx,text:string,weight:number,max:number,min:number,width:number){let size=max;ctx.font=font(weight,size);while(size>min&&ctx.measureText(text).width>width){size-=2;ctx.font=font(weight,size);}return size;}
function star(ctx:Ctx,cx:number,cy:number,outer:number,inner:number,points:number){ctx.beginPath();for(let i=0;i<points*2;i++){const r=i%2?inner:outer,a=-Math.PI/2+i*Math.PI/points;ctx.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a));}ctx.closePath();}
function rule(ctx:Ctx,cx:number,y:number,half:number){
 ctx.strokeStyle=C.yellow;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(cx-half,y);ctx.lineTo(cx-14,y);ctx.moveTo(cx+14,y);ctx.lineTo(cx+half,y);ctx.stroke();
 ctx.fillStyle=C.yellow;ctx.beginPath();ctx.moveTo(cx,y-8);ctx.lineTo(cx+8,y);ctx.lineTo(cx,y+8);ctx.lineTo(cx-8,y);ctx.closePath();ctx.fill();
}
function corner(ctx:Ctx,x:number,y:number,sx:number,sy:number){
 ctx.fillStyle=C.yellow;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+sx*64,y);ctx.lineTo(x,y+sy*64);ctx.closePath();ctx.fill();
 ctx.strokeStyle=C.navy;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+sx*84,y);ctx.lineTo(x,y+sy*84);ctx.stroke();
}
/** Khi chưa nạp được ảnh logo: chữ "minh" navy + "thành" vàng như logo. */
function wordmark(ctx:Ctx,cx:number,y:number){
 ctx.font=font(700,76);const a='minh',b='thành',wa=ctx.measureText(a).width,wb=ctx.measureText(b).width,x=cx-(wa+wb)/2;
 ctx.textAlign='left';ctx.fillStyle=C.navy;ctx.fillText(a,x,y);ctx.fillStyle=C.yellow;ctx.fillText(b,x+wa,y);ctx.textAlign='center';
}
/** Vẽ giấy khen 1080×1350. logo: ảnh logo đã giải mã (cùng nguồn nên canvas vẫn xuất PNG được); null thì vẽ chữ thay logo. */
export function drawCertificate(ctx:Ctx,d:CertificateData,logo:CanvasImageSource|null=null){
 const t=certificateLines(d),W=CERT_W,H=CERT_H,cx=W/2,text=W-220;
 ctx.save();ctx.textAlign='center';ctx.textBaseline='alphabetic';
 // Nền sáng trùng nền logo; khung navy và đường chỉ vàng.
 ctx.fillStyle=C.paper;ctx.fillRect(0,0,W,H);
 ctx.strokeStyle=C.navy;ctx.lineWidth=8;ctx.strokeRect(30,30,W-60,H-60);
 ctx.strokeStyle=C.yellow;ctx.lineWidth=3;ctx.strokeRect(48,48,W-96,H-96);
 corner(ctx,48,48,1,1);corner(ctx,W-48,48,-1,1);corner(ctx,48,H-48,1,-1);corner(ctx,W-48,H-48,-1,-1);
 // Logo thật, căn giữa.
 const lw=600,lh=Math.round(lw*164/910),ly=104;
 if(logo)ctx.drawImage(logo,cx-lw/2,ly,lw,lh);else wordmark(ctx,cx,ly+80);
 rule(ctx,cx,ly+lh+34,200);
 // Tiêu đề.
 ctx.fillStyle=C.navy;ctx.font=font(700,124);ctx.fillText(t.title,cx,394);
 ctx.fillStyle=C.muted;fit(ctx,t.subtitle,600,32,22,text);ctx.fillText(t.subtitle,cx,462);
 // Người nhận.
 ctx.fillStyle=C.muted;ctx.font=font(400,32);ctx.fillText(t.lead,cx,546);
 ctx.fillStyle=C.navy;fit(ctx,t.name,700,84,40,text);ctx.fillText(t.name,cx,642);
 ctx.strokeStyle=C.yellow;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(cx-190,676);ctx.lineTo(cx+190,676);ctx.stroke();
 ctx.fillStyle=C.muted;ctx.font=font(400,30);ctx.fillText(t.reason,cx,736);
 ctx.fillStyle=C.navy;fit(ctx,t.achievement,700,46,26,text);ctx.fillText(t.achievement,cx,796);
 // Huy hiệu hạng: hoa vàng, lõi navy, số trắng.
 const by=t.score?944:960;
 ctx.fillStyle=C.yellow;star(ctx,cx,by,122,104,18);ctx.fill();ctx.strokeStyle=C.yellowDeep;ctx.lineWidth=3;ctx.stroke();
 ctx.beginPath();ctx.arc(cx,by,88,0,Math.PI*2);ctx.fillStyle=C.navy;ctx.fill();
 ctx.beginPath();ctx.arc(cx,by,78,0,Math.PI*2);ctx.strokeStyle=C.yellow;ctx.lineWidth=3;ctx.stroke();
 ctx.fillStyle=C.yellow;ctx.font=font(700,22);ctx.fillText('HẠNG',cx,by-26);
 ctx.fillStyle='#ffffff';ctx.font=font(700,d.rank>=10?62:72);ctx.fillText(String(d.rank),cx,by+46);
 // Điểm, hạng, ngày.
 let y=by+174;
 if(t.score){ctx.fillStyle=C.navy;fit(ctx,t.score,700,44,26,text);ctx.fillText(t.score,cx,y);y+=54;}
 ctx.fillStyle=C.muted;ctx.font=font(600,30);ctx.fillText(t.rank+' · '+t.date,cx,y);
 // Ghi chú và chân trang.
 if(t.disclaimer){ctx.fillStyle=C.muted;fit(ctx,t.disclaimer,400,24,18,text);ctx.fillText(t.disclaimer,cx,1222);}
 ctx.fillStyle=C.navy;ctx.font=font(700,26);ctx.fillText(t.footer,cx,1268);
 ctx.restore();
}
/** Nạp đủ các độ đậm Be Vietnam Pro (kèm ký tự có dấu) trước khi vẽ; lỗi tải phông thì vẫn vẽ bằng phông dự phòng. */
export async function loadCertificateFonts(){
 const fonts=typeof document!=='undefined'?document.fonts:undefined;if(!fonts)return;
 try{await Promise.all([400,600,700].map(w=>fonts.load(w+" 40px 'Be Vietnam Pro'",'Giấy khen Hạng Nguyễn Đề thi thử ỹ')));await fonts.ready;}catch{/* dùng phông dự phòng */}
}
/** Ảnh logo cùng nguồn (không làm "bẩn" canvas). Lỗi tải thì trả null để vẽ chữ thay. */
export async function loadCertificateLogo(src=CERT_LOGO_SRC):Promise<HTMLImageElement|null>{
 if(typeof Image==='undefined')return null;
 try{const img=new Image();img.decoding='async';img.src=src;await img.decode();return img;}catch{return null;}
}
/** Vẽ giấy khen và trả PNG. */
export async function renderCertificate(d:CertificateData):Promise<Blob>{
 const [,logo]=await Promise.all([loadCertificateFonts(),loadCertificateLogo()]);
 const canvas=document.createElement('canvas');canvas.width=CERT_W;canvas.height=CERT_H;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('canvas');drawCertificate(ctx,d,logo);
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('png')),'image/png'));
}
