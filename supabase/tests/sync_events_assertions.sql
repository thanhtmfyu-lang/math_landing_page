-- Chạy sau 063 + 064 trong CÙNG transaction, cuối ROLLBACK.
-- Fixture chỉ tồn tại trong transaction. Không gọi Edge, Sheet, sender hoặc API ngoài.
create temporary table sync_qa_results(name text primary key,passed boolean not null) on commit drop;
do $$
declare owner_uuid uuid; cls uuid; cls2 uuid; sid uuid; src text='QA-SYNC-'||gen_random_uuid(); nm text='QA SYNC '||gen_random_uuid();
 cmd jsonb; r jsonb; r2 jsonb; n bigint; before_n bigint; delivery jsonb; claimed jsonb; did bigint; cid uuid;
 lease text; ver int; tid bigint;lesson text;
begin
 select owner_id into owner_uuid from mtm_hw_private.btvn_roster_scope where singleton;
 if owner_uuid is null then raise exception 'QA requires configured owner';end if;
 insert into mtm_hw_private.classes(owner_id,label,grade) values(owner_uuid,src||'-A',10) returning id into cls;
 insert into mtm_hw_private.classes(owner_id,label,grade) values(owner_uuid,src||'-B',10) returning id into cls2;
 insert into mtm_hw_private.students(owner_id,class_id,full_name,school,school_class,public_alias,source_identity)
 values(owner_uuid,cls,nm,'QA','QA','MTM-'||upper(substr(md5(gen_random_uuid()::text),1,12)),'javis:'||src) returning id into sid;
 insert into mtm_hw_private.memberships(student_id,class_id) values(sid,cls);
 if not exists(select 1 from mtm_hw_private.sync_events where entity_table='students' and entity_key->>'id'=sid::text)
  or exists(select 1 from mtm_hw_private.sync_deliveries where status='verified') then raise exception 'outbox_initial_state';end if;
 insert into sync_qa_results values('source_insert_creates_pending_outbox',true);

 select count(*) into before_n from mtm_hw_private.sync_events;
 update mtm_hw_private.students set school=school where id=sid;
 if (select count(*) from mtm_hw_private.sync_events)<>before_n then raise exception 'no_op_event';end if;
 insert into sync_qa_results values('no_op_update_no_event',true);

 cmd=jsonb_build_object('action','mark','rows',jsonb_build_array(jsonb_build_object('student',nm,'class',src||'-A','date','2026-10-19','status','co_mat','source','quan_ly')));
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','command',cmd));
 if r->>'error'<>'need_source_msg' then raise exception 'missing_source_accepted';end if;
 insert into sync_qa_results values('standard_requires_source',true);
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-mark','command',cmd));
 if r->>'syncStatus'<>'applied' or (r->>'eventCount')::int<>1 then raise exception 'mark_failed %',r->>'syncStatus';end if;
 cid=(r->>'commandId')::uuid;
 if not exists(select 1 from mtm_hw_private.sync_events where command_id=cid and not source_missing) then raise exception 'missing_command_link';end if;
 insert into sync_qa_results values('standard_command_links_event',true);
 select count(*) into before_n from mtm_hw_private.sync_events;
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-mark','command',cmd));
 if r2->>'duplicate'<>'true' or r2->>'commandId'<>r->>'commandId' or (select count(*) from mtm_hw_private.sync_events)<>before_n then raise exception 'replay_mutates';end if;
 insert into sync_qa_results values('same_source_payload_replays_once',true);
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-mark','command',jsonb_set(cmd,'{rows,0,status}','"vang_phep"')));
 if r2->>'error'<>'source_conflict' or (select status from mtm_hw_private.attendance where student_id=sid)<>'co_mat' then raise exception 'conflict_mutates';end if;
 insert into sync_qa_results values('source_conflict_rejected',true);
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-outer','command',cmd||jsonb_build_object('sourceMsg',src||'-inner')));
 if r2->>'error'<>'source_mismatch' then raise exception 'source_mismatch_accepted';end if;
 insert into sync_qa_results values('nested_source_mismatch_rejected',true);

 if exists(select 1 from mtm_hw_private.sync_events e join mtm_hw_private.sync_deliveries d on d.event_id=e.id where e.command_id=cid and d.sink in ('ranking','sheet_roster')) then raise exception 'wrong_fanout';end if;
 insert into sync_qa_results values('attendance_fanout_scoped',true);
 if exists(select 1 from mtm_hw_private.sync_events where entity_key ?| array['full_name','student_phone','parent_phone','zalo_uid_ph','ph_name','raw_name','text']) then raise exception 'pii_in_event_key';end if;
 insert into sync_qa_results values('outbox_keys_exclude_contact_and_message',true);

 select count(*) into before_n from mtm_hw_private.sync_events;
 begin
  update mtm_hw_private.students set school='QA rollback' where id=sid;
  raise exception 'rollback_fixture';
 exception when raise_exception then null;end;
 if (select count(*) from mtm_hw_private.sync_events)<>before_n then raise exception 'event_escaped_source_rollback';end if;
 insert into sync_qa_results values('event_outbox_atomic_with_source',true);

 r=public.mtm_dd_api15(jsonb_build_object('action','sync_claim','worker','qa-sync','limit',1,'sinks',jsonb_build_array('web')));
 delivery=r->'deliveries'->0;did=(delivery->>'deliveryId')::bigint;lease=delivery->>'leaseToken';ver=(delivery->>'version')::int;
 if did is null or delivery->>'sink'<>'web' then raise exception 'claim_failed';end if;
 insert into sync_qa_results values('claim_returns_lease_version_and_route',true);
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_ack','deliveryId',did,'leaseToken',gen_random_uuid(),'version',ver,'status','verified','readbackHash',repeat('a',64),'receiptRef','qa/readonly.json'));
 if r2->>'error'<>'stale_lease' then raise exception 'bad_token_accepted';end if;
 insert into sync_qa_results values('stale_lease_rejected',true);
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_ack','deliveryId',did,'leaseToken',lease,'version',ver,'status','verified'));
 if r2->>'error'<>'need_verified_readback' then raise exception 'verified_without_readback';end if;
 insert into sync_qa_results values('verified_requires_receipt_and_hash',true);
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_ack','deliveryId',did,'leaseToken',lease,'version',ver,'status','verified','readbackHash',repeat('a',64),'receiptRef','qa/readonly.json'));
 if r2->>'status'<>'verified' then raise exception 'valid_ack_failed';end if;
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_ack','deliveryId',did,'leaseToken',lease,'version',ver,'status','blocked','errorCode','qa_blocked'));
 if r2->>'error'<>'stale_lease' then raise exception 'double_ack_mutates';end if;
 insert into sync_qa_results values('verified_ack_once',true);

 r=public.mtm_dd_api15(jsonb_build_object('action','sync_claim','worker','qa-sync','limit',1,'sinks',jsonb_build_array('sheet_roster')));
 delivery=r->'deliveries'->0;did=(delivery->>'deliveryId')::bigint;
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_ack','deliveryId',did,'leaseToken',delivery->>'leaseToken','version',(delivery->>'version')::int,'status','blocked','errorCode','sheet_cloud_unavailable'));
 if r2->>'status'<>'blocked' then raise exception 'blocked_failed';end if;
 insert into sync_qa_results values('external_block_stored_explicitly',true);
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_requeue','sourceMsg',src||'-resume','deliveryId',did,'version',(r2->>'version')::int,'reason','adapter_deployed'));
 if r->>'ok'<>'true' or not exists(select 1 from mtm_hw_private.sync_deliveries where id=did and status='pending' and requeues=1 and total_attempts=1) then raise exception 'resume_failed';end if;
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_requeue','sourceMsg',src||'-resume','deliveryId',did,'version',(r2->>'version')::int,'reason','adapter_deployed'));
 if r2->>'duplicate'<>'true' or r2->>'deliveryId'<>did::text then raise exception 'resume_replay_failed';end if;
 update mtm_hw_private.sync_deliveries set status='blocked',requeues=2 where id=did;
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_requeue','sourceMsg',src||'-resume-budget','deliveryId',did,'version',(r->>'version')::int,'reason','adapter_deployed'));
 if r->>'error'<>'requeue_budget_exhausted' then raise exception 'resume_budget_unbounded';end if;
 insert into sync_qa_results values('requeue_cas_idempotency_and_lifetime_budget',true);

 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-invalid','command',jsonb_set(cmd,'{rows,0,status}','"invalid_status"')));
 if r->>'syncStatus'<>'failed' or (r->>'eventCount')::int<>0 or (select status from mtm_hw_private.attendance where student_id=sid)<>'co_mat' then raise exception 'failed_command_not_atomic';end if;
 insert into sync_qa_results values('failed_command_rolls_back_source_and_events',true);

 cmd=jsonb_set(cmd,'{rows,0,status}','"di_muon"');
 r=public.mtm_dd_api15(cmd);
 if r->>'ok'<>'true' or not exists(select 1 from mtm_hw_private.sync_events where entity_table='attendance' and entity_key->>'student_id'=sid::text and source_missing) then raise exception 'legacy_broken';end if;
 insert into sync_qa_results values('legacy_preserved_and_missing_source_flagged',true);
 cmd=jsonb_set(cmd,'{rows,0,status}','"co_mat"');
 cmd=jsonb_set(cmd,'{rows}',(cmd->'rows')||jsonb_build_array(jsonb_build_object('student',src||'-no-such-student','class',src||'-A','date','2026-10-19','status','co_mat','source','quan_ly')));
 select count(*) into before_n from mtm_hw_private.sync_events;
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-strict-batch','command',cmd));
 if r->>'syncStatus'<>'rejected' or r->>'rolledBack'<>'true' or (select status from mtm_hw_private.attendance where student_id=sid)<>'di_muon'
  or (select count(*) from mtm_hw_private.sync_events)<>before_n then raise exception 'strict_partial_committed';end if;
 r=public.mtm_dd_api15(cmd||jsonb_build_object('sourceMsg',src||'-legacy-batch'));
 if r->>'syncStatus'<>'partial' or (select status from mtm_hw_private.attendance where student_id=sid)<>'co_mat' then raise exception 'legacy_partial_hidden';end if;
 insert into sync_qa_results values('strict_batch_atomic_legacy_partial_truthful',true);

 insert into mtm_hw_private.class_transfers(student_id,from_class,to_class,effective_date,source_msg)
 values(sid,src||'-A',src||'-B',(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date,src||'-pending') returning id into tid;
 select count(*) into before_n from mtm_hw_private.sync_events;
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_status','sourceMsg',src||'-mark'));
 if (select applied_at from mtm_hw_private.class_transfers where id=tid) is not null or (select class_id from mtm_hw_private.students where id=sid)<>cls
  or (select count(*) from mtm_hw_private.sync_events)<>before_n then raise exception 'sync_status_side_effect';end if;
 insert into sync_qa_results values('sync_status_has_no_apply_side_effect',true);
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_tick','sourceMsg',src||'-tick'));
 if r->>'ok'<>'true' or (r->>'transfersApplied')::int<1 or (select class_id from mtm_hw_private.students where id=sid)<>cls2 then raise exception 'lifecycle_tick_failed';end if;
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_tick','sourceMsg',src||'-tick'));
 if r2->>'duplicate'<>'true' or r2->>'transfersApplied'<>r->>'transfersApplied' then raise exception 'tick_replay_failed';end if;
 insert into sync_qa_results values('lifecycle_tick_and_replay_counts',true);
 if has_function_privilege('anon','public.mtm_dd_api15(jsonb)','EXECUTE') or has_function_privilege('authenticated','public.mtm_dd_api15(jsonb)','EXECUTE')
  or has_table_privilege('anon','mtm_hw_private.sync_events','SELECT') then raise exception 'public_sync_access';end if;
 insert into sync_qa_results values('private_tables_and_service_only_rpc',true);
 lesson='qa-sync-'||gen_random_uuid();
 insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status)
 values(lesson,owner_uuid,array[cls2],'{}','{}',true,'da_dang');
 select count(*) into before_n from mtm_hw_private.sync_events;
 insert into mtm_hw_private.btvn_work(student_id,lesson_code) values(sid,lesson);
 update mtm_hw_private.btvn_work set revision=revision+1,drafts='[{"qa":"draft"}]' where student_id=sid and lesson_code=lesson;
 if (select count(*) from mtm_hw_private.sync_events)<>before_n then raise exception 'autosave_floods_outbox';end if;
 update mtm_hw_private.btvn_work set expected_due_at=clock_timestamp()+interval '1 day' where student_id=sid and lesson_code=lesson;
 if (select count(*) from mtm_hw_private.sync_events)<>before_n+1 then raise exception 'due_update_missing_event';end if;
 insert into sync_qa_results values('draft_autosave_suppressed_due_update_captured',true);
 insert into mtm_hw_private.student_pins(student_id,pin_hash) values(sid,'QA-NOT-A-REAL-PIN-HASH');
 select count(*) into before_n from mtm_hw_private.sync_events;
 update mtm_hw_private.student_pins set failed=failed+1,locked_until=clock_timestamp()+interval '1 minute' where student_id=sid;
 if (select count(*) from mtm_hw_private.sync_events)<>before_n then raise exception 'pin_failure_floods_outbox';end if;
 update mtm_hw_private.student_pins set pin_hash='QA-ANOTHER-NON-PIN-HASH' where student_id=sid;
 if (select count(*) from mtm_hw_private.sync_events)<>before_n+1 then raise exception 'pin_change_missing_event';end if;
 insert into sync_qa_results values('pin_failure_suppressed_pin_change_captured',true);
