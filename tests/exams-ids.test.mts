// DL-04: kiểm ID trùng giữa các kho đề và phiên bản (Thi thử, đề nguồn Drive, ngân hàng cũ, bản lưu trữ,
// bản đính chính v37). Id trùng làm hai đề dùng chung khoá bản nháp mtm:exam:v1:<id>. Chỉ đọc, không tự đổi ID.
import assert from 'node:assert/strict';
import {readyExams, PRACTICE_EXAMS, type PracticeExam} from '../src/native/exams/data';
import {PRACTICE_ERRATA} from '../src/native/exams/practice-errata';
import exactTests from '../src/native/chapters/exact-tests.json';
import probabilityTests from '../src/native/chapters/probability-tests.json';
import practiceTests from '../src/native/chapters/practice-tests.json';
import archivedTests from '../src/native/chapters/archived-tests.json';
import catalog from '../src/native/exams/catalog.json';
import {suite} from './exams-harness.mts';

const {test, finish} = suite('I');
type Item = {exam: PracticeExam};
const stores: Record<string, PracticeExam[]> = {
  'exams/catalog.json (Thi thử)': catalog as unknown as PracticeExam[],
  'chapters/exact-tests.json (đề nguồn Drive)': (exactTests as unknown as Item[]).map(p => p.exam),
  'chapters/probability-tests.json (ba chương xác suất)': (probabilityTests as unknown as Item[]).map(p => p.exam),
  'chapters/practice-tests.json (ngân hàng cũ)': (practiceTests as unknown as Item[]).map(p => p.exam),
  'chapters/archived-tests.json (bản lưu trữ)': (archivedTests as unknown as Item[]).map(p => p.exam),
};
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const sharedIds: string[] = [];

test('Trong mỗi kho, id đề không trùng; id câu không trùng trong đề', () => {
  const problems: string[] = [];
  for (const [name, exams] of Object.entries(stores)) {
    const seen = new Map<string, number>();
    exams.forEach((e, i) => { if (seen.has(e.id)) problems.push(`${name}: "${e.id}" ở vị trí ${seen.get(e.id)} và ${i}`); else seen.set(e.id, i); });
    for (const e of exams) { const q = e.questions.map(x => x.id); if (new Set(q).size !== q.length) problems.push(`${name}: đề ${e.id} có id câu trùng`); }
  }
  assert.deepEqual(problems, []);
});
test('Giữa các kho: id trùng chỉ được phép khi là cùng một đề y hệt (bản lưu trữ HSA/TSA), không trùng với Thi thử', () => {
  const owners = new Map<string, {store: string; exam: PracticeExam}[]>();
  for (const [store, exams] of Object.entries(stores)) for (const exam of exams) owners.set(exam.id, [...(owners.get(exam.id) ?? []), {store, exam}]);
  for (const e of PRACTICE_ERRATA) owners.set(e.id, [...(owners.get(e.id) ?? []), {store: 'practice-errata.ts', exam: {id: e.id} as PracticeExam}]);
  // Phần quyết định chấm và bản nháp: id, versionHash, rubricVersion, thời lượng, câu hỏi/đáp án.
  const gradingPart = (e: PracticeExam) => JSON.stringify([e.id, e.versionHash, e.rubricVersion, e.durationMinutes, e.questions]);
  const conflicts: string[] = [];
  for (const [id, list] of owners) {
    if (list.length < 2) continue;
    const thiThu = list.some(x => x.store.startsWith('exams/') || x.store === 'practice-errata.ts');
    const same = list.every(x => gradingPart(x.exam) === gradingPart(list[0].exam));
    if (thiThu || !same) conflicts.push(`${id}: ${list.map(x => `${x.store}#${x.exam.versionHash?.slice(0, 8) ?? '-'}`).join(' | ')}`);
    else sharedIds.push(`${id} (${list.every(x => JSON.stringify(x.exam) === JSON.stringify(list[0].exam)) ? 'giống hệt' : 'cùng đề và đáp án, khác chữ mô tả'})`);
  }
  assert.deepEqual(conflicts, [], 'id trùng có thể ghi đè bản nháp mtm:exam:v1:<id> của nhau');
  // Ghi lại hiện trạng: 2 bài xem thử HSA/TSA có ở cả ngân hàng cũ và bản lưu trữ, cùng hash và câu hỏi;
  // sourceMaterial.version của bản lưu trữ có thêm " · PC-only". PracticeLibrary bỏ bản lưu trữ khi id đã có
  // trong ngân hàng hiện hành, nên không có xung đột khi chạy. Id trùng mới phải được xem lại.
  assert.deepEqual(sharedIds.map(x => x.split(' ')[0]).sort(), ['mtm-preview-practice-hsa-01-v1', 'mtm-preview-practice-tsa-01-v1']);
});
test('Đề trong kho tĩnh không dùng tiền tố mtm-custom- (dành cho đề anh đăng qua quản trị)', () => {
  const bad = Object.values(stores).flat().filter(e => e.id.startsWith('mtm-custom-')).map(e => e.id);
  assert.deepEqual(bad, []);
});
test('readyExams: hai đề trùng id bị loại cả hai (không chọn bừa một bản)', () => {
  const a = clone(PRACTICE_EXAMS[0]), b = clone(PRACTICE_EXAMS[0]);
  b.title = b.title + ' (bản khác)';
  const ready = readyExams([a, b, PRACTICE_EXAMS[1]]);
  assert.deepEqual(ready.map(e => e.id), [PRACTICE_EXAMS[1].id]);
});

finish({sharedIds});
