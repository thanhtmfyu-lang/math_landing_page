import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {validateStaffStudentWork,type StaffStudentWorkRequest} from '../src/native/lesson-upload/staff-student-work';

const db=new PGlite();
const migrations=process.env.MTM_ROOT+'/supabase/migrations-pending/';
const canonicalHistory=readFileSync(migrations+'202611130109_lesson_staff_history.sql','utf8');
const assignmentDay=canonicalHistory.match(/create or replace function mtm_hw_private\.lesson_history_day109\([\s\S]*?\$\$;/)?.[0];
assert(assignmentDay);

const uuid=(n:number)=>'f0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [teacher,otherTeacher,student,otherStudent,cls,otherClass]=[1,2,3,4,5,6].map(uuid);
const className='Lớp giả lập';
const classDay='2026-01-03',homeworkDay='2026-01-02';
const timestamp=Date.parse('2026-01-02T12:00:00Z');
const privateMarker='QA_PRIVATE_MUST_NOT_APPEAR';
const hw:StaffStudentWorkRequest={student_id:student,class_id:cls,lesson_date:classDay,assignment_id:'homework-v1',work_kind:'homework',mode:'session'};
const examRequest:StaffStudentWorkRequest={...hw,assignment_id:'exam-v1',work_kind:'exam',mode:'assignment'};
const rubricVersion='fixture-rubric';
const first={id:'fixture-paper1',versionHash:'a'.repeat(64),rubricVersion,questions:[{id:'q1',kind:'mc',answerKey:privateMarker},
 {id:'q2',kind:'tf',solution:privateMarker},{id:'q3',kind:'short',prompt:privateMarker},{id:'q4',kind:'mc'}]};
const second={id:'fixture-paper2',versionHash:'b'.repeat(64),rubricVersion,questions:[{id:'q3',kind:'short'},{id:'q1',kind:'mc'}]};
const receipt=(attemptId:string,submittedAt:number,officialScore:number|null)=>({attemptId,submittedAt,officialScore,score:9.99,answerKey:privateMarker});
const draft=(paper:typeof first,attemptId:string,submittedAt:number|null,answers:Record<string,unknown>)=>({version:1,
 examId:paper.id,examVersionHash:paper.versionHash,rubricVersion,attemptId,submittedAt,answers,solution:privateMarker});

try{
 await db.exec(`
  create role authenticated;
  create role anon;
  create role service_role bypassrls;
  alter default privileges grant execute on functions to anon,service_role;
  create schema mtm_hw_private;
  create schema fixture;
  create table mtm_hw_private.btvn_lessons(code text primary key,kind text,is_test boolean,material jsonb,exam jsonb,opens_at timestamptz,closes_at timestamptz);
  create table mtm_hw_private.btvn_work(student_id uuid,lesson_code text,receipts jsonb not null,drafts jsonb not null,primary key(student_id,lesson_code));
  create table mtm_hw_private.btvn_paper_choices(student_id uuid,lesson_code text,paper int,primary key(student_id,lesson_code));
  create table mtm_hw_private.btvn_second_papers(lesson_code text primary key,exam jsonb);
  create table fixture.history(mode text,kind text,student_id uuid,class_id uuid,day date,scope_user uuid,body jsonb,
   primary key(mode,kind,student_id,class_id,day,scope_user));
  create function mtm_hw_private.lesson_staff_history110(p jsonb) returns jsonb language plpgsql stable set search_path='' as $$
  declare v_row jsonb;
  begin
   if current_setting('request.jwt.claim.sub',true)<>'${teacher}' then raise exception 'SYNTHETIC_STAFF_DENIED' using errcode='42501';end if;
   if p->>'action'<>'staff_history' or p->>'from_date'<>p->>'to_date' or p->'page' is distinct from '1'::jsonb
    or p->'page_size' is distinct from '1'::jsonb or (select count(*) from jsonb_object_keys(p))<>9 then
    raise exception 'NON_EXACT_HISTORY_REQUEST';
   end if;
   select h.body into v_row from fixture.history h where h.mode=p->>'mode' and h.kind=p->>'work_kind'
    and h.student_id=(p->>'student_id')::uuid and h.class_id=(p->>'class_id')::uuid and h.day=(p->>'from_date')::date
    and h.scope_user=current_setting('request.jwt.claim.sub')::uuid;
   return jsonb_build_object('ok',true,'work_kind',p->>'work_kind','mode',p->>'mode',
    'rows',case when v_row is null then '[]'::jsonb else jsonb_build_array(v_row) end);
  end$$;
  create function mtm_hw_private.btvn_official_receipts_real100(p_student uuid,p_lesson text)
  returns table(receipt jsonb,score numeric,submitted_at numeric) language sql stable set search_path='' as $$
   select r,(r->>'officialScore')::numeric,
    case when jsonb_typeof(r->'submittedAt')='number' then (r->>'submittedAt')::numeric end
   from mtm_hw_private.btvn_work w cross join lateral jsonb_array_elements(w.receipts) r
   where w.student_id=p_student and w.lesson_code=p_lesson
  $$;
 `);
 await db.exec(assignmentDay);
 await db.exec(readFileSync(migrations+'202611200121_staff_student_work.sql','utf8'));

 async function seedHistory(request:StaffStudentWorkRequest,assignmentDate:string,status='submitted',rowId=request.student_id){
  const row={student_id:rowId,class_id:request.class_id,class_name:className,lesson_date:request.lesson_date,
   student_name:privateMarker,homework:[{assignment_id:request.assignment_id,lesson_date:assignmentDate,title:'Bài ' + request.assignment_id,work_kind:request.work_kind,status}]};
  await db.query('insert into fixture.history values($1,$2,$3,$4,$5,$6,$7) on conflict(mode,kind,student_id,class_id,day,scope_user) do update set body=excluded.body',
   [request.mode,request.work_kind,request.student_id,request.class_id,request.lesson_date,teacher,row]);
 }
 const seedWork=async(code:string,receipts:unknown[],drafts:unknown[])=>db.query(
  'insert into mtm_hw_private.btvn_work values($1,$2,$3,$4) on conflict (student_id,lesson_code) do update set receipts=excluded.receipts,drafts=excluded.drafts',
  [student,code,JSON.stringify(receipts),JSON.stringify(drafts)]);
 await db.query("insert into mtm_hw_private.btvn_lessons values($1,'btvn',false,$2,$3,null,null),($4,'kiem-tra',false,$5,$3,'2026-01-01','2026-01-04')",
  [hw.assignment_id,{classDates:{[className]:homeworkDay}},first,examRequest.assignment_id,{classDates:{[className]:classDay}}]);
 await seedHistory(hw,homeworkDay);
 await seedHistory(examRequest,classDay);

 const raw=(p:unknown,user=teacher,role='authenticated')=>db.transaction(async tx=>{
  await tx.exec(`set local role ${role}`);
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
  return (await tx.query('select public.mtm_staff_student_work($1::jsonb) as value',[JSON.stringify(p)])).rows[0].value;
 });
 const call=async (request:StaffStudentWorkRequest)=>validateStaffStudentWork(await raw(request),request);
 const reject=(p:unknown,code:string,user?:string,role?:string)=>assert.rejects(()=>raw(p,user,role),{code});
 assert.equal((await db.query("select has_function_privilege('authenticated','public.mtm_staff_student_work(jsonb)','execute') as ok")).rows[0].ok,true);
 await reject(hw,'42501',teacher,'anon');
 await reject(hw,'42501',teacher,'service_role');
 await reject(hw,'42501',otherTeacher);
 for(const request of [{...hw,student_id:otherStudent},{...hw,class_id:otherClass},{...hw,lesson_date:homeworkDay},
  {...hw,mode:'assignment'},{...hw,work_kind:'exam'},{...hw,assignment_id:examRequest.assignment_id}])await reject(request,'42501');
 for(const request of [null,[],{...hw,student_id:null},{...hw,lesson_date:'2026-02-30'},{...hw,teacher}])await reject(request,'22023');
 await seedHistory(hw,homeworkDay,'submitted',otherStudent);
 await reject(hw,'42501');
 await seedHistory(hw,classDay);
 await reject(hw,'42501');
 await seedHistory(hw,homeworkDay);

 assert.deepEqual(await call(hw),{...hw,title:'Bài homework-v1',status:'not_submitted',attempts:[]});
 await seedWork(hw.assignment_id,[],[draft(first,'started',null,{q1:privateMarker})]);
 assert.equal((await call(hw)).status,'not_submitted');
 await seedWork(hw.assignment_id,[receipt('receipt-without-draft',timestamp+1,0),receipt('ok',timestamp,6.67),
  receipt('wrong-time',timestamp+2,5),{...receipt('wrong-version',timestamp+3,null),attemptNumber:5}],
  [draft(first,'ok',timestamp,{q1:'B',q2:[true,null,false,true],q3:'−7',outside:privateMarker}),
   draft(first,'started',null,{q1:privateMarker}),draft(first,'wrong-time',timestamp,{q3:privateMarker}),
   draft(second,'wrong-version',timestamp+3,{q3:privateMarker})]);
 const done=await call(hw);
 assert.deepEqual(done,{...hw,title:'Bài homework-v1',status:'ready',attempts:[
  {number:1,submitted_at:timestamp,score:6.67,answers:[{number:1,label:'Câu 1',answer:'B'},
   {number:2,label:'Câu 2',answer:[true,null,false,true]},{number:3,label:'Câu 3',answer:'−7'},{number:4,label:'Câu 4',answer:null}]},
  {number:2,submitted_at:timestamp+1,score:0,answers:[]},{number:3,submitted_at:timestamp+2,score:5,answers:[]},
  {number:5,submitted_at:timestamp+3,score:null,answers:[]},
 ]});
 assert(!JSON.stringify(done).includes(privateMarker));

 await seedWork(examRequest.assignment_id,[receipt('exam',timestamp,8)],[draft(first,'exam',timestamp,{q1:'C'})]);
 assert.equal((await call(examRequest)).attempts[0].answers[0].answer,'C');
 await seedHistory(examRequest,classDay,'not_released');
 assert.equal((await call(examRequest)).status,'not_released');
 await seedHistory(examRequest,classDay);
 for(const expression of ["current_timestamp+interval '1 day'","'infinity'","'2025-01-01'",'null']){
  await db.query(`update mtm_hw_private.btvn_lessons set closes_at=${expression} where code=$1`,[examRequest.assignment_id]);
  const masked=await call(examRequest);
  assert.equal(masked.status,'not_released');
  assert.deepEqual(masked.attempts,[]);
 }

 await db.query('insert into mtm_hw_private.btvn_second_papers values($1,$2)',[hw.assignment_id,second]);
 assert.deepEqual((await call(hw)).attempts[0].answers,[]);
 await db.query('insert into mtm_hw_private.btvn_paper_choices values($1,$2,2)',[student,hw.assignment_id]);
 await seedWork(hw.assignment_id,[receipt('paper2',timestamp,7)],[draft(second,'paper2',timestamp,{q1:'D',q3:'40'})]);
 assert.deepEqual((await call(hw)).attempts[0].answers,[{number:1,label:'Câu 1',answer:'40'},{number:2,label:'Câu 2',answer:'D'}]);
 await seedWork(hw.assignment_id,[receipt('paper2',timestamp,7)],[draft(second,'paper2',timestamp,{q1:'D'}),draft(second,'paper2',timestamp,{q1:'C'})]);
 assert.deepEqual((await call(hw)).attempts[0].answers,[]);
 await db.query('delete from mtm_hw_private.btvn_second_papers where lesson_code=$1',[hw.assignment_id]);
 await seedWork(hw.assignment_id,[receipt('paper2',timestamp,7)],[draft(second,'paper2',timestamp,{q1:'D'})]);
 assert.deepEqual((await call(hw)).attempts[0].answers,[]);
 await db.query('update mtm_hw_private.btvn_lessons set is_test=true where code=$1',[hw.assignment_id]);
 await reject(hw,'42501');
 console.log('Staff student work SQL: exact report scope, submitted snapshots, official points, paper 2, and assessment embargo passed.');
}finally{await db.close();}
