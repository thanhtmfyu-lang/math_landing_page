-- 067: Cô lập từng bản ghi chuyển lớp/nghỉ. Không gửi tin hoặc tạo lịch.
begin;
do $guard$
begin
 if position('boundary=t.effective_date::timestamp' in pg_get_functiondef('mtm_hw_private.dd_apply_transfers()'::regprocedure))=0
  or position('newer.effective_date,newer.id' in pg_get_functiondef('mtm_hw_private.dd_apply_transfers()'::regprocedure))=0
  then raise exception '067 needs transfer guard 063';end if;
 if to_regclass('mtm_hw_private.student_pauses') is null then raise exception '067 needs 066';end if;
end$guard$;
create table mtm_hw_private.lifecycle_quarantine(
 entity_table text not null check(entity_table in ('class_transfers','student_leaves')),entity_id bigint not null,
 student_id uuid not null references mtm_hw_private.students(id),
 status text not null check(status in ('quarantined','retry_pending','resolved')),
 failures integer not null default 1 check(failures between 1 and 3),retries integer not null default 0 check(retries between 0 and 2),
 version integer not null default 1,sqlstate text not null check(sqlstate ~ '^[A-Z0-9]{5}$'),
 error_code text not null check(error_code in ('target_class_unavailable','student_inactive_or_left','record_apply_failed')),
 source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
 first_seen_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 resolved_at timestamptz,primary key(entity_table,entity_id)
);
alter table mtm_hw_private.lifecycle_quarantine enable row level security;
revoke all on mtm_hw_private.lifecycle_quarantine from public,anon,authenticated,service_role;
create function mtm_hw_private.lifecycle_entity_pending(p_table text,p_id bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select case p_table
  when 'class_transfers' then exists(select 1 from mtm_hw_private.class_transfers where id=p_id and applied_at is null and cancelled_at is null)
  when 'student_leaves' then exists(select 1 from mtm_hw_private.student_leaves where id=p_id and applied_at is null and cancelled_at is null)
  else false end
$$;
create function mtm_hw_private.lifecycle_close_terminal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.applied_at is not null or new.cancelled_at is not null then
  update mtm_hw_private.lifecycle_quarantine set status='resolved',version=version+1,updated_at=clock_timestamp(),resolved_at=clock_timestamp()
   where entity_table=TG_TABLE_NAME and entity_id=new.id and status<>'resolved';end if;
 return new;
end$$;
create trigger mtm_lifecycle_close_terminal after update of applied_at,cancelled_at on mtm_hw_private.class_transfers
 for each row execute function mtm_hw_private.lifecycle_close_terminal();
create trigger mtm_lifecycle_close_terminal after update of applied_at,cancelled_at on mtm_hw_private.student_leaves
 for each row execute function mtm_hw_private.lifecycle_close_terminal();
create function mtm_hw_private.lifecycle_capture_error(p_table text,p_id bigint,p_student uuid,p_source text,p_sqlstate text) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into mtm_hw_private.lifecycle_quarantine(entity_table,entity_id,student_id,status,sqlstate,error_code,source_hash)
 values(p_table,p_id,p_student,'quarantined',p_sqlstate,case when p_sqlstate='PZ067' then 'target_class_unavailable'
  when p_sqlstate='PZ068' then 'student_inactive_or_left' else 'record_apply_failed' end,
  encode(extensions.digest(coalesce(p_source,''),'sha256'),'hex'))
 on conflict(entity_table,entity_id) do update set status='quarantined',failures=least(3,mtm_hw_private.lifecycle_quarantine.failures+1),
  version=mtm_hw_private.lifecycle_quarantine.version+1,sqlstate=excluded.sqlstate,error_code=excluded.error_code,updated_at=clock_timestamp(),resolved_at=null;
end$$;

create or replace function mtm_hw_private.dd_apply_transfers() returns integer
language plpgsql security definer set search_path='' as $$
declare t record;cid uuid;boundary timestamptz;n integer=0;
begin
 for t in select * from mtm_hw_private.class_transfers where applied_at is null and cancelled_at is null
  and effective_date<=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date order by effective_date,id loop
  if not pg_try_advisory_xact_lock(hashtextextended('lifecycle067:class_transfers:'||t.id::text,0)) then continue;end if;
  if exists(select 1 from mtm_hw_private.lifecycle_quarantine q where q.entity_table='class_transfers' and q.entity_id=t.id and q.status='quarantined') then continue;end if;
  -- BEGIN/EXCEPTION tạo subtransaction, rollback chỉ bản ghi hiện tại khi lỗi.
  begin
   perform 1 from mtm_hw_private.class_transfers where id=t.id and applied_at is null and cancelled_at is null for update skip locked;
   if not found then continue;end if;
   perform 1 from mtm_hw_private.students where id=t.student_id for update;
   if not exists(select 1 from mtm_hw_private.students where id=t.student_id and active)
    or exists(select 1 from mtm_hw_private.student_leaves lv where lv.student_id=t.student_id and lv.cancelled_at is null and lv.leave_date<=t.effective_date)
    then raise exception using errcode='PZ068',message='student_inactive_or_left';end if;
   select c.id into cid from mtm_hw_private.classes c join mtm_hw_private.students s on s.owner_id=c.owner_id
    where s.id=t.student_id and c.label=t.to_class and c.active limit 1;
   if cid is null then raise exception using errcode='PZ067',message='target_class_unavailable';end if;
   if not exists(select 1 from mtm_hw_private.class_transfers newer where newer.student_id=t.student_id and newer.cancelled_at is null
    and newer.applied_at is not null and (newer.effective_date,newer.id)>(t.effective_date,t.id)
    and newer.effective_date<=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date) then
    boundary=t.effective_date::timestamp at time zone 'Asia/Ho_Chi_Minh';
    update mtm_hw_private.students set class_id=cid where id=t.student_id;
    update mtm_hw_private.memberships set left_at=greatest(joined_at,boundary) where student_id=t.student_id and left_at is null and class_id<>cid;
    if not exists(select 1 from mtm_hw_private.memberships where student_id=t.student_id and left_at is null) then
     insert into mtm_hw_private.memberships(student_id,class_id,joined_at) values(t.student_id,cid,boundary);end if;
   end if;
   update mtm_hw_private.class_transfers set applied_at=clock_timestamp() where id=t.id;
   update mtm_hw_private.lifecycle_quarantine set status='resolved',version=version+1,updated_at=clock_timestamp(),resolved_at=clock_timestamp()
    where entity_table='class_transfers' and entity_id=t.id and status<>'resolved';
  exception
  when sqlstate '40001' then raise;
  when sqlstate '40P01' or sqlstate '55P03' then continue;
  when others then
   perform mtm_hw_private.lifecycle_capture_error('class_transfers',t.id,t.student_id,t.source_msg,SQLSTATE);continue;
  end;
  n=n+1;
 end loop;
 return n;
end$$;
create or replace function mtm_hw_private.dd_apply_leaves() returns integer
language plpgsql security definer set search_path='' as $$
declare l record;boundary timestamptz;n integer=0;
begin
 for l in select * from mtm_hw_private.student_leaves where applied_at is null and cancelled_at is null
  and leave_date<=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date order by leave_date,id loop
  if not pg_try_advisory_xact_lock(hashtextextended('lifecycle067:student_leaves:'||l.id::text,0)) then continue;end if;
  if exists(select 1 from mtm_hw_private.lifecycle_quarantine q where q.entity_table='student_leaves' and q.entity_id=l.id and q.status='quarantined') then continue;end if;
  begin
   perform 1 from mtm_hw_private.student_leaves where id=l.id and applied_at is null and cancelled_at is null for update skip locked;
   if not found then continue;end if;
   perform 1 from mtm_hw_private.students where id=l.student_id for update;
   boundary=l.leave_date::timestamp at time zone 'Asia/Ho_Chi_Minh';
   update mtm_hw_private.students set active=false where id=l.student_id;
   update mtm_hw_private.memberships set left_at=greatest(joined_at,boundary) where student_id=l.student_id and left_at is null;
   update mtm_hw_private.student_leaves set applied_at=clock_timestamp() where id=l.id;
   update mtm_hw_private.lifecycle_quarantine set status='resolved',version=version+1,updated_at=clock_timestamp(),resolved_at=clock_timestamp()
    where entity_table='student_leaves' and entity_id=l.id and status<>'resolved';
  exception
  when sqlstate '40001' then raise;
  when sqlstate '40P01' or sqlstate '55P03' then continue;
  when others then
   perform mtm_hw_private.lifecycle_capture_error('student_leaves',l.id,l.student_id,l.source_msg,SQLSTATE);continue;
  end;
  n=n+1;
 end loop;
 return n;
end$$;

create function mtm_hw_private.lifecycle_quarantine_action(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q mtm_hw_private.lifecycle_quarantine;
begin
 if p->>'action'='lifecycle_quarantine_read' then
  return jsonb_build_object('ok',true,'records',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at,x.entity_id) from mtm_hw_private.lifecycle_quarantine x),'[]'::jsonb));end if;
 if coalesce(p->>'entityTable','') not in ('class_transfers','student_leaves') or coalesce(p->>'entityId','') !~ '^[0-9]+$'
  or coalesce(p->>'version','') !~ '^[0-9]+$' or coalesce(p->>'sourceMsg','')='' or coalesce(p->>'reason','') !~ '^[a-z0-9_]{1,80}$'
  then return jsonb_build_object('error','need_entity_source_reason_version');end if;
 select * into q from mtm_hw_private.lifecycle_quarantine where entity_table=p->>'entityTable' and entity_id=(p->>'entityId')::bigint for update;
 if not found then return jsonb_build_object('error','quarantine_not_found');end if;
 if not mtm_hw_private.lifecycle_entity_pending(q.entity_table,q.entity_id) then return jsonb_build_object('error','entity_not_pending');end if;
 if q.version<>(p->>'version')::integer then return jsonb_build_object('error','quarantine_version_conflict','version',q.version);end if;
 if q.status<>'quarantined' then return jsonb_build_object('error','not_quarantined');end if;
 if q.retries>=2 or q.failures>=3 then return jsonb_build_object('error','lifecycle_retry_budget_exhausted');end if;
 update mtm_hw_private.lifecycle_quarantine set status='retry_pending',retries=retries+1,version=version+1,updated_at=clock_timestamp()
  where entity_table=q.entity_table and entity_id=q.entity_id;
 return jsonb_build_object('ok',true,'version',q.version+1,'retryNumber',q.retries+1);
