import assert from 'node:assert/strict';
import {lessonOpensAt} from '../server/btvn/opening-policy';

// Anh Thành chốt 18/10: bài chung lớp XPS 8+/9+ cùng khoá mở cho mọi lớp từ ca sớm nhất của buổi.
const de2:any={kind:'btvn',date:'2026-10-13',classDates:{'2K10 8+':'2026-10-16','2K10 9+':'2026-10-13'},
  classOpensAt:{'2K10 8+':'2026-10-16T21:30:00+07:00','2K10 9+':'2026-10-13T21:30:00+07:00','2K10 Thứ 3, 6':'2026-10-13T21:30:00+07:00'}};
const t13=Date.parse('2026-10-13T21:30:00+07:00');
assert.equal(lessonOpensAt(de2,'2K10 8+'),t13);
assert.equal(lessonOpensAt(de2,'2K10 9+'),t13);
assert.equal(lessonOpensAt(de2,'2K10 Thứ 3, 6'),t13);
// Không trộn khoá khác, không đụng lớp XPT/HSA.
const mixed:any={kind:'btvn',date:'2026-10-14',classDates:{'2K11 8+':'2026-10-14','2K11 9+':'2026-10-15','2K11 XPT':'2026-10-12','2K9 9+':'2026-10-10'}};
assert.equal(lessonOpensAt(mixed,'2K11 9+'),Date.parse('2026-10-14T21:30:00+07:00'));
assert.equal(lessonOpensAt(mixed,'2K11 XPT'),Date.parse('2026-10-12T21:30:00+07:00'));
const one:any={kind:'btvn',date:'2026-10-15',classDates:{'2K9 8+':'2026-10-15'}};
assert.equal(lessonOpensAt(one,'2K9 8+'),Date.parse('2026-10-15T21:30:00+07:00'));
console.log('Đạt: bài XPS 8+/9+ cùng khoá mở chung từ ca sớm nhất; XPT, khoá khác không bị ảnh hưởng.');
