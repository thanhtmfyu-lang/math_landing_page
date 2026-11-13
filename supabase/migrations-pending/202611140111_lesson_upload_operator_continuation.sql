-- Review-only migration111. Explicit owner-operator test continuation; no grant is seeded.
-- Before release: pin actual catalog predecessor and review deployment source/hash.
-- This is ONE operator processing credit, not a reset or an automatic retry increase.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$begin
 if to_regprocedure('public.mtm_lesson_upload_api_before_assessment110(jsonb)') is null then raise exception 'LESSON_UPLOAD_110_REQUIRED';end if;
 if to_regprocedure('public.mtm_lesson_upload_api_before_continuation142(jsonb)') is not null then raise exception 'CONTINUATION_111_ALREADY_INSTALLED';end if;
end$$;

-- Replace in place: keep the original OID/ACL used by existing retry-info SQL.
-- Public action hints only; neither unknown error text nor private driver output is reflected.
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
 when code is null then 'Chưa có lỗi cần thử lại.'
 else 'Cần kiểm tra nguồn hoặc biên nhận trước khi tiếp tục.' end
$$;

create table mtm_hw_private.lesson_continuation142(
 upload_id uuid primary key references mtm_hw_private.lesson_uploads(id),
 version integer not null check(version=1),
 source_version text not null check(source_version='78cf60e22fa55962e11391814a0fb7c157dc9f1936ce2b3a8d8551e9af89ba45'),
 scope_sha256 text not null check(scope_sha256='69998c845d132ca8737e0928699ccbc57dbe7dba3b31e76c408cf3b0af6258f9'),
 runtime_manifest_sha256 text not null check(runtime_manifest_sha256~'^[a-f0-9]{64}$'),
 runtime_receipt_sha256 text not null check(runtime_receipt_sha256~'^[a-f0-9]{64}$'),
 source_fix_commit text not null check(source_fix_commit~'^[a-f0-9]{40}$'),
 authority_ref text not null check(length(authority_ref) between 8 and 240),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 processing_credits_used integer not null default 0 check(processing_credits_used between 0 and 1),
 status text not null default 'authorized' check(status in ('authorized','running','waiting_review','complete','failed')),
 consumed_at timestamptz,last_claim_token uuid,review_request_hash text,review_source_version text,
 review_resume_count integer not null default 0 check(review_resume_count between 0 and 2),
 audit jsonb not null,
 check(upload_id='14227822-ce9a-4f0f-8df3-489a60b11392'::uuid),check(expires_at>created_at)
);
alter table mtm_hw_private.lesson_continuation142 enable row level security;
revoke all on mtm_hw_private.lesson_continuation142 from public,anon,authenticated,service_role,mtm_btvn_publisher;

create function mtm_hw_private.lesson_continuation_identity142(u mtm_hw_private.lesson_uploads) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(u.id='14227822-ce9a-4f0f-8df3-489a60b11392'::uuid and u.version=1 and u.is_test
 and u.work_kind='homework' and mtm_hw_private.lesson_upload_current(u) and u.lesson_date=date '2026-11-10'
 and u.class_ids=array['0d31a7f2-1da1-4b03-b248-22c260d1c713'::uuid]
 and u.class_dates='{"0d31a7f2-1da1-4b03-b248-22c260d1c713":"2026-11-10"}'::jsonb
 and u.uploaded_by='d7ec8afe-76bc-4d86-90a6-fd689ea60895'::uuid
 and u.client_request_id='8db1f8e3-a8e1-4252-8938-6bad1a724303'::uuid
 and u.created_at='2026-11-13T16:54:23.948178Z'::timestamptz
 and encode(sha256(convert_to(u.task_scope,'UTF8')),'hex')='69998c845d132ca8737e0928699ccbc57dbe7dba3b31e76c408cf3b0af6258f9'
 and encode(sha256(convert_to(u.title,'UTF8')),'hex')='6e36f54c9ab24bd6af9252099f2a11dff16a52a469394a75ed0b650218a8f18b'
 and encode(sha256(convert_to(jsonb_build_array(u.homework_path,u.answer_path)::text,'UTF8')),'hex')='299a63dc2903e7af6e53636902c38be8686a2c99386d5fe65edff91eafc3fa7b'
 and (select count(*) from jsonb_object_keys(u.due_at_by_class))=1
 and (u.due_at_by_class->>'0d31a7f2-1da1-4b03-b248-22c260d1c713')::timestamptz='2026-11-17T12:30:00Z'::timestamptz
 and u.homework2_path is null and u.handout_path is null and u.video_url is null and u.answer_text is null
 and exists(select 1 from storage.objects o where o.bucket_id='mtm-lesson-private' and o.name=u.homework_path)
 and exists(select 1 from storage.objects o where o.bucket_id='mtm-lesson-private' and o.name=u.answer_path),false)
