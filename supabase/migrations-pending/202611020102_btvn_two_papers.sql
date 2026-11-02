-- Review-only. Two private papers share ONE lesson/work/deadline/rank entry.
-- Never regrade an existing receipt. Apply only with the separately approved release.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table mtm_hw_private.lesson_uploads add column if not exists homework2_path text;
alter table mtm_hw_private.lesson_uploads add column if not exists answer2_path text;
alter table mtm_hw_private.lesson_uploads add column if not exists answer2_text text;
alter table mtm_hw_private.lesson_uploads add column if not exists task_scope2 text;
create or replace function mtm_hw_private.lesson_payload_safe(p jsonb,u mtm_hw_private.lesson_uploads) returns boolean
language sql immutable set search_path='' as $$
 select p is not null and p::text !~* 'mtm-lesson-private'
 and not jsonb_path_exists(p,'$.**.answer_path') and not jsonb_path_exists(p,'$.**.answer_text')
 and not jsonb_path_exists(p,'$.**.answer2_path') and not jsonb_path_exists(p,'$.**.answer2_text')
 and not jsonb_path_exists(p,'$.**.homework_path') and not jsonb_path_exists(p,'$.**.homework2_path') and not jsonb_path_exists(p,'$.**.handout_path')
 and not exists(select 1 from unnest(array[u.homework_path,u.answer_path,u.homework2_path,u.answer2_path,u.handout_path]) path where nullif(path,'') is not null and position(path in p::text)>0)
$$;
create table if not exists mtm_hw_private.lesson_upload_paper2_steps(
 upload_id uuid not null references mtm_hw_private.lesson_uploads(id),step int not null check(step between 1 and 6),
 status text not null check(status in ('cho','dang','xong','loi')),detail text not null default '',updated_at timestamptz not null default clock_timestamp(),primary key(upload_id,step));
create table if not exists mtm_hw_private.btvn_second_papers(
 lesson_code text primary key references mtm_hw_private.btvn_lessons(code),exam jsonb not null,assets jsonb not null,
 source_version text not null check(source_version ~ '^[a-f0-9]{64}$'),verification jsonb not null);
create table if not exists mtm_hw_private.btvn_paper_choices(
 student_id uuid not null references mtm_hw_private.students(id),lesson_code text not null references mtm_hw_private.btvn_lessons(code),
 paper int not null check(paper in (1,2)),chosen_at timestamptz not null default clock_timestamp(),primary key(student_id,lesson_code));
create table if not exists mtm_hw_private.btvn_publication_warnings(lesson_code text primary key references mtm_hw_private.btvn_lessons(code),warnings jsonb not null);
alter table mtm_hw_private.btvn_publication_warnings enable row level security;
revoke all on mtm_hw_private.btvn_publication_warnings from public,anon,authenticated,service_role,mtm_btvn_publisher;
alter table mtm_hw_private.lesson_upload_paper2_steps enable row level security;
alter table mtm_hw_private.btvn_second_papers enable row level security;
alter table mtm_hw_private.btvn_paper_choices enable row level security;
revoke all on mtm_hw_private.lesson_upload_paper2_steps,mtm_hw_private.btvn_second_papers,mtm_hw_private.btvn_paper_choices from public,anon,authenticated,service_role,mtm_btvn_publisher;

do $$begin if to_regprocedure('public.mtm_lesson_upload_api_before_two_papers(jsonb)') is null then
 alter function public.mtm_lesson_upload_api(jsonb) rename to mtm_lesson_upload_api_before_two_papers;
