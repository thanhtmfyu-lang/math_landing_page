import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {sanitizeDisplayName,hsaNameKey,rankHsaEntries,publicHsaRow,formatHsaDuration,hsaStatusMessage,HSA_SUBMIT_STATUS} from '../server/hsa/rank';
import {validateHsaMockConfig,HSA_MOCK_EXAMS,hsaMockExam,hsaLeadPayload,normalizeHsaPhone} from '../src/native/exams/hsa-mock';
import {validatePracticeExam} from '../src/native/exams/data';
import {createHsaRankApi} from '../api/hsa-xep-hang';
import {routeMetadata,PUBLIC_PATHS} from '../src/migration/route-policy';
import {readSecret} from '../scripts/de-thi-kho.mjs';
const root=process.env.MTM_ROOT!;
const json=(p:string)=>JSON.parse(readFileSync(join(root,p),'utf8'));
// Đáp án và seed migration 069/070 chỉ còn ở thư mục riêng (MTM_DE_THI_DIR) từ 20/10; thiếu thì bỏ qua phần so đáp án.
const secretJson=(p:string)=>{const t=readSecret(root,p);return t==null?null:JSON.parse(t);};

// 1. Tên hiển thị công khai.
assert.equal(sanitizeDisplayName('  Nguyễn   Minh Anh  '),'Nguyễn Minh Anh');
assert.equal(sanitizeDisplayName('Nguyễn Thị Phương Thảo Linh Chi'),'Nguyễn Thị Phương Thảo L');
assert.equal(Array.from(sanitizeDisplayName('Đặng Hoàng Bảo Ngọc Trâm Anh')!).length<=24,true);
assert.equal(sanitizeDisplayName('Minh Anh https://spam.vn/abc'),'Minh Anh');
assert.equal(sanitizeDisplayName('Minh Anh www.abc.com'),'Minh Anh');
assert.equal(sanitizeDisplayName('Lan zalo.me/123'),'Lan');
assert.equal(sanitizeDisplayName('Huy minhthanhmath.vn'),'Huy');
assert.equal(sanitizeDisplayName('Tuấn 0967 365 413'),'Tuấn');
assert.equal(sanitizeDisplayName('Tuấn +84967365413'),'Tuấn');
assert.equal(sanitizeDisplayName('Mai mai@gmail.com'),'Mai');
assert.equal(sanitizeDisplayName('Khoa 🔥🔥 <b>'),'Khoa b');
assert.equal(sanitizeDisplayName('An​‮Bình'),'An Bình');
assert.equal(sanitizeDisplayName('Lớp 12A1 Hải'),'Lớp 12A1 Hải');
for(const bad of ['địt mẹ','Nam đéo','vcl','Hùng dm','FUCK you','a','  ','12345678','https://x.vn','😀😀'])assert.equal(sanitizeDisplayName(bad),null,bad);
for(const ok of ['Các bạn lớp 12','Lớn','Đèo Văn Cả','Thắng Cúc'])assert.ok(sanitizeDisplayName(ok),ok);
assert.equal(sanitizeDisplayName(42),null);
assert.equal(hsaNameKey('Nguyễn  Đức Anh'),'nguyen duc anh');
assert.equal(hsaNameKey('NGUYEN DUC-ANH'),'nguyen duc anh');
console.log('Đạt tên hiển thị: cắt 24 ký tự, bỏ đường dẫn, email, số điện thoại, ký tự lạ; chặn từ tục; khóa trùng bỏ dấu.');

// 2. Thứ tự xếp hạng: điểm giảm dần, cùng điểm thì ít thời gian hơn, rồi nộp sớm hơn.
const ranked=rankHsaEntries([
 {name:'A',grade:'12',scoreMillipoints:7500,elapsedMs:1200000,submittedAt:3},
 {name:'B',grade:'11',scoreMillipoints:9000,elapsedMs:2400000,submittedAt:5},
 {name:'C',grade:'12',scoreMillipoints:7500,elapsedMs:900000,submittedAt:9},
 {name:'D',grade:'khac',scoreMillipoints:7500,elapsedMs:900000,submittedAt:4},
] as const);
assert.deepEqual(ranked.map(r=>[r.rank,r.name]),[[1,'B'],[2,'D'],[3,'C'],[4,'A']]);
assert.equal(formatHsaDuration(1085),'18 phút 05 giây');
assert.deepEqual(publicHsaRow({rank:1,name:'Minh Anh',grade:'12',score:7500,seconds:1085,date:'2026-10-19',phone:'0967365413',device_hash:'x'}),{rank:1,name:'Minh Anh',grade:'12',score:7.5,seconds:1085,date:'2026-10-19'});
assert.throws(()=>publicHsaRow({rank:1,name:'xem www.spam.vn',grade:'12',score:1,seconds:1,date:'2026-10-19'}));
assert.throws(()=>publicHsaRow({rank:1,name:'An',grade:'9',score:1,seconds:1,date:'2026-10-19'}));
assert.throws(()=>publicHsaRow({rank:1,name:'An',grade:'12',score:10001,seconds:1,date:'2026-10-19'}));
for(const s of HSA_SUBMIT_STATUS)assert.ok(hsaStatusMessage(s,3).length>10);
console.log('Đạt thứ tự xếp hạng và phép chiếu công khai (không lộ SĐT, mã thiết bị).');

