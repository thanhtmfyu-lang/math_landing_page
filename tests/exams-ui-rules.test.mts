// Đợt 2 (claude/sua-loi-luyen-thi): test các quy tắc hiển thị thuần của màn luyện tập/thi thử.
// Chỉ dữ liệu đề có sẵn và câu trả lời tổng hợp; không dữ liệu học sinh, không đổi luật chấm.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {resultFor} from '../src/native/exams/result';
import {createDraft, submitDraft, validateDraft, isAnswered, type Answers, type Draft, type Response} from '../src/native/exams/store';
import {answerState, displayKeyAnswer, draftExportFile, pendingQuestions, questionLabel, shortAnswerStatus, shortFormatMessage, visibleBuckets} from '../src/native/exams/attempt-ui';
import {canonicalNumeric, canonicalRational} from '../src/native/exams/assessment';
import {GRADES, PERIODS, PRACTICE_EXAMS, readFilters, filterSearch, readyExams, type PracticeExam, type PracticeQuestion} from '../src/native/exams/data';
import {awaitingReview, historyOnlyAttempt, isWarmup, shelfVisible, WARMUP_LABEL} from '../src/native/chapters/library-rules';
import {FakeStore} from './exams-harness.mts';
import {readHistory, saveDraft, draftKey} from '../src/native/exams/store';
import practiceTests from '../src/native/chapters/practice-tests.json';
import exactTests from '../src/native/chapters/exact-tests.json';
import {HIDDEN_SNAPSHOT_EXAMS, nativeRouteKnown, publicSnapshot} from '../src/native/model';
import {routeMetadata} from '../src/migration/route-policy';
import {suite} from './exams-harness.mts';

const {test, finish} = suite('U');
const T0 = Date.UTC(2026, 9, 14, 1, 0, 0);
const exam1201 = PRACTICE_EXAMS.find(e => e.id === 'mtm-g12-gk1-2025-2026-code1201')!;
const firstShort = (exam: PracticeExam, mode: string) => exam.questions.find(q => q.kind === 'short' && q.mode === mode) as Extract<PracticeQuestion, {kind: 'short'}>;
function submitted(exam: PracticeExam, answers: Answers): Draft {
  const made = createDraft(exam, 'synthetic-ui-1', T0);
  assert.ok(made.ok);
  const next = validateDraft({...made.value, answers, updatedAt: T0 + 1000, revision: 1}, exam);
  assert.ok(next.ok);
  const done = submitDraft(exam, next.value, T0 + 60000);
  assert.ok(done.ok);
  return done.value;
}

