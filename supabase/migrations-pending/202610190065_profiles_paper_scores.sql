-- 065: Hồ sơ có phiên bản và điểm kiểm tra giấy tách khỏi BTVN.
-- Chạy sau 064. Không thay luật bot, không gửi tin hoặc tự tạo lịch.
begin;
alter table mtm_hw_private.students add column birth_date date;
alter table mtm_hw_private.students add column profile_version integer not null default 1 check(profile_version>0);
alter table mtm_hw_private.students add constraint students_birth_date_range check(birth_date is null or birth_date>=date '1900-01-01');

create table mtm_hw_private.student_profile_history(
 id bigint generated always as identity primary key, student_id uuid not null references mtm_hw_private.students(id),
 version integer not null, source_msg text not null unique, request_hash text not null, changed_columns text[] not null,
 before_profile jsonb not null, after_profile jsonb not null,
 created_at timestamptz not null default clock_timestamp(),unique(student_id,version)
);
create table mtm_hw_private.paper_scores(
 id bigint generated always as identity primary key, student_id uuid not null references mtm_hw_private.students(id),
 test_code text not null check(test_code ~ '^[A-Za-z0-9_.:-]{1,100}$'), test_date date not null,
 subject text not null default 'Toán' check(length(btrim(subject)) between 1 and 100),
 score numeric not null, max_score numeric not null check(max_score>0 and max_score<=1000000),
 unit text not null check(unit in ('điểm','%','câu')),source_msg text not null unique,
 supersedes_id bigint unique references mtm_hw_private.paper_scores(id),superseded_by bigint unique references mtm_hw_private.paper_scores(id),
 created_at timestamptz not null default clock_timestamp(),
 check(score>=0 and score<=max_score),check(unit<>'%' or max_score=100),
 check(unit<>'câu' or (score=trunc(score) and max_score=trunc(max_score)))
);
create unique index paper_scores_current_uq on mtm_hw_private.paper_scores(student_id,test_code,test_date) where superseded_by is null;
alter table mtm_hw_private.student_profile_history enable row level security;
alter table mtm_hw_private.paper_scores enable row level security;
revoke all on mtm_hw_private.student_profile_history,mtm_hw_private.paper_scores from public,anon,authenticated,service_role;
create trigger mtm_sync_capture after insert or update or delete on mtm_hw_private.paper_scores
 for each row execute function mtm_hw_private.sync_capture('id,student_id,test_code,test_date');

create function mtm_hw_private.profile_state(s mtm_hw_private.students) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('fullName',s.full_name,'school',s.school,'schoolClass',s.school_class,
  'phone',s.student_phone,'parentPhone',s.parent_phone,'phName',s.parent_name,'birthDate',s.birth_date)
$$;

