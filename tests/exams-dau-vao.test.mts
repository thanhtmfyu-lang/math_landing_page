import assert from 'node:assert/strict';
import {assemble,grade,schoolWeek,DV_TRACKS,type Bank,type Banks,type Progress} from '../server/dau-vao/engine';
import mau from './fixtures/dau-vao-mau.json';
import {randomBytes} from 'node:crypto';
import {validateHoSo} from '../server/dau-vao/ho-so';
import {LICH_CHUP,buoiCuaKhoi,kiemLuaChon,nhomCuaKhoi,buoiGanNhat,loadLich,parseLichCsv} from '../server/dau-vao/lich-lop';
import {hoSoSummary} from '../server/dau-vao/phieu';
import {saveHoSo,saveKetQua,validSig} from '../server/dau-vao/lead';
import {createDauVaoApi} from '../api/kiem-tra-dau-vao';
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
 const want=khoi==='hsa'?25:khoi==='12'&&BANKS['12-tn']?24:20;
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
 const full=grade(paper,picks,all,groups);assert.equal(full.score,10);assert.equal(full.correct,picks.length);assert.ok(full.topics.every(t=>t.status==='vung'));
 const none=grade(paper,picks,{},groups);assert.equal(none.score,0);assert.ok(none.topics.every(t=>t.status==='hong'));
 assert.match(none.suggestion.level,/Step 1/);assert.match(full.suggestion.level,/Step 3/);}

// Mini đề kiểu tốt nghiệp lớp 12 (bộ câu giả, chỉ kiểm máy ghép và máy chấm): 14 câu chẩn đoán + 6 NLC, 2 đúng sai, 2 trả lời ngắn.
{const TOPICS=['T10-16','T10-03','T10-18','T11-17','T12-01','T12-02','T12-05','T12-17','T12-18','T12-13'];
 const qs=TOPICS.flatMap((topic,ti)=>(['mc','mc','tf','num'] as const).map((kind,k)=>({id:`TN-${ti}-${k}`,topic,level:(k%3+1) as 1|2|3,kind,prompt:'Câu mẫu',dang:'Dạng '+topic,
  ...(kind==='mc'?{choices:['A','B','C','D'],answer:k%4}:kind==='tf'?{statements:['a','b','c','d'],answer:[true,false,true,false]}:{answer:'1.5'})})));
 const banks:Banks={...BANKS,'12-tn':{khoi:'12-tn',topics:[],questions:qs as any}};
 for(const [ngay,learned] of [['2026-10-19',['T12-01']],['2027-04-26',['T12-01','T12-13','T12-17','T12-18']]] as const)for(const seed of [3,77,2**31-2]){
  const {paper,picks}=assemble('12',ngay,seed,banks,PROGRESS);
  const tn=paper.questions.filter(q=>q.section==='tot-nghiep');
  assert.equal(paper.questions.length,24);assert.equal(tn.length,10);assert.equal(paper.durationMinutes,75);
  assert.deepEqual(tn.map(q=>q.part),['I','I','I','I','I','I','II','II','III','III']);
  assert.ok(tn.every(q=>q.kind!=='tf'||q.statements?.length===4));
  assert.ok(!/"answer"|"explain"|"check"/.test(JSON.stringify(paper)),'mini đề lộ đáp án');
  const ids=tn.map(q=>q.topic);
  assert.ok(ids.includes('T10-16'),'thiếu tổ hợp đếm');assert.ok(ids.some(t=>['T12-02','T12-05','T10-03'].includes(t)),'thiếu tối ưu');
  assert.ok(ids.some(t=>['T12-18','T12-17','T10-18','T11-17'].includes(t)),'thiếu xác suất');
  // Không vượt tiến độ: Bayes, mặt phẳng chỉ ra khi đã học; đã học Bayes thì ưu tiên Bayes.
  for(const t of ['T12-13','T12-17','T12-18'])if(!(learned as readonly string[]).includes(t))assert.ok(!ids.includes(t),`${ngay}: ${t} chưa học`);
  if((learned as readonly string[]).includes('T12-18'))assert.ok(ids.includes('T12-18'));
  assert.deepEqual(assemble('12',ngay,seed,banks,PROGRESS).paper,paper);
  // Chấm: đúng sai theo số ý (0,1/0,25/0,5/1), mini đề chấm riêng, không đổi điểm chẩn đoán.
  const groups=PROGRESS.khoi['12'].groups;
  const right=Object.fromEntries(picks.map(p=>[p.q.id,p.q.kind==='num'?String(p.q.answer).replace('.',','):p.q.answer]));
  const full=grade(paper,picks,right,groups);assert.equal(full.score,10);assert.equal(full.tn!.score,10);assert.equal(full.tn!.max,4.5);
  const tfs=picks.filter(p=>p.q.kind==='tf');
  const partial={...right,[tfs[0].q.id]:[true,false,true,true],[tfs[1].q.id]:[false,null,null,null]};
  const r=grade(paper,picks,partial,groups);assert.equal(r.score,10);
  assert.deepEqual(r.tn!.parts.find(x=>x.part==='II'),{part:'II',label:'Phần II. Trắc nghiệm đúng sai',earned:0.5,max:2});
  assert.equal(r.tn!.score,Math.round(3/4.5*100)/10);
  assert.equal(r.items.find(i=>i.no===paper.questions.find(q=>q.id===tfs[0].q.id)!.no)!.hits,3);
  assert.ok(r.tn!.byDang.some(d=>d.correct<d.total));
  const none=grade(paper,picks,{},groups);assert.equal(none.tn!.score,0);assert.equal(none.items.filter(i=>i.answered).length,0);
 }}

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