end$$;
alter function mtm_hw_private.sync_dispatch(jsonb) rename to sync_dispatch_before_lifecycle067;
create function mtm_hw_private.sync_dispatch(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p->>'action' in ('lifecycle_retry','lifecycle_quarantine_read') then return mtm_hw_private.lifecycle_quarantine_action(p);end if;
 result=mtm_hw_private.sync_dispatch_before_lifecycle067(p);
 if p->>'action'='sync_tick' then
  result=result||jsonb_build_object('lifecycleQuarantined',(select count(*) from mtm_hw_private.lifecycle_quarantine q where status='quarantined' and mtm_hw_private.lifecycle_entity_pending(q.entity_table,q.entity_id)),
   'lifecycleReadyRetry',(select count(*) from mtm_hw_private.lifecycle_quarantine q where status='retry_pending' and mtm_hw_private.lifecycle_entity_pending(q.entity_table,q.entity_id)));
 end if;
 return result;
end$$;
do $api$
declare src text;
begin
 src=pg_get_functiondef('public.mtm_dd_api15(jsonb)'::regprocedure);
 if position('''student_pause_cancel''];' in src)=0 then raise exception '067 API mutation anchor changed';end if;
 if position('''leavesApplied'',''retryWindow''' in src)=0 then raise exception '067 API summary anchor changed';end if;
 src=replace(src,'''student_pause_cancel''];','''student_pause_cancel'',''lifecycle_retry''];');
 src=replace(src,'''leavesApplied'',''retryWindow''','''leavesApplied'',''lifecycleQuarantined'',''lifecycleReadyRetry'',''retryNumber'',''retryWindow''');execute src;
end$api$;
revoke all on function mtm_hw_private.lifecycle_capture_error(text,bigint,uuid,text,text),mtm_hw_private.dd_apply_transfers(),mtm_hw_private.dd_apply_leaves(),
 mtm_hw_private.lifecycle_entity_pending(text,bigint),mtm_hw_private.lifecycle_close_terminal(),
 mtm_hw_private.lifecycle_quarantine_action(jsonb),mtm_hw_private.sync_dispatch_before_lifecycle067(jsonb),mtm_hw_private.sync_dispatch(jsonb)
 from public,anon,authenticated,service_role;
commit;
