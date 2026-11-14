-- LOCAL CANDIDATE ONLY. No installation, issuance or retry is authorized by this file.
-- Credit3 is cached-DRAFT-only; owner pins and protocol113 runtime remain required.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$begin
 if to_regprocedure('public.mtm_lesson_upload_api_before_continuation112(jsonb)') is null then raise exception 'CACHED113_REQUIRES112';end if;
 if to_regprocedure('public.mtm_lesson_upload_api_before_cached113(jsonb)') is not null then raise exception 'CACHED113_ALREADY_INSTALLED';end if;
end$$;



create function mtm_hw_private.lesson_cached_bindings_valid113(b jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(b)='object' and (select array_agg(k order by k) from jsonb_object_keys(b) k)=array[
 'cached_source_ref','cached_source_sha256','checkpoint_sha256','class_metadata_sha256','diagnosis_sha256','normalization_contract','normalization_receipt_sha256','normalized_draft_ref','normalized_private_draft_sha256','normalized_record_sha256','normalizer_sha256','prior_g1_sha256','prior_g2_sha256','raw_native_draft_sha256','runtime_manifest_sha256','runtime_receipt_sha256','source_fix_commit','source_version']::text[]
 and not exists(select 1 from jsonb_each(b) f where jsonb_typeof(f.value)<>'string')
 and not exists(select 1 from jsonb_each_text(b) f where f.key not in ('cached_source_ref','normalized_draft_ref','normalization_contract','source_fix_commit') and f.value!~'^[a-f0-9]{64}$')
 and b->>'source_fix_commit'~'^[a-f0-9]{40}$'
 and b->>'source_version'='78cf60e22fa55962e11391814a0fb7c157dc9f1936ce2b3a8d8551e9af89ba45'
 and b->>'diagnosis_sha256'='70f1ce72d176a12fa2c9d63e8720c0d9b08111ae71fb46e1e61a02f760df4793'
 and b->>'raw_native_draft_sha256'='358a693114fac6ef6fffd253bdc22f6d2503a88976656b8d89ff98f8038d0890'
 and b->>'class_metadata_sha256'='1efe72009bf134f9ef7601a6b887a727945f0822b71376d723cd7bb6264687c8'
 and b->>'normalization_contract'='MTM-WEB-NATIVE-PDF-PATHS-20261114-v1'
 and b->>'cached_source_ref'='14227822-ce9a-4f0f-8df3-489a60b11392-source-'||(b->>'cached_source_sha256')||'.json'
 and b->>'normalized_draft_ref'='14227822-ce9a-4f0f-8df3-489a60b11392-draft-'||(b->>'normalized_private_draft_sha256')||'.json',false)
$$;

create table mtm_hw_private.lesson_continuation142_credit3(
 credit_id uuid primary key,credit_ordinal int not null default 3 check(credit_ordinal=3),
 upload_id uuid not null unique references mtm_hw_private.lesson_uploads(id) check(upload_id='14227822-ce9a-4f0f-8df3-489a60b11392'::uuid),
 version int not null check(version=1),bindings jsonb not null check(mtm_hw_private.lesson_cached_bindings_valid113(bindings)),
 initial_checkpoint jsonb not null,prior_g1 jsonb not null,prior_g2 jsonb not null,
 authority_ref text not null check(length(authority_ref) between 8 and 240),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null check(expires_at>created_at),
 processing_credits_used int not null default 0 check(processing_credits_used between 0 and 1),
 status text not null default 'authorized' check(status in ('authorized','running','waiting_review','complete','failed')),
 consumed_at timestamptz,last_claim_token uuid,review_request_hash text,review_source_version text,
 review_resume_count int not null default 0 check(review_resume_count between 0 and 2),audit jsonb not null
);
alter table mtm_hw_private.lesson_continuation142_credit3 enable row level security;
revoke all on table mtm_hw_private.lesson_continuation142_credit3 from public,anon,authenticated,service_role,mtm_btvn_publisher;

create function mtm_hw_private.lesson_prior_immutable113() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from mtm_hw_private.lesson_continuation142_credit3 where upload_id=old.upload_id) then raise exception 'CACHED113_PRIOR_GRANTS_IMMUTABLE';end if;
 if tg_op='DELETE' then return old;else return new;end if;
