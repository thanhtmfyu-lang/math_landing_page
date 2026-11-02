-- DRAFT ONLY. Requires is_test100, PR146 choice101, PR148 and PR150 101/102/103.
-- Never auto-apply. All exams/keys private. No actual content in Git.
begin;
set local lock_timeout='5s';
create table if not exists mtm_hw_private.monthly_uploads(
 id uuid primary key default gen_random_uuid(),uploaded_by uuid not null references public.mtm_staff(user_id),
 class_ids uuid[] not null,class_names jsonb not null,class_dates jsonb not null,teacher_keys jsonb not null,
 exam_date date not null,opens_at timestamptz not null,closes_at timestamptz not null,
 title text not null check(length(title) between 1 and 200),papers jsonb not null check(jsonb_array_length(papers)=2),
 version int not null,status text not null default 'waiting' check(status in ('waiting','reviewing','blocked','ready')),
 detail text not null default '',is_test boolean not null default false,created_at timestamptz not null default clock_timestamp(),
 claim_token uuid,lease_until timestamptz,attempts int not null default 0,checkpoint jsonb not null default '{}',
 check(closes_at>opens_at),check(cardinality(class_ids) between 1 and 8));
create index if not exists monthly_upload_queue on mtm_hw_private.monthly_uploads(created_at) where status in ('waiting','reviewing');
alter table mtm_hw_private.monthly_uploads enable row level security;
revoke all on mtm_hw_private.monthly_uploads from public,anon,authenticated,service_role,mtm_btvn_publisher;
create table if not exists mtm_hw_private.monthly_publish_capability(txid bigint primary key,upload_id uuid not null,claim_token uuid not null);
alter table mtm_hw_private.monthly_publish_capability enable row level security;
revoke all on mtm_hw_private.monthly_publish_capability from public,anon,authenticated,service_role,mtm_btvn_publisher;
create or replace function mtm_hw_private.monthly_current(u mtm_hw_private.monthly_uploads) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from mtm_hw_private.monthly_uploads n where n.id<>u.id and n.is_test=u.is_test and n.exam_date=u.exam_date and n.class_ids&&u.class_ids and n.version>u.version)
$$;
create or replace function mtm_hw_private.monthly_base(u mtm_hw_private.monthly_uploads) returns text
language sql immutable set search_path='' as $$select 'thi-thang-'||to_char(u.exam_date,'YYYY-MM')||'-web-'||replace(u.id::text,'-','')$$;
create or replace function mtm_hw_private.monthly_test_scope() returns trigger
language plpgsql security definer set search_path='' as $$
declare u mtm_hw_private.monthly_uploads;c mtm_hw_private.monthly_publish_capability;
begin
 select * into c from mtm_hw_private.monthly_publish_capability where txid=txid_current();
 if c.upload_id is not null then
  select * into u from mtm_hw_private.monthly_uploads where id=c.upload_id;
  if u.claim_token is distinct from c.claim_token or u.lease_until<=clock_timestamp() or not mtm_hw_private.monthly_current(u)
   or new.code not in (mtm_hw_private.monthly_base(u)||'-thi-ma-1',mtm_hw_private.monthly_base(u)||'-thi-ma-2') then raise exception 'MONTHLY_SCOPE_MISMATCH';end if;
  new.is_test=u.is_test;
 end if;return new;
end$$;
drop trigger if exists a_monthly_test_scope on mtm_hw_private.btvn_lessons;
create trigger a_monthly_test_scope before insert on mtm_hw_private.btvn_lessons for each row execute function mtm_hw_private.monthly_test_scope();

