import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {createBtvnPublishHandler} from '../server/btvn/publish-handler';
const secret='fixture-secret-'.repeat(4),calls:any[]=[];
const row={studentId:'fake',fullName:'Em Giả',className:'2K9 8+',lessonCode:'fake',title:'Bài giả',date:'2026-10-15',dueAt:null,phone:'0900000001',parentPhone:'0900000002',receipts:[{score:8,submittedAt:1792000000000,late:true,phone:'0900000003'}]};
const handler=createBtvnPublishHandler({async rpc(name,payload){calls.push({name,payload});return name==='classes'?['2K9 8+','2K9 8+']:[row];},async upload(){assert.fail('Read không upload');}},secret);
const request=(body:any,key=secret)=>handler(new Request('https://fake.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':key},body:JSON.stringify(body)}));
assert.equal((await request({action:'scorebook'},'wrong')).status,401);assert.equal(calls.length,0);
for(const from of ['2026-10-01','2026-10-15','2028-02-29']){
 const response=await request({action:'scorebook',from});assert.equal(response.status,200);
 const out=await response.json();assert.equal(out[0].fullName,'Em Giả');assert(!JSON.stringify(out).includes('phone'));assert(!JSON.stringify(out).includes('090000000'));
 assert.deepEqual(calls.at(-1),{name:'scorebook',payload:{p_from:from,p_apply:false}});
}
assert.equal((await request({action:'scorebook'})).status,200);
assert.deepEqual(calls.at(-1).payload,{p_from:'2026-10-01',p_apply:false});
const before=calls.length;
for(const body of [{action:'scorebook',from:'2026-09-30'},{action:'scorebook',from:'2026-02-30'}, {action:'scorebook',from:'2027-02-29'}, {action:'scorebook',from:'bad'}, {action:'scorebook',from:42}, {action:'scorebook',from:'2026-10-15T00:00:00Z'}, {action:'scorebook',apply:true}, {action:'scorebook',p_apply:false}, {action:'scorebook',rpc:'arbitrary'}, {action:'classes',from:'2026-10-01'}])assert.equal((await request(body)).status,422);
assert.equal(calls.length,before);
assert.deepEqual(await (await request({action:'classes'})).json(),{classNames:['2K9 8+']});
const broken=createBtvnPublishHandler({async rpc(){throw Error('SECRET_PHONE');},async upload(){}},secret);
const failed=await broken(new Request('https://fake.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':secret},body:'{"action":"scorebook"}'}));
assert.equal(failed.status,422);assert.equal(await failed.text(),'{"error_code":"PUBLISH_REJECTED"}');
// SQL transport giả, không DB: role cục bộ và p_apply luôn false dù port bị gọi sai.
const {createPublishPort}=await import(pathToFileURL(join(process.env.MTM_ROOT!,'supabase/functions/mtm-btvn-publish/port.mjs')).href);
let statements:any[]=[];
const sql:any={begin:async(fn:any)=>fn(async(parts:any,...values:any[])=>{statements.push({query:parts.join('?'),values});return [{result:[]}];})};
const port=createPublishPort(sql,{});
await port.rpc('scorebook',{p_from:'2026-10-01',p_apply:true});
assert.deepEqual(statements,[{query:'SET LOCAL ROLE service_role',values:[]},{query:'SELECT public.mtm_btvn_scorebook_real100(?::date,false) AS result',values:['2026-10-01']}]);
statements=[];await port.rpc('classes',{});assert.equal(statements[1].query,'SELECT public.mtm_btvn_classes() AS result');
await assert.rejects(port.rpc('arbitrary',{}));
// Chạy cả handler đã bundle để bắt lỗi quên dựng lại Edge.
const generated=await import(pathToFileURL(join(process.env.MTM_ROOT!,'supabase/functions/mtm-btvn-publish/handler.generated.js')).href);
const bundled=generated.createBtvnPublishHandler({async rpc(){return [row];},async upload(){assert.fail();}},secret);
assert.equal((await bundled(new Request('https://fake.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':secret},body:'{"action":"scorebook"}'}))).status,200);
console.log('ĐẠT đợt 22: Edge auth/whitelist/ngày, không SĐT, read-only SQL và handler generated.');
