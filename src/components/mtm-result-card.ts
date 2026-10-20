/** Thẻ kết quả để chia sẻ (W2, đặc tả marketing 20/10): ảnh dọc 1080×1920 vẽ trên trình duyệt, không gửi đi đâu.
 * Có logo màu MTM, tên đợt, điểm, phân vị trong khối (nếu có), dòng minhthanhmath.vn. Không bao giờ có SĐT.
 * Tên chỉ hiện khi em tự gõ và tick đồng ý; không thì hiện số báo danh (nếu có) hoặc bỏ trống. */
import {CERT_COLORS as C,CERT_FONT,loadCertificateFonts,loadCertificateLogo} from './mtm-certificate';
export const CARD_W=1080,CARD_H=1920;
export type ResultCardData={dot:string;scoreText:string;scale?:string;percentile?:number|null;name?:string;sbd?:string;dateText:string;url:string};
const sach=(s:string|undefined,max:number)=>(s||'').replace(/\d[\d .-]{7,}\d/g,'').replace(/\s+/g,' ').trim().slice(0,max);
/** Các dòng chữ trên thẻ (để kiểm thử nội dung mà không cần canvas). */
export function resultCardLines(d:ResultCardData){
 const name=sach(d.name,40),sbd=sach(d.sbd,16).replace(/[^\w-]/g,'');
 return {brand:'Minh Thành Math',dot:sach(d.dot,70),score:d.scoreText,scale:d.scale??'/10 điểm',
  percentile:typeof d.percentile==='number'&&d.percentile>0&&d.percentile<100?`Cao hơn ${Math.round(d.percentile)}% bạn cùng khối`:'',
  who:name?name:sbd?'SBD '+sbd:'',date:d.dateText,cta:'Thi thử miễn phí, chấm ngay',url:d.url.replace(/^https?:\/\//,'')};
}
type Ctx=CanvasRenderingContext2D;
const font=(w:number,s:number)=>w+' '+s+'px '+CERT_FONT;
function fit(ctx:Ctx,text:string,w:number,max:number,min:number,width:number){let s=max;ctx.font=font(w,s);while(s>min&&ctx.measureText(text).width>width){s-=2;ctx.font=font(w,s);}}
export function drawResultCard(ctx:Ctx,d:ResultCardData,logo:CanvasImageSource|null=null){
 const t=resultCardLines(d),W=CARD_W,H=CARD_H,cx=W/2,text=W-200;
 ctx.save();ctx.textAlign='center';ctx.textBaseline='alphabetic';
 ctx.fillStyle=C.paper;ctx.fillRect(0,0,W,H);
 // Dải navy trên, vạch vàng.
 ctx.fillStyle=C.navy;ctx.fillRect(0,0,W,420);ctx.fillStyle=C.yellow;ctx.fillRect(0,420,W,14);
 // Logo trên nền sáng bo góc.
 ctx.fillStyle=C.paper;const bw=700,bh=170,bx=cx-bw/2,by=120;ctx.beginPath();ctx.roundRect?.(bx,by,bw,bh,28);if(!ctx.roundRect)ctx.rect(bx,by,bw,bh);ctx.fill();
 if(logo){const lw=600,lh=Math.round(lw*164/910);ctx.drawImage(logo,cx-lw/2,by+(bh-lh)/2,lw,lh);}
 else{ctx.font=font(700,76);ctx.fillStyle=C.navy;ctx.fillText('minh thành',cx,by+112);}
 ctx.fillStyle='#ffffff';fit(ctx,t.dot,700,48,28,text);ctx.fillText(t.dot,cx,560-80);
 // Điểm.
 ctx.fillStyle=C.muted;ctx.font=font(600,40);ctx.fillText('Kết quả của em',cx,640);
 ctx.fillStyle=C.navy;ctx.font=font(700,300);ctx.fillText(t.score,cx,930);
 ctx.fillStyle=C.muted;ctx.font=font(600,52);ctx.fillText(t.scale,cx,1010);
 let y=1120;
 if(t.percentile){ctx.fillStyle=C.yellowSoft;const pw=Math.min(text,ctx.measureText(t.percentile).width+120);ctx.beginPath();ctx.roundRect?.(cx-pw/2-10,y-62,pw+20,92,46);if(!ctx.roundRect)ctx.rect(cx-pw/2-10,y-62,pw+20,92);ctx.fill();ctx.fillStyle=C.navy;fit(ctx,t.percentile,700,44,28,text-60);ctx.fillText(t.percentile,cx,y);y+=110;}
 if(t.who){ctx.fillStyle=C.navy;fit(ctx,t.who,700,64,34,text);ctx.fillText(t.who,cx,y+30);y+=90;}
 ctx.fillStyle=C.muted;ctx.font=font(400,36);ctx.fillText(t.date,cx,y+30);
 // Chân: lời mời + địa chỉ web.
 ctx.fillStyle=C.navy;ctx.fillRect(0,H-360,W,360);ctx.fillStyle=C.yellow;ctx.fillRect(0,H-360,W,12);
 ctx.fillStyle='#ffffff';ctx.font=font(600,46);ctx.fillText(t.cta,cx,H-230);
 ctx.fillStyle=C.yellow;fit(ctx,t.url,700,68,36,text);ctx.fillText(t.url,cx,H-130);
 ctx.restore();
}
export async function renderResultCard(d:ResultCardData):Promise<Blob>{
 const [,logo]=await Promise.all([loadCertificateFonts(),loadCertificateLogo()]);
 const canvas=document.createElement('canvas');canvas.width=CARD_W;canvas.height=CARD_H;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('canvas');drawResultCard(ctx,d,logo);
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('png')),'image/png'));
}
