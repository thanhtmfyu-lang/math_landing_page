// Chuyển đề ôn giữa kỳ I Toán 10/11/12 của Xưởng ý tưởng (JSON: ma_de, cau_truc, cau_hoi[...] dạng mcq, dung_sai, dien_so)
// sang định dạng đề của web (rubric MTM-THPT-3PART-2025-v1: 12 trắc nghiệm, 4 đúng/sai, 6 trả lời ngắn, như catalog.json).
// Chỉ đổi định dạng: không sửa đề bài, phương án, ý đúng/sai, đáp án hay lời giải. Gặp gì không biểu diễn được thì dừng và báo lỗi.
// Dùng: node scripts/de-thi-kho.mjs restore && node scripts/convert-de-giua-ky.mjs   (đọc tools/de-giua-ky-1/*.json, ghi:)
//   src/native/exams/de-giua-ky/<id>.public.json  chỉ câu hỏi + chủ đề/mức độ từng câu, không đáp án, không lời giải
//   src/native/exams/de-giua-ky/<id>.key.json     đề đầy đủ (đáp án, lời giải); bản build VITE_HSA_KEY_IN_BUNDLE=0 không chứa tệp này
//   $MTM_DE_THI_DIR/supabase/migrations-pending/072 (mã 01) và 078 (mã 02, 03): seed khóa đề vào mtm_exam_private.exam_keys (chấm trên máy chủ, 060)
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalDecimal,sha256} from './convert-hsa-paper.mjs';
import {privateDir} from './de-thi-kho.mjs';