end if;end$$;
create or replace function public.mtm_lesson_upload_api(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text=p->>'action';r jsonb;u mtm_hw_private.lesson_uploads;path text;v jsonb;cp jsonb;st int;stat text;
begin
 if a='worker_web_precedence' then
  if coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
  if p->>'enabled' not in ('true','false') or p->>'enabled' is null then raise exception 'INVALID_PRECEDENCE';end if;
  if p->>'enabled'='true' and not exists(select 1 from mtm_hw_private.lesson_uploads where not is_test and finished_at is not null and checkpoint ? 'publish_receipts') then raise exception 'LIVE_WEB_RECEIPT_REQUIRED';end if;
  update mtm_hw_private.lesson_upload_settings set web_precedence=(p->>'enabled')::boolean where singleton;
  return jsonb_build_object('ok',true,'MTM_LESSON_WEB_PRECEDENCE',p->>'enabled');
 end if;
 if a='create' then
  if nullif(p->>'homework2_path','') is not null then
   if nullif(p->>'homework_path','') is null then raise exception 'PAPER_ONE_REQUIRED';end if;
   if nullif(p->>'answer2_path','') is null and nullif(btrim(p->>'answer2_text'),'') is null then raise exception 'PAPER_TWO_ANSWERS_REQUIRED';end if;
  elsif coalesce(nullif(p->>'answer2_path',''),nullif(btrim(p->>'answer2_text'),''),nullif(btrim(p->>'task_scope2'),'')) is not null then raise exception 'PAPER_TWO_REQUIRED';end if;
  if length(coalesce(p->>'task_scope2',''))>300 or length(coalesce(p->>'answer2_text',''))>20000 then raise exception 'INVALID_TEXT';end if;
  if nullif(p->>'answer2_path','') is not null and nullif(btrim(p->>'answer2_text'),'') is not null then raise exception 'AMBIGUOUS_ANSWER_SOURCE';end if;
  foreach path in array array[p->>'homework2_path',p->>'answer2_path'] loop
   if nullif(path,'') is not null and (not public.mtm_lesson_storage_access(path,true) or not exists(select 1 from storage.objects o where o.bucket_id='mtm-lesson-private' and o.name=path and o.metadata->>'mimetype' in ('application/pdf','image/jpeg','image/png') and (o.metadata->>'size')::bigint between 1 and 20971520)) then raise exception 'PRIVATE_FILE_NOT_UPLOADED';end if;
  end loop;
  r=public.mtm_lesson_upload_api_before_two_papers(p);
  update mtm_hw_private.lesson_uploads set homework2_path=nullif(p->>'homework2_path',''),answer2_path=nullif(p->>'answer2_path',''),answer2_text=nullif(btrim(p->>'answer2_text'),''),task_scope2=nullif(btrim(p->>'task_scope2'),'') where id=(r->>'upload_id')::uuid;
  if nullif(p->>'homework2_path','') is not null then
   insert into mtm_hw_private.lesson_upload_paper2_steps(upload_id,step,status) select (r->>'upload_id')::uuid,n,case when n=1 then 'xong' else 'cho' end from generate_series(1,6) n;
  end if;
  return r;
 end if;
 if a in ('dashboard','catalog') then
  r=public.mtm_lesson_upload_api_before_two_papers(p);
  select coalesce(jsonb_agg(c.card||jsonb_build_object('homework2_uploaded',x.homework2_path is not null,'answer2_uploaded',x.answer2_path is not null or x.answer2_text is not null,
   'paper2_steps',(select coalesce(jsonb_agg(jsonb_build_object('step',z.step,'status',z.status,'detail',z.detail) order by z.step),'[]') from mtm_hw_private.lesson_upload_paper2_steps z where z.upload_id=x.id),
   'warnings',case when x.homework_path is not null and x.homework2_path is null then '["Thiếu Đề 2 — HS chưa được chọn 2 đề"]'::jsonb else '[]'::jsonb end) order by c.ord),'[]') into v
   from jsonb_array_elements(r->'uploads') with ordinality c(card,ord) join mtm_hw_private.lesson_uploads x on x.id=(c.card->>'id')::uuid;
  r=jsonb_set(r,'{uploads}',v);
  select coalesce(jsonb_agg(jsonb_build_object('class_id',c.class_id,'lesson_date',c.lesson_date,'lesson_code',l.code,'warnings',w.warnings)),'[]') into v
  from jsonb_to_recordset(r->'sessions') c(class_id uuid,class_name text,lesson_date text)
   join mtm_hw_private.btvn_lessons l on c.class_id=any(l.class_ids) and l.active
    and coalesce(l.material->'classDates'->>c.class_name,l.material->>'date')=c.lesson_date
   join mtm_hw_private.btvn_publication_warnings w on w.lesson_code=l.code;
  return r||jsonb_build_object('publisher_warnings',v);
 end if;
 if a like 'worker_%' then
  -- Reuse the original authorization/lease fence BEFORE inspecting private job state.
  if a<>'worker_claim' then perform public.mtm_lesson_upload_api_before_two_papers(jsonb_build_object('action','worker_assert_current','upload_id',p->>'upload_id','claim_token',p->>'claim_token'));end if;
  select * into u from mtm_hw_private.lesson_uploads where id=(p->>'upload_id')::uuid;
  if a='worker_checkpoint' and p->>'paper'='2' then
   if u.homework2_path is null then raise exception 'PAPER_TWO_REQUIRED';end if;
   st=(p->>'step')::int;stat=p->>'status';cp=coalesce(p->'checkpoint','{}');
   if st is null or st not between 2 and 6 or stat is null or stat not in ('cho','dang','xong','loi') then raise exception 'INVALID_STEP';end if;
   if exists(select 1 from mtm_hw_private.lesson_upload_paper2_steps where upload_id=u.id and step<st and status<>'xong') then raise exception 'PRIOR_STEP_INCOMPLETE';end if;
   if st=6 and stat='xong' and not(u.checkpoint ? 'publish_receipts') then raise exception 'PUBLISH_RECEIPTS_REQUIRED';end if;
   if jsonb_typeof(cp)<>'object' or cp ? 'publish_receipts' then raise exception 'INVALID_CHECKPOINT';end if;
   update mtm_hw_private.lesson_upload_paper2_steps set status=stat,detail=left(coalesce(p->>'detail',''),1000),updated_at=clock_timestamp() where upload_id=u.id and step=st;
   update mtm_hw_private.lesson_uploads set checkpoint=checkpoint||cp where id=u.id;
   return '{"ok":true}'::jsonb;
  end if;
  if a='worker_publish' and u.homework2_path is not null then
   if exists(select 1 from mtm_hw_private.lesson_upload_paper2_steps where upload_id=u.id and step<6 and status<>'xong') then raise exception 'PAPER_TWO_INCOMPLETE';end if;
   v=p->'variant_payload';
   if v is null or not mtm_hw_private.lesson_payload_safe(v,u) or position(coalesce(u.homework2_path,'unmatchable') in v::text)>0 or (u.answer2_path is not null and position(u.answer2_path in v::text)>0)
    or v->>'lesson_key' is distinct from p->'payload'->>'lesson_key' or coalesce(v->>'source_version','') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(v->'exam'->'questions') is distinct from 'array' or jsonb_array_length(v->'exam'->'questions')=0
    or nullif(v->'exam'->>'id','') is null or v->'exam'->>'id'=p->'payload'->'exam'->>'id' or jsonb_typeof(v->'assets') is distinct from 'array'
    or coalesce(v->'verification'->>'provider','') not in ('grok','agy') then raise exception 'INVALID_SECOND_PAPER';end if;
   r=public.mtm_lesson_upload_api_before_two_papers(p);
   insert into mtm_hw_private.btvn_second_papers values(v->>'lesson_key',v->'exam',v->'assets',v->>'source_version',v->'verification') on conflict(lesson_code) do nothing;
   delete from mtm_hw_private.btvn_publication_warnings where lesson_code=v->>'lesson_key';
   return r;
  end if;
  if a='worker_finish' and exists(select 1 from mtm_hw_private.lesson_upload_paper2_steps where upload_id=u.id and status<>'xong') then raise exception 'STEPS_INCOMPLETE';end if;
 end if;
 return public.mtm_lesson_upload_api_before_two_papers(p);
end$$;
revoke all on function public.mtm_lesson_upload_api_before_two_papers(jsonb),public.mtm_lesson_upload_api(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mtm_lesson_upload_api(jsonb) to authenticated,service_role;

-- Explicit suffix selects a paper; all persisted work and reporting stay canonical.
create or replace function public.mtm_btvn_two_paper_read(p_session text,p_lesson text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare base text=p_lesson;paper int;chosen int;sid uuid;r jsonb;second mtm_hw_private.btvn_second_papers;
begin
 if exists(select 1 from mtm_hw_private.btvn_second_papers where lesson_code=regexp_replace(p_lesson,'-de-[12]$','')) then base=regexp_replace(p_lesson,'-de-[12]$','');end if;
 r=public.mtm_btvn_read_scoped100(p_session,base);
 base=r->'material'->>'lessonCode';sid=mtm_hw_private.btvn_student(p_session);
 select * into second from mtm_hw_private.btvn_second_papers where lesson_code=base;
 if second.lesson_code is null then
  return r;
 end if;
 select c.paper into chosen from mtm_hw_private.btvn_paper_choices c where c.student_id=sid and c.lesson_code=base;
 -- Attaching paper 2 never changes the paper of an existing first attempt.
 if chosen is null and (jsonb_array_length(r->'work'->'drafts')>0 or jsonb_array_length(r->'work'->'receipts')>0) then chosen=1;end if;
 paper=coalesce(case when p_lesson ~ '-de-[12]$' then right(p_lesson,1)::int end,chosen,1);
 if chosen is not null and chosen<>paper then raise exception 'PAPER_CHOICE_LOCKED' using errcode='40001';end if;
 if paper=2 and jsonb_typeof(r->'exam')='object' then r=jsonb_set(r,'{exam}',second.exam);end if;
 return r||jsonb_build_object('paperChoice',jsonb_build_object('base',base,'paper',paper,'locked',chosen is not null,'count',2),
  'material',r->'material'||jsonb_build_object('lessonCode',base||'-de-'||paper));
end$$;
do $$begin if to_regprocedure('public.mtm_btvn_commit_before_two_papers(text,text,integer,jsonb,jsonb)') is null then
 alter function public.mtm_btvn_commit(text,text,integer,jsonb,jsonb) rename to mtm_btvn_commit_before_two_papers;
end if;end$$;
create or replace function public.mtm_btvn_commit(p_session text,p_lesson text,p_revision int,p_drafts jsonb,p_receipts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare base text=regexp_replace(p_lesson,'-de-[12]$','');sid uuid;paper int;chosen int;e jsonb;d jsonb;r jsonb;
begin
 if not exists(select 1 from mtm_hw_private.btvn_second_papers where lesson_code=base) then return public.mtm_btvn_commit_before_two_papers(p_session,p_lesson,p_revision,p_drafts,p_receipts);end if;
 -- Authorization includes owner/class/test/active/cleanup gates before the choice write.
 r=public.mtm_btvn_read_scoped100(p_session,base);sid=mtm_hw_private.btvn_student(p_session);
 perform pg_advisory_xact_lock(hashtextextended('btvn-paper-choice:'||sid::text||':'||base,0));
 select c.paper into chosen from mtm_hw_private.btvn_paper_choices c where c.student_id=sid and c.lesson_code=base;
 if chosen is null and (jsonb_array_length(r->'work'->'drafts')>0 or jsonb_array_length(r->'work'->'receipts')>0) then chosen=1;end if;
 paper=coalesce(case when p_lesson ~ '-de-[12]$' then right(p_lesson,1)::int end,chosen,1);
 if chosen is not null and chosen<>paper then return '{"ok":false}'::jsonb;end if;
 if paper=2 then select exam into e from mtm_hw_private.btvn_second_papers where lesson_code=base;else e=r->'exam';end if;
 for d in select value from jsonb_array_elements(p_drafts) loop
  if d->>'examId' is distinct from e->>'id' or d->'examVersionHash' is distinct from e->'versionHash'
   or (e->>'rubricVersion'='MTM-EQUAL-QUESTION-10-20261016-v1' and d->'answerKeyVersion' is distinct from e->'answerKeyVersion') then raise exception 'CORRECTION_RELOAD_REQUIRED';end if;
 end loop;
 -- Keep every existing submission and first-start identity byte-for-byte.
 if jsonb_array_length(r->'work'->'drafts')>0 and (p_drafts->0->>'attemptId' is distinct from r->'work'->'drafts'->0->>'attemptId' or p_drafts->0->'startedAt' is distinct from r->'work'->'drafts'->0->'startedAt') then return '{"ok":false}'::jsonb;end if;
 if exists(select 1 from jsonb_array_elements(r->'work'->'receipts') old where not p_receipts @> jsonb_build_array(old)) then return '{"ok":false}'::jsonb;end if;
 -- The correction wrapper reads only canonical paper 1. Its complete version
 -- checks are performed above against the selected immutable paper instead.
 r=public.mtm_btvn_commit_before_answer_correction(p_session,base,p_revision,p_drafts,p_receipts);
 if r->>'ok'='true' and jsonb_array_length(p_drafts)>0 then insert into mtm_hw_private.btvn_paper_choices(student_id,lesson_code,paper) values(sid,base,paper) on conflict do nothing;end if;
 return r;
end$$;

do $$begin if to_regprocedure('public.mtm_btvn_assets_before_two_papers(text,text)') is null then
 alter function public.mtm_btvn_assets(text,text) rename to mtm_btvn_assets_before_two_papers;
end if;end$$;
create or replace function public.mtm_btvn_assets(p_session text,p_lesson text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;assets jsonb;base text=p_lesson;
begin
 r=public.mtm_btvn_two_paper_read(p_session,p_lesson);
 if r ? 'paperChoice' then base=r->'paperChoice'->>'base';end if;
 assets=public.mtm_btvn_assets_before_two_papers(p_session,base);
 if r->'paperChoice'->>'paper'='2' then select s.assets into assets from mtm_hw_private.btvn_second_papers s where s.lesson_code=base;end if;
 return assets;
end$$;
revoke all on function public.mtm_btvn_two_paper_read(text,text),public.mtm_btvn_commit_before_two_papers(text,text,int,jsonb,jsonb),public.mtm_btvn_commit(text,text,int,jsonb,jsonb),public.mtm_btvn_assets_before_two_papers(text,text),public.mtm_btvn_assets(text,text) from public,anon,authenticated,service_role,mtm_btvn_publisher;
grant execute on function public.mtm_btvn_two_paper_read(text,text),public.mtm_btvn_commit(text,text,int,jsonb,jsonb),public.mtm_btvn_assets(text,text) to service_role;

-- One-paper publication is permitted; missing paper 2 is a visible warning.
do $$begin if to_regprocedure('public.mtm_btvn_pipeline_before_two_papers(text,jsonb)') is null then
 alter function public.mtm_btvn_pipeline(text,jsonb) rename to mtm_btvn_pipeline_before_two_papers;
end if;end$$;
create or replace function public.mtm_btvn_pipeline(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;w jsonb;
begin
 r=public.mtm_btvn_pipeline_before_two_papers(p_action,p_payload);
 if p_action='publish' and r->>'status' in ('da_dang','already_published') and coalesce(p_payload->>'kind','btvn')='btvn' then
  w=case when exists(select 1 from mtm_hw_private.btvn_second_papers where lesson_code=p_payload->>'lesson_key') then '[]'::jsonb else '["Thiếu Đề 2 — HS chưa được chọn 2 đề"]'::jsonb end;
  insert into mtm_hw_private.btvn_publication_warnings values(p_payload->>'lesson_key',w) on conflict(lesson_code) do update set warnings=excluded.warnings;
  return r||jsonb_build_object('warnings',w);
 end if;
 return r;
end$$;
revoke all on function public.mtm_btvn_pipeline_before_two_papers(text,jsonb),public.mtm_btvn_pipeline(text,jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
grant execute on function public.mtm_btvn_pipeline(text,jsonb) to mtm_btvn_publisher;
drop policy if exists btvn_pipeline_insert on storage.objects;
create policy btvn_pipeline_insert on storage.objects for insert to mtm_btvn_publisher
 with check(bucket_id='mtm-btvn' and name ~ '^btvn/[a-z0-9-]{1,160}/[0-9a-f]{64}/[a-zA-Z0-9_/-]+\.(png|pdf)$'
  and name !~ '(^|/)\.\.(/|$)' and (public.mtm_btvn_pipeline('lookup',jsonb_build_object('lesson_key',split_part(name,'/',2)))->>'status') is distinct from 'da_dang');

-- Prepared, independently reviewed backfill through the existing publisher.
-- No teacher account, source-upload UUID, DB edit or student data is required.
create or replace function public.mtm_btvn_two_paper_publish(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<two_paper>>
declare pair boolean=p_action in ('two_paper_pair_preflight','two_paper_pair_commit');apply boolean=p_action in ('two_paper_pair_commit','two_paper_variant_commit');
 code text;first jsonb;second jsonb;proof jsonb=p_payload->'review_evidence';l mtm_hw_private.btvn_lessons;existing mtm_hw_private.btvn_second_papers;scope mtm_hw_private.btvn_publish_scope;r jsonb;provider text;
begin
 if coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 if p_action not in ('two_paper_pair_preflight','two_paper_variant_preflight','two_paper_pair_commit','two_paper_variant_commit') or p_action is null or octet_length(p_payload::text)>8388608 then raise exception 'INVALID_TWO_PAPER_ACTION';end if;
 first=p_payload->'primary';second=p_payload->'second';code=case when pair then first->>'lesson_key' else p_payload->>'lesson_key' end;
 if coalesce(code,'')!~'^[a-z0-9-]{1,150}$' or second->>'lesson_key' is distinct from code or second->>'kind' is distinct from 'btvn'
  or coalesce(second->>'source_version','')!~'^[a-f0-9]{64}$' or jsonb_typeof(second->'exam'->'questions') is distinct from 'array'
  or coalesce(jsonb_array_length(second->'exam'->'questions'),0)=0 or jsonb_typeof(second->'assets') is distinct from 'array' then raise exception 'INVALID_SECOND_PAPER';end if;
 foreach provider in array array['grok','agy'] loop
  if nullif(btrim(proof->provider->>'model'),'') is null or coalesce(proof->provider->>'receipt_hash','')!~'^[a-f0-9]{64}$' then raise exception 'TWO_PROVIDER_EVIDENCE_REQUIRED';end if;
 end loop;
 if proof->'sympy'->>'status' is distinct from 'PASS' or coalesce(proof->'sympy'->>'receipt_hash','')!~'^[a-f0-9]{64}$' then raise exception 'SYMPY_EVIDENCE_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('btvn-answer-correction:'||code,0));
 perform pg_advisory_xact_lock(hashtextextended('btvn-publish:'||code,0));
 select * into scope from mtm_hw_private.btvn_publish_scope where singleton;
 if scope.owner_id is null then raise exception 'PUBLISH_SCOPE_REQUIRED' using errcode='42501';end if;
 select * into l from mtm_hw_private.btvn_lessons bl where bl.code=two_paper.code for update;
 select * into existing from mtm_hw_private.btvn_second_papers where lesson_code=code;
 if l.code is not null and (not l.active or l.publish_status<>'da_dang' or l.kind<>'btvn' or l.owner_id<>scope.owner_id or not l.class_ids<@scope.class_ids) then raise exception 'PRIMARY_LESSON_UNAVAILABLE' using errcode='42501';end if;
 if pair then
  if first->>'lesson_key' is distinct from code or first->>'kind' is distinct from 'btvn' or first->'exam'->>'id' is not distinct from second->'exam'->>'id'
   or first->'material'->'classNames' is distinct from second->'material'->'classNames' or first->'material'->'classDates' is distinct from second->'material'->'classDates'
   or first->'material'->>'date' is distinct from second->'material'->>'date' then raise exception 'TWO_PAPER_LESSON_MISMATCH';end if;
  if l.code is not null and (l.source_version is distinct from first->>'source_version' or l.exam is distinct from first->'exam' or existing.lesson_code is null) then raise exception 'EXISTING_SINGLE_USE_VARIANT';end if;
 else
  if l.code is null or not l.active or l.publish_status<>'da_dang' or l.kind<>'btvn' or l.owner_id<>scope.owner_id or not l.class_ids<@scope.class_ids then raise exception 'PRIMARY_LESSON_UNAVAILABLE' using errcode='42501';end if;
  if l.source_version is distinct from p_payload->>'expected_source_version' then raise exception 'PRIMARY_SOURCE_CHANGED';end if;
  if l.exam->>'id' is not distinct from second->'exam'->>'id' or l.material->'classNames' is distinct from second->'material'->'classNames'
   or coalesce(l.material->'classDates','{}') is distinct from coalesce(second->'material'->'classDates','{}') or l.material->>'date' is distinct from second->'material'->>'date' then raise exception 'TWO_PAPER_LESSON_MISMATCH';end if;
 end if;
 if existing.lesson_code is not null and (existing.source_version is distinct from second->>'source_version' or existing.exam is distinct from second->'exam' or existing.assets is distinct from second->'assets') then raise exception 'SECOND_PAPER_IMMUTABLE';end if;
 if not apply then return jsonb_build_object('status','ready','lesson_key',code,'already_published',existing.lesson_code is not null,'canonical_material',case when not pair then l.material else null end);end if;
 if not pair and second->'material' is distinct from l.material then raise exception 'CANONICAL_MATERIAL_CHANGED';end if;
 if pair and l.code is null then
  r=public.mtm_btvn_pipeline('publish',first);
  if r->>'status' not in ('da_dang','already_published') then raise exception 'PUBLICATION_FAILED';end if;
 end if;
 insert into mtm_hw_private.btvn_second_papers(lesson_code,exam,assets,source_version,verification)
 values(code,second->'exam',second->'assets',second->>'source_version',second->'verification'||jsonb_build_object('review_evidence',proof)) on conflict(lesson_code) do nothing;
 delete from mtm_hw_private.btvn_publication_warnings where lesson_code=code;
 return jsonb_build_object('status',case when existing.lesson_code is not null then 'already_published' else 'da_dang' end,'lesson_key',code,'papers',2,'warnings','[]'::jsonb,'receipts_unchanged',true);
end$$;
revoke all on function public.mtm_btvn_two_paper_publish(text,jsonb) from public,anon,authenticated,mtm_btvn_publisher;
grant execute on function public.mtm_btvn_two_paper_publish(text,jsonb) to service_role;
commit;