end$$;
create trigger lesson_credit2_immutable113 before update or delete on mtm_hw_private.lesson_continuation142_credit2
 for each row execute function mtm_hw_private.lesson_prior_immutable113();

create function mtm_hw_private.lesson_grant_cached113(credit uuid,pins jsonb,authority text,expires timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 expected_credit uuid=null/* ROOT_PIN_CREDIT3_UUID */;
 expected_bindings jsonb=null/* ROOT_PIN_CACHED_BINDINGS */;
 u mtm_hw_private.lesson_uploads;g1 mtm_hw_private.lesson_continuation142;g2 mtm_hw_private.lesson_continuation142_credit2;g3 mtm_hw_private.lesson_continuation142_credit3;
 now_at timestamptz;prior_step jsonb;old_count int;old_hash text;
begin
 if expected_credit is null or expected_bindings is null or credit is distinct from expected_credit or pins is distinct from expected_bindings
  or not mtm_hw_private.lesson_cached_bindings_valid113(pins) or authority is null or length(authority) not between 8 and 240 or expires is null then raise exception 'CACHED113_ACTUAL_BOUND_PROOFS_REQUIRED';end if;
 select * into u from mtm_hw_private.lesson_uploads where id='14227822-ce9a-4f0f-8df3-489a60b11392' for update;
 select * into g1 from mtm_hw_private.lesson_continuation142 where upload_id=u.id for update;
 select * into g2 from mtm_hw_private.lesson_continuation142_credit2 where upload_id=u.id for update;
 select * into g3 from mtm_hw_private.lesson_continuation142_credit3 where upload_id=u.id for update;
 now_at=clock_timestamp();
 if not mtm_hw_private.lesson_continuation_identity142(u)
  or encode(sha256(convert_to(to_jsonb(g1)::text,'UTF8')),'hex') is distinct from pins->>'prior_g1_sha256'
  or encode(sha256(convert_to(to_jsonb(g2)::text,'UTF8')),'hex') is distinct from pins->>'prior_g2_sha256' then raise exception 'CACHED113_SOURCE_OR_PRIOR_CHANGED';end if;
 if g3.credit_id is not null then
  if (g3.credit_id,g3.bindings,g3.authority_ref,g3.expires_at) is distinct from (credit,pins,authority,expires) then raise exception 'CACHED113_ALREADY_ISSUED';end if;
  return jsonb_build_object('accepted',true,'already_issued',true,'credit_id',g3.credit_id,'status',g3.status,'processing_credits_used',g3.processing_credits_used,'cached_only',true);
 end if;
 if expires<=now_at or expires>now_at+interval '60 minutes' then raise exception 'CACHED113_EXPIRY_REQUIRED';end if;
 if g1.status is distinct from 'failed' or g1.processing_credits_used<>1 or g2.status is distinct from 'failed' or g2.processing_credits_used<>1
  or g2.last_claim_token is distinct from u.claim_token or u.failure_claim_token is distinct from u.claim_token or u.claim_token is null
  or u.attempt_count<>5 or u.retry_count<>3 or u.retry_status is distinct from 'needs_input' or u.last_error_code is distinct from 'DRAFT_INVALID' or u.failed_step is distinct from 3 or u.failed_paper is distinct from 1
  or u.finished_at is not null or u.lease_until>now_at or u.checkpoint ? 'publish_receipts' or u.checkpoint ? 'draft'
  or u.checkpoint->>'source' is distinct from pins->>'cached_source_ref'
  or encode(sha256(convert_to(u.checkpoint::text,'UTF8')),'hex') is distinct from pins->>'checkpoint_sha256'
  or exists(select 1 from mtm_hw_private.lesson_uploads where finished_at is null and lease_until>now_at)
  or exists(select 1 from mtm_hw_private.lesson_review_requests where upload_id=u.id)
  or exists(select 1 from mtm_hw_private.btvn_lessons where code='web-'||replace(u.id::text,'-',''))
  or exists(select 1 from mtm_hw_private.lesson_upload_paper2_steps where upload_id=u.id) then raise exception 'CACHED113_FAILED_DRAFT_REQUIRED';end if;
 if not exists(select 1 from mtm_hw_private.lesson_upload_automation where singleton and enabled and activated_at='2026-11-13T02:49:20.506663Z') then raise exception 'CACHED113_CONTROL_CHANGED';end if;
 select count(*),encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'attempt_count',attempt_count,'finished_at',finished_at,'published',checkpoint ? 'publish_receipts') order by id),'[]')::text,'UTF8')),'hex') into old_count,old_hash from mtm_hw_private.lesson_uploads where not is_test and created_at<'2026-11-13T02:49:20.506663Z';
 if old_count<>5 or old_hash is distinct from 'f121ccba4da5424452f78d93ce4cd976f81695b17d72aab33d648a1152745336' then raise exception 'CACHED113_OLD5_CHANGED';end if;
 perform 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id for update;now_at=clock_timestamp();
 if expires<=now_at or expires>now_at+interval '60 minutes' then raise exception 'CACHED113_EXPIRY_REQUIRED';end if;
 if (select jsonb_agg(jsonb_build_object('step',step,'status',status) order by step) from mtm_hw_private.lesson_upload_steps where upload_id=u.id) is distinct from '[{"step":1,"status":"xong"},{"step":2,"status":"xong"},{"step":3,"status":"loi"},{"step":4,"status":"cho"},{"step":5,"status":"cho"},{"step":6,"status":"cho"}]'::jsonb then raise exception 'CACHED113_STEPS_CHANGED';end if;
 select to_jsonb(s) into prior_step from mtm_hw_private.lesson_upload_steps s where upload_id=u.id and step=3;
 insert into mtm_hw_private.lesson_continuation142_credit3(credit_id,upload_id,version,bindings,initial_checkpoint,prior_g1,prior_g2,authority_ref,expires_at,audit)
 values(credit,u.id,u.version,pins,u.checkpoint,to_jsonb(g1),to_jsonb(g2),authority,expires,jsonb_build_object('kind','cached_draft_only_processing_credit3','prior_attempt_count',5,'prior_retry_count',3,'prior_error_code',u.last_error_code,'prior_step3',prior_step,'native_paid_budget_changed',false,'extractor_forbidden',true,'old5_sha256',old_hash));
 update mtm_hw_private.lesson_upload_steps set status='cho',detail='Operator phục hồi bản dựng đã lưu; cấm gọi lại trích xuất nguồn.',updated_at=now_at where upload_id=u.id and step=3;
 update mtm_hw_private.lesson_uploads set retry_status='queued',next_retry_at=now_at where id=u.id;
 return jsonb_build_object('accepted',true,'already_issued',false,'credit_id',credit,'processing_credits_used',0,'cached_only',true,'native_paid_budget_changed',false);