// ---------- LT-02: báo định dạng ngay, tách "đã nhập" và "hợp lệ" ----------
test('LT-02: câu numeric nhận số thập phân phẩy/chấm, báo sai với 1/2, abc, 1e3, biểu thức', () => {
  for (const ok of ['0,5', '0.5', '-2,75', '17', '+3', '4,0']) assert.equal(shortAnswerStatus('numeric', ok), 'valid', ok);
  for (const bad of ['1/2', 'abc', '1e3', '2+3', '1,000.5', '0,5 cm', '½']) assert.equal(shortAnswerStatus('numeric', bad), 'invalid', bad);
  for (const empty of ['', '   ', undefined, null, ['x']]) assert.equal(shortAnswerStatus('numeric', empty), 'empty');
});
test('LT-02: câu rational vẫn nhận -3/4 và số thập phân; exact có chữ là hợp lệ', () => {
  for (const ok of ['-3/4', '3/-4', '0,75', '2']) assert.equal(shortAnswerStatus('rational', ok), 'valid', ok);
  for (const bad of ['3/0', 'a/b', '1/2/3']) assert.equal(shortAnswerStatus('rational', bad), 'invalid', bad);
  assert.equal(shortAnswerStatus('exact', 'ABC'), 'valid');
  assert.equal(shortAnswerStatus('exact', ' '), 'empty');
});
test('LT-02: "sai định dạng" ở giao diện khớp đúng câu resultFor chấm 0 điểm vì định dạng', () => {
  const shorts = exam1201.questions.filter(q => q.kind === 'short');
  const values = ['1/2', '0,41', 'abc', '1e3', '', '4,5'];
  const answers: Answers = Object.fromEntries(shorts.map((q, i) => [q.id, values[i]]));
  const result = resultFor(exam1201, submitted(exam1201, answers))!;
  const invalidUi = shorts.filter(q => answerState(exam1201, q, answers) === 'invalid').map(q => q.id);
  assert.deepEqual(invalidUi, result.invalidNumeric);
  assert.equal(invalidUi.length, 3);
});
test('LT-02: ô số câu không còn tô "đã trả lời" khi nhập 1/2 (luật lưu cũ isAnswered vẫn giữ nguyên)', () => {
  const q = firstShort(exam1201, 'numeric');
  const answers: Answers = {[q.id]: '1/2'};
  assert.equal(isAnswered(exam1201, q.id, answers), true, 'store.isAnswered không đổi');
  assert.equal(answerState(exam1201, q, answers), 'invalid');
  assert.equal(answerState(exam1201, q, {[q.id]: '0,5'}), 'answered');
  assert.equal(answerState(exam1201, q, {}), 'blank');
});
test('LT-02: Đ/S và trắc nghiệm giữ đúng quy tắc cũ (Đ/S đủ 4 ý mới là đã trả lời)', () => {
  const tf = exam1201.questions.find(q => q.kind === 'tf')!, mc = exam1201.questions.find(q => q.kind === 'mc')!;
  assert.equal(answerState(exam1201, tf, {[tf.id]: [true, false, null, true]}), 'partial', 'Đ/S làm 3/4 ý không gọi là trống (review Codex)');
  assert.equal(answerState(exam1201, tf, {[tf.id]: [null, null, null, null]}), 'blank');
  assert.equal(answerState(exam1201, tf, {[tf.id]: [true, false, false, true]}), 'answered');
  assert.equal(answerState(exam1201, mc, {[mc.id]: 'C'}), 'answered');
  assert.equal(answerState(exam1201, mc, {[mc.id]: null}), 'blank');
});
test('LT-02: lời báo nêu rõ quy tắc và hậu quả, không chứa đáp án', () => {
  const q = firstShort(exam1201, 'numeric');
  const message = shortFormatMessage('numeric');
  assert.match(message, /1\/2/);
  assert.match(message, /0 điểm/);
  for (const accepted of q.acceptedAnswers) assert.ok(!message.includes(accepted) || /^\d$/.test(accepted), 'lộ đáp án ' + accepted);
  assert.match(shortFormatMessage('rational'), /-3\/4/);
});

