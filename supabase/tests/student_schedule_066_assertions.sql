-- Dữ liệu GIẢ, chỉ chạy trong transaction bao ngoài và kết thúc ROLLBACK.
create temporary table schedule_qa066_results(name text primary key,passed boolean not null) on commit drop;
do $qa$
declare own uuid;home uuid;target uuid;sid uuid;same_sid uuid;src text;home_label text;target_label text;
 monday date;rid bigint;pid bigint;result jsonb;payload jsonb;lesson text;planned timestamptz;receipts_before jsonb;
 attendance_before text;projection_before text;row_n int;
begin
 select owner_id into own from mtm_hw_private.btvn_roster_scope where singleton;
 if own is null then raise exception 'SYNC_QA_066_SCOPE';end if;
 src='synthetic066:'||gen_random_uuid()::text;
 monday=date_trunc('week',(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date)::date+7;
 home_label='2K14 GIẢ 066 A '||src;target_label='2K14 GIẢ 066 B '||src;
 insert into mtm_hw_private.classes(owner_id,label,grade) values(own,home_label,12) returning id into home;
 insert into mtm_hw_private.classes(owner_id,label,grade) values(own,target_label,12) returning id into target;
 insert into mtm_hw_private.students(owner_id,class_id,full_name,public_alias,school,school_class,source_identity)
  values(own,home,'Học sinh GIẢ 066','MTM-'||upper(substr(md5(gen_random_uuid()::text),1,12)),'Trường GIẢ','12',src) returning id into sid;
 insert into mtm_hw_private.memberships(student_id,class_id) values(sid,home);
 insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,mode) values
  (home_label,1,'17:00','19:00','Offline'),(target_label,2,'17:00','19:00','Offline');
 select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.student_id,a.session_date,a.class_label)::text,'')) into attendance_before from mtm_hw_private.attendance a;
 if not exists(select 1 from mtm_hw_private.hv_ca_rows(monday,monday+6) where student_id=sid and ngay=monday and ca_lop=home_label) then raise exception 'SYNC_QA_066_BASELINE';end if;
 insert into schedule_qa066_results values('Baseline ca gốc của học sinh giả',true);
 payload=jsonb_build_object('action','student_schedule_set','studentId',sid,'fromDate',monday,'toDate',null,'weekday',2,
  'startHm','17:00','endHm','19:00','classLabel',target_label,'mode','Offline','btvnDueRule','next_session','sourceMsg',src||':rule');
 result=public.mtm_dd_api15(payload);rid=(result->>'ruleId')::bigint;
 if coalesce((result->>'ok')::boolean,false) is not true or rid is null then raise exception 'SYNC_QA_066_CREATE_RULE';end if;
 insert into schedule_qa066_results values('Action tạo lịch vô hạn có nguồn',true);
 result=public.mtm_dd_api15(payload);
 if result->>'duplicate' is distinct from 'true' or (result->>'ruleId')::bigint is distinct from rid then raise exception 'SYNC_QA_066_RULE_REPLAY';end if;
 result=public.mtm_dd_api15(payload||jsonb_build_object('startHm','18:00'));
 if result->>'error' is distinct from 'source_conflict' then raise exception 'SYNC_QA_066_SOURCE_CONFLICT';end if;
 insert into schedule_qa066_results values('Lặp nguồn giữ ruleId, payload khác bị chặn',true);
 if exists(select 1 from mtm_hw_private.hv_ca_rows(monday,monday+6) where student_id=sid and ngay=monday)
  or not exists(select 1 from mtm_hw_private.hv_ca_rows(monday,monday+6) where student_id=sid and ngay=monday+1 and ca_lop=target_label and nguon_dk='Lịch riêng chuẩn') then raise exception 'SYNC_QA_066_PROJECTION';end if;
 insert into schedule_qa066_results values('Projection bỏ ca gốc và nhận đúng ca riêng',true);
 if not exists(select 1 from mtm_hw_private.hv_ca_rows(monday-7,monday-1) where student_id=sid and ngay=monday-7 and ca_lop=home_label) then raise exception 'SYNC_QA_066_HISTORY';end if;
 insert into schedule_qa066_results values('Giữ lịch sử trước ngày hiệu lực',true);
 if not mtm_hw_private.student_has_schedule(sid,monday+500) then raise exception 'SYNC_QA_066_OPEN_ENDED';end if;
 insert into schedule_qa066_results values('Không tự đặt ngày cuối cho lịch vô hạn',true);
 result=public.mtm_dd_api15(payload||jsonb_build_object('sourceMsg',src||':overlap','startHm','18:00','endHm','20:00'));
 if result->>'error' is distinct from 'schedule_overlap' then raise exception 'SYNC_QA_066_OVERLAP';end if;
 result=public.mtm_dd_api15(payload||jsonb_build_object('sourceMsg',src||':invalid','startHm','25:00'));
 if result->>'error' is distinct from 'invalid_schedule_slot' then raise exception 'SYNC_QA_066_TIME';end if;
 insert into schedule_qa066_results values('Chặn ca chồng và giờ không hợp lệ',true);
 result=public.mtm_dd_api15(jsonb_build_object('action','student_pause','studentId',sid,'fromDate',monday+1,'reason','GIẢ','sourceMsg',src||':bad-pause'));
 if result->>'error' is distinct from 'need_pause_dates_and_reason' then raise exception 'SYNC_QA_066_PAUSE_NEEDS_END';end if;
 insert into schedule_qa066_results values('Tạm nghỉ thiếu ngày cuối bị chặn',true);
 lesson='synthetic066-'||replace(gen_random_uuid()::text,'-','');
 insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,kind,material,exam,active,publish_status)
  values(lesson,own,array[home],'btvn',jsonb_build_object('date',monday::text),'{"title":"Bài GIẢ066","questions":[]}',true,'da_dang');
 insert into mtm_hw_private.btvn_work(student_id,lesson_code,expected_due_at,receipts)
  values(sid,lesson,(monday+7+'17:00'::time) at time zone 'Asia/Ho_Chi_Minh',jsonb_build_array(jsonb_build_object('attemptId','synthetic066','attemptNumber',1,'submittedAt',extract(epoch from ((monday+3+'17:00'::time) at time zone 'Asia/Ho_Chi_Minh'))*1000,'score',8,'late',true)));
 planned=mtm_hw_private.btvn_schedule_planned_due(sid,lesson);
 if planned is distinct from ((monday+1+'17:00'::time) at time zone 'Asia/Ho_Chi_Minh') then raise exception 'SYNC_QA_066_INDIVIDUAL_DUE';end if;
 insert into schedule_qa066_results values('Hạn BTVN theo rule next_session có nguồn',true);
 select receipts into receipts_before from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson;
 update mtm_hw_private.btvn_work set receipts=jsonb_set(receipts,'{0,submittedAt}',to_jsonb(extract(epoch from ((monday+2+'12:00'::time) at time zone 'Asia/Ho_Chi_Minh'))*1000))
  where student_id=sid and lesson_code=lesson;
 if (select receipts->0->>'late' from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson) is not null then raise exception 'SYNC_QA_066_PLANNED_BEFORE_ACTUAL';end if;
 update mtm_hw_private.btvn_work set next_actual_class_at=((monday+2+'17:00'::time) at time zone 'Asia/Ho_Chi_Minh') where student_id=sid and lesson_code=lesson;
 if (select receipts->0->>'late' from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson) is distinct from 'false'
  or (select receipts->0->>'score' from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson) is distinct from '8'
  or (select (receipts->0->>'submittedAt')::numeric from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson)
   <> extract(epoch from ((monday+2+'12:00'::time) at time zone 'Asia/Ho_Chi_Minh'))*1000 then raise exception 'SYNC_QA_066_NEW_ACTUAL_FIRST';end if;
 insert into schedule_qa066_results values('Actual lần đầu dùng NEW, giữ điểm và giờ nộp',true);
 update mtm_hw_private.btvn_work set next_actual_class_at=((monday+'17:00'::time) at time zone 'Asia/Ho_Chi_Minh') where student_id=sid and lesson_code=lesson;
 if (select receipts->0->>'late' from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson) is distinct from 'true' then raise exception 'SYNC_QA_066_NEW_ACTUAL_CHANGE';end if;
 insert into schedule_qa066_results values('Đổi actual lần sau tính lại theo NEW',true);
 result=public.mtm_dd_api15(jsonb_build_object('action','btvn_extend','studentId',sid,'lessonCode',lesson,'dueAt',((monday+10+'17:00'::time) at time zone 'Asia/Ho_Chi_Minh'),
  'reason','GIẢ','sourceMsg',src||':extend-priority'));
 if coalesce((result->>'ok')::boolean,false) is not true then raise exception 'SYNC_QA_066_EXTEND_PRIORITY_SETUP';end if;
 update mtm_hw_private.btvn_work set next_actual_class_at=((monday+1+'18:00'::time) at time zone 'Asia/Ho_Chi_Minh') where student_id=sid and lesson_code=lesson;
 if (select receipts->0->>'late' from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson) is distinct from 'false' then raise exception 'SYNC_QA_066_EXTEND_PRIORITY';end if;
 insert into schedule_qa066_results values('Gia hạn có nguồn ưu tiên hơn NEW actual',true);
 result=public.mtm_dd_api15(jsonb_build_object('action','btvn_override_cancel','studentId',sid,'lessonCode',lesson,'overrideId',(result->>'overrideId')::bigint,'reason','GIẢ','sourceMsg',src||':cancel-extend-priority'));
 update mtm_hw_private.btvn_work set next_actual_class_at=null,receipts=receipts_before where student_id=sid and lesson_code=lesson;
 result=public.mtm_dd_api15(jsonb_build_object('action','student_pause','studentId',sid,'fromDate',monday+1,'toDate',monday+15,'reason','GIẢ','sourceMsg',src||':pause'));pid=(result->>'pauseId')::bigint;
 if pid is null or coalesce((result->>'ok')::boolean,false) is not true then raise exception 'SYNC_QA_066_PAUSE';end if;
 if not mtm_hw_private.student_is_paused(sid,monday+1) or not mtm_hw_private.student_is_paused(sid,monday+15) or mtm_hw_private.student_is_paused(sid,monday+16)
  or (select active from mtm_hw_private.students where id=sid) is not true then raise exception 'SYNC_QA_066_PAUSE_RANGE';end if;
 insert into schedule_qa066_results values('Tạm nghỉ hai mốc gồm hai biên, giữ active',true);
 if exists(select 1 from mtm_hw_private.hv_ca_rows(monday,monday+15) where student_id=sid) then raise exception 'SYNC_QA_066_PAUSE_PROJECTION';end if;
 insert into schedule_qa066_results values('Pause không tạo ca nhắc/vắng trong khoảng nghỉ',true);
 if mtm_hw_private.btvn_schedule_planned_due(sid,lesson) is distinct from ((monday+22+'17:00'::time) at time zone 'Asia/Ho_Chi_Minh')
  or (select receipts->0->>'late' from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson) is not null
  or (select next_actual_class_at from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson) is not null
  or (select receipts->0->>'score' from mtm_hw_private.btvn_work where student_id=sid and lesson_code=lesson) is distinct from '8' then raise exception 'SYNC_QA_066_PAUSE_DUE';end if;
 insert into schedule_qa066_results values('BTVN bỏ ca nghỉ, chỉ đổi dự kiến, cờ muộn chờ dấu thực',true);
 insert into mtm_hw_private.attendance(student_id,class_label,session_date,status,source,time_in,time_out)
  values(sid,target_label,monday+8,'co_mat','van_tay','17:00','19:00');
 if not exists(select 1 from mtm_hw_private.hv_ca_rows(monday+8,monday+8) where student_id=sid and trang_thai='Có mặt') then raise exception 'SYNC_QA_066_PRESERVE_ACTUAL';end if;
 insert into schedule_qa066_results values('Giữ dấu có mặt thật trong khoảng pause',true);
 result=public.mtm_dd_api15(jsonb_build_object('action','student_pause_cancel','studentId',sid,'pauseId',pid,'fromDate',monday+2,'sourceMsg',src||':cancel-pause'));
 if result->>'cancelled' is distinct from 'true' or not mtm_hw_private.student_is_paused(sid,monday+1) or mtm_hw_private.student_is_paused(sid,monday+2) then raise exception 'SYNC_QA_066_CANCEL_PAUSE';end if;
 insert into schedule_qa066_results values('Hủy pause giữ lịch sử trước mốc hủy',true);
 update mtm_hw_private.btvn_work set next_actual_class_at=((monday+8+'17:00'::time) at time zone 'Asia/Ho_Chi_Minh') where student_id=sid and lesson_code=lesson;
 if mtm_hw_private.btvn_override_due(sid,lesson) is not null then raise exception 'SYNC_QA_066_NO_FAKE_ACTUAL';end if;
 insert into schedule_qa066_results values('Lịch dự kiến không ghi đè buổi đã học thật',true);
 result=public.mtm_dd_api15(jsonb_build_object('action','student_schedule_cancel','studentId',sid,'ruleId',rid,'fromDate',monday+15,'sourceMsg',src||':cancel-rule'));
 if result->>'cancelled' is distinct from 'true' or not mtm_hw_private.student_has_schedule(sid,monday+14) or mtm_hw_private.student_has_schedule(sid,monday+15) then raise exception 'SYNC_QA_066_CANCEL_RULE';end if;
 insert into schedule_qa066_results values('Hủy lịch chỉ từ mốc rõ, giữ phần trước',true);
 result=public.mtm_dd_api15(payload||jsonb_build_object('sourceMsg',src||':after-cancel','fromDate',monday+15));
 if coalesce((result->>'ok')::boolean,false) is not true then raise exception 'SYNC_QA_066_REPLACE_AFTER_CANCEL';end if;
 insert into schedule_qa066_results values('Lịch mới sau ngày hủy không bị chặn chồng giả',true);
 insert into mtm_hw_private.students(owner_id,class_id,full_name,public_alias,school,school_class,source_identity)
  values(own,home,'Học sinh GIẢ 066 cùng lớp','MTM-'||upper(substr(md5(gen_random_uuid()::text),1,12)),'Trường GIẢ','12',src||':same-class') returning id into same_sid;
 result=public.mtm_dd_api15(jsonb_build_object('action','student_schedule_set','studentId',same_sid,'fromDate',monday,'weekday',1,
  'startHm','19:30','endHm','21:30','classLabel',home_label,'mode','Offline','sourceMsg',src||':same-class-rule'));
 if result->>'ok' is distinct from 'true' or (select count(*) from mtm_hw_private.hv_ca_rows(monday,monday) where student_id=same_sid)<>1
  or not exists(select 1 from mtm_hw_private.hv_ca_rows(monday,monday) where student_id=same_sid and gio='19:30-21:30') then raise exception 'SYNC_QA_066_SAME_CLASS_PLANNED';end if;
 insert into schedule_qa066_results values('Cùng lớp đổi giờ chưa có dấu thực chỉ hiện giờ mới',true);
 insert into mtm_hw_private.attendance(student_id,class_label,session_date,status,source,time_in,time_out)
  values(same_sid,home_label,monday,'co_mat','van_tay','17:10','19:00');
 if (select count(*) from mtm_hw_private.hv_ca_rows(monday,monday) where student_id=same_sid)<>1
  or not exists(select 1 from mtm_hw_private.hv_ca_rows(monday,monday) where student_id=same_sid and gio='17:00-19:00' and trang_thai='Có mặt')
  or exists(select 1 from mtm_hw_private.hv_ca_rows(monday,monday) where student_id=same_sid and gio='19:30-21:30') then raise exception 'SYNC_QA_066_SAME_CLASS_NO_DUPLICATE_ACTUAL';end if;
 insert into schedule_qa066_results values('Cùng lớp đổi giờ một dấu thực giữ ca cũ không nhân đôi Có mặt',true);
 if not exists(select 1 from mtm_hw_private.sync_events e join mtm_hw_private.sync_deliveries d on d.event_id=e.id
  where e.entity_table='student_pauses' and e.entity_key->>'student_id'=sid::text and d.sink='sheet_import' and d.status='pending') then raise exception 'SYNC_QA_066_OUTBOX';end if;
 insert into schedule_qa066_results values('Action phát outbox, chưa tự nhận sink verified',true);
 if has_function_privilege('anon','mtm_hw_private.student_schedule_action(jsonb)','execute') or has_table_privilege('authenticated','mtm_hw_private.student_pauses','select') then raise exception 'SYNC_QA_066_PERMISSIONS';end if;
 insert into schedule_qa066_results values('Không cấp đọc bảng hoặc gọi action cho khách',true);
 delete from mtm_hw_private.attendance where student_id in (sid,same_sid);
 if attendance_before is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.student_id,a.session_date,a.class_label)::text,'')) from mtm_hw_private.attendance a) then raise exception 'SYNC_QA_066_REAL_ATTENDANCE';end if;
 insert into schedule_qa066_results values('Dữ liệu điểm danh thật giữ nguyên hash',true);
end$qa$;
select jsonb_build_object('suite','schedule066','passed',count(*) filter(where passed),'total',count(*)) as schedule066_summary from schedule_qa066_results;