// 3. Cấu hình đề: dữ liệu, không tự viết câu hỏi; đề HSA số 01 đang mở, đề mẫu đã tắt.
const config=json('src/native/exams/hsa-mock.json');
assert.ok(validateHsaMockConfig(config).ok);
assert.ok(HSA_MOCK_EXAMS.length>=1);
assert.equal(hsaMockExam('khong-co')?.slug,HSA_MOCK_EXAMS[0].slug);
const bad=(patch:any)=>validateHsaMockConfig({...config,exams:[{...config.exams[0],...patch}]});
assert.equal(bad({source:'internet'}).ok,false);
assert.equal(bad({slug:'Đề 1'}).ok,false);
assert.equal(bad({examId:'X'}).ok,false);
assert.equal(bad({active:false}).ok,false);
assert.equal(bad({placeholder:'yes'}).ok,false);
assert.equal(bad({pointsScale:7}).ok,false);
assert.equal(bad({pointsScale:'50'}).ok,false);
assert.equal(bad({answers:['A']}).ok,false);
assert.equal(validateHsaMockConfig({...config,exams:[config.exams[0],config.exams[0]]}).ok,false);
assert.equal(validateHsaMockConfig({version:2,exams:config.exams}).ok,false);
assert.equal(validateHsaMockConfig({version:1,exams:[]}).ok,false);
const bank=[...json('src/native/chapters/practice-tests.json'),...json('src/native/chapters/exact-tests.json'),...json('src/native/chapters/archived-tests.json')].map((p:any)=>p.exam);
const catalog=json('src/native/exams/catalog.json');
for(const e of config.exams){
 const exam=e.source==='hsa-paper'?(secretJson('src/native/exams/hsa-papers/'+e.examId+'.key.json')??json('src/native/exams/hsa-papers/'+e.examId+'.public.json').exam):(e.source==='catalog'?catalog:bank).find((x:any)=>x.id===e.examId);
 assert.ok(exam,'Đề '+e.examId+' phải có sẵn trong nguồn '+e.source);
 assert.ok(validatePracticeExam(exam).valid,'Đề '+e.examId+' phải hợp lệ');
}
const placeholder=config.exams.find((e:any)=>e.examId==='mtm-preview-practice-hsa-01-v1');
assert.equal(placeholder?.placeholder,true,'Đề mẫu tạm phải gắn placeholder=true để trang hiện ghi chú.');
assert.equal(placeholder?.active,false,'Đề mẫu đã tắt khi có đề HSA thật.');
assert.deepEqual(HSA_MOCK_EXAMS.map(e=>[e.slug,e.examId,e.source,e.title,e.placeholder,e.pointsScale]),[['de-01','mtm-hsa-thi-thu-01','hsa-paper','Đề thi thử HSA số 01',false,50],['de-02','mtm-hsa-thi-thu-02','hsa-paper','Đề thi thử HSA số 02',false,50]]);
assert.equal(hsaMockExam(null)?.slug,'de-01','Mặc định mở đề 01');assert.equal(hsaMockExam('de-02')?.examId,'mtm-hsa-thi-thu-02');
const paper01=json('src/native/exams/hsa-papers/mtm-hsa-thi-thu-01.public.json').exam;
assert.equal(paper01.questions.length,50);assert.equal(paper01.durationMinutes,75);
console.log('Đạt cấu hình đề: kiểm trường, trùng, nguồn; đề HSA số 01 (50 câu / 75 phút) đang mở, đề mẫu đã tắt.');

