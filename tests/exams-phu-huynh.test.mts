import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleParent,RpcError} from '../server/phu-huynh/http';
import {PH_GATE,PH_LOGIN,PH_SESSION,summarize,type Rpc} from '../server/phu-huynh/service';
import {createBtvnApi} from '../api/btvn';

/** Góc phụ huynh (20/10). Quyền PH→con nằm trong Postgres (supabase/tests/phu_huynh_090_assertions.sql chạy trên DB);
 * ở đây giả lập đúng luật đó để kiểm lớp máy chủ web: không tin childId từ trình duyệt, cùng một câu lỗi, cookie an toàn. */
const NOW=Date.parse('2026-10-20T20:00:00+07:00');
const A='aaaaaaaa-0000-4000-8000-000000000001',B='bbbbbbbb-0000-4000-8000-000000000002';
const students:Record<string,{fullName:string;className:string;phone:string;parentPhone:string}>={
 [A]:{fullName:'Học Sinh Giả A',className:'2K9 GIẢ QA',phone:'0900000001',parentPhone:'0911111111'},
 [B]:{fullName:'Học Sinh Giả B',className:'2K9 GIẢ QA',phone:'0900000002',parentPhone:'0922222222'}};
const material=(code:string,date:string)=>({lessonCode:code,classNames:['2K9 GIẢ QA'],date,title:'Buổi '+code,videoId:null,materialUrl:null,handoutUrl:null,homeworkUrl:null});
function fakeDb(){
 const accounts=new Map<string,{pin:string;failed:number}>(),links=new Set<string>(),sessions=new Map<string,string>(),childTokens=new Map<string,string>();
 const calls:string[]=[];let n=0;
 const token=()=>(++n).toString(16).padStart(64,'0');
 const rpc:Rpc=async(name,a:any)=>{
  calls.push(name);
  const ph=()=>{const p=sessions.get(a.p_session);if(!p)throw new RpcError('42501','Parent session required');return p;};
  switch(name){
   case 'mtm_btvn_classes':return ['2K9 GIẢ QA'];
   case 'mtm_ph_link':{
    const id=Object.keys(students).find(k=>{const s=students[k];return s.fullName===a.p_child_name&&s.className===a.p_class_name&&s.phone===a.p_child_phone&&s.parentPhone===a.p_parent_phone;});
    if(!id)return {ok:false};
    const acc=accounts.get(a.p_parent_phone);
    if(!acc){if(!a.p_new_pin)return {ok:false,pin:'setup'};if(a.p_new_pin==='123456')return {ok:false,pin:'weak'};accounts.set(a.p_parent_phone,{pin:a.p_new_pin,failed:0});}
    else if(!a.p_pin)return {ok:false,pin:'required'};else if(a.p_pin!==acc.pin)return {ok:false,pin:'wrong',remaining:4};
    links.add(a.p_parent_phone+'|'+id);const t=token();sessions.set(t,a.p_parent_phone);return {ok:true,session:t};}
   case 'mtm_ph_login':{const acc=accounts.get(a.p_parent_phone);if(!acc)return {ok:false};if(acc.failed>=5)return {ok:false,pin:'locked'};if(acc.pin!==a.p_pin){acc.failed++;return {ok:false,pin:'wrong'};}const t=token();sessions.set(t,a.p_parent_phone);return {ok:true,session:t};}
   case 'mtm_ph_logout':sessions.delete(a.p_session);return null;
   case 'mtm_ph_children':{const p=ph();return {parentName:'Phụ huynh giả',children:Object.keys(students).filter(id=>links.has(p+'|'+id)).map(id=>({id,fullName:students[id].fullName,className:students[id].className}))};}
   case 'mtm_ph_child_session':{const p=ph();if(!links.has(p+'|'+a.p_student_id))throw new RpcError('42501','Not your child');const t=token();childTokens.set(t,a.p_student_id);return t;}
   case 'mtm_btvn_read':{const id=childTokens.get(a.p_session);if(!id)throw new RpcError('42501','x');const s=students[id];
    // Đúng dạng RPC thật (migration 011): mỗi thẻ trong lessons tự mang bestScore/submittedAt/late/hạn; work chỉ có biên nhận buổi đang chọn, không có work.lessons.
    return {work:{student:{fullName:s.fullName,className:s.className},drafts:[],receipts:[{score:id===A?9:4,submittedAt:NOW-86400e3,late:false}]},material:material('L2','2026-10-18'),
     lessons:[{...material('L2','2026-10-18'),available:true,dueAt:null,expectedDueAt:null,bestScore:id===A?9:4,submittedAt:NOW-86400e3,late:false},
      {...material('L1','2026-10-15'),available:true,dueAt:NOW-2*86400e3,bestScore:id===A?5.5:3,submittedAt:NOW-3*86400e3,late:true},
      {...material('L0','2026-10-11'),available:true,dueAt:null,expectedDueAt:NOW-5*86400e3,bestScore:null,submittedAt:null,late:null}]};}
   case 'mtm_btvn_my_rank':return {rank:2,score:8.1,submitted:3,total:18};
   case 'mtm_btvn_logout':childTokens.delete(a.p_session);return null;
   case 'mtm_ph_extras':{const p=ph();if(!links.has(p+'|'+a.p_student_id))throw new RpcError('42501','Not your child');
    return {attendance:[{date:'2026-10-18',status:'co_mat'},{date:'2026-10-15',status:'di_muon'},{date:'2026-10-11',status:'vang'}],upcoming:'2026-10-22',papers:[{testCode:'101',date:'2026-10-05',subject:'Toán',score:7.5,maxScore:10}]};}
   case 'mtm_ph_zalo_code':ph();return {code:'012345',expiresAt:NOW+600e3};
  }
  throw Error('rpc lạ '+name);
 };
 return {rpc,calls,childTokens};
}
const cookieOf=(r:{headers:Record<string,string>})=>r.headers['Set-Cookie']?.split(';')[0]??'';
const db=fakeDb(),net='f'.repeat(64);
const good={parentName:'Phụ huynh giả',parentPhone:'0911111111',childName:'Học Sinh Giả A',childPhone:'0900000001',className:'2K9 GIẢ QA'};

