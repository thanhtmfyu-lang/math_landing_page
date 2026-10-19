import {createDecipheriv,createHmac,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
// Ảnh/video thật của Bảng tin trung tâm, đóng gói bằng scripts/bang-tin-dong-goi.mjs (tệp .bin đã mã hóa AES-256-GCM).
// Link ảnh ký HMAC, sống LINK_SECONDS; chỉ /api/bang-tin (đã kiểm phiên BTVN) mới phát link.
type Item={id:string;alt:string;width:number;height:number;video?:boolean;public?:boolean};
type Post={id:string;kind:string;title:string;date:string;summary:string;place?:string;pinned?:boolean;photos:Item[]};
let cache:Post[]|null=null;
const list=(root=process.cwd())=>cache??=JSON.parse(readFileSync(join(root,'server/bang-tin/bai.json'),'utf8')) as Post[];
export const LINK_SECONDS=3600;
const ID=/^[a-z0-9-]{1,90}$/;

export function boardKey(env:Record<string,string|undefined>){const k=Buffer.from(env.MTM_BANG_TIN_KEY??'','base64');return k.length===32?k:null;}
const mac=(key:Buffer,f:string,e:number)=>createHmac('sha256',key).update('bang-tin-link\0'+f+'\0'+e).digest('base64url');
function link(key:Buffer,f:string,e:number){return `/api/bang-tin-anh?f=${f}&e=${e}&s=${mac(key,f,e)}`;}

/** Bài có ảnh thật kèm link ký sẵn. publicOnly: bỏ ảnh đánh dấu "public": false, dùng cho khách chưa đăng nhập. */
export function localBoardPosts(key:Buffer,now=Date.now(),publicOnly=false){
 const e=Math.floor(now/1000)+LINK_SECONDS;
 return list().map(p=>({id:p.id,kind:p.kind,title:p.title,date:p.date,summary:p.summary,place:p.place,pinned:p.pinned===true,
  photos:p.photos.filter(x=>!publicOnly||x.public!==false).map(x=>x.video
   ?{url:link(key,x.id,e),poster:link(key,x.id+'-bia',e),thumb:link(key,x.id+'-bia',e),video:true,alt:x.alt,width:x.width,height:x.height}
   :{url:link(key,x.id,e),thumb:link(key,x.id+'-nho',e),alt:x.alt,width:x.width,height:x.height})})).filter(p=>p.photos.length);
}

/** Tệp được phép: id ảnh/video trong bai.json, hoặc ảnh nhỏ/ảnh bìa của nó. */
function mediaType(f:string){
 for(const p of list())for(const x of p.photos){
  if(f===x.id)return x.video?'video/mp4':'image/webp';
  if(f===x.id+(x.video?'-bia':'-nho'))return 'image/webp';
 }
 return null;
}
export function openMedia(key:Buffer,f:unknown,e:unknown,s:unknown,now=Date.now(),root=process.cwd()):{body:Buffer;type:string}|null{
 if(typeof f!=='string'||!ID.test(f)||typeof e!=='string'||!/^\d{10}$/.test(e)||typeof s!=='string')return null;
 const exp=Number(e);if(exp*1000<now||exp*1000>now+(LINK_SECONDS+60)*1000)return null;
 const want=Buffer.from(mac(key,f,exp)),got=Buffer.from(s);
 if(want.length!==got.length||!timingSafeEqual(want,got))return null;
 const type=mediaType(f);if(!type)return null;
 const raw=readFileSync(join(root,'server/bang-tin/anh',f+'.bin'));
 const d=createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));d.setAAD(Buffer.from(f));d.setAuthTag(raw.subarray(12,28));
 return {body:Buffer.concat([d.update(raw.subarray(28)),d.final()]),type};
}