// Phiếu thông tin học thử: bắt buộc đủ ô quản lý lớp cần, đồng ý của phụ huynh, ngày sinh khớp khối.
const today='2026-10-20'; // Mốc cố định: buổi học thử gần nhất tính theo now truyền vào, không theo đồng hồ máy chạy test.
const HS={khoi:'10',hoTen:' Nguyễn  Văn An ',ngaySinh:'2011-05-04',truong:'THPT Kim Liên',lopTruong:'10A1',phuHuynh:'Nguyễn Văn Bình',sdtPh:'+84 912 345 678',sdtHs:'0987 654 321',hinhThuc:'truc-tiep',lichChon:['2K11 XPS 9+|T5|19:30|21:30','2K11 XPS 8+|CN|15:30|17:30'],mucTieu:'diem-cao',nguon:'facebook',ghiChu:'',dongY:true,leadSource:'Nguồn: facebook'};
{const h=validateHoSo(HS,today);assert.ok(typeof h!=='string',String(h));if(typeof h!=='string'){assert.equal(h.hoTen,'Nguyễn Văn An');assert.equal(h.sdtPh,'0912345678');assert.deepEqual(h.lichChon,['2K11 XPS 9+|T5|19:30|21:30','2K11 XPS 8+|CN|15:30|17:30']);assert.match(hoSoSummary(h,Date.parse('2026-10-20T05:00:00Z')),/Buổi 1: 2K11 XPS 9\+ Thứ 5 19:30–21:30; Buổi 2: 2K11 XPS 8\+ Chủ nhật 15:30–17:30[\s\S]*Buổi học thử gần nhất: Thứ 5 22\/10\/2026 lúc 19:30, lớp 2K11 XPS 9\+/);}
 assert.match(validateHoSo({...HS,dongY:false},today) as string,/đồng ý/);
 assert.match(validateHoSo({...HS,sdtPh:'12345'},today) as string,/phụ huynh/);
 assert.match(validateHoSo({...HS,sdtHs:''},today) as string,/của em/);
 assert.match(validateHoSo({...HS,sdtHs:'0123'},today) as string,/của em/);
 assert.match(validateHoSo({...HS,lichChon:['T3']},today) as string,/Lịch học/);
 assert.ok(typeof validateHoSo({...HS,ngayRanh:['T2'],caRanh:[]},today)!=='string','bản nháp cũ còn ô lịch cũ vẫn gửi được');
 assert.match(validateHoSo({...HS,truong:''},today) as string,/trường/);
 assert.match(validateHoSo({...HS,ngaySinh:'2016-01-01'},today) as string,/khớp/);
 assert.match(validateHoSo({...HS,ngaySinh:'2011-02-30'},today) as string,/ngày sinh/);
 assert.match(validateHoSo({...HS,hinhThuc:undefined},today) as string,/trực tiếp/);
 assert.match(validateHoSo({...HS,extra:1},today) as string,/không hợp lệ/);
 assert.ok(typeof validateHoSo({...HS,khoi:'6',ngaySinh:'2015-03-01'},today)!=='string');
 assert.ok(typeof validateHoSo({...HS,khoi:'hsa',ngaySinh:'2009-03-01'},today)!=='string');}

