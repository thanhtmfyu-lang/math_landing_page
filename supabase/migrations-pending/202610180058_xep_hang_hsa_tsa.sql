-- 058 (18/10 15:00, anh Thành): thêm cột thứ 4 "HSA · TSA" (đánh giá năng lực, đánh giá tư duy) vào bảng xếp hạng.
-- Gộp mọi lớp có nhãn chứa HSA hoặc TSA (hiện: 2K9 HSA (CN), 2K9 HSA (THỨ 5)); xếp lại theo đúng luật: điểm TB lần đầu,
-- nộp nhiều hơn, tổng thời gian ít hơn. Nhóm có cohort='HSA-TSA', label='HSA · TSA'. ĐÃ ÁP (Claude).
begin;
create or replace function public.mtm_btvn_arena(p_kind text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c text; rws jsonb; res jsonb='[]'::jsonb; ex jsonb='[]'::jsonb; ex_ranked jsonb;
begin
 if p_kind is null or p_kind not in ('btvn-tuan','btvn-thang','kiem-tra-thang') then raise exception 'Invalid arena kind'; end if;
 foreach c in array array['2K9','2K10','2K11'] loop
  rws=coalesce(mtm_hw_private.btvn_rank_rows(c,p_kind,null,null,'00000000-0000-0000-0000-000000000000'::uuid),'[]'::jsonb);
  ex=ex||coalesce((select jsonb_agg(e) from jsonb_array_elements(rws) e where e->>'className' ~* '(HSA|TSA)'),'[]'::jsonb);
  res=res||jsonb_build_array(mtm_hw_private.arena_group(c,c,rws,array[c]));
 end loop;
 select coalesce(jsonb_agg(e||jsonb_build_object('rank',n) order by n),'[]'::jsonb) into ex_ranked
 from (select e,row_number() over(order by (e->>'score')::numeric desc,(e->>'submitted')::int desc,(e->>'seconds')::numeric asc nulls last,(e->>'rank')::int) n
       from jsonb_array_elements(ex) e) x;
 res=res||jsonb_build_array(mtm_hw_private.arena_group('HSA-TSA','HSA · TSA',ex_ranked,array['2K9','2K10','2K11'],'(HSA|TSA)'));
 return jsonb_build_object('kind',p_kind,'cohorts',res);
end$$;

-- Một nhóm: top 10, số em, số điểm 10, mọi lớp (kể cả lớp chưa có ai) với top 10 trong lớp.
create or replace function mtm_hw_private.arena_group(p_key text,p_label text,rws jsonb,p_cohorts text[],p_class_re text default null) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('cohort',p_key,'label',p_label,
  'top',coalesce((select jsonb_agg(e order by (e->>'rank')::int) from jsonb_array_elements(rws) e where (e->>'rank')::int<=10),'[]'::jsonb),
  'ranked',jsonb_array_length(rws),
  'perfect',(select count(*) from jsonb_array_elements(rws) e where (e->>'score')::numeric>=10),
  'classes',coalesce((select jsonb_agg(jsonb_build_object('className',k.cls,'students',coalesce(k.n,0),'avg',coalesce(k.avg,0),'best',coalesce(k.best,0),'leader',coalesce(k.leader,''),
     'top',coalesce((select jsonb_agg(e||jsonb_build_object('rank',e2.cr,'cohortRank',(e->>'rank')::int) order by e2.cr)
       from jsonb_array_elements(rws) e cross join lateral (select (select count(*) from jsonb_array_elements(rws) z where z->>'className'=k.cls and (z->>'rank')::int<=(e->>'rank')::int)::int cr) e2
       where e->>'className'=k.cls and e2.cr<=10),'[]'::jsonb)) order by k.n is null,k.avg desc nulls last,k.n desc nulls last,k.cls)
    from (select cl.label cls,g.n,g.avg,g.best,g.leader from mtm_hw_private.classes cl
      left join (select e->>'className' cls,count(*)::int n,round(avg((e->>'score')::numeric),2) avg,max((e->>'score')::numeric) best,
        (array_agg(e->>'fullName' order by (e->>'rank')::int))[1] leader from jsonb_array_elements(rws) e group by e->>'className') g on g.cls=cl.label
      where cl.active and upper(substring(cl.label from '^[^ ]+'))=any(p_cohorts) and (p_class_re is null or cl.label ~* p_class_re)
       and exists(select 1 from mtm_hw_private.students s where s.class_id=cl.id and s.active and coalesce(s.source_identity,'') not like 'qa:%')) k),'[]'::jsonb))
$$;
revoke all on function mtm_hw_private.arena_group(text,text,jsonb,text[],text) from public,anon,authenticated;
revoke all on function public.mtm_btvn_arena(text) from public,anon,authenticated,mtm_btvn_publisher;
grant execute on function public.mtm_btvn_arena(text) to service_role;
commit;
