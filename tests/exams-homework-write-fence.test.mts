import assert from 'node:assert/strict';
import examJson from '../server/btvn/demo-exam.json';
import {demoStudents} from '../server/btvn/demo-students';
import {HomeworkService,HomeworkError} from '../server/btvn/service';
import {MemoryHomeworkRepository} from '../server/btvn/repository';
import {SupabaseHomeworkRepository,type DurableSnapshot} from '../server/btvn/supabase-repository';
import {createDurableHomeworkHandler} from '../server/btvn/durable-http';
import {validateDraft,sameDraft,type Answers,type Draft} from '../src/native/exams/store';
import type {PracticeExam} from '../src/native/exams/data';
import type {LessonMaterial} from '../src/native/homework/btvn-contract';

const exam=examJson as unknown as PracticeExam;
const student={...demoStudents[0],studentCode:'MOBILE-FENCE-FAKE'};
const baseNow=Date.parse('2026-11-15T00:00:00Z');
const correct:Answers=Object.fromEntries(exam.questions.map(q=>[q.id,q.kind==='mc'?q.answer:q.kind==='tf'?q.answer:q.kind==='self'?'':q.acceptedAnswers[0]]));
const mc=exam.questions.find(q=>q.kind==='mc')!;
const a:Answers={[mc.id]:'A'},b:Answers={[mc.id]:'B'};
const material:LessonMaterial={lessonCode:'mobile-fence-fake',title:'Bài giả kiểm mất mạng',classNames:[student.className],date:'2026-11-14',classOpensAt:{[student.className]:'2026-11-14T00:00:00Z'},videoId:null,materialUrl:null,handoutUrl:null,homeworkUrl:null};
function fixture(){
  let now=baseNow;
  const memory=new MemoryHomeworkRepository([student]);
  const service=new HomeworkService(memory,exam,baseNow+86400000,'fake',material.lessonCode,()=>now,[material]);
  const token=service.login({studentCode:student.studentCode},'fake-network');
  const started=service.start(token),id=started.draft!.attemptId;
  return {memory,service,token,id,started,setNow(value:number){now=value;}};
}
const denied=(run:()=>unknown,status=409)=>assert.throws(run,(error:unknown)=>error instanceof HomeworkError&&error.status===status);
let count=0;
async function test(label:string,run:()=>void|Promise<void>){await run();console.log('ĐẠT '+(++count)+' '+label);}

