import assert from 'node:assert/strict';
import {createBtvnPublishHandler} from '../server/btvn/publish-handler';
const secret='s'.repeat(40);
const handler=createBtvnPublishHandler({async rpc(action:string){if(action==='lookup')return {status:null};throw Error('db said: private detail');},async upload(){}} as any,secret);
const send=(body:unknown)=>handler(new Request('https://fake.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':secret},body:JSON.stringify(body)}));
// Kiểm trượt: body chung, header mang đúng mã kiểm.
const bad=await send({action:'publish',lesson_key:'k-1',source_version:'x'});
assert.equal(bad.status,422);assert.equal(await bad.text(),'{"error_code":"PUBLISH_REJECTED"}');
assert.equal(bad.headers.get('X-MTM-Reject-Code'),'INVALID_VERSION');
// Thông điệp không phải mã kiểm không lọt ra ngoài.
const odd=await send({action:'update_material',lesson_key:'k-2',material:{}});
assert.ok(['LESSON_NOT_PUBLISHED','UNCLASSIFIED'].includes(odd.headers.get('X-MTM-Reject-Code')!));
assert.ok(!(odd.headers.get('X-MTM-Reject-Code')??'').includes('private'));
// Sai secret vẫn 401, không có header mã.
const unauth=await handler(new Request('https://fake.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':'nope'},body:'{}'}));
assert.equal(unauth.status,401);assert.equal(unauth.headers.get('X-MTM-Reject-Code'),null);
console.log('btvn reject code ok');
