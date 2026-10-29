// KT-05: cổng kiểm cấu trúc đề và thử biến đổi validator (ca hỏng phải bị chặn). DL-04 nằm ở exams-ids.test.mts.
// Chỉ đọc dữ liệu đề trong src/, không sửa. Không dùng dữ liệu học sinh.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {validatePracticeExam, readyExams, PRACTICE_EXAMS, type PracticeExam} from '../src/native/exams/data';
import {validateAssessment} from '../src/native/exams/assessment';
import {practiceVersion, historyVersions, PRACTICE_ERRATA} from '../src/native/exams/practice-errata';
import exactTests from '../src/native/chapters/exact-tests.json';
import probabilityTests from '../src/native/chapters/probability-tests.json';
import practiceTests from '../src/native/chapters/practice-tests.json';
import archivedTests from '../src/native/chapters/archived-tests.json';
import catalog from '../src/native/exams/catalog.json';
import {suite} from './exams-harness.mts';

const {test, finish} = suite('V');
type Item = {exam: PracticeExam};
const stores: Record<string, PracticeExam[]> = {
  'exams/catalog.json (Thi thử)': catalog as unknown as PracticeExam[],
  'chapters/exact-tests.json (đề nguồn Drive)': (exactTests as unknown as Item[]).map(p => p.exam),
  'chapters/probability-tests.json (ba chương xác suất)': (probabilityTests as unknown as Item[]).map(p => p.exam),
  'chapters/practice-tests.json (ngân hàng cũ)': (practiceTests as unknown as Item[]).map(p => p.exam),
  'chapters/archived-tests.json (bản lưu trữ)': (archivedTests as unknown as Item[]).map(p => p.exam),
};
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** 5 đề V53 cũ: không được sửa. Dấu vân tay = SHA-256 của JSON.stringify(exam) lúc chốt Đợt 1 (2e88f47). */
const V53: Record<string, string> = {
  'mtm-drive-g10-c1-t02-mtm-errata-v1': '155704fc62b93d9804f4b6f8f708c5caa0a98506bc532451fff1e5b7a7903ab2',
  'mtm-drive-g10-c1-t04-mtm-errata-v1': '84eeb894e0320b3f699b8a9aa3e7b91ca9d229713ad73adb17e033451285d85c',
  'mtm-drive-g10-c1-t06-mtm-errata-v1': 'fcba7ee874ef24ed2762c53212f1d17fd5dc0d640b37891e3f4ad803b7b36bfa',
  'mtm-drive-g11-c1-t01-mtm-errata-v1': 'b7b182dcd14defbb818e1084fa36ca99cd4a24fe1bb4ceed0ca99a8b62164ed8',
  'mtm-drive-g12-c1-t01-mtm-errata-v1': 'e5723fca6153299191108375f88d9bae078161df120528476684868e55e9fa36',
};

// ---------- Toàn bộ đề hiện có qua validator ----------
const counts: Record<string, number> = {};
for (const [name, exams] of Object.entries(stores)) {
  counts[name] = exams.length;
  test(`${name}: có đề và mọi đề qua validatePracticeExam`, () => {
    assert.ok(exams.length > 0, 'kho rỗng');
    const bad = exams.map(e => ({id: e?.id, r: validatePracticeExam(e)})).filter(x => !x.r.valid);
    assert.deepEqual(bad.map(x => `${x.id}: ${x.r.errors.slice(0, 3).join('; ')}`), []);
  });
}
test('Thi thử: readyExams giữ đủ mọi đề của catalog (không đề nào bị loại âm thầm)', () => {
  assert.equal(readyExams(PRACTICE_EXAMS).length, PRACTICE_EXAMS.length);
});
test('Hai bản đính chính v37 hợp lệ, id và hash riêng, bản gốc vẫn hợp lệ', () => {
  for (const e of PRACTICE_ERRATA) {
    const base = PRACTICE_EXAMS.find(x => x.id === e.baseId);
    assert.ok(base, 'thiếu đề gốc ' + e.baseId);
    assert.equal(base!.versionHash, e.baseVersionHash);
    const revised = practiceVersion(base!);
    assert.equal(revised.id, e.id); assert.equal(revised.versionHash, e.versionHash);
    assert.notEqual(revised.versionHash, base!.versionHash);
    assert.ok(validatePracticeExam(revised).valid);
  }
  assert.equal(historyVersions(PRACTICE_EXAMS).length, PRACTICE_EXAMS.length + PRACTICE_ERRATA.length);
});

// ---------- 5 đề V53 ----------
const exactById = new Map((exactTests as unknown as Item[]).map(p => [p.exam.id, p.exam]));
// Main V69–V76 đã thay PDF mtmDocuments. Vẫn kiểm hash nội dung V53 cũ,
// đồng thời kiểm toàn bộ đề hiện tại đúng bản main V76, không nới kiểm câu hỏi/đáp án.
const exactAt=(revision:string)=>JSON.parse(execFileSync('git',['show',`${revision}:src/native/chapters/exact-tests.json`],{
  cwd:process.env.MTM_ROOT,encoding:'utf8',maxBuffer:32*1024*1024,
})) as Item[];
const originalV53=new Map(exactAt('2e88f47').map(p=>[p.exam.id,p.exam]));
const mainV76=new Map(exactAt('ae7b30e').map(p=>[p.exam.id,p.exam]));
for (const [id, fingerprint] of Object.entries(V53)) {
  test(`V53 ${id}: có mặt, hợp lệ, dữ liệu không đổi (SHA-256)`, () => {
    const exam = exactById.get(id);
    assert.ok(exam, 'không thấy đề V53');
    assert.ok(validatePracticeExam(exam).valid, validatePracticeExam(exam).errors.join('; '));
    assert.equal(exam!.questions.length, 22);
    assert.deepEqual(exam,mainV76.get(id),'đề phải giữ nguyên bản main V76');
    const original=originalV53.get(id)!;
    assert.ok(original,'phải có mốc V53 gốc');
    const withOriginalDocuments={...exam,mtmDocuments:original.mtmDocuments};
    assert.equal(createHash('sha256').update(JSON.stringify(withOriginalDocuments)).digest('hex'), fingerprint, 'nội dung đề V53 ngoài PDF mtmDocuments đã bị thay đổi');
  });
}

