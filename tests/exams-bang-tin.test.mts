// Bảng tin trung tâm: thứ tự bài, lịch sắp tới theo giờ Việt Nam, lọc dữ liệu máy chủ.
import assert from 'node:assert/strict';
import {visiblePosts,upcomingEvents,parseServerPost,staticPosts,boardEvents,countdownLabel} from '../src/native/homework/center-board-data';

const at=(s:string)=>Date.parse(s);
// 19/10 19:00 giờ VN: thiệp 20/10 chưa tới giờ hiện.
assert.deepEqual(visiblePosts(staticPosts,at('2026-10-19T19:00:00+07:00')).map(p=>p.id),['khoanh-khac-mtm']);
// 20:00 thì hiện và đứng đầu (ghim).
assert.equal(visiblePosts(staticPosts,at('2026-10-19T20:00:00+07:00'))[0].id,'2026-10-20-phu-nu-viet-nam');
// Bài máy chủ mới hơn đẩy lên đầu khi bài ghim đã quá 3 ngày.
const live={id:'2026-10-31-lop',kind:'su-kien' as const,title:'Halloween',date:'2026-10-31',summary:'',photos:[{url:'https://x.supabase.co/a.jpg',alt:'a'}]};
assert.equal(visiblePosts([live,...staticPosts],at('2026-10-31T10:00:00+07:00'))[0].id,'2026-10-31-lop');
assert.equal(visiblePosts([{...live,date:'2026-10-21'},...staticPosts],at('2026-10-21T10:00:00+07:00'))[0].id,'2026-10-20-phu-nu-viet-nam');
assert.equal(visiblePosts([{...live,date:'2026-10-24'},...staticPosts],at('2026-10-24T10:00:00+07:00'))[0].id,'2026-10-31-lop');
// Lịch: 23:30 ngày 19/10 giờ VN (16:30Z) thì 20/10 là "Ngày mai".
const next=upcomingEvents(boardEvents,at('2026-10-19T16:30:00Z'));
assert.equal(next[0].date,'2026-10-20');assert.equal(countdownLabel(next[0].daysLeft),'Ngày mai');assert.equal(next.length,3);
assert.equal(upcomingEvents(boardEvents,at('2026-10-20T01:00:00+07:00'))[0].daysLeft,0);
// Máy chủ: bỏ bài sai khuôn hoặc ảnh không phải https.
assert.ok(parseServerPost({...live}));
assert.equal(parseServerPost({...live,photos:[{url:'javascript:alert(1)',alt:''}]}),null);
assert.equal(parseServerPost({...live,kind:'khac'}),null);
assert.equal(parseServerPost({...live,id:'Có dấu'}),null);
console.log('bang-tin ok');