end$$;

create function mtm_hw_private.lesson_cached_checkpoint_valid113(cp jsonb,c mtm_hw_private.lesson_continuation142_credit3,require_draft boolean) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(cp)='object' and cp->>'source'=c.bindings->>'cached_source_ref' and cp->'operator_repairs'=c.initial_checkpoint->'operator_repairs'
 and (not require_draft or (cp->>'draft'=c.bindings->>'normalized_draft_ref' and cp->'operator_cached_draft'=jsonb_build_object(
  'contract','MTM-OPERATOR-CACHED-DRAFT-20261114-v1','source_ref',c.bindings->>'cached_source_ref','source_state_sha256',c.bindings->>'cached_source_sha256',
  'raw_native_draft_sha256',c.bindings->>'raw_native_draft_sha256','class_metadata_sha256',c.bindings->>'class_metadata_sha256','source_version',c.bindings->>'source_version',
  'normalizer_contract',c.bindings->>'normalization_contract','normalizer_sha256',c.bindings->>'normalizer_sha256','normalization_receipt_sha256',c.bindings->>'normalization_receipt_sha256',
  'normalized_record_sha256',c.bindings->>'normalized_record_sha256','normalized_private_draft_sha256',c.bindings->>'normalized_private_draft_sha256','normalized_draft_ref',c.bindings->>'normalized_draft_ref'))),false)
