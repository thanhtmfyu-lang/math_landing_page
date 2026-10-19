import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {HSA_CERT_W,HSA_CERT_H,HSA_CERT_DISCLAIMER,drawHsaCertificate,hsaCertificateDate,hsaCertificateFileName,hsaCertificateLines,hsaCertificateRank} from '../src/native/exams/hsa-certificate';
const root=process.env.MTM_ROOT!;

// 1. Chỉ lượt máy chủ đã ghi vào bảng (accepted/already) và hạng 1–10 mới có giấy khen.
assert.equal(hsaCertificateRank({status:'accepted',rank:1}),1);
assert.equal(hsaCertificateRank({status:'already',rank:10}),10);
for(const s of [{status:'accepted',rank:11},{status:'accepted',rank:0},{status:'accepted',rank:null},{status:'accepted',rank:2.5},{status:'device',rank:3},{status:'name',rank:1},{status:'pending'},{status:'error'},null,undefined])assert.equal(hsaCertificateRank(s),null,JSON.stringify(s));
console.log('Đạt điều kiện giấy khen: chỉ hạng 1–10 do máy chủ xác nhận.');

// 2. Nội dung: tên, đề, điểm, hạng, ngày, ghi chú không phải điểm HSA chính thức, chân trang; không có dữ liệu khác.
const data={name:'Nguyễn Văn A',paper:'Đề thi thử HSA số 01',scoreText:'42/50 (quy ra 8,4/10)',rank:1,date:hsaCertificateDate(new Date('2026-10-19T20:00:00Z'))};
assert.equal(data.date,'20/10/2026');
const lines=hsaCertificateLines(data);
assert.equal(lines.title,'Giấy khen');assert.equal(lines.brand,'Minh Thành Math · MTM');assert.equal(lines.rank,'Hạng 1');assert.equal(lines.footer,'minhthanhmath.vn/thi-thu-hsa');
assert.equal(HSA_CERT_DISCLAIMER,'Kết quả thi thử tại MTM, không phải điểm HSA chính thức');
assert.equal(hsaCertificateFileName('Đề thi thử HSA số 02',3),'giay-khen-mtm-hsa-02-hang-3.png');
// Canvas giả: ghi lại mọi chữ được vẽ.
const drawn:string[]=[];const noop=()=>{};const gradient={addColorStop:noop};
const ctx=new Proxy({fillText:(t:string)=>drawn.push(t),measureText:(t:string)=>({width:t.length*20}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient} as any,{get:(o,k)=>k in o?o[k]:noop,set:(o,k,v)=>{o[k]=v;return true;}});
drawHsaCertificate(ctx,data);
const all=drawn.join('\n');
for(const s of ['Giấy khen','Minh Thành Math · MTM','Nguyễn Văn A','Đề thi thử HSA số 01','42/50 (quy ra 8,4/10)','Hạng 1 · Ngày 20/10/2026',HSA_CERT_DISCLAIMER,'minhthanhmath.vn/thi-thu-hsa'])assert.ok(drawn.includes(s)||all.includes(s),s);
assert.ok(!/\d{9,}|0967|Lớp|trường|THPT/i.test(all),'không số điện thoại, lớp, trường');
assert.equal(HSA_CERT_W,1080);assert.equal(HSA_CERT_H,1350);
console.log('Đạt nội dung giấy khen 1080×1350: có ghi chú thi thử, không lộ số điện thoại, lớp, trường.');

// 3. Trang chỉ hiện giấy khen khi lượt chấm trên máy chủ, bảng xếp hạng bật; hợp đồng API giữ nguyên.
const page=readFileSync(join(root,'src/native/exams/HsaMock.tsx'),'utf8');
assert.ok(page.includes("outcome.server&&board.state==='on'&&rank?hsaCertificateRank(rank):null"));
assert.ok(page.includes('Tải giấy khen')&&page.includes('navigator.canShare')&&page.includes('hsa-cert-preview'));
assert.ok(page.includes('await document.fonts')||readFileSync(join(root,'src/native/exams/hsa-certificate.ts'),'utf8').includes('await fonts.ready'));
const api=readFileSync(join(root,'api/hsa-xep-hang.ts'),'utf8');
assert.ok(api.includes("res.status(200).json({enabled:true,status:data.status as HsaSubmitStatus,rank,name})"));
console.log('Đạt gắn giấy khen vào khung kết quả, không đổi API /api/hsa-xep-hang.');