// ---------- TT-01 (phần hộp nộp): liệt kê đúng câu trống/sai định dạng, nhảy đúng câu ----------
test('TT-01: hộp nộp liệt kê đúng câu trống và sai định dạng, theo thứ tự, kèm vị trí câu để nhảy tới', () => {
  const q = exam1201.questions;
  const answers: Record<string, Response> = {};
  q.forEach((item, i) => {
    if (item.kind === 'mc') answers[item.id] = (item as {answer: string}).answer as 'A';
    if (item.kind === 'tf') answers[item.id] = [true, true, true, true];
    if (item.kind === 'short') answers[item.id] = '1';
  });
  answers[q[2].id] = null;                      // trắc nghiệm câu 3 bỏ trống
  answers[q[13].id] = [true, null, true, true]; // Đ/S câu 2 thiếu 1 ý
  answers[q[18].id] = '1/2';                    // trả lời ngắn câu 3 sai định dạng
  delete answers[q[21].id];                     // trả lời ngắn câu 6 bỏ trống
  const pending = pendingQuestions(exam1201, answers);
  assert.deepEqual(pending.map(p => [p.index, p.state]), [[2, 'blank'], [13, 'partial'], [18, 'invalid'], [21, 'blank']]);
  assert.deepEqual(pending.map(p => p.label), ['I · Trắc nghiệm · Câu 3', 'II · Đúng/sai · Câu 2', 'III · Trả lời ngắn · Câu 3', 'III · Trả lời ngắn · Câu 6']);
  assert.ok(pending.every(p => exam1201.questions[p.index].id === p.id), 'chỉ số nhảy tới phải trỏ đúng câu');
});
test('TT-01: bài làm đủ thì không còn câu nào trong hộp nộp; bài trống liệt kê đủ 22 câu', () => {
  assert.equal(pendingQuestions(exam1201, {}).length, exam1201.questions.length);
  const full: Answers = Object.fromEntries(exam1201.questions.map(item => [item.id, item.kind === 'tf' ? [false, false, false, false] : item.kind === 'mc' ? 'B' : '2,5']));
  assert.deepEqual(pendingQuestions(exam1201, full), []);
});
test('TT-01: nhãn câu theo phần cũng đúng cho bài HSA/TSA cấu trúc riêng (3/1/2 câu)', () => {
  const flexible = {questions: new Array(6).fill({kind: 'mc'}), sections: [{label: 'I · Trắc nghiệm', kind: 'mc' as const, count: 3}, {label: 'II · Đúng/Sai', kind: 'tf' as const, count: 1}, {label: 'III · Trả lời ngắn', kind: 'short' as const, count: 2}]} as unknown as PracticeExam;
  assert.equal(questionLabel(flexible, 3).full, 'II · Đúng/Sai · Câu 1');
  assert.equal(questionLabel(flexible, 5).full, 'III · Trả lời ngắn · Câu 2');
  assert.equal(questionLabel(flexible, 9).full, 'Câu 10');
});

// ---------- TT-12: ẩn ô kỳ 0 đề, URL cũ ?ky= vẫn chạy ----------
test('TT-12: chỉ hiện ô có đề; mọi ô hiện ra có số đề > 0 và tổng khớp số đề mở', () => {
  const ready = readyExams(PRACTICE_EXAMS);
  const shown = visibleBuckets(ready, GRADES, PERIODS, {grade: 'all', period: 'all'});
  assert.ok(shown.length > 0 && shown.length < GRADES.length * PERIODS.length, 'phải ẩn bớt ô 0 đề');
  assert.ok(shown.every(b => b.count > 0));
  assert.equal(shown.reduce((s, b) => s + b.count, 0), ready.length);
});
test('TT-12: URL cũ ?lop=12&ky=CK1 vẫn đọc được bộ lọc, ô đang chọn vẫn hiện dù 0 đề', () => {
  const filters = readFilters('?lop=12&ky=CK1&q=');
  assert.equal(filters.ky, 'CK1');
  assert.equal(filters.lop, '12');
  assert.equal(filterSearch(filters), '?lop=12&ky=CK1');
  const ready = readyExams(PRACTICE_EXAMS);
  const zero = ready.filter(e => e.grade === 12 && e.period === 'CK1').length;
  const shown = visibleBuckets(ready, GRADES, PERIODS, {grade: 12, period: 'CK1'});
  const selected = shown.find(b => b.grade === 12 && b.period === 'CK1');
  assert.ok(selected, 'ô đang chọn phải hiện');
  assert.equal(selected!.count, zero);
});

