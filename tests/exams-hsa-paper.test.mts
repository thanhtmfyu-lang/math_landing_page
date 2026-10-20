import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {convertHsaPaper} from '../scripts/convert-hsa-paper.mjs';
import {validatePracticeExam,validateQuestionOnlyPracticeExam} from '../src/native/exams/data';
import {scorePracticeAssessment} from '../src/native/exams/flexible-profile';
import {readSecret} from '../scripts/de-thi-kho.mjs';
// Đề thi thử HSA số 01 và 02: tệp của tổ Học liệu chuyển nguyên văn sang định dạng đề web. Không sửa đề, đáp án, lời giải.
const root=process.env.MTM_ROOT!;
const require=createRequire(join(root,'package.json'));
const read=(p:string)=>readFileSync(join(root,p),'utf8');
// Đáp án, lời giải, tệp đề gốc và migration seed không còn trong kho công khai (20/10): đọc bản gốc ở thư mục riêng (MTM_DE_THI_DIR).
const secret=(p:string)=>{const t=readSecret(root,p);if(t==null){console.log('BỎ QUA phần đáp án: thiếu bản gốc '+p+' (đặt MTM_DE_THI_DIR).');process.exit(0);}return t;};
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{buildSync}=require('esbuild');
const code=buildSync({entryPoints:[join(root,'src/native/exams/HsaPaperReader.tsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty','.json':'json'},logLevel:'silent'}).outputFiles[0].text;
const mod={exports:{} as any};new Function('require','module','exports',code)((id:string)=>id.endsWith('.css')?{}:require(id),mod,mod.exports);
const {HsaText,HsaDataTable,HsaSolutionExtra,default:HsaPaperReader}=mod.exports;
const html=(c:any,p:any)=>renderToStaticMarkup(React.createElement(c,p));
const tableOf=(b:any)=>({title:b.tieu_de,columns:b.cot,rows:b.hang});

type Spec={n:string;groups:number[][];tables:number[]};
const PAPERS:Spec[]=[{n:'01',groups:[[31,32,33],[35,36,37]],tables:[]},{n:'02',groups:[[34,35,36],[47,48,49]],tables:[37,40]}];
for(const {n,groups,tables} of PAPERS){
 const id='mtm-hsa-thi-thu-'+n,tag='[đề '+n+'] ';
 const sourceText=secret('tools/hsa-papers/de-thi-thu-hsa-'+n+'.json'),src=JSON.parse(sourceText);
 const delivered='/mnt/project-files/lo-trinh-web/thi-thu-hsa/de-thi-thu-hsa-'+n+'.json';
 if(existsSync(delivered))assert.equal(readFileSync(delivered,'utf8'),sourceText,'Bản trong repo phải trùng byte với tệp tổ Học liệu giao.');
 assert.equal(src.ma_de,n==='01'?'HSA-MTM-01':id);
 const key=JSON.parse(secret('src/native/exams/hsa-papers/'+id+'.key.json'));
 const pub=JSON.parse(read('src/native/exams/hsa-papers/'+id+'.public.json'));

 // 1. Tệp sinh ra đúng bằng kết quả chạy lại bộ chuyển (không ai sửa tay).
 const fresh=convertHsaPaper(sourceText,{id,title:key.title});
 assert.deepEqual(key,fresh.full);
 assert.deepEqual(pub,fresh.public);
 console.log(tag+'Đạt: tệp đề web đúng bằng kết quả chạy lại scripts/convert-hsa-paper.mjs.');

 // 2. Cấu trúc: 50 câu / 75 phút, 35 trắc nghiệm 4 phương án + 15 điền số; điểm chia đều 10 000 phần nghìn.
 assert.equal(key.questions.length,50);assert.equal(key.durationMinutes,75);assert.equal(src.thoi_gian_phut,75);
 assert.equal(key.questions.filter((q:any)=>q.kind==='mc').length,35);
 assert.equal(key.questions.filter((q:any)=>q.kind==='short').length,15);
 assert.ok(key.questions.filter((q:any)=>q.kind==='short').every((q:any)=>q.mode==='numeric'));
 assert.ok(key.questions.every((q:any)=>q.maxMillipoints===200));
 assert.equal(src.cau_truc.tong_so_cau,50);assert.equal(src.tong_hop_kiem_dinh.so_cau_khop,50);
 console.log(tag+'Đạt cấu trúc: 50 câu, 75 phút, 35 trắc nghiệm + 15 điền số, mỗi câu 200/10 000, kiểm định 50/50.');

 // 3. Từng câu giữ nguyên văn: đề bài, phương án, đáp án, lời giải, thứ tự.
 src.cau_hoi.forEach((s:any,i:number)=>{
  const q=key.questions[i],at=tag+'câu '+s.stt;
  assert.equal(q.id,s.id,at);assert.equal(q.prompt,s.de_bai,at);assert.equal(q.solution,s.loi_giai,at);
  if(s.dang==='mcq'){assert.equal(q.kind,'mc',at);assert.deepEqual(q.choices,['A','B','C','D'].map(l=>s.lua_chon[l]),at);assert.equal(q.answer,s.dap_an,at);}
  else{assert.equal(s.dang,'dien_so',at);assert.equal(q.kind,'short',at);assert.deepEqual(q.acceptedAnswers,[s.dap_an],at);}
 });
 console.log(tag+'Đạt nguyên văn: 50/50 câu giữ đúng đề bài, phương án, đáp án, lời giải và thứ tự của tệp nguồn.');

 // 4. Câu chùm và bảng: dữ liệu dùng chung, bảng giữ nguyên từng ô, đúng các câu trong cau_truc.
 const stt=(qid:string)=>src.cau_hoi.find((q:any)=>q.id===qid).stt,byStt=(k:number)=>src.cau_hoi.find((q:any)=>q.stt===k);
 assert.deepEqual(pub.groups.map((g:any)=>[g.id,g.questionIds.map(stt)]),src.cau_truc.cau_chum.trong_de_nay.map((d:any)=>[d.chum,d.cau]));
 assert.deepEqual(pub.groups.map((g:any)=>g.questionIds.map(stt)),groups);
 for(const g of pub.groups)for(const qid of g.questionIds){const s=src.cau_hoi.find((q:any)=>q.id===qid);assert.equal(g.text,s.dan_chung);assert.deepEqual(g.table,s.bang?tableOf(s.bang):undefined);}
 assert.deepEqual(Object.keys(pub.tables??{}).map(stt),tables);
 for(const k of tables)assert.deepEqual(pub.tables[byStt(k).id],tableOf(byStt(k).bang));
 const withTable=src.cau_hoi.filter((q:any)=>q.bang).map((q:any)=>q.stt);
 assert.deepEqual(withTable,[...pub.groups.filter((g:any)=>g.table).flatMap((g:any)=>g.questionIds.map(stt)),...tables].sort((a,b)=>a-b));
 assert.ok(!JSON.stringify(key).includes('"bang"')&&!JSON.stringify(key.questions).includes('"table'),'Bảng không nằm trong đề chấm');
 console.log(tag+`Đạt chùm và bảng: chùm ${groups.map(g=>g[0]+'–'+g[g.length-1]).join(', ')}; bảng ở câu ${withTable.join(', ')||'(không có)'}, đúng từng ô.`);

 // 5. Bản công khai không có đáp án, lời giải; còn lại trùng bản đầy đủ, cùng versionHash.
 const pubText=JSON.stringify(pub);
 assert.ok(!/"(answer|acceptedAnswers|solution|solutionBlocks)"/.test(pubText));
 for(const s of src.cau_hoi)assert.ok(!pubText.includes(JSON.stringify(s.loi_giai).slice(1,-1)),'lời giải câu '+s.stt+' lọt vào bản công khai');
 assert.equal(pub.exam.versionHash,key.versionHash);assert.equal(pub.exam.serverGraded,true);assert.equal(pub.exam.responseMode,'questions-only');
 pub.exam.questions.forEach((q:any,i:number)=>{const {answer:_a,acceptedAnswers:_k,solution:_s,...rest}=key.questions[i];assert.deepEqual(q,rest);});
 console.log(tag+'Đạt bản công khai: chỉ câu hỏi, dữ liệu chùm và bảng; không đáp án/lời giải; cùng versionHash.');

 // 6. Bộ kiểm và bộ chấm của web nhận đề; đúng hết = 10 điểm; dấu phẩy hay dấu chấm thập phân đều được.
 assert.ok(validatePracticeExam(key).valid,JSON.stringify(validatePracticeExam(key)));
 assert.ok(validateQuestionOnlyPracticeExam(pub.exam).valid);
 const answers=(dot=false)=>Object.fromEntries(key.questions.map((q:any)=>[q.id,q.kind==='mc'?q.answer:dot?q.acceptedAnswers[0].replace(',','.'):q.acceptedAnswers[0]]));
 const earned=(a:unknown)=>{const r=scorePracticeAssessment(key,a,'qa');assert.ok(r.ok);return (r as any).finalMillipoints??(r as any).earnedMillipoints;};
 assert.equal(earned(answers()),10000);assert.equal(earned(answers(true)),10000);assert.equal(earned({}),0);
 const firstShort=key.questions.find((q:any)=>q.kind==='short'),oneWrong={...answers(),[firstShort.id]:'999999'};
 assert.equal(earned(oneWrong),9800);
 console.log(tag+'Đạt chấm: đúng hết 10 000, sai một câu 9 800, bỏ trắng 0; nhận cả dấu phẩy và dấu chấm.');

 // 7. Hiển thị: mọi công thức $...$ dựng được (KaTeX, hoặc bản MathML đã duyệt sẵn của MathText); dữ liệu chùm hiện một lần; bảng là bảng thật.
 const cells=[...pub.groups.flatMap((g:any)=>g.table?[g.table]:[]),...Object.values(pub.tables??{})].flatMap((t:any)=>[t.title,...t.columns,...t.rows.flat()]);
 const texts=[...key.questions.flatMap((q:any)=>[q.prompt,q.solution,...(q.choices??[])]),...pub.groups.map((g:any)=>g.text),...cells];
 let formulas=0;
 for(const t of texts){
  const out=html(HsaText,{text:t});
  const k=t.split('\n').reduce((m:number,l:string)=>m+(l.match(/\$[^$\n]+\$/g)?.length??0),0);formulas+=k;
  assert.ok(!out.includes('<code>'),'KaTeX không dựng được: '+t.slice(0,80));
  assert.equal((out.match(/class="mtm-formula[^"]*"/g)??[]).length,k,'Số công thức dựng ra khác số $...$: '+t.slice(0,80));
  assert.ok(!/\*\*/.test(out),'Còn dấu ** chưa thành chữ đậm');
 }
 assert.ok(formulas>100);
 const page=html(HsaPaperReader,{exam:pub.exam,groups:pub.groups,tables:pub.tables});
 assert.equal((page.match(/<article/g)??[]).length,50);
 assert.equal((page.match(/class="hsa-stimulus"/g)??[]).length,groups.length);
 assert.ok(page.indexOf('class="hsa-stimulus"')<page.indexOf('Câu '+groups[0][0]+'<'));
 assert.equal((page.match(/hsa-short-note/g)??[]).length,15);
 const tableCount=pub.groups.filter((g:any)=>g.table).length+tables.length;
 assert.equal((page.match(/<table class="hsa-table"/g)??[]).length,tableCount,'Mỗi bảng hiện một lần trong danh sách đề');
 // Bảng của câu đơn nằm sau đề bài của chính câu đó; sau khi nộp, lời giải hiện lại bảng.
 for(const k of tables){const q=pub.exam.questions.find((x:any)=>x.id===byStt(k).id),at=page.indexOf('Câu '+k+'<');
  assert.ok(at>0&&page.indexOf('class="hsa-table"',at)<page.indexOf('Câu '+(k+1)+'<'));
  assert.match(html(HsaSolutionExtra,{groups:pub.groups,tables:pub.tables,question:q}),/<table class="hsa-table"/);}
 for(const g of pub.groups.filter((x:any)=>x.table))assert.match(html(HsaSolutionExtra,{groups:pub.groups,tables:pub.tables,question:{id:g.questionIds[1]}}),/<table class="hsa-table"/);
 console.log(tag+`Đạt hiển thị: ${formulas} công thức dựng được, 50 câu, mỗi chùm hiện một lần, ${tableCount} bảng HTML.`);
}

// 8. Bảng HTML thật: tiêu đề (figcaption, ngoài vùng cuộn), hàng tiêu đề cột, tiêu đề hàng, ô có công thức dựng bằng KaTeX, khung cuộn ngang.
const t=html(HsaDataTable,{table:{title:'Bảng $x$',columns:['Nhóm','$[0;10)$','$[10;20)$'],rows:[['Tần số','$4$','x']]}});
assert.match(t,/^<figure class="hsa-figure"><figcaption id="([^"]+)" class="hsa-table-title">.*Bảng .*<\/figcaption><div class="hsa-table-wrap" role="region" aria-labelledby="\1" tabindex="0"><table class="hsa-table" aria-labelledby="\1">/);
assert.match(t,/<thead><tr><th scope="col"[^>]*>.*Nhóm.*<\/th><th scope="col"/);
assert.match(t,/<tbody><tr><th scope="row"[^>]*>.*Tần số.*<\/th><td[ >]/);
assert.equal((t.match(/class="mtm-formula/g)??[]).length,4);
const css=read('src/native/exams/hsa-mock.css');
assert.match(css,/\.hsa-table-wrap\{[^}]*overflow-x:auto/);
console.log('Đạt bảng HTML: tiêu đề ngoài vùng cuộn, thead/tbody, th scope cột/hàng, công thức trong ô, cuộn ngang trên điện thoại.');

// 9. Bộ chuyển dừng thay vì đoán khi tệp nguồn có thứ không biểu diễn được.
const src1=secret('tools/hsa-papers/de-thi-thu-hsa-01.json'),src2=secret('tools/hsa-papers/de-thi-thu-hsa-02.json');
const mutate=(text:string,f:(s:any)=>void)=>{const s=JSON.parse(text);f(s);return ()=>convertHsaPaper(JSON.stringify(s),{id:'mtm-hsa-thi-thu-xx'});};
const mc=(s:any)=>s.cau_hoi.find((q:any)=>q.dang==='mcq'),num=(s:any)=>s.cau_hoi.find((q:any)=>q.dang==='dien_so'),q=(s:any,k:number)=>s.cau_hoi.find((x:any)=>x.stt===k);
for(const bad of [
 mutate(src1,s=>{mc(s).dap_an='E';}),
 mutate(src1,s=>{num(s).dap_an_so=num(s).dap_an_so+1;}),
 mutate(src1,s=>{num(s).dap_an='khoảng 3';}),
 mutate(src1,s=>{s.cau_hoi[31].dan_chung+=' ';}),
 mutate(src1,s=>{mc(s).de_bai+='\n![hình](a.png)';}),
 mutate(src1,s=>{mc(s).de_bai+='\n| x | y |\n|---|---|';}),
 mutate(src1,s=>{mc(s).kiem_dinh.ket_qua='LỆCH';}),
 mutate(src1,s=>{mc(s).dung_sai=0.01;}),
 mutate(src1,s=>{s.cau_hoi.pop();}),
 mutate(src2,s=>{q(s,37).bang.hang[0].pop();}),
 mutate(src2,s=>{q(s,37).bang.ghi_chu='?';}),
 mutate(src2,s=>{q(s,40).bang.hang[0][1]=210;}),
 mutate(src2,s=>{q(s,40).bang.cot=['Một cột'];}),
 mutate(src2,s=>{q(s,40).bang.tieu_de='';}),
 mutate(src2,s=>{q(s,40).bang.hang[1][0]='![hình](a.png)';}),
 mutate(src2,s=>{q(s,35).bang.hang[0][1]='7';}),
 mutate(src2,s=>{delete q(s,48).bang;}),
 mutate(src2,s=>{q(s,40).bang=[['a','b']];}),
])assert.throws(bad,/Không chuyển được đề/);
console.log('Đạt bộ chuyển: dừng khi đáp án lạ, số không khớp, chùm lệch, có ảnh/bảng markdown, chưa kiểm định, trường lạ, thiếu câu, bảng sai hình dạng hoặc lệch trong chùm.');
