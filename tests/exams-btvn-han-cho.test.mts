import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {withTimeout,READ_RPCS,READ_RPC_MS,BUSY} from '../server/btvn/supabase-transport';
import {createHomeworkHandler} from '../supabase/functions/mtm-homework-access/handler';

// 20/10/2026: HS 2K10 9+ đứng mãi ở "Đang kiểm tra phiên". Lệnh đọc phải có hạn chờ, lệnh ghi thì không.
assert.equal(await withTimeout(Promise.resolve(7),50),7);
await assert.rejects(withTimeout(new Promise(()=>{}),20),/Timeout/);
assert.ok(READ_RPC_MS<=30000,'Máy chủ phải trả lỗi trước hạn chờ của trình duyệt.');
for(const name of ['mtm_btvn_read','mtm_btvn_assets','mtm_btvn_classes'])assert.ok(READ_RPCS.has(name));
assert.ok(!READ_RPCS.has('mtm_btvn_commit'),'Không cắt giữa lúc ghi bài.');

const session=readFileSync(join(process.env.MTM_ROOT??process.cwd(),'src/native/homework/HomeworkSession.tsx'),'utf8');
assert.match(session,/READ_ACTIONS=new Set\(\['state','select','login','logout'\]\),READ_TIMEOUT_MS=40000/);
assert.match(session,/signal:abort\?\.signal/);
assert.doesNotMatch(session,/gateway\.call\('state'\)\.then\([^;]*\.catch\(\(\)=>\{\}\)/,'Lỗi lần kiểm phiên đầu phải hiện cho HS, không nuốt im.');
// 20/10 18:14: CSDL lỗi ở bộ đếm lượt không được báo thành "thử nhiều lần" hay sai thông tin.
const edgeWith=(rate:{data:unknown;error:null|{code?:string}})=>createHomeworkHandler({publishableKey:'k',origins:['https://t.invalid'],networkKey:async()=>'d'.repeat(64),rpc:async name=>name==='mtm_btvn_gateway_rate'?rate:{data:{ok:true},error:null},download:async()=>new Blob()});
const forgot=(edge:ReturnType<typeof edgeWith>)=>edge(new Request('https://e.invalid',{method:'POST',headers:{Origin:'https://t.invalid',apikey:'k','Content-Type':'application/json'},body:JSON.stringify({operation:'forgot',fullName:'Giả',phone:'0900000001',className:'Giả'})}));
assert.equal((await forgot(edgeWith({data:null,error:{code:'57014'}}))).status,503);
assert.equal((await forgot(edgeWith({data:{ok:false},error:null}))).status,429,'Vượt ngưỡng thật vẫn báo 429.');
assert.match(BUSY,/đang bận/);
console.log(JSON.stringify({suite:'btvn-han-cho',passed:true}));
