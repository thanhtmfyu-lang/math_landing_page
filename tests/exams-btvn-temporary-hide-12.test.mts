import assert from 'node:assert/strict';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
import {createDurableHomeworkHandler} from '../server/btvn/durable-http';
import {thiThangBlock,visibleThiThangCards} from '../server/btvn/thi-thang';
import type {LessonMaterial} from '../src/native/homework/btvn-contract';
import type {StudentWork} from '../server/btvn/repository';

// Giữ đúng mã bài theo lệnh; toàn bộ hồ sơ, đề và transport bên dưới là giả.
const base='thi-thang-2026-10-2k10-8';
const code=(phase:'thi'|'btvn',ma:1|2)=>`${base}-${phase}-ma-${ma}`;
const targets=[code('thi',1),code('thi',2),code('btvn',1),code('btvn',2)];
const name='Học sinh giả kiểm mở lại',className='Lớp giả kiểm mở lại',fixture=pipelineFixture();
const cards=targets.map(lessonCode=>({lessonCode,submittedAt:null}));
assert.equal(targets.length,4);
for(const slug of targets)assert.equal(thiThangBlock(slug,cards,name,className),null);
const allCards=[...cards,{lessonCode:'btvn-thuong',submittedAt:null}];
assert.deepEqual(visibleThiThangCards(allCards,name,className),allCards);
for(const slug of targets)for(const near of [slug+'-suffix',slug.replace('2026-10','2026-11')])assert.doesNotMatch(thiThangBlock(near,cards,name,className)??'',/tạm ẩn/);

const opens=Date.parse('2026-10-30T19:30:00+07:00'),closes=Date.parse('2026-10-30T21:30:00+07:00');
const material=(lessonCode:string):LessonMaterial=>{
 const thi=lessonCode.includes('-thi-ma-'),at=thi?opens:closes;
 return {...fixture.material,lessonCode,classNames:[className],date:'2026-10-30',classOpensAt:{[className]:new Date(at).toISOString()},kind:thi?'kiem-tra-thang':'btvn',opensAt:at,closesAt:thi?closes:undefined};
};
const lessons=targets.map(material),input={method:'POST',cookie:'mtm_btvn_demo='+'a'.repeat(64),origin:'https://fake.invalid',host:'fake.invalid',secure:true};
function harness(at=opens){
 let now=at,commits=0;
 const works=new Map<string,{revision:number;drafts:StudentWork['drafts'];receipts:StudentWork['receipts']}>();
 const repo=new SupabaseHomeworkRepository({async rpc(rpc,args){
  const selected=String(args.p_lesson??targets[0]),work=works.get(selected)??{revision:0,drafts:[],receipts:[]};
  if(rpc==='mtm_btvn_read')return {data:{revision:work.revision,work:{student:{studentCode:'FAKE-REOPEN',fullName:name,phone:'',className},drafts:structuredClone(work.drafts),receipts:structuredClone(work.receipts)},exam:fixture.exam,material:material(selected),lessons:lessons.map(l=>{const progress=works.get(l.lessonCode);return {...l,startedAt:progress?.drafts[0]?.startedAt??null,submittedAt:progress?.receipts.at(-1)?.submittedAt??null};})},error:null};
  if(rpc==='mtm_btvn_commit'){
   assert.equal(args.p_revision,work.revision);
   works.set(selected,{revision:work.revision+1,drafts:structuredClone(args.p_drafts as StudentWork['drafts']),receipts:structuredClone(args.p_receipts as StudentWork['receipts'])});
   commits++;return {data:{ok:true},error:null};
  }
  throw Error('RPC ngoài giả lập: '+rpc);
 }},async()=>{throw Error('Không gọi Edge trong kiểm thử.');},()=>now);
 const handler=createDurableHomeworkHandler(repo);
 return {setNow:(value:number)=>{now=value;},commits:()=>commits,call:(body:Record<string,unknown>)=>handler({...input,body})};
}