// ---------- TH-07: một kiểu đánh số theo phần, đáp án số hiện dấu phẩy ----------
test('TH-07: nhãn câu ở xem lại trùng với phiếu trả lời (I/II/III, đánh số lại từ 1 mỗi phần)', () => {
  assert.equal(questionLabel(exam1201, 0).full, 'I · Trắc nghiệm · Câu 1');
  assert.equal(questionLabel(exam1201, 12).full, 'II · Đúng/sai · Câu 1');
  assert.equal(questionLabel(exam1201, 21).full, 'III · Trả lời ngắn · Câu 6');
});
test('TH-07: đáp án thập phân hiện dấu phẩy, giá trị không đổi; phân số và mode exact giữ nguyên', () => {
  assert.equal(displayKeyAnswer('numeric', '0.5'), '0,5');
  assert.equal(displayKeyAnswer('numeric', '-4.47'), '-4,47');
  assert.equal(displayKeyAnswer('numeric', '1012'), '1012');
  assert.equal(displayKeyAnswer('rational', '-3/4'), '-3/4');
  assert.equal(displayKeyAnswer('exact', 'x.y'), 'x.y');
  assert.equal(displayKeyAnswer('exact', '2.5'), '2.5');
  // Mọi đáp án số của toàn bộ đề hiện bằng dấu phẩy vẫn được lõi chấm hiểu đúng như bản gốc.
  for (const exam of PRACTICE_EXAMS) for (const q of exam.questions) if (q.kind === 'short' && q.mode !== 'exact') for (const key of q.acceptedAnswers) {
    const shown = displayKeyAnswer(q.mode, key);
    const canon: (v: string) => string | null = q.mode === 'numeric' ? canonicalNumeric : canonicalRational;
    assert.equal(canon(shown), canon(key), exam.id + ' ' + key);
    assert.ok(!/^[+-]?\d+\.\d+$/.test(shown), 'còn dấu chấm: ' + shown);
  }
});

// ---------- DL-08: đổi chữ/vị trí nút, tệp tải về giữ y hệt ----------
test('DL-08: tệp "Tải bản lưu bài làm" giống từng byte cách xuất cũ, với bài dở thật định dạng V67', () => {
  const fixture = JSON.parse(readFileSync(join(process.env.MTM_ROOT ?? process.cwd(), 'tests/fixtures/lich-su-v67.json'), 'utf8')) as {localStorage: Record<string, string>};
  const raw = fixture.localStorage['mtm:exam:v1:mtm-drive-g12-c1-t01-mtm-errata-v1'];
  const draft = JSON.parse(raw) as Draft;
  const file = draftExportFile(draft);
  // Công thức cũ trong PracticeAttempt.tsx tại f790f85 (exportDraft):
  assert.equal(file.text, JSON.stringify(draft, null, 2));
  assert.equal(file.name, `bai-lam-${draft.examId}-${draft.startedAt}.json`);
  assert.deepEqual(JSON.parse(file.text), JSON.parse(raw), 'đọc lại tệp phải ra đúng bản nháp');
});

// ---------- QT-01: gỡ lối vào quản trị khỏi trang học sinh, trang quản trị vẫn có đường dẫn ----------
test('QT-01: /thi-thu không còn nút "Quản trị đề thi"; App vẫn mở /quan-tri/de-thi', () => {
  const root = process.env.MTM_ROOT ?? process.cwd();
  const exams = readFileSync(join(root, 'src/native/NativeExams.tsx'), 'utf8');
  assert.ok(!exams.includes('/quan-tri/de-thi'), 'NativeExams còn link quản trị');
  assert.ok(!exams.includes('Quản trị đề thi'));
  const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
  assert.ok(app.includes("path==='/quan-tri/de-thi'?<AdminExams/>"), 'App không còn route quản trị');
});

// ---------- DL-06: nhãn bài làm quen HSA/TSA ----------
type BankRow = {track: string; reviewStatus?: string; exam: PracticeExam};
const bankRows = [...practiceTests, ...exactTests] as unknown as BankRow[];
test('DL-06: đúng 2 bài HSA/TSA 6 câu mang nhãn "Bài làm quen, chưa phải đề thi"; đề 22 câu không mang nhãn', () => {
  const warm = bankRows.filter(isWarmup);
  assert.deepEqual(warm.map(p => p.exam.id).sort(), ['mtm-preview-practice-hsa-01-v1', 'mtm-preview-practice-tsa-01-v1']);
  assert.ok(warm.every(p => p.exam.questions.length === 6));
  assert.ok(bankRows.filter(p => p.exam.questions.length === 22).every(p => !isWarmup(p)));
  assert.equal(WARMUP_LABEL, 'Bài làm quen, chưa phải đề thi');
});

