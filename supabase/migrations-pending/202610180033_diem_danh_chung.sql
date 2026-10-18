-- 033 (18/10, anh Thành): kho điểm danh + chuyển buổi DÙNG CHUNG cho bot Zalo (Javis), máy quét Zoom trên PC và web.
-- Tin chuyển lịch đã xác nhận trong nhóm -> Javis gọi action 'move' -> tự chuyển điểm danh sang buổi mới, không hỏi lại quản lý.
-- Điểm danh ghi tay (quản lý/PH/HS/chuyển buổi) thắng dữ liệu tự động (vân tay/Zoom).
-- attendance_raw giữ nguyên bản ghi Zoom/vân tay để xuất Sheet đối chiếu. Chỉ service_role gọi được (qua Edge mtm-diem-danh). ĐÃ ÁP (Claude).
begin;
create table if not exists mtm_hw_private.schedule_moves(
 id bigserial primary key, student_id uuid not null references mtm_hw_private.students(id),
 from_class text not null, from_date date not null, to_class text not null, to_date date not null,
 reason text, confirmed_by text, source_msg text, created_at timestamptz not null default now(), cancelled_at timestamptz);
create table if not exists mtm_hw_private.attendance(
 student_id uuid not null references mtm_hw_private.students(id), class_label text not null, session_date date not null,
 status text not null check (status in ('co_mat','hoc_online','di_muon','ve_som','vang_phep','vang','chuyen_buoi','du_kien')),
 source text not null check (source in ('van_tay','zoom','quan_ly','phu_huynh','hoc_sinh','chuyen_buoi')),
 time_in text, time_out text, note text, move_id bigint references mtm_hw_private.schedule_moves(id),
 updated_at timestamptz not null default now(), primary key(student_id,session_date,class_label));
create table if not exists mtm_hw_private.attendance_raw(
 id bigserial primary key, source text not null check (source in ('zoom','van_tay')), session_date date not null,
 room text not null default '', raw_name text not null, time_in text, time_out text, minutes numeric, segments text,
 student_id uuid references mtm_hw_private.students(id), class_label text, file_ref text,
 created_at timestamptz not null default now(), unique(source,session_date,room,raw_name,time_in));
alter table mtm_hw_private.attendance enable row level security;
alter table mtm_hw_private.schedule_moves enable row level security;
alter table mtm_hw_private.attendance_raw enable row level security;
revoke all on mtm_hw_private.attendance, mtm_hw_private.schedule_moves, mtm_hw_private.attendance_raw from public,anon,authenticated;

create or replace function mtm_hw_private.vn_fold(x text) returns text language sql immutable set search_path='' as $$
 select regexp_replace(lower(translate(btrim(regexp_replace(coalesce(x,''),'\s*[\(\[].*$','')),
  'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ',
  'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD')),'\s+',' ','g') $$;