create or replace function mtm_hw_private.monthly_api(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text=p->>'action';s public.mtm_staff;u mtm_hw_private.monthly_uploads;v int;ci uuid;ids uuid[];d date;
 names jsonb='{}';teachers jsonb='{}';dates jsonb='{}';paper jsonb;path text;tk text;label text;
 o timestamptz;close_time timestamptz;qa boolean=coalesce((p->>'is_test')::boolean,false);out jsonb;receipts jsonb='[]';payload jsonb;proof jsonb;i int;
begin
 if p is null or octet_length(p::text)>8388608 then raise exception 'INVALID_MONTHLY_PAYLOAD';end if;
 if a like 'monthly_worker_essay_%' then return mtm_hw_private.monthly_essay_api(p);end if;
 if a like 'monthly_worker_%' then
  if coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
  if a='monthly_worker_claim' then
   if length(coalesce(p->>'worker_id','')) not between 1 and 100 then raise exception 'WORKER_ID_REQUIRED';end if;
   update mtm_hw_private.monthly_uploads x set status='blocked',detail='Hết lượt xử lý hoặc chưa đạt kiểm trước giờ mở. Quản lý kiểm tra.' where x.is_test=qa and mtm_hw_private.monthly_current(x) and x.status in ('waiting','reviewing') and (x.opens_at<=clock_timestamp() or (x.attempts>=3 and x.lease_until<clock_timestamp()));
   select * into u from mtm_hw_private.monthly_uploads x where x.status in ('waiting','reviewing') and x.is_test=qa and x.attempts<3 and x.opens_at>clock_timestamp() and (x.lease_until is null or x.lease_until<clock_timestamp()) and mtm_hw_private.monthly_current(x) order by x.created_at for update skip locked limit 1;
   if u.id is null then return '{"job":null}';end if;
   update mtm_hw_private.monthly_uploads set status='reviewing',claim_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '15 minutes',attempts=attempts+1 where id=u.id returning * into u;
   return jsonb_build_object('job',to_jsonb(u)||jsonb_build_object('lesson_code',mtm_hw_private.monthly_base(u)));
  end if;
  select * into u from mtm_hw_private.monthly_uploads where id=(p->>'upload_id')::uuid for update;
  if u.id is null or u.claim_token is null or u.claim_token is distinct from (p->>'claim_token')::uuid or u.lease_until is null or u.lease_until<=clock_timestamp() or not mtm_hw_private.monthly_current(u) then raise exception 'STALE_MONTHLY_LEASE' using errcode='40001';end if;
  if a='monthly_worker_assert' then return '{"ok":true}';end if;
  if a='monthly_worker_source' then
   i=(p->>'paper')::int;if i not in (1,2) or i is null then raise exception 'INVALID_PAPER';end if;
   path=u.papers->(i-1)->>(case p->>'kind' when 'homework' then 'homework_path' when 'answer' then 'answer_path' end);
   if path is null then raise exception 'SOURCE_NOT_PRESENT';end if;
   return jsonb_build_object('bucket','mtm-lesson-private','path',path);
  end if;
  if a='monthly_worker_asset' then
   path=p->>'path';if path is null or path like '%..%' or path!~('^btvn/'||mtm_hw_private.monthly_base(u)||'-thi-ma-[12]/[a-f0-9]{64}/[a-zA-Z0-9_/-]+\.(png|pdf)$') then raise exception 'ASSET_OUTSIDE_UPLOAD';end if;return '{"ok":true}';
  end if;
  if a='monthly_worker_checkpoint' then
   if u.status='ready' or jsonb_typeof(p->'checkpoint') is distinct from 'object' then raise exception 'IMMUTABLE_MONTHLY';end if;
   update mtm_hw_private.monthly_uploads set checkpoint=checkpoint||(p->'checkpoint'),lease_until=clock_timestamp()+interval '15 minutes' where id=u.id;return '{"ok":true}';
  end if;
  if a='monthly_worker_wait' then
   update mtm_hw_private.monthly_uploads set lease_until=clock_timestamp()+interval '110 seconds',attempts=greatest(0,attempts-1),detail='Chờ đủ hai AI và SymPy kiểm đáp án.' where id=u.id and status='reviewing';return '{"ok":true}';
  end if;
  if a='monthly_worker_block' then
   update mtm_hw_private.monthly_uploads set status='blocked',detail='Đáp án hoặc biên nhận kiểm chưa đạt. Bài giữ chờ; quản lý kiểm tra.',lease_until=null where id=u.id and status<>'ready';return '{"ok":true}';
  end if;
  if a<>'monthly_worker_publish' then raise exception 'UNKNOWN_MONTHLY_ACTION';end if;
  if u.status='ready' then return jsonb_build_object('ok',true,'already_applied',true,'receipts',u.checkpoint->'receipts');end if;
  if clock_timestamp()>=u.opens_at then raise exception 'MONTHLY_REVIEW_TOO_LATE';end if;
  if jsonb_array_length(p->'payloads') is distinct from 2 then raise exception 'TWO_PAPERS_REQUIRED';end if;
  for i in 1..2 loop
   payload=p->'payloads'->(i-1);proof=payload->'monthly_verification';
   if payload->>'lesson_key' is distinct from mtm_hw_private.monthly_base(u)||'-thi-ma-'||i or payload->>'kind' is distinct from 'kiem-tra-thang'
    or (payload->>'opensAt')::timestamptz is distinct from u.opens_at or (payload->>'closesAt')::timestamptz is distinct from u.closes_at
    or payload->'material'->'classDates' is distinct from (select jsonb_object_agg(value,u.exam_date) from jsonb_each_text(u.class_names))
    or (select array_agg(x order by x) from jsonb_array_elements_text(payload->'material'->'classNames') x) is distinct from (select array_agg(value order by value) from jsonb_each_text(u.class_names)) then raise exception 'MONTHLY_PAYLOAD_SCOPE';end if;
   if proof->>'sourceVersion' is distinct from payload->>'source_version' or proof->>'passed' is distinct from 'true'
    or proof->'sympy'->>'passed' is distinct from 'true' or proof->'sympy'->>'sourceVersion' is distinct from payload->>'source_version' or coalesce(proof->'sympy'->>'receipt_hash','')!~'^[a-f0-9]{64}$'
    or jsonb_array_length(proof->'reviews') is distinct from 2
    or (select array_agg(x->>'provider' order by x->>'provider') from jsonb_array_elements(proof->'reviews') x) is distinct from array['agy','grok']
    or exists(select 1 from jsonb_array_elements(proof->'reviews') x where coalesce(x->>'receipt_hash','')!~'^[a-f0-9]{64}$' or nullif(x->>'model','') is null or x->>'sourceVersion' is distinct from payload->>'source_version') then raise exception 'MONTHLY_MATH_REVIEW_REQUIRED';end if;
   if payload::text ~ 'mtm-lesson-private' or jsonb_path_exists(payload,'$.**.answer_text') or jsonb_path_exists(payload,'$.**.answer_path') then raise exception 'PRIVATE_SOURCE_IN_PUBLISH';end if;
  end loop;
  insert into mtm_hw_private.monthly_publish_capability values(txid_current(),u.id,u.claim_token);
  for i in 1..2 loop
   out=public.mtm_btvn_pipeline('publish',p->'payloads'->(i-1));
   if coalesce(out->>'status','') not in ('da_dang','already_published') then raise exception 'MONTHLY_PUBLICATION_FAILED';end if;receipts=receipts||jsonb_build_array(out);
  end loop;
  delete from mtm_hw_private.monthly_publish_capability where txid=txid_current();
  update mtm_hw_private.monthly_uploads set status='ready',detail='',checkpoint=checkpoint||jsonb_build_object('receipts',receipts) where id=u.id;
  return jsonb_build_object('ok',true,'receipts',receipts);
 end if;
 select * into s from public.mtm_staff where user_id=auth.uid() and active and not must_change_password;
 if s.user_id is null then raise exception 'STAFF_REQUIRED' using errcode='42501';end if;
 if qa and s.role not in ('ql','admin') then raise exception 'MANAGER_REQUIRED' using errcode='42501';end if;
 d=coalesce((p->>'exam_date')::date,(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date);
 if d not between (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date-31 and (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date+62 then raise exception 'EXAM_DATE_OUTSIDE_WINDOW';end if;
 if a='monthly_dashboard' then
  with allowed as (select distinct class_id,class_name,teacher_key from mtm_hw_private.lesson_sessions(d-7,d+7) where s.role in ('ql','admin') or teacher_key=s.teacher_key),
  latest as (select x.* from mtm_hw_private.monthly_uploads x where x.is_test=qa and date_trunc('month',x.exam_date)=date_trunc('month',d) and mtm_hw_private.monthly_current(x) and (s.role in ('ql','admin') or not exists(select 1 from jsonb_each_text(x.teacher_keys) t where t.value<>s.teacher_key))),
  scheduled as (select distinct c.class_id from allowed c where exists(select 1 from latest x where c.class_id=any(x.class_ids)) or exists(select 1 from mtm_hw_private.btvn_lessons l where l.active and l.kind='kiem-tra-thang' and l.is_test=qa and c.class_id=any(l.class_ids) and date_trunc('month',l.opens_at at time zone 'Asia/Ho_Chi_Minh')=date_trunc('month',d)))
  select jsonb_build_object('staff',public.mtm_lesson_staff(),'classes',coalesce((select jsonb_agg(to_jsonb(c)) from allowed c),'[]'),
   'uploads',coalesce((select jsonb_agg(to_jsonb(x)-'papers'-'checkpoint'-'claim_token'-'lease_until'-'uploaded_by' order by x.created_at desc) from latest x),'[]'),
   'scheduled_classes',(select count(*) from scheduled),
   'ready_classes',(select count(*) from scheduled c where exists(select 1 from latest x where x.status='ready' and c.class_id=any(x.class_ids))),
   'blocked_classes',(select count(*) from scheduled c where exists(select 1 from latest x where x.status='blocked' and c.class_id=any(x.class_ids)))) into out;return out;
 end if;
 if a<>'monthly_create' then raise exception 'UNKNOWN_MONTHLY_ACTION';end if;
 o=(p->>'opens_at')::timestamptz;close_time=(p->>'closes_at')::timestamptz;
 if o is null or close_time is null or o<=clock_timestamp() or close_time<=o or (o at time zone 'Asia/Ho_Chi_Minh')::date<>d or (close_time at time zone 'Asia/Ho_Chi_Minh')::date<>d then raise exception 'INVALID_MONTHLY_WINDOW';end if;
 select array_agg(distinct x::uuid order by x::uuid) into ids from jsonb_array_elements_text(p->'class_ids') x;
 if cardinality(ids) is null or cardinality(ids)>8 or cardinality(ids)<>jsonb_array_length(p->'class_ids') then raise exception 'INVALID_CLASSES';end if;
 foreach ci in array ids loop
  perform pg_advisory_xact_lock(hashtextextended('monthly-upload:'||ci::text||':'||d::text||':'||qa::text,0));
  select min(x.teacher_key),min(x.class_name) into tk,label from mtm_hw_private.lesson_sessions(d-7,d+7) x where x.class_id=ci having count(distinct x.teacher_key)=1;
  if tk is null or (s.role='gv' and tk is distinct from s.teacher_key) then raise exception 'CLASS_TEACHER_REQUIRED' using errcode='42501';end if;
  names=names||jsonb_build_object(ci::text,label);teachers=teachers||jsonb_build_object(ci::text,tk);dates=dates||jsonb_build_object(ci::text,d);
 end loop;
 if nullif(btrim(p->>'title'),'') is null or length(p->>'title')>200 or jsonb_array_length(p->'papers') is distinct from 2 then raise exception 'TWO_PAPERS_REQUIRED';end if;
 for i in 0..1 loop
  paper=p->'papers'->i;
  if paper->>'essay_max_score' is not null and ((paper->>'essay_max_score')::numeric not between 0.25 and 10 or nullif(btrim(paper->>'essay_rubric'),'') is null or length(paper->>'essay_rubric')>16000) then raise exception 'ESSAY_RUBRIC_REQUIRED';end if;
  if (paper->>'code')::int is distinct from 101+i or nullif(paper->>'homework_path','') is null or (nullif(paper->>'answer_path','') is null and nullif(btrim(paper->>'answer_text'),'') is null)
   or (nullif(paper->>'answer_path','') is not null and nullif(btrim(paper->>'answer_text'),'') is not null) or length(coalesce(paper->>'answer_text',''))>16000 then raise exception 'PAPER_AND_OWN_KEY_REQUIRED';end if;
  foreach path in array array[paper->>'homework_path',nullif(paper->>'answer_path','')] loop
   if path is not null and (not public.mtm_lesson_storage_access(path,true) or not exists(select 1 from storage.objects where bucket_id='mtm-lesson-private' and name=path and metadata->>'mimetype'='application/pdf' and (metadata->>'size')::bigint between 1 and 20971520)) then raise exception 'PRIVATE_SOURCE_REQUIRED';end if;
  end loop;
 end loop;
 if exists(select 1 from mtm_hw_private.monthly_uploads x where x.exam_date=d and x.is_test=qa and x.class_ids&&ids and x.status='ready') then raise exception 'PUBLISHED_MONTHLY_IMMUTABLE';end if;
 if exists(select 1 from mtm_hw_private.monthly_uploads x where x.exam_date=d and x.is_test=qa and x.class_ids&&ids and x.class_ids<>ids and mtm_hw_private.monthly_current(x)) then raise exception 'MONTHLY_CLASS_GROUP_CHANGED';end if;
 if exists(select 1 from mtm_hw_private.btvn_lessons l cross join unnest(ids) legacy_class where l.active and l.kind='kiem-tra-thang' and l.is_test=qa and legacy_class=any(l.class_ids) and coalesce(l.material->'classDates'->>(names->>legacy_class::text),l.material->>'date')=d::text) then raise exception 'EXISTING_MONTHLY_REQUIRES_DEDICATED_REVIEW';end if;
 select coalesce(max(x.version),0)+1 into v from mtm_hw_private.monthly_uploads x where x.exam_date=d and x.is_test=qa and x.class_ids&&ids;
 insert into mtm_hw_private.monthly_uploads(uploaded_by,class_ids,class_names,class_dates,teacher_keys,exam_date,opens_at,closes_at,title,papers,version,is_test)
 values(s.user_id,ids,names,dates,teachers,d,o,close_time,btrim(p->>'title'),p->'papers',v,qa) returning * into u;
 return jsonb_build_object('ok',true,'upload_id',u.id,'version',v);
end$$;
do $$begin if to_regprocedure('public.mtm_lesson_upload_api_before_monthly(jsonb)') is null then alter function public.mtm_lesson_upload_api(jsonb) rename to mtm_lesson_upload_api_before_monthly;end if;end$$;
create or replace function public.mtm_lesson_upload_api(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if p->>'action' like 'monthly_%' then return mtm_hw_private.monthly_api(p);end if;return public.mtm_lesson_upload_api_before_monthly(p);
end$$;
do $$begin if to_regprocedure('public.mtm_lesson_upload_gateway_before_monthly(jsonb)') is null then alter function public.mtm_lesson_upload_gateway(jsonb) rename to mtm_lesson_upload_gateway_before_monthly;end if;end$$;
create or replace function public.mtm_lesson_upload_gateway(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if p->>'action' like 'monthly_worker_%' then return mtm_hw_private.monthly_api(p);end if;return public.mtm_lesson_upload_gateway_before_monthly(p);
end$$;
revoke all on function mtm_hw_private.monthly_api(jsonb),mtm_hw_private.monthly_current(mtm_hw_private.monthly_uploads),mtm_hw_private.monthly_base(mtm_hw_private.monthly_uploads),mtm_hw_private.monthly_test_scope() from public,anon,authenticated,service_role,mtm_btvn_publisher;
revoke all on function public.mtm_lesson_upload_api_before_monthly(jsonb),public.mtm_lesson_upload_gateway_before_monthly(jsonb),public.mtm_lesson_upload_api(jsonb),public.mtm_lesson_upload_gateway(jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
grant execute on function public.mtm_lesson_upload_api(jsonb) to authenticated,service_role;
grant execute on function public.mtm_lesson_upload_gateway(jsonb) to service_role;

-- Photo grading yields private proposals only. paper_scores remains the authoritative parent score.
create table if not exists mtm_hw_private.monthly_essay_reviews(
 id uuid primary key default gen_random_uuid(),upload_id uuid not null references mtm_hw_private.monthly_uploads(id),
 student_id uuid not null,lesson_code text not null,attempt_id text not null,paper int not null check(paper in (1,2)),
 status text not null default 'waiting' check(status in ('waiting','reviewing','reviewed','blocked')),
 claim_token uuid,lease_until timestamptz,result jsonb,created_at timestamptz not null default clock_timestamp(),
 unique(student_id,lesson_code,attempt_id));
alter table mtm_hw_private.monthly_essay_reviews enable row level security;
revoke all on mtm_hw_private.monthly_essay_reviews from public,anon,authenticated,service_role,mtm_btvn_publisher;
create or replace function mtm_hw_private.monthly_essay_api(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text=p->>'action';r mtm_hw_private.monthly_essay_reviews;u mtm_hw_private.monthly_uploads;images jsonb;path text;v_result jsonb;g jsonb;max_score numeric;providers text[];first_score numeric;second_score numeric;
begin
 if coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 if a='monthly_worker_essay_claim' then
  insert into mtm_hw_private.monthly_essay_reviews(upload_id,student_id,lesson_code,attempt_id,paper)
  select mu.id,w.student_id,w.lesson_code,w.drafts->0->>'attemptId',right(w.lesson_code,1)::int
  from mtm_hw_private.monthly_uploads mu join mtm_hw_private.btvn_work w on w.lesson_code in (mtm_hw_private.monthly_base(mu)||'-thi-ma-1',mtm_hw_private.monthly_base(mu)||'-thi-ma-2')
  where mu.status='ready' and mu.is_test=coalesce((p->>'is_test')::boolean,false) and clock_timestamp()>=mu.closes_at+interval '15 minutes'
  and w.drafts->0->>'attemptId' is not null and exists(select 1 from mtm_hw_private.tu_luan_images i where i.student_id=w.student_id and i.lesson_code=w.lesson_code and i.attempt_id=w.drafts->0->>'attemptId' and i.received_at is not null)
  on conflict do nothing;
  select e.* into r from mtm_hw_private.monthly_essay_reviews e join mtm_hw_private.monthly_uploads x on x.id=e.upload_id where e.status in ('waiting','reviewing') and x.is_test=coalesce((p->>'is_test')::boolean,false) and (e.lease_until is null or e.lease_until<clock_timestamp()) order by e.created_at for update of e skip locked limit 1;
  if r.id is null then return '{"job":null}';end if;
  update mtm_hw_private.monthly_essay_reviews set status='reviewing',claim_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '15 minutes' where id=r.id returning * into r;
  select * into u from mtm_hw_private.monthly_uploads where id=r.upload_id;
  select jsonb_agg(jsonb_build_object('sha256',i.sha256,'page',i.page_number) order by i.page_number) into images from mtm_hw_private.tu_luan_images i where i.student_id=r.student_id and i.lesson_code=r.lesson_code and i.attempt_id=r.attempt_id and i.received_at is not null;
  return jsonb_build_object('job',jsonb_build_object('id',r.id,'claim_token',r.claim_token,'images',images,'rubric',u.papers->(r.paper-1)->>'essay_rubric','max_score',u.papers->(r.paper-1)->'essay_max_score',
   'questions',(select l.exam->'questions' from mtm_hw_private.btvn_lessons l where l.code=r.lesson_code)));
 end if;
 select * into r from mtm_hw_private.monthly_essay_reviews where id=(p->>'upload_id')::uuid for update;
 if r.id is null or r.claim_token is null or r.claim_token is distinct from (p->>'claim_token')::uuid or r.lease_until<=clock_timestamp() then raise exception 'STALE_ESSAY_LEASE';end if;
 if a='monthly_worker_essay_source' then
  select i.storage_path into path from mtm_hw_private.tu_luan_images i where i.student_id=r.student_id and i.lesson_code=r.lesson_code and i.attempt_id=r.attempt_id and i.sha256=p->>'sha256' and i.received_at is not null;
  if path is null then raise exception 'ESSAY_IMAGE_REQUIRED';end if;return jsonb_build_object('bucket','mtm-tu-luan','path',path);
 end if;
 if a='monthly_worker_essay_wait' then update mtm_hw_private.monthly_essay_reviews set lease_until=clock_timestamp()+interval '110 seconds' where id=r.id and status='reviewing';return '{"ok":true}';end if;
 if a='monthly_worker_essay_block' then update mtm_hw_private.monthly_essay_reviews set status='blocked',lease_until=null where id=r.id and status<>'reviewed';return '{"ok":true}';end if;
 if a<>'monthly_worker_essay_result' then raise exception 'UNKNOWN_ESSAY_ACTION';end if;
 if r.status='reviewed' then return '{"ok":true,"already_applied":true}';end if;
 v_result=p->'result';select * into u from mtm_hw_private.monthly_uploads where id=r.upload_id;max_score=(u.papers->(r.paper-1)->>'essay_max_score')::numeric;
 if jsonb_array_length(v_result->'reviews') not in (2,3) or max_score is null then raise exception 'ESSAY_RECEIPTS_REQUIRED';end if;
 select array_agg(x->>'provider' order by ord) into providers from jsonb_array_elements(v_result->'reviews') with ordinality t(x,ord);
 if providers[1:2] is distinct from array['grok','agy'] or (cardinality(providers)=3 and providers[3] not in ('codex','claude')) then raise exception 'ESSAY_PROVIDERS_REQUIRED';end if;
 first_score=(v_result->'reviews'->0->>'score')::numeric;second_score=(v_result->'reviews'->1->>'score')::numeric;
 if abs(first_score-second_score)>0.25 and cardinality(providers)<>3 then raise exception 'THIRD_ESSAY_REVIEW_REQUIRED';end if;
 for g in select value from jsonb_array_elements(v_result->'reviews') loop
  if jsonb_typeof(g->'score') is distinct from 'number' or coalesce(g->>'receipt_hash','')!~'^[a-f0-9]{64}$' or nullif(g->>'request_id','') is null or nullif(g->>'model','') is null or g->>'images_seen' is distinct from 'true'
   or g->>'submission_hash' is distinct from v_result->>'submission_hash' or g->>'rubric_hash' is distinct from v_result->>'rubric_hash' or (g->>'max_score')::numeric is distinct from max_score
   or (g->>'score')::numeric not between 0 and max_score then raise exception 'ESSAY_RECEIPTS_REQUIRED';end if;
 end loop;
 update mtm_hw_private.monthly_essay_reviews set status='reviewed',result=v_result||jsonb_build_object('paper_scores_unchanged',true,'requires_manager_confirmation',true) where id=r.id;
 return '{"ok":true,"paper_scores_unchanged":true}';
end$$;
revoke all on function mtm_hw_private.monthly_essay_api(jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
-- The generic publisher cannot bypass the monthly 2-AI + CAS gateway.
do $$begin if to_regprocedure('public.mtm_btvn_pipeline_before_monthly_upload(text,jsonb)') is null then alter function public.mtm_btvn_pipeline(text,jsonb) rename to mtm_btvn_pipeline_before_monthly_upload;end if;end$$;
create or replace function public.mtm_btvn_pipeline(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_action in ('publish','update_material','error') and p_payload->>'lesson_key' ~ '^thi-thang-[0-9]{4}-[0-9]{2}-web-[0-9a-f]{32}-thi-ma-[12]$' and not exists(
  select 1 from mtm_hw_private.monthly_publish_capability cap join mtm_hw_private.monthly_uploads u on u.id=cap.upload_id
  where cap.txid=txid_current() and u.claim_token=cap.claim_token and u.lease_until>clock_timestamp() and u.opens_at>clock_timestamp() and u.status='reviewing'
  and mtm_hw_private.monthly_current(u) and p_payload->>'lesson_key' in (mtm_hw_private.monthly_base(u)||'-thi-ma-1',mtm_hw_private.monthly_base(u)||'-thi-ma-2')) then raise exception 'MONTHLY_PUBLISH_CAPABILITY_REQUIRED' using errcode='42501';end if;
 return public.mtm_btvn_pipeline_before_monthly_upload(p_action,p_payload);
end$$;
revoke all on function public.mtm_btvn_pipeline_before_monthly_upload(text,jsonb),public.mtm_btvn_pipeline(text,jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
grant execute on function public.mtm_btvn_pipeline(text,jsonb) to mtm_btvn_publisher;
commit;