await test('Legacy giữ tương thích đến lần opt-in; batch counter không đổi clock/deadline',()=>{
  const f=fixture();f.service.save(f.token,f.id,a);
  const first=f.service.save(f.token,f.id,b,100,1).draft!;
  assert.equal(first.clientRevision,100);assert.equal(first.revision,100);
  assert.equal(first.attemptId,f.id);assert.equal(first.startedAt,f.started.draft!.startedAt);assert.equal(first.deadline,f.started.draft!.deadline);
  for(const action of ['save','submit'] as const)assert.throws(()=>f.service[action](f.token,f.id,a),(error:unknown)=>error instanceof HomeworkError&&error.status===409&&/phiên bản cũ/.test(error.message)&&/tải bản lưu/.test(error.message)&&/tải lại trang/.test(error.message)&&/đúng lượt/.test(error.message)&&error.writeConflict?.attemptId===f.id&&error.writeConflict.revision===100);
});
await test('Equal same body idempotent; stale/equal changed body không đè bản mới',()=>{
  const f=fixture(),first=f.service.save(f.token,f.id,a,10,0).draft!;
  const repeat=f.service.save(f.token,f.id,{...a},10,0).draft!;
  assert.ok(sameDraft(first,repeat));
  denied(()=>f.service.save(f.token,f.id,b,10,0));denied(()=>f.service.save(f.token,f.id,b,9,0));
  denied(()=>f.service.submit(f.token,f.id,a,10,0));
  f.service.save(f.token,f.id,b,20,10);denied(()=>f.service.save(f.token,f.id,a,10,0));
  assert.deepEqual(f.service.state(f.token).draft!.answers,b);
});
await test('Reload có counter đủ cao để tiếp tục, parser không làm mất fence',()=>{
  const f=fixture(),saved=f.service.save(f.token,f.id,a,800,0).draft!;
  const parsed=validateDraft(JSON.parse(JSON.stringify(saved)),exam);assert.ok(parsed.ok);
  const resumed=parsed.value.revision+1;
  const next=f.service.save(f.token,f.id,b,resumed,saved.revision).draft!;
  assert.equal(next.clientRevision,801);assert.equal(next.revision,801);
  for(const marker of [-1,1.5,NaN,Infinity,saved.revision+1])assert.equal(validateDraft({...saved,clientRevision:marker},exam).ok,false);
  assert.equal(sameDraft(saved,{...saved,clientRevision:799}),false);
});
await test('Submit đúng một biên nhận; duplicate/legacy sau terminal không sửa điểm',()=>{
  const f=fixture();f.service.save(f.token,f.id,correct,50,0);
  const done=f.service.submit(f.token,f.id,correct,51,50),draft=done.draft!;
  assert.equal(done.receipts.length,1);assert.equal(done.receipts[0].score,10);
  assert.equal(draft.clientRevision,51);
  for(const rev of [undefined,49,51,100]){
    const duplicate=f.service.submit(f.token,f.id,{},rev,rev===undefined?undefined:50);
    assert.equal(duplicate.receipts.length,1);assert.equal(duplicate.receipts[0].score,10);assert.ok(sameDraft(duplicate.draft!,draft));
  }
});
await test('Hết giờ vẫn chấm bản máy chủ đã giữ, không lấy đáp án muộn hoặc cần client fence',()=>{
  for(const counter of [70,Number.MAX_SAFE_INTEGER-2]){
    const f=fixture();f.service.save(f.token,f.id,correct,counter,0);f.setNow(f.started.draft!.deadline+1);
    const done=f.service.save(f.token,f.id,b);
    assert.deepEqual(done.draft!.answers,correct);assert.equal(done.receipts.length,1);assert.equal(done.receipts[0].score,10);assert.equal(done.receipts[0].timedOut,true);assert.equal(done.draft!.clientRevision,counter);
  }
});
await test('HTTP chỉ cho counter nguyên ở save/submit, legacy không thêm argument',async()=>{
  const calls:unknown[][]=[];
  const repo={call:async(...args:unknown[])=>{calls.push(args);return {ok:true};}} as unknown as SupabaseHomeworkRepository;
  const handler=createDurableHomeworkHandler(repo),cookie='mtm_btvn_demo='+'c'.repeat(64);
  const send=(body:unknown)=>handler({method:'POST',body,cookie,origin:'https://fixture.invalid',host:'fixture.invalid',secure:true});
  assert.equal((await send({action:'save',attemptId:'fake',answers:a})).status,200);assert.equal(calls.at(-1)!.length,5);
  assert.equal((await send({action:'save',attemptId:'fake',answers:a,clientRevision:123,baseRevision:0})).status,200);assert.equal(calls.at(-1)![5],123);assert.equal(calls.at(-1)![6],0);
  for(const clientRevision of [null,'1',-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER-1,Number.MAX_SAFE_INTEGER])assert.equal((await send({action:'save',attemptId:'fake',answers:a,clientRevision,baseRevision:0})).status,400);
  for(const baseRevision of [undefined,null,'0',-1,1.5,NaN,Infinity])assert.equal((await send({action:'save',attemptId:'fake',answers:a,clientRevision:1,baseRevision})).status,400);
  assert.equal((await send({action:'save',attemptId:'fake',answers:a,baseRevision:0})).status,400);
  assert.equal((await send({action:'start',clientRevision:1})).status,400);
});