// ---------- DL-01: ẩn lượt mới cho 22 bài chờ phản biện, lịch sử cũ vẫn xem được ----------
test('DL-01: đúng 22 bài trong practice-tests.json bị đóng lượt mới (g10-c1 và g12-c1, kể cả 2 bài kết thúc chương)', () => {
  const closed = (practiceTests as unknown as BankRow[]).filter(awaitingReview).map(p => p.exam.id).sort();
  assert.equal(closed.length, 22);
  assert.ok(closed.every(id => /^mtm-practice-g(10|12)-c1-(b\d\d|final)-v[12]$/.test(id)), closed.join(','));
  assert.equal((exactTests as unknown as BankRow[]).filter(awaitingReview).length, 0, 'đề nguồn Drive không bị đóng');
  for (const id of ['mtm-drive-g10-c1-t02', 'mtm-drive-g10-c1-t04', 'mtm-drive-g10-c1-t06', 'mtm-drive-g11-c1-t01', 'mtm-drive-g12-c1-t01'])
    assert.ok(!bankRows.some(p => p.exam.id.startsWith(id) && awaitingReview(p)), '5 đề V53 không bị ảnh hưởng: ' + id);
});
test('DL-01: kệ ẩn bài chờ phản biện khi chưa có lượt; vẫn hiện khi có bài dở hoặc lượt đã nộp', () => {
  const pending = (practiceTests as unknown as BankRow[]).find(awaitingReview)!, open = (practiceTests as unknown as BankRow[]).find(p => !awaitingReview(p))!;
  assert.equal(shelfVisible(pending, false), false);
  assert.equal(shelfVisible(pending, true), true);
  assert.equal(shelfVisible(open, false), true);
});
test('DL-01: lượt đã nộp của bài chờ phản biện vẫn đọc lại được trong lịch sử và chấm như cũ', () => {
  const pending = (practiceTests as unknown as BankRow[]).find(p => p.exam.id === 'mtm-practice-g12-c1-b01-v1')!.exam;
  const store = new FakeStore();
  const made = createDraft(pending, 'synthetic-dl01-1', T0);
  assert.ok(made.ok);
  const answered = validateDraft({...made.value, answers: {[pending.questions[0].id]: (pending.questions[0] as {answer: string}).answer as Response}, updatedAt: T0 + 1000, revision: 1}, pending);
  assert.ok(answered.ok);
  const done = submitDraft(pending, answered.value, T0 + 60000);
  assert.ok(done.ok);
  assert.ok(saveDraft(store, pending, done.value, null).ok);
  assert.ok(store.data.has(draftKey(pending.id)), 'khoá lưu cũ không đổi');
  const bank = bankRows.map(p => p.exam);
  const history = readHistory(store, bank);
  const item = history.items.find(i => i.draft.attemptId === 'synthetic-dl01-1');
  assert.ok(item, 'lịch sử phải còn lượt đã nộp');
  const result = resultFor(item!.exam, item!.draft)!;
  assert.ok(result.score.ok);
  assert.equal(result.score.ok && result.score.earnedMillipoints, pending.questions[0].maxMillipoints);
});