// 4. Migration 069 seed đúng bản đề client đang dùng (cùng versionHash), không seed đề mẫu, không chứa SĐT.
const sql=readSecret(root,'supabase/migrations-pending/202610190069_thi_thu_hsa_xep_hang.sql');
if(sql==null)console.log('BỎ QUA so seed 069/070: thiếu bản gốc (đặt MTM_DE_THI_DIR).');else{
const b64=/values\('mtm-hsa-thi-thu-01',convert_from\(decode\('([A-Za-z0-9+/=]+)','base64'\)/.exec(sql)?.[1];
assert.ok(b64);
// Khóa hiện hành của 2 đề nằm ở 092 (sửa câu điền theo quy chế HSA); 069/070 giữ bản đầu cho lịch sử.
const sql92=readSecret(root,'supabase/migrations-pending/202610200092_hsa_dien_phan_so.sql')!;
const key92=(id:string)=>{const m=new RegExp("values\\('"+id+"',convert_from\\(decode\\('([A-Za-z0-9+/=]+)','base64'\\)").exec(sql92)?.[1];assert.ok(m,'092 thiếu '+id);return JSON.parse(Buffer.from(m!,'base64').toString('utf8'));};
const seeded=key92('mtm-hsa-thi-thu-01');
assert.deepEqual(seeded,secretJson('src/native/exams/hsa-papers/mtm-hsa-thi-thu-01.key.json'));
assert.equal(seeded.versionHash,paper01.versionHash);
assert.ok(JSON.parse(Buffer.from(b64!,'base64').toString('utf8')).id==='mtm-hsa-thi-thu-01');
assert.match(sql92,/on conflict\(id\) do update set exam=excluded\.exam;/);
assert.ok(!sql92.replace(/--.*$/gm,'').includes('mtm_hsa_rank'),'092 không đụng bảng xếp hạng');
assert.match(sql,/insert into mtm_hsa_rank\.exams\(exam_id,placeholder\) values\('mtm-hsa-thi-thu-01',false\)/);
assert.ok(!sql.replace(/--.*$/gm,'').includes('mtm-preview-practice-hsa-01-v1'),'069 không seed đề mẫu');
assert.ok(!/phone|sdt|so_dien_thoai/i.test(sql.replace(/--.*$/gm,'')));
assert.match(sql,/grant execute on function public\.mtm_hsa_rank_top\(text,integer\),public\.mtm_hsa_rank_submit\(text,uuid,text,text,text,text,text\) to service_role;/);
console.log('Đạt migration 069: seed đúng đề HSA số 01, không seed đề mẫu, không có cột SĐT, chỉ service_role.');
// 4b. Migration 070 (không sửa 069): seed đề 02 đúng bản client, cần 069 trước.
const sql70=readSecret(root,'supabase/migrations-pending/202610190070_thi_thu_hsa_de_02.sql')!;
const b64b=/values\('mtm-hsa-thi-thu-02',convert_from\(decode\('([A-Za-z0-9+/=]+)','base64'\)/.exec(sql70)?.[1];
assert.ok(b64b);
assert.equal(JSON.parse(Buffer.from(b64b!,'base64').toString('utf8')).id,'mtm-hsa-thi-thu-02');
assert.deepEqual(key92('mtm-hsa-thi-thu-02'),secretJson('src/native/exams/hsa-papers/mtm-hsa-thi-thu-02.key.json'));
assert.match(sql70,/insert into mtm_hsa_rank\.exams\(exam_id,placeholder\) values\('mtm-hsa-thi-thu-02',false\)/);
assert.match(sql70,/to_regclass\('mtm_hsa_rank\.exams'\) is null/);
assert.ok(!sql.includes('mtm-hsa-thi-thu-02'),'069 giữ nguyên, không seed đề 02');
console.log('Đạt migration 070: seed đúng đề HSA số 02, yêu cầu 069, không sửa 069.');
}

// 5. API: tắt mặc định, chỉ chuyển trường đã duyệt, băm mã thiết bị, không nhận điểm từ trình duyệt.
const env:Record<string,string>={MTM_HSA_RANK_ENABLED:'1',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'FIXTURE'};
async function invoke(api:any,req:any){let status=0,body:any;const headers:any={};await api(req,{setHeader:(k:string,v:string)=>headers[k]=v,status:(n:number)=>{status=n;return{json:(v:any)=>body=v};}});return{status,headers,body};}
const origin={origin:'https://minhthanhmath.vn',host:'minhthanhmath.vn'};
const attempt={de:'mtm-preview-practice-hsa-01-v1',attemptId:'0f8fad5b-d9cb-469f-a165-70867728950e',attemptToken:'a'.repeat(64),name:'  Minh Anh 0967365413 ',grade:'12',device:'b'.repeat(32)};
let calls:any[]=[];
const api=createHsaRankApi(()=>env,async(url,init)=>{const payload=JSON.parse(String(init?.body));calls.push([String(url),payload]);
 if(String(url).endsWith('/mtm_hsa_rank_top'))return new Response(JSON.stringify({open:true,rows:[{rank:1,name:'Minh Anh',grade:'12',score:7500,seconds:1085,date:'2026-10-19',phone:'SECRET'},{rank:2,name:'xem www.x.vn',grade:'12',score:5000,seconds:900,date:'2026-10-19'}]}));
 return new Response(JSON.stringify({status:'accepted',rank:4,score:7500,seconds:1085}));});
const off=await invoke(createHsaRankApi(()=>({}),async()=>{throw Error('no call');}),{method:'GET',query:{de:attempt.de}});
assert.deepEqual(off.body,{enabled:false,open:false,rows:[]});
const offPost=await invoke(createHsaRankApi(()=>({}),async()=>{throw Error('no call');}),{method:'POST',headers:origin,body:attempt});
assert.deepEqual(offPost.body,{enabled:false});
let r=await invoke(api,{method:'GET',query:{de:attempt.de}});
assert.equal(r.status,200);assert.deepEqual(r.body,{enabled:true,open:true,rows:[{rank:1,name:'Minh Anh',grade:'12',score:7.5,seconds:1085,date:'2026-10-19'}]});
assert.deepEqual(calls[0][1],{p_exam:attempt.de,p_limit:50});
assert.equal((await invoke(api,{method:'GET',query:{de:'../x'}})).status,400);
assert.equal((await invoke(api,{method:'DELETE'})).status,405);
r=await invoke(api,{method:'POST',headers:origin,body:attempt});
assert.equal(r.status,200);assert.deepEqual(r.body,{enabled:true,status:'accepted',rank:4,name:'Minh Anh'});
const sent=calls.at(-1)[1];
assert.equal(sent.p_name,'Minh Anh');assert.equal(sent.p_name_key,'minh anh');assert.equal(sent.p_attempt,attempt.attemptId);
assert.equal(sent.p_device_hash,createHash('sha256').update(attempt.de+':'+attempt.device).digest('hex'));
assert.ok(!JSON.stringify(sent).includes(attempt.device)&&!('p_score' in sent));
assert.match(r.headers['Cache-Control'],/no-store/);
const before=calls.length;
assert.equal((await invoke(api,{method:'POST',headers:origin,body:{...attempt,score:10}})).status,400);
assert.equal((await invoke(api,{method:'POST',headers:origin,body:{...attempt,name:'vcl'}})).status,400);
assert.equal((await invoke(api,{method:'POST',headers:origin,body:{...attempt,grade:'9'}})).status,400);
assert.equal((await invoke(api,{method:'POST',headers:origin,body:{...attempt,attemptToken:'x'}})).status,400);
assert.equal((await invoke(api,{method:'POST',headers:{origin:'https://evil.invalid',host:'minhthanhmath.vn'},body:attempt})).status,403);
assert.equal(calls.length,before);
const denied=createHsaRankApi(()=>env,async()=>new Response('{}',{status:403}));
assert.equal((await invoke(denied,{method:'POST',headers:origin,body:JSON.stringify(attempt)})).status,403);
const weird=createHsaRankApi(()=>env,async()=>new Response(JSON.stringify({status:'hacked'})));
assert.equal((await invoke(weird,{method:'POST',headers:origin,body:attempt})).status,503);
console.log('Đạt API: tắt mặc định, origin, whitelist trường, tên lọc lại phía máy chủ, băm mã thiết bị, không nhận điểm.');

// 6. Lead EmailJS qua đường đăng ký có sẵn, có ghi chú điểm.
assert.equal(normalizeHsaPhone(''),'');
assert.equal(normalizeHsaPhone('+84 967 365 413'),'0967365413');
assert.throws(()=>normalizeHsaPhone('12345'));
const lead=hsaLeadPayload({name:'Minh Anh',grade:'khac',phone:'0967 365 413',scoreText:'7,5/10',examTitle:'Đề mẫu số 1',leadSource:'Nguồn: facebook'});
assert.equal(lead.phone,'0967365413');assert.equal(lead.grade,'hsa');assert.equal(lead.notes,'Thi thử HSA: 7,5/10');
assert.match(lead.message,/^Thi thử HSA: 7,5\/10 · Đề mẫu số 1/);assert.match(lead.message,/— Nguồn: facebook/);assert.equal(lead.lead_source,'Nguồn: facebook');
console.log('Đạt lead: dùng normalizeRegistration/emailRegistration, ghi chú "Thi thử HSA: <điểm>".');

// 7. Đường dẫn công khai.
assert.ok(PUBLIC_PATHS.includes('/thi-thu-hsa'));
const meta=routeMetadata('/thi-thu-hsa','www.minhthanhmath.vn');
assert.equal(meta.title,'Thi thử HSA miễn phí | Minh Thành Math');assert.equal(meta.robots,'index, follow');
assert.ok(json('vercel.json').rewrites.some((x:any)=>x.source==='/thi-thu-hsa'&&x.destination==='/index.html'));
console.log('Đạt route /thi-thu-hsa: PUBLIC_PATHS, tiêu đề, mô tả, rewrite Vercel.');
