-- 074 (20/10/2026): Kiểm tra đầu vào web (/kiem-tra-dau-vao) ghi phiếu học thử và kết quả vào kho lead chung mtm_lead.leads.
-- Phụ thuộc 073 (mtm_lead). Bật cùng cờ MTM_LEAD_ENABLED=1; cần thêm MTM_DAU_VAO_KEY (khóa giải mã đề, cũng dùng ký mã phiếu).
-- Luồng: học sinh điền phiếu trước khi làm bài -> mtm_lead_dau_vao_add (một dòng kind='kiem-tra-dau-vao', hiện ngay trong mtm_lead_moi
-- để bot báo quản lý lớp) -> nộp bài, máy chủ chấm -> mtm_lead_dau_vao_ket_qua gắn điểm vào đúng dòng -> mtm_lead_ket_qua_moi cho bot báo lần hai.
-- Chỉ service_role gọi được. Xem: select created_at,student_name,phone,ho_so,ket_qua_text from mtm_lead.leads where kind='kiem-tra-dau-vao' order by created_at desc;
begin;
do $guard$
begin
 if to_regclass('mtm_lead.leads') is null then raise exception '074 cần áp 073_lead_web trước'; end if;
end $guard$;

alter table mtm_lead.leads drop constraint if exists leads_kind_check;
alter table mtm_lead.leads add constraint leads_kind_check check(kind in('dang-ky','thi-thu-hsa','kiem-tra-dau-vao'));
alter table mtm_lead.leads
 add column if not exists ho_so jsonb check(ho_so is null or (jsonb_typeof(ho_so)='object' and pg_column_size(ho_so)<=4000)),
 add column if not exists ket_qua jsonb check(ket_qua is null or (jsonb_typeof(ket_qua)='object' and pg_column_size(ket_qua)<=8000)),
 add column if not exists ket_qua_text text check(ket_qua_text is null or char_length(ket_qua_text)<=4000),
 add column if not exists ket_qua_at timestamptz,
 add column if not exists ket_qua_handled_at timestamptz;
create index if not exists leads_ket_qua_moi_idx on mtm_lead.leads(ket_qua_at) where ket_qua_at is not null and ket_qua_handled_at is null;

-- Ghi phiếu học thử. Cùng số + cùng tên trong 10 phút là gửi lại (trả dòng cũ); một số quá 6 phiếu/24 giờ thì từ chối (chống spam).
create or replace function public.mtm_lead_dau_vao_add(p_id uuid,p_student_name text,p_phone text,p_grade text,p_study_mode text,p_trial_slot text,p_notes text,p_lead_source text,p_ho_so jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 select id into v_id from mtm_lead.leads where kind='kiem-tra-dau-vao' and phone=p_phone and lower(student_name)=lower(p_student_name)
  and created_at>now()-interval '10 minutes' order by created_at desc limit 1;
 if v_id is not null then return jsonb_build_object('status','already','id',v_id); end if;
 if (select count(*) from mtm_lead.leads where kind='kiem-tra-dau-vao' and phone=p_phone and created_at>now()-interval '24 hours')>=6 then
  return jsonb_build_object('status','limit');
 end if;
 insert into mtm_lead.leads(id,kind,student_name,phone,grade,study_mode,trial,trial_slot,notes,lead_source,ho_so)
 values(p_id,'kiem-tra-dau-vao',p_student_name,p_phone,p_grade,p_study_mode,true,coalesce(p_trial_slot,''),coalesce(p_notes,''),coalesce(p_lead_source,''),p_ho_so)
 returning id into v_id;
 return jsonb_build_object('status','accepted','id',v_id);
end $$;

-- Gắn kết quả máy chủ đã chấm; chỉ phiếu kiểm tra đầu vào trong 3 ngày. Làm lại thì ghi đè bằng lần mới nhất và báo lại.
create or replace function public.mtm_lead_dau_vao_ket_qua(p_id uuid,p_ket_qua jsonb,p_text text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update mtm_lead.leads set ket_qua=p_ket_qua,ket_qua_text=p_text,ket_qua_at=now(),ket_qua_handled_at=null
  where id=p_id and kind='kiem-tra-dau-vao' and created_at>now()-interval '3 days';
 return found;
end $$;

-- Kết quả chưa báo quản lý lớp (cho bot), cũ nhất trước; báo xong thì đánh dấu.
create or replace function public.mtm_lead_ket_qua_moi(p_limit int default 50)
returns setof mtm_lead.leads language sql security definer set search_path='' stable as $$
 select * from mtm_lead.leads where ket_qua_at is not null and ket_qua_handled_at is null order by ket_qua_at limit least(greatest(coalesce(p_limit,50),1),200);
$$;
create or replace function public.mtm_lead_ket_qua_da_bao(p_ids uuid[])
returns int language sql security definer set search_path='' as $$
 with u as (update mtm_lead.leads set ket_qua_handled_at=now() where id=any(p_ids) and ket_qua_handled_at is null returning 1) select count(*)::int from u;
$$;

revoke all on function public.mtm_lead_dau_vao_add(uuid,text,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.mtm_lead_dau_vao_ket_qua(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.mtm_lead_ket_qua_moi(int) from public,anon,authenticated;
revoke all on function public.mtm_lead_ket_qua_da_bao(uuid[]) from public,anon,authenticated;
grant execute on function public.mtm_lead_dau_vao_add(uuid,text,text,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.mtm_lead_dau_vao_ket_qua(uuid,jsonb,text) to service_role;
grant execute on function public.mtm_lead_ket_qua_moi(int) to service_role;
grant execute on function public.mtm_lead_ket_qua_da_bao(uuid[]) to service_role;
commit;
