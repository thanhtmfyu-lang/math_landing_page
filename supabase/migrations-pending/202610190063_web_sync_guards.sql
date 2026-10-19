-- 063: dữ liệu hiệu lực cho web, chặn roster lùi trạng thái, ngoại lệ hạn BTVN.
-- Chỉ triển khai sau transaction rollback QA. Nguồn hàm live đọc 19/10/2026.
begin;
do $guard$
declare r record; actual text;
begin
 for r in select * from (values
 ('mtm_hw_private.btvn_student(text)','2a51d561469e7fefc969dbe5ea9fc50efd2260cf32eac1fa0e58c99818312cee'),
 ('mtm_hw_private.dd_apply_transfers()','b1dab1d62e2340ae592c39ded4d3e91fa84cb44e1c8297c400552edee01acb00'),
 ('public.mtm_btvn_sync_roster(jsonb,boolean)','3883533e9a925cb01a95755ec6ff696452a4e6d97e6b6c29d86c9924f3876258'),
 ('public.mtm_btvn_read(text,text)','d6498f5dac1b96abca2d56fa80b86658adaeb3ac4907def51eff115c06e730bc'),
 ('public.mtm_btvn_scorebook(date,boolean)','0a1531c47b5e90f8a6208d58240171b32d5540393739c168dd068f914ff716a5'),
 ('public.mtm_btvn_sheet_csv(text)','0cc2e23a996a002f9a0db4bd397f048dfd7271767623b28dbaaea287820d23db'),
 ('public.mtm_btvn_admin_scores(text)','eb5487c6ae537490eb8d0f8b63433a24221fef935dd672942b1534bc172bc47c'),
 ('mtm_hw_private.btvn_rank_rows(text,text,text,text,uuid)','62e6d13e5ddc3820075bc3eccbf3a60b7233bb173b47262da43b57d6ed6123a9')
 ) x(signature,expected) loop
  actual=encode(sha256(convert_to(pg_get_functiondef(r.signature::regprocedure),'UTF8')),'hex');
  if actual is distinct from r.expected then raise exception '063 source changed: %',r.signature;end if;
 end loop;
end$guard$;

-- Khóa sự kiện khi áp, giữ mốc hiệu lực trong lịch sử membership.
create or replace function mtm_hw_private.dd_apply_transfers() returns integer
language plpgsql security definer set search_path='' as $$
declare t record;cid uuid;boundary timestamptz;n int=0;
begin
 for t in select * from mtm_hw_private.class_transfers where applied_at is null and cancelled_at is null
  and effective_date<=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date order by effective_date,id for update loop
  perform 1 from mtm_hw_private.students where id=t.student_id for update;
  select c.id into cid from mtm_hw_private.classes c join mtm_hw_private.students s on s.owner_id=c.owner_id
   where s.id=t.student_id and c.label=t.to_class and c.active limit 1;
  if cid is null then continue;end if;
  -- Một lệnh đến trễ không đẩy lùi chuyển lớp mới hơn đã có hiệu lực.
  if not exists(select 1 from mtm_hw_private.class_transfers newer where newer.student_id=t.student_id and newer.cancelled_at is null
    and newer.applied_at is not null and (newer.effective_date,newer.id)>(t.effective_date,t.id)
    and newer.effective_date<=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date) then
   boundary=t.effective_date::timestamp at time zone 'Asia/Ho_Chi_Minh';
   update mtm_hw_private.students set class_id=cid where id=t.student_id;
   update mtm_hw_private.memberships set left_at=greatest(joined_at,boundary) where student_id=t.student_id and left_at is null and class_id<>cid;
   if not exists(select 1 from mtm_hw_private.memberships where student_id=t.student_id and left_at is null) then
    insert into mtm_hw_private.memberships(student_id,class_id,joined_at) values(t.student_id,cid,boundary);
   end if;
  end if;
  update mtm_hw_private.class_transfers set applied_at=clock_timestamp() where id=t.id;n=n+1;
 end loop;
 return n;
