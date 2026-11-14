-- LOCAL CANDIDATE ONLY. No tracked migration, grant, rollout, or actual diagnosis is implied.
-- Every ROOT_PIN below is intentionally NULL. Owner issuance is impossible until
-- actual V7 evidence, a concrete reviewed fix and immutable runtime are bound.
-- Revision3: factual managed-class grade context in ALREADY AUTHORIZED claims.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$begin
 if to_regprocedure('public.mtm_lesson_upload_api_before_continuation142(jsonb)') is null then raise exception 'CONTINUATION_111_REQUIRED';end if;
 if to_regprocedure('public.mtm_lesson_upload_api_before_continuation112(jsonb)') is not null then raise exception 'CONTINUATION_112_ALREADY_INSTALLED';end if;
end$$;

-- Private projection only: no roster, student data, caller-selected class lookup,
-- or new public permission. Incomplete metadata does not roll back the claim;
-- the worker receives an explicit safe HOLD reason for its normal failure path.
create function mtm_hw_private.lesson_worker_grade_context112(u mtm_hw_private.lesson_uploads) returns jsonb
language sql stable security definer set search_path='' as $$
 with matched as (
  select c.id,c.grade from mtm_hw_private.classes c
  join mtm_hw_private.btvn_publish_scope ps on ps.singleton and c.owner_id=ps.owner_id and c.id=any(ps.class_ids)
  where c.id=any(u.class_ids) and c.active and c.label=u.class_names->>c.id::text and c.grade in (10,11,12)
 ), projected as (
  select count(*) n,coalesce(jsonb_object_agg(id::text,grade),'{}'::jsonb) grades from matched
 ), valid as (
  select n>0 and n=cardinality(u.class_ids) and cardinality(u.class_ids)=(select count(distinct id) from unnest(u.class_ids) id) complete,grades from projected
 )
 select jsonb_build_object('class_grades',case when complete then grades else '{}'::jsonb end,
  'grade_source','managed_class_catalog','class_grade_complete',coalesce(complete,false),
  'class_grade_issue',case when complete then null else 'CLASS_GRADE_METADATA_REQUIRED' end) from valid
$$;
revoke all on function mtm_hw_private.lesson_worker_grade_context112(mtm_hw_private.lesson_uploads) from public,anon,authenticated,service_role,mtm_btvn_publisher;
do $private_acl$begin
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x
  where p.oid='mtm_hw_private.lesson_worker_grade_context112(mtm_hw_private.lesson_uploads)'::regprocedure and x.grantee<>p.proowner and x.privilege_type='EXECUTE') then raise exception 'CONTINUATION112_GRADE_HELPER_ACL_CHANGED';end if;
end$private_acl$;

-- Existing OID/ACL retained; grade failures stay permanent HOLD, never automatic AI retries.
create or replace function mtm_hw_private.lesson_retry_reason108(code text) returns text
language sql immutable set search_path='' as $$
 select case
 when mtm_hw_private.lesson_retryable108(code) then 'Kết nối hoặc dịch vụ tạm gián đoạn; tiếp tục cùng bản đã gửi.'
 when code in ('INDEPENDENT_ANSWER_MISMATCH','TEACHER_ANSWER_MISMATCH','REVIEW_MISMATCH','INDEPENDENT_REVIEW_REQUIRED') then 'Đáp án hoặc kết quả kiểm chưa khớp; thầy cô kiểm tra nguồn.'
 when code in ('GATEWAY_AUTH_REQUIRED','SERVICE_ROLE_REQUIRED','STAFF_REQUIRED','PASSWORD_CHANGE_REQUIRED','PRIVATE_SOURCE_UNAVAILABLE','PRIVATE_ASSET_CONFLICT') then 'Quyền truy cập hoặc tệp riêng tư cần được kiểm tra.'
 when code in ('NATIVE_SOURCE_INVENTORY_REQUIRED','NATIVE_SOURCE_INVENTORY_AMBIGUOUS','NATIVE_SOURCE_INVENTORY_PAGE_UNRESOLVED') then 'Chưa đọc rõ danh sách câu từ PDF; thầy cô gửi bản PDF có chữ hoặc trang rõ hơn.'
 when code in ('NATIVE_SCOPE_UNRESOLVED','NATIVE_SCOPE_AMBIGUOUS','NATIVE_SCOPE_REF_MISSING') then 'Phạm vi chưa xác định; thầy cô nhập rõ câu, phần và trang cần giao.'
 when code='NATIVE_EXTRACT_INVENTORY_MISMATCH' then 'AI đọc chưa khớp danh sách câu trong nguồn; cần kiểm tra lại với đề gốc.'
 when code='NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED' then 'Nội dung đã lưu cần được kiểm tra lại với đề gốc trước khi tiếp tục.'
 when code='NATIVE_CLASS_METADATA_REQUIRED' then 'Chưa xác minh được khối lớp từ danh mục; quản lý kiểm tra thông tin lớp.'
 when code='NATIVE_CLASS_GRADE_AMBIGUOUS' then 'Các lớp được giao có khối khác nhau; quản lý kiểm tra phạm vi lớp.'
 when code='NATIVE_CLASS_GRADE_CONFLICT' then 'Khối ghi rõ trong tài liệu khác khối của lớp; cần kiểm tra nguồn và lớp được giao.'
 when code='NATIVE_CLASS_GRADE_MISMATCH' then 'Bản dựng chưa khớp khối lớp trong danh mục; cần kiểm tra trước khi giao.'
 when code='NATIVE_CLASS_METADATA_CHANGED' then 'Thông tin lớp đã thay đổi so với bản xử lý; cần đối soát cùng phiên bản trước khi tiếp tục.'
 when code is null then 'Chưa có lỗi cần thử lại.'
 else 'Cần kiểm tra nguồn hoặc biên nhận trước khi tiếp tục.' end
