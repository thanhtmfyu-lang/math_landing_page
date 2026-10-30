import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
import {doneMa,thiThangBlock,thiThangPart,visibleThiThangCards} from '../server/btvn/thi-thang';
import {thiThangGroups} from '../src/native/homework/ThiThangSection';
import type {HomeworkLesson,LessonMaterial} from '../src/native/homework/btvn-contract';
import type {StudentWork} from '../server/btvn/repository';

// Toàn bộ danh tính, lớp, bài và lượt bên dưới là dữ liệu giả, không gọi mạng.
const base='thi-thang-2026-10-lop-gia',name='Học sinh giả thi tháng',cls='Lớp giả';
const code=(phase:'thi'|'btvn',ma:1|2)=>`${base}-${phase}-ma-${ma}`;
const card=(lessonCode:string,submittedAt:number|null=null,startedAt:number|null=null)=>({lessonCode,submittedAt,startedAt});
const emptyCards=[card(code('thi',1)),card(code('thi',2)),card(code('btvn',1)),card(code('btvn',2)),card('btvn-thuong-gia')];
assert.deepEqual(thiThangPart(code('thi',2)),{base,phase:'thi',ma:2});
assert.deepEqual(thiThangPart(code('btvn',1)),{base,phase:'btvn',ma:1});
assert.equal(thiThangPart('btvn-thuong-gia'),null);
assert.equal(thiThangPart(base+'-thi-ma-3'),null);
assert.equal(doneMa(base,emptyCards),null);
assert.equal(doneMa(base,[card(code('thi',1),null,20),card(code('thi',2),null,10)]),2,'Dữ liệu cũ có hai lượt: khớp SQL, giữ mã bắt đầu sớm nhất.');
assert.equal(doneMa(base,[card(code('thi',2),10),card(code('thi',1),20)]),1,'Thiếu mốc bắt đầu: cùng thứ tự mã với SQL.');
assert.deepEqual(visibleThiThangCards(emptyCards,name,cls),emptyCards,'Chưa bắt đầu: thấy cả hai mã.');
for(const ma of [1,2] as const){
  const other=ma===1?2:1;
  const started=emptyCards.map(c=>c.lessonCode===code('thi',ma)?{...c,startedAt:0}:c);
  assert.equal(doneMa(base,started),ma,'Mốc bắt đầu bằng 0 vẫn là lượt đã tạo.');
  assert.equal(thiThangBlock(code('thi',ma),started,name,cls),null);
  assert.match(thiThangBlock(code('thi',other),started,name,cls)!,/Đã bắt đầu thì không đổi được/);
  assert.match(thiThangBlock(code('btvn',ma),started,name,cls)!,/BTVN của em là/);
  assert.equal(thiThangBlock(code('btvn',other),started,name,cls),null);
  assert.deepEqual(visibleThiThangCards(started,name,cls).map(c=>c.lessonCode),[code('thi',ma),code('btvn',other),'btvn-thuong-gia']);
  assert.equal(doneMa(base,[card(code('thi',ma),10)]),ma,'Giữ bài cũ có biên nhận nhưng chưa có startedAt.');
  assert.equal(doneMa(base,[card(code('btvn',other),10)]),ma,'HS offline nộp BTVN mã kia thì giữ lựa chọn cũ.');
  assert.equal(doneMa(base,[card(code('btvn',other),null,10)]),null,'Chỉ xem/bắt đầu BTVN không bị hiểu thành thi online.');
  assert.equal(thiThangBlock('thi-thang-2026-11-lop-gia-thi-ma-1',started,name,cls),null,'Không khóa nhầm kỳ khác.');
}

const fixture=pipelineFixture(),opens=Date.parse('2026-10-31T18:30:00+07:00'),closes=opens+3600000;
const material=(lessonCode:string):LessonMaterial=>({...fixture.material,lessonCode,classNames:[cls],date:'2026-10-31',classOpensAt:{[cls]:new Date(closes).toISOString()},kind:thiThangPart(lessonCode)?.phase==='thi'?'kiem-tra-thang':'btvn',opensAt:opens,closesAt:closes});
const materials=emptyCards.slice(0,4).map(c=>material(c.lessonCode));

