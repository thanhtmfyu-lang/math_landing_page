-- Require an independent result before any new web homework publication.
-- Keep the wait credit before the budget elapses. Record a terminal, same-claim failure
-- on the stock retry path when the budget or earliest class deadline has passed.
-- Preserve old published review backfill, protocols, and privileges.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
set local search_path=pg_catalog;

do $install$
declare
 target record;
 original pg_proc%rowtype;
 definition text;
 old_anchor text;
 digest text;
 pos int;
begin
 for target in select * from (values
  ('public.mtm_lesson_upload_api_before_deadline107(jsonb)',
   '6ee9903a10893e7d50f9d1090ea3ef54e4e8c21ebf9d9e29b1ccaf01d3f6297f',
   '4141f2a6af7f41623fa8d1aeae6852d2f4a4392ea223316e32284435fa7d1ef6',
   'v', 'plpgsql',
   array[$anchor$r mtm_hw_private.lesson_review_requests;paper int;ready boolean;$anchor$,
         $anchor$  ready=clock_timestamp()>=r.requested_at+interval '20 minutes';$anchor$,
         $anchor$  if not ready then update mtm_hw_private.lesson_uploads set lease_until=clock_timestamp()+interval '110 seconds',attempt_count=case when review_wait_credit_token is distinct from claim_token then greatest(0,attempt_count-1) else attempt_count end,review_wait_credit_token=claim_token where id=u.id;end if;$anchor$,
         $anchor$  return jsonb_build_object('allowed',ready);$anchor$],
   array[$anchor$r mtm_hw_private.lesson_review_requests;paper int;observed_at timestamptz;terminal_code text;failure jsonb;$anchor$,
         $anchor$  if u.checkpoint ? 'publish_receipts' or r.completed_at is not null then
   return jsonb_build_object('allowed',false,'independent_required',true);
  end if;
  observed_at=clock_timestamp();
  if exists(select 1 from jsonb_each_text(u.due_at_by_class) due(class_id,stamp)
            where due.class_id=any(array(select id::text from unnest(u.class_ids) id))
              and due.stamp::timestamptz<=observed_at) then
   terminal_code='INDEPENDENT_REVIEW_DEADLINE_ELAPSED';
  elsif observed_at>=r.requested_at+interval '20 minutes' then
   terminal_code='INDEPENDENT_REVIEW_TIMEOUT';
  end if;
  if terminal_code is not null then
   failure=public.mtm_lesson_upload_api(jsonb_build_object('action','worker_record_failure',
           'upload_id',u.id,'claim_token',u.claim_token,'step',4,'paper',paper,'code',terminal_code));
   if failure->>'last_error_code' is distinct from terminal_code then
    raise exception 'INDEPENDENT_REVIEW_TERMINAL_NOT_CONFIRMED';
   end if;
   return jsonb_build_object('allowed',false,'independent_required',true,'terminal',true,'code',terminal_code);
  end if;$anchor$,
         $anchor$  update mtm_hw_private.lesson_uploads set lease_until=clock_timestamp()+interval '110 seconds',attempt_count=case when review_wait_credit_token is distinct from claim_token then greatest(0,attempt_count-1) else attempt_count end,review_wait_credit_token=claim_token where id=u.id;$anchor$,
         $anchor$  return jsonb_build_object('allowed',false,'independent_required',true);$anchor$]),
  ('mtm_hw_private.lesson_teacher_pending_allowed(mtm_hw_private.lesson_uploads,jsonb,text,integer)',
   'a4c4e51d509e18ca7847d08c118d3788d3e598efa00263e747a1382d9255c7d1',
   '27318ca20fee7c0bdcd829c113ef3a6833c384bcf85d7bb9ba67034eb775bebc',
   's', 'sql',
   array[$anchor$select u.work_kind='homework' and mtm_hw_private.lesson_teacher_pending_before_assessment110(u,proof,source,paper)$anchor$],
   array['select false']),
  ('public.mtm_lesson_upload_api_before_review_gateway(jsonb)',
   'f829cbe5e5f1da159572bc91633b23766222c87365cabd2f23fdad3b982f0d1b',
   'e6bfa872cdb0aa07390fbd1ba6b1f3213d9be768bde48cab7b89fd382bf3fc16',
   'v', 'plpgsql',
   array[$anchor$or (coalesce(v->'verification'->>'provider','') not in ('grok','agy') and not mtm_hw_private.lesson_teacher_pending_allowed(u,v->'verification',v->>'source_version',2))$anchor$],
   array[$anchor$or v->'verification'->'independent' is distinct from 'true'::jsonb
    or coalesce(v->'verification'->>'provider','') not in ('grok','agy')$anchor$])
 ) pins(signature,stock_sha,new_sha,volatility,lang,old_anchors,new_anchors) loop
  select * into strict original from pg_proc where oid=to_regprocedure(target.signature);
  if current_user is distinct from pg_get_userbyid(original.proowner)
     or not original.prosecdef or original.proconfig is distinct from array['search_path=""']::text[]
     or original.provolatile::text is distinct from target.volatility
     or (select lanname::text from pg_language where oid=original.prolang) is distinct from target.lang
     or exists(select 1 from (values ('anon'),('authenticated'),('service_role'),('mtm_btvn_publisher')) actors(role_name)
               where has_function_privilege(actors.role_name,original.oid,'EXECUTE'))
     or exists(select 1 from aclexplode(coalesce(original.proacl,acldefault('f',original.proowner))) permissions
               where permissions.grantee=0 and permissions.privilege_type='EXECUTE') then
   raise exception 'REVIEW_GATE133_PRIVATE_ROUTINE_METADATA_CHANGED';
  end if;

  digest=encode(sha256(convert_to(btrim(replace(original.prosrc,E'\r\n',E'\n'),E' \r\n\t'),'UTF8')),'hex');
  if digest=target.new_sha then continue;end if;
  if digest is distinct from target.stock_sha then raise exception 'REVIEW_GATE133_STOCK_ROUTINE_CHANGED';end if;

  definition=replace(pg_get_functiondef(original.oid),E'\r\n',E'\n');
  for pos in 1..cardinality(target.old_anchors) loop
   old_anchor=target.old_anchors[pos];
   if (length(definition)-length(replace(definition,old_anchor,'')))/length(old_anchor)<>1 then
    raise exception 'REVIEW_GATE133_ANCHOR_CHANGED';
   end if;
   definition=replace(definition,old_anchor,target.new_anchors[pos]);
  end loop;
  execute definition;
  if not exists(select 1 from pg_proc p where p.oid=original.oid and p.proowner=original.proowner
      and p.prosecdef=original.prosecdef and p.proacl is not distinct from original.proacl
      and p.proconfig is not distinct from original.proconfig and p.provolatile=original.provolatile
      and p.prolang=original.prolang and p.proisstrict=original.proisstrict
      and encode(sha256(convert_to(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \r\n\t'),'UTF8')),'hex')=target.new_sha)
  then raise exception 'REVIEW_GATE133_PATCH_READBACK_MISMATCH';end if;
 end loop;
end
$install$;


-- This private formatter has accumulated previous reviewed error-message edits.
-- Update only the one fallback placeholder and leave every other byte/ACL intact.
do $reason$
declare
 original pg_proc%rowtype;
 definition text;
 digest text;
 anchor constant text:='when code is null then';
 addition constant text:=$detail$when code='INDEPENDENT_REVIEW_TIMEOUT' then 'AI chưa trả kết quả kiểm độc lập trong 20 phút. Hệ thống đã dừng xử lý bài.'
 when code='INDEPENDENT_REVIEW_DEADLINE_ELAPSED' then 'Hạn nộp đã qua trong lúc chờ AI kiểm độc lập. Hệ thống đã dừng xử lý bài.'
 when code is null then$detail$;
 patched boolean;
begin
 select * into strict original from pg_proc where oid='mtm_hw_private.lesson_retry_reason108(text)'::regprocedure;
 if current_user is distinct from pg_get_userbyid(original.proowner)
    or original.prosecdef or original.provolatile<>'i'
    or original.proconfig is distinct from array['search_path=""']::text[]
    or (select lanname::text from pg_language where oid=original.prolang)<>'sql'
    or exists(select 1 from (values ('anon'),('authenticated'),('service_role'),('mtm_btvn_publisher')) actors(role_name)
              where has_function_privilege(actors.role_name,original.oid,'EXECUTE'))
    or exists(select 1 from aclexplode(coalesce(original.proacl,acldefault('f',original.proowner))) permissions
              where permissions.grantee=0 and permissions.privilege_type='EXECUTE') then
  raise exception 'REVIEW_GATE133_REASON_METADATA_CHANGED';
 end if;

 definition=pg_get_functiondef(original.oid);
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
  raise exception 'REVIEW_GATE133_REASON_ANCHOR_CHANGED';
 end if;
 patched=position(addition in definition)>0;
 if patched then definition=replace(definition,addition,'');end if;
 if position('INDEPENDENT_REVIEW_TIMEOUT' in definition)>0 or position('INDEPENDENT_REVIEW_DEADLINE_ELAPSED' in definition)>0 then
  raise exception 'REVIEW_GATE133_REASON_CODE_ALREADY_USED';
 end if;
 if patched then return;end if;

 digest=encode(sha256(convert_to(replace(original.prosrc,anchor,addition),'UTF8')),'hex');
 execute replace(definition,anchor,addition);
 if not exists(select 1 from pg_proc p where p.oid=original.oid and p.proowner=original.proowner
      and p.prosecdef=original.prosecdef and p.proacl is not distinct from original.proacl
      and p.proconfig is not distinct from original.proconfig and p.provolatile=original.provolatile
      and p.prolang=original.prolang and p.proisstrict=original.proisstrict
      and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=digest)
 then raise exception 'REVIEW_GATE133_REASON_READBACK_MISMATCH';end if;
end
$reason$;

commit;