end$$;
revoke all on function mtm_hw_private.dd_apply_transfers() from public,anon,authenticated,service_role;

alter function mtm_hw_private.btvn_student(text) rename to btvn_student_before_sync063;
create function mtm_hw_private.btvn_student(p_session text) returns uuid
language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 sid=mtm_hw_private.btvn_student_before_sync063(p_session);
 perform mtm_hw_private.dd_apply_transfers();
 perform mtm_hw_private.dd_apply_leaves();
 -- Đọc lại sau áp: cả phiên đang mở cũng chịu lớp mới/nghỉ học.
 return mtm_hw_private.btvn_student_before_sync063(p_session);
end$$;
revoke all on function mtm_hw_private.btvn_student_before_sync063(text),mtm_hw_private.btvn_student(text) from public,anon,authenticated,service_role;

-- Sửa đúng thân importer live đã băm ở trên, giữ các sửa riêng ngoài repo.
do $patch$
declare src text;fixed text;anchor text;
begin
 src=pg_get_functiondef('public.mtm_btvn_sync_roster(jsonb,boolean)'::regprocedure);
 anchor='   if sid=any(cfg.protected_student_ids) or sid=any(student_ids) then raise exception ''Protected or duplicate mapped student'';end if;';
 if position(anchor in src)=0 then raise exception '063 roster anchor changed';end if;
 fixed=replace(src,anchor,anchor||$inject$
   -- Các quyết định giáo vụ có nguồn rõ ưu tiên hơn snapshot Sheet cũ.
   if sid is not null and exists(select 1 from mtm_hw_private.student_leaves lv where lv.student_id=sid and lv.cancelled_at is null
     and lv.leave_date<=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date) then
    student_ids=array_append(student_ids,sid);unchanged=unchanged+1;continue;
   end if;
   if sid is not null then
    select c3.id into prior from mtm_hw_private.class_transfers tr join mtm_hw_private.classes c3 on c3.label=tr.to_class and c3.owner_id=cfg.owner_id and c3.active
     where tr.student_id=sid and tr.cancelled_at is null and tr.effective_date<=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date
     order by tr.effective_date desc,tr.id desc limit 1;
    if prior is not null then cid=prior;r=jsonb_set(r,'{className}',to_jsonb((select label from mtm_hw_private.classes where id=cid)));end if;
   end if;
$inject$);
 anchor='  for c in select value from jsonb_array_elements(p_payload->''classes'') loop';
 if position(anchor in fixed)=0 then raise exception '063 roster transaction anchor changed';end if;
 fixed=replace(fixed,anchor,'  perform mtm_hw_private.dd_apply_transfers(); perform mtm_hw_private.dd_apply_leaves();'||chr(10)||anchor);
 if fixed=src then raise exception '063 roster patch did not apply';end if;execute fixed;
end$patch$;

create table mtm_hw_private.btvn_student_overrides(
 id bigint generated always as identity primary key,student_id uuid not null references mtm_hw_private.students(id),
 lesson_code text not null references mtm_hw_private.btvn_lessons(code),kind text not null check(kind in ('extend','allow_late','retry')),
 due_at timestamptz,reason text not null check(length(btrim(reason)) between 1 and 1000),source_msg text not null unique,
 created_at timestamptz not null default clock_timestamp(),revoked_at timestamptz,
 check(kind='retry' or due_at is not null));
alter table mtm_hw_private.btvn_student_overrides enable row level security;
revoke all on mtm_hw_private.btvn_student_overrides from public,anon,authenticated,service_role;
create index btvn_override_active on mtm_hw_private.btvn_student_overrides(student_id,lesson_code,id desc) where revoked_at is null;

create function mtm_hw_private.btvn_override_due(p_student uuid,p_lesson text) returns timestamptz
language sql stable security definer set search_path='' as $$
 select due_at from mtm_hw_private.btvn_student_overrides where student_id=p_student and lesson_code=p_lesson
  and revoked_at is null and kind='extend' and due_at is not null order by id desc limit 1