$$;

-- No execute grant: only the existing database owner/operator may issue this row.
-- Runtime/byte proofs and authority are verified externally before the owner calls it.
create function mtm_hw_private.lesson_grant_continuation142(manifest_sha text,receipt_sha text,fix_commit text,authority text,expires timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u mtm_hw_private.lesson_uploads;g mtm_hw_private.lesson_continuation142;prior_step jsonb;old_hash text;old_count integer;now_at timestamptz=clock_timestamp();
begin
 if manifest_sha is null or manifest_sha!~'^[a-f0-9]{64}$' or receipt_sha is null or receipt_sha!~'^[a-f0-9]{64}$'
  or fix_commit is null or fix_commit!~'^[a-f0-9]{40}$' or authority is null or length(authority) not between 8 and 240
  or expires is null or expires<=now_at or expires>now_at+interval '60 minutes' then raise exception 'CONTINUATION_PROOF_REQUIRED';end if;
 select * into u from mtm_hw_private.lesson_uploads where id='14227822-ce9a-4f0f-8df3-489a60b11392' for update;
 if not mtm_hw_private.lesson_continuation_identity142(u) then raise exception 'CONTINUATION_SOURCE_CHANGED';end if;
 select * into g from mtm_hw_private.lesson_continuation142 where upload_id=u.id for update;
 now_at=clock_timestamp();
 if expires<=now_at or expires>now_at+interval '60 minutes' then raise exception 'CONTINUATION_PROOF_REQUIRED';end if;
 if g.upload_id is not null then
  if (g.runtime_manifest_sha256,g.runtime_receipt_sha256,g.source_fix_commit,g.authority_ref,g.expires_at) is distinct from (manifest_sha,receipt_sha,fix_commit,authority,expires) then raise exception 'CONTINUATION_ALREADY_ISSUED';end if;
  return jsonb_build_object('accepted',true,'already_issued',true,'processing_credits_used',g.processing_credits_used,'status',g.status);
 end if;
 if u.attempt_count<>3 or u.retry_count<>3 or u.retry_status is distinct from 'needs_input'
  or u.last_error_code is distinct from 'NATIVE_DRIVER_FAILED' or u.failed_step is distinct from 2 or u.failed_paper is distinct from 1
  or u.finished_at is not null or u.checkpoint ? 'publish_receipts' or u.lease_until>now_at
  or jsonb_typeof(u.checkpoint->'operator_repairs') is distinct from 'array'
  or jsonb_array_length(u.checkpoint->'operator_repairs')<>2
  or u.checkpoint->'operator_repairs'->0->>'repair_id' is distinct from '4e1e0b6d-0716-4d5a-9c3b-e1d3d0f6a8b2'
  or u.checkpoint->'operator_repairs'->1->>'repair_id' is distinct from '196cd98e-9de7-4db5-96e4-f6a19b58c98d'
  or exists(select 1 from mtm_hw_private.lesson_uploads x where x.finished_at is null and x.lease_until>now_at)
  or exists(select 1 from mtm_hw_private.lesson_review_requests where upload_id=u.id)
  or exists(select 1 from mtm_hw_private.lesson_upload_paper2_steps where upload_id=u.id)
  or exists(select 1 from mtm_hw_private.btvn_lessons where code='web-'||replace(u.id::text,'-','')) then raise exception 'CONTINUATION_TARGET_NOT_IDLE';end if;
 if not exists(select 1 from mtm_hw_private.lesson_upload_automation where singleton and enabled and activated_at='2026-11-13T02:49:20.506663Z') then raise exception 'CONTINUATION_CONTROL_CHANGED';end if;
 select count(*),encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'attempt_count',attempt_count,'finished_at',finished_at,'published',checkpoint ? 'publish_receipts') order by id),'[]')::text,'UTF8')),'hex') into old_count,old_hash
 from mtm_hw_private.lesson_uploads where not is_test and created_at<'2026-11-13T02:49:20.506663Z';
 if old_count<>5 or old_hash is distinct from 'f121ccba4da5424452f78d93ce4cd976f81695b17d72aab33d648a1152745336' then raise exception 'CONTINUATION_OLD5_CHANGED';end if;
 perform 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id for update;
 if (select jsonb_agg(jsonb_build_object('step',step,'status',status) order by step) from mtm_hw_private.lesson_upload_steps where upload_id=u.id) is distinct from '[{"step":1,"status":"xong"},{"step":2,"status":"loi"},{"step":3,"status":"cho"},{"step":4,"status":"cho"},{"step":5,"status":"cho"},{"step":6,"status":"cho"}]'::jsonb then raise exception 'CONTINUATION_STEPS_CHANGED';end if;
 select to_jsonb(s) into prior_step from mtm_hw_private.lesson_upload_steps s where upload_id=u.id and step=2;
 insert into mtm_hw_private.lesson_continuation142(upload_id,version,source_version,scope_sha256,runtime_manifest_sha256,runtime_receipt_sha256,source_fix_commit,authority_ref,expires_at,audit)
 values(u.id,u.version,'78cf60e22fa55962e11391814a0fb7c157dc9f1936ce2b3a8d8551e9af89ba45','69998c845d132ca8737e0928699ccbc57dbe7dba3b31e76c408cf3b0af6258f9',manifest_sha,receipt_sha,fix_commit,authority,expires,
  jsonb_build_object('kind','owner_operator_single_processing_credit','prior_attempt_count',3,'prior_retry_count',3,'prior_error_code',u.last_error_code,'prior_step2',prior_step,'checkpoint_sha256',encode(sha256(convert_to(u.checkpoint::text,'UTF8')),'hex'),'old5_sha256',old_hash,'native_paid_budget_changed',false));
 update mtm_hw_private.lesson_upload_steps set status='cho',detail='Operator đã cấp một lượt xử lý bổ sung riêng nguồn test; giữ nguyên lịch sử và hạn mức AI.',updated_at=now_at where upload_id=u.id and step=2;
 update mtm_hw_private.lesson_uploads set retry_status='queued',next_retry_at=now_at where id=u.id;
 return jsonb_build_object('accepted',true,'already_issued',false,'processing_credits_used',0,'status','authorized','native_paid_budget_changed',false);
