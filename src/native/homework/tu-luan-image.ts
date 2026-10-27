export const MAX_SOURCE_BYTES=20*1024*1024,MAX_UPLOAD_BYTES=3*1024*1024;
export type PreparedEssay={blob:Blob;sha256:string;width:number;height:number};
// Blob.arrayBuffer was added later than FileReader on Safari.
const readBlob=(blob:Blob):Promise<ArrayBuffer>=>typeof blob.arrayBuffer==='function'?blob.arrayBuffer():new Promise((resolve,reject)=>{
 const reader=new FileReader();reader.onload=()=>reader.result instanceof ArrayBuffer?resolve(reader.result):reject(Error('Chưa đọc được ảnh. Em chọn lại ảnh.'));reader.onerror=()=>reject(Error('Chưa đọc được ảnh. Em chọn lại ảnh.'));reader.readAsArrayBuffer(blob);
});
const message='Không đọc được ảnh này. Em chọn ảnh JPEG/PNG hoặc chụp lại bằng camera; trên iPhone có thể chọn Định dạng → Tương thích nhất.';
const decode=(blob:Blob)=>new Promise<HTMLImageElement>((resolve,reject)=>{
 const url=URL.createObjectURL(blob),image=new Image();
 image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};
 image.onerror=()=>{URL.revokeObjectURL(url);reject(Error(message));};image.src=url;
});
export async function isHeic(file:File){
 if(/\.(heic|heif)$/i.test(file.name)||/^image\/hei[cf]/i.test(file.type))return true;
 const header=new Uint8Array(await readBlob(file.slice(0,40)));
 const text=String.fromCharCode(...header);
 return text.slice(4,8)==='ftyp'&&/hei[cf]|heix|hevc|mif1/.test(text.slice(8));
}
/** Lazy fallback keeps the HEIC decoder out of the initial exam bundle.
 * Sequential processing bounds memory on phones. Canvas strips EXIF/location. */
export async function prepareEssayImage(file:File):Promise<PreparedEssay>{
 if(file.size<1||file.size>MAX_SOURCE_BYTES)throw Error('Mỗi ảnh gốc tối đa 20 MB. Em chọn ảnh nhỏ hơn hoặc chụp lại.');
 const heic=await isHeic(file);
 if(!heic&&!/^image\/(jpeg|png|webp)$/i.test(file.type)&&! /\.(jpe?g|png|webp)$/i.test(file.name))throw Error('Chỉ nhận ảnh JPEG, PNG, WebP hoặc HEIC/HEIF. Em chọn tệp ảnh bài làm.');
 let image:HTMLImageElement;
 try{image=await decode(file);}catch(error){
  if(!heic)throw error;
  try{
   const {default:convert}=await import('heic2any');
   const converted=await convert({blob:file,toType:'image/jpeg',quality:1});
   if(Array.isArray(converted))throw Error('Chọn từng ảnh HEIC riêng, không chọn ảnh động hoặc chuỗi ảnh.');
   image=await decode(converted);
  }catch{throw Error('Không đổi được HEIC trên máy này. Em chụp lại ở JPEG (iPhone: Camera → Định dạng → Tương thích nhất) hoặc dùng Zalo dự phòng.');}
 }
 if(!image.naturalWidth||!image.naturalHeight)throw Error(message);
 // Keep small handwriting legible; downsize only beyond 2560 px long edge.
 const scale=Math.min(1,2560/Math.max(image.naturalWidth,image.naturalHeight));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
 const context=canvas.getContext('2d');if(!context)throw Error(message);
 context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);image.src='';
 try{
  let blob:Blob|null=null;
  for(const quality of [0.9,0.8,0.7]){
   blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
   if(blob&&blob.size<=MAX_UPLOAD_BYTES)break;
  }
  if(!blob||blob.size<100||blob.size>MAX_UPLOAD_BYTES)throw Error('Ảnh còn quá lớn sau khi nén. Em chụp từng trang gần hơn rồi thử lại.');
  if(!crypto.subtle)throw Error('Trình duyệt chưa hỗ trợ nộp ảnh an toàn. Em mở bài bằng Safari/Chrome qua HTTPS hoặc dùng Zalo dự phòng.');
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await readBlob(blob))),x=>x.toString(16).padStart(2,'0')).join('');
  return {blob,sha256,width:canvas.width,height:canvas.height};
 }finally{canvas.width=1;canvas.height=1;}
}
