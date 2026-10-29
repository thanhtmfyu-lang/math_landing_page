import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {legacyLearningAlias} from '../src/migration/legacy-alias';

// 29/10: đường dẫn gõ nhầm (/dang-nhap, /bang-tin) ra trang "404: NOT_FOUND" tiếng Anh của Vercel.
const root=process.env.MTM_ROOT!;
const page=readFileSync(join(root,'public/404.html'),'utf8');
assert.match(page,/<html lang="vi">/);
assert.match(page,/Không tìm thấy trang này/);
for(const href of ['/btvn','/phu-huynh','/thi-thu','/'])assert.ok(page.includes(`href="${href}"`),'404 dẫn về '+href);
assert.match(page,/name="robots" content="noindex"/);
assert.ok(!/<script/i.test(page),'Trang 404 tĩnh, không chạy mã');
const vercel=JSON.parse(readFileSync(join(root,'vercel.json'),'utf8'));
const aliases:Record<string,string>={'/dang-nhap':'/btvn','/login':'/btvn','/hoc-sinh':'/btvn','/bai-tap':'/btvn','/bai-tap-ve-nha':'/btvn','/bang-tin':'/'};
for(const [s,d] of Object.entries(aliases)){
 assert.ok(vercel.rewrites.some((r:{source:string;destination:string})=>r.source===s&&r.destination==='/index.html'),s+' vào app thay vì 404');
 assert.equal(legacyLearningAlias(s),d);assert.equal(legacyLearningAlias(s+'/','?pin=123456'),d,'Không mang query riêng');
}
assert.equal(legacyLearningAlias('/khong-co-trang'),null);
assert.ok(!vercel.rewrites.some((r:{source:string})=>/^\/:path\*|^\/\(\.\*\)/.test(r.source)),'Không có rewrite bắt tất cả làm mất trang 404');
console.log(JSON.stringify({suite:'TRANG-404',total:4,passed:4,failed:0}));
