// Kiểm web thật sau mỗi lần deploy (luật W01–W02): chụp trang chủ 390 và 1366 px,
// kiểm 4 nút mối ở đầu trang, chân trang gọn, mọi kỳ thi có thẻ trong mối Thi (/thi-thu),
// các trang chính mở được và không lỗi JS. In bảng Markdown; mã thoát 1 khi có mục lỗi.
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';

const GOC = process.env.MTM_WEB_GOC || 'https://www.minhthanhmath.vn';
const ANH = process.env.MTM_ANH_DIR || 'anh-sau-deploy';
const TRANG = ['/', '/btvn', '/thi-thu', '/de-giua-ky-1', '/kiem-tra-dau-vao', '/phu-huynh', '/phong-thi-thu', '/ky-khao-sat', '/thi-thu-hsa', '/xep-hang', '/khoa-hoc'];
const KY_THI = ['/de-giua-ky-1', '/phong-thi-thu', '/thi-thu-hsa', '/ky-khao-sat'];
mkdirSync(ANH, {recursive: true});
const dong = [];
const ghi = (muc, dat, ghiChu = '') => dong.push({muc, dat, ghiChu});
const b = await chromium.launch(process.env.MTM_CHROMIUM ? {executablePath: process.env.MTM_CHROMIUM} : {});
async function mo(p, path) {
 const loiJs = [];
 p.removeAllListeners('pageerror');p.on('pageerror', e => loiJs.push(String(e.message).slice(0, 120)));
 const r = await p.goto(GOC + path + (path.includes('?') ? '&' : '?') + 'nguon=kiem-sau-deploy', {waitUntil: 'networkidle', timeout: 45000}).catch(e => ({status: () => 0, e}));
 await p.waitForTimeout(1200);
 const d = p.getByRole('button', {name: 'Đã xem, vào trang chủ'});if (await d.count()) {await d.first().click();await p.waitForTimeout(400);}
 return {status: r.status(), loiJs};
}
for (const [w, h, ten] of [[1366, 800, 'may-tinh'], [390, 844, 'dien-thoai']]) {
 const p = await b.newPage({viewport: {width: w, height: h}, deviceScaleFactor: w < 500 ? 2 : 1});
 for (const path of ['/', '/khoa-hoc']) {
  const r = await mo(p, path);
  const lon = await p.locator('.mtm-quick-row a').count();
  const tren = await p.locator('.mtm-quick-links').evaluate(el => el.getBoundingClientRect().top).catch(() => 9999);
  const ba = await p.locator('.mtm-footer-map').count();
  ghi(`${ten} ${path}: nút đầu trang`, r.status === 200 && lon >= 4 && tren < h, `${lon} nút (BTVN, Thi, Phụ huynh, Kiểm tra đầu vào), cách đỉnh ${Math.round(tren)} px`);
  ghi(`${ten} ${path}: chân trang 1 dòng`, ba === 0, ba ? 'còn khối 3 cột' : '');
  await p.screenshot({path: `${ANH}/${ten}${path === '/' ? '-trang-chu' : path.replace(/\//g, '-')}.png`});
 }
 await p.close();
}
const p = await b.newPage({viewport: {width: 1366, height: 800}});
for (const path of TRANG) {
 const r = await mo(p, path);
 const chu = (await p.locator('main').innerText().catch(() => '')).trim().length;
 ghi(`trang ${path}`, r.status === 200 && chu > 40 && !r.loiJs.length, [r.status !== 200 && 'mã ' + r.status, chu <= 40 && 'trang trống', r.loiJs[0] && 'lỗi JS: ' + r.loiJs[0]].filter(Boolean).join('; '));
 if (path === '/thi-thu') {
  const thieu = [];
  for (const k of KY_THI) if (!(await p.locator(`.mtm-hub-tabs a[href="${k}"]`).count())) thieu.push(k);
  ghi('mối Thi gom mọi kỳ thi', !thieu.length, thieu.length ? 'thiếu lối vào ' + thieu.join(', ') : '');
 }
}
await b.close();
const loi = dong.filter(d => !d.dat), gio = new Date().toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'});
console.log(loi.length ? `**Kiểm sau deploy: ${loi.length}/${dong.length} mục lỗi** lúc ${gio}\n` : `Kiểm sau deploy: ${dong.length}/${dong.length} mục đạt lúc ${gio}\n`);
console.log('| Mục | Kết quả |\n|---|---|');
for (const d of dong) console.log(`| ${d.muc} | ${d.dat ? 'đạt' : 'LỖI'}${d.ghiChu ? ' (' + d.ghiChu + ')' : ''} |`);
process.exit(loi.length ? 1 : 0);
