import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {kyVe} from '../server/phong-thi/handler';
import {analysisTicket} from '../server/phong-thi/analysis';
import {publicDistribution,recoveryTopics} from '../server/phong-thi/analysis-model';
const key=randomBytes(32),now=1000000;
const ticket={d:'fixture-exam',s:now-1000,a:'hs:fixture-owner',n:'fixture-nonce'};
const body={action:'phan-tich',de:ticket.d,ve:kyVe(ticket,key)};
const owner={kieu:'hoc-sinh' as const,id:'fixture-owner'};
assert.deepEqual(analysisTicket(body,key,owner,now),ticket);
assert.equal(analysisTicket({...body,de:'other'},key,owner,now),null);
assert.equal(analysisTicket({...body,nonce:'client-supplied'},key,owner,now),null);
assert.equal(analysisTicket({...body,ve:body.ve+'bad'},key,owner,now),null);
assert.equal(analysisTicket({...body,ve:body.ve+'.extra'},key,owner,now),null);
assert.equal(analysisTicket(body,key,{kieu:'hoc-sinh',id:'other-owner'},now),null);
assert.equal(analysisTicket(body,key,owner,now+26*3600000),null);
assert.equal(analysisTicket({...body,ve:kyVe({...ticket,s:now+120000},key)},key,owner,now),null);
const bins=Array.from({length:10},(_,bin)=>({bin,count:bin===9?5:0,student:'must not leak'}));
const projection=publicDistribution({available:true,scope:'dot',total:5,bins,phone:'must not leak',names:['must not leak']});
assert.deepEqual(projection,{available:true,scope:'dot',total:5,bins:bins.map(({bin,count})=>({bin,count}))});
assert.deepEqual(publicDistribution({available:false,names:['must not leak']}),{available:false});
assert.throws(()=>publicDistribution({available:true,scope:'de',total:4,bins}));
assert.throws(()=>publicDistribution({available:true,scope:'de',total:6,bins}));
const topics=recoveryTopics({cau:[
 {ma:'one',so:1,chuDe:'first',diem:0,toiDa:1},
 {ma:'two',so:2,chuDe:'second',diem:0,toiDa:2},
 {ma:'three',so:3,chuDe:'first',diem:0.5,toiDa:1},
 {ma:'four',so:4,chuDe:'correct',diem:1,toiDa:1},
] as any});
assert.deepEqual(topics.map(t=>[t.topic,t.lost]),[['second',2],['first',1.5]]);
assert.deepEqual(topics[1].questions.map(q=>q.id),['one','three']);
console.log('Analysis ticket checks ownership, forgery and expiry; distribution never exposes rows; recovery uses lost points.');
