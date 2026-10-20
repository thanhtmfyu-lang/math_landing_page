import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CARD_W,CARD_H,drawResultCard,resultCardLines} from '../src/components/mtm-result-card';

// W2 (đặc tả marketing 20/10): ảnh dọc 1080×1920, logo + tên đợt + điểm + phân vị + minhthanhmath.vn; tên chỉ khi em đồng ý, không thì SBD; không bao giờ có SĐT.
assert.equal(CARD_W,1080);assert.equal(CARD_H,1920);
const base={dot:'Kỳ khảo sát MTM · Khối 12',scoreText:'8,25',dateText:'06/12/2026',url:'https://minhthanhmath.vn/thi-thu'};
const a=resultCardLines({...base,percentile:83.4,sbd:'KS12-0042'});
assert.equal(a.who,'SBD KS12-0042');assert.equal(a.percentile,'Cao hơn 83% bạn cùng khối');assert.equal(a.url,'minhthanhmath.vn/thi-thu');assert.equal(a.scale,'/10 điểm');
const b=resultCardLines({...base,name:'Nguyễn An 0912 345 678',sbd:'KS12-0042'});
assert.equal(b.who,'Nguyễn An');assert.doesNotMatch(JSON.stringify(b),/\d{9,}|0912/);
const c=resultCardLines({...base,percentile:100});assert.equal(c.percentile,'');assert.equal(c.who,'');
// Vẽ trên canvas giả: mọi dòng chữ có mặt, không ném lỗi.
const texts:string[]=[];const noop=()=>{};
const ctx:any=new Proxy({fillText:(t:string)=>texts.push(t),measureText:(t:string)=>({width:t.length*20}),roundRect:noop},{get:(o,k)=>k in o?(o as any)[k]:noop,set:()=>true});
drawResultCard(ctx,{...base,percentile:60,name:'An'});
for(const t of ['Kỳ khảo sát MTM · Khối 12','8,25','/10 điểm','Cao hơn 60% bạn cùng khối','An','minhthanhmath.vn/thi-thu'])assert.ok(texts.includes(t),t);
// Đã gắn vào trang kết quả giữa kỳ và phòng thi thử.
assert.ok(readFileSync('src/native/exams/DeGiuaKy.tsx','utf8').includes('<ResultShareCard'));
const pt=readFileSync('src/native/exams/PhongThi.tsx','utf8');assert.ok(pt.includes('<ResultShareCard'));assert.ok(pt.includes("'/kiem-tra-dau-vao?nguon=ket-qua-'"));
console.log('THẺ KẾT QUẢ W2: đạt (cỡ ảnh, tên/SBD, phân vị, không SĐT, gắn vào giữa kỳ + phòng thi thử).');