-- Tìm học sinh theo tên (+ lớp/khối nếu có). Trả {id,fullName,className} hoặc {error, candidates}.
create or replace function mtm_hw_private.dd_find_student(p_name text,p_class text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; n int;
begin
 select count(*),jsonb_agg(jsonb_build_object('id',s.id,'fullName',s.full_name,'className',c.label)) into n,r
 from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
 where s.active and c.active and coalesce(s.source_identity,'') not like 'qa:%'
  and mtm_hw_private.vn_fold(s.full_name)=mtm_hw_private.vn_fold(p_name)
  and (coalesce(p_class,'')='' or c.label=p_class or upper(split_part(c.label,' ',1))=upper(split_part(p_class,' ',1)));
 if n=1 then return r->0; end if;
 if n=0 then
  select jsonb_agg(jsonb_build_object('fullName',s.full_name,'className',c.label)) into r from (
   select s2.full_name,s2.class_id from mtm_hw_private.students s2 where s2.active
    and mtm_hw_private.vn_fold(s2.full_name) like '%'||mtm_hw_private.vn_fold(p_name)||'%' limit 8) s
   join mtm_hw_private.classes c on c.id=s.class_id;
  return jsonb_build_object('error','not_found','candidates',coalesce(r,'[]'::jsonb));
 end if;
 return jsonb_build_object('error','ambiguous','candidates',r);
end$$;

-- Ghi một dòng điểm danh; dữ liệu tự động không đè dữ liệu ghi tay (trừ dòng 'du_kien').
create or replace function mtm_hw_private.dd_put(p_student uuid,p_class text,p_date date,p_status text,p_source text,p_in text,p_out text,p_note text,p_move bigint) returns text
language plpgsql security definer set search_path='' as $$
declare cur_status text; cur_source text;
begin
 select a.status,a.source into cur_status,cur_source from mtm_hw_private.attendance a where a.student_id=p_student and a.session_date=p_date and a.class_label=p_class;
 if found and p_source in ('van_tay','zoom') and cur_source not in ('van_tay','zoom') and cur_status<>'du_kien' then
  return 'giu_ghi_tay:'||cur_status;
 end if;
 insert into mtm_hw_private.attendance(student_id,class_label,session_date,status,source,time_in,time_out,note,move_id,updated_at)
 values(p_student,p_class,p_date,p_status,p_source,p_in,p_out,p_note,p_move,now())
 on conflict(student_id,session_date,class_label) do update set status=excluded.status,source=excluded.source,
  time_in=coalesce(excluded.time_in,mtm_hw_private.attendance.time_in),time_out=coalesce(excluded.time_out,mtm_hw_private.attendance.time_out),
  note=coalesce(excluded.note,mtm_hw_private.attendance.note),move_id=coalesce(excluded.move_id,mtm_hw_private.attendance.move_id),updated_at=now();
 return 'ok';
end$$;

create or replace function public.mtm_dd_api(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare act text=p->>'action'; st jsonb; mid bigint; rr jsonb; res jsonb='[]'::jsonb; d date; cls text; fcls text; n int=0;
begin
 if act='find' then return mtm_hw_private.dd_find_student(p->>'student',p->>'class');

 elsif act='move' then
  st=mtm_hw_private.dd_find_student(p->>'student',coalesce(p->>'fromClass',p->>'toClass'));
  if st ? 'error' then return st; end if;
  if (p->>'fromDate') is null or (p->>'toDate') is null or coalesce(p->>'toClass','')='' then
   return jsonb_build_object('error','need fromDate,toDate,toClass'); end if;
  fcls=coalesce(nullif(p->>'fromClass',''),st->>'className');
  insert into mtm_hw_private.schedule_moves(student_id,from_class,from_date,to_class,to_date,reason,confirmed_by,source_msg)
  values((st->>'id')::uuid,fcls,(p->>'fromDate')::date,p->>'toClass',(p->>'toDate')::date,p->>'reason',p->>'confirmedBy',p->>'sourceMsg') returning id into mid;
  perform mtm_hw_private.dd_put((st->>'id')::uuid,fcls,(p->>'fromDate')::date,'chuyen_buoi','chuyen_buoi',null,null,
   'Chuyển sang '||(p->>'toClass')||' '||to_char((p->>'toDate')::date,'DD/MM'),mid);
  perform mtm_hw_private.dd_put((st->>'id')::uuid,p->>'toClass',(p->>'toDate')::date,'du_kien','chuyen_buoi',null,null,
   'Chuyển từ '||fcls||' '||to_char((p->>'fromDate')::date,'DD/MM'),mid);
  return jsonb_build_object('ok',true,'moveId',mid,'student',st);

 elsif act='cancel_move' then
  update mtm_hw_private.schedule_moves set cancelled_at=now() where id=(p->>'moveId')::bigint and cancelled_at is null;
  delete from mtm_hw_private.attendance where move_id=(p->>'moveId')::bigint and source='chuyen_buoi';
  return jsonb_build_object('ok',true);

 elsif act='mark' then
  for rr in select x from jsonb_array_elements(coalesce(p->'rows','[]'::jsonb)) x loop
   st=mtm_hw_private.dd_find_student(rr->>'student',rr->>'class');
   if st ? 'error' then res=res||jsonb_build_array(jsonb_build_object('student',rr->>'student','result',st));
   else res=res||jsonb_build_array(jsonb_build_object('student',st->>'fullName','result',
     mtm_hw_private.dd_put((st->>'id')::uuid,coalesce(nullif(rr->>'class',''),st->>'className'),(rr->>'date')::date,
      rr->>'status',rr->>'source',rr->>'timeIn',rr->>'timeOut',rr->>'note',null)));
   end if;
  end loop;
  return jsonb_build_object('ok',true,'results',res);

 elsif act='raw' then
  -- Bản ghi gốc Zoom/vân tay: {source, date, room, fileRef, rows:[{name, timeIn, timeOut, minutes, segments, class}]}
  for rr in select x from jsonb_array_elements(coalesce(p->'rows','[]'::jsonb)) x loop
   st=mtm_hw_private.dd_find_student(rr->>'name',rr->>'class');
   insert into mtm_hw_private.attendance_raw(source,session_date,room,raw_name,time_in,time_out,minutes,segments,student_id,class_label,file_ref)
   values(p->>'source',(p->>'date')::date,coalesce(p->>'room',''),rr->>'name',rr->>'timeIn',rr->>'timeOut',(rr->>'minutes')::numeric,rr->>'segments',
    case when st ? 'error' then null else (st->>'id')::uuid end,case when st ? 'error' then null else st->>'className' end,p->>'fileRef')
   on conflict(source,session_date,room,raw_name,time_in) do update set time_out=excluded.time_out,minutes=excluded.minutes,segments=excluded.segments,
    student_id=coalesce(excluded.student_id,mtm_hw_private.attendance_raw.student_id),class_label=coalesce(excluded.class_label,mtm_hw_private.attendance_raw.class_label);
   n=n+1;
  end loop;
  return jsonb_build_object('ok',true,'rows',n);

 elsif act='session' then
  cls=p->>'class'; d=(p->>'date')::date;
  return coalesce((select jsonb_agg(q.x order by q.x->>'fullName') from (
   select jsonb_build_object('fullName',btrim(regexp_replace(s.full_name,'\s*[\(\[].*$','')),'homeClass',c.label,
    'movedIn',m_in.id is not null,'movedOut',m_out.id is not null,
    'status',coalesce(at.status,case when m_out.id is not null then 'chuyen_buoi' end),'source',at.source,
    'timeIn',at.time_in,'timeOut',at.time_out,'note',at.note,
    'btvn',(select jsonb_agg(jsonb_build_object('title',coalesce(l.exam->>'title',l.code),'date',coalesce(l.material->'classDates'->>c.label,l.material->>'date'),
       'best',(select max(o.score) from mtm_hw_private.btvn_official_receipts(s.id,l.code) o),
       'first',(select o.score from mtm_hw_private.btvn_official_receipts(s.id,l.code) o where o.submitted_at is not null order by o.submitted_at limit 1),
       'submissions',(select count(*) from mtm_hw_private.btvn_official_receipts(s.id,l.code) o where o.submitted_at is not null)))
     from mtm_hw_private.btvn_lessons l where l.active and l.kind='btvn' and s.class_id=any(l.class_ids)
      and coalesce(l.material->'classDates'->>c.label,l.material->>'date')::date between coalesce(m_in.from_date,d)-6 and coalesce(m_in.from_date,d))) x
   from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
   left join mtm_hw_private.schedule_moves m_in on m_in.student_id=s.id and m_in.to_class=cls and m_in.to_date=d and m_in.cancelled_at is null
   left join mtm_hw_private.schedule_moves m_out on m_out.student_id=s.id and m_out.from_class=cls and m_out.from_date=d and m_out.cancelled_at is null
   left join mtm_hw_private.attendance at on at.student_id=s.id and at.session_date=d and at.class_label=cls
   where s.active and coalesce(s.source_identity,'') not like 'qa:%' and (c.label=cls or m_in.id is not null)) q),'[]'::jsonb);

 elsif act='moves' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'fullName',s.full_name,'from',m.from_class||' '||m.from_date,'to',m.to_class||' '||m.to_date,
    'reason',m.reason,'confirmedBy',m.confirmed_by,'at',m.created_at,'cancelled',m.cancelled_at is not null) order by m.id desc)
   from mtm_hw_private.schedule_moves m join mtm_hw_private.students s on s.id=m.student_id
   where m.from_date>=coalesce((p->>'since')::date,current_date-14) or m.to_date>=coalesce((p->>'since')::date,current_date-14)),'[]'::jsonb);
 end if;
 return jsonb_build_object('error','unknown action');
end$$;
revoke all on function public.mtm_dd_api(jsonb) from public,anon,authenticated;
grant execute on function public.mtm_dd_api(jsonb) to service_role;
revoke all on function mtm_hw_private.dd_find_student(text,text),mtm_hw_private.dd_put(uuid,text,date,text,text,text,text,text,bigint),mtm_hw_private.vn_fold(text) from public,anon,authenticated;
commit;
