-- Selected, atomic, rehearsal-only migration. Do not apply automatically.
-- Class-private assessments; existing homework/monthly-two-paper paths remain.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$begin
 if to_regprocedure('public.mtm_lesson_upload_api_before_staff109(jsonb)') is null
 or to_regclass('mtm_hw_private.lesson_publish_capability') is null
 or to_regprocedure('public.mtm_btvn_read_scoped100(text,text)') is null then raise exception 'ASSESSMENT110_SOURCE_REQUIRED';end if;
end$$;

alter table mtm_hw_private.lesson_uploads add column if not exists work_kind text not null default 'homework';
alter table mtm_hw_private.lesson_uploads add column if not exists assessment_id uuid;
alter table mtm_hw_private.lesson_uploads add column if not exists exam_type text;
alter table mtm_hw_private.lesson_uploads add column if not exists exam_opens_at timestamptz;
alter table mtm_hw_private.lesson_uploads add column if not exists exam_closes_at timestamptz;
alter table mtm_hw_private.lesson_uploads add column if not exists exam_duration_minutes integer;
do $$begin if not exists(select 1 from pg_constraint where conrelid='mtm_hw_private.lesson_uploads'::regclass and conname='lesson_assessment110_config') then
 alter table mtm_hw_private.lesson_uploads add constraint lesson_assessment110_config check(
 (work_kind='homework' and assessment_id is null and exam_type is null and exam_opens_at is null and exam_closes_at is null and exam_duration_minutes is null)
 or (work_kind='exam' and assessment_id is not null and exam_type is not null and exam_type in ('monthly','custom') and cardinality(class_ids)=1
  and exam_opens_at is not null and exam_closes_at is not null and exam_closes_at>exam_opens_at and exam_duration_minutes is not null and exam_duration_minutes between 1 and 240
  and exam_closes_at-exam_opens_at>=make_interval(mins=>exam_duration_minutes) and homework2_path is null));
end if;end$$;
create index if not exists lesson_assessment110_identity on mtm_hw_private.lesson_uploads(assessment_id,version) where work_kind='exam';
alter table mtm_hw_private.btvn_lessons add column if not exists assessment_id uuid;
alter table mtm_hw_private.btvn_lessons add column if not exists exam_type text;
alter table mtm_hw_private.btvn_lessons drop constraint if exists btvn_lessons_kind_check;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='mtm_hw_private.btvn_lessons'::regclass and conname='btvn_kind110') then
  alter table mtm_hw_private.btvn_lessons add constraint btvn_kind110 check(kind in ('btvn','kiem-tra-thang','kiem-tra'));
 end if;
 if not exists(select 1 from pg_constraint where conrelid='mtm_hw_private.btvn_lessons'::regclass and conname='btvn_assessment110') then
  alter table mtm_hw_private.btvn_lessons add constraint btvn_assessment110 check(kind<>'kiem-tra' or (assessment_id is not null and exam_type is not null and exam_type in ('monthly','custom') and cardinality(class_ids)=1));
 end if;
end$$;

create or replace function mtm_hw_private.lesson_upload_current(u mtm_hw_private.lesson_uploads) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from mtm_hw_private.lesson_uploads n where n.id<>u.id and n.is_test=u.is_test and n.work_kind=u.work_kind and
  ((u.work_kind='exam' and n.assessment_id=u.assessment_id and n.version>u.version)
   or (u.work_kind='homework' and ((n.group_key=u.group_key and n.version>u.version) or n.created_at>u.created_at)
    and n.class_ids&&u.class_ids and exists(select 1 from unnest(n.class_ids)c where c=any(u.class_ids) and n.class_dates->>c::text=u.class_dates->>c::text))))