function raceFixture(oldRevision:number|undefined,empty=false,initialRevision?:number){
  const f=fixture();let canonical:DurableSnapshot={revision:0,work:f.memory.all()[0],exam,material,lessons:[material]};
  if(initialRevision!==undefined){f.service.save(f.token,f.id,a,initialRevision,0);canonical.work=f.memory.all()[0];}
  if(empty)canonical.work.drafts=[];
  let held!:(value:{data:{ok:boolean};error:null})=>void,heldArgs:Record<string,unknown>|undefined;
  let signal!:(value:void)=>void;const reached=new Promise<void>(resolve=>{signal=resolve;});
  const commit=(args:Record<string,unknown>)=>{
    if(args.p_revision!==canonical.revision)return {data:{ok:false},error:null};
    canonical={...canonical,revision:canonical.revision+1,work:{...canonical.work,drafts:structuredClone(args.p_drafts as Draft[]),receipts:structuredClone(args.p_receipts as DurableSnapshot['work']['receipts'])}};
    return {data:{ok:true},error:null};
  };
  const db={async rpc(name:string,args:Record<string,unknown>){
    if(name==='mtm_btvn_read')return {data:structuredClone(canonical),error:null};
    assert.equal(name,'mtm_btvn_commit');
    const candidate=(args.p_drafts as Draft[]).at(-1)!;
    if(candidate.clientRevision===oldRevision&&!heldArgs){heldArgs=args;signal();return new Promise<{data:{ok:boolean};error:null}>(resolve=>{held=resolve;});}
    return commit(args);
  }};
  const repository=new SupabaseHomeworkRepository(db,async()=>{throw Error('No auth or external requests in test');},()=>baseNow);
  return {f,repository,reached,release(){assert.ok(heldArgs);held(commit(heldArgs));},read:()=>structuredClone(canonical)};
}
await test('CAS collision: late save A bị từ chối sau B, không rollback answers',async()=>{
  const r=raceFixture(10);
  const old=r.repository.call('fake-session','save',material.lessonCode,r.f.id,a,10,0);await r.reached;
  const fresh=await r.repository.call('fake-session','save',material.lessonCode,r.f.id,b,20,0);
  assert.equal(fresh.draft!.clientRevision,20);r.release();
  await assert.rejects(old,(error:unknown)=>error instanceof HomeworkError&&error.status===409);
  assert.deepEqual(r.read().work.drafts[0].answers,b);assert.equal(r.read().work.drafts[0].clientRevision,20);assert.equal(r.read().work.receipts.length,0);
});
await test('CAS duplicate submit cùng intent không thêm attempt/receipt hoặc đổi clock',async()=>{
  const r=raceFixture(10);
  const old=r.repository.call('fake-session','submit',material.lessonCode,r.f.id,correct,10,0);await r.reached;
  const duplicate=await r.repository.call('fake-session','submit',material.lessonCode,r.f.id,correct,10,0);r.release();await old;
  const canonical=r.read();assert.equal(canonical.work.drafts.length,1);assert.equal(canonical.work.receipts.length,1);assert.equal(canonical.work.receipts[0].score,10);
  assert.equal(canonical.work.drafts[0].startedAt,r.f.started.draft!.startedAt);assert.equal(canonical.work.drafts[0].deadline,r.f.started.draft!.deadline);assert.deepEqual(canonical.work.drafts[0],duplicate.draft);
});
await test('Unknown start retry sau CAS chọn đúng một attempt và một deadline',async()=>{
  const r=raceFixture(undefined,true);
  const old=r.repository.call('fake-session','start',material.lessonCode);await r.reached;
  const retry=await r.repository.call('fake-session','start',material.lessonCode);r.release();
  const original=await old,canonical=r.read();
  assert.equal(canonical.work.drafts.length,1);assert.equal(canonical.work.receipts.length,0);
  assert.equal(original.draft!.attemptId,retry.draft!.attemptId);assert.equal(original.draft!.deadline,retry.draft!.deadline);
  assert.equal(retry.draft!.deadline-retry.draft!.startedAt,exam.durationMinutes*60000);
});
await test('Khác lineage: client100/base10 không ghi đè reloadclient12; rebase tường minh giữ servercounter tăng',async()=>{
  const r=raceFixture(100,false,10);
  const old=r.repository.call('fake-session','save',material.lessonCode,r.f.id,{[mc.id]:'C'},100,10);await r.reached;
  const fresh=await r.repository.call('fake-session','save',material.lessonCode,r.f.id,b,12,10);r.release();
  await assert.rejects(old,(error:unknown)=>error instanceof HomeworkError&&error.status===409&&error.writeConflict?.attemptId===r.f.id&&error.writeConflict.revision===fresh.draft!.revision);
  assert.deepEqual(r.read().work.drafts[0].answers,b);assert.equal(r.read().work.drafts[0].clientRevision,12);
  const duplicate=await r.repository.call('fake-session','save',material.lessonCode,r.f.id,b,1000,10);
  assert.equal(duplicate.draft!.clientRevision,12,'Idempotent không nâng counter chỉ vì request cũ lớn hơn');
  const f=fixture();f.service.save(f.token,f.id,a,100,0);
  const rebased=f.service.save(f.token,f.id,b,12,100).draft!;
  assert.equal(rebased.revision,101);assert.equal(rebased.clientRevision,12);assert.deepEqual(rebased.answers,b);
});
await test('409 chỉ trả attemptId/revision, không trả đáp án hoặc dữ liệu hồ sơ',async()=>{
  const repo={call:async()=>{throw new HomeworkError(409,'Giữ bản đang nhập',{attemptId:'fake-attempt',revision:12,answers:a,student:'GIẢ'} as any);}} as unknown as SupabaseHomeworkRepository;
  const handler=createDurableHomeworkHandler(repo);
  const result=await handler({method:'POST',body:{action:'save',attemptId:'fake',answers:b,clientRevision:100,baseRevision:10},cookie:'mtm_btvn_demo='+'c'.repeat(64),origin:'https://fixture.invalid',host:'fixture.invalid',secure:true});
  assert.equal(result.status,409);assert.deepEqual(result.body,{message:'Giữ bản đang nhập',writeConflict:{attemptId:'fake-attempt',revision:12}});
});
console.log(count+' ca edit-fence đạt; chỉ dữ liệu giả và CAS transport trong RAM, không SQL hay auth thật.');
