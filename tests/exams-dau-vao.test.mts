import assert from 'node:assert/strict';
import {assemble,grade,schoolWeek,DV_TRACKS,type Bank,type Banks,type Progress} from '../server/dau-vao/engine';
import mau from './fixtures/dau-vao-mau.json';
import {handleDauVao,dauVaoKey,loadBanks,PROGRESS} from '../server/dau-vao/handler';

// Kho mã công khai: ngân hàng thật chỉ có dạng mã hóa. Có MTM_DAU_VAO_KEY thì kiểm ngân hàng thật; không có thì dùng bộ câu mẫu giả cùng cấu trúc chủ đề.
const key=dauVaoKey(process.env);
const REAL=!!key;
const BANKS:Banks=key?loadBanks(key):mau as unknown as Banks;
if(!REAL)console.log('dau-vao: không có MTM_DAU_VAO_KEY, kiểm bằng ngân hàng mẫu');

// Tuần năm học: 07/09/2026 là tuần 1; 19/10/2026 là tuần 7; tháng 7 là hè của năm học sau (tuần âm).
assert.deepEqual(schoolWeek('2026-09-07',PROGRESS),{week:1,summer:false,schoolYear:'2026-2027'});
assert.equal(schoolWeek('2026-10-19',PROGRESS).week,7);
assert.equal(schoolWeek('2027-01-20',PROGRESS).week,20);
const summer=schoolWeek('2027-07-15',PROGRESS);assert.equal(summer.summer,true);assert.equal(summer.schoolYear,'2027-2028');assert.ok(summer.week<=0);

// Mọi khối ghép được đề cho nhiều thời điểm trong năm; đủ câu, không trùng câu, không lộ đáp án.
const dates=['2026-07-10','2026-09-10','2026-10-19','2026-12-20','2027-02-20','2027-04-15','2027-05-25'];
for(const khoi of DV_TRACKS)for(const ngay of dates)for(const seed of [7,123456,2**31-2]){
 const {paper,picks}=assemble(khoi,ngay,seed,BANKS,PROGRESS);
 const want=khoi==='hsa'?25:20;
 assert.equal(paper.questions.length,want,`${khoi} ${ngay} ${seed}: ${paper.questions.length} câu`);
 assert.equal(new Set(paper.questions.map(q=>q.id)).size,want,'trùng câu');
 const text=JSON.stringify(paper);assert.ok(!/"answer"|"explain"|"check"/.test(text),'đề lộ đáp án');
 // Câu của chủ đề trường mới dạy dở chỉ ở mức 1-2.
 for(const p of picks)if(p.section==='truong'){const w=paper.week;if(!(w>p.topic.school[1]))assert.ok(p.q.level<=2,`${p.q.id} vượt mức khi trường đang dạy dở`);}
 // Phần "trường" không chứa chủ đề trường chưa dạy.
 for(const p of picks)if(p.section==='truong')assert.ok(p.topic.school[0]>0&&p.topic.school[0]<paper.week,`${p.q.id} chưa học trên trường`);
 // Ghép lại cùng seed ra đúng đề.
 assert.deepEqual(assemble(khoi,ngay,seed,BANKS,PROGRESS).paper,paper);
}
// Đề đổi theo thời điểm: cuối năm có chủ đề học kỳ II mà đầu năm không có.
const early=assemble('10','2026-09-28',99,BANKS,PROGRESS).paper,late=assemble('10','2027-05-10',99,BANKS,PROGRESS).paper;
assert.notDeepEqual(new Set(early.questions.map(q=>q.topic)),new Set(late.questions.map(q=>q.topic)));

// Chấm: đúng hết 10/10, bỏ trống 0, số thập phân dùng dấu phẩy vẫn đúng.
{const {paper,picks}=assemble('12','2026-10-19',4242,BANKS,PROGRESS);const groups=PROGRESS.khoi['12'].groups;
 const all=Object.fromEntries(picks.map(p=>[p.q.id,p.q.kind==='num'?String(p.q.answer).replace('.',','):p.q.answer]));
 const full=grade(paper,picks,all,groups);assert.equal(full.score,10);assert.equal(full.correct,20);assert.ok(full.topics.every(t=>t.status==='vung'));
 const none=grade(paper,picks,{},groups);assert.equal(none.score,0);assert.ok(none.topics.every(t=>t.status==='hong'));
 assert.match(none.suggestion.level,/Step 1/);assert.match(full.suggestion.level,/Step 3/);}

// API: GET trả đề không đáp án; POST chấm lại đúng đề; ngày quá xa bị từ chối; khối sai bị từ chối.
{const now=Date.parse('2026-10-19T03:00:00Z');
 const g=handleDauVao({method:'GET',query:{khoi:'10'}},BANKS,now);assert.equal(g.status,200);const paper=g.body as any;assert.equal(paper.ngay,'2026-10-19');
 const p=handleDauVao({method:'POST',body:JSON.stringify({khoi:'10',ngay:paper.ngay,seed:paper.seed,answers:{}})},BANKS,now);assert.equal(p.status,200);assert.equal((p.body as any).code,paper.code);
 assert.equal(handleDauVao({method:'POST',body:{khoi:'10',ngay:'2026-10-01',seed:paper.seed,answers:{}}},BANKS,now).status,410);
 // Máy chủ chưa có khóa: báo đang cập nhật, không lỗi.
 assert.equal(handleDauVao({method:'GET',query:{khoi:'10'}},null,now).status,503);
 assert.equal(handleDauVao({method:'GET',query:{khoi:'tsa'}},BANKS,now).status,400);
 assert.equal(handleDauVao({method:'POST',body:{khoi:'10',ngay:paper.ngay,seed:paper.seed,answers:{},extra:1}},BANKS,now).status,400);}

// Ngân hàng thật: mỗi câu trỏ đúng chủ đề, mc có 4 phương án và đáp án 0-3, num là số; mỗi chủ đề đủ mức 1-4.
if(REAL)for(const khoi of DV_TRACKS){const b=BANKS[khoi] as Bank;const ids=new Set(b.topics.map(t=>t.id));
 for(const q of b.questions){assert.ok(ids.has(q.topic),q.id+' sai chủ đề');
  if(q.kind==='mc'){assert.equal(q.choices?.length,4,q.id);assert.ok(Number.isInteger(q.answer)&&(q.answer as number)>=0&&(q.answer as number)<4,q.id);}
  else assert.ok(typeof q.answer==='string'&&/^-?\d+(\.\d+)?$/.test(q.answer),q.id+' đáp số');
  for(const s of [q.prompt,...(q.choices??[])])assert.equal((s.match(/\$/g)??[]).length%2,0,q.id+' lệch dấu $');}
 for(const t of b.topics){const lv=new Set(b.questions.filter(q=>q.topic===t.id).map(q=>q.level));for(const l of [1,2,3,4])assert.ok(lv.has(l as 1),`${t.id} thiếu mức ${l}`);}
 for(const id of Object.keys(PROGRESS.khoi[khoi].groups.flatMap(g=>Object.keys(g.covered)).reduce((a,k)=>({...a,[k]:1}),{}))){const all=khoi==='hsa'?new Set([...ids,...(BANKS['12'] as Bank).topics.map(t=>t.id)]):ids;assert.ok(all.has(id),'sổ tiến độ trỏ chủ đề lạ '+id);}
}
const _p:Progress=PROGRESS;void _p;
console.log('dau-vao: ok');
