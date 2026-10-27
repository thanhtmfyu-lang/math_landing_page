-- P0 27/10: additive only. Apply manually with ap-supabase.yml AFTER review.
-- Students use BTVN cookies, not auth.users: only scoped service RPCs may write.
-- No direct browser INSERT/UPDATE/DELETE grant, including to authenticated admins.
begin;

create table mtm_hw_private.tu_luan_images (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references mtm_hw_private.students(id),
 lesson_code text not null references mtm_hw_private.btvn_lessons(code),
 owner_id uuid not null references auth.users(id),
 attempt_id text not null,
 sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
 bytes integer not null check (bytes between 100 and 3145728),
 page_number integer check (page_number between 1 and 64),
 storage_path text not null unique,
 created_at timestamptz not null default clock_timestamp(),
 received_at timestamptz,
 uploaded_at timestamptz,
 check(received_at is null or (page_number is not null and uploaded_at is not null)),
 unique (student_id, lesson_code, sha256),
 unique (student_id, lesson_code, page_number)
);
alter table mtm_hw_private.tu_luan_images enable row level security;
revoke all on mtm_hw_private.tu_luan_images from public,anon,authenticated,service_role;
-- No student Supabase JWT exists. Ownership of every write is checked by
-- btvn_student(p_session) below; RLS blocks ALL direct student/table writes.
create policy tu_luan_teacher_rows on mtm_hw_private.tu_luan_images
 for select to authenticated using (owner_id=auth.uid() and exists
 (select 1 from public.mtm_exam_admins a where a.user_id=auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('mtm-tu-luan','mtm-tu-luan',false,3145728,array['image/jpeg']);

-- Signed uploads are issued ONLY by the cookie-authorized API, without upsert.
-- Signed reads require both the existing admin role and the lesson owner.
-- Policy subqueries need a definer helper: private-schema tables are not
-- exposed/granted to browser roles. This helper reveals only a boolean.
create function public.mtm_tu_luan_can_read(p_path text) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from mtm_hw_private.tu_luan_images i
 join public.mtm_exam_admins a on a.user_id=i.owner_id
 where i.storage_path=p_path and i.owner_id=auth.uid() and i.received_at is not null)
$$;
revoke all on function public.mtm_tu_luan_can_read(text) from public,anon;
grant execute on function public.mtm_tu_luan_can_read(text) to authenticated;
create policy tu_luan_teacher_storage on storage.objects for select to authenticated
 using (bucket_id='mtm-tu-luan' and public.mtm_tu_luan_can_read(name));

create function public.mtm_tu_luan_student(
 p_session text,p_lesson text,p_attempt text,p_action text,
 p_sha256 text default null,p_bytes integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid=mtm_hw_private.btvn_student(p_session);
 s mtm_hw_private.students; l mtm_hw_private.btvn_lessons;
 w mtm_hw_private.btvn_work; img mtm_hw_private.tu_luan_images;
 deadline timestamptz; parts text[]; class_name text; assigned integer;
 n integer; items jsonb; object_at timestamptz; now_at timestamptz=clock_timestamp();
begin
 if p_action is null or p_action not in ('list','reserve','confirm') then
  raise exception 'Invalid action' using errcode='22023';end if;
 select * into s from mtm_hw_private.students where id=sid and active;
 select * into l from mtm_hw_private.btvn_lessons
 where code=p_lesson and active and owner_id=s.owner_id and s.class_id=any(class_ids);
 if not found or l.kind is distinct from 'kiem-tra-thang' or l.closes_at is null or l.opens_at is null
 or now_at<l.opens_at or not exists(select 1 from jsonb_array_elements(l.exam->'questions') q where q->>'kind' in ('self','essay')) then
  raise exception 'Lesson unavailable' using errcode='42501';end if;
 -- Same SHA-256 allocation as server/btvn/thi-thang.ts, including NFC/JS trim.
 parts=regexp_match(l.code,'^(thi-thang-[0-9]{4}-[0-9]{2}-[a-z0-9-]+?)-thi-ma-([12])$');
 if parts is not null then
  select label into class_name from mtm_hw_private.classes where id=s.class_id;
  if s.full_name is null or class_name is null then raise exception 'Identity unavailable' using errcode='42501';end if;
  assigned=1+(get_byte(sha256(convert_to(parts[1]||'|'||lower(mtm_hw_private.js_trim(normalize(s.full_name,NFC)))||'|'||mtm_hw_private.js_trim(class_name),'UTF8')),0)&1);
  if parts[2]::integer is distinct from assigned then raise exception 'Wrong exam code' using errcode='42501';end if;
 end if;
 -- Serialize reservations to assign stable page numbers and deduplicate tabs.
 select * into w from mtm_hw_private.btvn_work
 where student_id=sid and lesson_code=p_lesson for update;
 if not found or p_attempt is null or not exists(
  select 1 from jsonb_array_elements(w.drafts) d where d->>'attemptId'=p_attempt
 ) then raise exception 'Attempt unavailable' using errcode='42501';end if;
 now_at=clock_timestamp();
 deadline=l.closes_at+interval '15 minutes';
 if p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'sha256',i.sha256,'pageNumber',i.page_number,
   'receivedAt',i.received_at,'bytes',i.bytes) order by i.page_number),'[]'::jsonb) into items
   from mtm_hw_private.tu_luan_images i where i.student_id=sid and i.lesson_code=p_lesson and i.received_at is not null;
  return jsonb_build_object('items',items,'deadline',extract(epoch from deadline)*1000,'serverNow',extract(epoch from now_at)*1000);
 end if;
 if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_bytes is null or p_bytes not between 100 and 3145728 then
  raise exception 'Invalid image' using errcode='22023';end if;
 select * into img from mtm_hw_private.tu_luan_images where student_id=sid and lesson_code=p_lesson and sha256=p_sha256;
 if img.id is not null then
  select o.created_at into object_at from storage.objects o where o.bucket_id='mtm-tu-luan' and o.name=img.storage_path;
 end if;
 if img.received_at is null and now_at>=deadline then
  -- A lost ACK does not invalidate bytes Storage actually received before the deadline.
  if object_at is null or object_at>=deadline then raise exception 'Upload deadline passed' using errcode='P0015';end if;
 end if;
 if img.id is null then
  if p_action<>'reserve' then raise exception 'Reserve first' using errcode='22023';end if;
  select count(*) into n from mtm_hw_private.tu_luan_images where student_id=sid and lesson_code=p_lesson;
  if n>=128 then raise exception 'Image limit reached' using errcode='P0064';end if;
  insert into mtm_hw_private.tu_luan_images(student_id,lesson_code,owner_id,attempt_id,sha256,bytes,storage_path)
   values(sid,p_lesson,s.owner_id,p_attempt,p_sha256,p_bytes,s.owner_id::text||'/'||sid::text||'/'||p_lesson||'/'||p_sha256||'.jpg') returning * into img;
 end if;
 if img.bytes<>p_bytes then raise exception 'Image mismatch' using errcode='22023';end if;
 if p_action='confirm' and img.received_at is null then
  if not exists(select 1 from storage.objects o where o.bucket_id='mtm-tu-luan' and o.name=img.storage_path
   and (o.metadata->>'size')::bigint=img.bytes and o.metadata->>'mimetype'='image/jpeg' and o.created_at<deadline) then
   raise exception 'Image not uploaded' using errcode='22023';end if;
  select coalesce(max(page_number),0)+1 into n from mtm_hw_private.tu_luan_images where student_id=sid and lesson_code=p_lesson;
  if n>64 then raise exception 'Image limit reached' using errcode='P0064';end if;
  update mtm_hw_private.tu_luan_images set received_at=now_at,uploaded_at=object_at,page_number=n where id=img.id returning * into img;
 end if;
 return jsonb_build_object('id',img.id,'path',img.storage_path,'sha256',img.sha256,'bytes',img.bytes,
  'pageNumber',img.page_number,'receivedAt',img.received_at,'deadline',extract(epoch from deadline)*1000);
end$$;
revoke all on function public.mtm_tu_luan_student(text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.mtm_tu_luan_student(text,text,text,text,text,integer) to service_role;

create function public.mtm_tu_luan_teacher(p_lesson text default null) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare u uuid=mtm_hw_private.admin_id(); items jsonb;begin
 if p_lesson is null or p_lesson !~ '^[a-z0-9-]{1,160}$' then raise exception 'Lesson code required' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'studentId',s.id,'fullName',s.full_name,
  'className',c.label,'lessonCode',i.lesson_code,'attemptId',i.attempt_id,'pageNumber',i.page_number,
  'receivedAt',i.received_at,'path',i.storage_path) order by i.lesson_code,s.full_name,s.id,i.page_number),'[]'::jsonb)
 into items from mtm_hw_private.tu_luan_images i join mtm_hw_private.students s on s.id=i.student_id
 join mtm_hw_private.classes c on c.id=s.class_id
 where i.owner_id=u and i.received_at is not null and (p_lesson is null or i.lesson_code=p_lesson);
 return jsonb_build_object('items',items);
end$$;
revoke all on function public.mtm_tu_luan_teacher(text) from public,anon,service_role;
grant execute on function public.mtm_tu_luan_teacher(text) to authenticated;
commit;
