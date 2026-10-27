export type EssayReceipt={id:string;sha256:string;bytes:number;pageNumber:number;receivedAt:string};
export type EssayList={items:EssayReceipt[];deadline:number;serverNow:number};
export type EssayScope={lessonCode:string;attemptId:string};
export async function essayRequest<T>(scope:EssayScope,action:'essay-list'|'essay-sign'|'essay-confirm',extra:Record<string,unknown>={}):Promise<T>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 try{
  const response=await fetch('/api/btvn',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...scope,...extra}),signal:controller.signal});
  const data=await response.json();if(!response.ok)throw Error(typeof data.message==='string'?data.message:'Chưa nhận được ảnh. Em giữ ảnh và thử lại.');return data;
 }finally{clearTimeout(timer);}
}
export async function sendEssayImage(scope:EssayScope,prepared:{sha256:string;blob:Blob},progress:(percent:number)=>void):Promise<EssayReceipt>{
 const extra={sha256:prepared.sha256,bytes:prepared.blob.size};
 const signed=await essayRequest<{image:EssayReceipt;uploadUrl?:string;duplicate?:boolean}>(scope,'essay-sign',extra);
 if(signed.image?.receivedAt)return signed.image;
 if(!signed.uploadUrl)throw Error('Chưa có đường tải ảnh. Em giữ ảnh và thử lại.');
 const url=new URL(signed.uploadUrl);
 if(url.protocol!=='https:'||! /^[a-z0-9]+\.supabase\.co$/.test(url.hostname)||!url.pathname.startsWith('/storage/v1/object/upload/sign/mtm-tu-luan/'))throw Error('Đường tải ảnh chưa hợp lệ. Em tải lại bài.');
 try{
  await new Promise<void>((resolve,reject)=>{
   const xhr=new XMLHttpRequest();xhr.open('PUT',url.href);xhr.timeout=180000;
   xhr.setRequestHeader('Content-Type','image/jpeg');xhr.setRequestHeader('x-upsert','false');
   xhr.upload.onprogress=event=>{if(event.lengthComputable)progress(Math.round(event.loaded/event.total*100));};
   xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(Error('Ảnh chưa tải xong. Em giữ ảnh và bấm Thử lại.'));
   xhr.onerror=xhr.ontimeout=xhr.onabort=()=>reject(Error('Mạng bị gián đoạn. Em giữ trang mở và bấm Thử lại.'));
   xhr.send(prepared.blob);
  });
 }catch(error){
  // An ACK may have been lost after Storage committed; confirm before retry.
  try{return (await essayRequest<{image:EssayReceipt}>(scope,'essay-confirm',extra)).image;}catch{throw error;}
 }
 return (await essayRequest<{image:EssayReceipt}>(scope,'essay-confirm',extra)).image;
}