end$$;
-- Fault injection chỉ thay dispatcher trong transaction QA; khôi phục nguyên định nghĩa trước khi chạy suite khác.
create temporary table sync_qa_dispatch_backup on commit drop as
 select pg_get_functiondef('mtm_hw_private.sync_dispatch(jsonb)'::regprocedure) definition;
create temporary sequence sync_qa_fault_call_seq start 1;
create or replace function mtm_hw_private.sync_dispatch(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid=(p->>'qaStudentId')::uuid;mode_name text=p->>'qaFault';call_n bigint;made_id bigint;
begin
 call_n=nextval('pg_temp.sync_qa_fault_call_seq');
 update mtm_hw_private.students set school=p->>'qaMarker' where id=sid;
 insert into mtm_hw_private.class_transfers(student_id,from_class,to_class,effective_date,source_msg)
 values(sid,p->>'qaClassLabel',p->>'qaClassLabel',(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date+100,p->>'sourceMsg') returning id into made_id;
 if mode_name='partial_ghost' then
  return jsonb_build_object('ok',true,'studentId',sid,'student',jsonb_build_object('id',sid),
   'transferId',made_id,'moveId',made_id,'leaveId',made_id,'overrideId',made_id,'scoreId',made_id,'created',true,'applied',true,
   'transfersApplied',1,'leavesApplied',1,'version',99,'results',jsonb_build_array(jsonb_build_object('error','qa_reject')));
 end if;
 if mode_name='raise_pz001' then raise exception using errcode='PZ001',message='qa_unassigned_result';end if;
 if mode_name='return_null' then return null;end if;
 if mode_name='permanent' then raise exception using errcode='23514',message='qa_permanent';end if;
 if mode_name in ('40001','40P01','55P03','57014') and (call_n<3 or coalesce((p->>'qaAlways')::boolean,false)) then
  raise exception using errcode=mode_name,message='qa_transient';
 end if;
 return jsonb_build_object('ok',true,'studentId',sid,'transferId',made_id,'created',true,'applied',false,'transfersApplied',0,'leavesApplied',0);
end$$;

do $$
declare owner_uuid uuid;cls uuid;sid uuid;src text='QA-FAULT-'||gen_random_uuid();body jsonb;r jsonb;r2 jsonb;summary jsonb;
 cid uuid;state_name text;attempt_n int;before_events bigint;before_transfers bigint;before_school text;seq_n bigint;context_before text;
 banned text[]=array['studentId','student','classId','moveId','transferId','leaveId','overrideId','scoreId','deliveryId','version','created','applied','transfersApplied','leavesApplied','retryWindow','lifetimeAttempts','results'];
begin
 select owner_id into owner_uuid from mtm_hw_private.btvn_roster_scope where singleton;
 insert into mtm_hw_private.classes(owner_id,label,grade) values(owner_uuid,src,10) returning id into cls;
 insert into mtm_hw_private.students(owner_id,class_id,full_name,school,school_class,public_alias,source_identity)
 values(owner_uuid,cls,'QA FAULT STUDENT','QA-BASE','QA','MTM-'||upper(substr(md5(gen_random_uuid()::text),1,12)),'qa:'||src) returning id into sid;
 body=jsonb_build_object('action','mark','qaStudentId',sid,'qaClassLabel',src,'qaMarker','QA-GHOST','qaFault','partial_ghost');
 select count(*) into before_events from mtm_hw_private.sync_events;
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-ghost','command',body));
 cid=(r->>'commandId')::uuid;
 select result_summary into summary from mtm_hw_private.sync_commands where id=cid;
 if r->>'syncStatus'<>'rejected' or r->>'rolledBack'<>'true' or r->>'eventCount'<>'0' or r ?| banned or summary ?| banned
  or (select school from mtm_hw_private.students where id=sid)<>'QA-BASE'
  or exists(select 1 from mtm_hw_private.class_transfers where student_id=sid)
  or (select count(*) from mtm_hw_private.sync_events)<>before_events then raise exception 'fault_ghost_response_or_state';end if;
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-ghost','command',body));
 if r2->>'duplicate'<>'true' or r2 ?| banned or r2->>'eventCount'<>'0' or r2->>'commandId'<>cid::text then raise exception 'fault_ghost_replay';end if;
 insert into sync_qa_results values('rejected_response_summary_and_replay_drop_rolled_back_business_ids',true);

 body=jsonb_set(body,'{qaFault}','"raise_pz001"');context_before=coalesce(current_setting('mtm.sync_command_id',true),'');
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-pz001','command',body));
 if r is null or r->>'syncStatus'<>'rejected' or r->>'rolledBack'<>'true' or r->>'eventCount'<>'0' or r ?| banned
  or coalesce(current_setting('mtm.sync_command_id',true),'')<>context_before then raise exception 'fault_pz001_null_or_context';end if;
 insert into sync_qa_results values('dispatcher_pz001_before_result_assignment_returns_safe_failure',true);

 perform setval('pg_temp.sync_qa_fault_call_seq',1,false);
 body=jsonb_set(body,'{qaFault}','"permanent"');
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-permanent','command',body));
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-permanent','command',body));
 if r->>'syncStatus'<>'failed' or r->>'failureKind'<>'permanent' or r->>'retryable'<>'false' or r->>'sqlstate'<>'23514'
  or r ?| banned or r2 ?| banned or r2->>'duplicate'<>'true' or (select last_value from pg_temp.sync_qa_fault_call_seq)<>1
  or (select execution_attempts from mtm_hw_private.sync_commands where id=(r->>'commandId')::uuid)<>1 then raise exception 'fault_permanent_not_cached';end if;
 insert into sync_qa_results values('permanent_failure_cached_without_reexecution_or_business_ids',true);

 foreach state_name in array array['40001','40P01','55P03','57014'] loop
  perform setval('pg_temp.sync_qa_fault_call_seq',1,false);
  body=jsonb_set(body,'{qaFault}',to_jsonb(state_name));body=jsonb_set(body,'{qaMarker}',to_jsonb('QA-'||state_name));
  select school into before_school from mtm_hw_private.students where id=sid;
  select count(*) into before_events from mtm_hw_private.sync_events;
  select count(*) into before_transfers from mtm_hw_private.class_transfers where student_id=sid;
  cid=null;
  for attempt_n in 1..3 loop
   r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-transient-'||state_name,'command',body));
   if cid is null then cid=(r->>'commandId')::uuid;end if;
   if r->>'commandId'<>cid::text then raise exception 'fault_retry_created_new_command';end if;
   if attempt_n<3 then
    if r->>'syncStatus'<>'failed' or r->>'failureKind'<>'transient' or r->>'retryable'<>'true' or r->>'eventCount'<>'0'
     or r->>'rolledBack'<>'true' or r ?| banned or r->>'sqlstate'<>state_name
     or (r->>'executionAttempts')::int<>attempt_n or (select school from mtm_hw_private.students where id=sid)<>before_school
     or (select count(*) from mtm_hw_private.class_transfers where student_id=sid)<>before_transfers
     or (select count(*) from mtm_hw_private.sync_events)<>before_events then raise exception 'fault_transient_savepoint_or_classification';end if;
   else
    if r->>'syncStatus'<>'applied' or (select execution_attempts from mtm_hw_private.sync_commands where id=cid)<>3
     or (select count(*) from mtm_hw_private.sync_commands where source_msg=src||'-transient-'||state_name)<>1
     or (select count(*) from mtm_hw_private.class_transfers where student_id=sid)<>before_transfers+1 then raise exception 'fault_transient_recovery';end if;
   end if;
  end loop;
  r2=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-transient-'||state_name,'command',body));
  if r2->>'duplicate'<>'true' or r2->>'transferId'<>r->>'transferId' or (select last_value from pg_temp.sync_qa_fault_call_seq)<>3 then raise exception 'fault_recovered_replay';end if;
  insert into sync_qa_results values('transient_'||state_name||'_same_command_recovers_after_two_bounded_retries',true);
 end loop;

 perform setval('pg_temp.sync_qa_fault_call_seq',1,false);
 body=body||jsonb_build_object('qaFault','40001','qaAlways',true,'qaMarker','QA-NEVER');
 select count(*) into before_events from mtm_hw_private.sync_events;
 select count(*) into before_transfers from mtm_hw_private.class_transfers where student_id=sid;
 for attempt_n in 1..4 loop
  r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-exhausted','command',body));
 end loop;
 if r->>'duplicate'<>'true' or r->>'retryable'<>'false' or r->>'retryExhausted'<>'true' or r->>'executionAttempts'<>'3'
  or r ?| banned or (select last_value from pg_temp.sync_qa_fault_call_seq)<>3
  or (select count(*) from mtm_hw_private.class_transfers where student_id=sid)<>before_transfers
  or (select count(*) from mtm_hw_private.sync_events)<>before_events then raise exception 'fault_retry_unbounded_or_state_leaked';end if;
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-exhausted','command',jsonb_set(body,'{qaMarker}','"QA-CONFLICT"')));
 if r2->>'error'<>'source_conflict' or (select last_value from pg_temp.sync_qa_fault_call_seq)<>3 then raise exception 'fault_retry_hash_conflict_bypassed';end if;
 insert into sync_qa_results values('transient_retry_exhaustion_and_payload_conflict_are_bounded',true);

 body=(body-'qaAlways')||jsonb_build_object('qaFault','return_null');
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-null','command',body));
 if r is null or r->>'syncStatus'<>'failed' or r->>'sqlstate'<>'PZ002' or r->>'failureKind'<>'permanent' or r ?| banned or r->>'eventCount'<>'0' then raise exception 'fault_null_dispatch_result';end if;
 insert into sync_qa_results values('null_dispatch_result_rejected_without_phantom_data',true);
end$$;
do $$
declare original text;
begin
 select definition into original from sync_qa_dispatch_backup;
 execute original;
 if pg_get_functiondef('mtm_hw_private.sync_dispatch(jsonb)'::regprocedure)<>original then raise exception 'fault_dispatch_not_restored';end if;
 insert into sync_qa_results values('fault_injection_dispatch_restored_exactly',true);
end$$;
select jsonb_build_object('suite','sync_events','passed',count(*) filter(where passed),'total',count(*),'checks',jsonb_agg(name order by name)) qa from sync_qa_results;
