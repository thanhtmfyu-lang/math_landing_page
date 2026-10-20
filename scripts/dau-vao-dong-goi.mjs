// Đóng gói ngân hàng đề Kiểm tra đầu vào (19/10/2026).
// Kho mã công khai nên đáp án KHÔNG được để dạng đọc được: gộp các tệp <khoi>.json, nén gzip rồi mã hóa AES-256-GCM
// bằng khóa MTM_DAU_VAO_KEY (base64 32 byte, đặt trên Vercel). Chỉ /api/kiem-tra-dau-vao giải mã để ghép đề và chấm.
// Dùng: MTM_DAU_VAO_KEY=... node scripts/dau-vao-dong-goi.mjs <thư mục ngân hàng ngoài kho>
import {createCipheriv,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
const key=Buffer.from(process.env.MTM_DAU_VAO_KEY??'','base64');
if(key.length!==32)throw Error('Cần MTM_DAU_VAO_KEY (base64 32 byte).');
const dir=process.argv[2];if(!dir)throw Error('Cần thư mục ngân hàng.');
const banks={};
for(const f of readdirSync(dir).filter(f=>/^(?:[6-9]|1[0-2]|hsa)\.json$/.test(f)).sort()){const b=JSON.parse(readFileSync(join(dir,f),'utf8'));banks[f.replace('.json','')]=b;}
// Không bắt buộc: 12-tn.json (mini đề kiểu tốt nghiệp lớp 12, phần I/II/III).
try{banks['12-tn']=JSON.parse(readFileSync(join(dir,'12-tn.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(['6','7','8','9','10','11','12','hsa'].some(k=>!banks[k]))throw Error('Cần đủ 8 tệp 6..12 và hsa.json, đang có: '+Object.keys(banks).join(','));
const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from('dau-vao-ngan-hang'));
const body=Buffer.concat([c.update(gzipSync(JSON.stringify(banks))),c.final()]);
writeFileSync('server/dau-vao/ngan-hang.bin',Buffer.concat([iv,c.getAuthTag(),body]));
console.log('Đã đóng gói',Object.entries(banks).map(([k,b])=>k+':'+b.questions.length).join(' '));
