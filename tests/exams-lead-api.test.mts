import assert from 'node:assert/strict';
import {createLeadApi} from '../api/dang-ky';
import {leadRpcArgs} from '../server/lead/lead';
import {postLead} from '../src/components/lead-client';
import {hsaLeadRegistration} from '../src/native/exams/hsa-mock';

// 1. Kiểm lead bằng đúng luật form: chuẩn hóa số, chặn trường lạ, loại lead lạ.
const ok={kind:'dang-ky',studentName:' Nguyễn Văn A ',phone:'+84 967 365 413',grade:'12',message:'truc-tiep',trial:true,trialSlot:'T7 · 18:00',leadSource:'fb/qd8'};
const args=leadRpcArgs(ok) as Record<string,unknown>;
assert.equal(args.p_phone,'0967365413');assert.equal(args.p_student_name,'Nguyễn Văn A');assert.equal(args.p_kind,'dang-ky');assert.equal(args.p_trial,true);assert.equal(args.p_trial_slot,'T7 · 18:00');
assert.equal(typeof leadRpcArgs({...ok,kind:'khac'}),'string');
assert.equal(typeof leadRpcArgs({...ok,extra:1}),'string');
assert.equal(typeof leadRpcArgs({...ok,phone:'12345'}),'string');
assert.equal(typeof leadRpcArgs({...ok,trial:'co'}),'string');
assert.equal(typeof leadRpcArgs(null),'string');
// Phiếu kỳ thi (kỳ khảo sát, giữa kỳ) phải có dòng SĐT học sinh hợp lệ trong notes.
assert.equal(typeof leadRpcArgs({...ok,leadSource:'ky-khao-sat-ck1-2026'}),'string');
assert.equal(typeof leadRpcArgs({...ok,leadSource:'ky-khao-sat-ck1-2026',notes:'SĐT học sinh: 0123'}),'string');
assert.equal(typeof leadRpcArgs({...ok,leadSource:'ky-khao-sat-ck1-2026',notes:'Trường: X\nSĐT học sinh: 0912 345 678'}),'object');
console.log('Kiểm lead: đúng luật form đăng ký.');

// 2. API: chặn sai origin, tắt thì báo enabled:false (trình duyệt dùng đường cũ), bật thì gọi RPC bằng service role.
const res=()=>{const r:{code?:number;body?:any;headers:Record<string,string>}={headers:{}};return {r,res:{setHeader:(k:string,v:string)=>{r.headers[k]=v;},status:(n:number)=>({json:(v:unknown)=>{r.code=n;r.body=v;}})}};};
const headers={origin:'https://minhthanhmath.vn',host:'minhthanhmath.vn'};
let calls:any[]=[];
const transport=(async(url:string,init:any)=>{calls.push({url,init});return new Response(JSON.stringify({status:'accepted',id:'x'}),{status:200});}) as typeof fetch;
const on=()=>({MTM_LEAD_ENABLED:'1',SUPABASE_URL:'https://abc.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'srk'});
{const {r,res:s}=res();await createLeadApi(on,transport)({method:'POST',headers:{origin:'https://evil.example',host:'minhthanhmath.vn'},body:ok},s);assert.equal(r.code,403);}
{const {r,res:s}=res();await createLeadApi(on,transport)({method:'GET',headers},s);assert.equal(r.code,405);}
{const {r,res:s}=res();await createLeadApi(()=>({}),transport)({method:'POST',headers,body:ok},s);assert.equal(r.code,200);assert.deepEqual(r.body,{enabled:false});assert.equal(calls.length,0);}
{const {r,res:s}=res();await createLeadApi(on,transport)({method:'POST',headers,body:{...ok,phone:'1'}},s);assert.equal(r.code,400);assert.equal(calls.length,0);}
{const {r,res:s}=res();await createLeadApi(on,transport)({method:'POST',headers,body:JSON.stringify(ok)},s);assert.equal(r.code,200);assert.deepEqual(r.body,{enabled:true,status:'accepted'});
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://abc.supabase.co/rest/v1/rpc/mtm_lead_add');assert.equal(calls[0].init.headers.Authorization,'Bearer srk');assert.equal(JSON.parse(calls[0].init.body).p_phone,'0967365413');assert.equal(r.headers['Cache-Control'],'no-store, private');}
{const {r,res:s}=res();await createLeadApi(on,(async()=>new Response('x',{status:500})) as typeof fetch)({method:'POST',headers,body:ok},s);assert.equal(r.code,503);}
console.log('API /api/dang-ky: chặn origin lạ, tắt mặc định, ghi RPC khi bật.');

// 3. Chỉ nhận thành công khi máy chủ xác nhận lưu; mọi lỗi hướng dẫn Zalo.
const reg={studentName:'A',phone:'0967365413',grade:'12',message:'online'};
const f=(code:number,body:unknown)=>(async()=>new Response(JSON.stringify(body),{status:code})) as typeof fetch;
assert.equal(await postLead('dang-ky',reg,f(200,{enabled:true,status:'accepted'})),'saved');
assert.equal(await postLead('dang-ky',reg,f(200,{enabled:true,status:'already'})),'saved');
for(const [code,body] of [[200,{enabled:false}],[404,{}],[503,{message:'Chưa gửi được đăng ký.'}],[200,{}],[200,{status:'unknown'}],[200,{enabled:false,status:'accepted'}]] as const){
 await assert.rejects(postLead('dang-ky',reg,f(code,body)),/Zalo 0967 365 413/);
}
await assert.rejects(postLead('dang-ky',reg,(async()=>{throw new TypeError('Failed to fetch');}) as typeof fetch),/Zalo 0967 365 413/);
await assert.rejects(postLead('dang-ky',reg,(async()=>new Response('<html>Unavailable</html>',{status:200})) as typeof fetch),/Zalo 0967 365 413/);
await assert.rejects(postLead('thi-thu-hsa',reg,f(200,{enabled:false})),/Zalo 0967 365 413/);
assert.equal(await postLead('thi-thu-hsa',reg,f(200,{status:'accepted'})),'saved');
console.log('Form: chỉ nhận accepted/already; lỗi, tắt API, mất mạng đều báo Zalo, không trả fallback.');

// 4. Lead thi thử HSA mang điểm và tên đề vào ghi chú, qua được bộ kiểm.
const hsa=hsaLeadRegistration({name:'Minh',grade:'12',phone:'0967 365 413',scoreText:'42/50',examTitle:'Đề số 01',leadSource:''});
const hargs=leadRpcArgs({kind:'thi-thu-hsa',...hsa}) as Record<string,unknown>;
assert.equal(hargs.p_kind,'thi-thu-hsa');assert.match(String(hargs.p_notes),/42\/50 · Đề số 01/);assert.equal(hargs.p_study_mode,'online');
console.log('Lead thi thử HSA: đủ điểm, tên đề.');
