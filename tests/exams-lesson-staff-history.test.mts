import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
let checks=0;
const {db}=await baselineDatabase();
try{
 await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
 await db.exec(`create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;`);
 for(const name of ['202611020101_cong_up_btvn_gv.sql','202611020102_btvn_two_papers.sql','202611020103_lesson_upload_gateway.sql','202611120107_lesson_upload_deadline.sql','202611130108_lesson_upload_retry.sql','202611130109_lesson_staff_history.sql'])await db.exec(readFileSync('supabase/migrations-pending/'+name,'utf8'));
 await db.exec(readFileSync('supabase/migrations-pending/202611130109_lesson_staff_history.sql','utf8'));checks++;
 await db.exec('select mtm_test100.refresh_reports()');checks++;
 const owner='11111111-1111-4111-8111-111111111111',gvA='11111111-1111-4111-8111-111111111112',gvB='11111111-1111-4111-8111-111111111113',manager='11111111-1111-4111-8111-111111111114',foreignOwner='11111111-1111-4111-8111-111111111119';
 const a='22222222-2222-4222-8222-222222222221',b='22222222-2222-4222-8222-222222222222',foreignClass='22222222-2222-4222-8222-222222222229';
 const s1='33333333-3333-4333-8333-333333333331',s2='33333333-3333-4333-8333-333333333332',s3='33333333-3333-4333-8333-333333333333',qa='33333333-3333-4333-8333-333333333334',onlyB='33333333-3333-4333-8333-333333333335',foreignStudent='33333333-3333-4333-8333-333333333339';
 const today=(await db.query("select (current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date::text d")).rows[0].d;
 const day=(offset:number)=>new Date(Date.parse(today+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
 const oldClassDay=day(-8),newClassDay=day(-1),oldAssignmentDay=day(-9),newAssignmentDay=day(-2),transferDay=day(-4);
 const wd=(date:string)=>new Date(date+'T12:00:00Z').getUTCDay()||7;
 await db.query('insert into auth.users values($1),($2),($3),($4),($5)',[owner,gvA,gvB,manager,foreignOwner]);
 await db.query(`insert into public.mtm_staff(user_id,short_name,display_name,role,teacher_key) values
 ($1,'fixture-admin','Quản trị giả','admin','thaythanh'),($2,'fixture-gv-a','Giáo viên A giả','gv','thaytai'),($3,'fixture-gv-b','Giáo viên B giả','gv','thayhieu'),($4,'fixture-manager','Quản lý giả','ql',null)`,[owner,gvA,gvB,manager]);
 await db.query("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$4,'2K10 XPT',11),($2,$4,'2K11 XPT',10),($3,$5,'Lớp ngoài trung tâm giả',11)",[a,b,foreignClass,owner,foreignOwner]);
 await db.query("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher,mode) values('2K10 XPT',$1,'17:30','19:30','thaytai','tại lớp'),('2K11 XPT',$1,'19:30','21:30','thayhieu','tại lớp')",[wd(oldClassDay)]);
 await db.query("insert into mtm_hw_private.btvn_roster_scope(singleton,owner_id,sheet_id,protected_student_ids,synced_class_ids) values(true,$1,'fixture-only',array[$2::uuid,$3::uuid],array[$4::uuid,$5::uuid])",[owner,s1,s2,a,b]);
 await db.query('insert into mtm_hw_private.btvn_publish_scope values(true,$1,array[$2::uuid,$3::uuid])',[owner,a,b]);
 for(const [id,name,cls,own,isTest,active,alias] of [[s1,'Nguyễn An (ghi chú riêng không trả)',b,owner,false,true,'MTM-000000000001'],[s2,'Nguyễn An',a,owner,false,true,'MTM-000000000002'],[s3,'Bạn đã nghỉ giả',a,owner,false,false,'MTM-000000000003'],[qa,'Tài khoản thử phải loại',a,owner,true,true,'MTM-000000000004'],[onlyB,'Bình chỉ lớp B giả',b,owner,false,true,'MTM-000000000005'],[foreignStudent,'Ngoài trung tâm phải loại',foreignClass,foreignOwner,false,true,'MTM-000000000009']] as const){
  await db.query("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,is_test,active,created_at) values($1,$2,$3,$4,'Trường giả','Lớp giả',$5,$6,$7,$8::date)",[id,own,cls,name,alias,isTest,active,day(-30)]);
 }
 await db.query('insert into mtm_hw_private.memberships(student_id,class_id,joined_at,left_at) values($1,$2,$3::date,$4::date)',[s1,a,day(-30),transferDay]);
 await db.query('insert into mtm_hw_private.memberships(student_id,class_id,joined_at) values($1,$2,$3::date),($4,$5,$6::date)',[s1,b,transferDay,s2,a,day(-30)]);
 await db.query('insert into mtm_hw_private.memberships(student_id,class_id,joined_at,left_at) values($1,$2,$3::date,$4::date)',[s3,a,day(-30),day(-3)]);
 await db.query("insert into mtm_hw_private.class_transfers(student_id,from_class,to_class,effective_date,applied_at,source_msg) values($1,'2K10 XPT','2K11 XPT',$2::date,current_timestamp,'fixture-transfer')",[s1,transferDay]);
 await db.query("insert into mtm_hw_private.student_leaves(student_id,leave_date,applied_at,source_msg) values($1,$2::date,current_timestamp,'fixture-leave')",[s3,day(-3)]);
 await db.query("insert into mtm_hw_private.attendance(student_id,class_label,session_date,status,source) values($1,'2K10 XPT',$2::date,'co_mat','quan_ly')",[s1,oldClassDay]);
 // A raw room sample can make the canonical projection infer absence. The new
 // report must still return NULL when this student's confirmed row is missing.
 await db.query("insert into mtm_hw_private.attendance_raw(source,session_date,room,raw_name,time_in,class_label) values('van_tay',$1::date,'fixture','Unmatched fixture','19:30','2K11 XPT')",[newClassDay]);
 const epoch=(date:string,hour='18:00')=>Date.parse(date+'T'+hour+':00+07:00');
 async function lesson(code:string,cls:string,date:string,title:string,exam={questions:[] as any[]}){
  const label=cls===a?'2K10 XPT':cls===b?'2K11 XPT':'Lớp ngoài trung tâm giả';
  await db.query("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status,source_version,is_test) values($1,$2,array[$3::uuid],$4,$5,true,'da_dang',$6,false)",[code,owner,cls,JSON.stringify({date,classNames:[label],classDates:{[label]:date}}),JSON.stringify({title,...exam}),'c'.repeat(64)]);
 }
 await lesson('fixture-old-a1',a,oldAssignmentDay,'Bài A thứ nhất');await lesson('fixture-old-a2',a,oldAssignmentDay,'Bài A thứ hai');
 await lesson('fixture-new-b',b,newAssignmentDay,'Bài B chờ chấm',{questions:[{id:'essay',kind:'self'}]});
 await lesson('fixture-old-a-stale',a,oldAssignmentDay,'Phiên bản cũ còn biên nhận');
 await lesson('fixture-paired',a,day(-11),'Bài ghép hai lớp');
 await db.query("update mtm_hw_private.btvn_lessons set class_ids=array[$1::uuid,$2::uuid],material=$3 where code='fixture-paired'",[a,b,JSON.stringify({date:day(-11),classNames:['2K10 XPT','2K11 XPT'],classDates:{'2K10 XPT':day(-11),'2K11 XPT':day(-11)}})]);
 await db.query("update mtm_hw_private.btvn_lessons set active=false,publish_status='cho_duyet',class_ids='{}' where code='fixture-old-a-stale'");
 for(const [student,code,score] of [[s1,'fixture-old-a1',8.5],[s1,'fixture-old-a2',7],[s1,'fixture-old-a-stale',6],[s2,'fixture-old-a1',0],[s1,'fixture-new-b',9]] as const){
  const submitted=epoch(code==='fixture-new-b'?newAssignmentDay:oldAssignmentDay);
  await db.query('insert into mtm_hw_private.btvn_work(student_id,lesson_code,receipts) values($1,$2,$3)',[student,code,JSON.stringify([{attemptId:'fixture-'+code,score,submittedAt:submitted,late:false}])]);
 }
 await db.query("insert into mtm_hw_private.btvn_work(student_id,lesson_code,receipts) values($1,'fixture-paired',$2)",[onlyB,JSON.stringify([{attemptId:'fixture-pair-only-b',score:9,submittedAt:epoch(day(-11)),late:false}])]);
 const call=async(p:Record<string,unknown>,uid=gvA,role='authenticated')=>db.transaction(async tx=>{
  await tx.exec('set transaction read only');await tx.exec('set local role '+role);
  await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[uid??'',role]);
  return (await tx.query('select public.mtm_lesson_upload_api($1) result',[JSON.stringify({action:'staff_history',...p})])).rows[0].result;
 });
 const query={from_date:oldClassDay,to_date:oldClassDay,class_id:a};
 const old=await call(query);assert.equal(old.mode,'session');assert.equal(old.score_basis,'previous_assignment_day');assert.equal(old.total,3);checks++;
 assert.deepEqual(old.classes.map((c:any)=>c.class_id),[a]);checks++;
 const transferred=old.rows.find((r:any)=>r.student_id===s1);assert.equal(transferred.student_name,'Nguyễn An');assert.equal(transferred.enrollment_status,'transferred');assert.equal(transferred.attendance_status,'co_mat');assert.equal(transferred.attendance_source,'quan_ly');checks++;
 assert.deepEqual(Object.fromEntries(transferred.homework.map((h:any)=>[h.assignment_id,h.score])),{'fixture-old-a1':8.5,'fixture-old-a2':7,'fixture-old-a-stale':6});assert(transferred.homework.every((h:any)=>h.lesson_date===oldAssignmentDay&&h.status==='submitted'&&h.submitted_at));checks++;
 const zero=old.rows.find((r:any)=>r.student_id===s2);assert.equal(zero.homework[0].score,0);assert.equal(zero.homework[1].score,null);assert.equal(zero.homework[1].status,'not_submitted');assert.equal(zero.attendance_status,null);checks++;
 assert.equal(old.rows.find((r:any)=>r.student_id===s3).enrollment_status,'former');checks++;
 assert.equal(old.rows.filter((r:any)=>r.student_name==='Nguyễn An').length,2);assert.equal(new Set(old.rows.map((r:any)=>r.record_id)).size,3);checks++;
 assert.equal(old.summary.attendance_unknown_rows,2);checks++;
 const nowB=await call({from_date:newClassDay,to_date:newClassDay,class_id:b,student_id:s1},gvB);
 assert.equal(nowB.total,1);assert.equal(nowB.rows[0].homework.length,1);assert.equal(nowB.rows[0].homework[0].score,null);assert.equal(nowB.rows[0].homework[0].status,'pending');assert(nowB.rows[0].homework[0].submitted_at);checks++;
 assert.equal(nowB.rows[0].attendance_status,null);assert.equal(nowB.rows[0].attendance_source,null);checks++;
 assert(!JSON.stringify(nowB).includes('fixture-old-a'));checks++;
 const assigned=await call({mode:'assignment',from_date:oldAssignmentDay,to_date:oldAssignmentDay,class_id:a});
 assert.equal(assigned.score_basis,'assignment_date');assert.equal(assigned.total,3);assert.equal(assigned.rows.find((r:any)=>r.student_id===s1).homework.length,3);checks++;
 assert.notEqual(wd(oldAssignmentDay),wd(oldClassDay));checks++;
 const filtered=await call({...query,name:'nguyen an'});assert.equal(filtered.total,2);checks++;
 assert.equal((await call({mode:'assignment',from_date:day(-11),to_date:day(-11),student_id:onlyB},gvA)).total,0);checks++;
 assert.equal((await call({mode:'assignment',from_date:day(-11),to_date:day(-11),student_id:onlyB},gvB)).rows[0].homework[0].score,9);checks++;
 const byId=await call({...query,student_id:s1});assert.equal(byId.total,1);assert.equal(byId.rows[0].student_id,s1);checks++;
 assert.equal((await call({...query,name:'%'})).total,0);checks++;
 const page1=await call({...query,page:1,page_size:1}),page2=await call({...query,page:2,page_size:1});
 assert.equal(page1.total,3);assert.equal(page1.rows.length,1);assert.equal(page1.has_more,true);assert.notEqual(page1.rows[0].record_id,page2.rows[0].record_id);checks++;
 const empty=await call({...query,page:20,page_size:1});assert.equal(empty.rows.length,0);assert.equal(empty.total,3);checks++;
 const managed=await call({from_date:oldClassDay,to_date:newClassDay},manager);assert.equal(managed.classes.length,2);assert(managed.rows.some((r:any)=>r.class_id===a)&&managed.rows.some((r:any)=>r.class_id===b));checks++;
 const json=JSON.stringify(managed);assert(!json.includes(qa));assert(!json.includes(foreignStudent));assert(!json.includes('ghi chú riêng'));checks++;
 for(const key of ['student_phone','parent_phone','birth_date','school','source_identity','drafts','receipts','exam','answer','pin','password','note'])assert(!json.includes('"'+key+'":'));checks++;
 await assert.rejects(()=>call({...query,class_id:b}),/STAFF_HISTORY_CLASS_DENIED/);checks++;
 await assert.rejects(()=>call({...query,class_id:foreignClass},manager),/STAFF_HISTORY_CLASS_DENIED/);checks++;
 await assert.rejects(()=>call(query,null as any),/STAFF_REQUIRED/);checks++;
 await assert.rejects(()=>call(query,gvA,'anon'),/permission denied/);checks++;
 await db.query('update public.mtm_staff set must_change_password=true where user_id=$1',[gvA]);
 await assert.rejects(()=>call(query),/PASSWORD_CHANGE_REQUIRED/);checks++;
 await db.query('update public.mtm_staff set must_change_password=false,active=false where user_id=$1',[gvA]);
 await assert.rejects(()=>call(query),/STAFF_REQUIRED/);checks++;
 await db.query('update public.mtm_staff set active=true where user_id=$1',[gvA]);
 for(const invalid of [{...query,from_date:'2026-02-30'}, {...query,to_date:day(1)}, {...query,from_date:day(-60)}, {...query,page_size:101}, {...query,page:0}, {...query,page:'1'}, {...query,is_test:true}, {...query,name:{private:true}}, {...query,mode:'all'}]){await assert.rejects(()=>call(invalid),/STAFF_HISTORY_/);checks++;}
 // No lookup may apply a pending lifecycle transition or mutate canonical data.
 await db.query("insert into mtm_hw_private.class_transfers(student_id,from_class,to_class,effective_date,source_msg) values($1,'2K10 XPT','2K11 XPT',$2::date,'fixture-pending-do-not-apply')",[s2,day(-1)]);
 const before=(await db.query(`select encode(sha256(convert_to(jsonb_build_object('students',(select jsonb_agg(to_jsonb(s) order by s.id) from mtm_hw_private.students s),'attendance',(select jsonb_agg(to_jsonb(a) order by a.student_id,a.session_date,a.class_label) from mtm_hw_private.attendance a),'work',(select jsonb_agg(to_jsonb(w) order by w.student_id,w.lesson_code) from mtm_hw_private.btvn_work w),'transfers',(select jsonb_agg(to_jsonb(t) order by t.id) from mtm_hw_private.class_transfers t))::text,'UTF8')),'hex') h`)).rows[0].h;
 await call({mode:'assignment',from_date:oldAssignmentDay,to_date:newClassDay},manager);
 const after=(await db.query(`select encode(sha256(convert_to(jsonb_build_object('students',(select jsonb_agg(to_jsonb(s) order by s.id) from mtm_hw_private.students s),'attendance',(select jsonb_agg(to_jsonb(a) order by a.student_id,a.session_date,a.class_label) from mtm_hw_private.attendance a),'work',(select jsonb_agg(to_jsonb(w) order by w.student_id,w.lesson_code) from mtm_hw_private.btvn_work w),'transfers',(select jsonb_agg(to_jsonb(t) order by t.id) from mtm_hw_private.class_transfers t))::text,'UTF8')),'hex') h`)).rows[0].h;
 assert.equal(after,before);checks++;
}finally{await db.close();}
console.log(`${checks} ca tra cứu nhân sự: phân quyền lớp, hai mode, lịch sử chuyển/nghỉ, điểm0/null, điểm danh thiếu=null, pagination, khôngmutate: đạt; PGlite giả, không mạng.`);