create function mtm_hw_private.student_profile_action(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s mtm_hw_private.students; before_state jsonb; after_state jsonb; nm text; suffix text; value text;
 dob date; changed text[]; src text=p->>'sourceMsg'; old_history mtm_hw_private.student_profile_history; req_hash text;
begin
 if coalesce(p->>'studentId','')='' then return jsonb_build_object('error','need_student_id');end if;
 if p->>'action'='student_profile_read' then select * into s from mtm_hw_private.students where id=(p->>'studentId')::uuid
  and owner_id=(select owner_id from mtm_hw_private.btvn_roster_scope where singleton);
 else select * into s from mtm_hw_private.students where id=(p->>'studentId')::uuid
  and owner_id=(select owner_id from mtm_hw_private.btvn_roster_scope where singleton) for update;end if;
 if not found then return jsonb_build_object('error','student_not_found');end if;
 if p->>'action'='student_profile_read' then
  return jsonb_build_object('ok',true,'studentId',s.id,'version',s.profile_version,
   'profileHash',encode(extensions.digest(mtm_hw_private.profile_state(s)::text,'sha256'),'hex'),
   'hasBirthDate',s.birth_date is not null,'hasPhone',coalesce(s.student_phone,'')<>'','hasParentPhone',coalesce(s.parent_phone,'')<>'');
 end if;
 if coalesce(src,'')='' then return jsonb_build_object('error','need_source_msg');end if;
 req_hash=encode(extensions.digest((p-'sourceMsg')::text,'sha256'),'hex');
 select * into old_history from mtm_hw_private.student_profile_history where source_msg=src;
 if found then
  if old_history.student_id<>s.id or old_history.request_hash<>req_hash then return jsonb_build_object('error','source_conflict');end if;
  return jsonb_build_object('ok',true,'duplicate',true,'studentId',s.id,'version',old_history.version);
 end if;
 if p->>'expectedVersion' is null then return jsonb_build_object('error','need_expected_version');end if;
 if (p->>'expectedVersion')::int<>s.profile_version then return jsonb_build_object('error','profile_version_conflict','version',s.profile_version);end if;
 before_state=mtm_hw_private.profile_state(s);
 -- fullName là tên cơ bản. Giữ ghi chú lịch cũ trong ngoặc, không dùng đổi tên để xóa lịch học.
 if coalesce(btrim(p->>'fullName'),'')<>'' then
  nm=btrim(regexp_replace(normalize(p->>'fullName',NFC),'\s*[\(\[].*$',''));
  if length(nm) not between 1 and 160 then return jsonb_build_object('error','invalid_name');end if;
  suffix=substring(s.full_name from '(\s*[\(\[].*)$');s.full_name=nm||coalesce(suffix,'');
  if length(s.full_name)>200 then return jsonb_build_object('error','name_with_schedule_too_long');end if;
 end if;
 if coalesce(btrim(p->>'school'),'')<>'' then
  if length(btrim(p->>'school'))>200 then return jsonb_build_object('error','invalid_school');end if;
  s.school=btrim(p->>'school');
 end if;
 if coalesce(btrim(p->>'schoolClass'),'')<>'' then
  if length(btrim(p->>'schoolClass'))>100 then return jsonb_build_object('error','invalid_school_class');end if;
  s.school_class=upper(btrim(p->>'schoolClass'));
 end if;
 if coalesce(btrim(p->>'phName'),'')<>'' then
  if length(btrim(p->>'phName'))>200 then return jsonb_build_object('error','invalid_parent_name');end if;
  s.parent_name=btrim(p->>'phName');
 end if;
 if coalesce(btrim(p->>'phone'),'')<>'' then
  value=mtm_hw_private.btvn_phone2(p->>'phone');
  if value !~ '^0[0-9]{9}$' then return jsonb_build_object('error','invalid_phone');end if;
  s.student_phone=value;
 end if;
 if coalesce(btrim(p->>'parentPhone'),'')<>'' then
  value=mtm_hw_private.btvn_phone2(p->>'parentPhone');
  if value !~ '^0[0-9]{9}$' then return jsonb_build_object('error','invalid_parent_phone');end if;
  s.parent_phone=value;
 end if;
 if coalesce(btrim(p->>'birthDate'),'')<>'' then
  if p->>'birthDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return jsonb_build_object('error','invalid_birth_date');end if;
  begin dob=(p->>'birthDate')::date;exception when datetime_field_overflow or invalid_datetime_format then return jsonb_build_object('error','invalid_birth_date');end;
  if dob<date '1900-01-01' or dob>(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date then return jsonb_build_object('error','invalid_birth_date');end if;
  s.birth_date=dob;
 end if;
 after_state=mtm_hw_private.profile_state(s);
 if before_state=after_state then return jsonb_build_object('ok',true,'unchanged',true,'studentId',s.id,'version',s.profile_version);end if;
 select array_agg(k order by k) into changed from jsonb_object_keys(after_state) k where before_state->k is distinct from after_state->k;
 update mtm_hw_private.students set full_name=s.full_name,school=s.school,school_class=s.school_class,student_phone=s.student_phone,
  parent_phone=s.parent_phone,parent_name=s.parent_name,birth_date=s.birth_date,profile_version=profile_version+1 where id=s.id returning profile_version into s.profile_version;
 insert into mtm_hw_private.student_profile_history(student_id,version,source_msg,request_hash,changed_columns,before_profile,after_profile)
 values(s.id,s.profile_version,src,req_hash,changed,before_state,after_state);
 return jsonb_build_object('ok',true,'studentId',s.id,'version',s.profile_version,'changedFields',to_jsonb(changed),
  'profileHash',encode(extensions.digest(after_state::text,'sha256'),'hex'));
end$$;

create function mtm_hw_private.paper_score_action(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid; d date; score_n numeric; max_n numeric; unit_name text; src text=p->>'sourceMsg'; code text=p->>'testCode';
 old_score mtm_hw_private.paper_scores; existing mtm_hw_private.paper_scores; newid bigint; subj text;
begin
 if coalesce(p->>'studentId','')='' then return jsonb_build_object('error','need_student_id');end if;
 sid=(p->>'studentId')::uuid;
 if not exists(select 1 from mtm_hw_private.students where id=sid and owner_id=(select owner_id from mtm_hw_private.btvn_roster_scope where singleton)) then return jsonb_build_object('error','student_not_found');end if;
 if p->>'action'='paper_score_read' then
  return jsonb_build_object('ok',true,'scores',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'studentId',x.student_id,'testCode',x.test_code,
   'testDate',x.test_date,'score',x.score,'maxScore',x.max_score,'unit',x.unit,'subject',x.subject,'supersedesId',x.supersedes_id,
   'rowHash',encode(extensions.digest((to_jsonb(x)-'source_msg')::text,'sha256'),'hex')) order by x.test_date,x.id)
   from mtm_hw_private.paper_scores x where x.student_id=sid and x.superseded_by is null and (coalesce(code,'')='' or x.test_code=code)),'[]'::jsonb));
 end if;
 if coalesce(src,'')='' then return jsonb_build_object('error','need_source_msg');end if;
 if coalesce(code,'') !~ '^[A-Za-z0-9_.:-]{1,100}$' or coalesce(p->>'testDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  or p->>'score' is null or p->>'maxScore' is null then return jsonb_build_object('error','need_test_date_score_scale');end if;
 begin d=(p->>'testDate')::date;score_n=(p->>'score')::numeric;max_n=(p->>'maxScore')::numeric;
 exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then return jsonb_build_object('error','invalid_score_input');end;
 unit_name=coalesce(nullif(p->>'unit',''),'điểm');subj=coalesce(nullif(btrim(p->>'subject'),''),'Toán');
 if d<date '2000-01-01' or d>(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date then return jsonb_build_object('error','invalid_test_date');end if;
 if score_n::text in ('NaN','Infinity','-Infinity') or max_n::text in ('NaN','Infinity','-Infinity') or max_n<=0 or max_n>1000000 or score_n<0 or score_n>max_n
  or unit_name not in ('điểm','%','câu') or (unit_name='%' and max_n<>100) or (unit_name='câu' and (score_n<>trunc(score_n) or max_n<>trunc(max_n)))
  or length(subj)>100 then return jsonb_build_object('error','invalid_score_range_or_unit');end if;
 -- Khóa theo học sinh+bài+ngày để hai bản sửa không ghi đè đồng thời.
 perform pg_advisory_xact_lock(hashtextextended('paper:'||sid::text||':'||code||':'||d::text,0));
 select * into existing from mtm_hw_private.paper_scores where source_msg=src;
 if found then
  if existing.student_id<>sid or existing.test_code<>code or existing.test_date<>d or existing.score<>score_n or existing.max_score<>max_n or existing.unit<>unit_name or existing.subject<>subj
   then return jsonb_build_object('error','source_conflict');end if;
  return jsonb_build_object('ok',true,'duplicate',true,'scoreId',existing.id);
 end if;
 select * into old_score from mtm_hw_private.paper_scores where student_id=sid and test_code=code and test_date=d and superseded_by is null for update;
 if found and coalesce(p->>'supersedesId','')<>old_score.id::text then return jsonb_build_object('error','need_supersedes_id','scoreId',old_score.id);end if;
 if not found and coalesce(p->>'supersedesId','')<>'' then return jsonb_build_object('error','supersedes_not_current');end if;
 -- Đặt trước id mới để đóng unique current rồi thêm bản sửa trong cùng transaction.
 newid=nextval(pg_get_serial_sequence('mtm_hw_private.paper_scores','id'));
 if old_score.id is not null then
  -- FK superseded_by DEFERRABLE cho phép nối sang id mới chỉ trong transaction hiện hành.
  update mtm_hw_private.paper_scores set superseded_by=newid where id=old_score.id;
 end if;
 insert into mtm_hw_private.paper_scores(id,student_id,test_code,test_date,subject,score,max_score,unit,source_msg,supersedes_id)
 overriding system value values(newid,sid,code,d,subj,score_n,max_n,unit_name,src,old_score.id);
 return jsonb_build_object('ok',true,'scoreId',newid,'studentId',sid,'supersedesId',old_score.id,'scale',max_n,'unit',unit_name);
end$$;
alter table mtm_hw_private.paper_scores drop constraint paper_scores_superseded_by_fkey;
alter table mtm_hw_private.paper_scores add constraint paper_scores_superseded_by_fkey foreign key(superseded_by)
 references mtm_hw_private.paper_scores(id) deferrable initially deferred;

create function mtm_hw_private.class_upsert_action(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_uuid uuid; label_name text; grade_n int; active_n boolean; row_class mtm_hw_private.classes;n int;created_n boolean=false;edate date;
begin
 if coalesce(p->>'sourceMsg','')='' or coalesce(btrim(p->>'confirmedBy'),'')='' then return jsonb_build_object('error','need_source_and_confirmation');end if;
 label_name=btrim(normalize(coalesce(p->>'classLabel',''),NFC));
 if length(label_name) not between 1 and 100 or label_name ~ E'[\\r\\n]' or coalesce(p->>'grade','') !~ '^[0-9]{1,2}$' then return jsonb_build_object('error','invalid_class_label_or_grade');end if;
 grade_n=(p->>'grade')::int;
 if grade_n not between 6 and 12 then return jsonb_build_object('error','invalid_grade');end if;
 if p ? 'active' and jsonb_typeof(p->'active')<>'boolean' then return jsonb_build_object('error','invalid_active');end if;
 if coalesce(p->>'effectiveDate','')<>'' then
  if p->>'effectiveDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return jsonb_build_object('error','invalid_effective_date');end if;
  begin edate=(p->>'effectiveDate')::date;exception when datetime_field_overflow or invalid_datetime_format then return jsonb_build_object('error','invalid_effective_date');end;
  if edate<>(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date then return jsonb_build_object('error','only_immediate_class_change_supported');end if;
 end if;
 select owner_id into owner_uuid from mtm_hw_private.btvn_roster_scope where singleton;
 if owner_uuid is null then return jsonb_build_object('error','roster_scope_missing');end if;
 perform pg_advisory_xact_lock(hashtextextended('class:'||owner_uuid::text||':'||label_name,0));
 select count(*) into n from mtm_hw_private.classes where owner_id=owner_uuid and label=label_name;
 if n>1 then return jsonb_build_object('error','ambiguous_class_label');end if;
 select * into row_class from mtm_hw_private.classes where owner_id=owner_uuid and label=label_name for update;
 if found then
  active_n=coalesce((p->>'active')::boolean,row_class.active);
  if not active_n and exists(select 1 from mtm_hw_private.students where class_id=row_class.id and active) then return jsonb_build_object('error','class_has_active_students');end if;
  update mtm_hw_private.classes set grade=grade_n,active=active_n where id=row_class.id;
 else
  active_n=coalesce((p->>'active')::boolean,true);
  insert into mtm_hw_private.classes(owner_id,label,grade,active) values(owner_uuid,label_name,grade_n,active_n) returning * into row_class;
  created_n=true;
 end if;
 return jsonb_build_object('ok',true,'classId',row_class.id,'created',created_n,'active',active_n);
end$$;

create or replace function mtm_hw_private.sync_dispatch(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare nt int;nl int;
begin
 if p->>'action'='sync_requeue' then return mtm_hw_private.sync_requeue(p);end if;
 if p->>'action' in ('student_profile_update','student_profile_read') then return mtm_hw_private.student_profile_action(p);end if;
 if p->>'action' in ('paper_score_record','paper_score_read') then return mtm_hw_private.paper_score_action(p);end if;
 if p->>'action'='class_upsert' then return mtm_hw_private.class_upsert_action(p);end if;
 if p->>'action'='sync_tick' then
  if coalesce(p->>'sourceMsg','')='' then return jsonb_build_object('error','need_source_msg');end if;
  nt=mtm_hw_private.dd_apply_transfers();nl=mtm_hw_private.dd_apply_leaves();
  return jsonb_build_object('ok',true,'transfersApplied',nt,'leavesApplied',nl);
 end if;
 return public.mtm_dd_api14(p);
end$$;
revoke all on function mtm_hw_private.profile_state(mtm_hw_private.students),mtm_hw_private.student_profile_action(jsonb),mtm_hw_private.paper_score_action(jsonb),mtm_hw_private.class_upsert_action(jsonb)
 from public,anon,authenticated,service_role;
commit;
