begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

create function public.mtm_staff_student_work(p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 v_student uuid;
 v_class uuid;
 v_date date;
 v_code text=p->>'assignment_id';
 v_kind text=p->>'work_kind';
 v_mode text=p->>'mode';
 v_history jsonb;
 v_row jsonb;
 v_assignment jsonb;
 v_lesson mtm_hw_private.btvn_lessons;
 v_exam jsonb;
 v_attempts jsonb;
 v_result jsonb;
 v_keys constant text[]=array['student_id','class_id','lesson_date','assignment_id','work_kind','mode'];
begin
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>4096 then
  raise exception 'STAFF_STUDENT_WORK_FILTER_INVALID' using errcode='22023';
 end if;
 if exists(select 1 from unnest(v_keys) k where jsonb_typeof(p->k) is distinct from 'string')
  or exists(select 1 from jsonb_object_keys(p) k where k<>all(v_keys))
  or p->>'student_id' !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  or p->>'class_id' !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  or p->>'lesson_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  or char_length(v_code) not between 1 and 200 or v_code<>btrim(v_code)
  or v_kind not in ('homework','exam') or v_mode not in ('session','assignment') then
  raise exception 'STAFF_STUDENT_WORK_FILTER_INVALID' using errcode='22023';
 end if;
 begin
  v_student=(p->>'student_id')::uuid;
  v_class=(p->>'class_id')::uuid;
  v_date=(p->>'lesson_date')::date;
 exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'STAFF_STUDENT_WORK_FILTER_INVALID' using errcode='22023';
 end;

 -- The history report is the authorization boundary for this student, class, date and view.
 v_history=mtm_hw_private.lesson_staff_history110(jsonb_build_object(
  'action','staff_history','student_id',v_student,'class_id',v_class,
  'from_date',v_date,'to_date',v_date,'work_kind',v_kind,'mode',v_mode,'page',1,'page_size',1));
 if v_history->'ok' is distinct from 'true'::jsonb or v_history->>'work_kind' is distinct from v_kind
  or v_history->>'mode' is distinct from v_mode or jsonb_typeof(v_history->'rows') is distinct from 'array' then
  raise exception 'STAFF_STUDENT_WORK_FORBIDDEN' using errcode='42501';
 end if;
 v_row=v_history->'rows'->0;
 if jsonb_array_length(v_history->'rows')<>1 or v_row->>'student_id' is distinct from v_student::text
  or v_row->>'class_id' is distinct from v_class::text or v_row->>'lesson_date' is distinct from p->>'lesson_date'
  or jsonb_typeof(v_row->'homework') is distinct from 'array' then
  raise exception 'STAFF_STUDENT_WORK_FORBIDDEN' using errcode='42501';
 end if;
 select case when count(*)=1 then jsonb_agg(item)->0 end into v_assignment
 from jsonb_array_elements(v_row->'homework') item
 where item->>'assignment_id'=v_code and item->>'work_kind'=v_kind;
 if v_assignment->>'lesson_date' is null then
  raise exception 'STAFF_STUDENT_WORK_FORBIDDEN' using errcode='42501';
 end if;

 select l.* into v_lesson from mtm_hw_private.btvn_lessons l
 where l.code=v_code and not l.is_test
  and ((v_kind='homework' and l.kind='btvn') or (v_kind='exam' and l.kind in ('kiem-tra','kiem-tra-thang')));
 -- A homework item shown for a class session can be from the previous assignment day.
 if not found or mtm_hw_private.lesson_history_day109(v_lesson.material,v_row->>'class_name')::text is distinct from v_assignment->>'lesson_date' then
  raise exception 'STAFF_STUDENT_WORK_FORBIDDEN' using errcode='42501';
 end if;

 v_result=jsonb_build_object('student_id',p->>'student_id','class_id',p->>'class_id','lesson_date',p->>'lesson_date',
  'assignment_id',v_code,'work_kind',v_kind,'mode',v_mode,'title',coalesce(nullif(btrim(v_assignment->>'title'),''),v_code));
 if v_kind='exam' and (coalesce(v_assignment->>'status','') not in ('submitted','pending','not_submitted') or v_lesson.opens_at is null
  or v_lesson.closes_at is null or not isfinite(v_lesson.opens_at) or not isfinite(v_lesson.closes_at)
  or v_lesson.closes_at<=v_lesson.opens_at or current_timestamp<v_lesson.closes_at) then
  return v_result||jsonb_build_object('status','not_released','attempts','[]'::jsonb);
 end if;

 select case when c.paper=2 then s.exam
         when c.paper=1 or s.lesson_code is null then v_lesson.exam end into v_exam
 from (values (v_code)) selected(code)
 left join mtm_hw_private.btvn_paper_choices c on c.student_id=v_student and c.lesson_code=selected.code
 left join mtm_hw_private.btvn_second_papers s on s.lesson_code=selected.code;
 if jsonb_typeof(v_exam->'questions') is distinct from 'array' or nullif(v_exam->>'id','') is null
  or coalesce(v_exam->>'versionHash','') !~ '^[0-9a-f]{64}$' or nullif(v_exam->>'rubricVersion','') is null then
  v_exam=null;
 elsif jsonb_array_length(v_exam->'questions')>300 or exists(select 1 from jsonb_array_elements(v_exam->'questions') q
              group by q->>'id' having count(*)<>1 or nullif(q->>'id','') is null) then
  v_exam=null;
 end if;

 with work as materialized (
  select w.receipts,w.drafts from mtm_hw_private.btvn_work w where w.student_id=v_student and w.lesson_code=v_code
 ), receipts as (
  select r->>'attemptId' attempt_id, count(*) over(partition by r->>'attemptId') id_count,
   case when jsonb_typeof(r->'submittedAt')='number' then (r->>'submittedAt')::numeric end submitted_at,
   case when jsonb_typeof(r->'attemptNumber')='number' and r->>'attemptNumber' ~ '^([1-9][0-9]?|100)$'
    then (r->>'attemptNumber')::integer end recorded_number
  from work cross join lateral jsonb_array_elements(work.receipts) r
  where jsonb_typeof(r->'attemptId')='string' and char_length(r->>'attemptId') between 1 and 160
 ), submitted as materialized (
  select *, row_number() over(order by submitted_at,attempt_id) submitted_order
  from receipts where submitted_at between 1 and 253402300799999 and submitted_at=trunc(submitted_at) and id_count=1
 ), official as materialized (
  select o.receipt->>'attemptId' attempt_id,o.submitted_at,
   case when count(*)=1 and max(o.score) between 0 and 10 then max(o.score) end score
  from mtm_hw_private.btvn_official_receipts_real100(v_student,v_code) o
  group by o.receipt->>'attemptId',o.submitted_at
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'number',coalesce(s.recorded_number,s.submitted_order),'submitted_at',s.submitted_at,'score',o.score,
  'answers',coalesce(a.answers,'[]'::jsonb)) order by s.submitted_order),'[]'::jsonb) into v_attempts
 from submitted s
 left join official o using(attempt_id,submitted_at)
 left join lateral (
  select case when count(*)=1 then jsonb_agg(d)->0 end body
  from work cross join lateral jsonb_array_elements(work.drafts) d
  where d->'attemptId'=to_jsonb(s.attempt_id) and d->'submittedAt'=to_jsonb(s.submitted_at)
 ) snapshot on true
 left join lateral (
  select jsonb_agg(jsonb_build_object('number',q.number,'label','Câu '||q.number,'answer',
    case q.body->>'kind'
     when 'mc' then case when r.response in ('"A"','"B"','"C"','"D"') then r.response end
     when 'tf' then case when jsonb_array_length(tf.response)=4 and not exists(
      select 1 from jsonb_array_elements(tf.response) x where jsonb_typeof(x) not in ('boolean','null')) then tf.response end
     when 'short' then case when jsonb_typeof(r.response)='string' and char_length(r.response#>>'{}')<=500 then r.response end
     when 'self' then case when jsonb_typeof(r.response)='string' and char_length(r.response#>>'{}')<=500 then r.response end
    end) order by q.number) answers
  from jsonb_array_elements(v_exam->'questions') with ordinality q(body,number)
  cross join lateral (select snapshot.body->'answers'->(q.body->>'id') response) r
  cross join lateral (select case when jsonb_typeof(r.response)='array' then r.response else '[]'::jsonb end response) tf
  where snapshot.body->'version'='1'::jsonb and jsonb_typeof(snapshot.body->'answers')='object'
   and snapshot.body->>'examId'=v_exam->>'id' and snapshot.body->>'examVersionHash'=v_exam->>'versionHash'
   and snapshot.body->>'rubricVersion'=v_exam->>'rubricVersion'
 ) a on true;

 return v_result||jsonb_build_object('status',case when jsonb_array_length(v_attempts)>0 then 'ready' else 'not_submitted' end,'attempts',v_attempts);
end$$;

do $acl$
declare f pg_proc; g record; role_name text;
begin
 select * into strict f from pg_proc where oid='public.mtm_staff_student_work(jsonb)'::regprocedure;
 for g in select distinct grantee from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) where grantee<>f.proowner loop
  role_name:=case when g.grantee=0 then 'public' else quote_ident((select rolname from pg_roles where oid=g.grantee)) end;
  execute format('revoke all on function public.mtm_staff_student_work(jsonb) from %s',role_name);
 end loop;
end$acl$;
grant execute on function public.mtm_staff_student_work(jsonb) to authenticated;
commit;
