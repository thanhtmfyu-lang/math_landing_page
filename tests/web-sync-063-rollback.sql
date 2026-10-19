-- Chỉ chạy trong transaction cùng migration 063 và kết thúc ROLLBACK.
-- Mọi hồ sơ/lớp/bài dưới đây là GIẢ; không sửa hồ sơ thật.
create temporary table qa_web_sync063_results(name text primary key,passed boolean not null) on commit drop;
do $qa$
declare own uuid;ca uuid;cb uuid;sid uuid;ss text;code text;ident text;sheet text;sh text;lesson text;nowvn date;
 boundary timestamptz;due timestamptz;source text;before jsonb;result jsonb;snapshot jsonb;payload jsonb;oid bigint;tid bigint;
begin
 select owner_id,sheet_id into own,sheet from mtm_hw_private.btvn_roster_scope where singleton;
 if own is null then raise exception 'QA scope required';end if;
 source='qa:sync063:'||gen_random_uuid()::text;lesson='qa-sync063-'||replace(gen_random_uuid()::text,'-','');
 nowvn=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date;boundary=nowvn::timestamp at time zone 'Asia/Ho_Chi_Minh';
 sh=encode(sha256(convert_to(sheet,'UTF8')),'hex');code='HS-'||upper(replace(gen_random_uuid()::text,'-',''));
 ident='btvn:'||sh||':'||encode(sha256(convert_to(code,'UTF8')),'hex');
 insert into mtm_hw_private.classes(owner_id,label,grade) values(own,'2K14 QA 063 A '||source,12) returning id into ca;
 insert into mtm_hw_private.classes(owner_id,label,grade) values(own,'2K14 QA 063 B '||source,12) returning id into cb;
 insert into mtm_hw_private.students(owner_id,class_id,full_name,school,school_class,public_alias,student_phone,cohort,source_identity)
 values(own,ca,'Học sinh GIẢ 063','Trường GIẢ','12 GIẢ','MTM-'||upper(substr(md5(gen_random_uuid()::text),1,12)),'0900000000','QA',ident) returning id into sid;
 insert into mtm_hw_private.memberships(student_id,class_id,joined_at) values(sid,ca,boundary-interval '10 days');
 ss=mtm_hw_private.random_token();insert into mtm_hw_private.btvn_identity_sessions(digest,student_id,expires_at)
 values(mtm_hw_private.token_digest('btvn-identity',ss),sid,clock_timestamp()+interval '1 hour');
 insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,kind,publish_status)
 values(lesson,own,array[ca,cb],jsonb_build_object('lessonCode',lesson,'classNames',jsonb_build_array((select label from mtm_hw_private.classes where id=ca),(select label from mtm_hw_private.classes where id=cb)),
 'date',nowvn-1,'title','Bài GIẢ 063','classOpensAt',jsonb_build_object((select label from mtm_hw_private.classes where id=ca),boundary-interval '1 day',(select label from mtm_hw_private.classes where id=cb),boundary-interval '1 day')),
 '{"title":"Bài GIẢ 063","questions":[]}',true,'btvn','da_dang');
 insert into mtm_hw_private.class_transfers(student_id,from_class,to_class,effective_date,reason,source_msg)
 values(sid,(select label from mtm_hw_private.classes where id=ca),(select label from mtm_hw_private.classes where id=cb),nowvn,'QA',source||':transfer') returning id into tid;
 snapshot=public.mtm_btvn_read(ss,lesson);
 if snapshot->'work'->'student'->>'className' is distinct from (select label from mtm_hw_private.classes where id=cb) then raise exception 'QA web class not refreshed';end if;
 insert into qa_web_sync063_results values('Web áp chuyển lớp trước read',true);
 if (select joined_at from mtm_hw_private.memberships where student_id=sid and left_at is null) is distinct from boundary then raise exception 'QA membership boundary';end if;
 insert into qa_web_sync063_results values('Membership theo ngày hiệu lực',true);
 if mtm_hw_private.lop_tai(sid,(select label from mtm_hw_private.classes where id=cb),nowvn-1) is distinct from (select label from mtm_hw_private.classes where id=ca) then raise exception 'QA history class';end if;
 insert into qa_web_sync063_results values('Lịch sử lớp cũ còn nguyên',true);
 payload=jsonb_build_object('sheetId',sheet,'sheetHash',sh,'legacyReconciled',true,'classes',jsonb_build_array(
 jsonb_build_object('label',(select label from mtm_hw_private.classes where id=ca),'grade',12),jsonb_build_object('label',(select label from mtm_hw_private.classes where id=cb),'grade',12)),
 'students',jsonb_build_array(jsonb_build_object('sourceIdentity',ident,'proposedCode',code,'fullName','Học sinh GIẢ 063','phone','0900000000','parentPhone','','parentName','','school','','cohort','QA','className',(select label from mtm_hw_private.classes where id=ca))));
 before=(select to_jsonb(s) from mtm_hw_private.students s where id=sid);
 result=public.mtm_btvn_sync_roster(payload,false);
 if before is distinct from (select to_jsonb(s) from mtm_hw_private.students s where id=sid) then raise exception 'QA dryrun changed student';end if;
 insert into qa_web_sync063_results values('Roster dry-run rollback',true);
 result=public.mtm_btvn_sync_roster(payload,true);
 if (select class_id from mtm_hw_private.students where id=sid) is distinct from cb or (select source_identity from mtm_hw_private.students where id=sid) is distinct from ident then raise exception 'QA stale roster reverted transfer/identity';end if;
 insert into qa_web_sync063_results values('Roster cũ không lùi lớp và định danh',true);
 insert into mtm_hw_private.btvn_work(student_id,lesson_code,next_actual_class_at,receipts)
 values(sid,lesson,clock_timestamp()-interval '1 day',jsonb_build_array(jsonb_build_object('attemptId','qa-attempt','attemptNumber',1,'submittedAt',extract(epoch from clock_timestamp()-interval '1 hour')*1000,'score',8,'late',true)))
 on conflict(student_id,lesson_code) do update set next_actual_class_at=excluded.next_actual_class_at,receipts=excluded.receipts;
 before=(select jsonb_build_object('actual',next_actual_class_at,'score',receipts->0->'score') from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson);
 due=clock_timestamp()+interval '1 day';payload=jsonb_build_object('action','btvn_extend','studentId',sid,'lessonCode',lesson,'dueAt',due,'reason','QA','sourceMsg',source||':extend');
 result=public.mtm_dd_api14(payload);oid=(result->>'overrideId')::bigint;
 if coalesce((result->>'ok')::boolean,false) is not true or oid is null then raise exception 'QA extend failed';end if;
 if (select receipts->0->>'late' from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson) is distinct from 'false'
 or before is distinct from (select jsonb_build_object('actual',next_actual_class_at,'score',receipts->0->'score') from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson) then raise exception 'QA extension changed actual/score or late wrong';end if;
 insert into qa_web_sync063_results values('Gia hạn đổi late, giữ ca thật và điểm',true);
 result=public.mtm_dd_api14(payload);if result->>'duplicate' is distinct from 'true' then raise exception 'QA duplicate extension';end if;
 result=public.mtm_dd_api14(payload||jsonb_build_object('dueAt',due+interval '1 day'));if result->>'error' is distinct from 'source_conflict' then raise exception 'QA conflicting replay';end if;
 insert into qa_web_sync063_results values('Gọi lặp và xung đột nguồn',true);
 snapshot=public.mtm_btvn_read(ss,lesson);
 if snapshot->'work'->'student'->>'effectiveDueAt' is null or abs((snapshot->'work'->'student'->>'effectiveDueAt')::numeric-extract(epoch from due)*1000)>1 then raise exception 'QA effective due read';end if;
 if not exists(select 1 from jsonb_array_elements(public.mtm_btvn_scorebook(nowvn-1,false)) x where x->>'lessonCode'=lesson and abs((x->>'dueAt')::numeric-extract(epoch from due)*1000)<1) then raise exception 'QA scorebook due';end if;
 insert into qa_web_sync063_results values('Hạn ngoại lệ trên web và scorebook',true);
 if position('"Bài GIẢ 063","'||mtm_hw_private.vn_time(extract(epoch from due)*1000)||'"' in public.mtm_btvn_sheet_csv6('diem'))=0 then raise exception 'QA CSV override due';end if;
 perform set_config('request.jwt.claim.sub',own::text,true);
 snapshot=public.mtm_btvn_admin_scores(lesson);
 if snapshot->0->'student'->>'effectiveDueAt' is null or abs((snapshot->0->'student'->>'effectiveDueAt')::numeric-extract(epoch from due)*1000)>1 then raise exception 'QA admin override due';end if;
 insert into qa_web_sync063_results values('Hạn ngoại lệ trên Sheet CSV và export quản trị',true);
 update mtm_hw_private.btvn_work set next_actual_class_at=clock_timestamp()-interval '2 days',receipts=jsonb_set(receipts,'{0,late}','true') where student_id=sid and lesson_code=lesson;
 if (select receipts->0->>'late' from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson) is distinct from 'false' then raise exception 'QA due sync erased override';end if;
 insert into qa_web_sync063_results values('Đồng bộ hạn thường giữ ngoại lệ',true);
 result=public.mtm_dd_api14(jsonb_build_object('action','btvn_override_cancel','studentId',sid,'lessonCode',lesson,'overrideId',oid,'reason','QA','sourceMsg',source||':cancel'));
 if result->>'cancelled' is distinct from 'true' or (select receipts->0->>'late' from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson) is distinct from 'true' then raise exception 'QA cancel due';end if;
 insert into qa_web_sync063_results values('Hủy ngoại lệ tính lại late',true);
 result=public.mtm_dd_api14(jsonb_build_object('action','btvn_allow_late','studentId',sid,'lessonCode',lesson,'dueAt',due,'reason','QA','sourceMsg',source||':allow-late'));
 if coalesce((result->>'ok')::boolean,false) is not true or mtm_hw_private.btvn_override_due(sid,lesson) is not null
  or (select receipts->0->>'late' from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson) is distinct from 'true' then raise exception 'QA allow late changed original due';end if;
 insert into qa_web_sync063_results values('Cho nộp muộn giữ cờ muộn và hạn gốc',true);
 result=public.mtm_dd_api14(jsonb_build_object('action','btvn_retry','studentId',sid,'lessonCode',lesson,'reason','QA','sourceMsg',source||':retry'));
 if result->>'maxAttempts' is distinct from '5' then raise exception 'QA retry max';end if;
 update mtm_hw_private.btvn_work set drafts='[{},{},{},{},{}]' where student_id=sid and lesson_code=lesson;
 result=public.mtm_dd_api14(jsonb_build_object('action','btvn_retry','studentId',sid,'lessonCode',lesson,'reason','QA','sourceMsg',source||':retry-max'));
 if result->>'error' is distinct from 'attempt_limit' then raise exception 'QA retry exceeded max';end if;
 insert into qa_web_sync063_results values('Làm lại không vượt năm lượt',true);
 insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,kind,publish_status)
 select lesson||'-pending',l.owner_id,l.class_ids,jsonb_set(l.material,'{lessonCode}',to_jsonb(lesson||'-pending')),l.exam,l.active,l.kind,l.publish_status from mtm_hw_private.btvn_lessons l where l.code=lesson;
 insert into mtm_hw_private.btvn_work(student_id,lesson_code,next_actual_class_at) values(sid,lesson||'-pending',clock_timestamp()-interval '30 minutes');
 snapshot=mtm_hw_private.btvn_rank_rows('2K14','btvn-thang',to_char(nowvn,'YYYY-MM'),(select label from mtm_hw_private.classes where id=cb),sid);
 if snapshot->0->>'total' is distinct from '2' or (snapshot->0->>'score')::numeric is distinct from 4 then raise exception 'QA rank baseline';end if;
 result=public.mtm_dd_api14(jsonb_build_object('action','btvn_extend','studentId',sid,'lessonCode',lesson||'-pending','dueAt',due,'reason','QA','sourceMsg',source||':rank-extend'));
 snapshot=mtm_hw_private.btvn_rank_rows('2K14','btvn-thang',to_char(nowvn,'YYYY-MM'),(select label from mtm_hw_private.classes where id=cb),sid);
 if snapshot->0->>'total' is distinct from '1' or (snapshot->0->>'score')::numeric is distinct from 8 then raise exception 'QA rank extension denominator';end if;
 insert into qa_web_sync063_results values('Gia hạn không tính bài chưa đến hạn thành điểm không',true);
 insert into mtm_hw_private.student_leaves(student_id,leave_date,reason,source_msg) values(sid,nowvn,'QA',source||':leave');
 begin perform mtm_hw_private.btvn_student(ss);raise exception 'QA leave still authorized';exception when insufficient_privilege then null;end;
 result=public.mtm_btvn_sync_roster(payload||jsonb_build_object('students',(select jsonb_build_array(jsonb_build_object('sourceIdentity',ident,'proposedCode',code,'fullName','Học sinh GIẢ 063','phone','0900000000','parentPhone','','parentName','','school','','cohort','QA','className',(select label from mtm_hw_private.classes where id=ca)))),'sheetId',sheet,'sheetHash',sh,'legacyReconciled',true,'classes',jsonb_build_array(jsonb_build_object('label',(select label from mtm_hw_private.classes where id=ca),'grade',12))),true);
 if (select active from mtm_hw_private.students where id=sid) then raise exception 'QA roster reactivated leave';end if;
 insert into qa_web_sync063_results values('Nghỉ hiệu lực khóa web, roster không mở lại',true);
end$qa$;
select count(*) as passed,count(*) as total,bool_and(passed) as all_passed from qa_web_sync063_results;
