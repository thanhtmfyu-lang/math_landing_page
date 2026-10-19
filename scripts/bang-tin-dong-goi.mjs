// Đóng gói ảnh/video thật cho Bảng tin trung tâm (19/10/2026).
// Kho mã công khai nên ảnh học sinh KHÔNG được để dạng đọc được: mỗi tệp nén lại (ảnh webp 1600px + ảnh nhỏ 480px,
// video mp4 720p + ảnh bìa) rồi mã hóa AES-256-GCM bằng khóa MTM_BANG_TIN_KEY (base64 32 byte, đặt trên Vercel).
// /api/bang-tin chỉ ký link khi phiên BTVN hợp lệ; /api/bang-tin-anh giải mã khi link còn hạn.
// Dùng: MTM_BANG_TIN_KEY=... node scripts/bang-tin-dong-goi.mjs <bai.json ngoài kho>
//   bai = {post:{id,kind,title,date,summary,place?,pinned?}, items:[{src,alt,type:'image'|'video'}]}
import {createCipheriv,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,existsSync,readdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const key=Buffer.from(process.env.MTM_BANG_TIN_KEY??'','base64');
if(key.length!==32)throw Error('Cần MTM_BANG_TIN_KEY (base64 32 byte).');
const spec=JSON.parse(readFileSync(process.argv[2],'utf8'));
const post=spec.post;
if(!/^[a-z0-9-]{1,60}$/.test(post.id))throw Error('id bài sai khuôn');
const out='server/bang-tin/anh',list='server/bang-tin/bai.json';
mkdirSync(out,{recursive:true});
for(const f of readdirSync(out))if(f.startsWith(post.id+'-'))unlinkSync(join(out,f));
const tmp=mkdtempSync(join(tmpdir(),'bang-tin-'));
const seal=(file,name)=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(name));const body=Buffer.concat([c.update(readFileSync(file)),c.final()]);writeFileSync(join(out,name+'.bin'),Buffer.concat([iv,c.getAuthTag(),body]));};
const ff=(...args)=>execFileSync('ffmpeg',['-v','error','-y',...args]);
const size=file=>execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',file]).toString().trim().split(',').map(Number);
const photos=spec.items.map((item,i)=>{
 const id=`${post.id}-${String(i+1).padStart(2,'0')}`;
 if(item.type==='video'){
  const v=join(tmp,id+'.mp4'),p=join(tmp,id+'-bia.webp');
  ff('-i',item.src,'-vf',"scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)'",'-c:v','libx264','-crf','28','-preset','slow','-c:a','aac','-b:a','96k','-movflags','+faststart',v);
  ff('-ss','0.5','-i',v,'-frames:v','1','-vf','scale=480:-2','-q:v','78',p);
  const [width,height]=size(v);seal(v,id);seal(p,id+'-bia');
  return {id,alt:item.alt,width,height,video:true};
 }
 const big=join(tmp,id+'.webp'),small=join(tmp,id+'-nho.webp');
 ff('-i',item.src,'-vf',"scale='min(1600,iw)':-2",'-q:v','80',big);
 ff('-i',item.src,'-vf','scale=480:-2','-q:v','72',small);
 const [width,height]=size(big);seal(big,id);seal(small,id+'-nho');
 return {id,alt:item.alt,width,height};
});
rmSync(tmp,{recursive:true,force:true});
const posts=existsSync(list)?JSON.parse(readFileSync(list,'utf8')):[];
const next=[...posts.filter(p=>p.id!==post.id),{...post,photos}].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
writeFileSync(list,JSON.stringify(next,null,1)+'\n');
console.log(`Đã đóng gói ${photos.length} tệp cho bài ${post.id}.`);
