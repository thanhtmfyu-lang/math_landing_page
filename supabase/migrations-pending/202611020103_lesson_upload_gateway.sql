-- Scoped access for the existing publisher Edge. No service-role leaves Edge.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table mtm_hw_private.lesson_uploads add column if not exists review_wait_credit_token uuid;
create table if not exists mtm_hw_private.lesson_review_requests(
 upload_id uuid references mtm_hw_private.lesson_uploads(id),paper int check(paper in (1,2)),request_hash text check(request_hash~'^[a-f0-9]{64}$'),
 source_version text not null check(source_version~'^[a-f0-9]{64}$'),requested_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz,result jsonb,last_attempt_at timestamptz,primary key(upload_id,paper));
alter table mtm_hw_private.lesson_review_requests add column if not exists last_attempt_at timestamptz;
alter table mtm_hw_private.lesson_review_requests enable row level security;
revoke all on mtm_hw_private.lesson_review_requests from public,anon,authenticated,service_role,mtm_btvn_publisher;
create or replace function mtm_hw_private.lesson_teacher_pending_allowed(u mtm_hw_private.lesson_uploads,proof jsonb,source text,paper int) returns boolean
language sql stable security definer set search_path='' as $$
 select proof->>'validator'='true' and proof->>'independent'='false' and proof->>'teacher_source'='true'
 and proof->>'status'='teacher-pending' and u.claim_token is not null and u.lease_until>clock_timestamp()
 and mtm_hw_private.lesson_upload_current(u) and exists(select 1 from mtm_hw_private.lesson_review_requests r
 where r.upload_id=u.id and r.paper=$4 and r.request_hash=proof->>'request_hash' and r.source_version=source
 and r.completed_at is null and clock_timestamp()>=r.requested_at+interval '20 minutes')
