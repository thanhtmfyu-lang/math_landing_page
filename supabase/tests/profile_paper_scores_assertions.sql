-- Chạy sau 063 + 064 + 065 trong transaction và ROLLBACK, chỉ fixture QA.
create temporary table profile_paper_qa_results(name text primary key,passed boolean not null) on commit drop;
do $$
declare owner_uuid uuid; cls uuid; sid uuid; src text='QA-PROFILE-'||gen_random_uuid();nm text='QA PROFILE '||gen_random_uuid();
 r jsonb;r2 jsonb;cmd jsonb;scoreid bigint;n bigint;btvn_before bigint; event_cmd uuid;other_owner uuid;other_cls uuid;other_sid uuid;operation_name text;
begin
 select owner_id into owner_uuid from mtm_hw_private.btvn_roster_scope where singleton;
 insert into mtm_hw_private.classes(owner_id,label,grade) values(owner_uuid,src,10) returning id into cls;
 insert into mtm_hw_private.students(owner_id,class_id,full_name,school,school_class,public_alias,source_identity,parent_phone)
 values(owner_uuid,cls,nm||' (HỌC T2 (17H30-19H30))','QA','QA','MTM-'||upper(substr(md5(gen_random_uuid()::text),1,12)),'qa:'||src,'0900000002') returning id into sid;
 cmd=jsonb_build_object('action','student_profile_update','studentId',sid,'expectedVersion',1,'fullName',nm||' NEW','birthDate','2010-02-28','school','QA NEW','phone','0900000001','parentPhone','');
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-profile','command',cmd));
 if r->>'ok'<>'true' or (r->>'version')::int<>2 then raise exception 'profile_update_failed';end if;
 if not exists(select 1 from mtm_hw_private.students where id=sid and profile_version=2 and full_name=nm||' NEW (HỌC T2 (17H30-19H30))' and birth_date=date '2010-02-28' and parent_phone='0900000002') then raise exception 'profile_fields_or_schedule_lost';end if;
 if (select count(*) from mtm_hw_private.student_profile_history where student_id=sid)<>1 then raise exception 'missing_profile_history';end if;
 insert into profile_paper_qa_results values('profile_versions_history_preserve_schedule_and_empty_fields',true);
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-profile','command',cmd));
 if r2->>'duplicate'<>'true' or r2->>'studentId'<>sid::text or r2->>'version'<>'2' then raise exception 'profile_replay_id_lost';end if;
 insert into profile_paper_qa_results values('profile_replay_preserves_stable_ids',true);
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-stale','command',cmd));
 if r->>'error'<>'profile_version_conflict' or (select profile_version from mtm_hw_private.students where id=sid)<>2 then raise exception 'stale_profile_overwrites';end if;
 insert into profile_paper_qa_results values('profile_compare_and_swap_rejects_stale_version',true);
 cmd=jsonb_set(cmd,'{expectedVersion}','2');cmd=jsonb_set(cmd,'{birthDate}','"2010-02-30"');
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-bad-dob','command',cmd));
 if r->>'error'<>'invalid_birth_date' or (select profile_version from mtm_hw_private.students where id=sid)<>2 then raise exception 'invalid_birth_date_applied';end if;
 cmd=jsonb_set(cmd,'{birthDate}','"2999-01-01"');
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-future-dob','command',cmd));
 if r->>'error'<>'invalid_birth_date' then raise exception 'future_birth_date_accepted';end if;
 insert into profile_paper_qa_results values('birth_date_valid_calendar_and_not_future',true);
 r=public.mtm_dd_api15(jsonb_build_object('action','student_profile_read','studentId',sid));
 if r->>'version'<>'2' or r ? 'fullName' or r ? 'phone' or length(r->>'profileHash')<>64 then raise exception 'profile_read_privacy';end if;
 insert into profile_paper_qa_results values('profile_read_returns_hash_and_presence_only',true);

 select count(*) into btvn_before from mtm_hw_private.btvn_work where student_id=sid;
 cmd=jsonb_build_object('action','paper_score_record','studentId',sid,'testCode','QA-TEST-01','testDate','2026-10-18','score',7.5,'maxScore',10,'unit','điểm');
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-paper','command',cmd));
 if r->>'ok'<>'true' then raise exception 'paper_score_failed %',r->>'error';end if;
 scoreid=(r->>'scoreId')::bigint;event_cmd=(r->>'commandId')::uuid;
 if (select count(*) from mtm_hw_private.btvn_work where student_id=sid)<>btvn_before or exists(select 1 from mtm_hw_private.sync_events e join mtm_hw_private.sync_deliveries d on d.event_id=e.id where e.command_id=event_cmd and d.sink='ranking') then raise exception 'paper_score_leaks_into_btvn';end if;
 insert into profile_paper_qa_results values('paper_score_separate_from_homework_and_ranking',true);
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-paper','command',cmd));
 if r2->>'duplicate'<>'true' or r2->>'scoreId'<>scoreid::text then raise exception 'paper_replay_id_lost';end if;
 insert into profile_paper_qa_results values('paper_replay_returns_score_id',true);
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-range','command',jsonb_set(cmd,'{score}','11')));
 if r->>'error'<>'invalid_score_range_or_unit' then raise exception 'score_above_scale_accepted';end if;
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-fraction','command',cmd||jsonb_build_object('unit','câu')));
 if r->>'error'<>'invalid_score_range_or_unit' then raise exception 'fractional_count_accepted';end if;
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-nan','command',cmd||jsonb_build_object('score','NaN')));
 if r->>'error'<>'invalid_score_range_or_unit' then raise exception 'nan_score_accepted';end if;
 insert into profile_paper_qa_results values('paper_score_range_unit_and_nan_guard',true);
 cmd=jsonb_set(cmd,'{score}','8.5');
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-unversioned-correction','command',cmd));
 if r->>'error'<>'need_supersedes_id' then raise exception 'paper_blind_overwrite';end if;
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-correction','command',cmd||jsonb_build_object('supersedesId',scoreid)));
 if r->>'ok'<>'true' or (select count(*) from mtm_hw_private.paper_scores where student_id=sid)<>2
  or (select count(*) from mtm_hw_private.paper_scores where student_id=sid and superseded_by is null)<>1
  or (select score from mtm_hw_private.paper_scores where id=scoreid)<>7.5 then raise exception 'paper_history_lost';end if;
 insert into profile_paper_qa_results values('paper_correction_keeps_original_and_requires_current_id',true);
 foreach operation_name in array array['INSERT','UPDATE','DELETE'] loop
  if 'ranking'=any(mtm_hw_private.sync_sinks('paper_scores',operation_name,array['score','superseded_by'])) then raise exception 'paper_score_routing_contains_homework_ranking';end if;
 end loop;
 if exists(select 1 from mtm_hw_private.sync_events e join mtm_hw_private.sync_deliveries d on d.event_id=e.id
  where e.entity_table='paper_scores' and e.entity_key->>'student_id'=sid::text and d.sink='ranking') then raise exception 'paper_correction_contains_homework_ranking';end if;
 insert into profile_paper_qa_results values('paper_insert_update_delete_and_correction_never_emit_homework_ranking',true);
 if has_table_privilege('anon','mtm_hw_private.paper_scores','SELECT') or has_table_privilege('service_role','mtm_hw_private.student_profile_history','SELECT') then raise exception 'private_history_acl';end if;
 insert into profile_paper_qa_results values('paper_and_profile_history_private',true);
 cmd=jsonb_build_object('action','class_upsert','classLabel',src||'-NEW','grade',10,'active',true,'confirmedBy','qa-manager');
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-class','command',cmd));
 if r->>'created'<>'true' or not exists(select 1 from mtm_hw_private.classes where id=(r->>'classId')::uuid and active and grade=10) then raise exception 'class_create_failed';end if;
 r2=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-class','command',cmd));
 if r2->>'duplicate'<>'true' or r2->>'classId'<>r->>'classId' then raise exception 'class_replay_failed';end if;
 insert into profile_paper_qa_results values('class_create_confirmed_and_idempotent',true);
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-class-grade','command',cmd||jsonb_build_object('grade',13)));
 if r->>'error'<>'invalid_grade' then raise exception 'class_grade_invalid_accepted';end if;
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-class-future','command',cmd||jsonb_build_object('effectiveDate','2999-01-01')));
 if r->>'error'<>'only_immediate_class_change_supported' then raise exception 'future_class_activated_early';end if;
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-class-no-confirm','command',cmd-'confirmedBy'));
 if r->>'error'<>'need_source_and_confirmation' then raise exception 'class_without_confirmation';end if;
 insert into profile_paper_qa_results values('class_grade_confirmation_and_future_guards',true);
 other_owner=gen_random_uuid();insert into auth.users(id) values(other_owner);
 insert into mtm_hw_private.classes(owner_id,label,grade) values(other_owner,src||'-OTHER',10) returning id into other_cls;
 insert into mtm_hw_private.students(owner_id,class_id,full_name,school,school_class,public_alias,source_identity)
 values(other_owner,other_cls,'QA OTHER OWNER','QA','QA','MTM-'||upper(substr(md5(gen_random_uuid()::text),1,12)),'qa:'||src||'-OTHER') returning id into other_sid;
 if exists(select 1 from mtm_hw_private.sync_events where entity_table='students' and entity_key->>'id'=other_sid::text) then raise exception 'other_owner_outbox_leak';end if;
 r=public.mtm_dd_api15(jsonb_build_object('action','student_profile_read','studentId',other_sid));
 if r->>'error'<>'student_not_found' then raise exception 'other_owner_profile_read';end if;
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-other-profile','command',jsonb_build_object('action','student_profile_update','studentId',other_sid,'expectedVersion',1,'school','QA CHANGED')));
 if r->>'error'<>'student_not_found' or (select school from mtm_hw_private.students where id=other_sid)<>'QA' then raise exception 'other_owner_profile_write';end if;
 r=public.mtm_dd_api15(jsonb_build_object('action','paper_score_read','studentId',other_sid));
 if r->>'error'<>'student_not_found' then raise exception 'other_owner_score_read';end if;
 r=public.mtm_dd_api15(jsonb_build_object('action','sync_execute','sourceMsg',src||'-other-score','command',jsonb_build_object('action','paper_score_record','studentId',other_sid,'testCode','QA-OTHER','testDate','2026-10-18','score',8,'maxScore',10)));
 if r->>'error'<>'student_not_found' then raise exception 'other_owner_score_write';end if;
 insert into profile_paper_qa_results values('profile_paper_and_outbox_reject_other_owner',true);
end$$;
select jsonb_build_object('suite','profile_paper_scores','passed',count(*) filter(where passed),'total',count(*),'checks',jsonb_agg(name order by name)) qa from profile_paper_qa_results;
