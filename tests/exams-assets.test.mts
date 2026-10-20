// KT-05 (cổng kiểm cấu trúc đề, phần tệp): mọi mảnh ảnh đề/lời giải và PDF nội bộ mà dữ liệu đề
// trỏ tới phải có trong public/ và đúng SHA-256 ghi trong dữ liệu. PDF ở máy chủ ngoài chỉ được liệt kê.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {PRACTICE_EXAMS, type PracticeExam} from '../src/native/exams/data';
import type {SourceSegment} from '../src/native/exams/MtmSourceContent';
import exactTests from '../src/native/chapters/exact-tests.json';
import practiceTests from '../src/native/chapters/practice-tests.json';
import archivedTests from '../src/native/chapters/archived-tests.json';
import {suite} from './exams-harness.mts';

const {test, finish} = suite('A');
const root = process.env.MTM_ROOT ?? process.cwd();
const exams: PracticeExam[] = [...PRACTICE_EXAMS, ...[...exactTests, ...practiceTests, ...archivedTests].map(p => (p as unknown as {exam: PracticeExam}).exam)];
const cache = new Map<string, string | null>();
const sha = (file: string) => {
  if (!cache.has(file)) cache.set(file, existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null);
  return cache.get(file)!;
};
const segments: {exam: string; seg: SourceSegment}[] = [];
const pdfs: {exam: string; url: string; sha256: string}[] = [];
for (const e of exams) {
  for (const seg of [...(e.sourceInstructions ?? []), ...(e.solutionInstructions ?? [])]) segments.push({exam: e.id, seg});
  for (const q of e.questions) for (const seg of [...(q.sourceContent?.questions ?? []), ...(q.sourceContent?.solutions ?? [])]) segments.push({exam: e.id, seg});
  if (e.sourcePdf) pdfs.push({exam: e.id, url: e.sourcePdf.url, sha256: e.sourcePdf.sha256});
  if (e.mtmDocuments) for (const d of [e.mtmDocuments.questions, e.mtmDocuments.solutions]) pdfs.push({exam: e.id, url: d.url, sha256: d.sha256});
}
const external = [...new Set(pdfs.filter(p => !p.url.startsWith('/')).map(p => `${p.exam} -> ${new URL(p.url).host}`))];

test('Mảnh ảnh đề/lời giải: có tệp trong public/practice-media/source-crops và đúng SHA-256', () => {
  const bad = segments.filter(({seg}) => sha(join(root, 'public/practice-media/source-crops', seg.path)) !== seg.sha256.toLowerCase())
    .map(({exam, seg}) => `${exam}: ${seg.path}`);
  assert.ok(segments.length > 0);
  assert.deepEqual([...new Set(bad)].slice(0, 20), []);
});
test('PDF nội bộ /exam-assets và /qa-exam-assets: có tệp và đúng SHA-256 (tên tệp là hash)', () => {
  const bad = pdfs.filter(p => p.url.startsWith('/')).filter(p => sha(join(root, 'public', p.url)) !== p.sha256.toLowerCase()).map(p => `${p.exam}: ${p.url}`);
  assert.deepEqual([...new Set(bad)], []);
});
test('PDF ở máy chủ ngoài chỉ được dùng https (danh sách ghi vào báo cáo, DL-12 sẽ chép về)', () => {
  assert.ok(pdfs.filter(p => !p.url.startsWith('/')).every(p => p.url.startsWith('https://')));
});
test('DL-12: không còn đề nào tải PDF từ kho GitHub cũ; 2 đề Thi thử dùng /exam-assets đúng SHA-256', () => {
  assert.deepEqual(pdfs.filter(p => p.url.includes('githubusercontent.com')).map(p => p.exam), []);
  for (const id of ['mtm-g11-gk1-2024-2025-code101', 'mtm-g12-gk1-2025-2026-code1201']) {
    const pdf = pdfs.find(p => p.exam === id)!;
    assert.equal(pdf.url, `/exam-assets/${pdf.sha256}.pdf`);
    assert.equal(sha(join(root, 'public', pdf.url)), pdf.sha256);
  }
});
test('KT-20: Cache-Control lâu dài đúng hai phạm vi đã duyệt: bundle /assets và PDF tên SHA-256', () => {
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {headers?: {source: string; headers: {key: string; value: string}[]}[]};
  const cached = vercel.headers!.filter(rule=>rule.headers.some(h=>h.key.toLowerCase()==='cache-control'&&(/immutable/i.test(h.value)||/max-age\s*=\s*[1-9]/i.test(h.value))));
  assert.deepEqual(cached.map(rule=>rule.source).sort(), ['/assets/(.*)', '/exam-assets/:file([0-9a-f]{64}\\.pdf)'].sort(), 'chỉ hai phạm vi cache đã duyệt; không cache trang riêng');
  assert.deepEqual(cached.find(rule=>rule.source==='/assets/(.*)')!.headers, [{key: 'Cache-Control', value: 'public, max-age=31536000, immutable'}]);
  assert.equal(existsSync(join(root, 'public/assets')), false, 'Không chép tệp tên cố định vào phạm vi /assets immutable do Vite quản lý');
  const rule = cached.find(rule=>rule.source.startsWith('/exam-assets/'))!;
  assert.equal(rule.source, '/exam-assets/:file([0-9a-f]{64}\\.pdf)');
  assert.deepEqual(rule.headers, [{key: 'Cache-Control', value: 'public, max-age=31536000, immutable'}]);
  const pattern = /^[0-9a-f]{64}\.pdf$/;
  const files = readdirSync(join(root, 'public/exam-assets'));
  assert.ok(files.length > 0);
  // Tên tệp khớp luật thì nội dung phải đúng SHA-256 của tên: đổi nội dung bắt buộc đổi tên, nên giữ lâu không phục vụ nhầm bản cũ.
  for (const f of files.filter(f => pattern.test(f))) assert.equal(sha(join(root, 'public/exam-assets', f)), f.slice(0, 64), f);
});

finish({segments: segments.length, uniqueFiles: cache.size, localPdfs: pdfs.filter(p => p.url.startsWith('/')).length, externalPdfs: external});
