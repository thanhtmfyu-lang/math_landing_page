// Canh web 24/7 (chạy trong GitHub Actions, Node 22, không cần thư viện).
// In bảng Markdown ra stdout; mã thoát 1 khi có mục lỗi.
const GOC = process.env.MTM_WEB_GOC || 'https://minhthanhmath.vn';
const TRANG = ['/', '/khoa-hoc', '/thi-thu', '/kiem-tra-dau-vao', '/phong-thi-thu', '/de-giua-ky-1',
  '/ky-khao-sat', '/thi-thu-hsa', '/xep-hang', '/btvn', '/tai-lieu', '/huong-dan'];
// API chỉ đọc. Không gửi dữ liệu, chỉ cần máy chủ không sập (mã < 500).
const API = ['/api/bang-tin', '/api/xep-hang', '/api/hsa-xep-hang', '/api/kiem-tra-dau-vao'];
const CHAM_MS = 8000;

async function mo(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {redirect: 'follow', signal: AbortSignal.timeout(15000), headers: {'user-agent': 'mtm-canh-web'}});
    const body = await res.text();
    return {status: res.status, ms: Date.now() - t0, body};
  } catch (e) {
    return {status: 0, ms: Date.now() - t0, body: '', loi: String(e?.cause?.code || e?.name || e)};
  }
}

async function chay() {
  const dong = [];
  const ghi = (muc, r, dat, ghiChu = '') => dong.push({muc, status: r.status, ms: r.ms, dat, ghiChu: ghiChu || r.loi || ''});
  for (const p of TRANG) {
    const r = await mo(GOC + p);
    const dat = r.status === 200 && r.body.includes('id="root"');
    ghi(p, r, dat && r.ms < CHAM_MS, dat && r.ms >= CHAM_MS ? 'chậm' : '');
  }
  // Bản build phải tải được: lấy file JS chính từ trang chủ.
  const home = await mo(GOC + '/');
  const js = home.body.match(/\/assets\/[^"']+\.js/)?.[0];
  if (js) { const r = await mo(GOC + js); ghi('file JS chính', r, r.status === 200 && r.body.length > 1000); }
  else ghi('file JS chính', home, false, 'không thấy file JS trong trang chủ');
  for (const p of API) { const r = await mo(GOC + p); ghi(p, r, r.status > 0 && r.status < 500); }
  // Phòng thi phải đang ghi lượt vào CSDL (MTM_PHONG_THI_DB=1): bảng vàng trả enabled:true. enabled:false = bài nộp không được lưu.
  { const r = await mo(GOC + '/api/phong-thi?xep-hang-dot=thpt-thu-2026-11'); let en = null; try { en = JSON.parse(r.body).enabled; } catch { /* không phải JSON */ }
    ghi('phòng thi ghi CSDL', r, r.status === 200 && en === true, en === false ? 'máy chủ đang tắt ghi CSDL, bài nộp không được lưu' : ''); }
  // Bảng vàng HSA1 (công khai trên web): in số dòng để đối chiếu CSDL mà web đang ghi.
  { const r = await mo(GOC + '/api/phong-thi?xep-hang-dot=hsa-thu-2026-11'); let n = '?'; try { n = String(JSON.parse(r.body).rows.length); } catch { /* bỏ qua */ }
    ghi('bảng vàng HSA1', r, r.status === 200, n + ' dòng'); }
  return dong;
}

const dong = await chay();
const loi = dong.filter(d => !d.dat);
const gio = new Date().toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'});
console.log(loi.length ? `**${loi.length}/${dong.length} mục lỗi** lúc ${gio}\n` : `Tất cả ${dong.length}/${dong.length} mục chạy tốt lúc ${gio}\n`);
console.log('| Mục | Mã | Thời gian | Kết quả |\n|---|---|---|---|');
for (const d of dong) console.log(`| ${d.muc} | ${d.status || '—'} | ${d.ms} ms | ${d.dat ? 'tốt' : 'LỖI'}${d.ghiChu ? ' (' + d.ghiChu + ')' : ''} |`);
process.exit(loi.length ? 1 : 0);