// ---------- KT-05: ca biến đổi phải bị chặn ----------
const sample = (exactTests as unknown as Item[]).find(p => p.exam.id === 'mtm-drive-g12-c3-t04-mtm-errata-v64')!.exam;
const catalogSample = PRACTICE_EXAMS.find(e => e.id === 'mtm-g12-gk1-2025-2026-code1201')!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mut = (e: any) => void;
const mutations: [string, PracticeExam, Mut][] = [
  ['sai sourceHash (63 ký tự)', sample, e => { e.sourceHash = e.sourceHash.slice(1); }],
  ['sai versionHash (ký tự ngoài hex)', sample, e => { e.versionHash = 'z' + e.versionHash.slice(1); }],
  ['sai hash một mảnh ảnh câu', sample, e => { e.questions[0].sourceContent.questions[0].sha256 = 'x'.repeat(64); }],
  ['mảnh lời giải trùng hash mảnh đề', sample, e => { e.questions[0].sourceContent.solutions[0].sha256 = e.questions[0].sourceContent.questions[0].sha256; }],
  ['sai hash PDF đề (Thi thử)', catalogSample, e => { e.sourcePdf.sha256 = e.sourcePdf.sha256.slice(2); }],
  ['đường dẫn PDF nội bộ không khớp hash', catalogSample, e => { e.sourcePdf.url = String(e.sourcePdf.url).startsWith('/') ? '/exam-assets/' + '0'.repeat(64) + '.pdf' : 'http://insecure.example/de.pdf'; }],
  ['thiếu 1 ý Đ/S trong đáp án', sample, e => { e.questions[12].answer = e.questions[12].answer.slice(0, 3); }],
  ['thang Đ/S thiếu mức', sample, e => { e.questions[12].pointsByCorrectCount = [0, 100, 250, 1000]; }],
  ['thang Đ/S không tăng dần', sample, e => { e.questions[12].pointsByCorrectCount = [0, 250, 100, 500, 1000]; }],
  ['trùng ID câu', sample, e => { e.questions[1].id = e.questions[0].id; }],
  ['ID đề trùng từ dành riêng "history"', sample, e => { e.id = 'history'; }],
  ['tổng khác 10 điểm (một câu TN 0,3 điểm)', sample, e => { e.questions[0].maxMillipoints = 300; }],
  ['tổng khác 10 điểm (bớt một câu, sửa questionCount)', sample, e => { e.questions.pop(); e.questionCount = 21; }],
  ['questionCount không khớp số câu', sample, e => { e.questionCount = 23; }],
  ['đổi thứ tự phần (TN đứng sau Đ/S)', sample, e => { const t = e.questions[11]; e.questions[11] = e.questions[12]; e.questions[12] = t; }],
  ['đáp án TN ngoài A-D', sample, e => { e.questions[0].answer = 'E'; }],
  ['đáp án ngắn sai định dạng số', sample, e => { e.questions[16].acceptedAnswers = ['1/2']; }],
  ['đáp án ngắn trùng nhau sau chuẩn hoá', sample, e => { e.questions[16].acceptedAnswers = ['17', '17,0']; }],
  ['chưa xác minh đáp án', sample, e => { e.answerKeyVerified = false; }],
  ['chưa xác minh hiển thị đề', sample, e => { e.questionDisplayVerified = false; }],
  ['thời lượng 0 phút', sample, e => { e.durationMinutes = 0; }],
  ['lớp ngoài 10-12', sample, e => { e.grade = 9; }],
  ['thiếu cả mảnh ảnh lẫn chữ đề', sample, e => { delete e.questions[0].sourceContent; }],
  ['đường dẫn ảnh có ..', sample, e => { e.questions[0].sourceContent.questions[0].path = '../x.png'; }],
];
test('Mẫu gốc của ca biến đổi hợp lệ trước khi biến đổi', () => {
  assert.ok(validatePracticeExam(sample).valid); assert.ok(validatePracticeExam(catalogSample).valid);
});
for (const [name, base, mutate] of mutations) {
  test(`Biến đổi bị chặn: ${name}`, () => {
    const e = clone(base); mutate(e);
    const r = validatePracticeExam(e);
    assert.equal(r.valid, false, 'validator vẫn cho qua');
    assert.ok(r.errors.length > 0);
    assert.equal(readyExams([e]).length, 0, 'readyExams vẫn mở đề hỏng');
  });
}
test('validateAssessment (lõi chung) chặn tổng khác 10 điểm và trùng ID câu', () => {
  const e = clone(sample) as unknown as {questions: {id: string; maxMillipoints: number}[]};
  e.questions[0].maxMillipoints = 251;
  assert.ok(validateAssessment(e).errors.includes('exam: total must equal 10000 millipoints'));
  const d = clone(sample) as unknown as {questions: {id: string}[]};
  d.questions[1].id = d.questions[0].id;
  assert.ok(validateAssessment(d).errors.some(x => x.includes('duplicate id')));
});

finish({counts});
