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
 const r = await p.goto(GOC + path + (path.includes('?') ? '&' : '?') + 'nguon=kiem-sau-deploy', {waitUntil: 'load', timeout: 45000}).catch(e => ({status: () => 0, e}));
 // Không chờ networkidle: /btvn giữ kết nối nền nên không bao giờ "rảnh". Chờ nội dung chính hiện ra.
 await p.waitForFunction(() => (document.querySelector('main')?.innerText || '').trim().length > 40, null, {timeout: 20000}).catch(() => {});
 await p.waitForTimeout(800);
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
// Góc phụ huynh có số liệu và không mâu thuẫn (lỗi 21/10: BTVN 0/0 bài mà hạng vẫn có điểm, "hạng 11/2").
// Cần tài khoản phụ huynh kiểm thử (secret MTM_PH_KIEM_SDT + MTM_PH_KIEM_PIN, ghép với học sinh QA); kết quả vào issue công khai
// nên chỉ in đạt/lỗi và lý do, không in tên, điểm hay SĐT.
function mauThuanPH(r) {
 const s = r?.summary || {}, hw = Array.isArray(r?.homework) ? r.homework : [], loi = [];
 if (!hw.length) loi.push('không có bài BTVN nào');
 if (r?.rank?.submitted > 0 && !s.submitted) loi.push('có hạng/điểm tháng nhưng BTVN đã nộp = 0');
 if (s.dueTotal < s.submitted) loi.push('số bài đã nộp lớn hơn số bài đến hạn');
 const coDiem = hw.some(h => typeof h.bestScore === 'number');
 if (coDiem !== (s.averageScore !== null && s.averageScore !== undefined)) loi.push('điểm trung bình không khớp danh sách bài');
 if (s.monthAttendance && s.monthAttendance.attended > s.monthAttendance.total) loi.push('số buổi đi học lớn hơn tổng buổi');
 if (/0[0-9]{9}/.test(JSON.stringify(r))) loi.push('báo cáo có số điện thoại');
 return loi;
}
if (process.env.MTM_PH_KIEM_SDT && process.env.MTM_PH_KIEM_PIN) {
 const goi = async (body, cookie = '') => {
  const res = await fetch(GOC + '/api/btvn', {method: 'POST', headers: {'content-type': 'application/json', cookie}, body: JSON.stringify(body), signal: AbortSignal.timeout(30000)});
  return {status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0]};
 };
 try {
  const dn = await goi({ph: 'login', parentPhone: process.env.MTM_PH_KIEM_SDT, pin: process.env.MTM_PH_KIEM_PIN});
  const con = dn.body?.children || [];
  if (dn.status !== 200 || !con.length) ghi('Góc phụ huynh: đăng nhập tài khoản kiểm', false, 'mã ' + dn.status + (con.length ? '' : ', không có con'));
  for (const [i, c] of con.entries()) {
   const bc = await goi({ph: 'report', childId: c.id}, dn.cookie), loi = bc.status === 200 ? mauThuanPH(bc.body) : ['mã ' + bc.status];
   ghi(`Góc phụ huynh: số liệu con ${i + 1}`, !loi.length, loi.join('; '));
  }
  await goi({ph: 'logout'}, dn.cookie);
 } catch (e) { ghi('Góc phụ huynh: số liệu', false, String(e?.name || e)); }
} else ghi('Góc phụ huynh: số liệu', true, 'bỏ qua, chưa có tài khoản phụ huynh kiểm thử');
const loi = dong.filter(d => !d.dat), gio = new Date().toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'});
console.log(loi.length ? `**Kiểm sau deploy: ${loi.length}/${dong.length} mục lỗi** lúc ${gio}\n` : `Kiểm sau deploy: ${dong.length}/${dong.length} mục đạt lúc ${gio}\n`);
console.log('| Mục | Kết quả |\n|---|---|');
for (const d of dong) console.log(`| ${d.muc} | ${d.dat ? 'đạt' : 'LỖI'}${d.ghiChu ? ' (' + d.ghiChu + ')' : ''} |`);
process.exit(loi.length ? 1 : 0);
