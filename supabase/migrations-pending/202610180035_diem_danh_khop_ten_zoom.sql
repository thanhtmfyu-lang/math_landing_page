-- 035 (18/10): khớp tên Zoom/vân tay với học sinh trong ĐÚNG các lớp của ca (tên gọi, đảo họ tên, tiền tố số/SOS) + bảng tên gọi học được.
-- action 'alias' {name, student, class}: dạy một lần, lần sau tự khớp. ĐÃ ÁP (Claude).
begin;
create table if not exists mtm_hw_private.attendance_alias(
 name_fold text primary key, student_id uuid not null references mtm_hw_private.students(id), created_at timestamptz not null default now());
alter table mtm_hw_private.attendance_alias enable row level security;
revoke all on mtm_hw_private.attendance_alias from public,anon,authenticated;

create or replace function mtm_hw_private.dd_clean_name(x text) returns text language sql immutable set search_path='' as $$
 select btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(mtm_hw_private.vn_fold(x),
  '2k\d+\s*(8\+|9\+|xpt|xps|hsa)?','','g'),'^[\s\.\-_:]*(sos|hs|ph|\d+)[\s\.\-_:]+',''),'[^a-z ]',' ','g'),'\s+',' ','g')) $$;

-- Khớp một tên trong danh sách học sinh của các lớp p_classes (và em chuyển đến ngày p_date). Chỉ nhận khi DUY NHẤT.
create or replace function mtm_hw_private.dd_match_in(p_name text,p_classes text[],p_date date) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare n text=regexp_replace(mtm_hw_private.dd_clean_name(p_name),'\s+',' ','g'); w text[]; rot text; hit uuid[]; one uuid; rule int;
begin
 if n='' then return null; end if;
 select a.student_id into one from mtm_hw_private.attendance_alias a where a.name_fold=n;
 if one is not null then return one; end if;
 w=string_to_array(n,' ');
 rot=case when array_length(w,1)>=2 then array_to_string(w[2:],' ')||' '||w[1] else n end;
 for rule in 1..5 loop
  select array_agg(distinct s.id) into hit
  from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
  where s.active and coalesce(s.source_identity,'') not like 'qa:%'
   and (c.label=any(p_classes) or exists(select 1 from mtm_hw_private.schedule_moves m where m.student_id=s.id and m.to_class=any(p_classes) and m.to_date=p_date and m.cancelled_at is null))
   and case rule
    when 1 then mtm_hw_private.vn_fold(s.full_name)=n
    when 2 then mtm_hw_private.vn_fold(s.full_name)=rot
    when 3 then array_length(w,1)>=2 and (mtm_hw_private.vn_fold(s.full_name) like '% '||n or mtm_hw_private.vn_fold(s.full_name) like '% '||rot)
    when 4 then array_length(w,1)>=2 and mtm_hw_private.vn_fold(s.full_name) like '%'||n||'%'
    else array_length(w,1)=1 and length(n)>=3 and mtm_hw_private.vn_fold(s.full_name) like '% '||n end;
  if array_length(hit,1)=1 then return hit[1]; end if;
  if array_length(hit,1)>1 then return null; end if; -- trùng nhiều em: không đoán
 end loop;
 return null;
end$$;

create or replace function mtm_hw_private.dd_auto_mark(p_source text,p_date date,p_sessions jsonb) returns int
language plpgsql security definer set search_path='' as $$
declare r record; ss jsonb; cls text; n int=0; best_ov int; ov int; classes text[]; sid uuid; home text;
begin
 select array_agg(x->>'class') into classes from jsonb_array_elements(coalesce(p_sessions,'[]'::jsonb)) x;
 -- 1) khớp lại tên chưa khớp (hoặc khớp nhầm lớp ngoài ca) trong đúng các lớp của ca
 for r in select * from mtm_hw_private.attendance_raw a where a.source=p_source and a.session_date=p_date
   and (a.student_id is null or not (a.class_label=any(coalesce(classes,'{}')))) loop
  sid=mtm_hw_private.dd_match_in(r.raw_name,coalesce(classes,'{}'),p_date);
  if sid is not null then
   select c.label into home from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id where s.id=sid;
   update mtm_hw_private.attendance_raw set student_id=sid,class_label=home where id=r.id;
  end if;
 end loop;
 -- 2) đánh điểm danh vào ca của lớp em (hoặc ca em được chuyển đến), trùng giờ >= 30 phút
 for r in select * from mtm_hw_private.attendance_raw a where a.source=p_source and a.session_date=p_date and a.student_id is not null loop
  cls=null; best_ov=0;
  for ss in select x from jsonb_array_elements(coalesce(p_sessions,'[]'::jsonb)) x loop
   if ss->>'class'=r.class_label or exists(select 1 from mtm_hw_private.schedule_moves m where m.student_id=r.student_id and m.to_class=ss->>'class' and m.to_date=p_date and m.cancelled_at is null) then
    if p_source='van_tay' then ov=1000;
    else ov=least(mtm_hw_private.hm(r.time_out),mtm_hw_private.hm(ss->>'end'))-greatest(mtm_hw_private.hm(r.time_in),mtm_hw_private.hm(ss->>'start'));
    end if;
    if ov>best_ov then best_ov=ov; cls=ss->>'class'; end if;
   end if;
  end loop;
  if cls is not null and best_ov>=30 then
   perform mtm_hw_private.dd_put(r.student_id,cls,p_date,case when p_source='zoom' then 'hoc_online' else 'co_mat' end,p_source,r.time_in,r.time_out,
    case when p_source='zoom' then 'Zoom '||r.room||' '||coalesce(r.minutes::text,'')||' phút' else 'Vân tay' end,null);
   n=n+1;
  end if;
 end loop;
 return n;
end$$;

create or replace function public.mtm_dd_api2(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; st jsonb;
begin
 if p->>'action'='alias' then
  st=mtm_hw_private.dd_find_student(p->>'student',p->>'class');
  if st ? 'error' then return st; end if;
  insert into mtm_hw_private.attendance_alias(name_fold,student_id) values(regexp_replace(mtm_hw_private.dd_clean_name(p->>'name'),'\s+',' ','g'),(st->>'id')::uuid)
  on conflict(name_fold) do update set student_id=excluded.student_id,created_at=now();
  update mtm_hw_private.attendance_raw set student_id=(st->>'id')::uuid,class_label=st->>'className'
   where regexp_replace(mtm_hw_private.dd_clean_name(raw_name),'\s+',' ','g')=regexp_replace(mtm_hw_private.dd_clean_name(p->>'name'),'\s+',' ','g');
  return jsonb_build_object('ok',true,'student',st);
 elsif p->>'action'='unmatched' then
  return coalesce((select jsonb_agg(jsonb_build_object('source',a.source,'date',a.session_date,'room',a.room,'name',a.raw_name,'timeIn',a.time_in,'timeOut',a.time_out) order by a.session_date desc,a.time_in)
   from mtm_hw_private.attendance_raw a where a.student_id is null and a.session_date>=coalesce((p->>'since')::date,current_date-7)),'[]'::jsonb);
 end if;
 r=public.mtm_dd_api(p);
 if p->>'action'='raw' and p ? 'sessions' and coalesce((r->>'ok')::boolean,false) then
  r=r||jsonb_build_object('marked',mtm_hw_private.dd_auto_mark(p->>'source',(p->>'date')::date,p->'sessions'));
 end if;
 return r;
end$$;
revoke all on function mtm_hw_private.dd_match_in(text,text[],date),mtm_hw_private.dd_clean_name(text) from public,anon,authenticated;
commit;