end$$;

-- Keep the real-job structural limit at3. Test count4 also requires the private consumed-credit fence.
alter table mtm_hw_private.lesson_uploads drop constraint lesson_uploads_attempt_count_check;
alter table mtm_hw_private.lesson_uploads add constraint lesson_uploads_attempt_count_check check(attempt_count between 0 and 3 or (is_test and attempt_count=4));
create function mtm_hw_private.lesson_continuation_fence142() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.attempt_count>3 and not exists(select 1 from mtm_hw_private.lesson_continuation142 g where g.upload_id=new.id and g.version=new.version and new.is_test and new.work_kind='homework'
  and g.processing_credits_used=1 and g.status='running' and g.last_claim_token=new.claim_token) then raise exception 'CONTINUATION_CONSUMED_FENCE_REQUIRED';end if;
 return new;
end$$;
create trigger lesson_continuation_fence142 before insert or update of attempt_count,claim_token,is_test on mtm_hw_private.lesson_uploads for each row execute function mtm_hw_private.lesson_continuation_fence142();

-- Preserve the existing API ACL by renaming it, creating its replacement, then copying ACL below.
-- No gateway action or teacher/admin role is added. Only service worker_claim with explicit
-- operator_continuation=true,is_test=true,auto=false,target id,protocol111 and the pinned runtime can consume it.
alter function public.mtm_lesson_upload_api(jsonb) rename to mtm_lesson_upload_api_before_continuation142;
create function public.mtm_lesson_upload_api(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text=p->>'action';u mtm_hw_private.lesson_uploads;after_u mtm_hw_private.lesson_uploads;g mtm_hw_private.lesson_continuation142;
 token uuid;first_claim boolean;out jsonb;request_row mtm_hw_private.lesson_review_requests;now_at timestamptz=clock_timestamp();
begin
 if a='worker_claim' and coalesce((p->>'operator_continuation')::boolean,false) then
  if coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
  if p->>'upload_id' is distinct from '14227822-ce9a-4f0f-8df3-489a60b11392' or p->'is_test' is distinct from 'true'::jsonb
   or coalesce((p->>'auto')::boolean,false) or p->>'worker_protocol' is distinct from '111' or length(coalesce(p->>'worker_id','')) not between 1 and 100 then raise exception 'CONTINUATION_EXPLICIT_TEST_SCOPE_REQUIRED';end if;
  select * into u from mtm_hw_private.lesson_uploads where id=(p->>'upload_id')::uuid for update;
  select * into g from mtm_hw_private.lesson_continuation142 where upload_id=u.id for update;
  now_at=clock_timestamp();
  if g.upload_id is null or not mtm_hw_private.lesson_continuation_identity142(u) or g.expires_at<=now_at or g.runtime_manifest_sha256 is distinct from p->>'runtime_manifest_sha256'
   or u.finished_at is not null or u.checkpoint ? 'publish_receipts' or u.attempt_count<>3 or u.lease_until>now_at
   or u.retry_status not in ('queued','running') or exists(select 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id and status='loi') then raise exception 'CONTINUATION_NOT_ELIGIBLE';end if;
  first_claim=g.processing_credits_used=0 and g.status='authorized';
  if not first_claim then
   if g.review_resume_count>=2 then raise exception 'CONTINUATION_REVIEW_RESUME_LIMIT';end if;
   select * into request_row from mtm_hw_private.lesson_review_requests where upload_id=u.id and paper=1;
   if g.processing_credits_used<>1 or g.status<>'waiting_review' or u.review_wait_credit_token is distinct from g.last_claim_token
    or request_row.request_hash is distinct from g.review_request_hash or request_row.source_version is distinct from g.source_version
    or exists(select 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id and step<=3 and status<>'xong') then raise exception 'CONTINUATION_REVIEW_RESUME_CHANGED';end if;
  end if;
  token=gen_random_uuid();
  update mtm_hw_private.lesson_continuation142 set processing_credits_used=1,status='running',consumed_at=coalesce(consumed_at,now_at),last_claim_token=token,review_resume_count=review_resume_count+case when first_claim then 0 else 1 end where upload_id=u.id;
  update mtm_hw_private.lesson_uploads set claim_token=token,worker_id=p->>'worker_id',attempt_count=attempt_count+1,retry_status='running',next_retry_at=null,
   lease_until=now_at+make_interval(secs=>least(900,greatest(60,coalesce((p->>'lease_seconds')::int,600)))) where id=u.id returning * into after_u;
  return jsonb_build_object('job',(to_jsonb(after_u)-'lease_until'-'finished_at')||jsonb_build_object('lesson_code','web-'||replace(u.id::text,'-',''),'operator_continuation',true,
   'operator_processing_credits_used',1,'operator_review_resume',not first_claim,'steps',(select jsonb_agg(to_jsonb(s) order by step) from mtm_hw_private.lesson_upload_steps s where upload_id=u.id)));
 end if;
 -- Existing current-version/lease/claim-token checks execute BEFORE any grant bookkeeping.
 out=public.mtm_lesson_upload_api_before_continuation142(p);
 if a in ('worker_wait_review','worker_record_failure','worker_finish') then
  select * into u from mtm_hw_private.lesson_uploads where id=(p->>'upload_id')::uuid for update;
  select * into g from mtm_hw_private.lesson_continuation142 where upload_id=u.id for update;
  if g.upload_id is not null and g.processing_credits_used=1 and g.last_claim_token=u.claim_token then
   if a='worker_wait_review' and out->'allowed'='false'::jsonb then
    if p->>'source_version' is distinct from g.source_version or coalesce(p->>'request_hash','')!~'^[a-f0-9]{64}$'
     or u.review_wait_credit_token is distinct from u.claim_token or u.attempt_count<>3 then raise exception 'CONTINUATION_REVIEW_CREDIT_CHANGED';end if;
    update mtm_hw_private.lesson_continuation142 set status='waiting_review',review_request_hash=p->>'request_hash',review_source_version=p->>'source_version' where upload_id=u.id;
   elsif a='worker_record_failure' and g.status='running' then
    update mtm_hw_private.lesson_continuation142 set status='failed',audit=audit||jsonb_build_object('extra_processing_failed',true,'last_error_code',u.last_error_code,'attempt_count',u.attempt_count,'retry_count',u.retry_count,'failed_at',now_at) where upload_id=u.id;
   elsif a='worker_finish' and u.finished_at is not null then
    update mtm_hw_private.lesson_continuation142 set status='complete',audit=audit||jsonb_build_object('finished_at',u.finished_at) where upload_id=u.id;
   end if;
  end if;
 end if;
 return out;
end$$;

-- Copy the exact prior direct ACL, not a larger hardcoded GRANT list.
revoke all on function public.mtm_lesson_upload_api(jsonb) from public;
do $acl$
declare r record;grantee text;
begin
 for r in select x.* from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where p.oid='public.mtm_lesson_upload_api_before_continuation142(jsonb)'::regprocedure and x.privilege_type='EXECUTE' loop
  grantee=case when r.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(r.grantee)) end;
  execute 'grant execute on function public.mtm_lesson_upload_api(jsonb) to '||grantee||case when r.is_grantable then ' with grant option' else '' end;
 end loop;
end$acl$;
revoke all on function public.mtm_lesson_upload_api_before_continuation142(jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
revoke all on function mtm_hw_private.lesson_continuation_identity142(mtm_hw_private.lesson_uploads),mtm_hw_private.lesson_grant_continuation142(text,text,text,text,timestamptz),mtm_hw_private.lesson_continuation_fence142()
 from public,anon,authenticated,service_role,mtm_btvn_publisher;
commit;
