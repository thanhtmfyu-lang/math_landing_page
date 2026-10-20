// Bảng tin trung tâm: thứ tự bài, lịch sắp tới theo giờ Việt Nam, lọc dữ liệu máy chủ.
import assert from 'node:assert/strict';
import {visiblePosts,upcomingEvents,parseServerPost,staticPosts,boardEvents,countdownLabel} from '../src/native/homework/center-board-data';

const at=(s:string)=>Date.parse(s);
// 19/10 19:00 giờ VN: thiệp 20/10 chưa tới giờ hiện.
assert.deepEqual(visiblePosts(staticPosts,at('2026-10-19T19:00:00+07:00')).map(p=>p.id),['khoanh-khac-mtm']);
// 20:00 thì hiện và đứng đầu (ngày mới nhất).
assert.equal(visiblePosts(staticPosts,at('2026-10-19T20:00:00+07:00'))[0].id,'2026-10-20-phu-nu-viet-nam');
// Bài máy chủ mới hơn đẩy lên đầu.
const live={id:'2026-10-31-lop',kind:'su-kien' as const,title:'Halloween',date:'2026-10-31',summary:'',photos:[{url:'https://x.supabase.co/a.jpg',alt:'a'}]};
assert.equal(visiblePosts([live,...staticPosts],at('2026-10-31T10:00:00+07:00'))[0].id,'2026-10-31-lop');
assert.equal(visiblePosts([{...live,date:'2026-10-21'},...staticPosts],at('2026-10-21T10:00:00+07:00'))[0].id,'2026-10-31-lop');
// Bài ghim đứng đầu trong 3 ngày.
assert.equal(visiblePosts([{...live,date:'2026-10-21'},{...staticPosts[0],pinned:true}],at('2026-10-21T10:00:00+07:00'))[0].id,'2026-10-20-phu-nu-viet-nam');
assert.equal(visiblePosts([{...live,date:'2026-10-24'},...staticPosts],at('2026-10-24T10:00:00+07:00'))[0].id,'2026-10-31-lop');
// Lịch: 23:30 ngày 19/10 giờ VN (16:30Z) thì 20/10 là "Ngày mai".
const next=upcomingEvents(boardEvents,at('2026-10-19T16:30:00Z'));
assert.equal(next[0].date,'2026-10-20');assert.equal(countdownLabel(next[0].daysLeft),'Ngày mai');assert.equal(next.length,4);assert.equal(next[1].href,'/de-giua-ky-1');
assert.equal(upcomingEvents(boardEvents,at('2026-10-20T01:00:00+07:00'))[0].daysLeft,0);
// Máy chủ: bỏ bài sai khuôn hoặc ảnh không phải https.
assert.ok(parseServerPost({...live}));
assert.equal(parseServerPost({...live,photos:[{url:'javascript:alert(1)',alt:''}]}),null);
assert.equal(parseServerPost({...live,kind:'khac'}),null);
assert.equal(parseServerPost({...live,id:'Có dấu'}),null);
// Ảnh thật: link ký, hết hạn, sửa chữ ký, tệp lạ đều bị từ chối.
assert.ok(parseServerPost({...live,photos:[{url:'/api/bang-tin-anh?f=a-01&e=1792000000&s=abcdefghijklmnopqrstuvwxyz_-',alt:'a'}]}));
import {randomBytes} from 'node:crypto';
import {localBoardPosts,openMedia} from '../server/bang-tin/local';
const key=randomBytes(32),now=at('2026-10-19T21:00:00+07:00');
const posts=localBoardPosts(key,now);
assert.ok(posts.length>=1&&posts.every(p=>parseServerPost(p)));
const u=new URL(posts[0].photos[0].url,'https://x.vn'),q=Object.fromEntries(u.searchParams);
assert.throws(()=>openMedia(key,q.f,q.e,q.s,now));// khóa ngẫu nhiên không giải mã được tệp thật
assert.equal(openMedia(key,q.f,q.e,q.s+'x',now),null);
assert.equal(openMedia(key,q.f,q.e,q.s,now+2*3600e3),null);
assert.equal(openMedia(key,'../bai',q.e,q.s,now),null);
// Khách chưa đăng nhập (trang chủ): chỉ bỏ khung đánh dấu "public": false. Anh Thành 20/10 10:58: ảnh cận mặt học sinh đẹp được đăng công khai.
const pub=localBoardPosts(key,now,true).flatMap(p=>p.photos.map(x=>new URL(x.url,'https://x.vn').searchParams.get('f')));
assert.ok(pub.length>0&&pub.includes('2026-10-19-mung-20-10-04'));
assert.ok(posts.flatMap(p=>p.photos.map(x=>new URL(x.url,'https://x.vn').searchParams.get('f'))).includes('2026-10-19-mung-20-10-04'));
console.log('bang-tin ok');
