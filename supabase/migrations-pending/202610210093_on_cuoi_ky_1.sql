-- 093: PR nháp, CHƯA ÁP. Phụ thuộc 005 (BTVN identity), 073/074 (lead).
-- Giữ private schema, dùng phiên BTVN đã xác minh. Không dùng số điện thoại trình duyệt làm danh tính.
begin;
alter table mtm_lead.leads drop constraint if exists leads_kind_check;
alter table mtm_lead.leads add constraint leads_kind_check check(kind in('dang-ky','thi-thu-hsa','kiem-tra-dau-vao','on-cuoi-ky-1'));
create schema mtm_hk1;
revoke all on schema mtm_hk1 from public,anon,authenticated;
create table mtm_hk1.settings(
 grade text primary key check(grade in('10','11','12')),
 opens_at timestamptz not null default '2026-11-16 00:00:00+07',
 max_views int not null default 3 check(max_views between 1 and 100),
 watch_seconds int not null default 3600 check(watch_seconds between 60 and 3600)
);
insert into mtm_hk1.settings(grade) values('10'),('11'),('12');
create table mtm_hk1.videos(
 id text primary key,grade text not null references mtm_hk1.settings,
 week int not null check(week between 1 and 4), advanced boolean not null,
 private_path text check(private_path like 'hk1/%' and private_path not like '%..%'),
 enabled boolean not null default false,
 max_views int check(max_views between 1 and 100),
 unique(grade,week,advanced)
);
-- Chỉ placeholder, không URL/đáp án/media thật. Luồng phát hành kiểm video rồi cấu hình riêng.
insert into mtm_hk1.videos(id,grade,week,advanced)
select 'hk1-'||g||'-w'||w||'-'||case when a then 'advanced' else 'core' end,g,w,a
from unnest(array['10','11','12'])g cross join generate_series(1,4)w cross join unnest(array[false,true])a;
create table mtm_hk1.enrollments(
 student_id uuid not null references mtm_hw_private.students(id),grade text not null references mtm_hk1.settings,
 lead_id uuid not null references mtm_lead.leads(id),advanced boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),primary key(student_id,grade)
);
create table mtm_hk1.views(
 student_id uuid not null references mtm_hw_private.students(id),video_id text not null references mtm_hk1.videos,
 used int not null default 0 check(used>=0),primary key(student_id,video_id)
);
create table mtm_hk1.grants(
 student_id uuid not null references mtm_hw_private.students(id),request_id uuid not null,
 video_id text not null references mtm_hk1.videos,expires_at timestamptz not null,
 primary key(student_id,request_id)
);
create table mtm_hk1.book_codes(
 digest text primary key check(digest ~ '^[a-f0-9]{64}$'),grade text not null references mtm_hk1.settings,
 expires_at timestamptz not null,redeemed_by uuid references mtm_hw_private.students(id),redeemed_at timestamptz
);
create table mtm_hk1.activation_limits(
 student_id uuid primary key references mtm_hw_private.students(id),hits int not null,until_at timestamptz not null
);
do $$declare t text;begin
 foreach t in array array['settings','videos','enrollments','views','grants','book_codes','activation_limits'] loop
  execute format('alter table mtm_hk1.%I enable row level security',t);
  execute format('revoke all on mtm_hk1.%I from public,anon,authenticated',t);
 end loop;
end$$;

