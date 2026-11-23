-- Bounded, planned progress in step 2. No new web/staff permission or schedule.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table mtm_hw_private.lesson_upload_extract_progress125 (
  upload_id uuid not null references mtm_hw_private.lesson_uploads(id),
  paper integer not null check (paper in (1,2)),
  version integer not null check (version > 0),
  upload_binding_sha bytea not null check (octet_length(upload_binding_sha)=32),
  source_version text not null check (source_version ~ '^[a-f0-9]{64}$'),
  plan_hash text not null check (plan_hash ~ '^[a-f0-9]{64}$'),
  progress_count integer not null check (progress_count between 1 and 128),
  progress_hash text not null check (progress_hash ~ '^[a-f0-9]{64}$'),
  last_claim_token uuid not null,
  primary key (upload_id,paper,version)
);
alter table mtm_hw_private.lesson_upload_extract_progress125 enable row level security;
revoke all on mtm_hw_private.lesson_upload_extract_progress125
  from public,anon,authenticated,service_role,mtm_btvn_publisher;

create function mtm_hw_private.lesson_upload_extract_binding125(u mtm_hw_private.lesson_uploads)
returns bytea language sql immutable set search_path='' as $$
 select sha256(convert_to(jsonb_build_array(
   u.id,u.version,u.group_key,u.work_kind,u.is_test,u.teacher_key,u.lesson_date,
   u.class_ids,u.class_names,u.class_dates,u.start_times,u.end_times,u.due_at_by_class,u.due_at_overrides,
   u.title,u.homework_path,u.answer_path,u.answer_text,u.task_scope,
   u.homework2_path,u.answer2_path,u.answer2_text,u.task_scope2
 )::text,'UTF8'))
$$;

