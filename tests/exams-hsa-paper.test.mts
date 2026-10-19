import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {convertHsaPaper} from '../scripts/convert-hsa-paper.mjs';
import {validatePracticeExam,validateQuestionOnlyPracticeExam} from '../src/native/exams/data';
import {scorePracticeAssessment} from '../src/native/exams/flexible-profile';
// Đề thi thử HSA số 01: tệp của tổ Học liệu chuyển nguyên văn sang định dạng đề web. Không sửa đề, đáp án, lời giải.
const root=process.env.MTM_ROOT!;
const require=createRequire(join(root,'package.json'));
const read=(p:string)=>readFileSync(join(root,p),'utf8');
const sourceText=read('tools/hsa-papers/de-thi-thu-hsa-01.json'),src=JSON.parse(sourceText);
const delivered='/mnt/project-files/lo-trinh-web/thi-thu-hsa/de-thi-thu-hsa-01.json';
if(existsSync(delivered))assert.equal(readFileSync(delivered,'utf8'),sourceText,'Bản trong repo phải trùng byte với tệp tổ Học liệu giao.');
const key=JSON.parse(read('src/native/exams/hsa-papers/mtm-hsa-thi-thu-01.key.json'));
const pub=JSON.parse(read('src/native/exams/hsa-papers/mtm-hsa-thi-thu-01.public.json'));

// 1. Tệp sinh ra đúng bằng kết quả chạy lại bộ chuyển (không ai sửa tay).
const fresh=convertHsaPaper(sourceText,{id:'mtm-hsa-thi-thu-01',title:key.title});
assert.deepEqual(key,fresh.full);
assert.deepEqual(pub,fresh.public);
console.log('Đạt: tệp đề web đúng bằng kết quả chạy lại scripts/convert-hsa-paper.mjs.');

// 2. Cấu trúc: 50 câu / 75 phút, 35 trắc nghiệm 4 phương án + 15 điền số; điểm chia đều 10 000 phần nghìn.
assert.equal(key.questions.length,50);assert.equal(key.durationMinutes,75);assert.equal(src.thoi_gian_phut,75);
assert.equal(key.questions.filter((q:any)=>q.kind==='mc').length,35);
assert.equal(key.questions.filter((q:any)=>q.kind==='short').length,15);
assert.ok(key.questions.filter((q:any)=>q.kind==='short').every((q:any)=>q.mode==='numeric'));
assert.ok(key.questions.every((q:any)=>q.maxMillipoints===200));
assert.equal(src.cau_truc.tong_so_cau,50);
console.log('Đạt cấu trúc: 50 câu, 75 phút, 35 trắc nghiệm + 15 điền số, mỗi câu 200/10 000.');

// 3. Từng câu giữ nguyên văn: đề bài, phương án, đáp án, lời giải, thứ tự.
src.cau_hoi.forEach((s:any,i:number)=>{
 const q=key.questions[i],at='câu '+s.stt;
 assert.equal(q.id,s.id,at);assert.equal(q.prompt,s.de_bai,at);assert.equal(q.solution,s.loi_giai,at);
 if(s.dang==='mcq'){assert.equal(q.kind,'mc',at);assert.deepEqual(q.choices,['A','B','C','D'].map(l=>s.lua_chon[l]),at);assert.equal(q.answer,s.dap_an,at);}
 else{assert.equal(s.dang,'dien_so',at);assert.equal(q.kind,'short',at);assert.deepEqual(q.acceptedAnswers,[s.dap_an],at);}
});
console.log('Đạt nguyên văn: 50/50 câu giữ đúng đề bài, phương án, đáp án, lời giải và thứ tự của tệp nguồn.');

// 4. Câu chùm: dữ liệu dùng chung giữ nguyên, đúng các câu trong cau_truc.
const stt=(id:string)=>src.cau_hoi.find((q:any)=>q.id===id).stt;
assert.deepEqual(pub.groups.map((g:any)=>[g.id,g.questionIds.map(stt)]),src.cau_truc.cau_chum.trong_de_nay.map((d:any)=>[d.chum,d.cau]));
assert.deepEqual(pub.groups.map((g:any)=>g.questionIds.map(stt)),[[31,32,33],[35,36,37]]);
for(const g of pub.groups)for(const id of g.questionIds)assert.equal(g.text,src.cau_hoi.find((q:any)=>q.id===id).dan_chung);
console.log('Đạt câu chùm: chùm A (31–33), chùm B (35–37), dữ liệu dùng chung nguyên văn.');

// 5. Bản công khai không có đáp án, lời giải; còn lại trùng bản đầy đủ, cùng versionHash.
const pubText=JSON.stringify(pub);
assert.ok(!/"(answer|acceptedAnswers|solution|solutionBlocks)"/.test(pubText));
for(const s of src.cau_hoi)assert.ok(!pubText.includes(JSON.stringify(s.loi_giai).slice(1,-1)),'lời giải câu '+s.stt+' lọt vào bản công khai');
assert.equal(pub.exam.versionHash,key.versionHash);assert.equal(pub.exam.serverGraded,true);assert.equal(pub.exam.responseMode,'questions-only');
pub.exam.questions.forEach((q:any,i:number)=>{const {answer:_a,acceptedAnswers:_k,solution:_s,...rest}=key.questions[i];assert.deepEqual(q,rest);});
console.log('Đạt bản công khai: chỉ câu hỏi và dữ liệu chùm, không đáp án/lời giải, cùng versionHash.');