test('DL-01: bài chờ phản biện chỉ còn lượt trong lịch sử thì thẻ dẫn tới lượt đã nộp gần nhất (review Codex vòng 2)', () => {
  const pending = (practiceTests as unknown as BankRow[]).find(awaitingReview)!, open = (practiceTests as unknown as BankRow[]).find(p => !awaitingReview(p))!;
  const subs = [{attemptId: 'cu', submittedAt: T0}, {attemptId: 'moi', submittedAt: T0 + 5000}, {attemptId: 'giua', submittedAt: T0 + 1000}];
  assert.equal(historyOnlyAttempt(pending, false, subs), 'moi', 'lượt mới nhất');
  assert.deepEqual(subs.map(x => x.attemptId), ['cu', 'moi', 'giua'], 'không sắp xếp lại mảng gốc');
  assert.equal(historyOnlyAttempt(pending, true, subs), undefined, 'còn bản nháp hiện hành thì đi đường cũ ?id=');
  assert.equal(historyOnlyAttempt(pending, false, []), undefined);
  assert.equal(historyOnlyAttempt(open, false, subs), undefined, 'bài mở bình thường không đổi');
  const lib = readFileSync(join(process.env.MTM_ROOT ?? process.cwd(), 'src/native/chapters/PracticeShelf.tsx'), 'utf8'); // KT-06: phần thẻ bài chuyển từ PracticeLibrary.tsx sang đây
  assert.ok(lib.includes('href={cardHref(p)}') && lib.includes('href={cardHref(final)}'), 'thẻ thường và bài kết thúc chương đều dùng cardHref');
  assert.ok(lib.includes("'&luot='+encodeURIComponent(luot)"), 'dẫn tới ?luot= như danh sách lịch sử');
});

// ---------- TT-05, GD-01, GD-02, TT-14: chỉ đổi chữ/giao diện, kiểm bằng mã nguồn ----------
const src = (rel: string) => readFileSync(join(process.env.MTM_ROOT ?? process.cwd(), rel), 'utf8');
test('TT-05: Thi thử ghi "Kết quả thi thử", Luyện tập giữ "Kết quả luyện tập"', () => {
  const attempt = ['PracticeAttempt.tsx','AttemptResult.tsx','AttemptAnswerSheet.tsx'].map(f=>src('src/native/exams/'+f)).join('\n');
  assert.ok(attempt.includes("kind='practice'"), 'mặc định là luyện tập');
  assert.ok(attempt.includes("kind==='exam'?'Kết quả thi thử':'Kết quả luyện tập'"));
  assert.ok(/<PracticeAttempt key={[^}]*} kind="exam"/.test(src('src/native/NativeExams.tsx')), '/thi-thu truyền kind="exam"');
  assert.ok(!src('src/native/chapters/ChapterPractice.tsx').includes('kind="exam"'), 'Luyện tập không truyền kind="exam"');
});
test('GD-01: ý Đ/S chỉ có hai nút Đúng/Sai, bỏ chọn bằng nút "Xóa lựa chọn" riêng', () => {
  const attempt = ['PracticeAttempt.tsx','AttemptResult.tsx','AttemptAnswerSheet.tsx'].map(f=>src('src/native/exams/'+f)).join('\n');
  assert.ok(attempt.includes('{[true,false].map'), 'không còn nút thứ ba "chưa chọn"');
  assert.ok(!attempt.includes('{[true,false,null].map'));
  assert.ok(attempt.includes('Xóa lựa chọn'));
});
test('GD-02: nút rời trang ghi "Rời bài luyện" / "Rời bài thi"', () => {
  const attempt = ['PracticeAttempt.tsx','AttemptResult.tsx','AttemptAnswerSheet.tsx'].map(f=>src('src/native/exams/'+f)).join('\n');
  assert.ok(attempt.includes('Rời bài luyện') && attempt.includes('Rời bài thi'));
});
test('TT-14: sau khi nộp, cột kết quả nằm trên đề và giãn đủ bề ngang', () => {
  const css = src('src/native/exams/exams.css');
  assert.ok(css.includes('.ep-exam-layout.ep-submitted{display:flex;flex-direction:column;align-items:stretch'));
  assert.ok(css.includes('.ep-submitted .ep-answer-pane{order:-1'));
});