$$;
-- Keep every original publisher guard. Only an active web capability and the
-- immutable server-clock timer can authorize truthful teacher-pending proof.
create or replace function mtm_hw_private.lesson_teacher_pending_payload(p jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(bool_or(p->>'lesson_key'='web-'||replace(u.id::text,'-','') and mtm_hw_private.lesson_teacher_pending_allowed(u,p->'verification',p->>'source_version',1)),false)
 from mtm_hw_private.lesson_publish_capability c join mtm_hw_private.lesson_uploads u on u.id=c.upload_id and u.claim_token=c.claim_token where c.txid=txid_current()
$$;
revoke all on function mtm_hw_private.lesson_teacher_pending_payload(jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
do $guard$
declare src text;needle text=$n$p_payload->'verification'->>'independent' is distinct from 'true'$n$;
begin
 src=pg_get_functiondef('public.mtm_btvn_pipeline_before_rank(text,jsonb)'::regprocedure);
 if position('lesson_teacher_pending_payload' in src)=0 then
  if position(needle in src)=0 then raise exception 'GATEWAY_PUBLISHER_ANCHOR_CHANGED';end if;
  execute replace(src,needle,'('||needle||' and not mtm_hw_private.lesson_teacher_pending_payload(p_payload))');
 end if;
end$guard$;
do $$begin if to_regprocedure('public.mtm_lesson_upload_api_before_review_gateway(jsonb)') is null then alter function public.mtm_lesson_upload_api(jsonb) rename to mtm_lesson_upload_api_before_review_gateway;end if;end$$;
create or replace function public.mtm_lesson_upload_api(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<review_gateway>>
declare a text=p->>'action';u mtm_hw_private.lesson_uploads;r mtm_hw_private.lesson_review_requests;paper int;ready boolean;
begin
 if a not in ('worker_wait_review','worker_pending_review','worker_review_result') or a is null then return public.mtm_lesson_upload_api_before_review_gateway(p);end if;
 if coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 if octet_length(p::text)>1048576 then raise exception 'INVALID_REVIEW_PAYLOAD';end if;
 if a='worker_pending_review' then
  select x.* into u from mtm_hw_private.lesson_uploads x join mtm_hw_private.lesson_review_requests rr on rr.upload_id=x.id where x.is_test=coalesce((p->>'is_test')::boolean,false) and x.finished_at is not null and rr.completed_at is null and (rr.last_attempt_at is null or rr.last_attempt_at<clock_timestamp()-interval '90 seconds') and mtm_hw_private.lesson_upload_current(x) order by coalesce(rr.last_attempt_at,rr.requested_at) limit 1 for update of x skip locked;
  if u.id is null then return '{"job":null}';end if;
  update mtm_hw_private.lesson_review_requests set last_attempt_at=clock_timestamp() where upload_id=u.id and completed_at is null;
  return jsonb_build_object('job',to_jsonb(u)||jsonb_build_object('lesson_code','web-'||replace(u.id::text,'-',''),'pending_reviews',(select jsonb_agg(jsonb_build_object('paper',rr.paper,'request_hash',rr.request_hash,'source_version',rr.source_version)) from mtm_hw_private.lesson_review_requests rr where rr.upload_id=u.id and rr.completed_at is null)));
 end if;
 select * into u from mtm_hw_private.lesson_uploads where id=(p->>'upload_id')::uuid for update;
 if u.id is null or not mtm_hw_private.lesson_upload_current(u) then raise exception 'STALE_UPLOAD_OR_LEASE';end if;
 paper=(p->>'paper')::int;if paper is null or paper not in(1,2) or (paper=2 and u.homework2_path is null) then raise exception 'INVALID_REVIEW_PAPER';end if;
 if a='worker_wait_review' then
  perform public.mtm_lesson_upload_api_before_review_gateway(jsonb_build_object('action','worker_assert_current','upload_id',u.id,'claim_token',p->>'claim_token'));
  insert into mtm_hw_private.lesson_review_requests(upload_id,paper,request_hash,source_version) values(u.id,paper,p->>'request_hash',p->>'source_version') on conflict do nothing;
  select * into r from mtm_hw_private.lesson_review_requests where upload_id=u.id and lesson_review_requests.paper=review_gateway.paper;
  if r.request_hash is distinct from p->>'request_hash' or r.source_version is distinct from p->>'source_version' then raise exception 'REVIEW_SOURCE_CHANGED';end if;
  ready=clock_timestamp()>=r.requested_at+interval '20 minutes';
  -- Credit only this intentional wait claim ONCE across both papers. Preserve
  -- every previous failure; this is not the native AI budget or final cap.
  if not ready then update mtm_hw_private.lesson_uploads set lease_until=clock_timestamp()+interval '110 seconds',attempt_count=case when review_wait_credit_token is distinct from claim_token then greatest(0,attempt_count-1) else attempt_count end,review_wait_credit_token=claim_token where id=u.id;end if;
  return jsonb_build_object('allowed',ready);
 end if;
 select * into r from mtm_hw_private.lesson_review_requests where upload_id=u.id and lesson_review_requests.paper=review_gateway.paper;
 if r.request_hash is distinct from p->>'request_hash' or r.source_version is distinct from p->>'source_version' or u.finished_at is null then raise exception 'REVIEW_SOURCE_CHANGED';end if;
 if r.completed_at is not null then return '{"ok":true,"already_applied":true}';end if;
 if p->>'matched' not in ('true','false') or coalesce(p->>'provider','') not in ('grok','agy') or nullif(p->>'model','') is null or coalesce(p->>'receipt_hash','')!~'^[a-f0-9]{64}$' then raise exception 'PROVIDER_RECEIPT_REQUIRED';end if;
 update mtm_hw_private.lesson_review_requests set completed_at=clock_timestamp(),result=p-'action' where upload_id=u.id and lesson_review_requests.paper=review_gateway.paper;
 if paper=1 then update mtm_hw_private.btvn_lessons set verification=verification||jsonb_build_object('post_publication_review',p-'action') where code='web-'||replace(u.id::text,'-','') and source_version=r.source_version;
 else update mtm_hw_private.btvn_second_papers set verification=verification||jsonb_build_object('post_publication_review',p-'action') where lesson_code='web-'||replace(u.id::text,'-','') and source_version=r.source_version;end if;
 if paper=1 then update mtm_hw_private.lesson_upload_steps set status=case when (p->>'matched')::boolean then 'xong' else 'loi' end,detail=case when (p->>'matched')::boolean then 'Đã kiểm độc lập sau khi giao bài.' else 'Kết quả kiểm độc lập khác khóa GV; quản lý kiểm tra. Giữ nguyên khóa và điểm đã lưu.' end,updated_at=clock_timestamp() where upload_id=u.id and step=4;
 else update mtm_hw_private.lesson_upload_paper2_steps set status=case when (p->>'matched')::boolean then 'xong' else 'loi' end,detail=case when (p->>'matched')::boolean then 'Đã kiểm độc lập sau khi giao bài.' else 'Kết quả kiểm độc lập khác khóa GV; quản lý kiểm tra. Giữ nguyên khóa và điểm đã lưu.' end,updated_at=clock_timestamp() where upload_id=u.id and step=4;end if;
 return '{"ok":true,"grades_unchanged":true,"key_unchanged":true}';
end$$;
revoke all on function public.mtm_lesson_upload_api_before_review_gateway(jsonb),public.mtm_lesson_upload_api(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mtm_lesson_upload_api(jsonb) to authenticated,service_role;
create or replace function public.mtm_lesson_upload_gateway(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text=p->>'action';u mtm_hw_private.lesson_uploads;path text;
begin
 if coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 if p is null or octet_length(p::text)>8388608 then raise exception 'INVALID_LESSON_GATEWAY_PAYLOAD';end if;
 if a in ('worker_claim','worker_assert_current','worker_checkpoint','worker_finish','worker_publish','worker_materials','worker_wait_review','worker_pending_review','worker_review_result') then return public.mtm_lesson_upload_api(p);end if;
 if a not in ('worker_source','worker_asset_authorize') or a is null then raise exception 'INVALID_LESSON_GATEWAY_ACTION';end if;
 perform public.mtm_lesson_upload_api(jsonb_build_object('action','worker_assert_current','upload_id',p->>'upload_id','claim_token',p->>'claim_token'));
 select * into u from mtm_hw_private.lesson_uploads where id=(p->>'upload_id')::uuid;
 if a='worker_source' then
  path=case p->>'kind' when 'homework' then u.homework_path when 'answer' then u.answer_path when 'homework2' then u.homework2_path when 'answer2' then u.answer2_path when 'handout' then u.handout_path end;
  if path is null then raise exception 'SOURCE_NOT_PRESENT';end if;
  return jsonb_build_object('bucket','mtm-lesson-private','path',path);
 end if;
 path=p->>'path';
 if path is null or path!~('^btvn/web-'||replace(u.id::text,'-','')||'/[a-f0-9]{64}/[a-zA-Z0-9_/-]+\.(png|pdf)$') or path like '%..%' then raise exception 'ASSET_OUTSIDE_UPLOAD';end if;
 return '{"ok":true}'::jsonb;
end$$;
revoke all on function public.mtm_lesson_upload_gateway(jsonb) from public,anon,authenticated,mtm_btvn_publisher;
grant execute on function public.mtm_lesson_upload_gateway(jsonb) to service_role;
commit;
