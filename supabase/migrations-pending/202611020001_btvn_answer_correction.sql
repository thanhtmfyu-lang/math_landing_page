-- CHƯA ÁP CLOUD. Cổng sửa khóa/chấm lại hữu hạn; không gửi thông báo.
begin;
create table mtm_hw_private.btvn_answer_corrections (
 request_id text primary key,lesson_code text not null references mtm_hw_private.btvn_lessons(code),
 binding jsonb not null,original_snapshot jsonb not null,new_exam jsonb not null,
 plan_sha256 text not null check(plan_sha256 ~ '^[a-f0-9]{64}$'),result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table mtm_hw_private.btvn_answer_corrections enable row level security;
revoke all on mtm_hw_private.btvn_answer_corrections from public,anon,authenticated,service_role,mtm_btvn_publisher;

create function public.mtm_btvn_answer_correction(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l mtm_hw_private.btvn_lessons;scope mtm_hw_private.btvn_publish_scope;
 prior mtm_hw_private.btvn_answer_corrections;binding jsonb;snapshot jsonb;newexam jsonb;
 w jsonb;oldw jsonb;d jsonb;od jsonb;r jsonb;orr jsonb;q jsonb;oq jsonb;
 i integer;j integer;attempts integer=0;changed integer=0;result jsonb;
begin
 if p_action not in ('answer_correction_snapshot','answer_correction_commit') or p_action is null
  or jsonb_typeof(p)<>'object' or octet_length(p::text)>16777216
  or coalesce(p->>'request_id','') !~ '^[A-Za-z0-9_-]{12,160}$'
  or coalesce(p->>'lesson_key','') !~ '^[a-z0-9-]{1,160}$'
  or length(coalesce(p->>'lenh_ref','')) not between 8 and 500
  or length(coalesce(p->>'approved_via','')) not between 8 and 500
  or jsonb_typeof(p->'patches') is distinct from 'array'
 then raise exception 'CORRECTION_SCHEMA';end if;
 binding=jsonb_build_object('lesson_key',p->'lesson_key','request_id',p->'request_id',
  'lenh_ref',p->'lenh_ref','approved_via',p->'approved_via','patches',p->'patches');
 perform pg_advisory_xact_lock(hashtextextended('btvn-answer-correction:'||(p->>'lesson_key'),0));
 select * into scope from mtm_hw_private.btvn_publish_scope where singleton;
 if not found then raise exception 'CORRECTION_SCOPE' using errcode='42501';end if;
 select * into l from mtm_hw_private.btvn_lessons where code=p->>'lesson_key' for update;
 if not found or l.owner_id<>scope.owner_id or not l.class_ids <@ scope.class_ids
  or not l.active or l.material->>'kind'='kiem-tra-thang'
 then raise exception 'CORRECTION_SCOPE' using errcode='42501';end if;
 -- Monthly lessons have their own immutable exam snapshots and manual grading.
 if to_jsonb(l)->>'kind'='kiem-tra-thang' then raise exception 'CORRECTION_MONTHLY_HOLD';end if;
 select * into prior from mtm_hw_private.btvn_answer_corrections where request_id=p->>'request_id';
 if found then
  if prior.binding<>binding then raise exception 'CORRECTION_REQUEST_CONFLICT';end if;
  return jsonb_build_object('already_applied',true,'result',prior.result);
 end if;
 perform 1 from mtm_hw_private.btvn_work where lesson_code=l.code order by student_id for update;
 select jsonb_build_object('exam',l.exam,'work',coalesce(jsonb_agg(jsonb_build_object(
  'student_id',student_id,'revision',revision,'drafts',drafts,'receipts',receipts) order by student_id),'[]'::jsonb))
 into snapshot from mtm_hw_private.btvn_work where lesson_code=l.code;
 if p_action='answer_correction_snapshot' then return snapshot;end if;
 if snapshot is distinct from p->'expected_snapshot' then raise exception 'CORRECTION_STALE_SNAPSHOT';end if;
 newexam=p->'new_exam';
 if jsonb_typeof(newexam) is distinct from 'object' or coalesce(p->>'plan_sha256','') !~ '^[a-f0-9]{64}$'
  or (newexam-array['questions','answerKeyVersion','versionHash']) is distinct from (l.exam-array['questions','answerKeyVersion','versionHash'])
  or jsonb_typeof(newexam->'questions') is distinct from 'array'
  or jsonb_array_length(newexam->'questions')<>jsonb_array_length(l.exam->'questions')
  or jsonb_typeof(p->'updated_work') is distinct from 'array'
  or jsonb_array_length(p->'updated_work')<>jsonb_array_length(snapshot->'work')
 then raise exception 'CORRECTION_STRUCTURE';end if;
 if newexam->>'rubricVersion'='MTM-EQUAL-QUESTION-10-20261016-v1' then
  if newexam->'versionHash' is distinct from l.exam->'versionHash' then raise exception 'CORRECTION_STRUCTURE';end if;
 elsif coalesce(newexam->>'versionHash','') !~ '^[a-f0-9]{64}$' or newexam->'versionHash' is not distinct from l.exam->'versionHash'
 then raise exception 'CORRECTION_VERSION_REQUIRED';end if;
 if exists(select 1 from jsonb_array_elements(l.exam->'questions') x where x->>'kind'='self')
 then raise exception 'CORRECTION_MANUAL_GRADING_HOLD';end if;
 for i in 0..jsonb_array_length(newexam->'questions')-1 loop
  q=newexam->'questions'->i;oq=l.exam->'questions'->i;
  if (q-array['answer','acceptedAnswers','answerVerified','answerConflict']) is distinct from
     (oq-array['answer','acceptedAnswers','answerVerified','answerConflict'])
  then raise exception 'CORRECTION_STRUCTURE';end if;
  if q is distinct from oq and not exists(select 1 from jsonb_array_elements(p->'patches') patch where patch->>'question_id'=q->>'id')
  then raise exception 'CORRECTION_UNREQUESTED_QUESTION';end if;
 end loop;
 for i in 0..jsonb_array_length(p->'updated_work')-1 loop
  w=p->'updated_work'->i;oldw=snapshot->'work'->i;
  if (w-array['drafts','receipts']) is distinct from (oldw-array['drafts','receipts'])
   or jsonb_array_length(w->'drafts') is distinct from jsonb_array_length(oldw->'drafts')
   or jsonb_array_length(w->'receipts') is distinct from jsonb_array_length(oldw->'receipts')
  then raise exception 'CORRECTION_WORK_STRUCTURE';end if;
  for j in 0..jsonb_array_length(w->'drafts')-1 loop
   d=w->'drafts'->j;od=oldw->'drafts'->j;
   if (d-array['answerKeyVersion','examVersionHash']) is distinct from (od-array['answerKeyVersion','examVersionHash'])
    or d->'examVersionHash' is distinct from newexam->'versionHash'
    or (newexam->>'rubricVersion'='MTM-EQUAL-QUESTION-10-20261016-v1' and d->'answerKeyVersion' is distinct from newexam->'answerKeyVersion')
   then raise exception 'CORRECTION_ANSWERS_CHANGED';end if;
  end loop;
  for j in 0..jsonb_array_length(w->'receipts')-1 loop
   r=w->'receipts'->j;orr=oldw->'receipts'->j;
   if (r-array['score','mtm','rubricVersion']) is distinct from (orr-array['score','mtm','rubricVersion'])
    or jsonb_typeof(r->'score') is distinct from 'number' or (r->>'score')::numeric not between 0 and 10
   then raise exception 'CORRECTION_RECEIPT_STRUCTURE';end if;
   attempts=attempts+1;if r->'score' is distinct from orr->'score' then changed=changed+1;end if;
  end loop;
 end loop;
 result=jsonb_build_object('ok',true,'status','corrected_and_regraded','request_id',p->'request_id',
  'students',jsonb_array_length(p->'updated_work'),'attempts',attempts,'changed',changed,'plan_sha256',p->'plan_sha256');
 insert into mtm_hw_private.btvn_answer_corrections(request_id,lesson_code,binding,original_snapshot,new_exam,plan_sha256,result)
 values(p->>'request_id',l.code,binding,snapshot,newexam,p->>'plan_sha256',result);
 update mtm_hw_private.btvn_lessons set exam=newexam,updated_at=clock_timestamp() where code=l.code;
 for w in select value from jsonb_array_elements(p->'updated_work') loop
  update mtm_hw_private.btvn_work set drafts=w->'drafts',receipts=w->'receipts',revision=revision+1
  where student_id=(w->>'student_id')::uuid and lesson_code=l.code;
 end loop;
 return result;
end$$;
revoke all on function public.mtm_btvn_answer_correction(text,jsonb) from public,anon,authenticated,mtm_btvn_publisher;
grant execute on function public.mtm_btvn_answer_correction(text,jsonb) to service_role;

-- Every normal submission shares the lesson lock, including first work creation.
-- A stale browser must reload; it cannot restore an old key/score after correction.
alter function public.mtm_btvn_commit(text,text,integer,jsonb,jsonb) rename to mtm_btvn_commit_before_answer_correction;
revoke all on function public.mtm_btvn_commit_before_answer_correction(text,text,integer,jsonb,jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
create function public.mtm_btvn_commit(p_session text,p_lesson text,p_revision integer,p_drafts jsonb,p_receipts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e jsonb;d jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('btvn-answer-correction:'||p_lesson,0));
 select exam into e from mtm_hw_private.btvn_lessons where code=p_lesson;
 for d in select value from jsonb_array_elements(p_drafts) loop
  if d->'examVersionHash' is distinct from e->'versionHash'
   or (e->>'rubricVersion'='MTM-EQUAL-QUESTION-10-20261016-v1' and d->'answerKeyVersion' is distinct from e->'answerKeyVersion')
  then raise exception 'CORRECTION_RELOAD_REQUIRED';end if;
 end loop;
 return public.mtm_btvn_commit_before_answer_correction(p_session,p_lesson,p_revision,p_drafts,p_receipts);
end$$;
revoke all on function public.mtm_btvn_commit(text,text,integer,jsonb,jsonb) from public,anon,authenticated,mtm_btvn_publisher;
grant execute on function public.mtm_btvn_commit(text,text,integer,jsonb,jsonb) to service_role;
commit;
