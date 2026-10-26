-- 094 (21/10, anh Thành qua luồng "Quy trình học sinh mới tự động"): học sinh HỌC THỬ (nhãn "HT" trên Sheet danh sách)
-- vẫn vào lớp và làm BTVN như thường, nhưng KHÔNG vào xếp hạng (bảng web, đấu trường, "hạng của em") và KHÔNG vào ảnh bảng nhóm PH.
-- Javis đánh dấu qua Edge mtm-diem-danh (mtm_dd_api15):
--   student_upsert kèm "trial":true|false, hoặc
--   student_trial_set {studentId | student+class, trial:true|false}; lên CHINH_THUC hoặc KHONG_HOC thì gửi trial:false.
--   student_trial_list -> danh sách em đang học thử, cho bước dựng ảnh bảng nhóm PH bỏ ra.
-- Sổ điểm (mtm_btvn_scorebook) gắn "trial":true trên hàng của em học thử để máy dựng ảnh lọc được.
-- CHƯA ÁP. Cần 055/057/063 (btvn_rank_rows) và 064–067 (sync_dispatch, mtm_dd_api15). Chạy lại an toàn.
begin;
do $chk$
begin
 if to_regprocedure('mtm_hw_private.btvn_rank_rows(text,text,text,text,uuid)') is null
  or to_regprocedure('mtm_hw_private.sync_dispatch_before_lifecycle067(jsonb)') is null
  or to_regprocedure('public.mtm_btvn_scorebook_before_sync063(date,boolean)') is null
  or to_regprocedure('public.mtm_dd_api15(jsonb)') is null then raise exception '094 needs 063-067';end if;
end$chk$;

create table if not exists mtm_hw_private.student_trial(
 student_id uuid primary key references mtm_hw_private.students(id) on delete cascade,
 marked_at timestamptz not null default now(),
 source_msg text check(source_msg is null or length(source_msg)<=300));
alter table mtm_hw_private.student_trial enable row level security;
revoke all on mtm_hw_private.student_trial from public,anon,authenticated,service_role;

-- Xếp hạng: loại em học thử ngay ở bước chọn học sinh, nên hạng các em còn lại liền mạch (row_number tính sau).
do $rank$
declare src text;anchor text=$a$coalesce(s.source_identity,'') not like 'qa:%' and upper(substring(c.label from '^[^ ]+'))=p_cohort$a$;
begin
 src=pg_get_functiondef('mtm_hw_private.btvn_rank_rows(text,text,text,text,uuid)'::regprocedure);
 if position('mtm_hw_private.student_trial' in src)>0 then return;end if;
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then raise exception '094 rank anchor changed';end if;
 execute replace(src,anchor,$a$coalesce(s.source_identity,'') not like 'qa:%' and not exists(select 1 from mtm_hw_private.student_trial t where t.student_id=s.id) and upper(substring(c.label from '^[^ ]+'))=p_cohort$a$);
end$rank$;
revoke all on function mtm_hw_private.btvn_rank_rows(text,text,text,text,uuid) from public,anon,authenticated,service_role,mtm_btvn_publisher;