$$;

create table mtm_hw_private.lesson_continuation142_credit2(
 credit_id uuid primary key,credit_ordinal integer not null check(credit_ordinal=2),
 upload_id uuid not null unique references mtm_hw_private.lesson_uploads(id),version integer not null check(version=1),
 source_version text not null check(source_version='78cf60e22fa55962e11391814a0fb7c157dc9f1936ce2b3a8d8551e9af89ba45'),
 prior_grant_sha256 text not null check(prior_grant_sha256~'^[a-f0-9]{64}$'),prior_grant jsonb not null,
 diagnosis_receipt_sha256 text not null check(diagnosis_receipt_sha256~'^[a-f0-9]{64}$'),
 runtime_manifest_sha256 text not null check(runtime_manifest_sha256~'^[a-f0-9]{64}$'),
 runtime_receipt_sha256 text not null check(runtime_receipt_sha256~'^[a-f0-9]{64}$'),
 source_fix_commit text not null check(source_fix_commit~'^[a-f0-9]{40}$'),authority_ref text not null check(length(authority_ref) between 8 and 240),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 processing_credits_used integer not null default 0 check(processing_credits_used between 0 and 1),
 status text not null default 'authorized' check(status in ('authorized','running','waiting_review','complete','failed')),
 consumed_at timestamptz,last_claim_token uuid,review_request_hash text,review_source_version text,
 review_resume_count integer not null default 0 check(review_resume_count between 0 and 2),audit jsonb not null,
 check(upload_id='14227822-ce9a-4f0f-8df3-489a60b11392'::uuid),check(expires_at>created_at)
);
alter table mtm_hw_private.lesson_continuation142_credit2 enable row level security;
revoke all on mtm_hw_private.lesson_continuation142_credit2 from public,anon,authenticated,service_role,mtm_btvn_publisher;

-- The first credit is historical evidence. Its entire row becomes immutable
-- once the separate ordinal2 row exists; no counter/status/token is reset.
create function mtm_hw_private.lesson_continuation_prior_immutable112() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from mtm_hw_private.lesson_continuation142_credit2 where upload_id=old.upload_id) then raise exception 'CONTINUATION_PRIOR_GRANT_IMMUTABLE';end if;
 if tg_op='DELETE' then return old;else return new;end if;
end$$;
create trigger lesson_continuation_prior_immutable112 before update or delete on mtm_hw_private.lesson_continuation142
 for each row execute function mtm_hw_private.lesson_continuation_prior_immutable112();

