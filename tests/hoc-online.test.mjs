import assert from 'node:assert/strict';import fs from 'node:fs';
// Kiểm tra nguồn trang /hoc-online: route đăng ký đủ 3 nơi, không có giá, chỉ một số liên hệ, không hứa điểm.
const page=fs.readFileSync('src/migration/OnlineCourses.tsx','utf8'),app=fs.readFileSync('src/App.tsx','utf8'),policy=fs.readFileSync('src/migration/route-policy.ts','utf8'),vercel=JSON.parse(fs.readFileSync('vercel.json','utf8')),catalog=fs.readFileSync('src/native/NativeCourses.tsx','utf8');
assert(app.includes("lazy(()=>import('./migration/OnlineCourses'))"));assert(app.includes("path==='/hoc-online'?<OnlineCourses/>"));
assert(/PUBLIC_PATHS=\[[^\]]*'\/hoc-online'/.test(policy));assert(policy.includes("'/hoc-online':'Toán 12 và HSA online cùng lớp thật'"));assert(policy.includes("descriptions:Record<string,string>={'/hoc-online':"));
assert(vercel.rewrites.some(r=>r.source==='/hoc-online'&&r.destination==='/index.html'));
assert(catalog.includes('href="/hoc-online"'));
// Không giá: không số kèm đ/đồng/k/nghìn, không "triệu", không "000".
assert(!/\d[\d.,]*\s*(?:đ|đồng|k|nghìn)(?=[\s.,;:!?)'"\/<]|$)/i.test(page),'price string');assert(!/triệu|000đ|\.000/.test(page),'price string');
// Chỉ một số điện thoại: mọi dãy số dạng điện thoại đều là 0967365413.
const phones=[...page.matchAll(/(?:\+?84|0)(?:[\s.]?\d){8,10}/g)].map(m=>m[0].replace(/\D/g,''));assert(phones.length>=2);for(const p of phones)assert.equal(p,'0967365413');
assert(page.includes('tel:0967365413'));assert(page.includes('ZALO_ASSISTANT_URL'));assert(!/zalo\.me\//.test(page));
// Không hứa điểm: "cam kết điểm" chỉ xuất hiện ở câu hỏi FAQ, câu trả lời là "MTM không hứa điểm".
assert.equal(page.split('cam kết điểm').length-1,1);assert(page.includes("'MTM có cam kết điểm không?','MTM không hứa điểm."));assert(!/đảm bảo điểm|chắc chắn đạt|cam kết đầu ra|đỗ 100|điểm 9\+/i.test(page));
// Copy chính và CTA.
for(const s of ['Ở xa vẫn học cùng lớp thật','Làm bài kiểm tra đầu vào miễn phí','Nhắn Zalo 0967 365 413','Thi thử HSA miễn phí','href="/thi-thu-hsa"','Học thử buổi đầu: không học tiếp thì không tính phí.','82 Chùa Láng, Đống Đa, Hà Nội','<RegisterSection/>',"mode:'online'","getElementById('register')",'/khoa-hoc?lop=12','/khoa-hoc?lop=hsa','2K9 XPT','HSA.2'])assert(page.includes(s),s);
assert.equal((page.match(/\['[^']+\?','/g)||[]).length,9,'9 FAQ');assert(page.includes('<details'));
assert(!/href="#/.test(page),'no hash anchors: App rewrites them to /#');
console.log('PASS /hoc-online route x3 + catalogue link, no price, single phone, no score promise, CTA scrolls to in-page form with online preset');
