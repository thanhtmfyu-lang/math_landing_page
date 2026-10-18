-- 037 (18/10): so tên chuẩn hoá Unicode NFC (tên web có dạng tổ hợp) + nhận họ đặt cuối ('Quỳnh Anh Hoàng'). ĐÃ ÁP (Claude).
begin;
create or replace function mtm_hw_private.vn_fold(x text) returns text language sql immutable set search_path='' as $$
 select regexp_replace(lower(translate(btrim(regexp_replace(normalize(coalesce(x,''),NFC),'\s*[\(\[].*$','')),
  'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ',
  'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD')),'\s+',' ','g') $$;

create or replace function mtm_hw_private.dd_match_in(p_name text,p_classes text[],p_date date) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare n text=regexp_replace(mtm_hw_private.dd_clean_name(p_name),'\s+',' ','g'); w text[]; rot text; rot2 text; hit uuid[]; one uuid; rule int;
begin
 if n='' then return null; end if;
 select a.student_id into one from mtm_hw_private.attendance_alias a where a.name_fold=n;
 if one is not null then return one; end if;
 w=string_to_array(n,' ');
 rot=case when array_length(w,1)>=2 then array_to_string(w[2:],' ')||' '||w[1] else n end;
 rot2=case when array_length(w,1)>=2 then w[array_length(w,1)]||' '||array_to_string(w[1:array_length(w,1)-1],' ') else n end;
 for rule in 1..5 loop
  select array_agg(distinct s.id) into hit
  from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
  where s.active and coalesce(s.source_identity,'') not like 'qa:%'
   and (c.label=any(p_classes) or exists(select 1 from mtm_hw_private.schedule_moves m where m.student_id=s.id and m.to_class=any(p_classes) and m.to_date=p_date and m.cancelled_at is null))
   and case rule
    when 1 then mtm_hw_private.vn_fold(s.full_name)=n
    when 2 then mtm_hw_private.vn_fold(s.full_name) in (rot,rot2)
    when 3 then array_length(w,1)>=2 and (mtm_hw_private.vn_fold(s.full_name) like '% '||n or mtm_hw_private.vn_fold(s.full_name) like '% '||rot or mtm_hw_private.vn_fold(s.full_name) like '% '||rot2)
    when 4 then array_length(w,1)>=2 and mtm_hw_private.vn_fold(s.full_name) like '%'||n||'%'
    else array_length(w,1)=1 and length(n)>=3 and mtm_hw_private.vn_fold(s.full_name) like '% '||n end;
  if array_length(hit,1)=1 then return hit[1]; end if;
  if array_length(hit,1)>1 then return null; end if; -- trùng nhiều em: không đoán
 end loop;
 return null;
end$$;
commit;