-- Owner-only issuer, NOT a gateway action. Valid-shaped caller-provided strings
-- cannot substitute for reviewed actual pinned evidence.
create function mtm_hw_private.lesson_grant_continuation112(credit uuid,prior_sha text,diagnosis_sha text,manifest_sha text,receipt_sha text,fix_commit text,authority text,expires timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 expected_credit uuid=null/* ROOT_PIN_CREDIT_UUID */;
 expected_prior text=null/* ROOT_PIN_PRIOR_GRANT_SHA256 */;
 expected_diagnosis text=null/* ROOT_PIN_V7_ACTUAL_SHA256 */;
 expected_manifest text=null/* ROOT_PIN_NEW_RUNTIME_MANIFEST_SHA256 */;
 expected_receipt text=null/* ROOT_PIN_NEW_RUNTIME_RECEIPT_SHA256 */;
 expected_fix text=null/* ROOT_PIN_CONCRETE_FIX_COMMIT */;
 u mtm_hw_private.lesson_uploads;g mtm_hw_private.lesson_continuation142;c mtm_hw_private.lesson_continuation142_credit2;
 now_at timestamptz=clock_timestamp();prior_data jsonb;prior_step jsonb;old_count integer;old_hash text;
begin
 if expected_credit is null or expected_prior is null or expected_diagnosis is null or expected_manifest is null or expected_receipt is null or expected_fix is null
  or expected_prior!~'^[a-f0-9]{64}$' or expected_diagnosis!~'^[a-f0-9]{64}$' or expected_manifest!~'^[a-f0-9]{64}$' or expected_receipt!~'^[a-f0-9]{64}$' or expected_fix!~'^[a-f0-9]{40}$'
  or credit is distinct from expected_credit or prior_sha is distinct from expected_prior or diagnosis_sha is distinct from expected_diagnosis
  or manifest_sha is distinct from expected_manifest or receipt_sha is distinct from expected_receipt or fix_commit is distinct from expected_fix
  or authority is null or length(authority) not between 8 and 240 or expires is null then raise exception 'CONTINUATION112_ACTUAL_PROOFS_REQUIRED';end if;
 select * into u from mtm_hw_private.lesson_uploads where id='14227822-ce9a-4f0f-8df3-489a60b11392' for update;
 select * into g from mtm_hw_private.lesson_continuation142 where upload_id=u.id for update;
 select * into c from mtm_hw_private.lesson_continuation142_credit2 where upload_id=u.id for update;
 now_at=clock_timestamp();
 if expires<=now_at or expires>now_at+interval '60 minutes' then raise exception 'CONTINUATION112_EXPIRY_REQUIRED';end if;
 if not mtm_hw_private.lesson_continuation_identity142(u) then raise exception 'CONTINUATION112_SOURCE_CHANGED';end if;
 prior_data=to_jsonb(g);
 if g.upload_id is null or encode(sha256(convert_to(prior_data::text,'UTF8')),'hex') is distinct from expected_prior then raise exception 'CONTINUATION112_PRIOR_GRANT_CHANGED';end if;
 if c.credit_id is not null then
  if (c.credit_id,c.prior_grant_sha256,c.diagnosis_receipt_sha256,c.runtime_manifest_sha256,c.runtime_receipt_sha256,c.source_fix_commit,c.authority_ref,c.expires_at)
   is distinct from (credit,prior_sha,diagnosis_sha,manifest_sha,receipt_sha,fix_commit,authority,expires) then raise exception 'CONTINUATION112_ALREADY_ISSUED';end if;
  return jsonb_build_object('accepted',true,'already_issued',true,'credit_id',c.credit_id,'status',c.status,'processing_credits_used',c.processing_credits_used);
 end if;
 if g.status is distinct from 'failed' or g.processing_credits_used<>1 or g.last_claim_token is distinct from u.claim_token
  or u.failure_claim_token is distinct from u.claim_token or u.claim_token is null
  or u.attempt_count<>4 or u.retry_count<>3 or u.retry_status is distinct from 'needs_input'
  or u.last_error_code is distinct from 'NATIVE_DRIVER_FAILED' or u.failed_step is distinct from 2 or u.failed_paper is distinct from 1
  or u.finished_at is not null or u.checkpoint ? 'publish_receipts' or u.lease_until>now_at
  or exists(select 1 from mtm_hw_private.lesson_uploads x where x.finished_at is null and x.lease_until>now_at)
  or exists(select 1 from mtm_hw_private.lesson_review_requests where upload_id=u.id)
  or exists(select 1 from mtm_hw_private.lesson_upload_paper2_steps where upload_id=u.id)
  or exists(select 1 from mtm_hw_private.btvn_lessons where code='web-'||replace(u.id::text,'-',''))
  or jsonb_typeof(u.checkpoint->'operator_repairs') is distinct from 'array' or jsonb_array_length(u.checkpoint->'operator_repairs')<>2
  or u.checkpoint->'operator_repairs'->0->>'repair_id' is distinct from '4e1e0b6d-0716-4d5a-9c3b-e1d3d0f6a8b2'
  or u.checkpoint->'operator_repairs'->1->>'repair_id' is distinct from '196cd98e-9de7-4db5-96e4-f6a19b58c98d'
  then raise exception 'CONTINUATION112_TARGET_NOT_FAILED_IDLE';end if;
 if not exists(select 1 from mtm_hw_private.lesson_upload_automation where singleton and enabled and activated_at='2026-11-13T02:49:20.506663Z') then raise exception 'CONTINUATION112_CONTROL_CHANGED';end if;
 select count(*),encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'attempt_count',attempt_count,'finished_at',finished_at,'published',checkpoint ? 'publish_receipts') order by id),'[]')::text,'UTF8')),'hex') into old_count,old_hash
 from mtm_hw_private.lesson_uploads where not is_test and created_at<'2026-11-13T02:49:20.506663Z';
 if old_count<>5 or old_hash is distinct from 'f121ccba4da5424452f78d93ce4cd976f81695b17d72aab33d648a1152745336' then raise exception 'CONTINUATION112_OLD5_CHANGED';end if;
 perform 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id for update;
 now_at=clock_timestamp();
 if expires<=now_at or expires>now_at+interval '60 minutes' then raise exception 'CONTINUATION112_EXPIRY_REQUIRED';end if;
 if (select jsonb_agg(jsonb_build_object('step',step,'status',status) order by step) from mtm_hw_private.lesson_upload_steps where upload_id=u.id) is distinct from '[{"step":1,"status":"xong"},{"step":2,"status":"loi"},{"step":3,"status":"cho"},{"step":4,"status":"cho"},{"step":5,"status":"cho"},{"step":6,"status":"cho"}]'::jsonb then raise exception 'CONTINUATION112_STEPS_CHANGED';end if;
 select to_jsonb(s) into prior_step from mtm_hw_private.lesson_upload_steps s where upload_id=u.id and step=2;
 insert into mtm_hw_private.lesson_continuation142_credit2(credit_id,credit_ordinal,upload_id,version,source_version,prior_grant_sha256,prior_grant,diagnosis_receipt_sha256,runtime_manifest_sha256,runtime_receipt_sha256,source_fix_commit,authority_ref,expires_at,audit)
 values(credit,2,u.id,u.version,g.source_version,prior_sha,prior_data,diagnosis_sha,manifest_sha,receipt_sha,fix_commit,authority,expires,
  jsonb_build_object('kind','owner_operator_second_processing_credit','prior_attempt_count',4,'prior_retry_count',3,'prior_error_code',u.last_error_code,'prior_step2',prior_step,'checkpoint_sha256',encode(sha256(convert_to(u.checkpoint::text,'UTF8')),'hex'),'old5_sha256',old_hash,'native_paid_budget_changed',false));
 update mtm_hw_private.lesson_upload_steps set status='cho',detail='Operator cấp credit thứ hai riêng nguồn test đã chẩn đoán; không thay hạn mức AI.',updated_at=now_at where upload_id=u.id and step=2;
 update mtm_hw_private.lesson_uploads set retry_status='queued',next_retry_at=now_at where id=u.id;
 return jsonb_build_object('accepted',true,'already_issued',false,'credit_id',credit,'status','authorized','processing_credits_used',0,'native_paid_budget_changed',false);
