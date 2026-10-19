// Kiểm lỗi vận hành 19/10/2026 bằng dữ liệu tổng hợp. Không đọc roster, không in tên học sinh thật.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {enrollmentHeadline} from '../src/native/enrollment-year';
import {legacyLearningAlias} from '../src/migration/legacy-alias';
import {routeMetadata} from '../src/migration/route-policy';
import {filterSearch, readFilters, readyExams, PRACTICE_EXAMS} from '../src/native/exams/data';
import {formatAttemptDeadline} from '../src/native/exams/deadline-label';
import {createDraft, draftKey} from '../src/native/exams/store';
import {publicArena} from '../server/btvn/rank-row';
import {suite} from './exams-harness.mts';

const {test, finish} = suite('VH');
const root = process.env.MTM_ROOT!;
const require = createRequire(join(root, 'package.json'));
const {buildSync} = require('esbuild');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');

function load(file: string) {
  const code = buildSync({entryPoints: [join(root, file)], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external', loader: {'.css': 'empty'}, logLevel: 'silent'}).outputFiles[0].text;
  const mod = {exports: {} as {default?: unknown}};
  new Function('require', 'module', 'exports', code)((id: string) => id.endsWith('.css') ? {} : require(id), mod, mod.exports);
  return mod.exports;
}

test('Map năm tuyển sinh 2026-2027 đúng lớp 10, 11, 12 và không áp cho khối 9, HSA, TSA', () => {
  assert.deepEqual(enrollmentHeadline('12'), {year: 2027, group: 2009});
  assert.deepEqual(enrollmentHeadline('11'), {year: 2028, group: 2010});
  assert.deepEqual(enrollmentHeadline('10'), {year: 2029, group: 2011});
  for (const grade of ['all', '9', 'HSA', 'TSA', '']) assert.equal(enrollmentHeadline(grade), null);
  const source = readFileSync(join(root, 'src/native/NativeCourses.tsx'), 'utf8');
  assert.match(source, /enrollmentHeadline\(state\.grade\)/);
  assert.doesNotMatch(source, /2008|2026:state\.grade/);
  assert.doesNotMatch(readFileSync(join(root, 'src/migration/catalog.json'), 'utf8'), /"grade": 9/);
});

test('Alias /goc-hoc-tap giữ query vô hại và bỏ mã, PIN, số dài', () => {
  assert.equal(legacyLearningAlias('/goc-hoc-tap'), '/btvn');
  assert.equal(legacyLearningAlias('/goc-hoc-tap/', '?lop=10'), '/btvn?lop=10');
  assert.equal(legacyLearningAlias('/GOC-HOC-TAP', '?lop=12&pin=123456&ma=bi-mat'), '/btvn?lop=12');
  assert.equal(legacyLearningAlias('/goc-hoc-tap', '?phone=0900000000&note=hop-le'), '/btvn?note=hop-le');
  assert.equal(legacyLearningAlias('/goc-hoc-tap', '', '#buoi'), '/btvn#buoi');
  assert.equal(legacyLearningAlias('/goc-hoc-tap/khac'), null);
  const meta = routeMetadata('/goc-hoc-tap', 'www.minhthanhmath.vn', '?lop=10');
  assert.equal(meta.known, true);
  assert.equal(meta.url, 'https://www.minhthanhmath.vn/btvn');
  assert.equal(meta.robots, 'noindex, follow');
});

test('Alias /bang-diem về xếp hạng công khai, không mang query riêng', () => {
  assert.equal(legacyLearningAlias('/bang-diem'), '/xep-hang');
  assert.equal(legacyLearningAlias('/bang-diem/', '?pin=123456&lop=2K9'), '/xep-hang');
  assert.equal(legacyLearningAlias('/bang-diem', '', '#ar-khoi-2K9'), '/xep-hang#ar-khoi-2K9');
  assert.equal(legacyLearningAlias('/bang-diem', '', '#javascript:alert(1)'), '/xep-hang');
  const meta = routeMetadata('/bang-diem', 'www.minhthanhmath.vn');
  assert.equal(meta.url, 'https://www.minhthanhmath.vn/xep-hang');
  assert.match(meta.description, /BTVN sau khi đăng nhập/);
  const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const sources = ['/goc-hoc-tap', '/goc-hoc-tap/', '/bang-diem', '/bang-diem/'];
  assert.equal(config.redirects, undefined);
  assert.deepEqual(config.rewrites.filter((rule: {source: string}) => sources.includes(rule.source)).map((rule: {source: string; destination: string}) => [rule.source, rule.destination]), sources.map(source => [source, '/index.html']));
});

test('Bộ lọc thi thử không ghi tham số mặc định, giữ bộ lọc có giá trị', () => {
  assert.equal(filterSearch(readFilters('')), '');
  assert.equal(filterSearch(readFilters('?lop=all&ky=all&q=')), '');
  assert.equal(filterSearch(readFilters('?lop=12&ky=all&q=')), '?lop=12');
  assert.equal(filterSearch(readFilters('?lop=11&ky=GK1&q=dao+ham')), '?lop=11&ky=GK1&q=dao+ham');
  assert.equal(filterSearch({lop: 'all', ky: 'all', q: 'dao ham '}), '?q=dao+ham+');
  assert.equal(filterSearch(readFilters('?q=dao+ham+')), '?q=dao+ham+');
  assert.equal(filterSearch({lop: 'all', ky: 'all', q: '   '}), '');
  const list = (pathname: string, search: string) => pathname + filterSearch(readFilters(search));
  assert.equal(list('/thi-thu/de-gia', ''), '/thi-thu/de-gia');
  assert.equal(list('/thi-thu/de-gia', '?lop=all&ky=all&q='), '/thi-thu/de-gia');
  assert.equal(list('/thi-thu/de-gia', '?lop=12&ky=GK1&q='), '/thi-thu/de-gia?lop=12&ky=GK1');
  assert.equal(list('/thi-thu', '?lop=10'), '/thi-thu?lop=10');
});

test('Hạn nộp bài đang làm tách giờ và ngày, không đổi mốc giờ Việt Nam', () => {
  const at = Date.parse('2026-10-19T11:06:41+07:00');
  assert.equal(formatAttemptDeadline(at), '11:06:41 ngày 19/10/2026');
  assert.equal(formatAttemptDeadline(Date.parse('2026-10-19T04:06:41Z')), '11:06:41 ngày 19/10/2026');
  assert.ok(!formatAttemptDeadline(at).includes('11:06:4119/10/2026'));
  const exam = readyExams(PRACTICE_EXAMS).find(item => item.serverGraded !== true && item.responseMode !== 'questions-only' && item.durationMinutes > 0);
  assert.ok(exam);
  const startedAt = at - exam.durationMinutes * 60000;
  const made = createDraft(exam, 'luot-gia-van-hanh', startedAt);
  assert.equal(made.ok && made.value.deadline, at);
  const PracticeAttempt = load('src/native/exams/PracticeAttempt.tsx').default as (props: object) => unknown;
  const store = {getItem: (key: string) => made.ok && key === draftKey(exam.id) ? JSON.stringify(made.value) : null, setItem() { return undefined; }};
  const html = renderToStaticMarkup(React.createElement(PracticeAttempt, {exam, catalogUrl: '/luyen-tap?nhom=10&chuong=1', storeOverride: store, kind: 'practice'}));
  assert.match(html, /Hạn nộp bài đang làm: 11:06:41 ngày 19\/10\/2026\./);
  assert.ok(!html.includes('11:06:4119/10/2026'));
});

test('Cùng họ tên ở hai lớp vẫn là hai hàng, không gộp theo tên', () => {
  const row = (rank: number, className: string, score: number) => ({rank, fullName: 'Học sinh GIẢ', className, school: 'Trường giả', avatar: 'spark', photo: null, score, submitted: 1, total: 2});
  const arena = publicArena({kind: 'btvn-thang', cohorts: [{
    cohort: '2K9', label: '2K9', ranked: 2, perfect: 0,
    top: [row(1, '2K9 9+', 8), row(2, '2K9 8+', 7)],
    classes: [
      {className: '2K9 9+', students: 1, avg: 8, best: 8, leader: 'Học sinh GIẢ', top: [{...row(1, '2K9 9+', 8), cohortRank: 1}]},
      {className: '2K9 8+', students: 1, avg: 7, best: 7, leader: 'Học sinh GIẢ', top: [{...row(2, '2K9 8+', 7), cohortRank: 2}]},
    ],
  }]});
  assert.deepEqual(arena.cohorts[0].top.map(item => item.className), ['2K9 9+', '2K9 8+']);
  assert.equal(new Set(arena.cohorts[0].top.map(item => item.fullName)).size, 1);
  assert.equal(arena.cohorts[0].classes.reduce((sum, item) => sum + item.top.length, 0), 2);
  const sql = readFileSync(join(root, 'supabase/migrations-pending/202610170030_btvn_rank_first_attempt.sql'), 'utf8');
  assert.match(sql, /group by id,full_name,label having count\(score\)>0/);
  assert.match(sql, /distinct on\(id\)/);
  assert.doesNotMatch(sql, /group by full_name,/);
  assert.doesNotMatch(sql, /distinct on\(full_name\)/);
});

test('Thẻ BTVN tổng hợp hiện ngày 18/10, 19/10 và điểm cao nhất', () => {
  const Cards = load('src/native/homework/LessonCards.tsx').default;
  const base = {classNames: ['Lớp giả'], title: 'Buổi giả', videoId: null, materialUrl: null, handoutUrl: null, homeworkUrl: null, late: false, available: true, bestScore: null, submittedAt: null, dueAt: null, expectedDueAt: null};
  const now = Date.parse('2026-10-19T09:00:00+07:00');
  const html = renderToStaticMarkup(React.createElement(Cards, {
    busy: false,
    onHomework() {},
    serverNow: now,
    clientReceivedAt: now,
    lessons: [
      {...base, lessonCode: 'gia-19', date: '2026-10-19', homeworkTitle: 'Bài giả hôm nay', bestScore: 9.5, submittedAt: Date.parse('2026-10-19T21:00:00+07:00'), dueAt: Date.parse('2026-10-20T18:00:00+07:00')},
      {...base, lessonCode: 'gia-18', date: '2026-10-18', homeworkTitle: 'Bài giả hôm qua', dueAt: Date.parse('2026-10-19T18:00:00+07:00')},
    ],
  }));
  assert.match(html, /19\/10/);
  assert.match(html, /18\/10/);
  assert.match(html, /Điểm cao nhất: 9,5\/10/);
  assert.match(html, /Bài giả hôm nay/);
  assert.match(html, /Bài giả hôm qua/);
  assert.doesNotMatch(html, /Học sinh thật|090\d{7}/);
});

finish();
