import assert from 'node:assert/strict';
import {KS,chuanZalo,ksRegistration,soBaoDanh} from '../src/native/exams/ky-khao-sat';
// Số báo danh cố định theo SĐT phụ huynh + họ tên (không phân biệt hoa thường, khoảng trắng) + lớp.
const a=await soBaoDanh('0967365413','Nguyễn Văn An','11');
assert.match(a,/^KS11-[A-HJ-NP-Z2-9]{6}$/);
assert.equal(await soBaoDanh('0967365413','  nguyễn  văn an ','11'),a);
assert.notEqual(await soBaoDanh('0967365413','Nguyễn Văn An','12'),a);
assert.notEqual(await soBaoDanh('0967365414','Nguyễn Văn An','11'),a);
assert.equal(chuanZalo('+84 967.365.413'),'0967365413');
// Phiếu đủ: đổ về kho lead kind dang-ky, ghi SBD, trường, nguồn kỳ khảo sát.
const f={hoTen:'Nguyễn Văn An',lop:'11' as const,truong:'THPT Kim Liên',zaloPh:'+84967365413',dongY:true};
const r=ksRegistration(f,a,'Nguồn: facebook');
assert.equal(r.phone,'0967365413');assert.equal(r.grade,'11');assert.equal(r.message,'online');
assert.ok(r.notes!.includes('Số báo danh: '+a)&&r.notes!.includes('Trường: THPT Kim Liên'));
assert.equal(r.leadSource,KS.ma+' · Nguồn: facebook');
// Thiếu trường, chưa đồng ý, số sai: báo lỗi tiếng Việt, không gửi.
assert.throws(()=>ksRegistration({...f,truong:' '},a,''),/trường/);
assert.throws(()=>ksRegistration({...f,dongY:false},a,''),/đồng ý/);
assert.throws(()=>ksRegistration({...f,zaloPh:'12345'},a,''),/di động/);
console.log('ky-khao-sat: ok');
