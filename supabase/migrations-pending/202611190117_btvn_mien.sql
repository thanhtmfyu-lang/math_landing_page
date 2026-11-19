-- 19/11/2026: ô "Miễn – đã làm" cho từng HS trên một bài BTVN.
-- Dùng khi bài bị đăng lại (bài cũ ẩn) mà HS đã làm bài cũ: giữ kết quả, coi như đã làm, không bắt làm lại.
-- Cách làm: btvn_official_receipts (nguồn chung của bảng cuối ca hv_ca_rows, J39, trước ca, xếp hạng,
-- lịch sử bài GV) trả thêm 1 lượt nộp "miễn" có đánh dấu exempt=true, điểm = điểm giữ lại (không bịa điểm).
-- Không chép bài nộp, không sửa btvn_work.
begin;

create table if not exists mtm_hw_private.btvn_mien(
 id bigint generated always as identity primary key,
 student_id uuid not null references mtm_hw_private.students(id),
 lesson_code text not null references mtm_hw_private.btvn_lessons(code),
 diem numeric not null check(diem>=0 and diem<=10),
 lam_luc timestamptz not null,
 tu_bai text references mtm_hw_private.btvn_lessons(code),
 ly_do text not null check(length(btrim(ly_do)) between 1 and 1000),
 nguon text not null unique check(length(btrim(nguon)) between 1 and 300),
 created_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,
 check(tu_bai is null or tu_bai<>lesson_code));
alter table mtm_hw_private.btvn_mien enable row level security;
revoke all on mtm_hw_private.btvn_mien from public,anon,authenticated,service_role;
create unique index if not exists btvn_mien_dang_hieu_luc on mtm_hw_private.btvn_mien(student_id,lesson_code) where revoked_at is null;

-- Giữ nguyên thân cũ (202610170026), chỉ nối thêm lượt "miễn".
create or replace function mtm_hw_private.btvn_official_receipts(p_student uuid,p_lesson text)
returns table(receipt jsonb,score numeric,submitted_at numeric) language sql stable security definer set search_path='' as $$
 select r,mtm_hw_private.btvn_receipt_official_score(r,l.exam,l.material,g.score),
  case when jsonb_typeof(r->'submittedAt')='number' then (r->>'submittedAt')::numeric end
 from mtm_hw_private.btvn_work w join mtm_hw_private.btvn_lessons l on l.code=w.lesson_code
 cross join lateral jsonb_array_elements(w.receipts) r
 left join mtm_hw_private.btvn_manual_grades g on g.student_id=w.student_id and g.lesson_code=w.lesson_code and g.attempt_id=r->>'attemptId'
  and g.receipt_hash=sha256(convert_to((r-'late')::text,'UTF8')) and g.context_hash=mtm_hw_private.btvn_grading_context(l.exam,l.material)
  and (select count(*) from jsonb_array_elements(w.receipts) x where x->>'attemptId'=r->>'attemptId')=1
 where w.student_id=p_student and w.lesson_code=p_lesson
 union all
 select jsonb_build_object('attemptId','mien-'||m.id,'exempt',true,'fromLesson',m.tu_bai,'late',false,
   'submittedAt',floor(extract(epoch from m.lam_luc)*1000)::numeric),
  m.diem,floor(extract(epoch from m.lam_luc)*1000)::numeric
 from mtm_hw_private.btvn_mien m
 where m.student_id=p_student and m.lesson_code=p_lesson and m.revoked_at is null
$$;
revoke all on function mtm_hw_private.btvn_official_receipts(uuid,text) from public,anon,authenticated,service_role,mtm_btvn_publisher;

