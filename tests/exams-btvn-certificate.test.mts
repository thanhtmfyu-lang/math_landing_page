import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {BTVN_CERT_FOOTER,btvnCertificate,btvnCertificateFileName,btvnCertificateRank,btvnCohort,btvnPeriodLabel} from '../src/native/homework/btvn-certificate';
import {certificateLines} from '../src/components/mtm-certificate';
const root=process.env.MTM_ROOT!;

// Thứ Hai 19/10/2026 20:00 giờ Việt Nam.
const now=Date.parse('2026-10-19T13:00:00Z');
const row=(rank:unknown,extra:Record<string,unknown>={})=>({rank,fullName:'Bạn khác',className:'2K9 9+',score:9.25,submitted:4,total:4,...extra});

// 1. Chỉ hạng 1–10 hợp lệ mới có giấy khen.
assert.equal(btvnCertificateRank(row(1)),1);
assert.equal(btvnCertificateRank(row(10)),10);
for(const r of [row(11),row(0),row(-1),row(2.5),row('3'),row(null),row(3,{score:11}),row(3,{score:Number.NaN}),row(3,{total:0}),row(3,{submitted:5}),row(3,{className:1}),null,undefined,'1',{rank:1}])assert.equal(btvnCertificateRank(r),null,JSON.stringify(r));
console.log('Đạt điều kiện giấy khen BTVN: chỉ hạng 1–10 với dòng hạng hợp lệ.');

// 2. Kỳ: tuần thứ Hai–Chủ nhật và tháng dương lịch theo giờ Việt Nam; kiểm tra tháng không có giấy khen.
assert.equal(btvnPeriodLabel('btvn-thang',now),'tháng 10/2026');
assert.equal(btvnPeriodLabel('btvn-tuan',now),'tuần 19/10–25/10/2026');
assert.equal(btvnPeriodLabel('btvn-tuan',Date.parse('2026-10-25T16:59:00Z')),'tuần 19/10–25/10/2026');
assert.equal(btvnPeriodLabel('btvn-tuan',Date.parse('2026-10-25T17:00:00Z')),'tuần 26/10–01/11/2026');
assert.equal(btvnPeriodLabel('btvn-thang',Date.parse('2026-10-31T17:30:00Z')),'tháng 11/2026');
assert.equal(btvnCohort('2K9 9+'),'2K9');assert.equal(btvnCohort('2K10 Thứ 3, 6'),'2K10');assert.equal(btvnCohort('LOP-TEST-A'),null);
const base={row:row(3),fullName:'  Nguyễn  Văn A ',classLabel:'2K9 9+',cohort:'2K9',now};
assert.equal(btvnCertificate({...base,kind:'kiem-tra-thang'}),null);
assert.equal(btvnCertificate({...base,kind:'btvn-thang',row:row(11)}),null);
assert.equal(btvnCertificate({...base,kind:'btvn-thang',cohort:null}),null);
assert.equal(btvnCertificate({...base,kind:'btvn-thang',fullName:'  '}),null);

// 3. Nội dung: tên của chính em (không lấy tên trong dòng hạng), lớp em đang thấy, điểm, hạng, ngày, ghi chú; không số điện thoại/trường.
const month=btvnCertificate({...base,kind:'btvn-thang'})!;
assert.deepEqual(month,{name:'Nguyễn Văn A',achievementTitle:'Top 3 bảng xếp hạng BTVN tháng 10/2026',subtitle:'Bài tập về nhà · Khối 2K9 · Lớp 2K9 9+',scoreText:'Điểm trung bình 9,25/10 · nộp 4/4 bài',rank:3,dateText:'19/10/2026',footerUrl:BTVN_CERT_FOOTER,disclaimer:'Kết quả BTVN tại MTM · hạng trong khối 2K9 tính đến ngày 19/10/2026'});
const week=btvnCertificate({...base,kind:'btvn-tuan',row:row(1)})!;
assert.equal(week.achievementTitle,'Top 1 bảng xếp hạng BTVN tuần 19/10–25/10/2026');
assert.equal(btvnCertificate({...base,kind:'btvn-thang',classLabel:'Lớp học thử'})!.subtitle,'Bài tập về nhà · Khối 2K9 · Lớp học thử');
const text=Object.values(certificateLines(month)).join('\n');
assert.ok(!text.includes('Bạn khác')&&!/\d{9,}|0967|THPT|trường/i.test(text),'không tên bạn khác, số điện thoại, trường');
assert.equal(btvnCertificateFileName('btvn-thang',3,now),'giay-khen-mtm-btvn-thang-10-2026-hang-3.png');
assert.equal(btvnCertificateFileName('btvn-tuan',1,now),'giay-khen-mtm-btvn-tuan-19-10-25-10-2026-hang-1.png');
console.log('Đạt nội dung giấy khen BTVN tuần và tháng.');

// 4. Màn hình chỉ đọc hạng của chính em (phiên BTVN), không đọc bảng công khai; không sửa các file của PR khác.
const ui=readFileSync(join(root,'src/native/homework/BtvnCertificates.tsx'),'utf8');
assert.ok(ui.includes("requestLeaderboard<{enabled:boolean;row:unknown}>('/api/xep-hang-cua-em',{method:'POST',credentials:'same-origin'"));
assert.ok(!ui.includes("'/api/xep-hang?")&&!ui.includes('/api/xep-hang?')&&!/dau-truong|cohorts|\.rows\b/.test(ui),'không đọc bảng công khai');
assert.ok(ui.includes('fullName:state.fullName')&&ui.includes('if(!earned.length)return null'));
assert.ok(ui.includes('Nhận giấy khen')&&ui.includes('Tải giấy khen')&&ui.includes('navigator.canShare')&&ui.includes('btvn-cert-preview'));
const session=readFileSync(join(root,'src/native/homework/HomeworkSession.tsx'),'utf8');
assert.ok(session.includes('profileControl={profileControl?.(state)}/><BtvnCertificates state={state}/>'));
assert.ok(!readFileSync(join(root,'src/native/homework/R104Dashboard.tsx'),'utf8').includes('Certificate'));
console.log('Đạt nút giấy khen BTVN: chỉ dữ liệu của chính em, chỉ hiện khi vào top 10.');
