-- Dữ liệu GIẢ và trigger lỗi chỉ tồn tại trong transaction ROLLBACK bao ngoài.
create temporary table lifecycle_qa067_results(name text primary key,passed boolean not null) on commit drop;
create function pg_temp.qa_lifecycle_membership_failure() returns trigger language plpgsql as $$
begin
 if new.student_id::text=nullif(current_setting('qa067.fail_student',true),'') then
  raise exception using errcode=coalesce(nullif(current_setting('qa067.error_state',true),''),'23514'),message='PRIVATE_CANARY_067';end if;
 return new;
end$$;
create trigger qa_lifecycle067_membership_failure before insert or update on mtm_hw_private.memberships
 for each row execute function pg_temp.qa_lifecycle_membership_failure();
do $qa$
declare own uuid;a uuid;b uuid;bad uuid;good uuid;source text;la text;lb text;today date;bad_transfer bigint;good_transfer bigint;
 bad_leave bigint;good_leave bigint;blocked_transfer bigint;result jsonb;version_n int;failures_n int;counter_n int;i int;
 transient_sid uuid;transient_tid bigint;inactive_sid uuid;inactive_tid bigint;leave_tid bigint;reraised boolean=false;
begin
 select owner_id into own from mtm_hw_private.btvn_roster_scope where singleton;
 source='qa:067:'||gen_random_uuid()::text;today=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date;
 la='2K14 GIẢ067 A '||source;lb='2K14 GIẢ067 B '||source;
 insert into mtm_hw_private.classes(owner_id,label,grade) values(own,la,12) returning id into a;
 insert into mtm_hw_private.classes(owner_id,label,grade) values(own,lb,12) returning id into b;
 insert into mtm_hw_private.students(owner_id,class_id,full_name,school,school_class,public_alias,source_identity)
  values(own,a,'Học sinh GIẢ067 lỗi','Trường GIẢ','12 GIẢ','MTM-'||upper(substr(md5(gen_random_uuid()::text),1,12)),source||':bad') returning id into bad;
 insert into mtm_hw_private.students(owner_id,class_id,full_name,school,school_class,public_alias,source_identity)
  values(own,a,'Học sinh GIẢ067 đúng','Trường GIẢ','12 GIẢ','MTM-'||upper(substr(md5(gen_random_uuid()::text),1,12)),source||':good') returning id into good;
 insert into mtm_hw_private.memberships(student_id,class_id,joined_at) values(bad,a,clock_timestamp()-interval '10 days'),(good,a,clock_timestamp()-interval '10 days');
 insert into mtm_hw_private.class_transfers(student_id,from_class,to_class,effective_date,source_msg)
  values(bad,la,lb,today-1,source||':transfer-bad') returning id into bad_transfer;
 insert into mtm_hw_private.class_transfers(student_id,from_class,to_class,effective_date,source_msg)
  values(good,la,lb,today-1,source||':transfer-good') returning id into good_transfer;
 perform set_config('qa067.fail_student',bad::text,true);
 counter_n=mtm_hw_private.dd_apply_transfers();
 if counter_n<1 or (select class_id from mtm_hw_private.students where id=bad)<>a
  or (select applied_at from mtm_hw_private.class_transfers where id=bad_transfer) is not null
  or (select count(*) from mtm_hw_private.memberships where student_id=bad and left_at is null and class_id=a)<>1
  or (select class_id from mtm_hw_private.students where id=good)<>b
  or (select applied_at from mtm_hw_private.class_transfers where id=good_transfer) is null then raise exception 'SYNC_QA_067_TRANSFER_ISOLATION';end if;
 insert into lifecycle_qa067_results values('Một transfer lỗi rollback riêng, transfer kế tiếp vẫn áp',true);
 if not exists(select 1 from mtm_hw_private.lifecycle_quarantine where entity_table='class_transfers' and entity_id=bad_transfer and status='quarantined' and failures=1 and sqlstate='23514') then raise exception 'SYNC_QA_067_QUARANTINE';end if;
 if position('PRIVATE_CANARY_067' in (select to_jsonb(q)::text from mtm_hw_private.lifecycle_quarantine q where entity_table='class_transfers' and entity_id=bad_transfer))>0 then raise exception 'SYNC_QA_067_ERROR_PRIVACY';end if;
 insert into lifecycle_qa067_results values('Quarantine chỉ mã lỗi/hash, không ghi message riêng',true);
 counter_n=mtm_hw_private.dd_apply_transfers();
 if (select failures from mtm_hw_private.lifecycle_quarantine where entity_table='class_transfers' and entity_id=bad_transfer)<>1 then raise exception 'SYNC_QA_067_NO_AUTO_RETRY';end if;
 insert into lifecycle_qa067_results values('Đọc hoặc tick tiếp không tự retry bản quarantine',true);
 result=public.mtm_dd_api15(jsonb_build_object('action','sync_tick','sourceMsg',source||':tick'));
 if result ? 'error' or (result->>'lifecycleQuarantined')::integer<1 or result->>'transfersApplied' is null or result->>'leavesApplied' is null then raise exception 'SYNC_QA_067_TICK';end if;
 insert into lifecycle_qa067_results values('Sync tick trả count thành công/quarantine, không abort',true);
 insert into mtm_hw_private.student_leaves(student_id,leave_date,reason,source_msg) values(bad,today,'GIẢ',source||':leave-bad') returning id into bad_leave;
 insert into mtm_hw_private.student_leaves(student_id,leave_date,reason,source_msg) values(good,today,'GIẢ',source||':leave-good') returning id into good_leave;
 counter_n=mtm_hw_private.dd_apply_leaves();
 if counter_n<1 or (select active from mtm_hw_private.students where id=bad) is not true
  or (select active from mtm_hw_private.students where id=good) is not false
  or (select applied_at from mtm_hw_private.student_leaves where id=bad_leave) is not null
  or (select applied_at from mtm_hw_private.student_leaves where id=good_leave) is null then raise exception 'SYNC_QA_067_LEAVE_ISOLATION';end if;
 insert into lifecycle_qa067_results values('Một leave lỗi rollback active/membership riêng',true);
 result=public.mtm_dd_api15(jsonb_build_object('action','lifecycle_retry','entityTable','class_transfers','entityId',bad_transfer,'reason','source_fixed','sourceMsg',source||':bad-retry'));
 if result->>'error' is distinct from 'need_entity_source_reason_version' then raise exception 'SYNC_QA_067_NEED_VERSION';end if;
 insert into lifecycle_qa067_results values('Retry thiếu version bị chặn',true);
 update mtm_hw_private.student_leaves set cancelled_at=clock_timestamp() where id=bad_leave;
 select version into version_n from mtm_hw_private.lifecycle_quarantine where entity_table='student_leaves' and entity_id=bad_leave;
 result=public.mtm_dd_api15(jsonb_build_object('action','lifecycle_retry','entityTable','student_leaves','entityId',bad_leave,'version',version_n,'reason','source_fixed','sourceMsg',source||':retry-cancelled'));
 if result->>'error' is distinct from 'entity_not_pending' or not exists(select 1 from mtm_hw_private.lifecycle_quarantine where entity_table='student_leaves' and entity_id=bad_leave and status='resolved') then raise exception 'SYNC_QA_067_CANCEL_TERMINAL';end if;
 insert into lifecycle_qa067_results values('Entity đã hủy đóng quarantine và từ chối retry',true);
 perform set_config('qa067.fail_student','',true);
 select version into version_n from mtm_hw_private.lifecycle_quarantine where entity_table='class_transfers' and entity_id=bad_transfer;
 result=public.mtm_dd_api15(jsonb_build_object('action','lifecycle_retry','entityTable','class_transfers','entityId',bad_transfer,'version',version_n,'reason','source_fixed','sourceMsg',source||':retry-fixed'));
 if result->>'ok' is distinct from 'true' then raise exception 'SYNC_QA_067_RETRY_ACCEPT';end if;
 counter_n=mtm_hw_private.dd_apply_transfers();
 if (select class_id from mtm_hw_private.students where id=bad)<>b or not exists(select 1 from mtm_hw_private.lifecycle_quarantine where entity_table='class_transfers' and entity_id=bad_transfer and status='resolved' and retries=1) then raise exception 'SYNC_QA_067_RETRY_SUCCESS';end if;
 insert into lifecycle_qa067_results values('Nguồn đã sửa và explicit retry giải quyết đúng bản ghi',true);
 -- Cố định lỗi để chứng minh hai lần retry là trần; lần thứ ba bị từ chối.
 insert into mtm_hw_private.class_transfers(student_id,from_class,to_class,effective_date,source_msg)
  values(bad,lb,la,today,source||':transfer-blocked') returning id into blocked_transfer;
 perform set_config('qa067.fail_student',bad::text,true);counter_n=mtm_hw_private.dd_apply_transfers();
 for i in 1..2 loop
  select version into version_n from mtm_hw_private.lifecycle_quarantine where entity_table='class_transfers' and entity_id=blocked_transfer;
  result=public.mtm_dd_api15(jsonb_build_object('action','lifecycle_retry','entityTable','class_transfers','entityId',blocked_transfer,'version',version_n,'reason','source_fixed','sourceMsg',source||':retry-cap-'||i));
  if result->>'ok' is distinct from 'true' then raise exception 'SYNC_QA_067_RETRY_CAP_SETUP';end if;
  counter_n=mtm_hw_private.dd_apply_transfers();
 end loop;
 select version into version_n from mtm_hw_private.lifecycle_quarantine where entity_table='class_transfers' and entity_id=blocked_transfer;
 result=public.mtm_dd_api15(jsonb_build_object('action','lifecycle_retry','entityTable','class_transfers','entityId',blocked_transfer,'version',version_n,'reason','source_fixed','sourceMsg',source||':retry-too-many'));
 if result->>'error' is distinct from 'lifecycle_retry_budget_exhausted' or (select failures from mtm_hw_private.lifecycle_quarantine where entity_table='class_transfers' and entity_id=blocked_transfer)<>3 then raise exception 'SYNC_QA_067_RETRY_CAP';end if;
 insert into lifecycle_qa067_results values('Tối đa hai explicit retry, ba thất bại thì giữ quarantine',true);
 insert into mtm_hw_private.students(owner_id,class_id,full_name,school,school_class,public_alias,source_identity)
  values(own,a,'Học sinh GIẢ067 chờ khóa','Trường GIẢ','12 GIẢ','MTM-'||upper(substr(md5(gen_random_uuid()::text),1,12)),source||':transient') returning id into transient_sid;
 perform set_config('qa067.fail_student','',true);
 insert into mtm_hw_private.memberships(student_id,class_id,joined_at) values(transient_sid,a,clock_timestamp()-interval '10 days');
 insert into mtm_hw_private.class_transfers(student_id,from_class,to_class,effective_date,source_msg)
  values(transient_sid,la,lb,today,source||':transfer-transient') returning id into transient_tid;
 perform set_config('qa067.fail_student',transient_sid::text,true);perform set_config('qa067.error_state','55P03',true);
 counter_n=mtm_hw_private.dd_apply_transfers();
 if exists(select 1 from mtm_hw_private.lifecycle_quarantine where entity_table='class_transfers' and entity_id=transient_tid)
  or (select class_id from mtm_hw_private.students where id=transient_sid)<>a then raise exception 'SYNC_QA_067_LOCK_SKIP';end if;
 insert into lifecycle_qa067_results values('55P03 bỏ qua lượt, không tốn quarantine',true);
 perform set_config('qa067.error_state','40P01',true);counter_n=mtm_hw_private.dd_apply_transfers();
 if exists(select 1 from mtm_hw_private.lifecycle_quarantine where entity_table='class_transfers' and entity_id=transient_tid) then raise exception 'SYNC_QA_067_DEADLOCK_SKIP';end if;
 insert into lifecycle_qa067_results values('40P01 bỏ qua lượt, không tốn quarantine',true);
 perform set_config('qa067.error_state','40001',true);
 begin counter_n=mtm_hw_private.dd_apply_transfers();exception when sqlstate '40001' then reraised=true;end;
 if not reraised or exists(select 1 from mtm_hw_private.lifecycle_quarantine where entity_table='class_transfers' and entity_id=transient_tid) then raise exception 'SYNC_QA_067_SERIALIZATION_RERAISE';end if;
 insert into lifecycle_qa067_results values('40001 được raise cho tầng giao dịch retry',true);
 perform set_config('qa067.fail_student','',true);perform set_config('qa067.error_state','',true);counter_n=mtm_hw_private.dd_apply_transfers();
 if (select class_id from mtm_hw_private.students where id=transient_sid)<>b then raise exception 'SYNC_QA_067_TRANSIENT_RECOVERY';end if;
 insert into lifecycle_qa067_results values('Lượt sau khi hết lỗi khóa áp bình thường',true);
 insert into mtm_hw_private.students(owner_id,class_id,full_name,school,school_class,public_alias,source_identity,active)
  values(own,a,'Học sinh GIẢ067 đã nghỉ','Trường GIẢ','12 GIẢ','MTM-'||upper(substr(md5(gen_random_uuid()::text),1,12)),source||':inactive',false) returning id into inactive_sid;
 insert into mtm_hw_private.class_transfers(student_id,from_class,to_class,effective_date,source_msg)
  values(inactive_sid,la,lb,today,source||':transfer-inactive') returning id into inactive_tid;
 counter_n=mtm_hw_private.dd_apply_transfers();
 if (select class_id from mtm_hw_private.students where id=inactive_sid)<>a
  or exists(select 1 from mtm_hw_private.memberships where student_id=inactive_sid and left_at is null)
  or not exists(select 1 from mtm_hw_private.lifecycle_quarantine where entity_table='class_transfers' and entity_id=inactive_tid and error_code='student_inactive_or_left') then raise exception 'SYNC_QA_067_INACTIVE_GUARD';end if;
 insert into lifecycle_qa067_results values('Transfer không mở membership học sinh inactive',true);
 update mtm_hw_private.students set active=true where id=good;
 insert into mtm_hw_private.class_transfers(student_id,from_class,to_class,effective_date,source_msg)
  values(good,lb,la,today,source||':transfer-after-leave') returning id into leave_tid;
 counter_n=mtm_hw_private.dd_apply_transfers();
 if (select class_id from mtm_hw_private.students where id=good)<>b
  or exists(select 1 from mtm_hw_private.memberships where student_id=good and left_at is null)
  or not exists(select 1 from mtm_hw_private.lifecycle_quarantine where entity_table='class_transfers' and entity_id=leave_tid and error_code='student_inactive_or_left') then raise exception 'SYNC_QA_067_LEAVE_GUARD';end if;
 insert into lifecycle_qa067_results values('Leave có hiệu lực chặn transfer dù active bị bật lại',true);
 if has_table_privilege('authenticated','mtm_hw_private.lifecycle_quarantine','select') or has_function_privilege('service_role','mtm_hw_private.lifecycle_quarantine_action(jsonb)','execute') then raise exception 'SYNC_QA_067_PERMISSIONS';end if;
 insert into lifecycle_qa067_results values('Quarantine không mở quyền bảng hoặc helper riêng',true);
 perform set_config('qa067.fail_student','',true);
end$qa$;
select jsonb_build_object('suite','lifecycle067','passed',count(*) filter(where passed),'total',count(*)) as lifecycle067_summary from lifecycle_qa067_results;
