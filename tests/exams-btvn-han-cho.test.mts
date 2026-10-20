import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {withTimeout,READ_RPCS,READ_RPC_MS} from '../server/btvn/supabase-transport';

// 20/10/2026: HS 2K10 9+ đứng mãi ở "Đang kiểm tra phiên". Lệnh đọc phải có hạn chờ, lệnh ghi thì không.
assert.equal(await withTimeout(Promise.resolve(7),50),7);
await assert.rejects(withTimeout(new Promise(()=>{}),20),/Timeout/);
assert.ok(READ_RPC_MS<=10000,'Máy chủ phải trả lỗi trước hạn chờ của trình duyệt.');
for(const name of ['mtm_btvn_read','mtm_btvn_assets','mtm_btvn_classes'])assert.ok(READ_RPCS.has(name));
assert.ok(!READ_RPCS.has('mtm_btvn_commit'),'Không cắt giữa lúc ghi bài.');

const session=readFileSync(join(process.env.MTM_ROOT??process.cwd(),'src/native/homework/HomeworkSession.tsx'),'utf8');
assert.match(session,/READ_ACTIONS=new Set\(\['state','select','login','logout'\]\),READ_TIMEOUT_MS=15000/);
assert.match(session,/signal:abort\?\.signal/);
assert.doesNotMatch(session,/gateway\.call\('state'\)\.then\([^;]*\.catch\(\(\)=>\{\}\)/,'Lỗi lần kiểm phiên đầu phải hiện cho HS, không nuốt im.');
console.log(JSON.stringify({suite:'btvn-han-cho',passed:true}));
