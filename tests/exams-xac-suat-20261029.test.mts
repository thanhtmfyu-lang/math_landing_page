// 29/10/2026: ba chương xác suất (Toán 10 Ch.VIII, IX; Toán 11 Ch.VIII) cho học sinh lớp 12 ôn trước xác suất có điều kiện.
import assert from 'node:assert/strict';
import probabilityTests from '../src/native/chapters/probability-tests.json';
import sequence from '../src/native/chapters/chapter-sequence.json';
import {scorePracticeAssessment} from '../src/native/exams/flexible-profile';
import {validatePracticeExam, type PracticeExam} from '../src/native/exams/data';
import {canonicalNumeric} from '../src/native/exams/assessment';
import {routeGroupsOf} from '../src/native/chapters/practice-shared';
import {suite} from './exams-harness.mts';

const {test, finish} = suite('XS');
type Item = {track: string; chapter: string; order: number; isFoundation: boolean; isChapterEnd: boolean; reviewStatus: string; exam: PracticeExam};
const items = probabilityTests as unknown as Item[];
const chapters: Record<string, number> = {'10:8': 8, '10:9': 6, '11:8': 8};

test('22 đề, đúng số đề mỗi chương, mỗi đề 12 TN + 4 Đ/S + 6 TLN và qua validator', () => {
  assert.equal(items.length, 22);
  for (const [key, n] of Object.entries(chapters)) assert.equal(items.filter(p => p.track + ':' + p.chapter === key).length, n, key);
  for (const p of items) {
    assert.ok(validatePracticeExam(p.exam).valid, p.exam.id);
    assert.deepEqual(p.exam.questions.map(q => q.kind).join(''), 'mc'.repeat(12) + 'tf'.repeat(4) + 'short'.repeat(6));
    assert.ok(!p.reviewStatus.endsWith('_INDEPENDENT_REVIEW_PENDING'), 'đề phải mở lượt mới: ' + p.exam.id);
  }
});
test('làm đúng theo khóa được 10 điểm; khóa sai bị trừ điểm', () => {
  for (const p of items) {
    const answers: Record<string, unknown> = {};
    for (const q of p.exam.questions) answers[q.id] = q.kind === 'short' ? q.acceptedAnswers[0].replace('.', ',') : q.answer;
    const r = scorePracticeAssessment(p.exam, answers);
    assert.ok(r.ok && r.earnedMillipoints === 10000, p.exam.id);
    const mc = p.exam.questions[0] as {id: string; answer: string};
    const wrong = scorePracticeAssessment(p.exam, {...answers, [mc.id]: mc.answer === 'A' ? 'B' : 'A'});
    assert.ok(wrong.ok && wrong.earnedMillipoints === 9750, p.exam.id);
  }
});
test('trả lời ngắn tối đa 4 ký tự; Đ/S có cả ý đúng và ý sai; câu không trùng trong đề', () => {
  for (const p of items) {
    const prompts = new Set<string>();
    for (const q of p.exam.questions) {
      const key = q.kind === 'tf' ? (q.prompt ?? '') + JSON.stringify(q.statements) : (q.prompt ?? '');
      assert.ok(!prompts.has(key), 'trùng câu ' + q.id); prompts.add(key);
      if (q.kind === 'short') { assert.ok(canonicalNumeric(q.acceptedAnswers[0]) !== null && q.acceptedAnswers[0].length <= 4, q.id); }
      if (q.kind === 'tf') { const t = q.answer.filter(Boolean).length; assert.ok(t > 0 && t < 4, q.id); }
    }
  }
});
test('lộ trình mỗi chương: Bài 1 lý thuyết, từng bài SGK cơ bản rồi vận dụng, cuối cùng kiểm tra chương', () => {
  for (const key of Object.keys(chapters)) {
    const ids = routeGroupsOf((sequence as Record<string, unknown>)[key]).flatMap(g => g.items.map(i => i.id));
    const own = items.filter(p => p.track + ':' + p.chapter === key).sort((a, b) => a.order - b.order);
    assert.deepEqual(ids, own.map(p => p.exam.id), key);
    assert.ok(own[0].isFoundation && own.at(-1)!.isChapterEnd, key);
  }
});
finish();
