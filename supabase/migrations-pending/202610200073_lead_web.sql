-- 073 (20/10/2026): lead từ form đăng ký và thi thử HSA lưu vào Supabase của trung tâm, thay cho EmailJS cũ (khóa do tài khoản khác tạo).
-- Web ghi qua /api/dang-ky (bật bằng MTM_LEAD_ENABLED=1 sau khi áp migration này). Chưa bật thì form vẫn gửi đường EmailJS cũ.
-- Đọc lead: select * from mtm_lead.leads order by created_at desc;  (SQL editor, hoặc Javis bằng service role qua mtm_lead_moi).
begin;
create schema if not exists mtm_lead;
revoke all on schema mtm_lead from public,anon,authenticated;

create table mtm_lead.leads(
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 kind text not null check(kind in('dang-ky','thi-thu-hsa')),
 student_name text not null check(char_length(student_name) between 1 and 200),
 phone text not null check(phone ~ '^0[35789][0-9]{8}$'),
 grade text not null check(grade in('10','11','12','dgnl','hsa','tsa','thcs')),
 study_mode text not null check(study_mode in('truc-tiep','online')),
 trial boolean not null default false,
 trial_slot text not null default '' check(char_length(trial_slot)<=80),
 group_size text not null default '' check(group_size ~ '^([2-9]|[1-9][0-9])?$'),
 group_interest boolean not null default false,
 notes text not null default '' check(char_length(notes)<=2000),
 lead_source text not null default '' check(char_length(lead_source)<=300),
 handled_at timestamptz
);
create index leads_created_idx on mtm_lead.leads(created_at desc);
create index leads_phone_idx on mtm_lead.leads(phone,kind,created_at desc);
alter table mtm_lead.leads enable row level security;
revoke all on mtm_lead.leads from public,anon,authenticated;

-- Ghi một lead; cùng số + cùng loại trong 10 phút thì coi là gửi lại, không thêm dòng.
create or replace function public.mtm_lead_add(p_kind text,p_student_name text,p_phone text,p_grade text,p_study_mode text,p_trial boolean,p_trial_slot text,p_group_size text,p_group_interest boolean,p_notes text,p_lead_source text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 select id into v_id from mtm_lead.leads where phone=p_phone and kind=p_kind and created_at>now()-interval '10 minutes' order by created_at desc limit 1;
 if v_id is not null then return jsonb_build_object('status','already','id',v_id); end if;
 insert into mtm_lead.leads(kind,student_name,phone,grade,study_mode,trial,trial_slot,group_size,group_interest,notes,lead_source)
 values(p_kind,p_student_name,p_phone,p_grade,p_study_mode,coalesce(p_trial,false),coalesce(p_trial_slot,''),coalesce(p_group_size,''),coalesce(p_group_interest,false),coalesce(p_notes,''),coalesce(p_lead_source,''))
 returning id into v_id;
 return jsonb_build_object('status','accepted','id',v_id);
end $$;

-- Lead chưa xử lý (cho Javis báo về Telegram/Zalo), cũ nhất trước.
create or replace function public.mtm_lead_moi(p_limit int default 50)
returns setof mtm_lead.leads language sql security definer set search_path='' stable as $$
 select * from mtm_lead.leads where handled_at is null order by created_at limit least(greatest(coalesce(p_limit,50),1),200);
$$;
create or replace function public.mtm_lead_da_xu_ly(p_ids uuid[])
returns int language sql security definer set search_path='' as $$
 with u as (update mtm_lead.leads set handled_at=now() where id=any(p_ids) and handled_at is null returning 1) select count(*)::int from u;
$$;

revoke all on function public.mtm_lead_add(text,text,text,text,text,boolean,text,text,boolean,text,text) from public,anon,authenticated;
revoke all on function public.mtm_lead_moi(int) from public,anon,authenticated;
revoke all on function public.mtm_lead_da_xu_ly(uuid[]) from public,anon,authenticated;
grant usage on schema mtm_lead to service_role;
grant select,insert,update on mtm_lead.leads to service_role;
grant execute on function public.mtm_lead_add(text,text,text,text,text,boolean,text,text,boolean,text,text) to service_role;
grant execute on function public.mtm_lead_moi(int) to service_role;
grant execute on function public.mtm_lead_da_xu_ly(uuid[]) to service_role;
commit;
