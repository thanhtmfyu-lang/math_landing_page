-- V13: CHƯA ÁP. Chủ repo triển khai sau khi duyệt PR; không chạy từ lượt Codex này.
-- Chỉ cách ly đề đã có khóa trong Git công khai; giữ điểm/lượt cũ.
begin;
create table if not exists mtm_exam_private.exposed_exam_ids (
 exam_id text primary key,
 reason text not null default 'answer-key-in-public-git'
);
alter table mtm_exam_private.exposed_exam_ids enable row level security;
revoke all on mtm_exam_private.exposed_exam_ids from public,anon,authenticated;
insert into mtm_exam_private.exposed_exam_ids(exam_id) values
('mtm-g10-gk1-2025-2026-code101'),
('mtm-g11-gk1-2024-2025-code101'),
('mtm-g12-gk1-2025-2026-code1201'),
('mtm-gk1-toan-10-01'),
('mtm-gk1-toan-10-02'),
('mtm-gk1-toan-10-03'),
('mtm-gk1-toan-11-01'),
('mtm-gk1-toan-11-02'),
('mtm-gk1-toan-11-03'),
('mtm-gk1-toan-12-01'),
('mtm-gk1-toan-12-02'),
('mtm-gk1-toan-12-03'),
('mtm-hsa-thi-thu-01'),
('mtm-hsa-thi-thu-02'),
('mtm-tm-10-GK1-17-code1001'),
('mtm-tm-10-GK1-49-code158'),
('mtm-tm-11-GK1-28-code1101'),
('mtm-tm-12-GK1-1-code0103'),
('mtm-tm-12-GK1-18-code1201'),
('mtm-tm-12-GK1-3-code1001'),
('mtm-tm-12-GK1-41-code101'),
('mtm-tm-modern-supplement-10-GK1-1-code101'),
('mtm-tm-modern-supplement-10-GK1-10-code101'),
('mtm-tm-modern-supplement-10-GK1-15-code101'),
('mtm-tm-modern-supplement-10-GK1-20-code001'),
('mtm-tm-modern-supplement-10-GK1-35-code121'),
('mtm-tm-modern-supplement-10-GK1-4-code132'),
('mtm-tm-modern-supplement-10-GK1-46-code101'),
('mtm-tm-modern-supplement-11-GK1-20-code105'),
('mtm-tm-modern-supplement-11-GK1-3-code111'),
('mtm-tm-modern-supplement-11-GK1-36-code111'),
('mtm-tm-modern-supplement-11-GK1-37-codeT111'),
('mtm-tm-modern-supplement-11-GK1-47-code157'),
('mtm-tm-modern-supplement-11-GK1-47-code157-mtm-v37'),
('mtm-tm-modern-supplement-11-GK1-51-code001'),
('mtm-tm-modern-supplement-11-GK1-53-code111'),
('mtm-tm-modern-supplement-11-GK1-7-code101'),
('mtm-tm-modern-supplement-11-GK1-7-code101-mtm-v37'),
('mtm-tm-supplement-12-GK1-13-code158'),
('mtm-tm-supplement-12-GK1-15-code101'),
('mtm-tm-supplement-12-GK1-28-code101'),
('mtm-tm-supplement-12-GK1-34-code001'),
('mtm-tm-supplement-12-GK1-61-code101')
on conflict (exam_id) do nothing;

update mtm_hsa_rank.exams set active=false
where exam_id in (select exam_id from mtm_exam_private.exposed_exam_ids);

create or replace function mtm_exam_private.block_exposed_rank() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from mtm_exam_private.exposed_exam_ids where exam_id=new.exam_id) then
  raise exception 'Practice-only exam cannot enter ranking' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function mtm_exam_private.block_exposed_rank() from public,anon,authenticated;
drop trigger if exists block_exposed_rank on mtm_hsa_rank.entries;
create trigger block_exposed_rank before insert or update on mtm_hsa_rank.entries
for each row execute function mtm_exam_private.block_exposed_rank();
commit;