end$$;

-- Real jobs stay <=3; count5 is structurally possible only for the one target.
alter table mtm_hw_private.lesson_uploads drop constraint lesson_uploads_attempt_count_check;
alter table mtm_hw_private.lesson_uploads add constraint lesson_uploads_attempt_count_check check(attempt_count between 0 and 3 or (is_test and attempt_count=4) or (is_test and id='14227822-ce9a-4f0f-8df3-489a60b11392'::uuid and version=1 and work_kind='homework' and attempt_count=5));
create or replace function mtm_hw_private.lesson_continuation_fence142() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.attempt_count>3 and not (
  exists(select 1 from mtm_hw_private.lesson_continuation142 g where g.upload_id=new.id and g.version=new.version and new.is_test and new.work_kind='homework'
   and new.attempt_count=4 and g.processing_credits_used=1 and g.status='running' and g.last_claim_token=new.claim_token)
  or exists(select 1 from mtm_hw_private.lesson_continuation142_credit2 c where c.upload_id=new.id and c.version=new.version and new.is_test and new.work_kind='homework'
   and c.processing_credits_used=1 and c.last_claim_token=new.claim_token
   and ((new.attempt_count=5 and c.status='running') or (new.attempt_count=4 and c.status in ('running','waiting_review') and new.review_wait_credit_token=new.claim_token)))
 ) then raise exception 'CONTINUATION_CONSUMED_FENCE_REQUIRED';end if;
 return new;
