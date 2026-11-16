/** LOCAL PGlite only. No API, browser, credentials, cloud DB or student records. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
process.on('uncaughtException',(error:any)=>{console.error(JSON.stringify({status:'FAIL',message:error.message,code:error.code,where:error.where,position:error.position,stack:error.stack?.split('\n').slice(-3)}));process.exitCode=1;});

// Exact metadata-only source readback from 16/11, provided by the root owner.
const botSource=String.raw`CREATE OR REPLACE FUNCTION public.mtm_btvn_bot_catalog(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb; scope_owner uuid;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object'
    OR p IS DISTINCT FROM '{"action":"btvn_bot_catalog"}'::jsonb THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_catalog_request');
  END IF;
  SELECT owner_id INTO scope_owner FROM mtm_hw_private.btvn_publish_scope WHERE singleton;
  IF scope_owner IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','publisher_scope_missing');
  END IF;
  SELECT jsonb_build_object('ok',true,'read_only',true,
    'checked_at',statement_timestamp(),'source','mtm_hw_private.btvn_lessons',
    'window_from',((statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-45),
    'window_to',((statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+14),
    'lessons',coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.class_name,t.lesson_date,t.lesson_code),'[]'::jsonb))
  INTO result FROM (
    SELECT l.code lesson_code,c.label class_name,
      coalesce(l.material->'classDates'->>c.label,l.material->>'date') lesson_date,
      l.material->>'title' title,
      mtm_hw_private.btvn_opens_at(l.material,c.label) opens_at,
      mtm_hw_private.btvn_planned_due(c.label,coalesce(l.material->'classDates'->>c.label,l.material->>'date')::date) expected_due_at,
      l.closes_at,l.updated_at
    FROM mtm_hw_private.btvn_lessons l
    JOIN mtm_hw_private.classes c ON c.id=ANY(l.class_ids)
    JOIN mtm_hw_private.btvn_publish_scope s ON s.singleton AND s.owner_id=l.owner_id AND c.id=ANY(s.class_ids)
    WHERE l.active AND l.publish_status='da_dang' AND l.kind='btvn' AND c.active
      AND c.owner_id=scope_owner AND l.owner_id=scope_owner AND l.code NOT LIKE 'qa-%'
      AND coalesce(l.material->'classDates'->>c.label,l.material->>'date')::date
        BETWEEN ((statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-45)
          AND ((statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+14)
  )t;
  IF jsonb_array_length(result->'lessons')>20000 THEN
    RETURN jsonb_build_object('ok',false,'error','catalog_limit_exceeded');
  END IF;
  RETURN result;
END $function$
`;
const dueSource=String.raw`CREATE OR REPLACE FUNCTION mtm_hw_private.j39_due_rows(p_class text, p_day date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object(
  'source','db_due_v1','fullName',btrim(regexp_replace(s.full_name,'\s*[\(\[].*$','')),
  'homeClass',c.label,'btvn',coalesce(a.items,'[]'::jsonb)) order by s.full_name),'[]'::jsonb)
 from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
 left join lateral (
  select jsonb_agg(jsonb_build_object('code',l.code,'title',coalesce(l.exam->>'title',l.code),
   'date',coalesce(l.material->'classDates'->>c.label,l.material->>'date'),
   'dueAt',d.due_at,'dueSource',case when d.extra_due is not null then 'override'
    when w.expected_due_at is not null then 'expected_due_at' else 'btvn_planned_due' end,
   'best',(select max(o.score) from mtm_hw_private.btvn_official_receipts(s.id,l.code) o),
   'submissions',(select count(*) from mtm_hw_private.btvn_official_receipts(s.id,l.code) o where o.submitted_at is not null))
   order by l.code) items
  from mtm_hw_private.btvn_lessons l
  left join mtm_hw_private.btvn_work w on w.student_id=s.id and w.lesson_code=l.code
  cross join lateral (select mtm_hw_private.btvn_override_due(s.id,l.code) extra_due) ex
  cross join lateral (select ex.extra_due,coalesce(ex.extra_due,w.expected_due_at,
    mtm_hw_private.btvn_planned_due(c.label,coalesce(l.material->'classDates'->>c.label,l.material->>'date')::date)) due_at) d
  where l.active and l.kind='btvn' and l.owner_id=s.owner_id and s.class_id=any(l.class_ids)
   and (d.due_at at time zone 'Asia/Ho_Chi_Minh')::date=p_day
 ) a on true
 where s.active and c.active and c.label=p_class
  and coalesce(s.source_identity,'') not like 'qa:%' and p_class !~* '(^|[^[:alnum:]_])TSA([^[:alnum:]_]|$)';
$function$
`;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
assert.equal(hash(botSource),'30ff2bd96cfcb723540dbd37777a248bc008f2be27eac307a9f64a9a62b77c71');
assert.equal(hash(dueSource),'e7a6d123d52f3b5e8258713d3f2362b41d35aa4be44e8c1cb491d72972b60ca9');
const sqlPath='supabase/migrations-pending/202611160116_qa_classrooms.sql';
const productionSql=readFileSync(sqlPath,'utf8').replaceAll('\r\n','\n');
const {db}=await baselineDatabase();
const value=async(q:string,p:any[]=[])=>((await db.query(q,p)).rows[0] as any)?.v;
const source=(name:string)=>value('select pg_get_functiondef($1::regprocedure) v',[name]);
const acl=(name:string)=>value(`select jsonb_agg(jsonb_build_array(x.grantee,x.privilege_type,x.is_grantable) order by x.grantee,x.privilege_type,x.is_grantable) v from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where p.oid=$1::regprocedure`,[name]);
let checks=0;
const test=async(name:string,run:()=>Promise<void>)=>{await run();console.log(`ĐẠT ${++checks} ${name}`);};
const rejected=async(q:string,p:any[]=[],pattern:RegExp=/QA116_|Test flag is immutable|permission denied/)=>{
 await db.exec('begin');try{await assert.rejects(()=>db.query(q,p),pattern);}finally{await db.exec('rollback');}
};
const roleCall=async(role:string,q:string,p:any[]=[])=>db.transaction(async(tx:any)=>{await tx.exec('set local role '+role);await tx.query("select set_config('request.jwt.claim.role',$1,true)",[role]);return (await tx.query(q,p)).rows[0]?.v;});
const owner='61611111-1111-4111-8111-111111111111',foreign='61611111-1111-4111-8111-111111111112';
const realClass='61622222-2222-4222-8222-222222222222',realStudent='61633333-3333-4333-8333-333333333333';
const label='2K10 QA Mobile Isolated',runRef='qa116:mobile-local-20261116';
let day:string,lessonDay:string,qaClass:string,qaStudents:string[];
const learners=[{name:'QA Safari Isolated',phone:'0000000701'},{name:'QA Zalo Isolated',phone:'0000000702'}];
const provisionSql='select mtm_test100.provision_classroom116($1,$2,$3,$4,$5,$6,$7,$8) v';
const args=()=>[runRef,label,11,foreign,day,'17:30','19:30',JSON.stringify(learners)];
const provision=(a=args())=>value(provisionSql,a);
const realFrozen=()=>value(`select jsonb_build_object('class',(select to_jsonb(c)-'is_test' from mtm_hw_private.classes c where c.id=$1),'students',(select jsonb_agg(to_jsonb(s) order by id) from mtm_hw_private.students s where s.class_id=$1),'timetable',(select jsonb_agg(to_jsonb(t)-'is_test' order by weekday,start_hm) from mtm_hw_private.timetable t where t.class_label='2K10 9+'),'work',(select jsonb_agg(to_jsonb(w) order by student_id,lesson_code) from mtm_hw_private.btvn_work w)) v`,[realClass]);
try{
 await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations-pending/20261029_1530_is_test_sync_capture.sql','utf8'));
 await db.exec("create or replace function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;alter role service_role bypassrls");
 for(const n of ['202611080106_btvn_han_tu_ghi.sql','202611020101_cong_up_btvn_gv.sql','202611020102_btvn_two_papers.sql','202611020103_lesson_upload_gateway.sql','202611120107_lesson_upload_deadline.sql','202611130108_lesson_upload_retry.sql','202611130109_lesson_staff_history.sql','202611130110_lesson_assessment.sql'])await db.exec(readFileSync('supabase/migrations-pending/'+n,'utf8'));
 // Only read-only projection bodies are copied; their ACL is synthetic and must
 // remain exactly unchanged. Legacy data and all writes below are invented.
 await db.exec(botSource+';'+dueSource+';');
 await db.exec('revoke all on function public.mtm_btvn_bot_catalog(jsonb),mtm_hw_private.j39_due_rows(text,date) from public;grant execute on function public.mtm_btvn_bot_catalog(jsonb),mtm_hw_private.j39_due_rows(text,date) to service_role;');
 await db.query('insert into auth.users values($1),($2)',[owner,foreign]);
 await db.query("insert into public.mtm_staff(user_id,short_name,display_name,role,teacher_key,must_change_password) values($1,'qa-manager','QA synthetic manager','ql',null,false),($2,'qa-teacher','QA synthetic teacher','gv','thaythanh',true)",[owner,foreign]);
 await db.query('insert into public.mtm_exam_admins(user_id) values($1)',[owner]);
 await db.query("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$2,'2K10 9+',11)",[realClass,owner]);
 await db.query("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,student_phone,source_identity) values($1,$2,$3,'HS giả đại diện dữ liệu thật','Fixture','11A','MTM-616333333333','0900000700','fixture-real')",[realStudent,owner,realClass]);
 for(let i=1;i<=4;i++)await db.query("insert into mtm_hw_private.students(owner_id,class_id,full_name,school,school_class,public_alias,source_identity,is_test) values($1,$2,$3,'Fixture','QA',$4,$5,true)",[owner,realClass,'QA legacy '+i,'MTM-61644444444'+i,'qa:legacy:'+i]);
 const legacy=(await db.query("select id from mtm_hw_private.students where source_identity='qa:legacy:1'")).rows[0].id;
 await db.query("insert into mtm_hw_private.btvn_roster_scope(singleton,owner_id,sheet_id,protected_student_ids,synced_class_ids) values(true,$1,'fixture-only',array[$2::uuid,$3::uuid],array[$4::uuid])",[owner,realStudent,legacy,realClass]);
 await db.query('insert into mtm_hw_private.btvn_publish_scope values(true,$1,array[$2::uuid])',[owner,realClass]);
 day=await value("select (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date::text v");
 lessonDay=await value("select ($1::date+((2-extract(isodow from $1::date)::int+7)%7))::text v",[day]);
 await db.query("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,mode,teacher) values('2K10 9+',extract(isodow from $1::date)::int,'17:30','19:30','Fixture','thaythanh')",[day]);
 await db.query("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status,is_test) values('old-hidden-qa',$1,array[$2::uuid],'{}','{}',false,'cho_duyet',true)",[owner,realClass]);
 await db.query("insert into mtm_hw_private.btvn_work(student_id,lesson_code,revision,drafts,receipts) values($1,'old-hidden-qa',22,'[]','[]')",[legacy]);
 const before=await realFrozen(),roster=await value('select to_jsonb(r) v from mtm_hw_private.btvn_roster_scope r'),scope=await value('select to_jsonb(s) v from mtm_hw_private.btvn_publish_scope s');
 const events=await value('select count(*)::int v from mtm_hw_private.sync_events');
 const identities=await value("select jsonb_build_array((select count(*) from mtm_hw_private.codes),(select count(*) from mtm_hw_private.student_pins),(select count(*) from mtm_hw_private.sessions),(select count(*) from mtm_hw_private.btvn_identity_sessions)) v");
 const pinned=['mtm_hw_private.hv_ca_rows(date,date)','mtm_hw_private.hv_ca_rows_real100(date,date)'];
 const oldDefinitions=await Promise.all(pinned.map(source));
 const preservedAcl=['public.mtm_btvn_classes()','public.mtm_btvn_bot_catalog(jsonb)','mtm_hw_private.j39_due_rows(text,date)','public.mtm_dd_api4(jsonb)','public.mtm_lesson_upload_api(jsonb)'];
 const oldAcl=await Promise.all(preservedAcl.map(acl));
 // Match Supabase's default function grants, including an extra inherited role:
 // a newly created wrapper must not retain grants absent from its predecessor.
 await db.exec('alter default privileges in schema public grant execute on functions to anon,authenticator;alter default privileges in schema mtm_test100 grant execute on functions to anon,authenticator;');
 const defaultAcl=await value('select jsonb_agg(to_jsonb(d) order by oid) v from pg_default_acl d');
 // PGlite canonicalizes CREATE FUNCTION formatting differently from cloud PG.
 // Substitute ONLY known predecessor hash literals with their local canonical
 // equivalents; production SQL keeps all five real readback pins unchanged.
 let sql=productionSql;
 for(const [signature,pin] of [
  ['mtm_hw_private.sync_capture()','2cda7c3bafeb966be7016fc32ab3d0ef7998ffbdc97ddc0272652ebdf4adb6b0'],
  ['public.mtm_btvn_classes()','6f30d4b2e72ce36a72a91971d5946c0d65a523c439fbd2a5e638760cda7a6609'],
  ['public.mtm_dd_api4(jsonb)','062dc037caa3f4f8153152ba95603e0675825f6124e96e73ef46569a90a4b0b3'],
  ['public.mtm_btvn_bot_catalog(jsonb)','30ff2bd96cfcb723540dbd37777a248bc008f2be27eac307a9f64a9a62b77c71'],
  ['mtm_hw_private.j39_due_rows(text,date)','e7a6d123d52f3b5e8258713d3f2362b41d35aa4be44e8c1cb491d72972b60ca9'],
 ]){assert.equal(sql.split(pin).length,2);sql=sql.replace(pin,hash(await source(signature)));}
 await test('Pin rejects drift before any DDL; unknown source cannot widen QA infrastructure',async()=>{
  const original=await source('public.mtm_btvn_bot_catalog(jsonb)');await db.exec(original.replace('DECLARE result','DECLARE /* drift */ result'));
  await assert.rejects(()=>db.exec(sql),/QA116_PREDECESSOR_CHANGED/);await db.exec('rollback');
  assert.equal(await value("select count(*)::int v from information_schema.columns where table_schema='mtm_hw_private' and table_name='classes' and column_name='is_test'"),0);
  await db.exec(original);
 });
 await db.exec(sql);
 await test('Migration preserves legacy four learners, hidden QA, work, scope, roster, hv functions and ACLs',async()=>{
  assert.deepEqual(await realFrozen(),before);assert.deepEqual(await value('select to_jsonb(r) v from mtm_hw_private.btvn_roster_scope r'),roster);
  assert.deepEqual(await value('select to_jsonb(s) v from mtm_hw_private.btvn_publish_scope s'),scope);assert.equal(await value('select count(*)::int v from mtm_hw_private.sync_events'),events);
  assert.deepEqual(await Promise.all(pinned.map(source)),oldDefinitions);assert.deepEqual(await Promise.all(preservedAcl.map(acl)),oldAcl);
 });
 await test('Private owner-only invoker has no callable grant or SECURITY DEFINER elevation',async()=>{
  for(const role of ['anon','authenticated','service_role','authenticator'])await assert.rejects(()=>roleCall(role,provisionSql,args()),/permission denied/);
  assert.equal(await value("select prosecdef v from pg_proc where oid='mtm_test100.provision_classroom116(text,text,integer,uuid,date,text,text,jsonb)'::regprocedure"),false);
 });
 await test('Default EXECUTE grants are cleared on new functions without altering defaults or legacy ACLs',async()=>{
  assert.deepEqual(await value('select jsonb_agg(to_jsonb(d) order by oid) v from pg_default_acl d'),defaultAcl);
  assert.equal(await value("select count(*)::int v from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where n.nspname='mtm_test100' and p.proname in ('guard_class116','guard_student_class116','guard_membership116','guard_timetable116','guard_assignment116','provision_classroom116') and x.grantee<>p.proowner"),0);
  assert.deepEqual(await value("select jsonb_agg(r.rolname order by r.rolname) v from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x join pg_roles r on r.oid=x.grantee where p.oid='public.mtm_btvn_qa_class116(uuid)'::regprocedure and x.grantee<>p.proowner"),['service_role']);
  assert.deepEqual(await Promise.all(preservedAcl.map(acl)),oldAcl);
 });
 const result=await provision();qaClass=result.classId;qaStudents=result.studentIds;
 await test('One isolated class + two synthetic learners + one normal native session, no outbox/auth side effects',async()=>{
  assert.equal(result.isTest,true);assert.equal(result.preserved,false);assert.equal(qaStudents.length,2);
  assert.equal(await value('select count(*)::int v from mtm_hw_private.students where class_id=$1 and is_test and owner_id=$2',[qaClass,owner]),2);
  assert.equal(await value('select count(*)::int v from mtm_hw_private.students where class_id=$1 and not is_test',[qaClass]),0);
  assert.equal(await value('select count(*)::int v from mtm_hw_private.memberships where class_id=$1 and student_id=any($2::uuid[])',[qaClass,qaStudents]),2);
  assert.equal(await value('select count(*)::int v from mtm_hw_private.lesson_sessions($1,$1) where class_id=$2',[day,qaClass]),1);
  assert.deepEqual(await value('select class_ids v from mtm_hw_private.btvn_publish_scope'),[realClass,qaClass]);
  assert.equal(await value('select must_change_password v from public.mtm_staff where user_id=$1',[foreign]),true);
  assert.deepEqual(await value('select to_jsonb(r) v from mtm_hw_private.btvn_roster_scope r'),roster);assert.deepEqual(await realFrozen(),before);
  assert.equal(await value('select count(*)::int v from mtm_hw_private.sync_events'),events);
  assert.deepEqual(await value("select jsonb_build_array((select count(*) from mtm_hw_private.codes),(select count(*) from mtm_hw_private.student_pins),(select count(*) from mtm_hw_private.sessions),(select count(*) from mtm_hw_private.btvn_identity_sessions)) v"),identities);
 });
 await test('Public class list hides QA; exact service reader exposes only its name array',async()=>{
  assert.deepEqual(await roleCall('service_role','select public.mtm_btvn_classes() v'),['2K10 9+']);
  assert.deepEqual(await roleCall('service_role','select public.mtm_btvn_qa_class116($1) v',[qaClass]),[label]);
  for(const role of ['anon','authenticated','authenticator'])await assert.rejects(()=>roleCall(role,'select public.mtm_btvn_qa_class116($1) v',[qaClass]),/permission denied/);
  await assert.rejects(()=>roleCall('service_role','select public.mtm_btvn_qa_class116($1) v',[realClass]),/QA116_CLASS_UNAVAILABLE/);
 });
 await test('Real/foreign learner and membership cannot enter QA; new QA learners cannot move to real classes',async()=>{
  await rejected('update mtm_hw_private.students set class_id=$1 where id=$2',[qaClass,realStudent],/QA116_REAL_STUDENT/);
  await rejected('update mtm_hw_private.students set owner_id=$1 where id=$2',[foreign,qaStudents[0]],/QA116_REAL_STUDENT/);
  await rejected('insert into mtm_hw_private.memberships(student_id,class_id) values($1,$2)',[realStudent,qaClass],/QA116_MEMBERSHIP_SCOPE/);
  await rejected('insert into mtm_hw_private.memberships(student_id,class_id) values($1,$2)',[qaStudents[0],realClass],/QA116_MEMBERSHIP_SCOPE/);
  await rejected('update mtm_hw_private.students set class_id=$1 where id=$2',[realClass,qaStudents[0]],/QA116_TEST_STUDENT_CLASS_IMMUTABLE/);
 });
 await test('Class/timetable test flag and QA identity are immutable; no conversion of old rows',async()=>{
  for(const [id,flag] of [[realClass,true],[qaClass,false]])await rejected('update mtm_hw_private.classes set is_test=$1 where id=$2',[flag,id]);
  await rejected('update mtm_hw_private.timetable set is_test=false where class_label=$1',[label]);
  await rejected("update mtm_hw_private.timetable set is_test=true where class_label='2K10 9+'");
  await rejected('update mtm_hw_private.classes set label=$1 where id=$2',['2K10 QA Renamed Class',qaClass],/QA116_CLASS_IDENTITY_IMMUTABLE/);
  await rejected('update mtm_hw_private.classes set grade=12 where id=$1',[qaClass],/QA116_CLASS_IDENTITY_IMMUTABLE/);
  await rejected('insert into mtm_hw_private.classes(owner_id,label,grade) values($1,$2,11)',[foreign,label],/QA116_CLASS_LABEL_COLLISION/);
 });
 await test('QA timetable rejects false flags, real classes, unknown teachers and inverted times',async()=>{
  await rejected('update mtm_hw_private.timetable set teacher=$1 where class_label=$2',['unknownteacher',label],/QA116_TIMETABLE_SCOPE/);
  await rejected("update mtm_hw_private.timetable set end_hm='16:00' where class_label=$1",[label],/QA116_TIMETABLE_SCOPE/);
  await rejected("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher) values($1,7,'10:00','11:00','thaythanh')",[label],/QA116_TIMETABLE_SCOPE/);
  await rejected("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher,is_test) values('2K10 9+',7,'10:00','11:00','thaythanh',true)",[],/QA116_TIMETABLE_SCOPE/);
 });
 const lesson=async(code:string,ids:string[],isTest:boolean)=>db.query("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status,is_test,kind) values($1,$2,$3,$4,'{}',true,'da_dang',$5,'btvn')",[code,owner,ids,JSON.stringify({date:lessonDay,title:'Synthetic source only',classDates:Object.fromEntries(ids.map(id=>[id===qaClass?label:'2K10 9+',lessonDay]))}),isTest]);
 await test('Lesson and native upload guards reject false/mixed QA assignments while retaining legacy test-in-real support',async()=>{
  for(const [ids,flag] of [[[qaClass],false],[[realClass,qaClass],true]]){
   await db.exec('begin');await assert.rejects(()=>lesson('rejected-lesson',ids as string[],flag as boolean),/QA116_MIXED_ASSIGNMENT_SCOPE/);await db.exec('rollback');
  }
  await lesson('web-isolated-qa',[qaClass],true);await lesson('web-legacy-qa-in-real',[realClass],true);await lesson('web-real-control',[realClass],false);
  for(const [ids,flag] of [[[qaClass],false],[[realClass,qaClass],true]])await rejected("insert into mtm_hw_private.lesson_uploads(class_ids,class_dates,start_times,end_times,class_names,due_at_by_class,lesson_date,teacher_key,title,uploaded_by,version,group_key,is_test) values($1,'{}','{}','{}','{}','{}',$2,'thaythanh','Fixture',$3,1,'fixture-guard',$4)",[ids,day,owner,flag],/QA116_MIXED_ASSIGNMENT_SCOPE/);
  await rejected("update mtm_hw_private.btvn_lessons set owner_id=$1 where code='web-isolated-qa'",[foreign],/QA116_ASSIGNMENT_OWNER_MISMATCH/);
  await rejected("insert into mtm_hw_private.assignments(owner_id,draft_id,class_id,exam,version_hash,opens_at,due_at,month_key,weight,rank_eligible) values($1,gen_random_uuid(),$2,'{}',$3,clock_timestamp(),clock_timestamp()+interval '1 hour','2026-11',1,false)",[owner,qaClass,'a'.repeat(64)],/QA116_LEGACY_ASSIGNMENT_UNSCOPED/);
 });
 await test('Normal native catalogs hide QA; explicit test catalogs can select its ordinary session',async()=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  const catalog=await roleCall('authenticated','select public.mtm_lesson_upload_api($1) v',[JSON.stringify({action:'catalog',from:day,to:day})]);
  assert.deepEqual(catalog.classes.map((c:any)=>c.id),[realClass]);assert.deepEqual(catalog.sessions.map((c:any)=>c.class_id),[realClass]);
  const qa=await roleCall('authenticated','select public.mtm_lesson_upload_api($1) v',[JSON.stringify({action:'catalog',from:day,to:day,is_test:true})]);
  assert.ok(qa.classes.some((c:any)=>c.id===qaClass));assert.ok(qa.sessions.some((c:any)=>c.class_id===qaClass));
 });
 await test('Ordinary manager native intake accepts isolated BTVN and EXAM with private synthetic PDF metadata',async()=>{
  const path=`${owner}/61655555-5555-4555-8555-555555555555/homework.pdf`,answerPath=path.replace('homework.pdf','answer.pdf');
  for(const name of [path,answerPath])await db.query("insert into storage.objects(bucket_id,name,metadata) values('mtm-lesson-private',$1,'{\"mimetype\":\"application/pdf\",\"size\":100}')",[name]);
  const base={action:'create',class_ids:[qaClass],teacher_key:'thaythanh',on_behalf_of:'thaythanh',lesson_date:day,title:'QA isolated source',task_scope:'Toàn bộ phiếu giả',homework_path:path,answer_path:answerPath,is_test:true};
  const homework=await roleCall('authenticated','select public.mtm_lesson_upload_api($1) v',[JSON.stringify({...base,work_kind:'homework',client_request_id:'61677777-7777-4777-8777-777777777771'})]);
  const exam=await roleCall('authenticated','select public.mtm_lesson_upload_api($1) v',[JSON.stringify({...base,work_kind:'exam',assessment_id:'61666666-6666-4666-8666-666666666666',exam_type:'custom',client_request_id:'61677777-7777-4777-8777-777777777772',exam_config:{duration_minutes:5}})]);
  for(const id of [homework.upload_id,exam.upload_id]){
   assert.ok(id);assert.deepEqual(await value('select class_ids v from mtm_hw_private.lesson_uploads where id=$1',[id]),[qaClass]);
   assert.equal(await value('select is_test v from mtm_hw_private.lesson_uploads where id=$1',[id]),true);
   assert.equal(await value('select count(*)::int v from mtm_hw_private.lesson_upload_steps where upload_id=$1',[id]),6);
  }
  const ordinary={...base,is_test:false,client_request_id:'61677777-7777-4777-8777-777777777773'};
  await assert.rejects(()=>roleCall('authenticated','select public.mtm_lesson_upload_api($1) v',[JSON.stringify(ordinary)]),/QA116_MIXED_ASSIGNMENT_SCOPE/);
  assert.equal(await value('select must_change_password v from public.mtm_staff where user_id=$1',[foreign]),true);
 });
 await test('Bot catalog excludes web-* QA lessons in both real and QA classes; j39 excludes test learners and lessons',async()=>{
  const bot=await roleCall('service_role',"select public.mtm_btvn_bot_catalog('{\"action\":\"btvn_bot_catalog\"}') v");
  assert.deepEqual(bot.lessons.map((x:any)=>x.lesson_code),['web-real-control']);
  assert.deepEqual(await value('select mtm_hw_private.j39_due_rows($1,$2) v',[label,day]),[]);
  const planned=await value("select (mtm_hw_private.btvn_planned_due('2K10 9+',$1) at time zone 'Asia/Ho_Chi_Minh')::date::text v",[lessonDay]);
  assert.ok(planned);
  const due=await value("select mtm_hw_private.j39_due_rows('2K10 9+',$1) v",[planned]);
  assert.equal(due.length,1);assert.equal(due[0].fullName,'HS giả đại diện dữ liệu thật');
  assert.deepEqual(due[0].btvn.map((x:any)=>x.code),['web-real-control']);
 });
 await test('Normal MTM tkb import replaces real rows exactly and preserves the QA timetable row',async()=>{
  await db.exec('begin');
  try{
   const testRow=await value('select to_jsonb(t) v from mtm_hw_private.timetable t where class_label=$1',[label]);
   await db.query('select public.mtm_dd_api4($1)',[JSON.stringify({action:'tkb',rows:[{class:'2K10 9+',weekday:7,start:'10:00',end:'11:00',mode:'Fixture updated',teacher:'thaythanh'}]})]);
   assert.deepEqual(await value('select to_jsonb(t) v from mtm_hw_private.timetable t where class_label=$1',[label]),testRow);
   const rows=(await db.query('select class_label,weekday,start_hm,end_hm,is_test from mtm_hw_private.timetable where not is_test')).rows;
   assert.deepEqual(rows,[{class_label:'2K10 9+',weekday:7,start_hm:'10:00',end_hm:'11:00',is_test:false}]);
  }finally{await db.exec('rollback');}
 });
 await test('Identical provision replays preserve IDs/old scope; changed request and invalid ownership/teacher/phones fail',async()=>{
  const count=await value('select count(*)::int v from mtm_hw_private.sync_events');
  assert.deepEqual(await provision(),{...result,preserved:true});
  assert.equal(await value('select count(*)::int v from mtm_hw_private.sync_events'),count);
  const changed=args();changed[2]=12;await rejected(provisionSql,changed,/QA116_REPLAY_OR_STATE_CHANGED/);
  const unknown=args();unknown[3]=owner;await rejected(provisionSql,unknown,/QA116_OWNER_OR_TEACHER_UNVERIFIED/);
  const malformed=args();malformed[7]=JSON.stringify([{name:'QA A',phone:'0900000001'},learners[1]]);await rejected(provisionSql,malformed,/QA116_SYNTHETIC_LEARNERS_REQUIRED/);
  const duplicate=args();duplicate[7]=JSON.stringify([learners[0],learners[0]]);await rejected(provisionSql,duplicate,/QA116_SYNTHETIC_LEARNERS_REQUIRED/);
  await db.exec('begin');
  try{await db.query("update mtm_hw_private.students set full_name='QA changed identity' where id=$1",[qaStudents[0]]);await assert.rejects(()=>provision(),/QA116_REPLAY_OR_STATE_CHANGED/);}finally{await db.exec('rollback');}
  assert.deepEqual(await value('select to_jsonb(r) v from mtm_hw_private.btvn_roster_scope r'),roster);
  assert.deepEqual(await value('select class_ids v from mtm_hw_private.btvn_publish_scope'),[realClass,qaClass]);
 });
 console.log(`QA116 local: ${checks} groups PASS; no physical-browser or live-publication claim.`);
}finally{await db.close();}