$$;
create or replace function mtm_hw_private.lesson_protocol110(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$begin
 if not(p ? 'worker_protocol') then return false;end if;
 if jsonb_typeof(p->'worker_protocol') is distinct from 'number' or p->>'worker_protocol'<>'110' then raise exception 'UNSUPPORTED_WORKER_PROTOCOL';end if;
 return true;
end$$;
create or replace function mtm_hw_private.lesson_exam_window110(day date,starts text,ends text,config jsonb default '{}') returns jsonb
language plpgsql stable set search_path='' as $$
declare o timestamptz;c timestamptz;minutes integer;
begin
 if jsonb_typeof(config) is distinct from 'object' or exists(select 1 from jsonb_object_keys(config) k where k not in ('opens_at','closes_at','duration_minutes')) then raise exception 'INVALID_EXAM_CONFIG';end if;
 o=(day+starts::time) at time zone 'Asia/Ho_Chi_Minh';c=(day+ends::time) at time zone 'Asia/Ho_Chi_Minh';
 if not(config ? 'closes_at') and ends::time<starts::time then c=c+interval '1 day';end if;
 if config ? 'opens_at' then
  if jsonb_typeof(config->'opens_at') is distinct from 'string' or config->>'opens_at'!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?([Zz]|[+-]\d{2}:\d{2})$' then raise exception 'INVALID_EXAM_CONFIG';end if;
  o=(config->>'opens_at')::timestamptz;
 end if;
 if config ? 'closes_at' then
  if jsonb_typeof(config->'closes_at') is distinct from 'string' or config->>'closes_at'!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?([Zz]|[+-]\d{2}:\d{2})$' then raise exception 'INVALID_EXAM_CONFIG';end if;
  c=(config->>'closes_at')::timestamptz;
 end if;
 if o is null or c is null or not isfinite(o) or not isfinite(c) or c<=o then raise exception 'INVALID_EXAM_WINDOW';end if;
 minutes=least(120,floor(extract(epoch from c-o)/60)::int);
 if config ? 'duration_minutes' then
  if jsonb_typeof(config->'duration_minutes') is distinct from 'number' or config->>'duration_minutes'!~'^[0-9]{1,3}$' then raise exception 'INVALID_EXAM_DURATION';end if;
  minutes=(config->>'duration_minutes')::int;
 end if;
 if minutes not between 1 and 240 or c-o<make_interval(mins=>minutes) then raise exception 'INVALID_EXAM_DURATION';end if;
 return jsonb_build_object('opens_at',o,'closes_at',c,'duration_minutes',minutes);
exception when invalid_datetime_format or datetime_field_overflow then raise exception 'INVALID_EXAM_CONFIG';
end$$;

-- Only the original homework lane may use its original transparent20min policy.
do $$begin if to_regprocedure('mtm_hw_private.lesson_teacher_pending_before_assessment110(mtm_hw_private.lesson_uploads,jsonb,text,integer)') is null then
 alter function mtm_hw_private.lesson_teacher_pending_allowed(mtm_hw_private.lesson_uploads,jsonb,text,integer) rename to lesson_teacher_pending_before_assessment110;
end if;end$$;
create or replace function mtm_hw_private.lesson_teacher_pending_allowed(u mtm_hw_private.lesson_uploads,proof jsonb,source text,paper int) returns boolean
language sql stable security definer set search_path='' as $$
 select u.work_kind='homework' and mtm_hw_private.lesson_teacher_pending_before_assessment110(u,proof,source,paper)
$$;

-- New route preserves the old publisher's scope/immutability/asset/proof gates,
-- adding a typed in-transaction job capability. No direct staff/public publisher.
create or replace function mtm_hw_private.lesson_exam_publish110(p jsonb,u mtm_hw_private.lesson_uploads) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope mtm_hw_private.btvn_publish_scope;old mtm_hw_private.btvn_lessons;m jsonb=p->'material';e jsonb=p->'exam';proof jsonb=p->'verification';
 v_code text=p->>'lesson_key';source text=p->>'source_version';v_label text;asset jsonb;
begin
 if u.work_kind='exam' and u.assessment_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('assessment110:'||u.assessment_id::text,0));
  select x.* into u from mtm_hw_private.lesson_uploads x where x.id=u.id;
 end if;
 if u.work_kind<>'exam' or u.claim_token is null or u.finished_at is not null or u.lease_until<=clock_timestamp() or not mtm_hw_private.lesson_upload_current(u)
  or not exists(select 1 from mtm_hw_private.lesson_publish_capability c where c.txid=txid_current() and c.upload_id=u.id and c.claim_token=u.claim_token) then raise exception 'ASSESSMENT_PUBLISH_CAPABILITY_REQUIRED' using errcode='42501';end if;
 select * into scope from mtm_hw_private.btvn_publish_scope where singleton;
 v_label=u.class_names->>u.class_ids[1]::text;
 if scope.owner_id is null or not(u.class_ids<@scope.class_ids) or cardinality(u.class_ids)<>1 or not exists(select 1 from mtm_hw_private.classes c where c.id=u.class_ids[1] and c.active and c.owner_id=scope.owner_id and c.label=v_label) then raise exception 'ASSESSMENT_CLASS_SCOPE_CHANGED' using errcode='42501';end if;
 if not mtm_hw_private.lesson_payload_safe(p,u) or octet_length(p::text)>1048576 then raise exception 'PRIVATE_SOURCE_IN_PUBLISH';end if;
 if p->>'kind' is distinct from 'kiem-tra' or p->>'assessmentId' is distinct from u.assessment_id::text or p->>'examType' is distinct from u.exam_type
  or (p->>'opensAt')::timestamptz is distinct from u.exam_opens_at or (p->>'closesAt')::timestamptz is distinct from u.exam_closes_at
  or v_code is distinct from 'web-'||replace(u.id::text,'-','') or source is null or source!~'^[a-f0-9]{64}$' then raise exception 'ASSESSMENT_CONFIG_MISMATCH';end if;
 if jsonb_typeof(m) is distinct from 'object' or m->>'lessonCode' is distinct from v_code or m->>'title' is distinct from u.title or e->>'title' is distinct from u.title
  or m->'classNames' is distinct from jsonb_build_array(v_label) or m->'classDates' is distinct from jsonb_build_object(v_label,u.class_dates->>u.class_ids[1]::text)
  or m->>'date' is distinct from u.lesson_date::text then raise exception 'ASSESSMENT_CLASS_TITLE_MISMATCH';end if;
 if jsonb_typeof(e) is distinct from 'object' or e->'durationMinutes' is distinct from to_jsonb(u.exam_duration_minutes) or jsonb_typeof(e->'questions') is distinct from 'array' or jsonb_array_length(e->'questions') not between 1 and 300
  or proof->'validator' is distinct from 'true'::jsonb or proof->'independent' is distinct from 'true'::jsonb
  or coalesce(proof->>'provider','') not in ('grok','agy') or nullif(btrim(proof->>'model'),'') is null or coalesce(proof->>'receipt_hash','')!~'^[a-f0-9]{64}$'
  or jsonb_typeof(p->'assets') is distinct from 'array' or jsonb_array_length(p->'assets') not between 1 and 500 then raise exception 'ASSESSMENT_VERIFICATION_REQUIRED';end if;
 if exists(select 1 from mtm_hw_private.lesson_review_requests q where q.upload_id=u.id and q.source_version is distinct from source) then raise exception 'REVIEW_SOURCE_CHANGED';end if;
 for asset in select value from jsonb_array_elements(p->'assets') loop
  if asset ? 'data_base64' or coalesce(asset->>'sha256','')!~'^[a-f0-9]{64}$' or coalesce(asset->>'storage_path','')!~('^btvn/'||v_code||'/'||source||'/[a-zA-Z0-9_/-]+\.(png|pdf)$')
   or position('..' in asset->>'storage_path')>0 or not exists(select 1 from storage.objects o where o.bucket_id='mtm-btvn' and o.name=asset->>'storage_path' and o.metadata->>'mimetype'=asset->>'content_type' and (o.metadata->>'size')::bigint=(asset->>'bytes')::bigint)
   then raise exception 'ASSESSMENT_ASSET_MANIFEST_INVALID';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('btvn-publish:'||v_code,0));
 select * into old from mtm_hw_private.btvn_lessons where btvn_lessons.code=v_code;
 if old.code is not null and (old.owner_id<>scope.owner_id or old.is_test is distinct from u.is_test or old.assessment_id is distinct from u.assessment_id) then raise exception 'ASSESSMENT_PUBLICATION_SCOPE_CHANGED';end if;
 if old.publish_status='da_dang' then
  if old.source_version is distinct from source or old.exam is distinct from e or old.opens_at is distinct from u.exam_opens_at or old.closes_at is distinct from u.exam_closes_at then raise exception 'ASSESSMENT_PUBLISHED_VERSION_CHANGED';end if;
  return '{"status":"already_published"}';
 end if;
 -- The prior source stays available while AI builds this replacement. A
 -- student may have started it after create; serialize with student commit and
 -- recheck NOW rather than relying on the earlier create-time observation.
 if exists(select 1 from mtm_hw_private.btvn_lessons l join mtm_hw_private.btvn_work w on w.lesson_code=l.code
  where l.assessment_id=u.assessment_id and l.code<>v_code and (jsonb_array_length(w.drafts)>0 or jsonb_array_length(w.receipts)>0)) then raise exception 'ASSESSMENT_ALREADY_STARTED';end if;
 m=m||jsonb_build_object('kind','kiem-tra','workKind','exam','examType',u.exam_type,'assessmentId',u.assessment_id,'title',u.title,
  'opensAt',extract(epoch from u.exam_opens_at)*1000,'closesAt',extract(epoch from u.exam_closes_at)*1000,'durationMinutes',u.exam_duration_minutes,'maxAttempts',1,
  'classOpensAt',jsonb_build_object(v_label,u.exam_opens_at));
 insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status,source_version,assets,verification,is_test,kind,opens_at,closes_at,assessment_id,exam_type)
 values(v_code,scope.owner_id,u.class_ids,m,e,true,'da_dang',source,p->'assets',proof,u.is_test,'kiem-tra',u.exam_opens_at,u.exam_closes_at,u.assessment_id,u.exam_type)
 on conflict(code) do update set material=excluded.material,exam=excluded.exam,active=true,publish_status='da_dang',source_version=excluded.source_version,assets=excluded.assets,verification=excluded.verification,
  kind=excluded.kind,opens_at=excluded.opens_at,closes_at=excluded.closes_at,exam_type=excluded.exam_type,updated_at=clock_timestamp();
 update mtm_hw_private.btvn_lessons set active=false,publish_status='cho_duyet',updated_at=clock_timestamp() where assessment_id=u.assessment_id and kind='kiem-tra' and code<>('web-'||replace(u.id::text,'-','')) and active;
 return '{"status":"da_dang"}';
end$$;