create function mtm_hw_private.lesson_upload_extract_yield125(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u mtm_hw_private.lesson_uploads%rowtype;
  prev mtm_hw_private.lesson_upload_extract_progress125%rowtype;
  paper_num integer;
  completed integer;
  step_status text;
  paper_checkpoint jsonb;
  binding bytea;
  now_at timestamptz;
  new_claim uuid;
  prior_exists boolean;
begin
  if coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role'
    then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
  if jsonb_typeof(p) is distinct from 'object' or p->>'action' is distinct from 'worker_yield_extract'
    or (select array_agg(k order by k collate "C") from jsonb_object_keys(p) k)
        is distinct from array['action','claim_token','paper','plan_hash','progress_count','progress_hash','source_version','upload_id','version']
    or coalesce(p->>'upload_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
    or coalesce(p->>'claim_token','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
    or jsonb_typeof(p->'version') is distinct from 'number' or coalesce(p->>'version','')!~'^[1-9][0-9]{0,8}$'
    or jsonb_typeof(p->'paper') is distinct from 'number' or coalesce(p->>'paper','')!~'^[12]$'
    or jsonb_typeof(p->'progress_count') is distinct from 'number' or coalesce(p->>'progress_count','')!~'^[1-9][0-9]{0,2}$'
    or coalesce(p->>'plan_hash','')!~'^[a-f0-9]{64}$' or coalesce(p->>'progress_hash','')!~'^[a-f0-9]{64}$'
    or coalesce(p->>'source_version','')!~'^[a-f0-9]{64}$'
    then raise exception 'INVALID_EXTRACT_YIELD_PAYLOAD';end if;
  completed:=(p->>'progress_count')::integer;
  if completed>128 then raise exception 'EXTRACT_YIELD_PROGRESS_LIMIT';end if;
  paper_num:=(p->>'paper')::integer;
  new_claim:=(p->>'claim_token')::uuid;
  select * into u from mtm_hw_private.lesson_uploads where id=(p->>'upload_id')::uuid for update;
  if not found then raise exception 'STALE_UPLOAD_OR_LEASE' using errcode='40001';end if;
  perform pg_advisory_xact_lock(hashtextextended('lesson-upload:'||u.group_key,0));
  now_at:=clock_timestamp();
  if u.claim_token is distinct from new_claim or u.version is distinct from (p->>'version')::integer
    or mtm_hw_private.lesson_upload_current(u) is distinct from true or u.finished_at is not null
    or u.checkpoint ? 'publish_receipts'
    then raise exception 'STALE_UPLOAD_OR_LEASE' using errcode='40001';end if;
  -- Operator grants have a separate accounting fence. This action only credits
  -- the ordinary claim that is currently counted, once across both papers.
  if u.work_kind is distinct from 'homework' or u.attempt_count not between 0 and 3
    or u.checkpoint ?| array['operator_timeout_continuation_v1','operator_cached_draft']
    or (paper_num=1 and (u.homework_path is null or u.answer_path is null))
    or (paper_num=2 and (u.homework2_path is null or u.answer2_path is null))
    then raise exception 'EXTRACT_YIELD_SCOPE_REQUIRED';end if;
  binding:=mtm_hw_private.lesson_upload_extract_binding125(u);
  select * into prev from mtm_hw_private.lesson_upload_extract_progress125
    where upload_id=u.id and paper=paper_num and version=u.version;
  prior_exists:=found;
  if prior_exists and (prev.upload_binding_sha<>binding
      or prev.source_version<>p->>'source_version' or prev.plan_hash<>p->>'plan_hash') then
    raise exception 'EXTRACT_YIELD_BINDING_CHANGED';
  end if;
  -- The first commit releases the lease, so identical same-claim RPC replay is
  -- acknowledged without another refund even if no acknowledgement arrived.
  if prior_exists and prev.last_claim_token=new_claim then
    if prev.progress_count=completed and prev.progress_hash=p->>'progress_hash'
      and u.retry_status='retry_wait' and u.review_wait_credit_token=new_claim then
      return '{"ok":true,"status":"yielded_extract","already_applied":true}'::jsonb;
    end if;
    raise exception 'EXTRACT_YIELD_CLAIM_ALREADY_CREDITED';
  end if;
  if u.lease_until is null or u.lease_until<=now_at or u.retry_status is distinct from 'running'
    or u.failure_claim_token=new_claim then raise exception 'STALE_UPLOAD_OR_LEASE' using errcode='40001';end if;
  if u.attempt_count<1 and u.review_wait_credit_token is distinct from new_claim then
    raise exception 'EXTRACT_YIELD_ORDINARY_ATTEMPT_REQUIRED';end if;
  if prior_exists and (prev.progress_count>=completed or prev.progress_hash=p->>'progress_hash') then
    raise exception 'EXTRACT_YIELD_PROGRESS_NOT_MONOTONE';
  end if;
  paper_checkpoint:=case when u.homework2_path is null then u.checkpoint else u.checkpoint->('paper'||paper_num::text) end;
  if coalesce(paper_checkpoint,'{}'::jsonb) ?| array['source','draft','review','materials','publish_receipts'] then
    raise exception 'EXTRACT_YIELD_STAGE_CHANGED';end if;
  if paper_num=1 then
    select status into step_status from mtm_hw_private.lesson_upload_steps where upload_id=u.id and step=2 for update;
  else
    select status into step_status from mtm_hw_private.lesson_upload_paper2_steps where upload_id=u.id and step=2 for update;
  end if;
  if step_status is distinct from 'dang' then raise exception 'EXTRACT_YIELD_STAGE_CHANGED';end if;
  insert into mtm_hw_private.lesson_upload_extract_progress125 as progress
    (upload_id,paper,version,upload_binding_sha,source_version,plan_hash,progress_count,progress_hash,last_claim_token)
  values (u.id,paper_num,u.version,binding,p->>'source_version',p->>'plan_hash',completed,p->>'progress_hash',new_claim)
  on conflict (upload_id,paper,version) do update set
    progress_count=excluded.progress_count,progress_hash=excluded.progress_hash,last_claim_token=excluded.last_claim_token;
  if paper_num=1 then
    update mtm_hw_private.lesson_upload_steps set detail='Đã lưu phần PDF đã đọc. Hệ thống sẽ tự tiếp tục.',updated_at=now_at
      where upload_id=u.id and step=2;
  else
    update mtm_hw_private.lesson_upload_paper2_steps set detail='Đã lưu phần PDF đã đọc. Hệ thống sẽ tự tiếp tục.',updated_at=now_at
      where upload_id=u.id and step=2;
  end if;
  update mtm_hw_private.lesson_uploads set
    attempt_count=attempt_count-case when review_wait_credit_token is distinct from new_claim then 1 else 0 end,
    review_wait_credit_token=new_claim,retry_status='retry_wait',next_retry_at=now_at+interval '5 seconds',
    lease_until=now_at-interval '1 millisecond'
    where id=u.id;
  return '{"ok":true,"status":"yielded_extract"}'::jsonb;
end
$$;

create function mtm_hw_private.lesson_upload_extract_claim125(r jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare progress jsonb;u mtm_hw_private.lesson_uploads%rowtype;
begin
  if jsonb_typeof(r->'job') is distinct from 'object' then return r;end if;
  select * into u from mtm_hw_private.lesson_uploads where id=(r #>>'{job,id}')::uuid;
  if not found then raise exception 'EXTRACT_YIELD_BINDING_CHANGED';end if;
  if exists(select 1 from mtm_hw_private.lesson_upload_extract_progress125 x where x.upload_id=u.id and x.version=u.version
    and x.upload_binding_sha<>mtm_hw_private.lesson_upload_extract_binding125(u)) then
    -- Return the claim so the worker can surface a permanent hold and unblock the queue.
    return jsonb_set(r,'{job,extract_progress_invalid}','true'::jsonb);
  end if;
  select jsonb_object_agg(x.paper::text,jsonb_build_object(
    'sourceVersion',x.source_version,'plan_hash',x.plan_hash,'progress_count',x.progress_count,'progress_hash',x.progress_hash
  )) into progress from mtm_hw_private.lesson_upload_extract_progress125 x where x.upload_id=u.id and x.version=u.version;
  if u.work_kind is distinct from 'homework'
    or u.checkpoint ?| array['operator_timeout_continuation_v1','operator_cached_draft']
    or not ((u.homework_path is not null and u.answer_path is not null)
      or (u.homework2_path is not null and u.answer2_path is not null)) then return r;end if;
  -- An empty, server-supplied map authorizes starting the bounded protocol.
  return jsonb_set(r,'{job,extract_progress}',coalesce(progress,'{}'::jsonb));
end
$$;

revoke all on function mtm_hw_private.lesson_upload_extract_binding125(mtm_hw_private.lesson_uploads),
  mtm_hw_private.lesson_upload_extract_yield125(jsonb),mtm_hw_private.lesson_upload_extract_claim125(jsonb)
  from public,anon,authenticated,service_role,mtm_btvn_publisher;

-- The same service handler backs direct worker RPCs and the publisher Edge
-- gateway. Keep installed wrapper OIDs, permissions and guard ordering intact.
do $routing$
declare
 f pg_proc%rowtype;
 src text;
 claim_return text;
 claim_anchor constant text:=$n$return jsonb_build_object('job',(to_jsonb(u)-'lease_until'-'finished_at')$n$;
 auth_anchor constant text:=$n$ if a in ('worker_claim','worker_pending_review') then$n$;
 gateway_anchor constant text:=$n$return public.mtm_lesson_upload_gateway_before_retry108(p);$n$;
begin
 select * into strict f from pg_proc where oid=coalesce(
   to_regprocedure('public.mtm_lesson_upload_api_before_continuation142(jsonb)'),
   'public.mtm_lesson_upload_api(jsonb)'::regprocedure);
 src:=pg_get_functiondef(f.oid);
 if not f.prosecdef or not ('search_path=""'=any(f.proconfig))
   or (length(src)-length(replace(src,claim_anchor,'')))/length(claim_anchor)<>1
   or (length(src)-length(replace(src,auth_anchor,'')))/length(auth_anchor)<>1
   then raise exception 'EXTRACT_YIELD_CLAIM_API_CHANGED';end if;
 claim_return:=split_part(split_part(src,claim_anchor,2),';',1);
 if position('exam_config' in claim_return)=0 or position('lesson_upload_steps' in claim_return)=0
   then raise exception 'EXTRACT_YIELD_CLAIM_API_CHANGED';end if;
 execute replace(replace(src,claim_anchor||claim_return||';',
   'return mtm_hw_private.lesson_upload_extract_claim125('||
   substring(claim_anchor from length('return ')+1)||claim_return||');'),
   auth_anchor,E' if a=''worker_yield_extract'' then return mtm_hw_private.lesson_upload_extract_yield125(p);end if;\n'||auth_anchor);
 if not exists(select 1 from pg_proc p where p.oid=f.oid and p.proowner=f.proowner and p.prosecdef=f.prosecdef
   and p.proacl is not distinct from f.proacl and p.proconfig is not distinct from f.proconfig) then
   raise exception 'EXTRACT_YIELD_CLAIM_API_METADATA_CHANGED';end if;

 select * into strict f from pg_proc where oid='public.mtm_lesson_upload_gateway(jsonb)'::regprocedure;
 src:=pg_get_functiondef(f.oid);
 if not f.prosecdef or not ('search_path=""'=any(f.proconfig))
   or (length(src)-length(replace(src,gateway_anchor,'')))/length(gateway_anchor)<>1
   then raise exception 'EXTRACT_YIELD_GATEWAY_CHANGED';end if;
 execute replace(src,gateway_anchor,
   E'if p->>''action''=''worker_yield_extract'' then return public.mtm_lesson_upload_api(p);end if;\n  '||gateway_anchor);
 if not exists(select 1 from pg_proc p where p.oid=f.oid and p.proowner=f.proowner and p.prosecdef=f.prosecdef
   and p.proacl is not distinct from f.proacl and p.proconfig is not distinct from f.proconfig) then
   raise exception 'EXTRACT_YIELD_GATEWAY_METADATA_CHANGED';end if;
end
$routing$;

do $branding$
declare
 f pg_proc%rowtype;src text;needle constant text:='when code is null then';
 patch constant text:=$detail$
  when code='NATIVE_LONG_PDF_BRANDING_REVIEW_REQUIRED' then 'Chưa đối chiếu được dấu nguồn trên toàn bộ PDF. Cần kiểm tra trước khi giao bài.'
  when code='NATIVE_LONG_PDF_PROGRESS_MISMATCH' then 'Tiến độ đã lưu của PDF chưa khớp phiên bản hiện tại. Cần kiểm tra trước khi tiếp tục.'
  when code='NATIVE_LONG_PDF_PROVIDER_OUTCOME_UNKNOWN' then 'Chưa xác minh được kết quả lần đọc PDF gần nhất. Cần đối soát trước khi tiếp tục.'
  when code='NATIVE_LONG_PDF_SEGMENT_REVIEW_REQUIRED' then 'Một phần PDF chưa đọc được chắc chắn. Cần đối chiếu thủ công trước khi giao bài.'
 $detail$;
begin
 select * into strict f from pg_proc where oid='mtm_hw_private.lesson_retry_reason108(text)'::regprocedure;
 src:=pg_get_functiondef(f.oid);
 if (length(src)-length(replace(src,needle,'')))/length(needle)<>1 then raise exception 'EXTRACT_YIELD_RETRY_REASON_CHANGED';end if;
 execute replace(src,needle,patch||needle);
 if not exists(select 1 from pg_proc p where p.oid=f.oid and p.proowner=f.proowner and p.prosecdef=f.prosecdef
   and p.proacl is not distinct from f.proacl and p.proconfig is not distinct from f.proconfig) then
   raise exception 'EXTRACT_YIELD_RETRY_REASON_METADATA_CHANGED';end if;
end
$branding$;
commit;
