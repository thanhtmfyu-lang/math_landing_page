-- NM8, chỉ chờ duyệt áp dụng. Nhãn nội bộ không thay active, PIN, membership hoặc quyền học.
-- Hồ sơ cũ giữ NULL vì chưa có nguồn xác nhận; INSERT không truyền cột mới mặc định HOC_THU.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table mtm_hw_private.students add column enrollment_status text
 check(enrollment_status in ('HOC_THU','DA_HOC_THU','CHINH_THUC','KHONG_HOC'));
alter table mtm_hw_private.students alter column enrollment_status set default 'HOC_THU';
alter table mtm_hw_private.students add column enrollment_version integer not null default 0 check(enrollment_version>=0);
create table mtm_hw_private.enrollment_status_history(
 id bigint generated always as identity primary key,
 student_id uuid not null references mtm_hw_private.students(id) on delete cascade,
 actor uuid not null,previous_status text,new_status text not null,
 version integer not null,created_at timestamptz not null default clock_timestamp(),
 unique(student_id,version)
);
alter table mtm_hw_private.enrollment_status_history enable row level security;
revoke all on mtm_hw_private.enrollment_status_history from public,anon,authenticated,service_role;

create function public.mtm_hw_enrollment_statuses(p_students uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare own uuid=mtm_hw_private.admin_id();items jsonb;
begin
 if p_students is null or cardinality(p_students)>100 or array_ndims(p_students)>1
  or array_position(p_students,null) is not null
  or (select count(distinct id) from unnest(p_students) id)<>cardinality(p_students) then
  raise exception 'input' using errcode='22023';end if;
 if exists(select 1 from unnest(p_students) x(id) where not exists(
  select 1 from mtm_hw_private.students s where s.id=x.id and s.owner_id=own)) then
  raise exception 'Student unavailable' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('studentId',s.id,'enrollmentStatus',s.enrollment_status,
  'enrollmentVersion',s.enrollment_version) order by x.ord),'[]'::jsonb) into items
 from unnest(p_students) with ordinality x(id,ord) join mtm_hw_private.students s on s.id=x.id;
 return jsonb_build_object('items',items);
end$$;

create function public.mtm_hw_enrollment_set(p_student uuid,p_status text,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare own uuid=mtm_hw_private.admin_id();s mtm_hw_private.students;
begin
 if p_student is null or p_status is null or p_status not in ('HOC_THU','DA_HOC_THU','CHINH_THUC','KHONG_HOC')
  or p_expected_version is null or p_expected_version<0 then raise exception 'input' using errcode='22023';end if;
 select * into s from mtm_hw_private.students where id=p_student and owner_id=own for update;
 if not found then raise exception 'Student unavailable' using errcode='42501';end if;
 if s.enrollment_version<>p_expected_version then raise exception 'Enrollment version conflict' using errcode='40001';end if;
 if s.enrollment_status is distinct from p_status then
  update mtm_hw_private.students set enrollment_status=p_status,enrollment_version=enrollment_version+1 where id=s.id;
  insert into mtm_hw_private.enrollment_status_history(student_id,actor,previous_status,new_status,version)
   values(s.id,own,s.enrollment_status,p_status,s.enrollment_version+1);
  s.enrollment_version=s.enrollment_version+1;
 end if;
 return jsonb_build_object('ok',true,'studentId',s.id,'enrollmentStatus',p_status,'enrollmentVersion',s.enrollment_version);
end$$;
revoke all on function public.mtm_hw_enrollment_statuses(uuid[]),public.mtm_hw_enrollment_set(uuid,text,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.mtm_hw_enrollment_statuses(uuid[]),public.mtm_hw_enrollment_set(uuid,text,integer) to authenticated;
commit;
