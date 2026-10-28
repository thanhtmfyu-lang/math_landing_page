import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
import {createDurableHomeworkHandler} from '../server/btvn/durable-http';
// 28/10: ô "Nhớ đăng nhập" kéo phiên + cookie lên 30 ngày; không đánh dấu hoặc kéo lỗi thì giữ 4 giờ như cũ.
const root=process.env.MTM_ROOT!,session='a'.repeat(64),input={method:'POST',host:'fake.local',origin:'https://fake.local',secure:true};
const snapshot={revision:0,lessons:[],work:{student:{studentCode:'',fullName:'Học sinh GIẢ',phone:'',className:'2K10'},drafts:[],receipts:[]}};
const gate={fullName:'Học sinh GIẢ',phone:'0900000000',className:'2K10'};
function make(remember:'ok'|'fail'|'missing'){
  const calls:string[]=[];
  const repo=new SupabaseHomeworkRepository({async rpc(name){calls.push(name);if(name==='mtm_btvn_remember'){if(remember==='missing')return {data:null,error:{code:'PGRST202'}};return {data:remember==='ok',error:null};}return {data:snapshot,error:null};}},async()=>({ok:true,session}));
  return {calls,handler:createDurableHomeworkHandler(repo)};
}
const age=(cookie:string)=>Number(/Max-Age=(\d+)/.exec(cookie)?.[1]);
{const {calls,handler}=make('ok');const res=await handler({...input,body:{action:'login',gate,remember:true}});
 assert.equal(res.status,200);assert.equal(age(res.headers['Set-Cookie']),30*86400);assert.ok(res.headers['Set-Cookie'].includes('HttpOnly'));assert.deepEqual(calls,['mtm_btvn_remember','mtm_btvn_read']);}
{const {calls,handler}=make('ok');const res=await handler({...input,body:{action:'login',gate}});
 assert.equal(res.status,200);assert.equal(age(res.headers['Set-Cookie']),14400);assert.ok(!calls.includes('mtm_btvn_remember'));}
{const {calls,handler}=make('ok');const res=await handler({...input,body:{action:'login',gate,remember:false}});
 assert.equal(age(res.headers['Set-Cookie']),14400);assert.ok(!calls.includes('mtm_btvn_remember'));}
// Migration chưa áp hoặc phiên đã hết: vẫn vào bài, cookie 4 giờ khớp phiên máy chủ.
for(const mode of ['fail','missing'] as const){const {handler}=make(mode);const res=await handler({...input,body:{action:'login',gate,remember:true}});assert.equal(res.status,200);assert.equal(age(res.headers['Set-Cookie']),14400);}
{const {handler}=make('ok');const res=await handler({...input,body:{action:'login',gate,remember:'yes'}});assert.equal(res.status,400);}
{const {handler}=make('ok');const res=await handler({...input,body:{action:'state',remember:true}});assert.equal(res.status,400);}
const sql=readFileSync(join(root,'supabase/migrations-pending/20261028_2310_nho_dang_nhap_30_ngay.sql'),'utf8');
assert.match(sql,/interval '30 days'/);assert.match(sql,/revoked_at IS NULL AND expires_at > clock_timestamp\(\)/);assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.mtm_btvn_remember\(text\) TO service_role/);assert.match(sql,/FROM public, anon, authenticated/);
const gateSource=readFileSync(join(root,'src/native/homework/HomeworkGate.tsx'),'utf8');
assert.match(gateSource,/Nhớ đăng nhập 30 ngày/);assert.match(gateSource,/onLogin\(\{studentCode\},remember\)/);assert.match(gateSource,/onLogin\(input,remember\)/);
console.log(JSON.stringify({suite:'nho_dang_nhap_30_ngay',passed:9,total:9}));