$$;

-- Existing caps unchanged; only the one test can structurally reach6.
alter table mtm_hw_private.lesson_uploads drop constraint lesson_uploads_attempt_count_check;
alter table mtm_hw_private.lesson_uploads add constraint lesson_uploads_attempt_count_check check(attempt_count between 0 and 3 or (is_test and attempt_count=4) or (is_test and id='14227822-ce9a-4f0f-8df3-489a60b11392'::uuid and version=1 and work_kind='homework' and attempt_count in (5,6)));
create or replace function mtm_hw_private.lesson_continuation_fence142() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.attempt_count>3 and not (
  exists(select 1 from mtm_hw_private.lesson_continuation142 g where g.upload_id=new.id and g.version=new.version and new.is_test and new.work_kind='homework' and new.attempt_count=4 and g.processing_credits_used=1 and g.status='running' and g.last_claim_token=new.claim_token)
  or exists(select 1 from mtm_hw_private.lesson_continuation142_credit2 c where c.upload_id=new.id and c.version=new.version and new.is_test and new.work_kind='homework' and c.processing_credits_used=1 and c.last_claim_token=new.claim_token and ((new.attempt_count=5 and c.status='running') or (new.attempt_count=4 and c.status in ('running','waiting_review') and new.review_wait_credit_token=new.claim_token)))
  or exists(select 1 from mtm_hw_private.lesson_continuation142_credit3 c where c.upload_id=new.id and c.version=new.version and new.is_test and new.work_kind='homework' and c.processing_credits_used=1 and c.last_claim_token=new.claim_token and ((new.attempt_count=6 and c.status='running') or (new.attempt_count=5 and c.status in ('running','waiting_review') and new.review_wait_credit_token=new.claim_token)))
 ) then raise exception 'CONTINUATION_CONSUMED_FENCE_REQUIRED';end if;return new;
end$$;