// 6. Bộ kiểm và bộ chấm của web nhận đề; đúng hết = 10 điểm; dấu phẩy hay dấu chấm thập phân đều được.
assert.ok(validatePracticeExam(key).valid,JSON.stringify(validatePracticeExam(key)));
assert.ok(validateQuestionOnlyPracticeExam(pub.exam).valid);
const answers=(dot=false)=>Object.fromEntries(key.questions.map((q:any)=>[q.id,q.kind==='mc'?q.answer:dot?q.acceptedAnswers[0].replace(',','.'):q.acceptedAnswers[0]]));
const earned=(a:unknown)=>{const r=scorePracticeAssessment(key,a,'qa');assert.ok(r.ok);return (r as any).finalMillipoints??(r as any).earnedMillipoints;};
assert.equal(earned(answers()),10000);assert.equal(earned(answers(true)),10000);assert.equal(earned({}),0);
const firstShort=key.questions.find((q:any)=>q.kind==='short'),oneWrong={...answers(),[firstShort.id]:'999999'};
assert.equal(earned(oneWrong),9800);
console.log('Đạt chấm: đúng hết 10 000, sai một câu 9 800, bỏ trắng 0; nhận cả 2,46 và 2.46.');

// 7. Hiển thị: mọi công thức $...$ dựng được (KaTeX, hoặc bản MathML đã duyệt sẵn của MathText); mỗi chùm hiện dữ liệu một lần trong danh sách đề.
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{buildSync}=require('esbuild');
const code=buildSync({entryPoints:[join(root,'src/native/exams/HsaPaperReader.tsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty','.json':'json'},logLevel:'silent'}).outputFiles[0].text;
const mod={exports:{} as any};new Function('require','module','exports',code)((id:string)=>id.endsWith('.css')?{}:require(id),mod,mod.exports);
const {HsaText,default:HsaPaperReader}=mod.exports;
const texts=[...key.questions.flatMap((q:any)=>[q.prompt,q.solution,...(q.choices??[])]),...pub.groups.map((g:any)=>g.text)];
let formulas=0;
for(const t of texts){
 const html=renderToStaticMarkup(React.createElement(HsaText,{text:t}));
 const n=t.split('\n').reduce((m:number,l:string)=>m+(l.match(/\$[^$\n]+\$/g)?.length??0),0);formulas+=n;
 assert.ok(!html.includes('<code>'),'KaTeX không dựng được: '+t.slice(0,80));
 assert.equal((html.match(/class="mtm-formula[^"]*"/g)??[]).length,n,'Số công thức dựng ra khác số $...$: '+t.slice(0,80));
 assert.ok(!/\*\*/.test(html),'Còn dấu ** chưa thành chữ đậm');
}
assert.ok(formulas>100);
const page=renderToStaticMarkup(React.createElement(HsaPaperReader,{exam:pub.exam,groups:pub.groups}));
assert.equal((page.match(/<article/g)??[]).length,50);
assert.equal((page.match(/class="hsa-stimulus"/g)??[]).length,2);
assert.ok(page.indexOf('class="hsa-stimulus"')<page.indexOf('Câu 31<'));
assert.equal((page.match(/hsa-short-note/g)??[]).length,15);
console.log(`Đạt hiển thị: ${formulas} công thức dựng bằng KaTeX, 50 câu, dữ liệu mỗi chùm hiện một lần.`);

// 8. Bộ chuyển dừng thay vì đoán khi tệp nguồn có thứ không biểu diễn được.
const mutate=(f:(s:any)=>void)=>{const s=JSON.parse(sourceText);f(s);return ()=>convertHsaPaper(JSON.stringify(s),{id:'mtm-hsa-thi-thu-01'});};
const mc=(s:any)=>s.cau_hoi.find((q:any)=>q.dang==='mcq'),num=(s:any)=>s.cau_hoi.find((q:any)=>q.dang==='dien_so');
for(const bad of [
 mutate(s=>{mc(s).dap_an='E';}),
 mutate(s=>{num(s).dap_an_so=num(s).dap_an_so+1;}),
 mutate(s=>{num(s).dap_an='khoảng 3';}),
 mutate(s=>{s.cau_hoi[31].dan_chung+=' ';}),
 mutate(s=>{mc(s).de_bai+='\n![hình](a.png)';}),
 mutate(s=>{mc(s).de_bai+='\n| x | y |\n|---|---|';}),
 mutate(s=>{mc(s).kiem_dinh.ket_qua='LỆCH';}),
 mutate(s=>{mc(s).dung_sai=0.01;}),
 mutate(s=>{s.cau_hoi.pop();}),
])assert.throws(bad,/Không chuyển được đề/);
console.log('Đạt bộ chuyển: dừng khi đáp án lạ, số không khớp, chùm lệch, có ảnh/bảng, chưa kiểm định, trường lạ, thiếu câu.');
