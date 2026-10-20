// Đóng gói kho đề Phòng thi thử (20/10/2026).
// Kho mã công khai nên đề, đáp án, lời giải KHÔNG được để dạng đọc được: kiểm từng đề (validateDe), gộp, nén gzip rồi mã hóa AES-256-GCM
// bằng khóa MTM_PHONG_THI_KEY (base64 32 byte, đặt trên Vercel). Chỉ /api/phong-thi giải mã để phát đề và chấm.
// Dùng: MTM_PHONG_THI_KEY=... node scripts/phong-thi-dong-goi.mjs <thư mục kho-de ngoài kho mã>
// Chỉ đóng gói đề có kiemTra.ketQua = "dat"; đề lỗi cấu trúc thì dừng cả lô và in lỗi.
import {build} from 'esbuild';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const key=Buffer.from(process.env.MTM_PHONG_THI_KEY??'','base64');
if(key.length!==32)throw Error('Cần MTM_PHONG_THI_KEY (base64 32 byte).');
const dir=process.argv[2];if(!dir)throw Error('Cần thư mục kho đề.');
const out=await build({entryPoints:['server/phong-thi/handler.ts'],bundle:true,platform:'node',format:'esm',write:false,loader:{'.json':'json'},logLevel:'error'});
const {dongGoi,moGoi}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const eng=await build({entryPoints:['server/phong-thi/engine.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'error'});
const {validateDe}=await import('data:text/javascript;base64,'+Buffer.from(eng.outputFiles[0].text).toString('base64'));
const de=[],loi=[],bo=[];
for(const f of readdirSync(dir).filter(f=>f.endsWith('.json')).sort()){
 let d;try{d=JSON.parse(readFileSync(join(dir,f),'utf8'));}catch(e){loi.push(f+': JSON lỗi '+e.message);continue;}
 if(d?.kiemTra?.ketQua!=='dat'){bo.push(f+' (chưa kiểm đạt)');continue;}
 const e=validateDe(d);if(e.length){loi.push(...e.map(x=>f+': '+x));continue;}
 if(de.some(x=>x.id===d.id)){loi.push(f+': trùng id '+d.id);continue;}
 de.push(d);
}
if(loi.length){console.error(loi.join('\n'));process.exit(1);}
if(!de.length)throw Error('Không có đề nào đạt để đóng gói.');
const kho={version:1,dongGoi:new Date().toISOString(),de};
const bin=dongGoi(kho,key);
if(JSON.stringify(moGoi(bin,key))!==JSON.stringify(kho))throw Error('Giải mã thử không khớp.');
writeFileSync('server/phong-thi/kho-de.bin',bin);
const dem={};for(const d of de)dem[d.loai]=(dem[d.loai]??0)+1;
console.log('Đã đóng gói',de.length,'đề',JSON.stringify(dem),Math.round(bin.length/1024)+' KB');
if(bo.length)console.log('Bỏ qua:',bo.join(', '));
