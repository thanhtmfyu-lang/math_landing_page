-- CHƯA ÁP DỤNG. Khóa lựa chọn ngay khi bắt đầu, theo HS + kỳ, không theo từng mã.
-- Giữ các wrapper lịch/phân quyền hiện hành; Claude review và áp dụng riêng.
begin;

alter function public.mtm_btvn_read(text,text) rename to mtm_btvn_read_before_thi_thang_choice101;
create function public.mtm_btvn_read(p_session text,p_lesson text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid=mtm_hw_private.btvn_student(p_session);result jsonb;cards jsonb;
begin
 result=public.mtm_btvn_read_before_thi_thang_choice101(p_session,p_lesson);
 -- Chỉ thêm tiến độ cho các thẻ đã được phép trả; không mở rộng lớp/phạm vi test.
 select coalesce(jsonb_agg(case when a.card->>'lessonCode' ~ '^thi-thang-[0-9]{4}-[0-9]{2}-[a-z0-9-]+-(thi|btvn)-ma-[12]$'
  then a.card||jsonb_build_object('startedAt',progress.started_at) else a.card end order by a.ord),'[]'::jsonb)
 into cards from jsonb_array_elements(coalesce(result->'lessons','[]'::jsonb)) with ordinality a(card,ord)
 left join mtm_hw_private.btvn_work w on w.student_id=sid and w.lesson_code=a.card->>'lessonCode'
 left join lateral (select min(case when jsonb_typeof(d->'startedAt')='number' then (d->>'startedAt')::numeric end) started_at
  from jsonb_array_elements(coalesce(w.drafts,'[]'::jsonb)) d) progress on true;
 return result||jsonb_build_object('lessons',cards);
end$$;

alter function public.mtm_btvn_commit(text,text,integer,jsonb,jsonb) rename to mtm_btvn_commit_before_thi_thang_choice101;
create function public.mtm_btvn_commit(p_session text,p_lesson text,p_revision integer,p_drafts jsonb,p_receipts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid=mtm_hw_private.btvn_student(p_session);part text[];base text;chosen integer;current_work mtm_hw_private.btvn_work;
begin
 part=regexp_match(p_lesson,'^(thi-thang-[0-9]{4}-[0-9]{2}-[a-z0-9-]+)-(thi|btvn)-ma-([12])$');
 if part is not null then
  base=part[1];
  -- CAS cũ chỉ khóa từng bài. Hai mã cùng kỳ phải cùng khóa giao dịch trước khi đọc lựa chọn.
  perform pg_advisory_xact_lock(hashtextextended('btvn-thi-thang:'||sid::text||':'||base,0));
  select right(w.lesson_code,1)::integer into chosen from mtm_hw_private.btvn_work w
  where w.student_id=sid and w.lesson_code in (base||'-thi-ma-1',base||'-thi-ma-2')
   and (jsonb_array_length(w.drafts)>0 or jsonb_array_length(w.receipts)>0)
  order by (select min(case when jsonb_typeof(d->'startedAt')='number' then (d->>'startedAt')::numeric end)
   from jsonb_array_elements(w.drafts) d) nulls last,w.lesson_code limit 1;
  -- HS offline: giữ quy tắc cũ, nộp BTVN mã kia mới xác nhận mã làm trên giấy.
  if chosen is null then
   select 3-right(w.lesson_code,1)::integer into chosen from mtm_hw_private.btvn_work w
   where w.student_id=sid and w.lesson_code in (base||'-btvn-ma-1',base||'-btvn-ma-2')
    and exists(select 1 from jsonb_array_elements(w.receipts) r where r->>'submittedAt' is not null)
   order by w.lesson_code limit 1;
  end if;
  if chosen is not null and ((part[2]='thi' and part[3]::integer<>chosen)
   or (part[2]='btvn' and part[3]::integer=chosen)) then
   -- Adapter đọc lại snapshot để trả lý do khóa; không ký/trả đề của mã thua.
   return jsonb_build_object('ok',false);
  end if;
  if part[2]='thi' then
   select * into current_work from mtm_hw_private.btvn_work where student_id=sid and lesson_code=p_lesson;
   -- Không được xóa/thay lượt đã bắt đầu để gỡ khóa hoặc khởi động lại đồng hồ.
   if jsonb_array_length(current_work.drafts)>0 and
    (p_drafts->0->>'attemptId' is distinct from current_work.drafts->0->>'attemptId'
     or p_drafts->0->'startedAt' is distinct from current_work.drafts->0->'startedAt') then
    return jsonb_build_object('ok',false);
   end if;
  end if;
 end if;
 return public.mtm_btvn_commit_before_thi_thang_choice101(p_session,p_lesson,p_revision,p_drafts,p_receipts);
end$$;

-- 099 giữ phân mã SHA tên/lớp. Thay đúng gate đó bằng lựa chọn đã lưu;
-- giữ luồng ảnh, hạn 15 phút, chống trùng, kiểm object và biên nhận như cũ.
create or replace function public.mtm_tu_luan_student(
 p_session text,p_lesson text,p_attempt text,p_action text,
 p_sha256 text default null,p_bytes integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid=mtm_hw_private.btvn_student(p_session);
 s mtm_hw_private.students; l mtm_hw_private.btvn_lessons;
 w mtm_hw_private.btvn_work; img mtm_hw_private.tu_luan_images;
 deadline timestamptz; parts text[]; chosen integer;
 n integer; items jsonb; object_at timestamptz; now_at timestamptz=clock_timestamp();
begin
 if p_action is null or p_action not in ('list','reserve','confirm') then
  raise exception 'Invalid action' using errcode='22023';end if;
 select * into s from mtm_hw_private.students where id=sid and active;
 select * into l from mtm_hw_private.btvn_lessons
 where code=p_lesson and active and owner_id=s.owner_id and s.class_id=any(class_ids);
 if not found or l.kind is distinct from 'kiem-tra-thang' or l.closes_at is null or l.opens_at is null
 or now_at<l.opens_at or l.is_test is distinct from s.is_test
 or not exists(select 1 from jsonb_array_elements(l.exam->'questions') q where q->>'kind' in ('self','essay')) then
  raise exception 'Lesson unavailable' using errcode='42501';end if;
 parts=regexp_match(l.code,'^(thi-thang-[0-9]{4}-[0-9]{2}-[a-z0-9-]+)-thi-ma-([12])$');
 if parts is not null then
  perform pg_advisory_xact_lock(hashtextextended('btvn-thi-thang:'||sid::text||':'||parts[1],0));
  select right(b.lesson_code,1)::integer into chosen from mtm_hw_private.btvn_work b
  where b.student_id=sid and b.lesson_code in (parts[1]||'-thi-ma-1',parts[1]||'-thi-ma-2')
   and (jsonb_array_length(b.drafts)>0 or jsonb_array_length(b.receipts)>0)
  order by (select min(case when jsonb_typeof(d->'startedAt')='number' then (d->>'startedAt')::numeric end)
   from jsonb_array_elements(b.drafts) d) nulls last,b.lesson_code limit 1;
  if chosen is null or parts[2]::integer is distinct from chosen then
   raise exception 'Wrong exam code' using errcode='42501';end if;
 end if;
 -- Giữ khóa lượt để cấp số trang ổn định và gộp request từ nhiều tab.
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
  -- Mất ACK: bytes Storage nhận trước hạn vẫn được xác nhận như 099.
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

revoke all on function public.mtm_btvn_read_before_thi_thang_choice101(text,text),public.mtm_btvn_commit_before_thi_thang_choice101(text,text,integer,jsonb,jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
revoke all on function public.mtm_btvn_read(text,text),public.mtm_btvn_commit(text,text,integer,jsonb,jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
grant execute on function public.mtm_btvn_read(text,text),public.mtm_btvn_commit(text,text,integer,jsonb,jsonb) to service_role;
revoke all on function public.mtm_tu_luan_student(text,text,text,text,text,integer) from public,anon,authenticated,mtm_btvn_publisher;
grant execute on function public.mtm_tu_luan_student(text,text,text,text,text,integer) to service_role;

commit;