alter function public.mtm_lesson_upload_api(jsonb) rename to mtm_lesson_upload_api_before_cached113;
create function public.mtm_lesson_upload_api(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text=p->>'action';u mtm_hw_private.lesson_uploads;after_u mtm_hw_private.lesson_uploads;c mtm_hw_private.lesson_continuation142_credit3;
 g1 mtm_hw_private.lesson_continuation142;g2 mtm_hw_private.lesson_continuation142_credit2;rr mtm_hw_private.lesson_review_requests;
 token uuid;first_claim boolean;out jsonb;now_at timestamptz;merged jsonb;require_draft boolean;contract jsonb;
begin
 if a like 'worker_%' and coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 if a='worker_claim' and (p->>'worker_protocol'='113' or p ? 'operator_cached_draft_only') then
  if p->>'upload_id' is distinct from '14227822-ce9a-4f0f-8df3-489a60b11392' or p->'is_test' is distinct from 'true'::jsonb
   or p->'operator_continuation' is distinct from 'true'::jsonb or p->'auto' is distinct from 'false'::jsonb or p->'operator_cached_draft_only' is distinct from 'true'::jsonb
   or p->>'worker_protocol' is distinct from '113' or coalesce(p->>'operator_credit_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   or length(coalesce(p->>'worker_id','')) not between 1 and 100 then raise exception 'CACHED113_EXPLICIT_TEST_SCOPE_REQUIRED';end if;
  select * into u from mtm_hw_private.lesson_uploads where id=(p->>'upload_id')::uuid for update;
  select * into g1 from mtm_hw_private.lesson_continuation142 where upload_id=u.id for update;
  select * into g2 from mtm_hw_private.lesson_continuation142_credit2 where upload_id=u.id for update;
  select * into c from mtm_hw_private.lesson_continuation142_credit3 where upload_id=u.id for update;now_at=clock_timestamp();
  if c.credit_id is null or c.credit_id::text is distinct from p->>'operator_credit_id' or not mtm_hw_private.lesson_continuation_identity142(u)
   or to_jsonb(g1) is distinct from c.prior_g1 or to_jsonb(g2) is distinct from c.prior_g2
   or c.expires_at<=now_at or c.bindings->>'runtime_manifest_sha256' is distinct from p->>'runtime_manifest_sha256'
   or u.finished_at is not null or u.checkpoint ? 'publish_receipts' or u.attempt_count<>5 or u.retry_count<>3 or u.lease_until>now_at
   or u.retry_status not in ('queued','running') or not mtm_hw_private.lesson_cached_checkpoint_valid113(u.checkpoint,c,false)
   or exists(select 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id and status='loi') then raise exception 'CACHED113_NOT_ELIGIBLE';end if;
  first_claim=c.processing_credits_used=0 and c.status='authorized';
  if first_claim then
   if u.checkpoint is distinct from c.initial_checkpoint or exists(select 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id and step<=2 and status<>'xong') then raise exception 'CACHED113_SOURCE_CHECKPOINT_CHANGED';end if;
  else
   if c.review_resume_count>=2 then raise exception 'CACHED113_REVIEW_RESUME_LIMIT';end if;
   select * into rr from mtm_hw_private.lesson_review_requests where upload_id=u.id and paper=1;
   if c.processing_credits_used<>1 or c.status<>'waiting_review' or u.review_wait_credit_token is distinct from c.last_claim_token
    or rr.request_hash is distinct from c.review_request_hash or rr.source_version is distinct from c.bindings->>'source_version'
    or not mtm_hw_private.lesson_cached_checkpoint_valid113(u.checkpoint,c,true)
    or exists(select 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id and step<=3 and status<>'xong') then raise exception 'CACHED113_REVIEW_RESUME_CHANGED';end if;
  end if;
  token=gen_random_uuid();update mtm_hw_private.lesson_continuation142_credit3 set processing_credits_used=1,status='running',consumed_at=coalesce(consumed_at,now_at),last_claim_token=token,review_resume_count=review_resume_count+case when first_claim then 0 else 1 end where credit_id=c.credit_id;
  update mtm_hw_private.lesson_uploads set claim_token=token,worker_id=p->>'worker_id',attempt_count=attempt_count+1,retry_status='running',next_retry_at=null,lease_until=now_at+make_interval(secs=>least(900,greatest(60,coalesce((p->>'lease_seconds')::int,600)))) where id=u.id returning * into after_u;
  contract=jsonb_build_object('contract','MTM-OPERATOR-CACHED-DRAFT-20261114-v1','source_ref',c.bindings->>'cached_source_ref','source_state_sha256',c.bindings->>'cached_source_sha256','raw_native_draft_sha256',c.bindings->>'raw_native_draft_sha256','class_metadata_sha256',c.bindings->>'class_metadata_sha256','normalizer_contract',c.bindings->>'normalization_contract','normalizer_sha256',c.bindings->>'normalizer_sha256','normalization_receipt_sha256',c.bindings->>'normalization_receipt_sha256','normalized_record_sha256',c.bindings->>'normalized_record_sha256','normalized_private_draft_sha256',c.bindings->>'normalized_private_draft_sha256','normalized_draft_ref',c.bindings->>'normalized_draft_ref','source_version',c.bindings->>'source_version');
  return jsonb_build_object('job',(to_jsonb(after_u)-'lease_until'-'finished_at')||jsonb_build_object('lesson_code','web-'||replace(u.id::text,'-',''),'operator_continuation',true,'operator_credit_id',c.credit_id,'operator_credit_ordinal',3,'operator_processing_credits_used',1,'operator_review_resume',not first_claim,'operator_cached_draft_only',true,'operator_cached_draft',contract,'steps',(select jsonb_agg(to_jsonb(s) order by step) from mtm_hw_private.lesson_upload_steps s where upload_id=u.id))||mtm_hw_private.lesson_worker_grade_context112(after_u));
 end if;

 if a like 'worker_%' and p->>'upload_id'='14227822-ce9a-4f0f-8df3-489a60b11392' then
  select * into u from mtm_hw_private.lesson_uploads where id=(p->>'upload_id')::uuid for update;
  select * into c from mtm_hw_private.lesson_continuation142_credit3 where upload_id=u.id for update;now_at=clock_timestamp();
  if c.credit_id is not null and c.processing_credits_used=1 and c.last_claim_token::text=p->>'claim_token' and c.last_claim_token=u.claim_token and c.status in ('running','waiting_review') then
   if c.expires_at<=now_at and a<>'worker_record_failure' then raise exception 'CACHED113_EXPIRED';end if;
   if not mtm_hw_private.lesson_cached_checkpoint_valid113(u.checkpoint,c,false) then raise exception 'CACHED113_SOURCE_CHECKPOINT_CHANGED';end if;
   if a='worker_checkpoint' then
    merged=u.checkpoint||coalesce(p->'checkpoint','{}'::jsonb);
    require_draft=(p->>'step')::int>=4 or ((p->>'step')::int=3 and p->>'status'='xong');
    if not mtm_hw_private.lesson_cached_checkpoint_valid113(merged,c,require_draft) then raise exception 'CACHED113_DERIVED_CHECKPOINT_REQUIRED';end if;
   elsif a in ('worker_publish','worker_wait_review','worker_finish') and not mtm_hw_private.lesson_cached_checkpoint_valid113(u.checkpoint,c,true) then raise exception 'CACHED113_DERIVED_CHECKPOINT_REQUIRED';end if;
  end if;
 end if;
 -- Preserve the complete111/112/110/108 auth, version, lease, validators,
 -- publication capability and paid-budget behavior in the canonical path.
 out=public.mtm_lesson_upload_api_before_cached113(p);
 if a in ('worker_wait_review','worker_record_failure','worker_finish') then
  select * into u from mtm_hw_private.lesson_uploads where id=(p->>'upload_id')::uuid for update;
  select * into c from mtm_hw_private.lesson_continuation142_credit3 where upload_id=u.id for update;now_at=clock_timestamp();
  if c.credit_id is not null and c.processing_credits_used=1 and c.last_claim_token=u.claim_token then
   if a='worker_wait_review' and out->'allowed'='false'::jsonb then
    if p->>'source_version' is distinct from c.bindings->>'source_version' or coalesce(p->>'request_hash','')!~'^[a-f0-9]{64}$' or u.review_wait_credit_token is distinct from u.claim_token or u.attempt_count<>5 then raise exception 'CACHED113_REVIEW_WAIT_CHANGED';end if;
    if c.status='running' then update mtm_hw_private.lesson_continuation142_credit3 set status='waiting_review',review_request_hash=p->>'request_hash',review_source_version=p->>'source_version' where credit_id=c.credit_id;end if;
   elsif a='worker_record_failure' and c.status='running' and u.finished_at is null and not(u.checkpoint ? 'publish_receipts') and u.failure_claim_token=u.claim_token and u.last_error_code=p->>'code' and u.failed_step=(p->>'step')::int
    and exists(select 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id and step=u.failed_step and status='loi') and coalesce((out->>'already_recorded')::boolean,false)=false then
    update mtm_hw_private.lesson_continuation142_credit3 set status='failed',audit=audit||jsonb_build_object('failed_at',now_at,'last_error_code',u.last_error_code,'attempt_count',u.attempt_count,'retry_count',u.retry_count) where credit_id=c.credit_id;
   elsif a='worker_finish' and u.finished_at is not null then update mtm_hw_private.lesson_continuation142_credit3 set status='complete',audit=audit||jsonb_build_object('finished_at',u.finished_at) where credit_id=c.credit_id;
   end if;
  end if;
 end if;return out;
end$$;

-- Gateway does not route worker_source through the API. Add one deny gate in
-- place, retaining the SAME function OID, security metadata and exact ACL.
create function mtm_hw_private.lesson_cached_source_forbidden113(upload uuid,token uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from mtm_hw_private.lesson_continuation142_credit3 c
  where c.upload_id=$1 and c.processing_credits_used=1 and c.last_claim_token=$2 and c.status in ('running','waiting_review'))
$$;
do $gateway$
declare src text;needle text=$n$return public.mtm_lesson_upload_gateway_before_retry108(p);$n$;oid_before oid;acl_before aclitem[];owner_before oid;definer_before boolean;config_before text[];
begin
 select oid,proacl,proowner,prosecdef,proconfig into oid_before,acl_before,owner_before,definer_before,config_before from pg_proc where oid='public.mtm_lesson_upload_gateway(jsonb)'::regprocedure;
 src=pg_get_functiondef(oid_before);
 if not definer_before or position('set search_path' in lower(src))=0 or (length(src)-length(replace(src,needle,'')))/length(needle)<>1 or position('lesson_cached_source_forbidden113' in src)>0 then raise exception 'CACHED113_GATEWAY_SOURCE_CHANGED';end if;
 execute replace(src,needle,E'if p->>''action''=''worker_source'' and mtm_hw_private.lesson_cached_source_forbidden113((p->>''upload_id'')::uuid,(p->>''claim_token'')::uuid) then raise exception ''CACHED_ONLY_EXTRACTION_FORBIDDEN'';end if;\n '||needle);
 if not exists(select 1 from pg_proc where oid=oid_before and proowner=owner_before and prosecdef=definer_before and proconfig is not distinct from config_before and proacl is not distinct from acl_before and oid='public.mtm_lesson_upload_gateway(jsonb)'::regprocedure) then raise exception 'CACHED113_GATEWAY_METADATA_CHANGED';end if;
end$gateway$;

revoke all on function public.mtm_lesson_upload_api(jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
do $acl$declare r record;grantee text;prior_acl jsonb;current_acl jsonb;begin
 for r in select x.* from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where p.oid='public.mtm_lesson_upload_api_before_cached113(jsonb)'::regprocedure and x.privilege_type='EXECUTE' loop
  grantee=case when r.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(r.grantee)) end;
  execute 'grant execute on function public.mtm_lesson_upload_api(jsonb) to '||grantee||case when r.is_grantable then ' with grant option' else '' end;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('grantee',x.grantee,'privilege',x.privilege_type,'grantable',x.is_grantable) order by x.grantee,x.privilege_type,x.is_grantable),'[]'::jsonb) into prior_acl from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where p.oid='public.mtm_lesson_upload_api_before_cached113(jsonb)'::regprocedure;
 select coalesce(jsonb_agg(jsonb_build_object('grantee',x.grantee,'privilege',x.privilege_type,'grantable',x.is_grantable) order by x.grantee,x.privilege_type,x.is_grantable),'[]'::jsonb) into current_acl from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where p.oid='public.mtm_lesson_upload_api(jsonb)'::regprocedure;
 if current_acl is distinct from prior_acl then raise exception 'CACHED113_API_ACL_CHANGED';end if;