end$$;

alter function public.mtm_lesson_upload_api(jsonb) rename to mtm_lesson_upload_api_before_continuation112;
create function public.mtm_lesson_upload_api(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text=p->>'action';u mtm_hw_private.lesson_uploads;after_u mtm_hw_private.lesson_uploads;c mtm_hw_private.lesson_continuation142_credit2;
 g mtm_hw_private.lesson_continuation142;token uuid;first_claim boolean;out jsonb;rr mtm_hw_private.lesson_review_requests;now_at timestamptz=clock_timestamp();
begin
 if a='worker_claim' and (p->>'worker_protocol'='112' or p ? 'operator_credit_id') then
  if coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
  if p->>'upload_id' is distinct from '14227822-ce9a-4f0f-8df3-489a60b11392' or p->'is_test' is distinct from 'true'::jsonb
   or p->'operator_continuation' is distinct from 'true'::jsonb or p->'auto' is distinct from 'false'::jsonb
   or p->>'worker_protocol' is distinct from '112' or coalesce(p->>'operator_credit_id','')!~'^[a-f0-9-]{36}$'
   or length(coalesce(p->>'worker_id','')) not between 1 and 100 then raise exception 'CONTINUATION112_EXPLICIT_TEST_SCOPE_REQUIRED';end if;
  select * into u from mtm_hw_private.lesson_uploads where id=(p->>'upload_id')::uuid for update;
  select * into g from mtm_hw_private.lesson_continuation142 where upload_id=u.id for update;
  select * into c from mtm_hw_private.lesson_continuation142_credit2 where upload_id=u.id for update;
  now_at=clock_timestamp();
  if c.credit_id is null or c.credit_id::text is distinct from p->>'operator_credit_id' or not mtm_hw_private.lesson_continuation_identity142(u)
   or c.prior_grant_sha256 is distinct from encode(sha256(convert_to(to_jsonb(g)::text,'UTF8')),'hex')
   or c.expires_at<=now_at or c.runtime_manifest_sha256 is distinct from p->>'runtime_manifest_sha256'
   or u.finished_at is not null or u.checkpoint ? 'publish_receipts' or u.attempt_count<>4 or u.lease_until>now_at
   or u.retry_status not in ('queued','running') or exists(select 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id and status='loi') then raise exception 'CONTINUATION112_NOT_ELIGIBLE';end if;
  first_claim=c.processing_credits_used=0 and c.status='authorized';
  if not first_claim then
   if c.review_resume_count>=2 then raise exception 'CONTINUATION112_REVIEW_RESUME_LIMIT';end if;
   select * into rr from mtm_hw_private.lesson_review_requests where upload_id=u.id and paper=1;
   if c.processing_credits_used<>1 or c.status<>'waiting_review' or u.review_wait_credit_token is distinct from c.last_claim_token
    or rr.request_hash is distinct from c.review_request_hash or rr.source_version is distinct from c.source_version
    or exists(select 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id and step<=3 and status<>'xong') then raise exception 'CONTINUATION112_REVIEW_RESUME_CHANGED';end if;
  end if;
  token=gen_random_uuid();
  update mtm_hw_private.lesson_continuation142_credit2 set processing_credits_used=1,status='running',consumed_at=coalesce(consumed_at,now_at),last_claim_token=token,review_resume_count=review_resume_count+case when first_claim then 0 else 1 end where credit_id=c.credit_id;
  update mtm_hw_private.lesson_uploads set claim_token=token,worker_id=p->>'worker_id',attempt_count=attempt_count+1,retry_status='running',next_retry_at=null,
   lease_until=now_at+make_interval(secs=>least(900,greatest(60,coalesce((p->>'lease_seconds')::int,600)))) where id=u.id returning * into after_u;
  return jsonb_build_object('job',(to_jsonb(after_u)-'lease_until'-'finished_at')||jsonb_build_object('lesson_code','web-'||replace(u.id::text,'-',''),'operator_continuation',true,'operator_credit_id',c.credit_id,'operator_credit_ordinal',2,'operator_processing_credits_used',1,'operator_review_resume',not first_claim,'steps',(select jsonb_agg(to_jsonb(s) order by step) from mtm_hw_private.lesson_upload_steps s where upload_id=u.id))||mtm_hw_private.lesson_worker_grade_context112(after_u));
 end if;
 -- All ordinary authorization, current-version, token, lease, publication and
 -- retry semantics run unchanged through the original111/110/108 API first.
 out=public.mtm_lesson_upload_api_before_continuation112(p);
 if a in ('worker_claim','worker_pending_review') and jsonb_typeof(out->'job')='object' then
  select * into u from mtm_hw_private.lesson_uploads where id=(out->'job'->>'id')::uuid;
  out=jsonb_set(out,'{job}',(out->'job')||mtm_hw_private.lesson_worker_grade_context112(u));
 end if;
 if a in ('worker_wait_review','worker_record_failure','worker_finish') then
  select * into u from mtm_hw_private.lesson_uploads where id=(p->>'upload_id')::uuid for update;
  select * into c from mtm_hw_private.lesson_continuation142_credit2 where upload_id=u.id for update;
  now_at=clock_timestamp();
  if c.credit_id is not null and c.processing_credits_used=1 and c.last_claim_token=u.claim_token then
   if a='worker_wait_review' and out->'allowed'='false'::jsonb then
    if p->>'source_version' is distinct from c.source_version or coalesce(p->>'request_hash','')!~'^[a-f0-9]{64}$'
     or u.review_wait_credit_token is distinct from u.claim_token or u.attempt_count<>4 then raise exception 'CONTINUATION112_REVIEW_CREDIT_CHANGED';end if;
    update mtm_hw_private.lesson_continuation142_credit2 set status='waiting_review',review_request_hash=p->>'request_hash',review_source_version=p->>'source_version' where credit_id=c.credit_id;
   elsif a='worker_record_failure' and c.status='running' and u.finished_at is null and not(u.checkpoint ? 'publish_receipts')
    and u.failure_claim_token=u.claim_token and u.last_error_code=p->>'code' and u.failed_step=(p->>'step')::int
    and exists(select 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id and step=u.failed_step and status='loi')
    and coalesce((out->>'already_recorded')::boolean,false)=false then
    update mtm_hw_private.lesson_continuation142_credit2 set status='failed',audit=audit||jsonb_build_object('extra_processing_failed',true,'last_error_code',u.last_error_code,'attempt_count',u.attempt_count,'retry_count',u.retry_count,'failed_at',now_at) where credit_id=c.credit_id;
   elsif a='worker_finish' and u.finished_at is not null then
    update mtm_hw_private.lesson_continuation142_credit2 set status='complete',audit=audit||jsonb_build_object('finished_at',u.finished_at) where credit_id=c.credit_id;
   end if;
  end if;
 end if;
 return out;
end$$;
-- Revoke inherited default grants BEFORE cloning the exact predecessor ACL.
revoke all on function public.mtm_lesson_upload_api(jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
do $acl$declare r record;grantee text;prior_acl jsonb;current_acl jsonb;begin
 for r in select x.* from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where p.oid='public.mtm_lesson_upload_api_before_continuation112(jsonb)'::regprocedure and x.privilege_type='EXECUTE' loop
  grantee=case when r.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(r.grantee)) end;
  execute 'grant execute on function public.mtm_lesson_upload_api(jsonb) to '||grantee||case when r.is_grantable then ' with grant option' else '' end;
 end loop;
 -- Abort the SAME DDL transaction before closing the alias or committing.
 -- Unknown custom default grantees are not silently removed or accepted.
 select coalesce(jsonb_agg(jsonb_build_object('grantee',x.grantee,'privilege',x.privilege_type,'grantable',x.is_grantable) order by x.grantee,x.privilege_type,x.is_grantable),'[]'::jsonb) into prior_acl
 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where p.oid='public.mtm_lesson_upload_api_before_continuation112(jsonb)'::regprocedure;
 select coalesce(jsonb_agg(jsonb_build_object('grantee',x.grantee,'privilege',x.privilege_type,'grantable',x.is_grantable) order by x.grantee,x.privilege_type,x.is_grantable),'[]'::jsonb) into current_acl
 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where p.oid='public.mtm_lesson_upload_api(jsonb)'::regprocedure;
 if current_acl is distinct from prior_acl then raise exception 'CONTINUATION112_API_ACL_CHANGED';end if;
end$acl$;
revoke all on function public.mtm_lesson_upload_api_before_continuation112(jsonb),mtm_hw_private.lesson_grant_continuation112(uuid,text,text,text,text,text,text,timestamptz),mtm_hw_private.lesson_continuation_prior_immutable112() from public,anon,authenticated,service_role,mtm_btvn_publisher;
commit;
