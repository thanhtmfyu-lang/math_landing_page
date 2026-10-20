// Quét lộ dữ liệu cho kho công khai (luật D05, W05 trong sổ luật công ty).
//   node scripts/quet-cong-khai.mjs --diff <base>   dòng mới thêm trong PR: SĐT thật, khóa bí mật, đáp án, tệp dữ liệu HS
//   node scripts/quet-cong-khai.mjs --build <dir>   bản build: số tiền học phí, khóa service_role
// In từng lỗi kèm tệp:dòng (không in nguyên giá trị bí mật); mã thoát 1 khi có lỗi.
import {execFileSync} from 'node:child_process';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';

const HOTLINE = '0967365413';
// SĐT giả dùng trong test: lặp ≥4 chữ số liền nhau, dãy tăng/giảm quen thuộc, hoặc hotline đổi số cuối.
const SDT_GIA = /(\d)\1{3,}|0912345678|0987654321|^096736541\d$/;
const SDT = /(?<![\d.])(?:\+?84|0)[ .-]?([35789])(?:[ .-]?\d){8}(?![\d.])/g;
const KHOA = [
 ['khóa OpenAI/Anthropic', /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/],
 ['token GitHub', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
 ['khóa AWS', /\bAKIA[0-9A-Z]{16}\b/],
 ['khóa riêng', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
 ['biến bí mật có giá trị', /\b(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|MTM_[A-Z_]*(?:SECRET|KEY|TOKEN))\s*(?:[:=]\s*['"`][A-Za-z0-9._-]{16,}|=[A-Za-z0-9._-]{16,}\s*$)/],
];
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
const TIEN = /\d{2,3}(?:[.,]000|\s?(?:k|K|nghìn|ngàn))\s?(?:đ|₫|VNĐ|vnđ|đồng)?|\d{1,3}(?:[.,]\d{3})+\s?(?:đ|₫|VNĐ|vnđ|đồng)/;

const loi = [];
const bao = (noi, viec) => loi.push(`${noi}: ${viec}`);
function jwtServiceRole(s) {
 for (const m of s.matchAll(JWT)) {
  try { if (JSON.parse(Buffer.from(m[1], 'base64url').toString()).role === 'service_role') return true; } catch {}
 }
 return false;
}
function quetDong(noi, dong, tep) {
 for (const [ten, re] of KHOA) if (re.test(dong)) bao(noi, ten);
 if (jwtServiceRole(dong)) bao(noi, 'khóa Supabase service_role');
 for (const m of dong.matchAll(SDT)) {
  const so = m[0].replace(/[^\d]/g, '').replace(/^84/, '0');
  if (so !== HOTLINE && !SDT_GIA.test(so)) bao(noi, `số điện thoại ${so.slice(0, 3)}…${so.slice(-2)} (chỉ được để hotline hoặc số giả kiểu 0900000001)`);
 }
 if (/^public\//.test(tep) && /["']?(?:answerKey|answers?|dapAn|dap_an|correct(?:Answer|Option)?|key)["']?\s*:\s*["'\[{]/.test(dong)) bao(noi, 'đáp án trong thư mục công khai public/');
}

const [che, doi] = process.argv.slice(2);
if (che === '--diff') {
 const base = doi || 'origin/main';
 const ten = execFileSync('git', ['diff', '--name-only', '--diff-filter=AR', base + '...HEAD'], {encoding: 'utf8'}).split('\n').filter(Boolean);
 for (const t of ten) {
  if (/\.(csv|xlsx?|ods|sqlite|db|sql\.gz|dump)$/i.test(t) && !/^supabase\/(migrations|tests)/.test(t)) bao(t, 'tệp dữ liệu (bảng tính/CSDL) không được đưa vào kho công khai');
  if (/^public\/.*(dap-an|dapan|answer|loi-giai-kin)/i.test(t)) bao(t, 'tệp đáp án trong public/');
  if (/(^|\/)\.env(\.|$)/.test(t) && !/\.example$/.test(t)) bao(t, 'tệp .env');
 }
 const diff = execFileSync('git', ['diff', '-U0', '--no-color', base + '...HEAD', '--', '.', ':(exclude)package-lock.json', ':(exclude)*.png', ':(exclude)*.jpg', ':(exclude)*.webp', ':(exclude)*.pdf'], {encoding: 'utf8', maxBuffer: 1 << 30});
 let tep = '', so = 0;
 for (const d of diff.split('\n')) {
  if (d.startsWith('+++ ')) { tep = d.slice(6); continue; }
  const h = d.match(/^@@ -\d+(?:,\d+)? \+(\d+)/); if (h) { so = +h[1]; continue; }
  if (d.startsWith('+')) { quetDong(`${tep}:${so}`, d.slice(1), tep); so++; }
 }
} else if (che === '--build') {
 const goc = doi || 'build';
 const tat = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? tat(p) : [p]; });
 for (const p of tat(goc).filter(p => ['.js', '.html', '.json', '.txt', '.xml'].includes(extname(p)))) {
  const s = readFileSync(p, 'utf8');
  for (const [ten, re] of KHOA) if (re.test(s)) bao(p, ten);
  if (jwtServiceRole(s)) bao(p, 'khóa Supabase service_role');
  // W05: không đưa mức học phí lên web: chữ "học phí" không được đứng gần một số tiền.
  for (const m of s.matchAll(/học phí/gi)) {
   const quanh = s.slice(Math.max(0, m.index - 80), m.index + 90);
   if (TIEN.test(quanh)) bao(p, `số tiền cạnh chữ "học phí": …${quanh.replace(/\s+/g, ' ').slice(40, 150)}…`);
  }
  for (const m of s.matchAll(/(?:\d{2,3}(?:[.,]000|\s?(?:k|K|nghìn|ngàn))|\d{1,3}(?:[.,]\d{3})+\s?(?:đ|₫|VNĐ|vnđ|đồng))\s?\/\s?(?:buổi|ca|giờ)/g)) bao(p, `giá theo buổi: ${m[0]}`);
 }
} else {
 console.error('Dùng: node scripts/quet-cong-khai.mjs --diff <base> | --build <thư mục>');
 process.exit(2);
}
console.log(loi.length ? `QUÉT CÔNG KHAI: ${loi.length} lỗi\n` + loi.map(x => '- ' + x).join('\n') : `QUÉT CÔNG KHAI (${che}): đạt, không thấy SĐT thật, khóa, đáp án hay học phí.`);
process.exit(loi.length ? 1 : 0);