// Transport giả có tiến độ riêng từng bài, readback trong RAM và CAS.
// Kiểm SQL transaction thật ở exams-btvn-thi-thang-sql.test.mts.
function harness(){
  let now=opens,commits=0,failCommit=false;
  const works=new Map<string,{revision:number;drafts:StudentWork['drafts'];receipts:StudentWork['receipts']}>();
  const transport={async rpc(rpcName:string,args:Record<string,unknown>){
    const selected=String(args.p_lesson??code('thi',1));
    const work=works.get(selected)??{revision:0,drafts:[],receipts:[]};
    if(rpcName==='mtm_btvn_read')return {data:{revision:work.revision,work:{student:{studentCode:'FAKE-THI',fullName:name,phone:'',className:cls},drafts:structuredClone(work.drafts),receipts:structuredClone(work.receipts)},exam:fixture.exam,material:materials.find(l=>l.lessonCode===selected),lessons:materials.map(l=>{const entry=works.get(l.lessonCode);return {...l,available:true,dueAt:null,bestScore:null,late:null,startedAt:entry?.drafts[0]?.startedAt??null,submittedAt:entry?.receipts.at(-1)?.submittedAt??null};})},error:null};
    if(rpcName==='mtm_btvn_commit'){
      if(failCommit)throw Error('Lỗi ghi giả');
      if(args.p_revision!==work.revision)return {data:{ok:false},error:null};
      works.set(selected,{revision:work.revision+1,drafts:structuredClone(args.p_drafts as StudentWork['drafts']),receipts:structuredClone(args.p_receipts as StudentWork['receipts'])});
      commits++;return {data:{ok:true},error:null};
    }
    throw Error(rpcName);
  }};
  const repository=()=>new SupabaseHomeworkRepository(transport,async()=>{throw Error('Không gọi Edge trong kiểm thử.');},()=>now);
  return {repo:repository(),reload:repository,works,setNow:(at:number)=>{now=at;},failCommit:()=>{failCommit=true;},commits:()=>commits};
}

for(const ma of [1,2] as const){
  const other=ma===1?2:1,h=harness(),selected=code('thi',ma),blocked=code('thi',other);
  h.setNow(opens-1);
  await assert.rejects(h.repo.call('session-gia','start',selected),/chưa mở/);
  h.setNow(opens);
  for(const choice of [code('thi',1),code('thi',2)]){
    const preview=await h.repo.call('session-gia','select',choice);
    assert.ok(preview.exam);assert.equal(preview.draft,null);
    assert.equal(preview.lessons!.filter(l=>thiThangPart(l.lessonCode)?.phase==='thi').length,2);
  }
  assert.equal(h.commits(),0,'Xem đề không khóa mã hoặc tạo lượt.');
  const begun=await h.repo.call('session-gia','start',selected);
  assert.ok(begun.exam&&begun.draft);assert.equal(begun.maxAttempts,1);
  assert.equal(begun.draft.submittedAt,null);
  assert.deepEqual(begun.lessons!.map(l=>l.lessonCode),[selected,code('btvn',other)],'Response start khóa ngay cả thẻ, chưa cần tải lại.');
  assert.equal(begun.lessons![0].startedAt,opens);
  const before=h.commits();
  for(const action of ['state','select','start','save','submit'] as const){
    await assert.rejects(h.repo.call('session-gia',action,blocked,begun.draft.attemptId,{}),/Đã bắt đầu thì không đổi được/);
  }
  assert.equal(h.commits(),before,'Mã bị khóa không ghi bài.');
  const same=await h.reload().call('session-gia','start',selected);
  assert.equal(same.draft!.attemptId,begun.draft.attemptId,'Tải lại dùng đúng lượt và lựa chọn đã lưu.');
  const reloaded=await h.reload().call('session-gia','state',selected);
  assert.deepEqual(reloaded.lessons!.map(l=>l.lessonCode),[selected,code('btvn',other)]);
  const defaultState=await h.reload().call('session-gia','state');
  assert.deepEqual(defaultState.lessons!.map(l=>l.lessonCode),[selected,code('btvn',other)]);
  if(ma===2)assert.equal(defaultState.exam,null,'Bài mặc định là mã bị khóa: không trả đề đó.');
  h.setNow(closes);
  await assert.rejects(h.repo.call('session-gia','start',blocked),/Đã bắt đầu thì không đổi được/);
  await assert.rejects(h.repo.call('session-gia','select',code('btvn',ma)),/BTVN của em là/);
  const homework=await h.repo.call('session-gia','select',code('btvn',other));
  assert.ok(homework.exam,'Sau ca: mở đúng BTVN mã chưa thi, kể cả bài thi chưa nộp.');
  assert.equal(homework.lessonCode,code('btvn',other));
  const submitted=harness();
  const draft=await submitted.repo.call('session-gia','start',selected);
  submitted.setNow(opens+1000);
  const receipt=await submitted.repo.call('session-gia','submit',selected,draft.draft!.attemptId,{});
  assert.equal(receipt.receipts.length,1);
  await assert.rejects(submitted.repo.call('session-gia','start',selected),/hết lượt/);
  submitted.setNow(closes+1);
  await assert.rejects(submitted.repo.call('session-gia','select',code('btvn',ma)),/BTVN của em là/);
  assert.ok((await submitted.repo.call('session-gia','select',code('btvn',other))).exam);
}
const closed=harness();closed.setNow(closes);
await assert.rejects(closed.repo.call('session-gia','start',code('thi',1)),/đã đóng/);
assert.equal(closed.commits(),0,'Đúng giờ đóng không tạo lượt mới.');
const failed=harness();failed.failCommit();
await assert.rejects(failed.repo.call('session-gia','start',code('thi',1)),/Lỗi ghi giả/);
assert.equal(failed.works.size,0,'Lỗi ghi không tạo lựa chọn trong RAM.');
assert.equal((await failed.reload().call('session-gia','select',code('thi',2))).draft,null);