do $$begin if to_regprocedure('public.mtm_btvn_pipeline_before_assessment110(text,jsonb)') is null then alter function public.mtm_btvn_pipeline(text,jsonb) rename to mtm_btvn_pipeline_before_assessment110;end if;end$$;
create or replace function public.mtm_btvn_pipeline(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u mtm_hw_private.lesson_uploads;
begin
 if p_action='publish' then
  select x.* into u from mtm_hw_private.lesson_publish_capability c join mtm_hw_private.lesson_uploads x on x.id=c.upload_id and x.claim_token=c.claim_token where c.txid=txid_current();
  if u.work_kind='exam' and p_payload->>'kind' is distinct from 'kiem-tra' then raise exception 'ASSESSMENT_CONFIG_MISMATCH';end if;
  if p_payload->>'kind'='kiem-tra' then
   if u.id is null then raise exception 'ASSESSMENT_PUBLISH_CAPABILITY_REQUIRED' using errcode='42501';end if;
   return mtm_hw_private.lesson_exam_publish110(p_payload,u);
  end if;
 end if;
 return public.mtm_btvn_pipeline_before_assessment110(p_action,p_payload);
end$$;

create or replace function mtm_hw_private.lesson_exam_create110(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.mtm_staff;s record;ids uuid[];aid uuid;rid uuid;u mtm_hw_private.lesson_uploads;prior mtm_hw_private.lesson_uploads;
 qa boolean=coalesce((p->>'is_test')::boolean,false);day date;today date=(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
 request_hash text;win jsonb;path text;v int;title text;task text;g text;
begin
 select * into actor from public.mtm_staff where user_id=auth.uid() and active;
 if actor.user_id is null then raise exception 'STAFF_REQUIRED' using errcode='42501';end if;
 if actor.must_change_password then raise exception 'PASSWORD_CHANGE_REQUIRED' using errcode='42501';end if;
 if qa and actor.role not in ('ql','admin') then raise exception 'MANAGER_REQUIRED' using errcode='42501';end if;
 if p->>'work_kind' is distinct from 'exam' or jsonb_typeof(p->'assessment_id') is distinct from 'string' or coalesce(p->>'assessment_id','')!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  or p->>'exam_type' is null or p->>'exam_type' not in ('monthly','custom') then raise exception 'INVALID_ASSESSMENT_IDENTITY';end if;
 if jsonb_typeof(p->'client_request_id') is distinct from 'string' or coalesce(p->>'client_request_id','')!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'INVALID_CLIENT_REQUEST_ID';end if;
 aid=(p->>'assessment_id')::uuid;rid=(p->>'client_request_id')::uuid;
 request_hash=encode(sha256(convert_to((p-'client_request_id')::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('lesson-request107:'||actor.user_id::text||':'||rid::text,0));
 select * into u from mtm_hw_private.lesson_uploads where uploaded_by=actor.user_id and client_request_id=rid;
 if u.id is not null then
  if u.client_request_hash is distinct from request_hash then raise exception 'CLIENT_REQUEST_CONFLICT';end if;
  return jsonb_build_object('ok',true,'already_received',true,'upload_id',u.id,'version',u.version,'work_kind','exam','assessment_id',u.assessment_id,'exam_type',u.exam_type,'exam_config',jsonb_build_object('opens_at',u.exam_opens_at,'closes_at',u.exam_closes_at,'duration_minutes',u.exam_duration_minutes));
 end if;
 if jsonb_typeof(p->'class_ids') is distinct from 'array' or jsonb_array_length(p->'class_ids')<>1 then raise exception 'EXAM_REQUIRES_ONE_CLASS';end if;
 select array_agg(x::uuid) into ids from jsonb_array_elements_text(p->'class_ids') x;
 day=(p->>'lesson_date')::date;if day is null or day not between today-31 and today+31 then raise exception 'LESSON_DATE_OUTSIDE_WINDOW';end if;
 if (select count(*) from mtm_hw_private.lesson_sessions(day,day) x where x.class_id=ids[1] and x.teacher_key=p->>'teacher_key')<>1 then raise exception 'SCHEDULE_OR_TEACHER_UNVERIFIED';end if;
 select * into s from mtm_hw_private.lesson_sessions(day,day) x where x.class_id=ids[1] and x.teacher_key=p->>'teacher_key';
 if actor.role='gv' and s.teacher_key is distinct from actor.teacher_key then raise exception 'OTHER_TEACHER' using errcode='42501';end if;
 if actor.role='gv' and nullif(p->>'on_behalf_of','') is not null then raise exception 'MANAGER_REQUIRED';end if;
 if nullif(p->>'on_behalf_of','') is not null and p->>'on_behalf_of'<>s.teacher_key then raise exception 'BEHALF_MISMATCH';end if;
 if coalesce(nullif(p->>'homework2_path',''),nullif(p->>'answer2_path',''),nullif(btrim(p->>'answer2_text'),''),nullif(btrim(p->>'task_scope2'),'')) is not null then raise exception 'EXAM_SINGLE_PAPER_REQUIRED';end if;
 if coalesce(nullif(p->>'handout_path',''),nullif(p->>'video_url','')) is not null or p ? 'due_at_overrides' or (p ? 'due_at_by_class' and p->'due_at_by_class'<>'{}'::jsonb) then raise exception 'EXAM_PRIMARY_SOURCES_ONLY';end if;
 title=btrim(p->>'title');task=coalesce(nullif(btrim(p->>'task_scope'),''),'Toàn bộ đề');
 if title is null or length(title) not between 1 and 200 or length(task)>300 or length(coalesce(p->>'answer_text',''))>20000 then raise exception 'INVALID_TEXT';end if;
 if nullif(p->>'homework_path','') is null or coalesce(nullif(p->>'answer_path',''),nullif(btrim(p->>'answer_text'),'')) is null then raise exception 'EXAM_SOURCES_REQUIRED';end if;
 if p->>'homework_path'=p->>'answer_path' then raise exception 'EXAM_SOURCE_FILES_MUST_DIFFER';end if;
 if nullif(p->>'answer_path','') is not null and nullif(btrim(p->>'answer_text'),'') is not null then raise exception 'AMBIGUOUS_ANSWER_SOURCE';end if;
 foreach path in array array[p->>'homework_path',p->>'answer_path'] loop
  if path is not null and (not public.mtm_lesson_storage_access(path,true) or not exists(select 1 from storage.objects o where o.bucket_id='mtm-lesson-private' and o.name=path and o.metadata->>'mimetype' in ('application/pdf','image/jpeg','image/png') and (o.metadata->>'size')::bigint between 1 and 20971520)) then raise exception 'PRIVATE_FILE_NOT_UPLOADED';end if;
 end loop;
 win=mtm_hw_private.lesson_exam_window110(day,s.start_time,s.end_time,coalesce(p->'exam_config','{}'));
 perform pg_advisory_xact_lock(hashtextextended('assessment110:'||aid::text,0));
 select * into prior from mtm_hw_private.lesson_uploads where assessment_id=aid order by version desc limit 1;
 if prior.id is not null then
  if prior.uploaded_by<>actor.user_id or prior.is_test<>qa or prior.class_ids is distinct from ids or prior.teacher_key<>s.teacher_key or prior.lesson_date<>day then raise exception 'ASSESSMENT_OWNER_SCOPE_MISMATCH' using errcode='42501';end if;
  if exists(select 1 from mtm_hw_private.btvn_lessons l join mtm_hw_private.btvn_work w on w.lesson_code=l.code where l.assessment_id=aid and (jsonb_array_length(w.drafts)>0 or jsonb_array_length(w.receipts)>0)) then raise exception 'ASSESSMENT_ALREADY_STARTED';end if;
 end if;
 v=coalesce(prior.version,0)+1;g='class-exam:'||aid::text;
 insert into mtm_hw_private.lesson_uploads(class_ids,class_dates,class_names,start_times,end_times,due_at_by_class,due_at_overrides,lesson_date,teacher_key,title,task_scope,homework_path,answer_path,answer_text,uploaded_by,on_behalf_of,version,group_key,is_test,client_request_id,client_request_hash,retry_status,work_kind,assessment_id,exam_type,exam_opens_at,exam_closes_at,exam_duration_minutes)
 values(ids,jsonb_build_object(ids[1],day),jsonb_build_object(ids[1],s.class_name),jsonb_build_object(ids[1],s.start_time),jsonb_build_object(ids[1],s.end_time),jsonb_build_object(ids[1],win->'closes_at'),jsonb_build_object(ids[1],win->'closes_at'),day,s.teacher_key,title,task,p->>'homework_path',nullif(p->>'answer_path',''),nullif(btrim(p->>'answer_text'),''),actor.user_id,case when actor.role in ('ql','admin') then s.teacher_key end,v,g,qa,rid,request_hash,'queued','exam',aid,p->>'exam_type',(win->>'opens_at')::timestamptz,(win->>'closes_at')::timestamptz,(win->>'duration_minutes')::int) returning * into u;
 insert into mtm_hw_private.lesson_upload_steps(upload_id,step,status) select u.id,n,case when n=1 then 'xong' else 'cho' end from generate_series(1,6)n;
 return jsonb_build_object('ok',true,'upload_id',u.id,'version',u.version,'work_kind','exam','assessment_id',aid,'exam_type',u.exam_type,'exam_config',win);
end$$;

do $$begin if to_regprocedure('public.mtm_lesson_upload_api_before_assessment110(jsonb)') is null then alter function public.mtm_lesson_upload_api(jsonb) rename to mtm_lesson_upload_api_before_assessment110;end if;end$$;
create or replace function public.mtm_lesson_upload_api(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text=p->>'action';r jsonb;u mtm_hw_private.lesson_uploads;protocol boolean;control mtm_hw_private.lesson_upload_automation;cards jsonb;sessions jsonb;cfg jsonb;row record;rr mtm_hw_private.lesson_review_requests;out jsonb;wk text=coalesce(p->>'work_kind','homework');
begin
 if p ? 'work_kind' and (jsonb_typeof(p->'work_kind') is distinct from 'string' or p->>'work_kind' not in ('homework','exam')) then raise exception 'INVALID_WORK_KIND';end if;
 if a='create' then
  if wk='exam' then return mtm_hw_private.lesson_exam_create110(p);end if;
  if p ?| array['assessment_id','exam_type','exam_config'] then raise exception 'EXAM_CONFIG_WITH_HOMEWORK';end if;
  return public.mtm_lesson_upload_api_before_assessment110(p-'work_kind');
 end if;
 if a='staff_history' then return mtm_hw_private.lesson_staff_history110(p);end if;
 if a in ('worker_claim','worker_pending_review') then
  if coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
  protocol=mtm_hw_private.lesson_protocol110(p);
  select * into control from mtm_hw_private.lesson_upload_automation where singleton;
  if coalesce((p->>'auto')::boolean,false) then
   if a='worker_claim' then update mtm_hw_private.lesson_upload_automation set last_seen_at=clock_timestamp(),status=case when enabled then 'waiting' else 'off' end where singleton;end if;
   if not control.enabled or control.activated_at is null then return '{"job":null,"automation_enabled":false}';end if;
  end if;
  if a='worker_pending_review' then
   select x.* into u from mtm_hw_private.lesson_uploads x join mtm_hw_private.lesson_review_requests q on q.upload_id=x.id
   where x.is_test=coalesce((p->>'is_test')::boolean,false) and (protocol or x.work_kind='homework') and x.finished_at is not null and q.completed_at is null
    and (q.last_attempt_at is null or q.last_attempt_at<clock_timestamp()-interval '90 seconds') and mtm_hw_private.lesson_upload_current(x)
    and (not coalesce((p->>'auto')::boolean,false) or x.created_at>=control.activated_at or x.retry_requested_at>=control.activated_at)
   order by coalesce(q.last_attempt_at,q.requested_at) limit 1 for update of x skip locked;
   if u.id is null then return '{"job":null}';end if;
   update mtm_hw_private.lesson_review_requests set last_attempt_at=clock_timestamp() where upload_id=u.id and completed_at is null;
   return jsonb_build_object('job',to_jsonb(u)||jsonb_build_object('lesson_code','web-'||replace(u.id::text,'-',''),'exam_config',case when u.work_kind='exam' then jsonb_build_object('opens_at',u.exam_opens_at,'closes_at',u.exam_closes_at,'duration_minutes',u.exam_duration_minutes) end,'pending_reviews',(select jsonb_agg(jsonb_build_object('paper',q.paper,'request_hash',q.request_hash,'source_version',q.source_version)) from mtm_hw_private.lesson_review_requests q where q.upload_id=u.id and q.completed_at is null)));
  end if;
  if length(coalesce(p->>'worker_id','')) not between 1 and 100 then raise exception 'WORKER_ID_REQUIRED';end if;
  select x.* into u from mtm_hw_private.lesson_uploads x where x.is_test=coalesce((p->>'is_test')::boolean,false) and (protocol or x.work_kind='homework')
   and x.finished_at is null and x.attempt_count<3 and (x.lease_until is null or x.lease_until<clock_timestamp()) and mtm_hw_private.lesson_upload_current(x)
   and coalesce(x.retry_status,'queued') in ('queued','retry_wait','running') and (x.next_retry_at is null or x.next_retry_at<=clock_timestamp())
   and (not coalesce((p->>'auto')::boolean,false) or x.created_at>=control.activated_at or x.retry_requested_at>=control.activated_at)
   and (x.homework_path is not null or not exists(select 1 from unnest(x.class_ids) ci where not exists(select 1 from mtm_hw_private.btvn_lessons l where l.active and l.kind='btvn' and l.is_test=x.is_test and ci=any(l.class_ids) and coalesce(l.material->'classDates'->>(x.class_names->>ci::text),l.material->>'date')=x.class_dates->>ci::text and l.class_ids<@x.class_ids and not exists(select 1 from unnest(l.class_ids) ci2 where coalesce(l.material->'classDates'->>(x.class_names->>ci2::text),l.material->>'date') is distinct from x.class_dates->>ci2::text))))
   and not exists(select 1 from mtm_hw_private.lesson_upload_steps z where z.upload_id=x.id and z.status='loi') and not exists(select 1 from mtm_hw_private.lesson_upload_paper2_steps z where z.upload_id=x.id and z.status='loi')
   order by x.created_at for update skip locked limit 1;
  if u.id is null then return '{"job":null}';end if;
  update mtm_hw_private.lesson_uploads set claim_token=gen_random_uuid(),worker_id=p->>'worker_id',attempt_count=attempt_count+1,retry_status='running',next_retry_at=null,lease_until=clock_timestamp()+make_interval(secs=>least(900,greatest(60,coalesce((p->>'lease_seconds')::int,600)))) where id=u.id returning * into u;
  if coalesce((p->>'auto')::boolean,false) then update mtm_hw_private.lesson_upload_automation set status='running' where singleton;end if;
  return jsonb_build_object('job',(to_jsonb(u)-'lease_until'-'finished_at')||jsonb_build_object('lesson_code','web-'||replace(u.id::text,'-',''),'exam_config',case when u.work_kind='exam' then jsonb_build_object('opens_at',u.exam_opens_at,'closes_at',u.exam_closes_at,'duration_minutes',u.exam_duration_minutes) end,'steps',(select jsonb_agg(to_jsonb(z) order by z.step) from mtm_hw_private.lesson_upload_steps z where z.upload_id=u.id)));
 end if;
 if a in ('worker_publish','worker_wait_review','worker_materials') then
  perform public.mtm_lesson_upload_api_before_assessment110(jsonb_build_object('action','worker_assert_current','upload_id',p->>'upload_id','claim_token',p->>'claim_token'));
  select * into u from mtm_hw_private.lesson_uploads where id=(p->>'upload_id')::uuid for update;
  if u.work_kind='exam' then
   if a='worker_materials' then raise exception 'EXAM_PRIMARY_SOURCES_ONLY';end if;
   if a='worker_wait_review' then
    if coalesce((p->>'paper')::int,1)<>1 or coalesce(p->>'request_hash','')!~'^[a-f0-9]{64}$' or coalesce(p->>'source_version','')!~'^[a-f0-9]{64}$' then raise exception 'INVALID_REVIEW_PAPER';end if;
    insert into mtm_hw_private.lesson_review_requests(upload_id,paper,request_hash,source_version) values(u.id,1,p->>'request_hash',p->>'source_version') on conflict do nothing;
    select * into rr from mtm_hw_private.lesson_review_requests where upload_id=u.id and paper=1;
    if rr.request_hash is distinct from p->>'request_hash' or rr.source_version is distinct from p->>'source_version' then raise exception 'REVIEW_SOURCE_CHANGED';end if;
    update mtm_hw_private.lesson_uploads set lease_until=clock_timestamp()+interval '110 seconds',attempt_count=case when review_wait_credit_token is distinct from claim_token then greatest(0,attempt_count-1) else attempt_count end,review_wait_credit_token=claim_token where id=u.id;
    return '{"allowed":false,"independent_required":true}';
   end if;
   if u.checkpoint ? 'publish_receipts' then return jsonb_build_object('ok',true,'already_applied',true,'publish_receipts',u.checkpoint->'publish_receipts');end if;
   if p ? 'variant_payload' and p->'variant_payload'<>'null'::jsonb then raise exception 'EXAM_SINGLE_PAPER_REQUIRED';end if;
   if p->'payload'->>'kind' is distinct from 'kiem-tra' then raise exception 'ASSESSMENT_CONFIG_MISMATCH';end if;
   if exists(select 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id and step<6 and status not in ('xong','canh_bao')) or not exists(select 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id and step=4 and status='xong') then raise exception 'PRIOR_STEP_INCOMPLETE';end if;
   insert into mtm_hw_private.lesson_publish_capability(txid,upload_id,claim_token) values(txid_current(),u.id,u.claim_token);
   out=public.mtm_btvn_pipeline('publish',p->'payload');
   delete from mtm_hw_private.lesson_publish_capability where txid=txid_current();
   if coalesce(out->>'status','') not in ('da_dang','already_published') then raise exception 'PUBLICATION_FAILED';end if;
   r=jsonb_build_object(u.class_ids[1]::text,jsonb_build_object('lesson_code','web-'||replace(u.id::text,'-',''),'receipt',out));
   update mtm_hw_private.lesson_uploads set checkpoint=checkpoint||jsonb_build_object('publish_receipts',r) where id=u.id;
   return jsonb_build_object('ok',true,'publish_receipts',r);
  end if;
 end if;
 if a='worker_web_precedence' and p->>'enabled'='true' and not exists(select 1 from mtm_hw_private.lesson_uploads where work_kind='homework' and not is_test and finished_at is not null and checkpoint ? 'publish_receipts') then raise exception 'LIVE_WEB_RECEIPT_REQUIRED';end if;
 r=public.mtm_lesson_upload_api_before_assessment110(p-'work_kind');
 if a in ('worker_automation_config','worker_heartbeat') then
  select * into control from mtm_hw_private.lesson_upload_automation where singleton;
  return r||jsonb_build_object('assessment_protocol',110,'runtime_readiness',true,
   'active_leases',jsonb_build_object('count',(select count(*) from mtm_hw_private.lesson_uploads where finished_at is null and lease_until>clock_timestamp()),'observed_at',clock_timestamp()),
   'old_auto_eligible',(select count(*) from mtm_hw_private.lesson_uploads x where control.enabled and control.activated_at is not null
    and not x.is_test and x.created_at<control.activated_at and x.retry_requested_at>=control.activated_at
    and x.finished_at is null and x.attempt_count<3 and (x.lease_until is null or x.lease_until<clock_timestamp()) and mtm_hw_private.lesson_upload_current(x)
    and coalesce(x.retry_status,'queued') in ('queued','retry_wait','running') and (x.next_retry_at is null or x.next_retry_at<=clock_timestamp())
    and (x.homework_path is not null or not exists(select 1 from unnest(x.class_ids) ci where not exists(select 1 from mtm_hw_private.btvn_lessons l where l.active and l.kind='btvn' and l.is_test=x.is_test and ci=any(l.class_ids) and coalesce(l.material->'classDates'->>(x.class_names->>ci::text),l.material->>'date')=x.class_dates->>ci::text and l.class_ids<@x.class_ids and not exists(select 1 from unnest(l.class_ids) ci2 where coalesce(l.material->'classDates'->>(x.class_names->>ci2::text),l.material->>'date') is distinct from x.class_dates->>ci2::text))))
    and not exists(select 1 from mtm_hw_private.lesson_upload_steps z where z.upload_id=x.id and z.status='loi')
    and not exists(select 1 from mtm_hw_private.lesson_upload_paper2_steps z where z.upload_id=x.id and z.status='loi')));
 end if;
 if a in ('dashboard','catalog') then
  select coalesce(jsonb_agg(c.card||jsonb_build_object('work_kind',x.work_kind,'assessment_id',x.assessment_id,'exam_type',x.exam_type,'exam_config',case when x.work_kind='exam' then jsonb_build_object('opens_at',x.exam_opens_at,'closes_at',x.exam_closes_at,'duration_minutes',x.exam_duration_minutes) end,'warnings',case when x.work_kind='exam' then '[]'::jsonb else coalesce(c.card->'warnings','[]') end) order by c.ord),'[]') into cards from jsonb_array_elements(r->'uploads') with ordinality c(card,ord) join mtm_hw_private.lesson_uploads x on x.id=(c.card->>'id')::uuid;
  sessions='[]';for row in select value card from jsonb_array_elements(r->'sessions') loop
   begin cfg=mtm_hw_private.lesson_exam_window110((row.card->>'lesson_date')::date,row.card->>'start_time',row.card->>'end_time');exception when others then cfg=null;end;
   sessions=sessions||jsonb_build_array(row.card||jsonb_build_object('exam_defaults',cfg));
  end loop;
  return jsonb_set(jsonb_set(r,'{uploads}',cards),'{sessions}',sessions)||jsonb_build_object('assessment_protocol',110);
 end if;
 return r;
end$$;

create or replace function mtm_hw_private.lesson_exam_meta110(l mtm_hw_private.btvn_lessons) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('kind','kiem-tra','workKind','exam','examType',l.exam_type,'assessmentId',l.assessment_id,'title',coalesce(l.material->>'title',l.exam->>'title'),
 'opensAt',extract(epoch from l.opens_at)*1000,'closesAt',extract(epoch from l.closes_at)*1000,'durationMinutes',(l.exam->>'durationMinutes')::int,'maxAttempts',1)
$$;
-- Existing BTVN attendance reconciliation must not rewrite a class exam's
-- immutable window, late flags or revisions. Leave legacy monthly behavior as-is.
do $assessment_due110$
declare src text;anchor text='and l.active loop';
begin
 src=pg_get_functiondef('public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure);
 if position('assessment110-no-homework-due' in src)=0 then
  if position(anchor in src)=0 then raise exception 'ASSESSMENT_SYNC_DUE_SOURCE_CHANGED';end if;
  execute replace(src,anchor,'and l.active and l.kind<>''kiem-tra'' /*assessment110-no-homework-due*/ loop');
 end if;
end$assessment_due110$;
do $$begin if to_regprocedure('public.mtm_btvn_set_due_before_assessment110(uuid,text,timestamptz,text)') is null then
 alter function public.mtm_btvn_set_due(uuid,text,timestamptz,text) rename to mtm_btvn_set_due_before_assessment110;
end if;end$$;
create or replace function public.mtm_btvn_set_due(p_student_id uuid,p_lesson text,p_starts_at timestamptz,p_source_identity text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare own uuid=mtm_hw_private.admin_id();
begin
 if exists(select 1 from mtm_hw_private.btvn_lessons where code=p_lesson and owner_id=own and kind='kiem-tra') then raise exception 'ASSESSMENT_NOT_HOMEWORK_DEADLINE' using errcode='42501';end if;
 return public.mtm_btvn_set_due_before_assessment110(p_student_id,p_lesson,p_starts_at,p_source_identity);
end$$;
do $$begin
 if to_regprocedure('public.mtm_btvn_read_before_assessment110(text,text)') is null then alter function public.mtm_btvn_read(text,text) rename to mtm_btvn_read_before_assessment110;end if;
 if to_regprocedure('public.mtm_btvn_commit_before_assessment110(text,text,integer,jsonb,jsonb)') is null then alter function public.mtm_btvn_commit(text,text,integer,jsonb,jsonb) rename to mtm_btvn_commit_before_assessment110;end if;
 if to_regprocedure('public.mtm_btvn_assets_before_assessment110(text,text)') is null then alter function public.mtm_btvn_assets(text,text) rename to mtm_btvn_assets_before_assessment110;end if;
end$$;
create or replace function public.mtm_btvn_read(p_session text,p_lesson text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;l mtm_hw_private.btvn_lessons;q mtm_hw_private.btvn_lessons;c record;cards jsonb='[]';card jsonb;now_at timestamptz=clock_timestamp();
begin
 r=public.mtm_btvn_read_before_assessment110(p_session,p_lesson);
 for c in select value card from jsonb_array_elements(coalesce(r->'lessons','[]')) loop
  card=c.card;select * into q from mtm_hw_private.btvn_lessons where code=card->>'lessonCode';
  if q.kind='kiem-tra' then
   card=card||mtm_hw_private.lesson_exam_meta110(q);
   if now_at<q.closes_at then card=(card-array['score','officialScore','bestScore','firstScore','lastScore','scoreBreakdown','grading','mtm'])||jsonb_build_object('bestScore',null,'solutionsAvailable',false);end if;
   if now_at<q.opens_at then card=mtm_hw_private.btvn_locked_card(card)||mtm_hw_private.lesson_exam_meta110(q)||jsonb_build_object('locked',true,'available',false,'bestScore',null,'solutionsAvailable',false);end if;
  end if;
  cards=cards||jsonb_build_array(card);
 end loop;
 r=jsonb_set(r,'{lessons}',cards);
 select * into l from mtm_hw_private.btvn_lessons where code=r->'material'->>'lessonCode';
 if l.kind='kiem-tra' then
  r=jsonb_set(r,'{material}',r->'material'||mtm_hw_private.lesson_exam_meta110(l));
  -- This RPC is service_role-only: the trusted grader retains its private key
  -- after opening. Student-facing projection is enforced by the API policy;
  -- private asset RPC below independently enforces question/solution release.
  if now_at<l.opens_at then
   r=(r-'exam'-'officialGrades')||jsonb_build_object('material',mtm_hw_private.btvn_locked_card(r->'material')||mtm_hw_private.lesson_exam_meta110(l));
   r=jsonb_set(jsonb_set(r,'{work,drafts}','[]'),'{work,receipts}','[]');
  end if;
 end if;
 return r;
end$$;

create or replace function public.mtm_btvn_commit(p_session text,p_lesson text,p_revision integer,p_drafts jsonb,p_receipts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid=mtm_hw_private.btvn_student(p_session);l mtm_hw_private.btvn_lessons;w mtm_hw_private.btvn_work;s mtm_hw_private.students;
 base text=regexp_replace(p_lesson,'-de-[12]$','');d jsonb;before jsonb;now_at timestamptz=clock_timestamp();n numeric;start_ms numeric;deadline_ms numeric;close_ms numeric;
begin
 select * into l from mtm_hw_private.btvn_lessons where code=base;
 if l.kind='kiem-tra' then
  perform pg_advisory_xact_lock(hashtextextended('assessment110:'||l.assessment_id::text,0));
  select * into l from mtm_hw_private.btvn_lessons where code=base;
  now_at=clock_timestamp();
  select * into s from mtm_hw_private.students where id=sid;
  if p_lesson<>base or not l.active or s.owner_id is distinct from l.owner_id or not(s.class_id=any(l.class_ids)) or s.is_test is distinct from l.is_test
   or exists(select 1 from mtm_test100.cleanup_jobs where student_id=sid) then raise exception 'ASSESSMENT_SESSION_SCOPE_DENIED' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('class-exam-attempt110:'||sid::text||':'||base,0));
  select * into w from mtm_hw_private.btvn_work where student_id=sid and lesson_code=base for update;
  now_at=clock_timestamp();
  if jsonb_typeof(p_drafts) is distinct from 'array' or jsonb_typeof(p_receipts) is distinct from 'array' or jsonb_array_length(p_drafts)>1 or jsonb_array_length(p_receipts)>1 then raise exception 'ASSESSMENT_ONE_ATTEMPT_ONLY' using errcode='42501';end if;
  if now_at<l.opens_at or (coalesce(jsonb_array_length(w.drafts),0)=0 and jsonb_array_length(p_drafts)>0 and now_at>=l.closes_at) then raise exception 'ASSESSMENT_WINDOW_CLOSED' using errcode='42501';end if;
  if coalesce(jsonb_array_length(w.receipts),0)>0 and (p_drafts is distinct from w.drafts or p_receipts is distinct from w.receipts) then raise exception 'ASSESSMENT_SUBMISSION_IMMUTABLE' using errcode='42501';end if;
  if jsonb_array_length(p_drafts)>0 then
   d=p_drafts->0;before=w.drafts->0;
   if d->>'examId' is distinct from l.exam->>'id' or d->'examVersionHash' is distinct from l.exam->'versionHash'
    or (l.exam->>'rubricVersion'='MTM-EQUAL-QUESTION-10-20261016-v1' and d->'answerKeyVersion' is distinct from l.exam->'answerKeyVersion')
    or jsonb_typeof(d->'startedAt') is distinct from 'number' or jsonb_typeof(d->'deadline') is distinct from 'number' then raise exception 'ASSESSMENT_DRAFT_VERSION_INVALID';end if;
   start_ms=(d->>'startedAt')::numeric;deadline_ms=(d->>'deadline')::numeric;close_ms=extract(epoch from l.closes_at)*1000;
   if start_ms<>trunc(start_ms) or deadline_ms<>trunc(deadline_ms) or deadline_ms<>start_ms+(l.exam->>'durationMinutes')::numeric*60000
    or start_ms<extract(epoch from l.opens_at)*1000 or start_ms>=close_ms or start_ms>extract(epoch from now_at)*1000+5000 then raise exception 'ASSESSMENT_EXACT_DURATION_REQUIRED';end if;
   if before is not null and (d->>'attemptId' is distinct from before->>'attemptId' or d->'startedAt' is distinct from before->'startedAt' or d->'deadline' is distinct from before->'deadline') then raise exception 'ASSESSMENT_ONE_ATTEMPT_ONLY' using errcode='42501';end if;
   if before is not null and extract(epoch from now_at)*1000>=least(deadline_ms,close_ms) and d->'answers' is distinct from before->'answers' then raise exception 'ASSESSMENT_CLOSED_ANSWERS_CHANGED' using errcode='42501';end if;
   if jsonb_array_length(p_receipts)>0 and (p_receipts->0->>'attemptId' is distinct from d->>'attemptId' or p_receipts->0->'attemptNumber' is distinct from '1'::jsonb or coalesce(d->'submittedAt','null')='null'::jsonb) then raise exception 'ASSESSMENT_RECEIPT_INVALID';end if;
  elsif jsonb_array_length(p_receipts)>0 or coalesce(jsonb_array_length(w.drafts),0)>0 then raise exception 'ASSESSMENT_ONE_ATTEMPT_ONLY' using errcode='42501';end if;
 end if;
 return public.mtm_btvn_commit_before_assessment110(p_session,p_lesson,p_revision,p_drafts,p_receipts);
end$$;

create or replace function mtm_hw_private.lesson_exam_question_paths110(e jsonb) returns text[]
language sql immutable set search_path='' as $$
 select coalesce(array_agg(distinct path) filter(where path is not null),'{}') from (
  select value#>>'{}' path from jsonb_path_query(e,'$.questions[*].sourceContent.questions[*].path')q(value)
  union all select value#>>'{}' from jsonb_path_query(e,'$.sourceInstructions[*].path')q(value)
  union all select regexp_replace(e->'sourcePdf'->>'url','^/','')
  union all select regexp_replace(e->'mtmDocuments'->'questions'->>'url','^/','')
 )x
$$;
create or replace function public.mtm_btvn_assets(p_session text,p_lesson text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid=mtm_hw_private.btvn_student(p_session);l mtm_hw_private.btvn_lessons;s mtm_hw_private.students;w mtm_hw_private.btvn_work;paths text[];out jsonb;
 base text=regexp_replace(p_lesson,'-de-[12]$','');
begin
 select * into l from mtm_hw_private.btvn_lessons where code=base;
 if l.kind='kiem-tra' then
  select * into s from mtm_hw_private.students where id=sid;
  if p_lesson<>base or not l.active or s.owner_id is distinct from l.owner_id or not(s.class_id=any(l.class_ids)) or s.is_test is distinct from l.is_test
   or clock_timestamp()<l.opens_at or exists(select 1 from mtm_test100.cleanup_jobs where student_id=sid) then raise exception 'ASSESSMENT_ASSET_SCOPE_DENIED' using errcode='42501';end if;
  select * into w from mtm_hw_private.btvn_work where student_id=sid and lesson_code=base;
  if clock_timestamp()>=l.closes_at and jsonb_array_length(coalesce(w.receipts,'[]'))>0 and exists(select 1 from jsonb_array_elements(coalesce(w.drafts,'[]')) d where d->'submittedAt' is not null and d->'submittedAt'<>'null'::jsonb) then return l.assets;end if;
  paths=mtm_hw_private.lesson_exam_question_paths110(l.exam);
  select coalesce(jsonb_agg(a),'[]') into out from jsonb_array_elements(l.assets)a where a->>'path'=any(paths);
  return out;
 end if;
 return public.mtm_btvn_assets_before_assessment110(p_session,p_lesson);
end$$;

-- Keep109 byte-for-byte; this sibling adds kind/date/release filters only.
create or replace function mtm_hw_private.lesson_staff_history110(p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare staff public.mtm_staff;center_owner uuid;today date=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date;
 df date;dt date;cid uuid;sid uuid;term text='';pg int=1;sz int=50;view_mode text=coalesce(p->>'mode','session');work_kind text=coalesce(p->>'work_kind','homework');out jsonb;
begin
 select * into staff from public.mtm_staff where user_id=auth.uid() and active;
 if staff.user_id is null then raise exception 'STAFF_REQUIRED' using errcode='42501';end if;
 if staff.must_change_password then raise exception 'PASSWORD_CHANGE_REQUIRED' using errcode='42501';end if;
 select owner_id into center_owner from mtm_hw_private.btvn_roster_scope where singleton;
 if center_owner is null then raise exception 'STAFF_REPORT_SCOPE_UNAVAILABLE' using errcode='42501';end if;
 if p is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>4096
 or exists(select 1 from jsonb_object_keys(p) k where k not in ('action','mode','from_date','to_date','class_id','student_id','name','page','page_size','work_kind'))
 or view_mode not in ('session','assignment') or work_kind not in ('homework','exam') or (p ? 'work_kind' and jsonb_typeof(p->'work_kind') is distinct from 'string') then raise exception 'STAFF_HISTORY_FILTER_INVALID' using errcode='22023';end if;
 if (p ? 'from_date' and (jsonb_typeof(p->'from_date') is distinct from 'string' or p->>'from_date'!~'^\d{4}-\d{2}-\d{2}$'))
 or (p ? 'to_date' and (jsonb_typeof(p->'to_date') is distinct from 'string' or p->>'to_date'!~'^\d{4}-\d{2}-\d{2}$')) then raise exception 'STAFF_HISTORY_RANGE' using errcode='22023';end if;
 begin
  df=coalesce((p->>'from_date')::date,today-6);dt=coalesce((p->>'to_date')::date,today);
 exception when invalid_datetime_format or datetime_field_overflow then raise exception 'STAFF_HISTORY_RANGE' using errcode='22023';end;
 if dt<df or dt-df>30 or dt>today then raise exception 'STAFF_HISTORY_RANGE' using errcode='22023';end if;
 if p ? 'page' then
  if jsonb_typeof(p->'page') is distinct from 'number' or p->>'page'!~'^[0-9]{1,6}$' then raise exception 'STAFF_HISTORY_PAGE' using errcode='22023';end if;
  pg=(p->>'page')::int;
 end if;
 if p ? 'page_size' then
  if jsonb_typeof(p->'page_size') is distinct from 'number' or p->>'page_size'!~'^[0-9]{1,3}$' then raise exception 'STAFF_HISTORY_PAGE' using errcode='22023';end if;
  sz=(p->>'page_size')::int;
 end if;
 if pg<1 or sz<1 or sz>100 then raise exception 'STAFF_HISTORY_PAGE' using errcode='22023';end if;
 if p ? 'name' then
  if jsonb_typeof(p->'name') is distinct from 'string' or length(p->>'name')>100 then raise exception 'STAFF_HISTORY_FILTER_INVALID' using errcode='22023';end if;
  term=mtm_hw_private.vn_fold(p->>'name');
 end if;
 if p ? 'class_id' then
  if jsonb_typeof(p->'class_id') is distinct from 'string' or p->>'class_id'!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'STAFF_HISTORY_FILTER_INVALID' using errcode='22023';end if;
  cid=(p->>'class_id')::uuid;
  if not exists(select 1 from mtm_hw_private.classes c where c.id=cid and c.owner_id=center_owner
   and (staff.role in ('ql','admin') or exists(select 1 from mtm_hw_private.timetable t where t.class_label=c.label and mtm_hw_private.lesson_teacher(t.teacher)=staff.teacher_key)))
   then raise exception 'STAFF_HISTORY_CLASS_DENIED' using errcode='42501';end if;
 end if;
 if p ? 'student_id' then
  if jsonb_typeof(p->'student_id') is distinct from 'string' or p->>'student_id'!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'STAFF_HISTORY_FILTER_INVALID' using errcode='22023';end if;
  sid=(p->>'student_id')::uuid;
 end if;
 with
 allowed_classes as materialized (
  select c.id,c.label,c.owner_id from mtm_hw_private.classes c where c.owner_id=center_owner
  and (staff.role in ('ql','admin') or exists(select 1 from mtm_hw_private.timetable t where t.class_label=c.label and mtm_hw_private.lesson_teacher(t.teacher)=staff.teacher_key))
 ),
 selected_classes as materialized (select * from allowed_classes where cid is null or id=cid),
 student_scope as materialized (
  select s.id,s.full_name,s.class_id,s.active from mtm_hw_private.students s
  where s.owner_id=center_owner and not s.is_test and coalesce(s.source_identity,'') not like 'qa:%'
   and not exists(select 1 from mtm_test100.cleanup_jobs j where j.student_id=s.id)
   and (sid is null or s.id=sid)
 ),
 eligible_homework as materialized (
  select st.id student_id,c.id class_id,c.label class_name,d.day,l.code assignment_id,
   coalesce(nullif(l.exam->>'title',''),nullif(l.material->>'title',''),l.code) title,case when work_kind='exam' then l.closes_at else w.expected_due_at end due_at,
   case when work_kind='exam' and current_timestamp<l.closes_at then null else best.score end score,best.submitted_at,
   l.assessment_id,case when l.kind='kiem-tra-thang' then 'monthly' else l.exam_type end exam_type,l.opens_at,l.closes_at,
   (l.exam->>'durationMinutes')::int duration_minutes,(work_kind='exam' and current_timestamp<l.closes_at) not_released
  from student_scope st cross join selected_classes c
  join mtm_hw_private.btvn_lessons l on l.owner_id=center_owner and ((work_kind='homework' and l.kind='btvn') or (work_kind='exam' and l.kind in ('kiem-tra','kiem-tra-thang'))) and not l.is_test
  cross join lateral(select mtm_hw_private.lesson_history_day109(l.material,c.label) as day) d
  left join mtm_hw_private.btvn_work w on w.student_id=st.id and w.lesson_code=l.code
  left join lateral (
   select r.score,to_timestamp((r.submitted_at/1000)::double precision) submitted_at
   from mtm_hw_private.btvn_official_receipts_real100(st.id,l.code) r
   where r.submitted_at between 0 and 253402300799999
   order by r.score desc nulls last,r.submitted_at desc limit 1
  ) best on true
  where d.day is not null and d.day<=dt
   and ((view_mode='session' and work_kind='homework') or d.day>=df)
   and (term='' or position(term in mtm_hw_private.vn_fold(st.full_name))>0 or position(term in mtm_hw_private.vn_fold(c.label))>0)
   and ((c.id=any(l.class_ids) and l.publish_status='da_dang' and mtm_hw_private.lesson_history_enrolled109(st.id,c.id,d.day))
    or (w.student_id is not null and best.submitted_at is not null and mtm_hw_private.lesson_history_enrolled109(st.id,c.id,d.day)
     and (c.id=any(l.class_ids) or (jsonb_typeof(l.material->'classNames')='array' and l.material->'classNames' ? c.label))))
 ),
 session_rows as materialized (
  select r.student_id,c.id class_id,c.label class_name,r.ngay as day,min(split_part(r.gio,'-',1)) start_time
  from mtm_hw_private.hv_ca_rows_real100(df,dt) r join selected_classes c on c.label=r.ca_lop
  join student_scope st on st.id=r.student_id
  where view_mode='session' and r.nguon_dk is distinct from 'Đã chuyển đi'
   and (term='' or position(term in mtm_hw_private.vn_fold(st.full_name))>0 or position(term in mtm_hw_private.vn_fold(c.label))>0)
  group by r.student_id,c.id,c.label,r.ngay
 ),
 assignment_rows as materialized (
  select h.student_id,h.class_id,h.class_name,h.day,null::text start_time
  from eligible_homework h where view_mode='assignment' group by h.student_id,h.class_id,h.class_name,h.day
 ),
 base_rows as (select * from session_rows union all select * from assignment_rows),
 records as materialized (
  select b.student_id,b.class_id,b.class_name,b.day,b.start_time,
   btrim(regexp_replace(st.full_name,'\s*[\(\[].*$','')) student_name,
   a.status attendance_status,a.source attendance_source,
   case when st.class_id<>b.class_id and exists(select 1 from mtm_hw_private.class_transfers t where t.student_id=st.id and t.cancelled_at is null and t.applied_at is not null and t.from_class=b.class_name and t.effective_date>b.day) then 'transferred'
    when not st.active then 'former'
    when mtm_hw_private.lesson_history_enrolled109(st.id,b.class_id,b.day) then 'active' else 'unknown' end enrollment_status,
   coalesce(hw.items,'[]') homework
  from base_rows b join student_scope st on st.id=b.student_id
  left join mtm_hw_private.attendance a on a.student_id=b.student_id and a.class_label=b.class_name and a.session_date=b.day
  left join lateral (
   select jsonb_agg(jsonb_build_object('assignment_id',h.assignment_id,'title',h.title,'lesson_date',h.day,
    'due_at',h.due_at,'score',h.score,'submitted_at',h.submitted_at,'work_kind',work_kind,'exam_type',h.exam_type,'assessment_id',h.assessment_id,'opens_at',h.opens_at,'closes_at',h.closes_at,'duration_minutes',h.duration_minutes,
    'status',case when h.not_released then 'not_released' when h.score is not null then 'submitted' when h.submitted_at is not null then 'pending' else 'not_submitted' end) order by h.assignment_id) items
   from eligible_homework h where h.student_id=b.student_id and h.class_id=b.class_id
    and h.day=case when work_kind='exam' or view_mode='assignment' then b.day else
     (select max(h2.day) from eligible_homework h2 where h2.student_id=b.student_id and h2.class_id=b.class_id and h2.day<b.day) end
  ) hw on true
 ),
 page_rows as (
  select r.* from records r order by r.day desc,r.class_name,r.start_time nulls last,mtm_hw_private.vn_fold(r.student_name),r.student_id,r.class_id
  offset (pg-1)*sz limit sz
 )
 select jsonb_build_object('ok',true,'work_kind',work_kind,'mode',view_mode,'score_basis',case when work_kind='exam' then 'assessment_date' when view_mode='session' then 'previous_assignment_day' else 'assignment_date' end,
  'score_snapshot','current_official_best',
  'authorization_basis','current_class_timetable','from_date',df,'to_date',dt,'page',pg,'page_size',sz,
  'total',(select count(*) from records),'has_more',(select count(*) from records)>pg*sz,'generated_at',current_timestamp,
  'classes',coalesce((select jsonb_agg(jsonb_build_object('class_id',c.id,'class_name',c.label) order by c.label,c.id) from allowed_classes c),'[]'),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('record_id',view_mode||':'||r.day::text||':'||r.class_id::text||':'||r.student_id::text,
   'student_id',r.student_id,'student_name',r.student_name,'display_name',r.student_name,'class_id',r.class_id,'class_name',r.class_name,
   'lesson_date',r.day,'start_time',r.start_time,'attendance_status',r.attendance_status,'attendance_source',r.attendance_source,
   'enrollment_status',r.enrollment_status,'homework',r.homework)
   order by r.day desc,r.class_name,r.start_time nulls last,mtm_hw_private.vn_fold(r.student_name),r.student_id,r.class_id) from page_rows r),'[]'),
  'summary',jsonb_build_object('rows',(select count(*) from records),'students',(select count(distinct student_id) from records),
   'attendance_recorded_rows',(select count(*) from records where attendance_status is not null),
   'attendance_unknown_rows',(select count(*) from records where attendance_status is null),
   'homework_items',(select count(*) from records cross join lateral jsonb_array_elements(homework) item),
   'graded_items',(select count(*) from records cross join lateral jsonb_array_elements(homework) item where item->'score'<>'null'::jsonb),
   'pending_items',(select count(*) from records cross join lateral jsonb_array_elements(homework) item where item->>'status'='pending'),
   'not_submitted_items',(select count(*) from records cross join lateral jsonb_array_elements(homework) item where item->>'status'='not_submitted')))
 into out;
 return out;
end$$;
revoke all on function mtm_hw_private.lesson_staff_history110(jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;

revoke all on function mtm_hw_private.lesson_protocol110(jsonb),mtm_hw_private.lesson_exam_window110(date,text,text,jsonb),mtm_hw_private.lesson_exam_create110(jsonb),
 mtm_hw_private.lesson_exam_publish110(jsonb,mtm_hw_private.lesson_uploads),mtm_hw_private.lesson_teacher_pending_before_assessment110(mtm_hw_private.lesson_uploads,jsonb,text,int),
 mtm_hw_private.lesson_teacher_pending_allowed(mtm_hw_private.lesson_uploads,jsonb,text,int),public.mtm_lesson_upload_api_before_assessment110(jsonb),public.mtm_lesson_upload_api(jsonb),public.mtm_btvn_pipeline_before_assessment110(text,jsonb),public.mtm_btvn_pipeline(text,jsonb)
 from public,anon,authenticated,service_role,mtm_btvn_publisher;
grant execute on function public.mtm_lesson_upload_api(jsonb) to authenticated,service_role;
grant execute on function public.mtm_btvn_pipeline(text,jsonb) to mtm_btvn_publisher;
revoke all on function mtm_hw_private.lesson_exam_meta110(mtm_hw_private.btvn_lessons),mtm_hw_private.lesson_exam_question_paths110(jsonb),
 public.mtm_btvn_read_before_assessment110(text,text),public.mtm_btvn_read(text,text),public.mtm_btvn_commit_before_assessment110(text,text,int,jsonb,jsonb),public.mtm_btvn_commit(text,text,int,jsonb,jsonb),public.mtm_btvn_assets_before_assessment110(text,text),public.mtm_btvn_assets(text,text)
 from public,anon,authenticated,service_role,mtm_btvn_publisher;
grant execute on function public.mtm_btvn_read(text,text),public.mtm_btvn_commit(text,text,int,jsonb,jsonb),public.mtm_btvn_assets(text,text) to service_role;
revoke all on function public.mtm_btvn_set_due_before_assessment110(uuid,text,timestamptz,text),public.mtm_btvn_set_due(uuid,text,timestamptz,text) from public,anon,authenticated,service_role,mtm_btvn_publisher;
grant execute on function public.mtm_btvn_set_due(uuid,text,timestamptz,text) to authenticated;
commit;