// 1. Sai một trong bốn trường đối chiếu → cùng một câu, không nói ô nào sai.
for(const k of ['parentPhone','childName','childPhone','className'] as const){
 const r=await handleParent(db.rpc,{ph:'link',...good,[k]:k==='className'?'2K10 GIẢ':good[k]+'9',newPin:'246810'},'',net);
 assert.equal(r.status,401);assert.deepEqual(r.body,{message:PH_GATE},'Sai '+k+' phải cùng câu chung');assert.equal(r.headers['Set-Cookie'],undefined);
}
// 2. Khớp đủ → hỏi tạo PIN; PIN dễ đoán bị từ chối; tạo xong có cookie HttpOnly Secure SameSite=Lax 30 ngày.
let r=await handleParent(db.rpc,{ph:'link',...good},'',net);
assert.equal(r.status,428);assert.deepEqual(r.body,{pin:'setup'});
r=await handleParent(db.rpc,{ph:'link',...good,newPin:'123456'},'',net);assert.equal(r.status,422);
r=await handleParent(db.rpc,{ph:'link',...good,newPin:'246810'},'',net);
assert.equal(r.status,200);
const set=r.headers['Set-Cookie'];
for(const flag of ['HttpOnly','Secure','SameSite=Lax','Path=/api','Max-Age=2592000'])assert.ok(set.includes(flag),'cookie thiếu '+flag);
const cookieA=cookieOf(r);
assert.deepEqual((r.body as any).children.map((c:any)=>c.id),[A]);
// 3. Báo cáo đúng con; không có SĐT; phiên tạm của con bị thu hồi ngay.
r=await handleParent(db.rpc,{ph:'report',childId:A},cookieA,net);
assert.equal(r.status,200);
const report=r.body as any,text=JSON.stringify(report);
assert.equal(report.child.id,A);
assert.ok(!/09[0-9]{8}/.test(text),'Báo cáo không được chứa số điện thoại');
assert.ok(!/hoc.?phi|học phí|tuition/i.test(text));
assert.equal(db.childTokens.size,0,'Phiên tạm của con phải thu hồi sau khi đọc');
assert.equal(report.homework.find((h:any)=>h.lessonCode==='L2').bestScore,9);
assert.equal(report.homework.find((h:any)=>h.lessonCode==='L1').status,'muon');
assert.equal(report.homework.find((h:any)=>h.lessonCode==='L1').bestScore,5.5,'Điểm buổi cũ lấy từ thẻ snapshot, không từ work.lessons');
// Hạn dự kiến (expectedDueAt) đã qua mà chưa nộp thì là quá hạn; số liệu tổng không được 0/0 khi con đã nộp bài (lỗi 21/10).
assert.equal(report.homework.find((h:any)=>h.lessonCode==='L0').status,'qua-han');
assert.equal(report.summary.submitted,2);assert.equal(report.summary.dueTotal,3);assert.equal(report.summary.averageScore,7.25);
assert.deepEqual(report.rank,{rank:2,score:8.1,submitted:3,total:18});
assert.equal(report.attendance.find((a:any)=>a.date==='2026-10-11').label,'Vắng');
assert.equal(report.upcoming,'2026-10-22');
// 4. PH A sửa childId thành con của PH B → bị chặn trước khi tạo phiên đọc của học sinh B.
const before=db.calls.filter(c=>c==='mtm_ph_child_session').length;
r=await handleParent(db.rpc,{ph:'report',childId:B},cookieA,net);
assert.equal(r.status,403);assert.ok(!JSON.stringify(r.body).includes('Giả B'));
assert.equal(db.calls.filter(c=>c==='mtm_ph_child_session').length,before,'Không được xin phiên con khi không phải con mình');
// 5. Ghép thêm con khi đã có tài khoản phải nhập PIN cũ; con của PH khác vẫn không ghép được bằng SĐT PH A.
r=await handleParent(db.rpc,{ph:'link',...good,parentPhone:'0911111111',childName:'Học Sinh Giả B',childPhone:'0900000002',pin:'246810'},'',net);
assert.equal(r.status,401);assert.deepEqual(r.body,{message:PH_GATE});
// 6. Đăng nhập: sai PIN cùng một câu; sai 5 lần thì khoá.
for(let i=0;i<5;i++){r=await handleParent(db.rpc,{ph:'login',parentPhone:'0911111111',pin:'000000'},'',net);assert.equal(r.status,401);assert.deepEqual(r.body,{message:PH_LOGIN});}
r=await handleParent(db.rpc,{ph:'login',parentPhone:'0911111111',pin:'246810'},'',net);assert.equal(r.status,423);
r=await handleParent(db.rpc,{ph:'login',parentPhone:'0999999999',pin:'246810'},'',net);assert.equal(r.status,401);assert.deepEqual(r.body,{message:PH_GATE});
// 7. Mã ghép Zalo chỉ khi đã đăng nhập; đăng xuất xoá cookie và thu hồi phiên.
r=await handleParent(db.rpc,{ph:'zalo'},'',net);assert.equal(r.status,401);assert.deepEqual(r.body,{message:PH_SESSION});
r=await handleParent(db.rpc,{ph:'zalo'},cookieA,net);assert.equal(r.status,200);assert.match((r.body as any).code,/^[0-9]{6}$/);
r=await handleParent(db.rpc,{ph:'logout'},cookieA,net);assert.ok(r.headers['Set-Cookie'].includes('Max-Age=0'));
r=await handleParent(db.rpc,{ph:'children'},cookieA,net);assert.equal(r.status,401);
// 8. Tổng quan: tỉ lệ đi học tháng, phần mạnh/yếu theo điểm cao nhất từng buổi.
const sum=summarize([
 {lessonCode:'a',title:'Hàm số',date:'2026-10-02',kind:'btvn',dueAt:0,bestScore:9.5,submittedAt:1,late:false,status:'da-nop'},
 {lessonCode:'b',title:'Mũ log',date:'2026-10-05',kind:'btvn',dueAt:0,bestScore:4,submittedAt:1,late:false,status:'da-nop'},
 {lessonCode:'c',title:'Tích phân',date:'2026-10-09',kind:'btvn',dueAt:0,bestScore:null,submittedAt:null,late:false,status:'qua-han'}],
 [{date:'2026-10-02',status:'co_mat',label:''},{date:'2026-10-05',status:'vang',label:''},{date:'2026-09-28',status:'co_mat',label:''}],NOW);