// Kho lead: chưa bật thì enabled:false; bật thì ghi RPC, trả mã phiếu có chữ ký; nộp bài gắn kết quả đúng phiếu, chữ ký sai không ghi.
{const k=randomBytes(32),calls:{name:string;args:any}[]=[];
 const transport=(async(url:string,init:any)=>{const name=url.split('/rpc/')[1],args=JSON.parse(init.body);calls.push({name,args});
  return new Response(JSON.stringify(name==='mtm_lead_dau_vao_add'?{status:'accepted',id:args.p_id}:true),{status:200});}) as unknown as typeof fetch;
 const env={MTM_LEAD_ENABLED:'1',SUPABASE_URL:'https://x.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'k'};
 assert.deepEqual((await saveHoSo(HS,k,today,{},transport)).body,{enabled:false});
 assert.equal((await saveHoSo({...HS,dongY:false},k,today,env,transport)).status,400);
 assert.match(((await saveHoSo({...HS,lichChon:[]},k,today,env,transport)).body as any).message,/chọn đủ ngày học/);
 assert.match(((await saveHoSo({...HS,lichChon:['2K9 XPT|T2|19:30|21:30']},k,today,env,transport)).body as any).message,/tải lại trang/);
 assert.equal(calls.length,0);
 const out=await saveHoSo(HS,k,today,env,transport,Date.parse('2026-10-20T05:00:00Z'));assert.equal(out.status,200);const {id,sig}=out.body as any;
 assert.ok(validSig(k,id,sig));assert.ok(!validSig(k,id,'0'.repeat(64)));assert.ok(!validSig(randomBytes(32),id,sig));
 const add=calls[0].args;assert.equal(add.p_phone,'0912345678');assert.equal(add.p_grade,'10');assert.equal(add.p_ho_so.ngay_sinh,'2011-05-04');assert.equal(add.p_ho_so.sdt_hoc_sinh,'0987654321');assert.equal(add.p_ho_so.lich_chon.length,2);assert.equal(add.p_ho_so.lich_chon[0].lop,'2K11 XPS 9+');assert.equal(add.p_ho_so.buoi_gan_nhat.lop,'2K11 XPS 9+');assert.match(add.p_notes,/Học thử mới/);assert.match(add.p_lead_source,/^Kiểm tra đầu vào web/);
 const {paper,picks}=assemble('10','2026-10-19',77,BANKS,PROGRESS);const res=grade(paper,picks,{},PROGRESS.khoi['10'].groups);
 assert.equal(await saveKetQua(id,sig,res,{name:'An',school:'Kim Liên'},k,env,transport),'saved');
 const kq=calls[1];assert.equal(kq.name,'mtm_lead_dau_vao_ket_qua');assert.equal(kq.args.p_id,id);assert.equal(kq.args.p_ket_qua.diem,0);assert.match(kq.args.p_text,/Gợi ý lớp/);
 assert.equal(await saveKetQua(id,'f'.repeat(64),res,{name:'',school:''},k,env,transport),'error');assert.equal(calls.length,2);
 assert.equal(await saveKetQua(id,sig,res,{name:'',school:''},k,{},transport),'off');
 const limited=(async()=>new Response(JSON.stringify({status:'limit'}),{status:200})) as unknown as typeof fetch;
 assert.equal((await saveHoSo(HS,k,today,env,limited)).status,429);
 const down=(async()=>new Response('x',{status:500})) as unknown as typeof fetch;
 assert.equal((await saveHoSo(HS,k,today,env,down)).status,503);}

// Thời khóa biểu: lớp theo khóa sinh, HSA theo tên; CSV tab Lich_lop đọc theo tên cột, bỏ TSA; đọc lỗi thì dùng bản chụp; buổi gần nhất đúng giờ Việt Nam.
{assert.deepEqual([...new Set(buoiCuaKhoi(LICH_CHUP,'12',today).map(b=>b.lop))],['2K9 XPS 8+','2K9 XPS 9+','2K9 XPT']);
 assert.deepEqual([...new Set(buoiCuaKhoi(LICH_CHUP,'6',today).map(b=>b.lop))],['2K15']);
 assert.deepEqual(buoiCuaKhoi(LICH_CHUP,'hsa',today).map(b=>b.lop),['HSA.2','HSA']);
 assert.ok(buoiCuaKhoi(LICH_CHUP,'12',today).every(b=>!/hsa|tsa/i.test(b.lop)));
 // Chương trình: XPS 8+ và 9+ cùng khóa gộp, Buổi k là buổi thứ k trong tuần của mỗi lớp; XPT và cấp 2 lịch cố định.
 const n12=nhomCuaKhoi(LICH_CHUP,'12',today);assert.deepEqual(n12.map(n=>n.ten),['Xuất phát sớm (XPS)','Xuất phát thường (XPT)']);
 assert.deepEqual(n12[0].buoi.map(b=>b.lua.map(x=>x.lop.slice(-2)+' '+x.thu)),[['9+ T2','8+ T3'],['9+ T4','8+ T5'],['9+ T6','8+ T7']]);
 assert.deepEqual(n12[1].buoi.map(b=>b.lua.length),[1,1,1]);
 assert.deepEqual(nhomCuaKhoi(LICH_CHUP,'11',today)[0].buoi.map(b=>b.lua.map(x=>x.thu+' '+x.bat)),[['T3 19:30','T6 19:30'],['CN 08:00','CN 10:00']]);
 assert.deepEqual(nhomCuaKhoi(LICH_CHUP,'9',today).map(n=>n.ten),['Lớp 2K12']);
 assert.deepEqual(nhomCuaKhoi(LICH_CHUP,'hsa',today).map(n=>n.buoi.length),[1]);
 assert.equal(kiemLuaChon(n12,['2K9 XPS 9+|T2|17:30|19:30','2K9 XPS 8+|T5|17:30|19:30','2K9 XPS 9+|T6|17:30|19:30'])?.id,'2K9 XPS');
 assert.equal(kiemLuaChon(n12,['2K9 XPS 9+|T2|17:30|19:30','2K9 XPS 8+|T5|17:30|19:30']),null,'thiếu buổi 3');
 assert.equal(kiemLuaChon(n12,['2K9 XPS 8+|T5|17:30|19:30','2K9 XPS 9+|T2|17:30|19:30','2K9 XPS 9+|T6|17:30|19:30']),null,'sai thứ tự buổi');
 assert.equal(kiemLuaChon(n12,['2K9 XPS 9+|T2|17:30|19:30','2K9 XPT|T3|19:30|21:30','2K9 XPS 9+|T6|17:30|19:30']),null,'trộn chương trình');
 const csv='\uFEFFLớp,Thứ,Bắt đầu,Kết thúc,Ngày khai giảng,Loại lịch,Nguồn,Trạng thái\r\n2K11 XPT,Thứ 4,19:30,21:30,23/09/2026,Lịch tuần,"Thành, xác nhận",ok\r\nTSA,Chủ nhật,14:00,17:00,,,,\r\n2K11 XPT,Chủ nhật,8:00,10:00,,,,\r\nlỗi,Thứ 9,1,2,,,,\r\n';
 const p=parseLichCsv(csv);assert.deepEqual(p.map(b=>b.id),['2K11 XPT|T4|19:30|21:30','2K11 XPT|CN|08:00|10:00']);
 assert.deepEqual(parseLichCsv('a,b\n1,2'),[]);
 assert.equal(await loadLich({}),LICH_CHUP);
 const many=csv+Array.from({length:6},(_,i)=>`2K12,Thứ ${i+2},18:00,20:00`).join('\n');let n=0;
 const ok=(async()=>{n++;return new Response(many,{status:200});}) as unknown as typeof fetch,url='https://docs.google.com/spreadsheets/d/e/x/pub?output=csv';
 assert.equal((await loadLich({MTM_LICH_LOP_CSV:url},ok,1000)).length,8);await loadLich({MTM_LICH_LOP_CSV:url},ok,2000);assert.equal(n,1,'đọc lại sau 10 phút');
 const bad=(async()=>new Response('x',{status:500})) as unknown as typeof fetch;assert.equal((await loadLich({MTM_LICH_LOP_CSV:url},bad,10**9)).length,8,'lỗi thì giữ bản đọc được');
 assert.equal(await loadLich({MTM_LICH_LOP_CSV:'https://evil.vn/x.csv'},ok),LICH_CHUP);
 // 20/10/2026 là thứ Ba; 12:00 giờ VN: buổi T3 17:30 hôm nay; 18:00 giờ VN: sang T4 21/10; CN đã qua giờ thì sang tuần sau.
 const ids=['2K9 XPS 8+|T3|17:30|19:30','2K11 XPT|T4|19:30|21:30'];
 assert.deepEqual(buoiGanNhat(ids,Date.parse('2026-10-20T05:00:00Z')),{id:ids[0],ngay:'2026-10-20',gio:'17:30'});
 assert.deepEqual(buoiGanNhat(ids,Date.parse('2026-10-20T11:00:00Z')),{id:ids[1],ngay:'2026-10-21',gio:'19:30'});
 assert.deepEqual(buoiGanNhat(['HSA|CN|17:00|20:00'],Date.parse('2026-10-25T11:00:00Z')),{id:'HSA|CN|17:00|20:00',ngay:'2026-11-01',gio:'17:00'});
 assert.equal(buoiGanNhat([],0),null);}

const _p:Progress=PROGRESS;void _p;
console.log('dau-vao: ok');
// API: phiếu đi nhánh hoSo, nguồn gửi lạ bị chặn, nộp bài có mã phiếu trả thêm trạng thái lead.
{const call=async(env:Record<string,string>,req:any)=>{let st=0,body:any;await createDauVaoApi(()=>env)(req,{setHeader(){},status:n=>{st=n;return {json:v=>{body=v;}};}});return {st,body};};
 const h={origin:'https://minhthanhmath.vn',host:'minhthanhmath.vn'};
 assert.equal((await call({},{method:'POST',headers:{origin:'https://evil.vn',host:'evil.vn'},body:{hoSo:HS}})).st,403);
 {const r=await call({},{method:'GET',query:{lich:'10'}});assert.equal(r.st,200);assert.ok(r.body.buoi.length>0&&r.body.buoi.every((b:any)=>b.lop.startsWith('2K11')));assert.equal((await call({},{method:'GET',query:{lich:'x'}})).st,400);}
 const r=await call({},{method:'POST',headers:h,body:JSON.stringify({hoSo:HS})});assert.equal(r.st,200);assert.deepEqual(r.body,{enabled:false});
 assert.equal((await call({},{method:'POST',headers:h,body:{hoSo:HS,x:1}})).st,400);
 assert.equal((await call({},{method:'GET',query:{khoi:'10'}})).st,503);}
console.log('dau-vao api: ok');