// Bốn bài trả thẻ/đề, bắt đầu, lưu và nộp được qua API giả vào đúng giờ mở.
for(const slug of targets){
 const h=harness(slug.includes('-thi-ma-')?opens:closes);
 for(const body of [{action:'state'},{action:'state',lessonCode:slug},{action:'select',lessonCode:slug}]){
  const r=await h.call(body);assert.equal(r.status,200,slug+' '+body.action);
  assert.ok((r.body as any).exam);assert.deepEqual((r.body as any).lessons.map((l:any)=>l.lessonCode),targets);
 }
 assert.equal(h.commits(),0,'Xem đề không tạo lượt.');
 const begun=await h.call({action:'start',lessonCode:slug});
 assert.equal(begun.status,200,slug+' start');assert.ok((begun.body as any).exam);
 const attemptId=(begun.body as any).draft.attemptId;
 for(const action of ['save','submit']){
  const r=await h.call({action,lessonCode:slug,attemptId,answers:{}});
  assert.equal(r.status,200,slug+' '+action);
  if(action==='submit')assert.equal((r.body as any).receipts.length,1);
 }
 assert.equal(h.commits(),3);
}

// Gỡ tạm ẩn không bỏ giờ mở/đóng hoặc khóa mã đã bắt đầu.
for(const ma of [1,2] as const){
 const h=harness(opens-1),other=ma===1?2:1;
 const before=await h.call({action:'start',lessonCode:code('thi',ma)});
 assert.equal(before.status,409);assert.match((before.body as any).message,/chưa mở/);assert.equal(h.commits(),0);
 h.setNow(opens);
 assert.equal((await h.call({action:'start',lessonCode:code('thi',ma)})).status,200);
 const committed=h.commits();
 for(const action of ['state','select','start','save','submit']){
  const r=await h.call({action,lessonCode:code('thi',other),...(['save','submit'].includes(action)?{attemptId:'fake',answers:{}}:{})});
  assert.equal(r.status,409);assert.match((r.body as any).message,/Đã bắt đầu thì không đổi được/);assert.equal((r.body as any).exam,undefined);
 }
 assert.equal(h.commits(),committed,'Mã bị khóa không ghi bài.');
 const selected=await h.call({action:'state',lessonCode:code('thi',ma)});
 assert.equal(selected.status,200);
 assert.deepEqual((selected.body as any).lessons.map((l:any)=>l.lessonCode),[code('thi',ma),code('btvn',other)]);
 const earlyHomework=await h.call({action:'start',lessonCode:code('btvn',other)});
 assert.equal(earlyHomework.status,409);assert.match((earlyHomework.body as any).message,/chưa mở/);
 h.setNow(closes);
 assert.equal((await h.call({action:'start',lessonCode:code('btvn',other)})).status,200);
 const doneHomework=await h.call({action:'select',lessonCode:code('btvn',ma)});
 assert.equal(doneHomework.status,409);assert.match((doneHomework.body as any).message,/BTVN của em là/);
 const closed=await harness(closes).call({action:'start',lessonCode:code('thi',ma)});
 assert.equal(closed.status,409);assert.match((closed.body as any).message,/đã đóng/);
}

// Ngoài đúng tập tạm ẩn: chưa bắt đầu thì được chọn cả hai mã, giữ các bài đã mở.
for(const [base,cls] of [['thi-thang-2026-10-2k10-9','2K10 9+'],['thi-thang-2026-10-2k10-thu-3-6','2K10 9+'],['thi-thang-2026-10-2k11-8','2K11 8+'],['thi-thang-2026-10-2k11-9','2K11 9+']]){
 for(const phase of ['thi','btvn'])for(const ma of [1,2]){
  const slug=`${base}-${phase}-ma-${ma}`,reason=thiThangBlock(slug,[],name,cls);
  assert.equal(reason,null);
 }
}
console.log('Đạt: mở lại đúng 4 bài 2K10 8+ qua API giả; giữ giờ mở/đóng, khóa mã sau start, BTVN mã còn lại và các bài ngoài phạm vi.');
