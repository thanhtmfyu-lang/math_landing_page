// 29/10/2026: 2K9 XPS bắt buộc làm 22 đề ôn 3 chương xác suất; máy chủ chấm lại và ghi lượt theo phiên HS.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import probabilityTests from '../src/native/chapters/probability-tests.json';
import {createOnChuongHandler,ON_CHUONG_EXAM_IDS} from '../server/btvn/on-chuong';
import {createSheetHandler} from '../supabase/functions/mtm-btvn-sheet/handler';

// Khung chung chạy đồng bộ; các phép thử ở đây gọi DB/handler bất đồng bộ nên chờ lần lượt.
const tests:[string,()=>unknown][]=[];const test=(name:string,fn:()=>unknown)=>{tests.push([name,fn]);};
async function finish(){let failed=0;for(const [i,[name,fn]] of tests.entries()){const id='ON-CHUONG'+String(i+1).padStart(2,'0');
  try{await fn();console.log('  ok  '+id+' '+name);}catch(e){failed++;console.log('  LỖI '+id+' '+name+'\n       '+(e instanceof Error?e.message:String(e)));}}
 console.log(JSON.stringify({suite:'ON-CHUONG',total:tests.length,passed:tests.length-failed,failed}));process.exitCode=failed?1:0;}
type Q={id:string;kind:string;answer:unknown;acceptedAnswers?:string[]};
const exam=(probabilityTests as unknown as {exam:{id:string;versionHash:string;questions:Q[]}}[])[3].exam;
const key=Object.fromEntries(exam.questions.map(q=>[q.id,q.kind==='short'?q.acceptedAnswers![0]:q.answer]));
const session='a'.repeat(64),cookie='x=1; mtm_btvn_demo='+session;
function fakeDb(reply:{data:any;error:null|{code?:string}}={data:{status:'ok',ten:'An',done:1,total:22},error:null}){
  const calls:{name:string;args:Record<string,unknown>}[]=[];
  return {calls,db:{rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return reply;}}};
}
const body=(extra:Record<string,unknown>={})=>({action:'on-chuong-ghi',examId:exam.id,examVersionHash:exam.versionHash,attemptId:'att_1',answers:key,...extra});

test('22 đề đúng bảng SQL', () => {
  assert.equal(ON_CHUONG_EXAM_IDS.length,22);
  const sql=readFileSync('supabase/migrations-pending/20261029_1400_on_chuong_xac_suat.sql','utf8');
  for(const id of ON_CHUONG_EXAM_IDS)assert.ok(sql.includes(`('${id}',`),id);
  assert.match(sql,/'2026-11-08 23:59:59\+07'/);
});
test('máy chủ tự chấm lại theo khóa: đúng hết 10 điểm, sai 1 câu TN mất 0,25', async () => {
  const a=fakeDb();let r=await createOnChuongHandler(a.db)(body(),cookie);
  assert.equal(r.status,200);assert.equal(a.calls[0].name,'mtm_on_chuong_ghi');
  assert.deepEqual(a.calls[0].args,{p_session:session,p_exam:exam.id,p_attempt:'att_1',p_score:10000});
  const mc=exam.questions.find(q=>q.kind==='mc')!;
  const b=fakeDb();r=await createOnChuongHandler(b.db)(body({answers:{...key,[mc.id]:mc.answer==='A'?'B':'A'}}),cookie);
  assert.equal(b.calls[0].args.p_score,9750);
});
test('không nhận điểm/tên/mã HS từ trình duyệt, đề lạ, bản đề cũ', async () => {
  for(const bad of [body({score:10000}),body({studentId:'x'}),body({examId:'mtm-practice-g10-c1-x'}),body({attemptId:'có dấu'}),body({answers:[]}),body({answers:{khong_co:'A'}})]){
    const a=fakeDb();const r=await createOnChuongHandler(a.db)(bad,cookie);assert.equal(r.status,400);assert.equal(a.calls.length,0);
  }
  const a=fakeDb();const r=await createOnChuongHandler(a.db)(body({examVersionHash:'0'.repeat(64)}),cookie);assert.equal(r.status,409);assert.equal(a.calls.length,0);
});
test('chưa đăng nhập: báo login, không gọi DB; lỗi DB không mất bài', async () => {
  const a=fakeDb();let r=await createOnChuongHandler(a.db)(body(),'x=1');
  assert.deepEqual(r,{status:200,body:{status:'login'}});assert.equal(a.calls.length,0);
  r=await createOnChuongHandler(fakeDb({data:null,error:{code:'57014'}}).db)(body(),cookie);assert.equal(r.status,503);
  r=await createOnChuongHandler(fakeDb({data:null,error:{code:'22023'}}).db)(body(),cookie);assert.equal(r.status,400);
});
test('đọc các đề đã ghi nhận', async () => {
  const a=fakeDb({data:{status:'ok',ten:'An',done:[exam.id],total:22},error:null});
  const r=await createOnChuongHandler(a.db)({action:'on-chuong-cua-em'},cookie);
  assert.equal(r.status,200);assert.deepEqual(a.calls[0],{name:'mtm_on_chuong_cua_em',args:{p_session:session}});
  assert.equal((await createOnChuongHandler(a.db)({action:'on-chuong-cua-em',x:1},cookie)).status,400);
});
test('API /api/btvn chuyển hành động on-chuong-* tới handler', () => {
  const api=readFileSync('api/btvn.ts','utf8');
  assert.match(api,/startsWith\('on-chuong-'\)/);assert.match(api,/createOnChuongHandler/);
});
test('Sheet QL: tab onchuongxs gọi hàm riêng, vẫn cần mã header', async () => {
  const calls:string[]=[];
  const h=createSheetHandler({databaseUrl:'https://database.invalid',serviceKey:'k',scriptToken:'test-script-secret',ownerEmail:'o@example.invalid'},(async(u:string)=>{calls.push(String(u));return Response.json('Lớp,Học sinh');}) as unknown as typeof fetch);
  assert.equal((await h(new Request('https://edge.invalid/?tab=onchuongxs'))).status,403);assert.equal(calls.length,0);
  const r=await h(new Request('https://edge.invalid/?tab=onchuongxs',{headers:{'x-mtm-sheet-token':'test-script-secret'}}));
  assert.equal(r.status,200);assert.match(calls[0],/rpc\/mtm_on_chuong_csv$/);
});
await finish();
