-- V13: CHƯA ÁP. Chỉ chủ repo triển khai sau duyệt PR. Phụ thuộc 077.
-- Không trả danh sách thí sinh, lớp, liên hệ hoặc đáp án. Giữ toàn bộ lượt cũ.
begin;
create or replace function public.mtm_pt_phan_tich(p_nonce text,p_de text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare own mtm_phong_thi.luot;n integer;bins jsonb;
begin
 select * into own from mtm_phong_thi.luot where nonce=p_nonce and de=p_de;
 if not found then raise exception 'Submitted attempt required' using errcode='42501';end if;
 with first_attempts as (
  select distinct on(nguoi) nguoi,diem,thang from mtm_phong_thi.luot
  where de=own.de and dot is not distinct from own.dot and not qua_gio
  order by nguoi,nop_luc,id
 ), counts as (
  select least(9,greatest(0,floor(diem*10/nullif(thang,0))::integer)) bin,count(*) amount
  from first_attempts group by 1
 ) select (select count(*) from first_attempts),jsonb_agg(jsonb_build_object('bin',g,'count',coalesce(c.amount,0)) order by g)
 into n,bins from generate_series(0,9) g left join counts c on c.bin=g;
 if n<5 then return jsonb_build_object('available',false);end if;
 return jsonb_build_object('available',true,'scope',case when own.dot is null then 'de' else 'dot' end,'total',n,'bins',bins);
end $$;
revoke all on function public.mtm_pt_phan_tich(text,text) from public,anon,authenticated;
grant execute on function public.mtm_pt_phan_tich(text,text) to service_role;
commit;
