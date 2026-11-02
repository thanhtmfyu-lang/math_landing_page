const MAX_BYTES=20*1024*1024;
/** Build an image-only PDF locally; answer images never leave the private upload flow. */
export function jpegPagesPdf(pages:{bytes:Uint8Array;width:number;height:number}[]):Blob{
 const enc=new TextEncoder(),chunks:Uint8Array[]=[],offsets=[0];let size=0;
 const append=(v:string|Uint8Array)=>{const b=typeof v==='string'?enc.encode(v):v;chunks.push(b);size+=b.length;};
 const object=(id:number,body:()=>void)=>{offsets[id]=size;append(`${id} 0 obj\n`);body();append('\nendobj\n');};
 append('%PDF-1.4\n');object(1,()=>append('<< /Type /Catalog /Pages 2 0 R >>'));
 object(2,()=>append(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`));
 pages.forEach((p,i)=>{const id=3+i*3,w=p.width>p.height?842:595,h=p.width>p.height?595:842,scale=Math.min((w-32)/p.width,(h-32)/p.height),iw=p.width*scale,ih=p.height*scale;
  object(id,()=>append(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`));
  object(id+1,()=>{append(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`);append(p.bytes);append('\nendstream');});
  const content=`q ${iw} 0 0 ${ih} ${(w-iw)/2} ${(h-ih)/2} cm /Im Do Q`;object(id+2,()=>append(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`));
 });
 const xref=size;append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);offsets.slice(1).forEach(o=>append(`${String(o).padStart(10,'0')} 00000 n \n`));append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
 return new Blob(chunks as BlobPart[],{type:'application/pdf'});
}
export async function privatePdf(files:File[],imagesAllowed:boolean):Promise<File>{
 if(!files.length)throw Error('Chưa chọn tệp.');if(files.length>30||files.reduce((n,f)=>n+f.size,0)>MAX_BYTES)throw Error('Chọn tối đa 30 ảnh, tổng dung lượng không quá 20 MB.');
 if(files.length===1&&new TextDecoder().decode((await files[0].slice(0,5).arrayBuffer()))==='%PDF-'){return new File([files[0]],'tai-lieu.pdf',{type:'application/pdf'});}
 if(!imagesAllowed||files.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)))throw Error('Chọn một PDF hoặc các ảnh JPG, PNG, WebP. Tài liệu buổi học chỉ nhận PDF.');
 const pages=[];for(const file of files){const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('Trình duyệt chưa ghép được ảnh. Dùng PDF để tải lên.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const jpeg=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Chưa chuyển được ảnh.')),'image/jpeg',0.92));pages.push({bytes:new Uint8Array(await jpeg.arrayBuffer()),width:canvas.width,height:canvas.height});}finally{bitmap.close();}}
 const pdf=jpegPagesPdf(pages);if(pdf.size>MAX_BYTES)throw Error('PDF ghép vượt quá 20 MB. Chọn ít ảnh hơn.');return new File([pdf],'anh-ghep.pdf',{type:'application/pdf'});
}