export const GK1_RUBRIC='MTM-THPT-3PART-2025-v1';
export const GK1_MIGRATION='supabase/migrations-pending/202610190072_de_giua_ky_1.sql';
/** Đề mã 02, 03 (J21, 20/10/2026): seed riêng, không chạy lại 072 đã áp. */
export const GK1_MIGRATION_0203='supabase/migrations-pending/202610200078_de_giua_ky_1_ma_02_03.sql';
/** Các đề đang phát: lớp + mã đề -> tệp nguồn trong tools/de-giua-ky-1, mã đề trên web, migration seed khóa đề. */
export const GK1_PAPERS=['01','02','03'].flatMap(ma=>[10,11,12].map(grade=>({grade,ma,file:`de-giua-ky-1-toan-${grade}-mtm-${ma}.json`,id:`mtm-gk1-toan-${grade}-${ma}`,migration:ma==='01'?GK1_MIGRATION:GK1_MIGRATION_0203})));
const LETTERS=['A','B','C','D'],TF=['a','b','c','d'];
const fail=msg=>{throw new Error('Không chuyển được đề giữa kỳ: '+msg);};
const text=(v,where)=>{if(typeof v!=='string'||!v.trim())fail(where+' thiếu nội dung');if(/!\[|<img|\.(png|jpe?g|svg|gif|webp)\b/i.test(v))fail(where+' có hình ảnh, cần bổ sung cách hiển thị ảnh trước khi chuyển');if(/\n\s*\|.*\|/.test(v)||/\\begin\{tabular\}/.test(v))fail(where+' có bảng, cần bổ sung cách hiển thị bảng trước khi chuyển');if(v.split('\n').some(l=>(l.match(/\$/g)??[]).length%2))fail(where+' có công thức $...$ chưa đóng trên cùng dòng');return v;};
const MILLI=v=>{const m=Math.round(Number(v)*1000);if(!Number.isFinite(m)||Math.abs(m-Number(v)*1000)>1e-6)fail('điểm '+v+' không đổi được sang phần nghìn');return m;};

/** Điểm theo cau_truc (hai cách ghi: mảng phan[] hoặc đối tượng dang_cau_hoi{}). Phần II chấm theo quy tắc của Bộ:
 * đúng 1 ý 0,1 · 2 ý 0,25 · 3 ý 0,5 · 4 ý 1 điểm (tỉ lệ 1/10, 1/4, 1/2, 1 của điểm câu). */
export function gk1Points(ct){
 const list=Array.isArray(ct?.phan)?ct.phan:ct?.dang_cau_hoi?Object.entries(ct.dang_cau_hoi).map(([dang,p])=>({...p,dang})):fail('cau_truc không có phan/dang_cau_hoi');
 const by=Object.fromEntries(list.map(p=>[p.dang,p]));
 for(const k of ['mcq','dung_sai','dien_so'])if(!by[k])fail('cau_truc thiếu dạng '+k);
 const mc=MILLI(by.mcq.diem_moi_cau),short=MILLI(by.dien_so.diem_moi_cau),tfTotal=MILLI(by.dung_sai.tong_diem);
 if(tfTotal%by.dung_sai.so_cau)fail('điểm Phần II không chia đều');
 const tf=tfTotal/by.dung_sai.so_cau,rule=String(by.dung_sai.cach_cham??by.dung_sai.cham_diem??'');
 // Đối chiếu quy tắc chữ của tổ soạn với lịch điểm sẽ dùng (không suy diễn quy tắc khác).
 if(tf!==1000||!/0,1\b/.test(rule)||!/0,25\b/.test(rule)||!/0,5\b/.test(rule)||!/\b1(,0)?\s*điểm/.test(rule))fail('quy tắc chấm Phần II khác 0,1/0,25/0,5/1: '+rule);
 const schedule=[0,tf/10,tf/4,tf/2,tf];
 if(mc*by.mcq.so_cau+tf*by.dung_sai.so_cau+short*by.dien_so.so_cau!==10000)fail('tổng điểm khác 10');
 return {mc,tf,short,schedule,count:{mcq:by.mcq.so_cau,dung_sai:by.dung_sai.so_cau,dien_so:by.dien_so.so_cau}};
}

export function convertGiuaKy(sourceText,{id,grade,ma='01'}){
 if(!/^mtm-gk1-toan-1[0-2]-\d\d$/.test(id??''))fail('cần id dạng mtm-gk1-toan-1x-0y');
 const src=JSON.parse(sourceText),qs=src.cau_hoi,ct=src.cau_truc;
 if(!Array.isArray(qs)||qs.length!==22)fail('cần đúng 22 câu');
 if(ct?.tong_so_cau!==qs.length)fail('cau_truc.tong_so_cau khác số câu');
 if(!Number.isSafeInteger(src.thoi_gian_phut)||src.thoi_gian_phut<1||(ct.thoi_gian_phut!==undefined&&ct.thoi_gian_phut!==src.thoi_gian_phut))fail('thời gian không thống nhất');
 const kd=src.tong_hop_kiem_dinh;if(kd?.so_cau_khop!==qs.length||kd?.tong_so_cau!==qs.length)fail('tong_hop_kiem_dinh chưa đủ '+qs.length+'/'+qs.length+' câu khớp');
 const pts=gk1Points(ct);
 const order=[...Array(pts.count.mcq).fill('mcq'),...Array(pts.count.dung_sai).fill('dung_sai'),...Array(pts.count.dien_so).fill('dien_so')];
 const ids=new Set(),topics={};
 const questions=qs.map((q,i)=>{
  const where='câu '+(i+1);
  if(q.stt!==i+1)fail(where+': stt không đúng thứ tự');
  if(q.dang!==order[i])fail(where+': thứ tự dạng phải là 12 mcq, 4 dung_sai, 6 dien_so');
  if(q.lop!==grade)fail(where+': lớp '+q.lop+' khác '+grade);
  if(typeof q.id!=='string'||!/^[A-Za-z0-9-]+$/.test(q.id)||ids.has(q.id))fail(where+': id không hợp lệ hoặc trùng');ids.add(q.id);
  if(q.kiem_dinh?.ket_qua!=='KHỚP')fail(where+': chưa kiểm định KHỚP');
  if(q.kiem_dinh.tung_y&&Object.values(q.kiem_dinh.tung_y).some(v=>v!=='KHỚP'))fail(where+': có ý chưa kiểm định KHỚP');
  topics[q.id]={chuDe:text(q.chu_de,where+' chu_de'),mucDo:['NB','TH','VD','VDC'].includes(q.muc_do)?q.muc_do:fail(where+': muc_do lạ')};
  const base={id:q.id,kind:'',sourceRef:`${src.ma_de} · câu ${q.stt} · ${q.chu_de}`,prompt:text(q.de_bai,where+' de_bai')};
  let out;
  if(q.dang==='mcq'){
   if(Object.keys(q.lua_chon??{}).join('')!=='ABCD')fail(where+': lua_chon phải đúng A, B, C, D');
   const choices=LETTERS.map(l=>text(q.lua_chon[l],where+' phương án '+l));if(new Set(choices).size!==4)fail(where+': phương án trùng');
   if(!LETTERS.includes(q.dap_an))fail(where+': đáp án trắc nghiệm không hợp lệ');
   out={...base,kind:'mc',choices,answer:q.dap_an,maxMillipoints:pts.mc};
  }else if(q.dang==='dung_sai'){
   if('lua_chon' in q||'dap_an' in q)fail(where+': câu đúng/sai có lua_chon hoặc dap_an chung');
   if(!Array.isArray(q.y)||q.y.length!==4||q.y.some((y,j)=>y?.ky_hieu!==TF[j]||typeof y.dap_an!=='boolean'))fail(where+': cần 4 ý a, b, c, d có dap_an true/false');
   out={...base,kind:'tf',statements:q.y.map((y,j)=>text(y.noi_dung,where+' ý '+TF[j])),answer:q.y.map(y=>y.dap_an),pointsByCorrectCount:pts.schedule,maxMillipoints:pts.tf};
  }else{
   if('lua_chon' in q)fail(where+': câu trả lời ngắn có lua_chon');
   const c=canonicalDecimal(q.dap_an);if(c===null)fail(where+': đáp án "'+q.dap_an+'" không phải số thập phân');
   if(q.dap_an.length>4)fail(where+': đáp án quá 4 ký tự');
   if(typeof q.dap_an_so!=='number'||canonicalDecimal(String(q.dap_an_so))!==c)fail(where+': dap_an và dap_an_so không khớp');
   out={...base,kind:'short',mode:'numeric',acceptedAnswers:[q.dap_an],maxMillipoints:pts.short};
  }
  return {...out,solution:text(q.loi_giai,where+' loi_giai')};
 });
 const full={id,title:src.ten,grade,period:'GK1',durationMinutes:src.thoi_gian_phut,
  sourceHash:sha256(sourceText),sourceRef:`${src.ma_de} · ${src.don_vi_soan}`,questionCount:questions.length,answerKeyVerified:true,rubricVerified:true,
  rubricVersion:GK1_RUBRIC,sourceUrl:'https://www.minhthanhmath.vn/de-giua-ky-1?lop='+grade+(ma==='01'?'':'&de='+ma),
  sourceMaterial:{title:src.ten,publisher:src.don_vi_soan,version:`${src.ma_de} · ${src.ngay_soan}`,locator:`${questions.length} câu trong tệp đề ${src.ma_de}`},
  publicationVerified:true,questionDisplayVerified:true,
  answerVerificationNote:`Tổ soạn đề MTM kiểm định ${kd.so_cau_khop}/${kd.tong_so_cau} câu khớp. Chấm theo cấu trúc đề kiểm tra mới của Bộ GD&ĐT: Phần I mỗi câu 0,25 điểm; Phần II mỗi câu đúng 1 ý 0,1, 2 ý 0,25, 3 ý 0,5, 4 ý 1 điểm; Phần III mỗi câu 0,5 điểm.`,
  questions};
 full.versionHash=sha256(JSON.stringify(full));
 // Bản công khai: cùng versionHash; bỏ đáp án, lời giải, URL. Chấm trên máy chủ (mtm_exam_start/mtm_exam_submit của 060).
 const {sourceUrl:_u,answerVerificationNote:_n,...rest}=full;
 const publicExam={...rest,serverGraded:true,responseMode:'questions-only',questions:questions.map(({answer:_a,acceptedAnswers:_k,solution:_s,...q})=>q)};
 return {full,public:{exam:publicExam,topics},source:src};
}

export function gk1MigrationSql(fulls,so='072'){
 const rows=fulls.map(f=>`-- ${f.title} (${f.id}): ${f.questions.length} câu / ${f.durationMinutes} phút, versionHash ${f.versionHash}\ninsert into mtm_exam_private.exam_keys(id,exam,static_visible) values('${f.id}',convert_from(decode('${Buffer.from(JSON.stringify(f),'utf8').toString('base64')}','base64'),'UTF8')::jsonb,true) on conflict(id) do nothing;`).join('\n');
 const head=so==='072'?`-- 072 (19/10/2026): Đề ôn giữa kỳ I Toán 10, 11, 12 (Quyết định số 8) cho trang /de-giua-ky-1. CHƯA ÁP.
-- Số 071 đã dùng cho PR bảng tin trung tâm (202610190071_bang_tin_trung_tam.sql); file này dùng 072.`
 :`-- ${so} (20/10/2026): Đề ôn giữa kỳ I Toán 10, 11, 12 mã 02 và 03 cho trang /de-giua-ky-1 (?lop=1x&de=0y). CHƯA ÁP.
-- Cùng khuôn 072 (đã áp): chỉ thêm ${fulls.length} khóa đề mới; 077 là phòng thi thử nên file này dùng ${so}.`;
 return `${head}
-- Phụ thuộc 060 (mtm_exam_private.exam_keys, mtm_exam_start/mtm_exam_submit, bộ chấm mtm_exam_private.grade). Không cần 069/070/071.
-- Không đổi bộ chấm: grade() của 060 đã chấm câu đúng/sai theo pointsByCorrectCount [0,100,250,500,1000]
-- (đúng 1 ý 0,1; 2 ý 0,25; 3 ý 0,5; 4 ý 1 điểm), trắc nghiệm 250, trả lời ngắn 500 (nhận dấu phẩy hoặc chấm thập phân);
-- mtm_exam_start của 060 nhận rubric ${GK1_RUBRIC}. Migration này chỉ seed ${fulls.length} khóa đề (static_visible=true để mở lượt máy chủ).
-- JSON dưới đây đúng bằng src/native/exams/de-giua-ky/<id>.key.json, sinh bằng: node scripts/convert-de-giua-ky.mjs
-- Đáp án và lời giải chỉ trả về sau khi nộp (public_exam(e,true) của 060). Trang không có bảng xếp hạng nên không seed mtm_hsa_rank.
-- Tạm đóng một đề: update mtm_exam_private.exam_keys set static_visible=false where id='<id>';
begin;
do $guard$
begin
 if to_regclass('mtm_exam_private.exam_keys') is null or to_regprocedure('public.mtm_exam_start(text)') is null
  or to_regprocedure('public.mtm_exam_submit(uuid,text,jsonb)') is null or to_regprocedure('mtm_exam_private.grade(jsonb,jsonb)') is null then
  raise exception '${so} cần áp 060_exam_answer_privacy trước';
 end if;
end $guard$;
${rows}
commit;
`;
}

// Chỉ chạy CLI khi gọi trực tiếp tệp này.
if(process.argv[1]&&/convert-de-giua-ky\.mjs$/.test(process.argv[1])&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const root=fileURLToPath(new URL('../',import.meta.url)),out=join(root,'src/native/exams/de-giua-ky');
 mkdirSync(out,{recursive:true});
 const fulls=GK1_PAPERS.map(p=>{
  const r=convertGiuaKy(readFileSync(join(root,'tools/de-giua-ky-1',p.file),'utf8'),{id:p.id,grade:p.grade,ma:p.ma});
  writeFileSync(join(out,p.id+'.key.json'),JSON.stringify(r.full)+'\n');
  writeFileSync(join(privateDir(),'src/native/exams/de-giua-ky',p.id+'.key.json'),JSON.stringify(r.full)+'\n');
  writeFileSync(join(out,p.id+'.public.json'),JSON.stringify(r.public)+'\n');
  console.log(`Lớp ${p.grade} mã ${p.ma}: ${r.full.questions.length} câu, ${r.full.durationMinutes} phút, versionHash ${r.full.versionHash}`);
  return {...r.full,migration:p.migration};
 });
 // Migration seed chứa đáp án: chỉ ghi vào thư mục riêng (kho công khai giữ bản STUB).
 // 072 đã áp (bản gốc có ghi chú ngày áp): không ghi đè; chỉ sinh migration chưa áp.
 for(const [m,so] of [[GK1_MIGRATION_0203,'078']]){
  const fs=fulls.filter(f=>f.migration===m).map(({migration:_m,...f})=>f);
  writeFileSync(join(privateDir(),m),gk1MigrationSql(fs,so));console.log('Đã ghi '+join(privateDir(),m));
 }
}