assert.deepEqual(sum.monthAttendance,{attended:1,total:2});
assert.equal(sum.submitted,2);assert.equal(sum.dueTotal,3);
assert.deepEqual(sum.strong.map(t=>t.lessonCode),['a']);assert.deepEqual(sum.weak.map(t=>t.lessonCode),['b']);
assert.deepEqual(sum.missing.map(m=>m.lessonCode),['c']);
// 9. /api/btvn: nhánh ph đi qua cùng kiểm origin + mạng, không thêm hàm Vercel.
const env={MTM_BTVN_ENABLED:'1',VERCEL:'1',SUPABASE_URL:'https://x.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'k',MTM_HOMEWORK_PUBLISHABLE_KEY:'p',MTM_BTVN_NETWORK_SECRET:'s'.repeat(32),MTM_BTVN_ORIGINS:'https://minhthanhmath.vn'};
const api=createBtvnApi(()=>env as any,async()=>{throw Error('Không được nạp kho BTVN cho phụ huynh');},{parentRpc:()=>fakeDb().rpc});
const call=async(headers:Record<string,string>,body:unknown)=>{let status=0,json:unknown,h:Record<string,unknown>={};await api({method:'POST',body,headers},{setHeader:(k,v)=>{h[k]=v;},status:n=>{status=n;return {json:v=>{json=v;}};}});return {status,json,h};};
const ok=await call({host:'minhthanhmath.vn',origin:'https://minhthanhmath.vn','x-vercel-forwarded-for':'203.0.113.9'},{ph:'classes'});
assert.equal(ok.status,200,JSON.stringify(ok.json));assert.deepEqual(ok.json,{classes:['2K9 GIẢ QA']});
assert.equal((await call({host:'minhthanhmath.vn',origin:'https://ke-gian.example','x-vercel-forwarded-for':'203.0.113.9'},{ph:'classes'})).status,403);
// 10. Trang, menu đăng nhập, chân trang, rewrite và noindex.
const read=(p:string)=>readFileSync(p,'utf8');
assert.ok(read('vercel.json').includes('"source": "/phu-huynh"'));
assert.ok(read('src/App.tsx').includes("path==='/phu-huynh'?<ParentCorner/>"));
assert.ok(read('src/migration/Experience.tsx').includes('href="/phu-huynh"'));
assert.ok(read('src/components/QuickLinks.tsx').includes("['/phu-huynh','Xem kết quả của con']"));
assert.match(read('src/migration/route-policy.ts'),/pathname==='\/phu-huynh'\)return\{[^}]*robots:'noindex, nofollow'/);
const sql=read('supabase/migrations-pending/202610200090_goc_phu_huynh.sql');
assert.ok(sql.includes("crypt(")&&sql.includes("gen_salt('bf'"),'PIN phụ huynh lưu băm bcrypt');
assert.ok(!/grant[^;]*mtm_ph_[^;]*to (anon|authenticated)/i.test(sql),'RPC phụ huynh chỉ cho service_role');
const corner=read('src/native/phu-huynh/ParentCorner.tsx');
assert.ok(!/chatbot/i.test(corner)&&corner.includes('Zalo Toán Thầy Thành'),'Mã ghép gửi Zalo Toán Thầy Thành, không ghi chatbot');
assert.ok(!corner.includes("'/'+r.rank.total"),'L28: hạng không kèm /y (total là số bài của con, không phải sĩ số)');
console.log('GÓC PHỤ HUYNH: 10/10 nhóm kiểm tra đạt (ghép đúng, sai 1 trường cùng câu, chặn xem chéo, khoá PIN, cookie, Zalo, không SĐT).');
