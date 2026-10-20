import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {convertGiuaKy,gk1Points,GK1_PAPERS as SOURCES,GK1_MIGRATION,GK1_MIGRATION_0203,GK1_RUBRIC} from '../scripts/convert-de-giua-ky.mjs';
import {validatePracticeExam,validateQuestionOnlyPracticeExam} from '../src/native/exams/data';
import {validateMtmAssessment} from '../src/native/exams/mtm-profile';
import {scorePracticeAssessment} from '../src/native/exams/flexible-profile';
import {GK1_GRADES,GK1_MA,parseGk1Grade,parseGk1Ma,gk1Paper,gk1Gaps,gk1Interest,formatGk1Score,gk1Url} from '../src/native/exams/de-giua-ky';
import {routeMetadata,PUBLIC_PATHS} from '../src/migration/route-policy';
import {readSecret} from '../scripts/de-thi-kho.mjs';
// Đề ôn giữa kỳ I Toán 10/11/12 (Quyết định số 8): tệp của tổ soạn đề chuyển nguyên văn sang định dạng đề web. Không sửa đề, đáp án, lời giải.
const root=process.env.MTM_ROOT!;
const require=createRequire(join(root,'package.json'));
const read=(p:string)=>readFileSync(join(root,p),'utf8');
const json=(p:string)=>JSON.parse(read(p));
// Đáp án, lời giải, tệp đề gốc và migration seed không còn trong kho công khai (20/10): đọc bản gốc ở thư mục riêng (MTM_DE_THI_DIR).
const secret=(p:string)=>{const t=readSecret(root,p);if(t==null){console.log('BỎ QUA phần đáp án: thiếu bản gốc '+p+' (đặt MTM_DE_THI_DIR).');process.exit(0);}return t;};
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{buildSync}=require('esbuild');
const code=buildSync({entryPoints:[join(root,'src/native/exams/GiuaKyReader.tsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty','.json':'json'},logLevel:'silent'}).outputFiles[0].text;
const mod={exports:{} as any};new Function('require','module','exports',code)((id:string)=>id.endsWith('.css')?{}:require(id),mod,mod.exports);
const {GkText,default:GiuaKyReader}=mod.exports;
const html=(c:any,p:any)=>renderToStaticMarkup(React.createElement(c,p));
const earnedOf=(key:any,a:unknown)=>{const r=scorePracticeAssessment(key,a,'qa');assert.ok(r.ok,JSON.stringify(r));return (r as any).finalMillipoints??(r as any).earnedMillipoints;};
const fullAnswers=(key:any,dot=false)=>Object.fromEntries(key.questions.map((q:any)=>[q.id,q.kind==='short'?(dot?q.acceptedAnswers[0].replace(',','.'):q.acceptedAnswers[0]):q.answer]));
const sql=secret(GK1_MIGRATION),sql0203=secret(GK1_MIGRATION_0203);

for(const p of SOURCES){
 const tag='[lớp '+p.grade+' mã '+p.ma+'] ',seed=p.ma==='01'?sql:sql0203;
 const sourceText=secret('tools/de-giua-ky-1/'+p.file),src=JSON.parse(sourceText);
 const delivered=p.ma==='01'?`/mnt/project-files/cong-ty-ai/xuong-y-tuong/de-giua-ky-1/lop-${p.grade}/${p.file}`:'/khong-co';
 if(existsSync(delivered))assert.equal(readFileSync(delivered,'utf8'),sourceText,'Bản trong repo phải trùng byte với tệp tổ soạn đề giao.');
 // 0. Kiểm định của tổ soạn đề: đủ 22/22 câu KHỚP (từng ý Đ/S nếu có ghi riêng).
 assert.equal(src.tong_hop_kiem_dinh.so_cau_khop,22);assert.equal(src.tong_hop_kiem_dinh.tong_so_cau,22);
 assert.ok(src.cau_hoi.every((q:any)=>q.kiem_dinh?.ket_qua==='KHỚP'&&(!q.kiem_dinh.tung_y||Object.values(q.kiem_dinh.tung_y).every(v=>v==='KHỚP'))));
 const key=JSON.parse(secret('src/native/exams/de-giua-ky/'+p.id+'.key.json')),pub=json('src/native/exams/de-giua-ky/'+p.id+'.public.json');
 assert.equal(gk1Paper(p.grade as 10|11|12,p.ma as '01').examId,p.id);

 // 1. Tệp sinh ra đúng bằng kết quả chạy lại bộ chuyển (không ai sửa tay).
 const fresh=convertGiuaKy(sourceText,{id:p.id,grade:p.grade,ma:p.ma});
 assert.deepEqual(key,fresh.full);assert.deepEqual(pub,fresh.public);
 console.log(tag+'Đạt: tệp đề web đúng bằng kết quả chạy lại scripts/convert-de-giua-ky.mjs; kiểm định 22/22 KHỚP.');

 // 2. Cấu trúc theo cau_truc: 12 trắc nghiệm 0,25; 4 đúng/sai 1 điểm (0,1/0,25/0,5/1); 6 trả lời ngắn 0,5; 90 phút.
 assert.equal(key.rubricVersion,GK1_RUBRIC);assert.equal(key.grade,p.grade);assert.equal(key.period,'GK1');
 assert.equal(key.durationMinutes,src.thoi_gian_phut);assert.equal(key.durationMinutes,90);
 assert.deepEqual(key.questions.map((q:any)=>q.kind).join(','),[...Array(12).fill('mc'),...Array(4).fill('tf'),...Array(6).fill('short')].join(','));
 assert.ok(key.questions.filter((q:any)=>q.kind==='mc').every((q:any)=>q.maxMillipoints===250));
 assert.ok(key.questions.filter((q:any)=>q.kind==='tf').every((q:any)=>q.maxMillipoints===1000&&JSON.stringify(q.pointsByCorrectCount)==='[0,100,250,500,1000]'));
 assert.ok(key.questions.filter((q:any)=>q.kind==='short').every((q:any)=>q.maxMillipoints===500&&q.mode==='numeric'));
 assert.equal(key.questions.reduce((s:number,q:any)=>s+q.maxMillipoints,0),10000);
 const pts=gk1Points(src.cau_truc);assert.deepEqual([pts.mc,pts.tf,pts.short],[250,1000,500]);
 console.log(tag+'Đạt cấu trúc: 12×0,25 + 4×1 (Đ/S 0,1/0,25/0,5/1) + 6×0,5 = 10 điểm, 90 phút.');

 // 3. Từng câu giữ nguyên văn: đề bài, phương án, 4 ý, đáp án, lời giải, thứ tự.
 src.cau_hoi.forEach((s:any,i:number)=>{
  const q=key.questions[i],at=tag+'câu '+s.stt;
  assert.equal(q.id,s.id,at);assert.equal(q.prompt,s.de_bai,at);assert.equal(q.solution,s.loi_giai,at);
  if(s.dang==='mcq'){assert.deepEqual(q.choices,['A','B','C','D'].map(l=>s.lua_chon[l]),at);assert.equal(q.answer,s.dap_an,at);}
  else if(s.dang==='dung_sai'){assert.deepEqual(q.statements,s.y.map((y:any)=>y.noi_dung),at);assert.deepEqual(q.answer,s.y.map((y:any)=>y.dap_an),at);}
  else{assert.equal(s.dang,'dien_so',at);assert.deepEqual(q.acceptedAnswers,[s.dap_an],at);assert.ok(s.dap_an.length<=4,at);}
  assert.deepEqual(pub.topics[s.id],{chuDe:s.chu_de,mucDo:s.muc_do},at);
 });
 console.log(tag+'Đạt nguyên văn: 22/22 câu giữ đúng đề bài, phương án, 16 ý Đ/S, đáp án, lời giải và thứ tự.');

 // 4. Bản công khai không có đáp án, lời giải; còn lại trùng bản đầy đủ, cùng versionHash.
 const pubText=JSON.stringify(pub);
 assert.ok(!/"(answer|acceptedAnswers|solution|solutionBlocks|dap_an|loi_giai|sourceUrl|answerVerificationNote)"/.test(pubText));
 for(const s of src.cau_hoi)assert.ok(!pubText.includes(JSON.stringify(s.loi_giai).slice(1,-1)),'lời giải câu '+s.stt+' lọt vào bản công khai');
 assert.equal(pub.exam.versionHash,key.versionHash);assert.equal(pub.exam.serverGraded,true);assert.equal(pub.exam.responseMode,'questions-only');
 pub.exam.questions.forEach((q:any,i:number)=>{const {answer:_a,acceptedAnswers:_k,solution:_s,...rest}=key.questions[i];assert.deepEqual(q,rest);});
 console.log(tag+'Đạt bản công khai: chỉ câu hỏi và chủ đề; không đáp án/lời giải; cùng versionHash.');

 // 5. Bộ kiểm của web nhận đề (hồ sơ MTM 12/4/6) và bản công khai; bản máy chủ trả về sau khi nộp (public_exam(e,true) của 060) cũng hợp lệ.
 assert.ok(validatePracticeExam(key).valid,JSON.stringify(validatePracticeExam(key)));
 assert.ok(validateMtmAssessment(key).valid);
 assert.ok(validateQuestionOnlyPracticeExam(pub.exam).valid,JSON.stringify(validateQuestionOnlyPracticeExam(pub.exam)));
 const {sourceUrl:_u,answerVerificationNote:_n,...kept}=key;
 const review={...kept,serverGraded:true,sourceRef:'MTM sưu tầm và biên soạn',sourceMaterial:{title:'MTM sưu tầm và biên soạn',publisher:'MTM sưu tầm và biên soạn',version:'Bản đề MTM',locator:'Bản đề MTM'}};
 assert.ok(validatePracticeExam(review).valid,'bản xem lại của máy chủ phải hợp lệ');
 console.log(tag+'Đạt bộ kiểm: bản đầy đủ, bản công khai và bản xem lại của máy chủ đều hợp lệ.');

 // 6. Chấm: đúng hết 10; dấu phẩy hay chấm thập phân đều được; bỏ trắng 0; trừ đúng điểm từng dạng.
 assert.equal(earnedOf(key,fullAnswers(key)),10000);assert.equal(earnedOf(key,fullAnswers(key,true)),10000);assert.equal(earnedOf(key,{}),0);
 const mc=key.questions.find((q:any)=>q.kind==='mc'),sh=key.questions.find((q:any)=>q.kind==='short');
 assert.equal(earnedOf(key,{...fullAnswers(key),[mc.id]:['A','B','C','D'].find(l=>l!==mc.answer)}),9750);
 assert.equal(earnedOf(key,{...fullAnswers(key),[sh.id]:'9999'}),9500);
 // Phần II theo quy tắc của Bộ: số ý đúng 0..4 -> 0; 0,1; 0,25; 0,5; 1 điểm. Ý bỏ trống tính là chưa đúng.
 for(const tf of key.questions.filter((q:any)=>q.kind==='tf')){
  const flip=(n:number)=>tf.answer.map((v:boolean,i:number)=>i<n?!v:v);
  assert.deepEqual([4,3,2,1,0].map(n=>earnedOf(key,{[tf.id]:flip(n)})),[0,100,250,500,1000]);
  assert.equal(earnedOf(key,{[tf.id]:[tf.answer[0],null,null,null]}),100);
  assert.equal(earnedOf(key,{[tf.id]:[tf.answer[0],tf.answer[1],null,!tf.answer[3]]}),250);
  assert.equal(earnedOf(key,{...fullAnswers(key),[tf.id]:flip(1)}),9500);
 }
 console.log(tag+'Đạt chấm: đúng hết 10, sai 1 trắc nghiệm 9,75, sai 1 trả lời ngắn 9,5; Đ/S 0/0,1/0,25/0,5/1 theo số ý đúng.');

 // 7. Hiển thị: mọi công thức $...$ dựng được bằng KaTeX (hoặc MathML đã duyệt); **đậm** thành chữ đậm; đọc đề đủ 22 câu.
 const texts=key.questions.flatMap((q:any)=>[q.prompt,q.solution,...(q.choices??[]),...(q.statements??[])]);
 let formulas=0;
 for(const t of texts){
  const out=html(GkText,{text:t}),k=t.split('\n').reduce((m:number,l:string)=>m+(l.match(/\$[^$\n]+\$/g)?.length??0),0);formulas+=k;
  assert.ok(!out.includes('<code>'),'KaTeX không dựng được: '+t.slice(0,80));
  assert.equal((out.match(/class="mtm-formula[^"]*"/g)??[]).length,k,'Số công thức dựng ra khác số $...$: '+t.slice(0,80));
  assert.ok(!/\*\*/.test(out),'Còn dấu ** chưa thành chữ đậm');
 }
 assert.ok(formulas>150,'quá ít công thức: '+formulas);
 const page=html(GiuaKyReader,{exam:pub.exam});
 assert.equal((page.match(/<article/g)??[]).length,22);
 assert.equal((page.match(/class="gk1-statements"/g)??[]).length,4);
 assert.equal((page.match(/class="gk1-tf-letter"/g)??[]).length,16);
 assert.match(page,/Phần I|Trắc nghiệm/);
 console.log(tag+`Đạt hiển thị: ${formulas} công thức dựng được, 22 câu, 4 câu Đ/S đủ 16 ý.`);

 // 8. Migration 072 seed đúng khóa đề client đang dùng (cùng versionHash), mở lượt máy chủ.
 const b64=new RegExp(`values\\('${p.id}',convert_from\\(decode\\('([A-Za-z0-9+/=]+)','base64'\\),'UTF8'\\)::jsonb,true\\) on conflict\\(id\\) do nothing;`).exec(seed)?.[1];
 assert.ok(b64,'migration thiếu đề '+p.id);
 assert.deepEqual(JSON.parse(Buffer.from(b64!,'base64').toString('utf8')),key);
 console.log(tag+'Đạt migration '+(p.ma==='01'?'072':'078')+': seed đúng khóa đề, static_visible=true.');
}

// 9. Migration 072: chỉ seed exam_keys, có chặn khi chưa áp 060, không đụng bảng xếp hạng hay bộ chấm.
assert.match(sql,/^-- 072 /);assert.match(sql,/to_regprocedure\('mtm_exam_private\.grade\(jsonb,jsonb\)'\) is null/);
assert.match(sql,/\nbegin;\n[\s\S]*\ncommit;\n$/);
const body=sql.replace(/--.*$/gm,'');
assert.ok(!/mtm_hsa_rank|create |drop |alter |grant |revoke |update |delete /i.test(body),'072 chỉ được insert khóa đề');
assert.equal((body.match(/insert into mtm_exam_private\.exam_keys/g)??[]).length,3);
assert.ok(!/phone|sdt|so_dien_thoai/i.test(body));
console.log('Đạt migration 072: 3 khóa đề, chặn khi thiếu 060, không tạo/sửa/cấp quyền gì khác.');
// 9b. Migration 078 (mã 02, 03): cùng khuôn, 6 khóa đề mới, không đụng 3 đề mã 01 đã áp.
assert.match(sql0203,/^-- 078 /);assert.match(sql0203,/raise exception '078 cần áp 060/);assert.match(sql0203,/\nbegin;\n[\s\S]*\ncommit;\n$/);
const body2=sql0203.replace(/--.*$/gm,'');
assert.ok(!/mtm_hsa_rank|create |drop |alter |grant |revoke |update |delete /i.test(body2));
assert.equal((body2.match(/insert into mtm_exam_private\.exam_keys/g)??[]).length,6);assert.ok(!/-01'/.test(body2));
assert.ok(read(GK1_MIGRATION_0203).startsWith('-- ĐÃ GỠ ĐÁP ÁN'),'kho công khai chỉ giữ bản STUB của 078');
console.log('Đạt migration 078: 6 khóa đề mã 02/03, không đụng mã 01; kho công khai chỉ có STUB.');

// 10. Chỗ cần vá, ghi chú đăng ký, đường dẫn lớp.
assert.equal(parseGk1Grade('?lop=11'),11);assert.equal(parseGk1Grade('?lop=9'),null);assert.equal(parseGk1Grade(''),null);assert.equal(parseGk1Grade('?lop=hsa'),null);
assert.deepEqual(GK1_GRADES,[10,11,12]);assert.equal(gk1Url(12),'/de-giua-ky-1?lop=12');
assert.deepEqual(GK1_MA,['01','02','03']);assert.equal(gk1Url(10,'03'),'/de-giua-ky-1?lop=10&de=03');assert.equal(gk1Url(11,'01'),'/de-giua-ky-1?lop=11');
assert.equal(parseGk1Ma('?lop=10&de=02'),'02');assert.equal(parseGk1Ma('?lop=10'),'01');assert.equal(parseGk1Ma('?lop=10&de=09'),'01');
assert.equal(gk1Paper(12,'02').examId,'mtm-gk1-toan-12-02');
assert.equal(formatGk1Score(7350),'7,35');assert.equal(formatGk1Score(10000),'10');
const topics={a:{chuDe:'Mệnh đề',mucDo:'NB'},b:{chuDe:'Tập hợp',mucDo:'VD'},c:{chuDe:'Tam giác',mucDo:'TH'},d:{chuDe:'Tập hợp',mucDo:'VDC'},e:{chuDe:'Bất phương trình',mucDo:'VDC'},f:{chuDe:'Cosin',mucDo:'TH'}} as const;
const rows=[{id:'a',earnedMillipoints:0,maxMillipoints:250},{id:'b',earnedMillipoints:100,maxMillipoints:1000},{id:'c',earnedMillipoints:0,maxMillipoints:500},{id:'d',earnedMillipoints:0,maxMillipoints:500},{id:'e',earnedMillipoints:500,maxMillipoints:500},{id:'f',earnedMillipoints:null,maxMillipoints:250}];
assert.deepEqual(gk1Gaps(rows,topics).map(t=>t.chuDe),['Tập hợp','Tam giác','Mệnh đề']);
assert.deepEqual(gk1Gaps(rows.map(r=>({...r,earnedMillipoints:r.maxMillipoints})),topics),[]);
assert.equal(gk1Interest(10,'7,35',[]),'Đề giữa kỳ I Toán 10 trên web: 7,35/10');
assert.match(gk1Interest(12,'5',gk1Gaps(rows,topics)),/: 5\/10\. Cần vá: Tập hợp; Tam giác; Mệnh đề$/);
assert.ok(gk1Interest(11,'1',Array(40).fill({chuDe:'Phương trình lượng giác cơ bản và nâng cao',mucDo:'VD'})).length<=300);
console.log('Đạt chỗ cần vá: ưu tiên VD/VDC, rồi câu mất nhiều điểm, mỗi chủ đề một lần, tối đa 3; ghi chú đăng ký ≤ 300 ký tự.');

// 11. Route công khai, SEO, rewrite, sitemap, liên kết từ /thi-thu và /khoa-hoc.
assert.ok(PUBLIC_PATHS.includes('/de-giua-ky-1'));
const meta=routeMetadata('/de-giua-ky-1','www.minhthanhmath.vn','?lop=10');
assert.equal(meta.title,'Đề giữa kỳ I Toán 10, 11, 12 có lời giải | Minh Thành Math');assert.equal(meta.robots,'index, follow');assert.equal(meta.url,'https://www.minhthanhmath.vn/de-giua-ky-1');
assert.ok(meta.description.length>=80&&meta.description.length<=200&&/lời giải/.test(meta.description));
assert.ok(json('vercel.json').rewrites.some((x:any)=>x.source==='/de-giua-ky-1'&&x.destination==='/index.html'));
assert.match(read('scripts/public-sitemap.mjs'),/'\/de-giua-ky-1'/);
const app=read('src/App.tsx');assert.ok(app.includes("lazy(()=>import('./native/exams/DeGiuaKy'))")&&app.includes("path==='/de-giua-ky-1'?<DeGiuaKy search={route.search}/>"));
assert.ok(read('src/native/NativeExams.tsx').includes('href="/de-giua-ky-1"'));assert.ok(read('src/native/NativeCourses.tsx').includes("'/de-giua-ky-1'"));
console.log('Đạt route /de-giua-ky-1: PUBLIC_PATHS, tiêu đề + mô tả SEO, index, rewrite Vercel, sitemap, liên kết từ /thi-thu và /khoa-hoc.');

// 12. Trang: khóa đề không vào bản build production; không giá, một số liên hệ, không hứa điểm, không tên trường.
const pageSrc=read('src/native/exams/DeGiuaKy.tsx')+read('src/native/exams/de-giua-ky.ts')+read('src/native/exams/GiuaKyReader.tsx');
assert.match(pageSrc,/import\.meta\.env\.VITE_HSA_KEY_IN_BUNDLE==='0'\?\{\}:import\.meta\.glob<PracticeExam>\('\.\/de-giua-ky\/\*\.key\.json'/);
assert.equal((pageSrc.match(/\.key\.json/g)??[]).length,2,'chỉ một chỗ nạp khóa đề (glob có điều kiện) và một chỗ ghép tên tệp');
assert.ok(!/\d[\d.,]*\s*(?:đ|đồng|k|nghìn)(?=[\s.,;:!?)'"\/<]|$)|triệu|học phí/i.test(pageSrc),'không ghi giá');
const phones=[...pageSrc.matchAll(/(?:\+?84|0)(?:[\s.]?\d){8,10}/g)].map(m=>m[0].replace(/\D/g,''));assert.ok(phones.length>=2);for(const ph of phones)assert.equal(ph,'0967365413');
assert.ok(!/cam kết|đảm bảo điểm|chắc chắn đạt|đỗ 100|THPT [A-ZĐ]|trường chuyên/i.test(pageSrc));
assert.ok(pageSrc.includes('<RegisterSection/>')&&pageSrc.includes('requestRegistration(')&&pageSrc.includes('ZALO_ASSISTANT_URL'));
console.log('Đạt trang: khóa đề tách khỏi bản build khi VITE_HSA_KEY_IN_BUNDLE=0, không giá, chỉ 0967 365 413, không hứa điểm, có form đăng ký.');
