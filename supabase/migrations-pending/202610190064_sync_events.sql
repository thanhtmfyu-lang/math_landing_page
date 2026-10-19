-- 064: Nhật ký lệnh và outbox giao dịch. Chưa tự chạy worker, sender hoặc cron.
-- Thứ tự áp: 063 trước 064. API15 gọi API14, Edge trỏ API15.
begin;

create table mtm_hw_private.sync_commands(
 id uuid primary key default gen_random_uuid(),
 source_msg text not null unique check(length(source_msg) between 1 and 300 and source_msg !~ E'[\\r\\n]'),
 action text not null, payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
 status text not null default 'running' check(status in ('running','applied','partial','rejected','failed')),
 execution_attempts integer not null default 1 check(execution_attempts between 1 and 3),
 last_sqlstate text check(last_sqlstate is null or last_sqlstate ~ '^[A-Z0-9]{5}$'),
 failure_kind text check(failure_kind is null or failure_kind in ('transient','permanent')),
 result_summary jsonb not null default '{}', created_at timestamptz not null default clock_timestamp(), completed_at timestamptz
);
create table mtm_hw_private.sync_events(
 id bigint generated always as identity primary key,
 command_id uuid references mtm_hw_private.sync_commands(id),
 entity_table text not null, entity_key jsonb not null, entity_hash text not null,
 operation text not null check(operation in ('INSERT','UPDATE','DELETE')),
 changed_columns text[] not null default '{}', source_missing boolean not null,
 row_hash text not null, occurred_at timestamptz not null default clock_timestamp()
);
create table mtm_hw_private.sync_deliveries(
 id bigint generated always as identity primary key,
 event_id bigint not null references mtm_hw_private.sync_events(id) on delete cascade,
 sink text not null check(sink in ('web','attendance','sheet_import','sheet_roster','sheet_attendance','guardian_report','bot_profile','group_invite_proposal','ranking')),
 status text not null default 'pending' check(status in ('pending','leased','retry','blocked','verified','failed')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 total_attempts integer not null default 0 check(total_attempts between 0 and 9),
 requeues integer not null default 0 check(requeues between 0 and 2), version integer not null default 0,
 lease_token uuid, lease_until timestamptz, worker text, next_attempt_at timestamptz not null default clock_timestamp(),
 readback_hash text, receipt_ref text, error_code text, updated_at timestamptz not null default clock_timestamp(),
 unique(event_id,sink),
 check(status<>'verified' or coalesce(readback_hash ~ '^[0-9a-f]{64}$' and length(receipt_ref)>0,false))
);
create index sync_events_command_idx on mtm_hw_private.sync_events(command_id,id);
create index sync_deliveries_queue_idx on mtm_hw_private.sync_deliveries(status,next_attempt_at,id) where status in ('pending','retry','leased');
alter table mtm_hw_private.sync_commands enable row level security;
alter table mtm_hw_private.sync_events enable row level security;
alter table mtm_hw_private.sync_deliveries enable row level security;
revoke all on mtm_hw_private.sync_commands,mtm_hw_private.sync_events,mtm_hw_private.sync_deliveries from public,anon,authenticated,service_role;

create function mtm_hw_private.sync_sinks(p_table text,p_operation text,p_changed text[])
returns text[] language sql immutable set search_path='' as $$
 select case
 when p_table='btvn_work' and p_operation='UPDATE'
  and not (p_changed && array['receipts','next_actual_class_at','expected_due_at','due_source_identity']) then '{}'::text[]
 when p_table='student_pins' and p_operation='UPDATE' and not ('pin_hash'=any(p_changed)) then '{}'::text[]
 when p_table='attempts' and (p_operation='INSERT' or (p_operation='UPDATE' and not (p_changed && array['submitted_at','score','qualifying','late']))) then '{}'::text[]
 when p_table in ('students','class_transfers','student_leaves') then
  array['web','attendance','sheet_import','sheet_roster','sheet_attendance','guardian_report','bot_profile']::text[] ||
  case when p_table='class_transfers' or (p_table='students' and (p_operation='INSERT' or 'class_id'=any(p_changed))) then array['group_invite_proposal']::text[] else '{}'::text[] end
 when p_table='classes' then array['web','attendance','sheet_import','sheet_roster','sheet_attendance','bot_profile']::text[]
 when p_table='memberships' then array['web','attendance','sheet_roster']::text[]
 when p_table in ('timetable','schedule_moves','student_schedule_rules') then array['web','attendance','sheet_attendance','guardian_report','bot_profile']::text[]
 when p_table in ('attendance','attendance_raw','attendance_alias') then array['attendance','sheet_attendance','guardian_report']::text[]
 when p_table='guardians' then array['guardian_report','bot_profile','sheet_roster']::text[]
 when p_table in ('student_extra_phones','student_pins') then array['web','bot_profile']::text[]
 when p_table in ('btvn_work','btvn_manual_grades') then array['web','sheet_import','sheet_attendance','ranking','guardian_report']::text[]
 when p_table='paper_scores' then array['web','sheet_import','sheet_attendance','guardian_report']::text[]
 when p_table='assignments' then array['web','ranking']::text[]
 when p_table='attempts' then array['web','ranking']::text[]
 when p_table in ('btvn_lessons','btvn_student_overrides') then array['web','sheet_import','sheet_attendance','bot_profile']::text[]
 when p_table='student_feedback' then array['sheet_import','guardian_report','bot_profile']::text[]
 else '{}'::text[] end
$$;

create function mtm_hw_private.sync_capture() returns trigger
language plpgsql security definer set search_path='' as $$
declare oldrow jsonb='{}'; newrow jsonb='{}'; rowdata jsonb; keydata jsonb='{}'; col text;
 changed text[]; cmd uuid; eid bigint; sinks text[]; ctx text; configured_owner uuid; row_owner uuid;
begin
 if TG_OP<>'INSERT' then oldrow=to_jsonb(old); end if;
 if TG_OP<>'DELETE' then newrow=to_jsonb(new); end if;
 if TG_OP='UPDATE' and (oldrow-'updated_at')=(newrow-'updated_at') then return new; end if;
 rowdata=case when TG_OP='DELETE' then oldrow else newrow end;
 if TG_TABLE_NAME='btvn_work' and TG_OP='INSERT' and coalesce(jsonb_array_length(rowdata->'receipts'),0)=0
  and coalesce(rowdata->>'next_actual_class_at',rowdata->>'expected_due_at',rowdata->>'due_source_identity') is null then return new;end if;
 select owner_id into configured_owner from mtm_hw_private.btvn_roster_scope where singleton;
 if rowdata ? 'owner_id' then row_owner=(rowdata->>'owner_id')::uuid;
 elsif rowdata ? 'student_id' then select owner_id into row_owner from mtm_hw_private.students where id=(rowdata->>'student_id')::uuid;
 end if;
 if row_owner is not null and row_owner is distinct from configured_owner then return case when TG_OP='DELETE' then old else new end;end if;
 select coalesce(array_agg(k order by k),'{}'::text[]) into changed
 from (select jsonb_object_keys(oldrow||newrow) k) x where k<>'updated_at' and oldrow->k is distinct from newrow->k;
 foreach col in array string_to_array(TG_ARGV[0],',') loop
  if rowdata ? col then keydata=keydata||jsonb_build_object(col,rowdata->col); end if;
 end loop;
 -- Khóa định tuyến chỉ gồm UUID/code/ngày/nhãn lớp, không chép tên, điện thoại, UID Zalo hay nội dung tin.
 ctx=nullif(current_setting('mtm.sync_command_id',true),'');
 if ctx is not null then cmd=ctx::uuid; end if;
 sinks=mtm_hw_private.sync_sinks(TG_TABLE_NAME,TG_OP,changed);
 if cardinality(sinks)=0 then return case when TG_OP='DELETE' then old else new end; end if;
 insert into mtm_hw_private.sync_events(command_id,entity_table,entity_key,entity_hash,operation,changed_columns,source_missing,row_hash)
 values(cmd,TG_TABLE_NAME,keydata,encode(extensions.digest(keydata::text,'sha256'),'hex'),TG_OP,changed,cmd is null,
  encode(extensions.digest((rowdata-'updated_at')::text,'sha256'),'hex')) returning id into eid;
 insert into mtm_hw_private.sync_deliveries(event_id,sink) select eid,unnest(sinks);
 return case when TG_OP='DELETE' then old else new end;
end$$;

-- Mỗi bảng phát đúng hệ phụ thuộc. Không đánh dấu hệ nào đã đạt chỉ vì ghi được event.
do $$
declare r record;
begin
 for r in select * from (values
  ('students','id'),('classes','id'),('memberships','id'),
  ('attendance','student_id,class_label,session_date'),('attendance_raw','id'),('attendance_alias','student_id'),
  ('timetable','class_label,weekday,start_hm'),('schedule_moves','id'),('class_transfers','id'),('student_leaves','id'),
  ('guardians','student_id'),('student_extra_phones','student_id'),('student_pins','student_id'),
  ('btvn_work','student_id,lesson_code'),('btvn_manual_grades','student_id,lesson_code,attempt_id'),
  ('btvn_lessons','code'),('student_feedback','id'),('btvn_student_overrides','student_id,lesson_code'),
  ('assignments','id,class_id'),('attempts','id,student_id,assignment_id')
 ) x(tbl,keys) loop
  if to_regclass('mtm_hw_private.'||r.tbl) is not null then
   execute format('create trigger mtm_sync_capture after insert or update or delete on mtm_hw_private.%I for each row execute function mtm_hw_private.sync_capture(%L)',r.tbl,r.keys);
  end if;
 end loop;
end$$;

create function mtm_hw_private.sync_status(p jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 with chosen as (
  select c.* from mtm_hw_private.sync_commands c
  where (coalesce(p->>'sourceMsg','')<>'' and c.source_msg=p->>'sourceMsg')
   or (coalesce(p->>'commandId','')<>'' and c.id::text=p->>'commandId')
 ), scope_events as (
  select e.* from mtm_hw_private.sync_events e
  where (coalesce(p->>'sourceMsg','')='' and coalesce(p->>'commandId','')='') or e.command_id in (select id from chosen)
 ), grouped as (
  select d.sink,d.status,count(*) n from mtm_hw_private.sync_deliveries d join scope_events e on e.id=d.event_id group by d.sink,d.status
 ) select jsonb_build_object('ok',true,'command',
  (select jsonb_build_object('id',id,'action',action,'status',status,'result',result_summary,'createdAt',created_at,'completedAt',completed_at) from chosen limit 1),
  'events',(select count(*) from scope_events),'missingSourceEvents',(select count(*) from scope_events where source_missing),
  'deliveries',coalesce((select jsonb_agg(jsonb_build_object('sink',sink,'status',status,'count',n) order by sink,status) from grouped),'[]'::jsonb),
  'allVerified',(select count(*)>0 and bool_and(d.status='verified') from mtm_hw_private.sync_deliveries d join scope_events e on e.id=d.event_id))
$$;

create function mtm_hw_private.sync_claim(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare res jsonb; limit_n int; secs int; worker_name text;
begin
 worker_name=p->>'worker';
 if coalesce(worker_name,'') !~ '^[A-Za-z0-9_.:-]{1,80}$' then return jsonb_build_object('error','invalid_worker'); end if;
 limit_n=least(greatest(coalesce((p->>'limit')::int,20),1),100);
 secs=least(greatest(coalesce((p->>'leaseSeconds')::int,120),30),900);
 if p ? 'sinks' and (jsonb_typeof(p->'sinks')<>'array' or jsonb_array_length(p->'sinks')=0) then return jsonb_build_object('error','invalid_sinks'); end if;
 update mtm_hw_private.sync_deliveries set status='failed',error_code='retry_exhausted',version=version+1,updated_at=clock_timestamp(),lease_token=null,lease_until=null
 where status='leased' and lease_until<clock_timestamp() and attempts>=3;
 with available as (
  select d.id from mtm_hw_private.sync_deliveries d
  where ((d.status in ('pending','retry') and d.next_attempt_at<=clock_timestamp()) or (d.status='leased' and d.lease_until<clock_timestamp()))
   and d.attempts<3 and d.total_attempts<9 and (not (p ? 'sinks') or d.sink in (select jsonb_array_elements_text(p->'sinks')))
  order by d.id for update skip locked limit limit_n
 ), claimed as (
  update mtm_hw_private.sync_deliveries d set status='leased',attempts=d.attempts+1,total_attempts=d.total_attempts+1,version=d.version+1,
   lease_token=gen_random_uuid(),lease_until=clock_timestamp()+make_interval(secs=>secs),worker=worker_name,updated_at=clock_timestamp()
  from available a where d.id=a.id returning d.*
 ) select coalesce(jsonb_agg(jsonb_build_object('deliveryId',c.id,'eventId',c.event_id,'sink',c.sink,'attempt',c.attempts,'version',c.version,
  'leaseToken',c.lease_token,'leaseUntil',c.lease_until,'entityTable',e.entity_table,'entityKey',e.entity_key,'entityHash',e.entity_hash,
  'operation',e.operation,'changedColumns',e.changed_columns,'rowHash',e.row_hash,'sourceMissing',e.source_missing,'commandId',e.command_id) order by c.id),'[]'::jsonb)
 into res from claimed c join mtm_hw_private.sync_events e on e.id=c.event_id;
 return jsonb_build_object('ok',true,'deliveries',res);
end$$;

create function mtm_hw_private.sync_ack(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d mtm_hw_private.sync_deliveries; target text=p->>'status'; errorcode text; receipt text;
begin
 if target not in ('verified','blocked','retry') or target is null then return jsonb_build_object('error','invalid_status'); end if;
 select * into d from mtm_hw_private.sync_deliveries where id=(p->>'deliveryId')::bigint for update;
 if not found then return jsonb_build_object('error','not_found'); end if;
 if d.status<>'leased' or d.lease_token::text is distinct from p->>'leaseToken' or d.version is distinct from (p->>'version')::int
  or d.lease_until<clock_timestamp() then return jsonb_build_object('error','stale_lease'); end if;
 if target='verified' then
  receipt=p->>'receiptRef';
  if coalesce(p->>'readbackHash','') !~ '^[0-9a-f]{64}$' or coalesce(receipt,'') !~ '^[A-Za-z0-9_./:=-]{1,240}$' then
   return jsonb_build_object('error','need_verified_readback'); end if;
 else
  errorcode=p->>'errorCode';
  if coalesce(errorcode,'') !~ '^[a-z0-9_]{1,80}$' then return jsonb_build_object('error','need_error_code'); end if;
 end if;
 if target='retry' and d.attempts>=3 then target='failed';errorcode='retry_exhausted';end if;
 update mtm_hw_private.sync_deliveries set status=target,version=version+1,lease_token=null,lease_until=null,
  readback_hash=case when target='verified' then p->>'readbackHash' end,receipt_ref=case when target='verified' then receipt end,error_code=errorcode,
  next_attempt_at=case when target='retry' then clock_timestamp()+make_interval(secs=>(30*power(2,d.attempts))::int) else next_attempt_at end,
  updated_at=clock_timestamp() where id=d.id;
 return jsonb_build_object('ok',true,'deliveryId',d.id,'status',target,'version',d.version+1);
end$$;

create function mtm_hw_private.sync_requeue(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d mtm_hw_private.sync_deliveries;
begin
 if coalesce(p->>'sourceMsg','')='' or coalesce(p->>'reason','') !~ '^[a-z0-9_]{1,80}$' or p->>'version' is null then
  return jsonb_build_object('error','need_source_reason_version');end if;
 select * into d from mtm_hw_private.sync_deliveries where id=(p->>'deliveryId')::bigint for update;
 if not found then return jsonb_build_object('error','not_found');end if;
 if d.version<>(p->>'version')::int then return jsonb_build_object('error','delivery_version_conflict','version',d.version);end if;
 if d.status not in ('blocked','failed') then return jsonb_build_object('error','delivery_not_resumable');end if;
 if d.requeues>=2 or d.total_attempts>=9 then return jsonb_build_object('error','requeue_budget_exhausted');end if;
 update mtm_hw_private.sync_deliveries set status='pending',attempts=0,requeues=requeues+1,version=version+1,
  lease_token=null,lease_until=null,error_code=p->>'reason',next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=d.id;
 return jsonb_build_object('ok',true,'deliveryId',d.id,'version',d.version+1,'retryWindow',d.requeues+1,'lifetimeAttempts',d.total_attempts);
end$$;

-- 065 thay dispatcher để thêm action mới, không đổi endpoint của worker.
create function mtm_hw_private.sync_dispatch(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare nt int;nl int;
begin
 if p->>'action'='sync_requeue' then return mtm_hw_private.sync_requeue(p);end if;
 if p->>'action'='sync_tick' then
  if coalesce(p->>'sourceMsg','')='' then return jsonb_build_object('error','need_source_msg');end if;
  nt=mtm_hw_private.dd_apply_transfers();nl=mtm_hw_private.dd_apply_leaves();
  return jsonb_build_object('ok',true,'transfersApplied',nt,'leavesApplied',nl);
 end if;
 return public.mtm_dd_api14(p);
end$$;

create function public.mtm_dd_api15(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare body jsonb=p; act text=p->>'action'; src text; phash text; existing mtm_hw_private.sync_commands;
 cid uuid; res jsonb='{}'::jsonb; summary jsonb; stat text; err text; oldctx text; events_n bigint; standard boolean=false;
 exec_n integer=1; failure_type text;
 mutating text[]=array['move','cancel_move','mark','raw','alias','tkb','guardian_upsert','transfer','cancel_transfer','student_upsert',
  'student_deactivate','student_reactivate','feedback_add','pin_reset','profile_update','phone_add','btvn_extend','btvn_allow_late','btvn_retry','btvn_override_cancel',
  'student_profile_update','paper_score_record','class_upsert','sync_tick','sync_requeue'];
begin
 -- Các action giám sát không đi qua API cũ, do đó không áp lệnh chuyển/nghỉ đến hạn.
 if act='sync_status' then return mtm_hw_private.sync_status(p); end if;
 if act='sync_claim' then return mtm_hw_private.sync_claim(p); end if;
 if act='sync_ack' then return mtm_hw_private.sync_ack(p); end if;
 if act='sync_execute' then
  standard=true; body=p->'command'; src=p->>'sourceMsg';
  if jsonb_typeof(body)<>'object' or body is null then return jsonb_build_object('error','need_command'); end if;
  act=body->>'action';
  if not (act=any(mutating)) or act is null then return jsonb_build_object('error','unsupported_command'); end if;
  if coalesce(body->>'sourceMsg','')<>'' and body->>'sourceMsg' is distinct from src then return jsonb_build_object('error','source_mismatch'); end if;
  body=body||jsonb_build_object('sourceMsg',src);
 else src=body->>'sourceMsg'; end if;
 if coalesce(src,'')='' then
  if standard then return jsonb_build_object('error','need_source_msg'); end if;
  -- Client cũ còn chạy; trigger vẫn tạo outbox với source_missing=true.
  return mtm_hw_private.sync_dispatch(body);
 end if;
 if not (act=any(mutating)) then return mtm_hw_private.sync_dispatch(body); end if;
 if length(src)>300 or src ~ E'[\\r\\n]' then return jsonb_build_object('error','invalid_source_msg'); end if;
 phash=encode(extensions.digest((body-'sourceMsg')::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('mtm-sync:'||src,0));
 select * into existing from mtm_hw_private.sync_commands where source_msg=src;
 if found then
  if existing.payload_hash<>phash or existing.action<>act then return jsonb_build_object('error','source_conflict','commandId',existing.id); end if;
  if existing.status='failed' and existing.failure_kind='transient' and existing.execution_attempts<3 then
   update mtm_hw_private.sync_commands set status='running',execution_attempts=execution_attempts+1,
    last_sqlstate=null,failure_kind=null,result_summary='{}',completed_at=null where id=existing.id
    returning execution_attempts into exec_n;
   cid=existing.id;
  else
   return existing.result_summary||jsonb_build_object('duplicate',true,'commandId',existing.id,'syncStatus',existing.status);
  end if;
 else
  insert into mtm_hw_private.sync_commands(source_msg,action,payload_hash) values(src,act,phash) returning id into cid;
 end if;
 oldctx=coalesce(current_setting('mtm.sync_command_id',true),'');
 perform set_config('mtm.sync_command_id',cid::text,true);
 begin
  res=mtm_hw_private.sync_dispatch(body);
  if res is null or jsonb_typeof(res)<>'object' then raise exception using errcode='PZ002',message='dispatch_result_invalid';end if;
  stat=case when res ? 'error' then 'rejected' when jsonb_path_exists(res,'$.**.error') then 'partial' else 'applied' end;
  if stat='rejected' or (standard and stat='partial') then raise exception using errcode='PZ001',message='standard_command_rejected';end if;
 exception when sqlstate 'PZ001' then
  res=coalesce(res,'{}'::jsonb)||jsonb_build_object('ok',false,'rolledBack',true);
  if not (res ? 'error') then res=res||jsonb_build_object('error','batch_rejected');end if;
  stat='rejected';
 when sqlstate '40001' or sqlstate '40P01' or sqlstate '55P03' or sqlstate '57014' then
  get stacked diagnostics err=returned_sqlstate;
  res=jsonb_build_object('error','command_failed','sqlstate',err);stat='failed';failure_type='transient';
 when others then
  get stacked diagnostics err=returned_sqlstate;
  res=jsonb_build_object('error','command_failed','sqlstate',err);stat='failed';failure_type='permanent';
 end;
 perform set_config('mtm.sync_command_id',oldctx,true);
 select count(*) into events_n from mtm_hw_private.sync_events where command_id=cid;
 if stat in ('rejected','failed') then
  -- Biến PL/pgSQL còn giữ giá trị sau savepoint rollback. Không trả/lưu bất kỳ ID hay số đếm nghiệp vụ nào từ res cũ.
  summary=jsonb_strip_nulls(jsonb_build_object('ok',false,'error',coalesce(res->>'error','command_'||stat),
   'sourceError',case when res->>'error' ~ '^[A-Za-z0-9_ -]{1,80}$' then res->>'error' end,
   'eventCount',0,'rolledBack',true,'sqlstate',err,'failureKind',failure_type,'executionAttempts',exec_n,
   'retryable',stat='failed' and failure_type='transient' and exec_n<3,
   'retryExhausted',stat='failed' and failure_type='transient' and exec_n>=3));
  res=summary;
 else
  summary=jsonb_build_object('ok',stat='applied','eventCount',events_n,'executionAttempts',exec_n);
  -- Chỉ giữ ID/đếm/phiên bản đã thật sự được ghi, không giữ tên hoặc nội dung cá nhân từ response cũ.
  summary=summary||coalesce((select jsonb_object_agg(k,v) from jsonb_each(res) x(k,v)
   where k in ('studentId','classId','moveId','transferId','leaveId','overrideId','scoreId','deliveryId','version','created','applied','transfersApplied','leavesApplied','retryWindow','lifetimeAttempts')
    and (jsonb_typeof(v) in ('number','boolean') or (jsonb_typeof(v)='string' and (v#>>'{}') ~ '^[0-9a-f-]{36}$'))),'{}'::jsonb);
  if res->'student'->>'id' ~ '^[0-9a-f-]{36}$' then summary=summary||jsonb_build_object('studentId',res->'student'->'id');end if;
 end if;
 update mtm_hw_private.sync_commands set status=stat,result_summary=summary,last_sqlstate=err,failure_kind=failure_type,completed_at=clock_timestamp() where id=cid;
 if stat in ('rejected','failed') then return res||jsonb_build_object('commandId',cid,'syncStatus',stat);end if;
 return res||jsonb_build_object('commandId',cid,'syncStatus',stat,'eventCount',events_n,'propagation','pending_readback');
end$$;

revoke all on function mtm_hw_private.sync_sinks(text,text,text[]),mtm_hw_private.sync_capture(),mtm_hw_private.sync_status(jsonb),
 mtm_hw_private.sync_claim(jsonb),mtm_hw_private.sync_ack(jsonb),mtm_hw_private.sync_requeue(jsonb),mtm_hw_private.sync_dispatch(jsonb),public.mtm_dd_api15(jsonb) from public,anon,authenticated;
grant execute on function public.mtm_dd_api15(jsonb) to service_role;
commit;