$$;
create function mtm_hw_private.btvn_override_receipts() returns trigger
language plpgsql security definer set search_path='' as $$
declare due timestamptz;
begin
 due=mtm_hw_private.btvn_override_due(new.student_id,new.lesson_code);
 -- Không có gia hạn thì giữ nguyên chính sách/cờ muộn của đường cũ.
 if due is null then return new;end if;
  select coalesce(jsonb_agg(r||jsonb_build_object('late',case when due is null then null else (r->>'submittedAt')::numeric>=extract(epoch from due)*1000 end) order by ord),'[]') into new.receipts
   from jsonb_array_elements(new.receipts) with ordinality x(r,ord);
 return new;
end$$;
create trigger btvn_override_receipts before insert or update on mtm_hw_private.btvn_work
for each row execute function mtm_hw_private.btvn_override_receipts();
revoke all on function mtm_hw_private.btvn_override_due(uuid,text),mtm_hw_private.btvn_override_receipts() from public,anon,authenticated,service_role;

alter function public.mtm_btvn_read(text,text) rename to mtm_btvn_read_before_sync063;
create function public.mtm_btvn_read(p_session text,p_lesson text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid=mtm_hw_private.btvn_student(p_session);result jsonb;due timestamptz;selected text;cards jsonb;
begin
 result=public.mtm_btvn_read_before_sync063(p_session,p_lesson);selected=result->'material'->>'lessonCode';
 due=mtm_hw_private.btvn_override_due(sid,selected);
 if due is not null then result=jsonb_set(result,'{work,student}',(result->'work'->'student')||jsonb_build_object('effectiveDueAt',extract(epoch from due)*1000));end if;
 select coalesce(jsonb_agg(case when ov.due is null then card else card||jsonb_build_object('dueAt',extract(epoch from ov.due)*1000) end order by ord),'[]') into cards
 from jsonb_array_elements(coalesce(result->'lessons','[]')) with ordinality x(card,ord)
 cross join lateral(select mtm_hw_private.btvn_override_due(sid,card->>'lessonCode') due) ov;
 return result||jsonb_build_object('lessons',cards);
end$$;
revoke all on function public.mtm_btvn_read_before_sync063(text,text),public.mtm_btvn_read(text,text) from public,anon,authenticated,service_role;
grant execute on function public.mtm_btvn_read(text,text) to service_role;

alter function public.mtm_btvn_scorebook(date,boolean) rename to mtm_btvn_scorebook_before_sync063;
create function public.mtm_btvn_scorebook(p_from date default '2026-10-15',p_apply boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(case when ov.due is null then row else row||jsonb_build_object('dueAt',extract(epoch from ov.due)*1000) end order by ord),'[]')
 from jsonb_array_elements(public.mtm_btvn_scorebook_before_sync063(p_from,p_apply)) with ordinality x(row,ord)
 cross join lateral(select mtm_hw_private.btvn_override_due((row->>'studentId')::uuid,row->>'lessonCode') due) ov
$$;
revoke all on function public.mtm_btvn_scorebook_before_sync063(date,boolean),public.mtm_btvn_scorebook(date,boolean) from public,anon,authenticated,service_role;
grant execute on function public.mtm_btvn_scorebook(date,boolean) to service_role;

do $csv$
declare src text;fixed text;anchor text='coalesce(w.next_actual_class_at,w.expected_due_at,mtm_hw_private.btvn_planned_due(c.label,';
begin
 src=pg_get_functiondef('public.mtm_btvn_sheet_csv(text)'::regprocedure);
 if position(anchor in src)=0 then raise exception '063 CSV due anchor changed';end if;
 fixed=replace(src,anchor,'coalesce(mtm_hw_private.btvn_override_due(s.id,l.code),w.next_actual_class_at,w.expected_due_at,mtm_hw_private.btvn_planned_due(c.label,');
 if fixed=src then raise exception '063 CSV patch did not apply';end if;execute fixed;
end$csv$;

do $rank$
declare src text;fixed text;anchor text='coalesce(w.next_actual_class_at,w.expected_due_at,mtm_hw_private.btvn_planned_due(a.label,a.lesson_day))';
begin
 src=pg_get_functiondef('mtm_hw_private.btvn_rank_rows(text,text,text,text,uuid)'::regprocedure);
 if position(anchor in src)=0 then raise exception '063 rank due anchor changed';end if;
 fixed=replace(src,anchor,'coalesce(mtm_hw_private.btvn_override_due(a.id,a.code),w.next_actual_class_at,w.expected_due_at,mtm_hw_private.btvn_planned_due(a.label,a.lesson_day))');
 if fixed=src then raise exception '063 rank patch did not apply';end if;execute fixed;
end$rank$;

alter function public.mtm_btvn_admin_scores(text) rename to mtm_btvn_admin_scores_before_sync063;
create function public.mtm_btvn_admin_scores(p_lesson text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 select coalesce(jsonb_agg(case when ov.due is null then item else jsonb_set(item,'{student}',item->'student'||jsonb_build_object('effectiveDueAt',extract(epoch from ov.due)*1000)) end order by ord),'[]') into result
 from jsonb_array_elements(public.mtm_btvn_admin_scores_before_sync063(p_lesson)) with ordinality x(item,ord)
 cross join lateral(select mtm_hw_private.btvn_override_due((item->'student'->>'studentCode')::uuid,p_lesson) due) ov;
 return result;
end$$;
revoke all on function public.mtm_btvn_admin_scores_before_sync063(text),public.mtm_btvn_admin_scores(text) from public,anon,authenticated,service_role;
grant execute on function public.mtm_btvn_admin_scores(text) to authenticated;

create function public.mtm_dd_api14(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare act text=p->>'action';st jsonb;sid uuid;own uuid;l record;prior record;due timestamptz;oid bigint;used integer;src text;
begin
 if act='cancel_transfer' then
  select * into prior from mtm_hw_private.class_transfers where id=(p->>'transferId')::bigint and cancelled_at is null;
  if found and exists(select 1 from mtm_hw_private.class_transfers newer where newer.student_id=prior.student_id and newer.cancelled_at is null
    and (newer.effective_date,newer.id)>(prior.effective_date,prior.id)) then
   return jsonb_build_object('error','later_transfer_exists','hint','Hủy chuyển lớp mới hơn trước để giữ lịch sử đúng');
  end if;
  return public.mtm_dd_api13(p);
 end if;
 if act is null or act not in ('btvn_extend','btvn_allow_late','btvn_retry','btvn_override_read','btvn_override_cancel') then return public.mtm_dd_api13(p);end if;
 perform mtm_hw_private.dd_apply_transfers();perform mtm_hw_private.dd_apply_leaves();
 select owner_id into own from mtm_hw_private.btvn_roster_scope where singleton;
 if p ? 'studentId' then select id into sid from mtm_hw_private.students where id=(p->>'studentId')::uuid and owner_id=own;
 else st=mtm_hw_private.dd_find_student(p->>'student',p->>'class');if st ? 'error' then return st;end if;sid=(st->>'id')::uuid;end if;
 if sid is null or not exists(select 1 from mtm_hw_private.students where id=sid and owner_id=own) then return jsonb_build_object('error','student_not_found');end if;
 select * into l from mtm_hw_private.btvn_lessons where code=p->>'lessonCode' and owner_id=own and active and kind='btvn'
  and exists(select 1 from mtm_hw_private.students s where s.id=sid and s.active and s.class_id=any(class_ids));
 if l.code is null then return jsonb_build_object('error','lesson_unavailable');end if;
 if act='btvn_override_read' then
  return jsonb_build_object('ok',true,'dueAt',mtm_hw_private.btvn_override_due(sid,l.code),
   'lateAllowedUntil',(select due_at from mtm_hw_private.btvn_student_overrides where student_id=sid and lesson_code=l.code and kind='allow_late' and revoked_at is null order by id desc limit 1),'maxAttempts',5,
   'attemptsUsed',coalesce((select jsonb_array_length(drafts) from mtm_hw_private.btvn_work where student_id=sid and lesson_code=l.code),0));
 end if;
 src=nullif(btrim(p->>'sourceMsg'),'');
 if src is null or length(src)>500 or nullif(btrim(p->>'reason'),'') is null then return jsonb_build_object('error','need sourceMsg,reason');end if;
 perform pg_advisory_xact_lock(hashtextextended('btvn-override:'||sid::text||':'||l.code,0));
 select * into prior from mtm_hw_private.btvn_student_overrides where source_msg=src;
 if found then
  if prior.student_id<>sid or prior.lesson_code<>l.code or prior.kind<>replace(act,'btvn_','') or prior.reason<>p->>'reason'
    or (act<>'btvn_retry' and prior.due_at is distinct from (p->>'dueAt')::timestamptz) then return jsonb_build_object('error','source_conflict');end if;
  return jsonb_build_object('ok',true,'duplicate',true,'overrideId',prior.id,'revoked',prior.revoked_at is not null);
 end if;
 if act='btvn_override_cancel' then
  update mtm_hw_private.btvn_student_overrides set revoked_at=clock_timestamp() where student_id=sid and lesson_code=l.code and id=(p->>'overrideId')::bigint and revoked_at is null;
  if not found then return jsonb_build_object('error','override_not_found');end if;
  update mtm_hw_private.btvn_work w set revision=revision+1,receipts=(
   select coalesce(jsonb_agg(r||jsonb_build_object('late',case when coalesce(mtm_hw_private.btvn_override_due(sid,l.code),w.next_actual_class_at) is null then null
    else (r->>'submittedAt')::numeric>=extract(epoch from coalesce(mtm_hw_private.btvn_override_due(sid,l.code),w.next_actual_class_at))*1000 end) order by ord),'[]')
   from jsonb_array_elements(w.receipts) with ordinality x(r,ord)) where student_id=sid and lesson_code=l.code;
  return jsonb_build_object('ok',true,'cancelled',true);
 end if;
 select coalesce(jsonb_array_length(drafts),0) into used from mtm_hw_private.btvn_work where student_id=sid and lesson_code=l.code for update;
 used=coalesce(used,0);
 if act='btvn_retry' and used>=5 then return jsonb_build_object('error','attempt_limit','maxAttempts',5,'attemptsUsed',used);end if;
 if act<>'btvn_retry' then
  if coalesce(p->>'dueAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then return jsonb_build_object('error','need dueAt with timezone');end if;
  due=(p->>'dueAt')::timestamptz;
  if due<=clock_timestamp() then return jsonb_build_object('error','dueAt_must_be_future');end if;
  if act='btvn_extend' and due<coalesce(mtm_hw_private.btvn_override_due(sid,l.code),(select coalesce(next_actual_class_at,expected_due_at) from mtm_hw_private.btvn_work where student_id=sid and lesson_code=l.code),due) then
   return jsonb_build_object('error','dueAt_must_not_shorten');end if;
 end if;
 insert into mtm_hw_private.btvn_student_overrides(student_id,lesson_code,kind,due_at,reason,source_msg)
 values(sid,l.code,replace(act,'btvn_',''),due,p->>'reason',src) returning id into oid;
 update mtm_hw_private.btvn_work set revision=revision+1 where student_id=sid and lesson_code=l.code;
 return jsonb_build_object('ok',true,'overrideId',oid,'dueAt',due,'maxAttempts',5,'attemptsUsed',used,'attemptsRemaining',5-used);
end$$;
revoke all on function public.mtm_dd_api14(jsonb) from public,anon,authenticated;
grant execute on function public.mtm_dd_api14(jsonb) to service_role;
commit;