const lesson=(phase:'thi'|'btvn',ma:1|2,startedAt:number|null=null,submittedAt:number|null=null):HomeworkLesson=>({...material(code(phase,ma)),opensAt:phase==='thi'?opens:closes,startedAt,submittedAt,available:true,dueAt:null,bestScore:null,late:null,title:'Bài giả'});
const lessons=[lesson('thi',2),lesson('btvn',2),lesson('thi',1),lesson('btvn',1)];
const groups=thiThangGroups(lessons);
assert.equal(groups.length,1);
assert.deepEqual(groups[0].thi.map(l=>l.lessonCode),[code('thi',1),code('thi',2)]);
assert.equal(groups[0].btvn.length,2);

// Kiểm HTML render bằng React server tại local; không mở/điều khiển trình duyệt.
const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const bundle=buildSync({entryPoints:[join(root,'src/native/homework/ThiThangSection.tsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;
const mod={exports:{} as any};new Function('require','module','exports',bundle)((id:string)=>id.endsWith('.css')?{}:require(id),mod,mod.exports);
const render=(cards:HomeworkLesson[],now:number,busy=false)=>renderToStaticMarkup(React.createElement(mod.exports.default,{lessons:cards,now,busy,onSelect(){}}));
let html=render(lessons,opens);
assert.match(html,/>Làm Mã đề 101<\/button>/);
assert.match(html,/>Làm Mã đề 102<\/button>/);
assert.equal((html.match(/<button/g)??[]).length,2);
assert.match(html,/Chọn 1 đề, đã bắt đầu thì không đổi được/);
assert.doesNotMatch(html,/Trên lớp em đã làm|Làm BTVN/);
assert.equal((render(lessons,opens,true).match(/disabled=""/g)??[]).length,2);
assert.doesNotMatch(render(lessons,opens-1),/>Làm Mã đề/);
assert.doesNotMatch(render(lessons,closes),/>Làm Mã đề/);
assert.match(render(lessons,closes),/Trên lớp em đã làm mã đề nào/,'Giữ luồng học offline.');
for(const ma of [1,2] as const){
  const other=ma===1?2:1;
  const picked=[lesson('thi',ma,opens),lesson('btvn',other)];
  html=render(picked,opens);
  assert.match(html,new RegExp('>Tiếp tục Mã đề 10'+ma+'<'));
  assert.doesNotMatch(html,new RegExp('Mã đề 10'+other));
  html=render(picked,closes);
  assert.match(html,new RegExp('BTVN của em: <b>Mã đề 10'+other));
  assert.doesNotMatch(html,/Trên lớp em đã làm/,'Lượt thi chưa nộp vẫn xác định được BTVN.');
  html=render([lesson('thi',ma,opens,opens+1000),lesson('btvn',other)],closes);
  assert.match(html,new RegExp('BTVN của em: <b>Mã đề 10'+other));
}
console.log('Đạt: chọn 101/102 trong ca; bắt đầu khóa mã kia qua API và tải lại; sau ca BTVN mã còn lại; giữ luồng offline, 1 lượt, biên giờ và HTML.');
