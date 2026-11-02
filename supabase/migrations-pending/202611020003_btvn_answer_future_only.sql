-- Future-only correction: no update of any existing btvn_work row.
begin;
create or replace function public.mtm_btvn_answer_correction_future_only(p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l mtm_hw_private.btvn_lessons;scope mtm_hw_private.btvn_publish_scope;
 prior mtm_hw_private.btvn_answer_corrections;binding jsonb;snapshot jsonb;newexam jsonb;
 w jsonb;oldw jsonb;d jsonb;od jsonb;r jsonb;orr jsonb;q jsonb;oq jsonb;
 i integer;j integer;attempts integer=0;changed integer=0;result jsonb;
begin
 if p_action not in ('answer_correction_future_snapshot','answer_correction_future_commit') or p_action is null
  or jsonb_typeof(p)<>'object' or octet_length(p::text)>16777216
  or coalesce(p->>'request_id','') !~ '^[A-Za-z0-9_-]{12,160}$'
  or coalesce(p->>'lesson_key','') !~ '^[a-z0-9-]{1,160}$'
  or length(coalesce(p->>'lenh_ref','')) not between 8 and 500
  or length(coalesce(p->>'approved_via','')) not between 8 and 500
  or jsonb_typeof(p->'patches') is distinct from 'array'
 then raise exception 'CORRECTION_SCHEMA';end if;
 binding=jsonb_build_object('lesson_key',p->'lesson_key','request_id',p->'request_id',
  'mode','future_only','lenh_ref',p->'lenh_ref','approved_via',p->'approved_via','patches',p->'patches');
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
 if p_action='answer_correction_future_snapshot' then return snapshot;end if;
 if snapshot is distinct from p->'expected_snapshot' then raise exception 'CORRECTION_STALE_SNAPSHOT';end if;
 if exists(select 1 from jsonb_array_elements(snapshot->'work') fw(value),
  lateral jsonb_array_elements(fw.value->'drafts') fd(value) where fd.value->'submittedAt'='null'::jsonb)
 then raise exception 'CORRECTION_ACTIVE_ATTEMPT_HOLD';end if;
 newexam=p->'new_exam';
 if jsonb_typeof(newexam) is distinct from 'object' or coalesce(p->>'plan_sha256','') !~ '^[a-f0-9]{64}$'
  or (newexam-array['questions','answerKeyVersion','versionHash']) is distinct from (l.exam-array['questions','answerKeyVersion','versionHash'])
  or jsonb_typeof(newexam->'questions') is distinct from 'array'
  or jsonb_array_length(newexam->'questions')<>jsonb_array_length(l.exam->'questions')
  or p->'updated_work' is distinct from snapshot->'work'
 then raise exception 'CORRECTION_STRUCTURE';end if;
 if newexam->>'rubricVersion'='MTM-EQUAL-QUESTION-10-20261016-v1' then
  if newexam->'versionHash' is distinct from l.exam->'versionHash' then raise exception 'CORRECTION_STRUCTURE';end if;
  if coalesce(newexam->>'answerKeyVersion','') !~ '^corrected-[a-f0-9]{64}$'
   or newexam->'answerKeyVersion' is not distinct from l.exam->'answerKeyVersion'
  then raise exception 'CORRECTION_VERSION_REQUIRED';end if;
 elsif coalesce(newexam->>'versionHash','') !~ '^[a-f0-9]{64}$' or newexam->'versionHash' is not distinct from l.exam->'versionHash'
 then raise exception 'CORRECTION_VERSION_REQUIRED';end if;
 for i in 0..jsonb_array_length(newexam->'questions')-1 loop
  q=newexam->'questions'->i;oq=l.exam->'questions'->i;
  -- Teacher/self content is immutable, even when its ID appears in patches.
  if oq->>'kind'='self' and q is distinct from oq then raise exception 'CORRECTION_MANUAL_QUESTION';end if;
  if q->'mode' is distinct from oq->'mode' then
   if oq->>'kind'<>'short' or coalesce(q->>'mode','') not in ('numeric','rational','exact')
    or not exists(select 1 from jsonb_array_elements(p->'patches') patch
     where patch->>'question_id'=q->>'id' and patch->'mode'=q->'mode'
      and jsonb_typeof(patch->'acceptedAnswers')='array' and patch->'acceptedAnswers'=q->'acceptedAnswers')
    or (q ? 'shortRule' and q->'shortRule'->>'mode' is distinct from
     case q->>'mode' when 'numeric' then 'decimal' else q->>'mode' end)
   then raise exception 'CORRECTION_SHORT_MODE';end if;
  end if;
  if (q-array['answer','acceptedAnswers','answerVerified','answerConflict','mode']) is distinct from
     (oq-array['answer','acceptedAnswers','answerVerified','answerConflict','mode'])
  then raise exception 'CORRECTION_STRUCTURE';end if;
  if q is distinct from oq and not exists(select 1 from jsonb_array_elements(p->'patches') patch where patch->>'question_id'=q->>'id')
  then raise exception 'CORRECTION_UNREQUESTED_QUESTION';end if;
  if exists(select 1 from jsonb_array_elements(p->'patches') patch where patch->>'question_id'=q->>'id'
   and ((patch ? 'answer' and patch->'answer' is distinct from q->'answer')
    or (patch ? 'acceptedAnswers' and patch->'acceptedAnswers' is distinct from q->'acceptedAnswers')
    or (patch ? 'mode' and patch->'mode' is distinct from q->'mode')))
  then raise exception 'CORRECTION_PATCH_MISMATCH';end if;
 end loop;
 result=jsonb_build_object('ok',true,'status','corrected_future_only','request_id',p->'request_id',
  'students',jsonb_array_length(snapshot->'work'),'attempts',0,'changed',0,'plan_sha256',p->'plan_sha256');
 insert into mtm_hw_private.btvn_answer_corrections(request_id,lesson_code,binding,original_snapshot,new_exam,plan_sha256,result)
 values(p->>'request_id',l.code,binding,snapshot,newexam,p->>'plan_sha256',result);
 update mtm_hw_private.btvn_lessons set exam=newexam,updated_at=clock_timestamp() where code=l.code;
 return result;
end$$;
revoke all on function public.mtm_btvn_answer_correction_future_only(text,jsonb) from public,anon,authenticated,mtm_btvn_publisher;
grant execute on function public.mtm_btvn_answer_correction_future_only(text,jsonb) to service_role;


-- Historical submitted drafts/receipts stay immutable across a future-only key change.
-- New or unfinished drafts must use the current key; a stale browser cannot submit it.
create or replace function public.mtm_btvn_commit(p_session text,p_lesson text,p_revision integer,p_drafts jsonb,p_receipts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e jsonb;d jsonb;prior_drafts jsonb='[]';prior_receipts jsonb='[]';sid uuid;future_applied boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('btvn-answer-correction:'||p_lesson,0));
 select exam into e from mtm_hw_private.btvn_lessons where code=p_lesson for share;
 if not found then return public.mtm_btvn_commit_before_answer_correction(p_session,p_lesson,p_revision,p_drafts,p_receipts);end if;
 select exists(select 1 from mtm_hw_private.btvn_answer_corrections c
  where c.lesson_code=p_lesson and c.binding->>'mode'='future_only') into future_applied;
 if not future_applied then
  -- Preserve the 0001 behavior for every lesson without a future-only correction.
  for d in select value from jsonb_array_elements(p_drafts) loop
   if d->'examVersionHash' is distinct from e->'versionHash'
    or (e->>'rubricVersion'='MTM-EQUAL-QUESTION-10-20261016-v1' and d->'answerKeyVersion' is distinct from e->'answerKeyVersion')
   then raise exception 'CORRECTION_RELOAD_REQUIRED';end if;
  end loop;
  return public.mtm_btvn_commit_before_answer_correction(p_session,p_lesson,p_revision,p_drafts,p_receipts);
 end if;
 -- Use the existing identity resolver, including its supported session fallback.
 sid=mtm_hw_private.btvn_student(p_session);
 select drafts,receipts into prior_drafts,prior_receipts from mtm_hw_private.btvn_work where student_id=sid and lesson_code=p_lesson for update;
 for d in select value from jsonb_array_elements(coalesce(prior_receipts,'[]')) loop
  -- The existing trigger restores historical late; it is not a caller-owned grade field.
  if not exists(select 1 from jsonb_array_elements(p_receipts) x where (x-'late')=(d-'late')) then raise exception 'CORRECTION_HISTORY_CHANGED';end if;
 end loop;
 for d in select value from jsonb_array_elements(coalesce(prior_drafts,'[]')) where value->'submittedAt' is not null and value->'submittedAt'<>'null'::jsonb loop
  if not exists(select 1 from jsonb_array_elements(p_drafts) x where x=d) then raise exception 'CORRECTION_HISTORY_CHANGED';end if;
 end loop;
 for d in select value from jsonb_array_elements(p_drafts) loop
  if d->'submittedAt' is not null and d->'submittedAt'<>'null'::jsonb
   and exists(select 1 from jsonb_array_elements(coalesce(prior_drafts,'[]')) x where x=d) then continue;end if;
  if d->'examVersionHash' is distinct from e->'versionHash'
   or (e->>'rubricVersion'='MTM-EQUAL-QUESTION-10-20261016-v1' and d->'answerKeyVersion' is distinct from e->'answerKeyVersion')
  then raise exception 'CORRECTION_RELOAD_REQUIRED';end if;
 end loop;
 return public.mtm_btvn_commit_before_answer_correction(p_session,p_lesson,p_revision,p_drafts,p_receipts);
end$$;
revoke all on function public.mtm_btvn_commit(text,text,integer,jsonb,jsonb) from public,anon,authenticated,mtm_btvn_publisher;
grant execute on function public.mtm_btvn_commit(text,text,integer,jsonb,jsonb) to service_role;

commit;
