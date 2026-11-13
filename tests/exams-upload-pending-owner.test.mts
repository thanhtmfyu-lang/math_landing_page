import assert from 'node:assert/strict';
import {clearPending,loadPending,savePending} from '../src/native/lesson-upload/pending-request-store';
const values=new Map<string,string>();
const store={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
const a={client_request_id:'11111111-1111-4111-8111-111111111111',class_ids:['qa-a'],homework_path:'owner-a/batch-a/homework.pdf',answer_path:'owner-a/batch-a/answer.pdf',task_scope:'Câu 1–2',due_at_by_class:{'qa-a':'2026-11-20T10:00:00Z'}};
const b={...a,client_request_id:'22222222-2222-4222-8222-222222222222',class_ids:['qa-b'],homework_path:'owner-b/batch-b/homework.pdf',answer_path:'owner-b/batch-b/answer.pdf'};
savePending(store,'owner-a',a);
assert.deepEqual(loadPending(store,'owner-a'),a,'F5 restores exact identity and private source paths');
const keysBeforeB=[...values.keys()];
assert.equal(loadPending(store,'owner-b'),null,'another account cannot read the pending request');
assert.deepEqual([...values.keys()],keysBeforeB,'merely visiting another account does not delete the first account unknown receipt');
assert.deepEqual(loadPending(store,'owner-a'),a,'A → B → A preserves A request');
savePending(store,'owner-b',b);
assert.deepEqual(loadPending(store,'owner-a'),a,'B saving its own request does not overwrite A');
assert.deepEqual(loadPending(store,'owner-b'),b);
clearPending(store,'owner-a');
assert.equal(loadPending(store,'owner-a'),null);
assert.deepEqual(loadPending(store,'owner-b'),b,'confirming A never clears B');
clearPending(store,'owner-b');assert.equal(values.size,0);

// Older single-key receipts remain owner-bound and survive another owner's read/clear.
values.set('mtm-lesson-pending-v1',JSON.stringify({owner:'owner-a',payload:a}));
assert.equal(loadPending(store,'owner-b'),null);clearPending(store,'owner-b');
assert.deepEqual(loadPending(store,'owner-a'),a);
savePending(store,'owner-b',b);
assert.deepEqual(loadPending(store,'owner-a'),a,'a legacy receipt survives B using the new owner key');
clearPending(store,'owner-a');assert.deepEqual(loadPending(store,'owner-b'),b);clearPending(store,'owner-b');

savePending(store,'owner-a',a);const keyA=[...values.keys()][0];values.set(keyA,'{bad json');
assert.throws(()=>loadPending(store,'owner-a'),/Biên nhận/,'corrupt receipt fails closed');
clearPending(store,'owner-a');assert.equal(values.has(keyA),true,'clear must not discard an unparseable unknown receipt');
values.clear();
const quotaStore={...store,setItem(){throw Error('Quota');}};
assert.throws(()=>savePending(quotaStore,'owner-a',a),/Bài chưa được gửi/,'storage failure stops before RPC');
assert.equal(loadPending(store,'owner-a'),null);
const discardStore={...store,setItem(){}};
assert.throws(()=>savePending(discardStore,'owner-a',a),/Bài chưa được gửi/,'failed write readback is rejected before RPC');
assert.equal(values.size,0);
console.log('Pending receipts: F5 identity; A→B→A isolation; independent owner writes/clears; legacy receipt preservation; corruption/quota/readback failures are closed.');