end$acl$;
revoke all on function public.mtm_lesson_upload_api_before_cached113(jsonb),mtm_hw_private.lesson_cached_bindings_valid113(jsonb),mtm_hw_private.lesson_prior_immutable113(),mtm_hw_private.lesson_grant_cached113(uuid,jsonb,text,timestamptz),mtm_hw_private.lesson_cached_checkpoint_valid113(jsonb,mtm_hw_private.lesson_continuation142_credit3,boolean),mtm_hw_private.lesson_cached_source_forbidden113(uuid,uuid) from public,anon,authenticated,service_role,mtm_btvn_publisher;
do $private_acl$begin
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where p.oid in ('public.mtm_lesson_upload_api_before_cached113(jsonb)'::regprocedure,'mtm_hw_private.lesson_cached_bindings_valid113(jsonb)'::regprocedure,'mtm_hw_private.lesson_prior_immutable113()'::regprocedure,'mtm_hw_private.lesson_grant_cached113(uuid,jsonb,text,timestamptz)'::regprocedure,'mtm_hw_private.lesson_cached_checkpoint_valid113(jsonb,mtm_hw_private.lesson_continuation142_credit3,boolean)'::regprocedure,'mtm_hw_private.lesson_cached_source_forbidden113(uuid,uuid)'::regprocedure) and x.grantee<>p.proowner) then raise exception 'CACHED113_PRIVATE_ACL_CHANGED';end if;
 if exists(select 1 from pg_class t cross join lateral aclexplode(coalesce(t.relacl,acldefault('r',t.relowner)))x where t.oid='mtm_hw_private.lesson_continuation142_credit3'::regclass and x.grantee<>t.relowner) then raise exception 'CACHED113_TABLE_ACL_CHANGED';end if;
end$private_acl$;
commit;
