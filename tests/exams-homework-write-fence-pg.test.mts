/** Real PostgreSQL JSONB/CAS wrappers in local PGlite. All identities are fake.
 * The acknowledged canonical base, not unrelated tab counters, orders intent.
 * Requests are reordered before their SQL commit; this single-connection test
 * does not claim to reproduce multi-connection PostgreSQL lock contention.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
import {HomeworkError} from '../server/btvn/service';
import {validateDraft,type Answers,type Draft} from '../src/native/exams/store';

const {db}=await baselineDatabase();
const owner='11111111-1111-4111-8111-111111111151';
const classId='22222222-2222-4222-8222-222222222251';
const studentId='33333333-3333-4333-8333-333333333351';
const protectedPeer='33333333-3333-4333-8333-333333333352';
const session='a'.repeat(64),label='2K10 XPT';
const exams=new Map<string,ReturnType<typeof pipelineFixture>['exam']>();
const q=(sql:string,args:unknown[]=[])=>db.query(sql,args);
const scalar=async(sql:string,args:unknown[]=[])=>Object.values((await q(sql,args)).rows[0])[0] as any;
let checks=0;
const check=async(name:string,run:()=>Promise<void>)=>{await run();checks++;console.log('FENCE PG PASS: '+name);};

async function rpc(name:string,args:Record<string,unknown>){
  return db.transaction(async tx=>{
    await tx.exec('set local role service_role');
    await tx.query("select set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claim.sub','',true)");
    const entries=Object.entries(args);
    return (await tx.query(`select public.${name}(${entries.map(([key],index)=>`${key} => $${index+1}`).join(',')}) result`,entries.map(([,value])=>value!==null&&typeof value==='object'?JSON.stringify(value):value))).rows[0].result;
  });
}
const read=(code:string)=>rpc('mtm_btvn_two_paper_read',{p_session:session,p_lesson:code});
const work=(code:string)=>scalar('select jsonb_build_object(\'revision\',revision,\'drafts\',drafts,\'receipts\',receipts) from mtm_hw_private.btvn_work where student_id=$1 and lesson_code=$2',[studentId,code]);
function repository(beforeCommit?:(args:Record<string,unknown>,commit:()=>Promise<unknown>)=>Promise<unknown>){
  return new SupabaseHomeworkRepository({async rpc(name,args){
    try{
      const invoke=()=>rpc(name==='mtm_btvn_read'?'mtm_btvn_two_paper_read':name,args);
      return {data:name==='mtm_btvn_commit'&&beforeCommit?await beforeCommit(args,invoke):await invoke(),error:null};
    }catch(error:any){return {data:null,error:{code:error.code,message:error.message}};}
  }},async()=>{throw Error('No external account, Edge or network in this fixture.');});
}
async function addLesson(code:string,monthly=false){
  const fixture=pipelineFixture(),exam=fixture.exam;
  const now=Number(await scalar('select floor(extract(epoch from clock_timestamp())*1000)'));
  const today=await scalar("select (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date::text");
  exam.id='mtm-custom-'+code;exam.durationMinutes=monthly?45:120;exams.set(code,exam);
  const material={...fixture.material,lessonCode:code,date:today,classNames:[label],classDates:{[label]:today},classOpensAt:{[label]:new Date(now-7200000).toISOString()},title:exam.title};
  await q(`insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status,source_version,assets,is_test,kind,opens_at,closes_at,assessment_id,exam_type)
    values($1,$2,array[$3::uuid],$4,$5,true,'da_dang',$6,'[]',true,$7,$8,$9,$10,$11)`,[code,owner,classId,JSON.stringify(material),JSON.stringify(exam),'e'.repeat(64),monthly?'kiem-tra':'btvn',new Date(now-7200000).toISOString(),new Date(now+7200000).toISOString(),monthly?'44444444-4444-4444-8444-444444444451':null,monthly?'custom':null]);
  await q('insert into mtm_hw_private.btvn_work(student_id,lesson_code) values($1,$2)',[studentId,code]);
}
try{
  await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
  await db.exec("create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;");
  for(const name of ['202611020101_cong_up_btvn_gv.sql','202611020102_btvn_two_papers.sql','202611020103_lesson_upload_gateway.sql','202611120107_lesson_upload_deadline.sql','202611130108_lesson_upload_retry.sql','202611130109_lesson_staff_history.sql','202611130110_lesson_assessment.sql'])await db.exec(readFileSync('supabase/migrations-pending/'+name,'utf8'));
  const today=await scalar("select (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date::text");
  await q('insert into auth.users values($1)',[owner]);
  await q("insert into public.mtm_staff(user_id,short_name,display_name,role,teacher_key) values($1,'synthetic-fence','QA fence fake','admin','thaythanh')",[owner]);
  await q('insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$2,$3,11)',[classId,owner,label]);
  await q('insert into mtm_hw_private.btvn_publish_scope values(true,$1,array[$2::uuid])',[owner,classId]);
  await q("insert into mtm_hw_private.btvn_roster_scope(singleton,owner_id,sheet_id,protected_student_ids,synced_class_ids) values(true,$1,'synthetic-fence-only',array[$2::uuid,$4::uuid],array[$3::uuid])",[owner,studentId,classId,protectedPeer]);
  await q('insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher) values($1,extract(isodow from $2::date)::int,\'17:30\',\'19:30\',\'thaythanh\')',[label,today]);
  await q("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,is_test,created_at) values($1,$2,$3,'QA fence fake','Synthetic','Synthetic','MTM-000000000051',true,current_date-30)",[studentId,owner,classId]);
  await q("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,is_test,created_at) values($1,$2,$3,'QA protected fake','Synthetic','Synthetic','MTM-000000000052',true,current_date-30)",[protectedPeer,owner,classId]);
  await q("insert into mtm_hw_private.btvn_identity_sessions(student_id,digest,expires_at) values($1,mtm_hw_private.token_digest('btvn-identity',$2),clock_timestamp()+interval '1 day')",[studentId,session]);
  await addLesson('synthetic-write-fence-homework');await addLesson('synthetic-write-fence-exam',true);

  for(const code of exams.keys()){
    const repo=repository(),started=await repo.call(session,'start',code),id=started.draft!.attemptId;
    const start=started.draft!.startedAt,deadline=started.draft!.deadline;
    const a:Answers={'mc-1':'A'},b:Answers={'mc-1':'B'},c:Answers={'mc-1':'C'};
    await check(code+': accepted marker survives actual SQL JSONB commit and fresh scoped read',async()=>{
      await repo.call(session,'save',code,id,a,10,0);
      const snapshot=await read(code),draft=snapshot.work.drafts[0];
      assert.equal(draft.clientRevision,10);assert.equal(draft.revision,10);assert.deepEqual(draft.answers,a);
      assert.equal(draft.startedAt,start);assert.equal(draft.deadline,deadline);
      const parsed=validateDraft(draft,exams.get(code)!);assert.ok(parsed.ok);
      const reload=await repository().call(session,'select',code);
      assert.equal(reload.draft!.clientRevision,10);assert.equal(reload.draft!.attemptId,id);
    });
    await check(code+': old tab 100/base10 loses SQL CAS to reload tab 12/base10',async()=>{
      let release!:()=>void,reached!:()=>void;
      const waiting=new Promise<void>(resolve=>{reached=resolve;});
      let held=false,sqlCasRejected=false;
      const delayed=repository(async(args,commit)=>{
        if(!held&&(args.p_drafts as Draft[]).at(-1)!.clientRevision===100){held=true;reached();await new Promise<void>(resolve=>{release=resolve;});const result=await commit();sqlCasRejected=(result as {ok?:boolean}).ok===false;return result;}
        return commit();
      });
      const late=delayed.call(session,'save',code,id,c,100,10);await waiting;
      const fresh=await repo.call(session,'save',code,id,b,12,10),before=await work(code);
      release();await assert.rejects(late,(error:unknown)=>{
        assert.ok(error instanceof HomeworkError);assert.equal(error.status,409);
        assert.deepEqual(error.writeConflict,{attemptId:id,revision:12});return true;
      });
      assert.equal(sqlCasRejected,true,'the delayed request must reach and lose the real SQL CAS');
      const after=await work(code);assert.deepEqual(after,before);
      assert.equal(after.drafts.length,1);assert.equal(after.receipts.length,0);assert.equal(after.drafts[0].clientRevision,12);assert.deepEqual(after.drafts[0].answers,b);
      assert.equal(after.drafts[0].attemptId,id);assert.equal(after.drafts[0].startedAt,start);assert.equal(after.drafts[0].deadline,deadline);
      assert.equal(fresh.draft!.clientRevision,12);
      const sameBody=await repo.call(session,'save',code,id,b,1000,10);
      assert.deepEqual(sameBody.draft,after.drafts[0],'a same-body retry may acknowledge the accepted edit without moving its marker');
    });
    await check(code+': explicit reload base permits a lower independent tab counter',async()=>{
      const advanced=await repo.call(session,'save',code,id,c,100,12);
      assert.equal(advanced.draft!.revision,100);
      const reloaded=await repository().call(session,'select',code);
      const rebased=await repository().call(session,'save',code,id,b,13,reloaded.draft!.revision);
      assert.equal(rebased.draft!.revision,101);assert.equal(rebased.draft!.clientRevision,13);
      const stored=await work(code);assert.equal(stored.drafts[0].revision,101);assert.equal(stored.drafts[0].clientRevision,13);assert.deepEqual(stored.drafts[0].answers,b);
    });
    await check(code+': terminal marker survives commit/reload; duplicate cannot add a receipt',async()=>{
      const exam=exams.get(code)!;
      const correct:Answers=Object.fromEntries(exam.questions.map(question=>[question.id,question.kind==='mc'?question.answer:question.kind==='tf'?question.answer:question.kind==='self'?'':question.acceptedAnswers[0]]));
      const base=(await read(code)).work.drafts[0].revision;
      await repository().call(session,'submit',code,id,correct,21,base);
      const stored=await work(code),draft=stored.drafts[0];
      assert.equal(draft.clientRevision,21);assert.ok(draft.revision>20);assert.notEqual(draft.submittedAt,null);
      assert.equal(stored.drafts.length,1);assert.equal(stored.receipts.length,1);assert.equal(stored.receipts[0].score,10);
      assert.equal(draft.attemptId,id);assert.equal(draft.startedAt,start);assert.equal(draft.deadline,deadline);
      const parsed=validateDraft(draft,exam);assert.ok(parsed.ok);
      const reload=await repository().call(session,'select',code);
      assert.equal(reload.draft!.clientRevision,21);assert.equal(reload.draft!.submittedAt,draft.submittedAt);
      if(code.endsWith('-exam')){
        assert.equal(reload.bestScore,null);assert.equal(reload.receipts[0].score,null);assert.equal(reload.solutionsAvailable,false);
      }else assert.equal(reload.receipts[0].score,10);
      await repository().call(session,'submit',code,id,a,1000,0);
      const duplicate=await work(code);
      assert.deepEqual(duplicate.drafts,stored.drafts);assert.deepEqual(duplicate.receipts,stored.receipts);
    });
  }
  console.log(`${checks} actual JSONB/scoped-read/commit/CAS checks PASS; synthetic PGlite RAM only; no cloud SQL or account. Single-connection reordering, not multi-connection contention.`);
}catch(error){console.error('FENCE PG FAIL:',error instanceof Error?error.message:String(error));process.exitCode=1;}
finally{await db.close();}