-- Mọi HS đã nộp bài cũ (p_tu_bai) và thuộc lớp của bài mới (p_bai) được miễn bài mới.
-- Điểm giữ = điểm cao nhất chính thức của bài cũ; giờ làm = lần nộp đầu bài cũ.
-- HS bài cũ chưa có điểm (đang chờ chấm) thì bỏ qua, đếm vào bo_qua. Chạy lại không tạo trùng.
create or replace function mtm_hw_private.btvn_mien_tu_bai_cu(p_tu_bai text,p_bai text,p_ly_do text,p_nguon text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare moi int=0; bo_qua int=0; x record; lb mtm_hw_private.btvn_lessons%rowtype;
begin
 select * into lb from mtm_hw_private.btvn_lessons where code=p_bai and kind='btvn';
 if not found or not exists(select 1 from mtm_hw_private.btvn_lessons where code=p_tu_bai and kind='btvn') or p_tu_bai=p_bai then
  raise exception 'MIEN_BAI_KHONG_HOP_LE';end if;
 for x in
  select s.id sid,
   (select max(o.score) from mtm_hw_private.btvn_official_receipts(s.id,p_tu_bai) o where coalesce(o.receipt->>'exempt','')<>'true') diem,
   (select min(o.submitted_at) from mtm_hw_private.btvn_official_receipts(s.id,p_tu_bai) o where o.submitted_at is not null and coalesce(o.receipt->>'exempt','')<>'true') lam
  from mtm_hw_private.students s
  where s.class_id=any(lb.class_ids)
   and exists(select 1 from mtm_hw_private.btvn_work w where w.student_id=s.id and w.lesson_code=p_tu_bai and jsonb_array_length(w.receipts)>0)
 loop
  if x.lam is null then continue;end if;
  if x.diem is null then bo_qua=bo_qua+1;continue;end if;
  if exists(select 1 from mtm_hw_private.btvn_mien where student_id=x.sid and lesson_code=p_bai and revoked_at is null) then continue;end if;
  insert into mtm_hw_private.btvn_mien(student_id,lesson_code,diem,lam_luc,tu_bai,ly_do,nguon)
  values(x.sid,p_bai,x.diem,to_timestamp(x.lam/1000),p_tu_bai,p_ly_do,p_nguon||':'||p_bai||':'||x.sid)
  on conflict (nguon) do nothing;
  if found then moi=moi+1;end if;
 end loop;
 return jsonb_build_object('moi',moi,'boQua',bo_qua);
end$$;
revoke all on function mtm_hw_private.btvn_mien_tu_bai_cu(text,text,text,text) from public,anon,authenticated,service_role,mtm_btvn_publisher;

-- Cổng cho bot/QL (service_role): đặt miễn cho 1 HS, xem, hủy.
-- p: {"action":"mien","studentId","lessonCode","diem","lamLuc"?,"tuBai"?,"lyDo","nguon"} | {"action":"xem","lessonCode"} | {"action":"huy","id"}
create or replace function public.mtm_btvn_mien(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r mtm_hw_private.btvn_mien%rowtype; a text=coalesce(p->>'action','');
begin
 if a='xem' then
  return jsonb_build_object('mien',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'studentId',m.student_id,'diem',m.diem,'tuBai',m.tu_bai,'lyDo',m.ly_do) order by m.id)
   from mtm_hw_private.btvn_mien m where m.lesson_code=p->>'lessonCode' and m.revoked_at is null),'[]'));
 elsif a='huy' then
  update mtm_hw_private.btvn_mien set revoked_at=clock_timestamp() where id=(p->>'id')::bigint and revoked_at is null returning * into r;
  return jsonb_build_object('ok',found);
 elsif a='mien' then
  if not exists(select 1 from mtm_hw_private.students s join mtm_hw_private.btvn_lessons l on s.class_id=any(l.class_ids)
   where s.id=(p->>'studentId')::uuid and l.code=p->>'lessonCode' and l.kind='btvn') then raise exception 'MIEN_HS_KHONG_THUOC_LOP_BAI';end if;
  select * into r from mtm_hw_private.btvn_mien where nguon=p->>'nguon';
  if found then return jsonb_build_object('ok',true,'id',r.id,'trung',true);end if;
  update mtm_hw_private.btvn_mien set revoked_at=clock_timestamp()
   where student_id=(p->>'studentId')::uuid and lesson_code=p->>'lessonCode' and revoked_at is null;
  insert into mtm_hw_private.btvn_mien(student_id,lesson_code,diem,lam_luc,tu_bai,ly_do,nguon)
  values((p->>'studentId')::uuid,p->>'lessonCode',(p->>'diem')::numeric,coalesce((p->>'lamLuc')::timestamptz,clock_timestamp()),
   nullif(p->>'tuBai',''),p->>'lyDo',p->>'nguon') returning * into r;
  return jsonb_build_object('ok',true,'id',r.id);
 end if;
 raise exception 'MIEN_ACTION_KHONG_HOP_LE';
end$$;
revoke all on function public.mtm_btvn_mien(jsonb) from public,anon,authenticated;
grant execute on function public.mtm_btvn_mien(jsonb) to service_role;

-- Bản sao _real100 đọc lại btvn_official_receipts mới.
do $r$begin if to_regprocedure('mtm_test100.refresh_reports()') is not null then perform mtm_test100.refresh_reports();end if;end$r$;
commit;