create function public.mtm_hk1_register(p_session text,p_kind text,p_student_name text,p_phone text,p_grade text,p_study_mode text,p_trial boolean,p_trial_slot text,p_group_size text,p_group_interest boolean,p_notes text,p_lead_source text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; lid uuid;
begin
 begin sid=mtm_hw_private.btvn_student(p_session);exception when insufficient_privilege then return '{"status":"login"}'::jsonb;end;
 if p_kind<>'on-cuoi-ky-1' or p_grade not in('10','11','12') then raise exception 'Invalid registration';end if;
 -- Cùng học sinh/khối, kể cả đổi thiết bị hoặc gửi song song, vẫn một enrollment và một lead.
 perform pg_advisory_xact_lock(hashtextextended('hk1-register:'||sid::text||':'||p_grade,0));
 if exists(select 1 from mtm_hk1.enrollments where student_id=sid and grade=p_grade) then return '{"status":"already"}'::jsonb;end if;
 insert into mtm_lead.leads(kind,student_name,phone,grade,study_mode,trial,trial_slot,group_size,group_interest,notes,lead_source)
 values(p_kind,p_student_name,p_phone,p_grade,p_study_mode,coalesce(p_trial,false),coalesce(p_trial_slot,''),coalesce(p_group_size,''),coalesce(p_group_interest,false),coalesce(p_notes,''),coalesce(p_lead_source,'')) returning id into lid;
 insert into mtm_hk1.enrollments(student_id,grade,lead_id) values(sid,p_grade,lid);
 return '{"status":"accepted"}'::jsonb;
end$$;

create function public.mtm_hk1_access(p_session text,p_action text,p_grade text,p_video text default '',p_request uuid default null,p_hash text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; e mtm_hk1.enrollments; cfg mtm_hk1.settings; v mtm_hk1.videos;
 n int; cap int; exp timestamptz; oldgrant mtm_hk1.grants; code mtm_hk1.book_codes; hits int;
begin
 begin sid=mtm_hw_private.btvn_student(p_session);exception when insufficient_privilege then return '{"status":"login"}'::jsonb;end;
 if p_action not in('state','play','activate') or p_grade not in('10','11','12') then return '{"status":"invalid"}'::jsonb;end if;
 select * into cfg from mtm_hk1.settings where grade=p_grade;
 select * into e from mtm_hk1.enrollments where student_id=sid and grade=p_grade;
 if p_action='state' then
  return jsonb_build_object('status','ok','registered',e.student_id is not null,'advanced',coalesce(e.advanced,false),
   'lessons',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'views',coalesce(w.used,0),'limit',coalesce(q.max_views,cfg.max_views),
    'available',q.enabled and q.private_path is not null and clock_timestamp()>=cfg.opens_at+make_interval(weeks=>q.week-1)) order by q.week,q.advanced),'[]'::jsonb)
    from mtm_hk1.videos q left join mtm_hk1.views w on w.student_id=sid and w.video_id=q.id where q.grade=p_grade));
 end if;
 if e.student_id is null then return '{"status":"register"}'::jsonb;end if;
 if p_action='activate' then
  insert into mtm_hk1.activation_limits as l values(sid,1,clock_timestamp()+interval '15 minutes')
   on conflict(student_id) do update set hits=case when l.until_at<=clock_timestamp() then 1 else l.hits+1 end,
    until_at=case when l.until_at<=clock_timestamp() then clock_timestamp()+interval '15 minutes' else l.until_at end returning l.hits into hits;
  if hits>10 then return '{"status":"rate"}'::jsonb;end if;
  select * into code from mtm_hk1.book_codes where digest=p_hash and grade=p_grade for update;
  if code.digest is null or code.expires_at<=clock_timestamp() or (code.redeemed_by is not null and code.redeemed_by<>sid) then return '{"status":"invalid"}'::jsonb;end if;
  update mtm_hk1.book_codes set redeemed_by=sid,redeemed_at=coalesce(redeemed_at,clock_timestamp()) where digest=p_hash;
  update mtm_hk1.enrollments set advanced=true where student_id=sid and grade=p_grade;
  return '{"status":"ok","advanced":true}'::jsonb;
 end if;
 select * into v from mtm_hk1.videos where id=p_video and grade=p_grade;
 if v.id is null or not v.enabled or v.private_path is null then return '{"status":"missing"}'::jsonb;end if;
 if clock_timestamp()<cfg.opens_at+make_interval(weeks=>v.week-1) then return '{"status":"closed"}'::jsonb;end if;
 if v.advanced and not e.advanced then return '{"status":"advanced"}'::jsonb;end if;
 if p_request is null then return '{"status":"invalid"}'::jsonb;end if;
 -- Serialize cả UUID retry lẫn bộ đếm video: nhiều tab/thiết bị không vượt N.
 perform pg_advisory_xact_lock(hashtextextended('hk1-play:'||sid::text,0));
 select * into oldgrant from mtm_hk1.grants where student_id=sid and request_id=p_request;
 cap=coalesce(v.max_views,cfg.max_views);
 if oldgrant.request_id is not null then
  if oldgrant.video_id<>p_video then return '{"status":"invalid"}'::jsonb;end if;
  exp=oldgrant.expires_at;
  select used into n from mtm_hk1.views where student_id=sid and video_id=p_video;
 else
  insert into mtm_hk1.views as w values(sid,p_video,1) on conflict(student_id,video_id)
   do update set used=w.used+1 where w.used<cap returning used into n;
  if n is null then return '{"status":"limit"}'::jsonb;end if;
  exp=clock_timestamp()+make_interval(secs=>cfg.watch_seconds);
  insert into mtm_hk1.grants values(sid,p_request,p_video,exp);
 end if;
 return jsonb_build_object('status','ok','path',v.private_path,'views',n,'limit',cap,'expiresAt',exp);
end$$;

-- Chỉ gọi bằng script server của quản trị. Mã rõ sinh bằng crypto.randomBytes; DB nhận SHA256.
create function public.mtm_hk1_issue_code(p_hash text,p_grade text,p_expires timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_expires<=clock_timestamp() then raise exception 'Future expiry required';end if;
 insert into mtm_hk1.book_codes(digest,grade,expires_at) values(p_hash,p_grade,p_expires);
 return true;
end$$;
revoke all on function public.mtm_hk1_register(text,text,text,text,text,text,boolean,text,text,boolean,text,text) from public,anon,authenticated;
revoke all on function public.mtm_hk1_access(text,text,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.mtm_hk1_issue_code(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.mtm_hk1_register(text,text,text,text,text,text,boolean,text,text,boolean,text,text) to service_role;
grant execute on function public.mtm_hk1_access(text,text,text,text,uuid,text) to service_role;
grant execute on function public.mtm_hk1_issue_code(text,text,timestamptz) to service_role;
-- Bucket private; tuyệt đối không đưa video nâng cao vào public/ hoặc YouTube công khai.
insert into storage.buckets(id,name,public) values('mtm-semester','mtm-semester',false);
commit;