// ---------- Đề metadata rác "uyuyuyuyuyu": ẩn khỏi giao diện, giữ URL ----------
test('Đề rác: chỉ ẩn đúng 1 mục tên "uyuyuyuyuyu"; URL vẫn mở (không 404), tiêu đề trang không lộ tên rác', () => {
  const junk = publicSnapshot.exams.filter(e => HIDDEN_SNAPSHOT_EXAMS.has(e.id));
  assert.deepEqual(junk.map(e => e.title), ['uyuyuyuyuyu']);
  const path = '/thi-thu/' + junk[0].id;
  assert.equal(nativeRouteKnown(path, ''), true, 'URL cũ phải còn mở');
  const meta = routeMetadata(path, 'www.minhthanhmath.vn');
  assert.ok(meta.known);
  assert.ok(!meta.title.includes('uyuy'), meta.title);
  assert.equal(meta.robots, 'noindex, follow');
  for (const e of publicSnapshot.exams.filter(x => !HIDDEN_SNAPSHOT_EXAMS.has(x.id))) assert.ok(routeMetadata('/thi-thu/' + e.id, 'www.minhthanhmath.vn').title.startsWith(e.title), e.id);
});

// ---------- KT-06 (Đợt 3): khung trang Luyện tập không nhập tĩnh ngân hàng đề ----------
test('KT-06: PracticeLibrary.tsx không nhập tĩnh JSON đề; ngân hàng đề chỉ nạp qua import() động', () => {
  // Chỉ xét các dòng import (chú thích được phép nhắc tên tệp).
  const imports = (rel: string) => src(rel).split(/\r?\n/).filter(l => /^\s*import\s/.test(l)).join('\n');
  const shell = imports('src/native/chapters/PracticeLibrary.tsx'), shared = imports('src/native/chapters/practice-shared.ts');
  for (const f of ['practice-tests.json', 'exact-tests.json', 'archived-tests.json', 'practice-bank', "from './PracticeShelf'"]) assert.ok(!shell.includes(f), 'khung trang không được nhập ' + f);
  // Khung trang nhập tĩnh ChapterPractice để giữ thứ tự CSS như trước; ChapterPractice không được kéo ngân hàng đề vào.
  assert.ok(shell.includes("import './ChapterPractice';"), 'giữ thứ tự CSS: nhập tĩnh ChapterPractice');
  const cp = imports('src/native/chapters/ChapterPractice.tsx');
  for (const f of ['practice-tests.json', 'exact-tests.json', 'archived-tests.json', 'practice-bank', 'PracticeShelf', 'PracticeLibrary']) assert.ok(!cp.includes(f), 'ChapterPractice không được nhập ' + f);
  for (const f of ['practice-tests.json', 'exact-tests.json', 'archived-tests.json', 'practice-bank', 'PracticeShelf']) assert.ok(!shared.includes(f), 'practice-shared không được nhập ' + f);
  assert.equal(shared.match(/from '\.\/ChapterPractice'/g)?.length, 1);
  assert.ok(shared.includes("import type {PracticeBankItem} from './ChapterPractice'"), 'practice-shared chỉ nhập KIỂU từ ChapterPractice');
  assert.ok(src('src/native/chapters/PracticeLibrary.tsx').includes("import('./PracticeShelf')"), 'ngân hàng đề nạp bằng import() động');
  const bankSrc = src('src/native/chapters/practice-bank.ts');
  for (const f of ['practice-tests.json', 'exact-tests.json', 'archived-tests.json']) assert.ok(bankSrc.includes(f), 'practice-bank vẫn đọc ' + f);
});

test('KT-06: danh sách bài không kẹt khi requestAnimationFrame không chạy (có hẹn giờ dự phòng)', () => {
  const lib = src('src/native/chapters/PracticeLibrary.tsx');
  const hook = lib.slice(lib.indexOf('function useAfterFirstPaint'), lib.indexOf('export default function PracticeLibrary'));
  assert.ok(hook.includes('requestAnimationFrame(go)'), 'vẫn chờ một khung hình khi trình duyệt vẽ bình thường');
  assert.ok(/const fallback=window\.setTimeout\(go,\d+\)/.test(hook), 'có hẹn giờ dự phòng gọi cùng hàm go');
  assert.ok(hook.includes('window.clearTimeout(fallback)') && hook.includes('cancelAnimationFrame(frame)'), 'dọn cả khung hình lẫn hẹn giờ');
});

finish();