create or replace function mtm_hw_private.student_trial_action(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare st jsonb;sid uuid;own uuid;on_trial boolean;
begin
 select owner_id into own from mtm_hw_private.btvn_roster_scope where singleton;
 if p->>'action'='student_trial_list' then
  return jsonb_build_object('ok',true,'students',coalesce((select jsonb_agg(jsonb_build_object('studentId',s.id,'fullName',s.full_name,'className',c.label,'markedAt',t.marked_at) order by c.label,s.full_name)
   from mtm_hw_private.student_trial t join mtm_hw_private.students s on s.id=t.student_id join mtm_hw_private.classes c on c.id=s.class_id
   where s.owner_id=own and s.active),'[]'::jsonb));
 end if;
 if jsonb_typeof(p->'trial') is distinct from 'boolean' then return jsonb_build_object('error','need trial true|false');end if;
 on_trial=(p->>'trial')::boolean;
 if p ? 'studentId' and coalesce(p->>'studentId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('error','invalid studentId');end if;
 if p ? 'studentId' then select id into sid from mtm_hw_private.students where id=(p->>'studentId')::uuid and owner_id=own;
 else st=mtm_hw_private.dd_find_student(p->>'student',p->>'class');if st ? 'error' then return st;end if;sid=(st->>'id')::uuid;end if;
 if sid is null then return jsonb_build_object('error','student_not_found');end if;
 if on_trial then
  insert into mtm_hw_private.student_trial(student_id,source_msg) values(sid,nullif(p->>'sourceMsg','')) on conflict(student_id) do nothing;
 else delete from mtm_hw_private.student_trial where student_id=sid;end if;
 return jsonb_build_object('ok',true,'studentId',sid,'trial',on_trial);
end$$;

do $disp$
begin
 if to_regprocedure('mtm_hw_private.sync_dispatch_before_ht094(jsonb)') is not null then return;end if;
 alter function mtm_hw_private.sync_dispatch(jsonb) rename to sync_dispatch_before_ht094;
end$disp$;
create or replace function mtm_hw_private.sync_dispatch(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;mark jsonb;
begin
 if p->>'action' in ('student_trial_set','student_trial_list') then return mtm_hw_private.student_trial_action(p);end if;
 if p->>'action'='student_upsert' and p ? 'trial' and jsonb_typeof(p->'trial') is distinct from 'boolean' then
  return jsonb_build_object('error','need trial true|false');end if;
 result=mtm_hw_private.sync_dispatch_before_ht094(p-'trial');
 if p->>'action'='student_upsert' and p ? 'trial' and coalesce((result->>'ok')::boolean,false) and result->>'studentId' ~ '^[0-9a-f-]{36}$' then
  mark=mtm_hw_private.student_trial_action(jsonb_build_object('action','student_trial_set','studentId',result->>'studentId','trial',p->'trial','sourceMsg',p->>'sourceMsg'));
  if mark ? 'error' then raise exception 'student_trial_set failed after upsert';end if;
  result=result||jsonb_build_object('trial',(p->>'trial')::boolean);
 end if;
 return result;
end$$;

-- student_trial_set ghi DB nên đi qua sổ lệnh có sourceMsg; student_trial_list chỉ đọc.
do $api$
declare src text;
begin
 src=pg_get_functiondef('public.mtm_dd_api15(jsonb)'::regprocedure);
 if position('''student_trial_set''' in src)>0 then return;end if;
 if position('''lifecycle_retry''];' in src)=0 then raise exception '094 API mutation anchor changed';end if;
 if position('''leavesApplied'',''lifecycleQuarantined''' in src)=0 then raise exception '094 API summary anchor changed';end if;
 src=replace(src,'''lifecycle_retry''];','''lifecycle_retry'',''student_trial_set''];');
 src=replace(src,'''leavesApplied'',''lifecycleQuarantined''','''leavesApplied'',''trial'',''lifecycleQuarantined''');execute src;
end$api$;

-- Sổ điểm: gắn cờ trial trên hàng em học thử; hàng em khác giữ nguyên từng byte.
do $sb$
begin
 if to_regprocedure('public.mtm_btvn_scorebook_before_ht094(date,boolean)') is not null then return;end if;
 alter function public.mtm_btvn_scorebook(date,boolean) rename to mtm_btvn_scorebook_before_ht094;
end$sb$;
create or replace function public.mtm_btvn_scorebook(p_from date default '2026-10-15',p_apply boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(case when t.student_id is null then row else row||jsonb_build_object('trial',true) end order by ord),'[]')
 from jsonb_array_elements(public.mtm_btvn_scorebook_before_ht094(p_from,p_apply)) with ordinality x(row,ord)
 left join mtm_hw_private.student_trial t on (row->>'studentId') ~ '^[0-9a-f-]{36}$' and t.student_id=(row->>'studentId')::uuid
$$;

revoke all on function mtm_hw_private.student_trial_action(jsonb),mtm_hw_private.sync_dispatch_before_ht094(jsonb),mtm_hw_private.sync_dispatch(jsonb),
 public.mtm_btvn_scorebook_before_ht094(date,boolean),public.mtm_btvn_scorebook(date,boolean) from public,anon,authenticated,service_role;
grant execute on function public.mtm_btvn_scorebook(date,boolean) to service_role;
revoke all on function public.mtm_dd_api15(jsonb) from public,anon,authenticated;
grant execute on function public.mtm_dd_api15(jsonb) to service_role;
commit;
