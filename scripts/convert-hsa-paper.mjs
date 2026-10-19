// Chuyển đề thi thử HSA của tổ Học liệu (JSON: ma_de, cau_truc, cau_hoi[...]) sang định dạng đề của web.
// Chỉ đổi định dạng: không sửa đề bài, phương án, đáp án hay lời giải. Gặp gì không biểu diễn được thì dừng và báo lỗi.
// Dùng: node scripts/convert-hsa-paper.mjs tools/hsa-papers/de-thi-thu-hsa-01.json --id mtm-hsa-thi-thu-01 [--seed-sql out.sql]
// Kết quả: src/native/exams/hsa-papers/<id>.public.json (chỉ câu hỏi + dữ liệu chùm, không đáp án)
//          src/native/exams/hsa-papers/<id>.key.json    (đề đầy đủ có đáp án, lời giải; chỉ tải khi chấm trên trình duyệt)
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const QUESTION_KEYS=new Set(['id','stt','chu_de','lop','muc_do','dang','de_bai','lua_chon','dap_an','loi_giai','phan_tich_nhieu','kiem_dinh','dap_an_so','chum','dan_chung','bang']);
const LETTERS=['A','B','C','D'];
const fail=msg=>{throw new Error('Không chuyển được đề: '+msg);};
const text=(v,where)=>{if(typeof v!=='string'||!v.trim())fail(where+' thiếu nội dung');if(/!\[|<img|\.(png|jpe?g|svg|gif|webp)\b/i.test(v))fail(where+' có hình ảnh, cần bổ sung cách hiển thị ảnh trước khi chuyển');if(/\n\s*\|.*\|/.test(v)||/\\begin\{(tabular|array)\}/.test(v))fail(where+' có bảng, cần bổ sung cách hiển thị bảng trước khi chuyển');return v;};
/** Giá trị số chuẩn hóa giống canonicalNumeric của bộ chấm (dấu phẩy hoặc chấm thập phân). */
export function canonicalDecimal(raw){const s=String(raw).trim();if(!/^[+-]?\d+(?:[.,]\d+)?$/.test(s))return null;const sign=s.startsWith('-')?'-':'';const [w,f='']=s.replace(/^[+-]/,'').replace(',','.').split('.');const whole=w.replace(/^0+(?=\d)/,''),frac=f.replace(/0+$/,'');const out=frac?whole+'.'+frac:whole;return out==='0'?'0':sign+out;}
/** Bảng số liệu của tổ Học liệu: {tieu_de, cot:[tiêu đề cột], hang:[[ô...]]}, mỗi hàng đủ số cột, ô là chuỗi.
 * Đổi sang {title, columns, rows} (chỉ đổi tên trường, giữ nguyên chữ); hình dạng khác thì dừng. */
export function convertTable(b,where){
 if(!b||typeof b!=='object'||Array.isArray(b))fail(where+': bang không hợp lệ');
 for(const k of Object.keys(b))if(!['tieu_de','cot','hang'].includes(k))fail(where+': bang có trường lạ '+k);
 const title=text(b.tieu_de,where+' bang.tieu_de');
 if(!Array.isArray(b.cot)||b.cot.length<2||b.cot.length>12)fail(where+': bang.cot cần 2–12 cột');
 const columns=b.cot.map((c,i)=>text(c,where+' bang.cot['+i+']'));
 if(!Array.isArray(b.hang)||!b.hang.length||b.hang.length>40)fail(where+': bang.hang cần 1–40 hàng');
 const rows=b.hang.map((r,i)=>{if(!Array.isArray(r)||r.length!==columns.length)fail(where+': bang.hang['+i+'] khác số cột');return r.map((c,j)=>text(c,where+' bang.hang['+i+']['+j+']'));});
 return {title,columns,rows};
}
export const sha256=s=>createHash('sha256').update(s).digest('hex');

export function convertHsaPaper(sourceText,{id,title,grade=12,period='CK2',sourceUrl='https://cet.vnu.edu.vn/chuyen-muc/thong-bao-51.html'}={}){
 if(!/^mtm-hsa-[a-z0-9-]+$/.test(id??''))fail('cần --id dạng mtm-hsa-...');
 const src=JSON.parse(sourceText),qs=src.cau_hoi,ct=src.cau_truc;
 if(!Array.isArray(qs)||!qs.length)fail('thiếu cau_hoi');
 if(!ct||ct.tong_so_cau!==qs.length)fail('cau_truc.tong_so_cau khác số câu');
 if(src.thoi_gian_phut!==ct.thoi_gian_phut||!Number.isSafeInteger(src.thoi_gian_phut))fail('thời gian không thống nhất');
 const kinds={mcq:0,dien_so:0};for(const q of qs){if(!(q.dang in kinds))fail(`câu ${q.stt}: dạng ${q.dang} chưa hỗ trợ`);kinds[q.dang]++;}
 for(const [k,n] of Object.entries(kinds))if((ct.dang_cau_hoi?.[k]?.so_cau??0)!==n)fail(`số câu dạng ${k} khác cau_truc`);
 // Chấm theo nguồn: mỗi câu đúng 1 điểm, không trừ điểm. Bộ chấm web dùng thang 10 000 phần nghìn nên mỗi câu = 10000/N.
 if(10000%qs.length)fail('10 điểm không chia đều được cho số câu');
 const milli=10000/qs.length;
 const ids=new Set(),groups=new Map(),tables={};
 const questions=qs.map((q,i)=>{
  const where='câu '+(i+1);
  for(const k of Object.keys(q))if(!QUESTION_KEYS.has(k))fail(where+': trường lạ '+k);
  if(q.stt!==i+1)fail(where+': stt không đúng thứ tự');
  if(typeof q.id!=='string'||!/^[A-Za-z0-9-]+$/.test(q.id)||ids.has(q.id))fail(where+': id không hợp lệ hoặc trùng');ids.add(q.id);
  if(q.kiem_dinh?.ket_qua!=='KHỚP')fail(where+': chưa kiểm định KHỚP');
  const base={id:q.id,kind:'',sourceRef:`${src.ma_de} · câu ${q.stt} · ${q.chu_de}`,prompt:text(q.de_bai,where+' de_bai')};
  let out;
  if(q.dang==='mcq'){
   const keys=Object.keys(q.lua_chon??{});if(keys.join('')!=='ABCD')fail(where+': lua_chon phải đúng A, B, C, D');
   const choices=LETTERS.map(l=>text(q.lua_chon[l],where+' phương án '+l));if(new Set(choices).size!==4)fail(where+': phương án trùng');
   if(!LETTERS.includes(q.dap_an))fail(where+': đáp án trắc nghiệm không hợp lệ');if('dap_an_so' in q)fail(where+': câu trắc nghiệm có dap_an_so');
   out={...base,kind:'mc',choices,answer:q.dap_an};
  }else{
   if('lua_chon' in q)fail(where+': câu điền số có lua_chon');
   const c=canonicalDecimal(q.dap_an);if(c===null)fail(where+': đáp án điền "'+q.dap_an+'" không phải số thập phân');
   if(typeof q.dap_an_so!=='number'||canonicalDecimal(String(q.dap_an_so))!==c)fail(where+': dap_an và dap_an_so không khớp');
   out={...base,kind:'short',mode:'numeric',acceptedAnswers:[q.dap_an]};
  }
  out={...out,maxMillipoints:milli,solution:text(q.loi_giai,where+' loi_giai')};
  if(q.chum!==undefined){
   if(typeof q.chum!=='string'||!/^[A-Z]$/.test(q.chum))fail(where+': mã chùm không hợp lệ');
   const stim=text(q.dan_chung,where+' dan_chung'),g=groups.get(q.chum);
   // Bảng của câu chùm là dữ liệu dùng chung: mọi câu trong chùm phải có cùng một bảng (hoặc cùng không có).
   const table='bang' in q?JSON.stringify(convertTable(q.bang,where)):null;
   if(!g)groups.set(q.chum,{id:q.chum,questionIds:[q.id],text:stim,table,last:i});
   else{if(g.text!==stim)fail(where+': dữ liệu chùm '+q.chum+' khác các câu cùng chùm');if(g.table!==table)fail(where+': bảng chùm '+q.chum+' khác các câu cùng chùm');if(g.last!==i-1)fail(where+': câu chùm '+q.chum+' không liền nhau');g.questionIds.push(q.id);g.last=i;}
  }else{if('dan_chung' in q)fail(where+': có dan_chung nhưng không có chum');if('bang' in q)tables[q.id]=convertTable(q.bang,where);}
  return out;
 });
 const declared=ct.cau_chum?.trong_de_nay??[];
 for(const d of declared){const g=groups.get(d.chum);if(!g||g.questionIds.map(qid=>qs.find(q=>q.id===qid).stt).join()!==d.cau.join())fail('chùm '+d.chum+' khác cau_truc');}
 if(declared.length!==groups.size)fail('số chùm khác cau_truc');
 const full={id,title:title??src.ten,grade,period,durationMinutes:src.thoi_gian_phut,
  sourceHash:sha256(sourceText),sourceRef:`${src.ma_de} · ${src.don_vi_soan}`,questionCount:questions.length,answerKeyVerified:true,rubricVerified:true,
  rubricVersion:'MTM-FLEX-10-v1',sections:[{label:'Toán học và xử lý số liệu',kind:'mixed',count:questions.length}],
  sourceUrl,sourceMaterial:{title:src.ten,publisher:src.don_vi_soan,version:`${src.ma_de} · ${src.ngay_soan}`,locator:`${questions.length} câu trong tệp đề ${src.ma_de}; URL chỉ đối chiếu cấu trúc kỳ thi, không phải nguồn câu hỏi`},
  publicationVerified:true,questionDisplayVerified:true,
  answerVerificationNote:`Tổ Học liệu MTM kiểm định ${src.tong_hop_kiem_dinh?.so_cau_khop}/${src.tong_hop_kiem_dinh?.tong_so_cau} câu khớp. Chấm theo số câu đúng, không trừ điểm câu sai; mỗi câu đúng 1 điểm trên thang 50 (0,2 điểm trên thang 10).`,
  questions};
 full.versionHash=sha256(JSON.stringify(full));
 // Bản công khai: cùng versionHash; bỏ đáp án, lời giải và URL; chấm trên máy chủ (migration 060/069).
 const {sourceUrl:_u,answerVerificationNote:_n,...rest}=full;
 const publicExam={...rest,serverGraded:true,responseMode:'questions-only',questions:questions.map(({answer:_a,acceptedAnswers:_k,solution:_s,...q})=>q)};
 // Bảng nằm cạnh câu hỏi (không nằm trong đề chấm) nên bản máy chủ trả về sau khi nộp vẫn hiện được bảng.
 const pubGroups=[...groups.values()].map(({last:_l,table,...g})=>table?{...g,table:JSON.parse(table)}:g);
 return {full,public:{exam:publicExam,groups:pubGroups,...(Object.keys(tables).length?{tables}:{}),scale:qs.length},source:src};
}
export function seedSql(full){
 const b64=Buffer.from(JSON.stringify(full),'utf8').toString('base64');
 return `insert into mtm_exam_private.exam_keys(id,exam,static_visible) values('${full.id}',convert_from(decode('${b64}','base64'),'UTF8')::jsonb,true) on conflict(id) do nothing;\ninsert into mtm_hsa_rank.exams(exam_id,placeholder) values('${full.id}',false) on conflict(exam_id) do nothing;\n`;
}

// Chỉ chạy CLI khi gọi trực tiếp tệp này (không chạy khi test đóng gói lại module).
if(process.argv[1]&&/convert-hsa-paper\.mjs$/.test(process.argv[1])&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const args=process.argv.slice(2),opt=k=>{const i=args.indexOf(k);return i>=0?args[i+1]:undefined;};
 const input=args[0];if(!input)fail('thiếu đường dẫn tệp đề');
 const root=fileURLToPath(new URL('../',import.meta.url)),out=join(root,'src/native/exams/hsa-papers');
 const r=convertHsaPaper(readFileSync(input,'utf8'),{id:opt('--id'),title:opt('--title')});
 mkdirSync(out,{recursive:true});
 writeFileSync(join(out,r.full.id+'.key.json'),JSON.stringify(r.full)+'\n');
 writeFileSync(join(out,r.full.id+'.public.json'),JSON.stringify(r.public)+'\n');
 const sqlOut=opt('--seed-sql');if(sqlOut){mkdirSync(dirname(sqlOut),{recursive:true});writeFileSync(sqlOut,seedSql(r.full));}
 console.log(`Đã chuyển ${r.full.questions.length} câu (${r.full.questions.filter(q=>q.kind==='mc').length} trắc nghiệm, ${r.full.questions.filter(q=>q.kind==='short').length} điền số), ${r.public.groups.length} chùm. versionHash ${r.full.versionHash}`);
}
