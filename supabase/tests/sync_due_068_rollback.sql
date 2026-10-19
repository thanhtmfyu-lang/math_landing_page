-- CANH BAO: chi chay tron tep trong TRANSACTION ROLLBACK. Khong bo dong rollback cuoi tep.
-- Du lieu gia trong schema QA rieng, khong doc/ghi ho so hoc sinh that.
-- 068: Giảm vòng quét đồng bộ hạn, không đổi luật hạn/điểm/receipt/cap/override.
-- Chỉ chuẩn hóa ghép roster một lần, gom buổi theo học sinh/lớp và lọc phạm vi sớm.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $guard$
begin
 if encode(sha256(convert_to(pg_get_functiondef('public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure),'UTF8')),'hex')
  <> 'd55be9239a17882c5f2f4f884ddf06995be90f6a5f76be9933cdd0f1360c6efb' then raise exception '068 sync_due source changed';end if;
end$guard$;
CREATE OR REPLACE FUNCTION public.mtm_btvn_sync_due(p_payload jsonb, p_apply boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '60s'
AS $function$
declare owner uuid;v jsonb;a jsonb;ids uuid[];sid uuid;n integer;matched jsonb='[]';unmatched integer=0;
 r record;expected timestamptz;actual timestamptz;src text;old_receipts jsonb;new_receipts jsonb;changed integer=0;ne integer=0;na integer=0;summary jsonb; planned timestamptz; adjusted timestamptz; ov jsonb; cancelled_target boolean; slot_day integer; slot_count integer; rules jsonb; previous_work record; matched_by_student jsonb; sessions_by_class jsonb;
begin
 if p_apply is null or jsonb_typeof(p_payload->'sessions') is distinct from 'array' or octet_length(p_payload::text)>10485760 then raise exception 'Invalid attendance payload';end if;
 select owner_id into owner from mtm_hw_private.btvn_roster_scope where singleton;
 if owner is null then raise exception 'Roster scope required' using errcode='42501';end if;
 rules=p_payload->'classRules';
 if rules is not null and (jsonb_typeof(rules) is distinct from 'object' or jsonb_typeof(rules->'classes') is distinct from 'object') then raise exception 'Invalid class rules';end if;
 perform pg_advisory_xact_lock(hashtextextended('btvn-due:'||owner::text,0));
 for v in select value from jsonb_array_elements(p_payload->'sessions') loop
  if coalesce(v->>'startsAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$' or nullif(v->>'sourceIdentity','') is null or jsonb_typeof(v->'attendees') is distinct from 'array' or not exists(select 1 from mtm_hw_private.classes where owner_id=owner and active and label=v->>'label') then raise exception 'Invalid attendance session';end if;
  if v ? 'cancelled' and jsonb_typeof(v->'cancelled') is distinct from 'boolean' then raise exception 'Invalid cancellation';end if;
  if v ? 'replacesAt' and coalesce(v->>'replacesAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$' then raise exception 'Invalid replacement';end if;
  perform (v->>'startsAt')::timestamptz;
  if v ? 'replacesAt' then perform (v->>'replacesAt')::timestamptz;end if;
  for a in select value from jsonb_array_elements(v->'attendees') loop
   if coalesce(a->>'phone','') !~ '^0[0-9]{9}$' or coalesce(a->>'status','?') not in ('','C','M','L','K','ON','P','PH P') then raise exception 'Invalid attendee';end if;
  end loop;
 end loop;

 -- Chuẩn hóa roster đúng một lần. Giữ thứ tự ưu tiên: một ứng viên, đúng lớp, rồi tên phân xử.
 with eligible as materialized (
  select s.id,c.label,substring(lower(c.label) from '^2k[0-9]+') cohort,
   mtm_hw_private.btvn_phone(s.student_phone) student_phone,mtm_hw_private.btvn_phone(s.parent_phone) parent_phone,
   mtm_hw_private.btvn_name(s.full_name) folded_name
  from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
  where s.owner_id=owner and s.active and c.active
 ), attendees as materialized (
  select v.ord session_ord,a.ord attendee_ord,v.value-'attendees' session_row,v.value->>'label' label,
   substring(lower(v.value->>'label') from '^2k[0-9]+') cohort,a.value->>'phone' phone,a.value->>'status' status,
   mtm_hw_private.btvn_name(regexp_replace(a.value->>'name','\s*\(.*$','')) folded_name
  from jsonb_array_elements(p_payload->'sessions') with ordinality v(value,ord)
  cross join lateral jsonb_array_elements(v.value->'attendees') with ordinality a(value,ord)
 ), resolved as (
  select a.session_ord,a.attendee_ord,a.session_row,a.status,
   case when count(e.id)=1 then min(e.id::text)::uuid
    when count(e.id) filter(where e.label=a.label)=1 then (min(e.id::text) filter(where e.label=a.label))::uuid
    when count(e.id) filter(where e.folded_name=a.folded_name)=1 then (min(e.id::text) filter(where e.folded_name=a.folded_name))::uuid
   end sid
  from attendees a left join eligible e on e.cohort=a.cohort and a.phone in (e.student_phone,e.parent_phone)
  group by a.session_ord,a.attendee_ord,a.session_row,a.status,a.label,a.folded_name
 )
 select coalesce(jsonb_agg(rr.session_row||jsonb_build_object('studentId',rr.sid,'status',rr.status) order by rr.session_ord,rr.attendee_ord)
   filter(where rr.sid is not null),'[]'::jsonb),count(*) filter(where rr.sid is null)::integer
 into matched,unmatched from resolved rr;

 select coalesce(jsonb_object_agg(student_key,items),'{}'::jsonb) into matched_by_student
 from (select x->>'studentId' student_key,jsonb_agg(x) items from jsonb_array_elements(matched)x group by x->>'studentId') grouped;
 select coalesce(jsonb_object_agg(class_key,items),'{}'::jsonb) into sessions_by_class
 from (select x->>'label' class_key,jsonb_agg(x) items from jsonb_array_elements(p_payload->'sessions')x group by x->>'label') grouped;

 begin
  for r in select s.id,c.label,l.code,coalesce(l.material->'classDates'->>c.label,l.material->>'date') lesson_day
   from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
   join mtm_hw_private.btvn_lessons l on s.class_id=any(l.class_ids) and l.owner_id=s.owner_id
   where s.owner_id=owner and s.active and c.active and l.active
    and matched_by_student ? s.id::text
    and exists(select 1 from jsonb_array_elements(matched_by_student->s.id::text)x
     where x->>'label'=c.label or (c.label~' (8|9)\+$' and x->>'label'~' (8|9)\+$')) loop
   -- Ca nguồn phải nằm trong tuần bài, C/M/ON; hai ca đều có mặt là mơ hồ.
   slot_day=null;slot_count=0;
   if r.label='2K10 9+' and extract(isodow from r.lesson_day::date)<>2 then
    select count(distinct extract(isodow from (x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')),
     min(extract(isodow from (x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh'))::integer into slot_count,slot_day
    from jsonb_array_elements(coalesce(matched_by_student->r.id::text,'[]'::jsonb))x where x->>'studentId'=r.id::text and x->>'label'=r.label and x->>'status' in ('C','M','ON') and not coalesce((x->>'cancelled')::boolean,false)
     and date_trunc('week',(x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')=date_trunc('week',r.lesson_day::date::timestamp)
     and extract(isodow from (x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh') in (5,7)
     and exists(select 1 from jsonb_array_elements(coalesce(rules,'{"timezone":"Asia/Ho_Chi_Minh","notes":["Cặp T4-T5 mở sau T4; 2K10 Thứ 3, 6 hạn cùng thứ tuần sau theo hai giả định trong thiết kế đợt 24."],"classes":{"2K9 9+":{"sessions":[{"weekday":1,"start":"17:30","end":"19:30"},{"weekday":3,"start":"17:30","end":"19:30"},{"weekday":5,"start":"17:30","end":"19:30"}],"open":{"type":"paired","sourceLabel":"2K9 9+","days":{"1":1,"2":1,"3":3,"4":3,"5":5,"6":5}},"due":{"type":"pair_next"}},"2K14":{"sessions":[{"weekday":1,"start":"18:00","end":"20:00"},{"weekday":4,"start":"09:00","end":"11:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K10 XPT":{"sessions":[{"weekday":1,"start":"19:30","end":"21:30"},{"weekday":6,"start":"15:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K9 XPT":{"sessions":[{"weekday":1,"start":"19:30","end":"21:30"},{"weekday":2,"start":"19:30","end":"21:30"},{"weekday":4,"start":"19:30","end":"21:30"}],"open":{"type":"after_session"},"due":{"type":"map","days":{"1":{"weekday":1,"weeks":1},"2":{"weekday":4,"weeks":0},"4":{"weekday":2,"weeks":1}}}},"2K9 8+":{"sessions":[{"weekday":2,"start":"17:30","end":"19:30"},{"weekday":4,"start":"17:30","end":"19:30"},{"weekday":6,"start":"17:30","end":"19:30"}],"open":{"type":"paired","sourceLabel":"2K9 9+","days":{"1":1,"2":1,"3":3,"4":3,"5":5,"6":5}},"due":{"type":"pair_next"}},"2K10 9+":{"sessions":[{"weekday":2,"start":"19:30","end":"21:30"},{"weekday":5,"start":"19:30","end":"21:30"},{"weekday":7,"start":"08:00","end":"10:00"}],"open":{"type":"paired","sourceLabel":"2K10 9+","days":{"7":5}},"due":{"type":"slot_by_attendance"}},"2K13":{"sessions":[{"weekday":2,"start":"20:00","end":"22:00"},{"weekday":5,"start":"20:00","end":"22:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K11 8+":{"sessions":[{"weekday":3,"start":"19:30","end":"21:30"},{"weekday":7,"start":"15:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K11 XPT":{"sessions":[{"weekday":3,"start":"19:30","end":"21:30"},{"weekday":6,"start":"13:30","end":"15:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"HSA.2":{"sessions":[{"weekday":4,"start":"14:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"next_session"}},"2K12":{"sessions":[{"weekday":4,"start":"18:00","end":"20:00"},{"weekday":7,"start":"15:00","end":"17:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K15":{"sessions":[{"weekday":4,"start":"18:00","end":"20:00"},{"weekday":7,"start":"14:00","end":"16:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K11 9+":{"sessions":[{"weekday":4,"start":"19:30","end":"21:30"},{"weekday":7,"start":"13:30","end":"15:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K10 8+":{"sessions":[{"weekday":5,"start":"19:30","end":"21:30"},{"weekday":7,"start":"10:00","end":"12:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"TSA":{"sessions":[{"weekday":7,"start":"14:00","end":"17:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"HSA":{"sessions":[{"weekday":7,"start":"17:00","end":"20:00"}],"open":{"type":"after_session"},"due":{"type":"next_session"}},"2K9 HSA (THỨ 5)":{"sessions":[{"weekday":4,"start":"14:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"next_session"}},"2K10 Thứ 3, 6":{"sessions":[{"weekday":2,"start":"19:30","end":"21:30"},{"weekday":5,"start":"19:30","end":"21:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K9 HSA (CN)":{"sessions":[{"weekday":7,"start":"17:00","end":"20:00"}],"open":{"type":"after_session"},"due":{"type":"next_session"}}}}'::jsonb)->'classes'->r.label->'sessions')s where (s->>'weekday')::integer=extract(isodow from (x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh') and (s->>'start')::time=((x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')::time);
    if slot_count<>1 then slot_day=null;end if;
   end if;
   planned=mtm_hw_private.btvn_planned_due(r.label,r.lesson_day::date,slot_day,rules);
   expected=planned;actual=null;src=null;
   -- Chỉ thông báo nghỉ/chuyển buổi rõ ràng mới đổi hạn. L/K là vắng cá nhân.
   select x into ov from jsonb_array_elements(coalesce(sessions_by_class->r.label,'[]'::jsonb))x where x->>'label'=r.label and x ? 'replacesAt' and (x->>'replacesAt')::timestamptz=planned and not coalesce((x->>'cancelled')::boolean,false) order by x->>'startsAt' limit 1;
   if ov is not null then expected=(ov->>'startsAt')::timestamptz;
   else
    select exists(select 1 from jsonb_array_elements(coalesce(sessions_by_class->r.label,'[]'::jsonb))x where x->>'label'=r.label and (x->>'startsAt')::timestamptz=planned and coalesce((x->>'cancelled')::boolean,false)) into cancelled_target;
    if cancelled_target then
     select min((x->>'startsAt')::timestamptz) into adjusted from jsonb_array_elements(coalesce(sessions_by_class->r.label,'[]'::jsonb))x
      where x->>'label'=r.label and not coalesce((x->>'cancelled')::boolean,false) and (x->>'startsAt')::timestamptz>planned
      and extract(isodow from (x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')=extract(isodow from planned at time zone 'Asia/Ho_Chi_Minh')
      and ((x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')::time=(planned at time zone 'Asia/Ho_Chi_Minh')::time;
     expected=adjusted;
    end if;
   end if;
   select min((x->>'startsAt')::timestamptz) into actual from jsonb_array_elements(coalesce(matched_by_student->r.id::text,'[]'::jsonb))x where x->>'studentId'=r.id::text and x->>'label'=r.label and x->>'status' in ('C','M','ON') and not coalesce((x->>'cancelled')::boolean,false) and (x->>'startsAt')::timestamptz=expected;
   -- Snapshot không có em trong phạm vi này: giữ hạn đã đối soát trước đó.
   if not exists(select 1 from jsonb_array_elements(coalesce(matched_by_student->r.id::text,'[]'::jsonb))x where x->>'studentId'=r.id::text and (x->>'label'=r.label or (r.label~' (8|9)\+$' and x->>'label'~' (8|9)\+$'))) then continue;end if;
   select x->>'sourceIdentity' into src from jsonb_array_elements(coalesce(matched_by_student->r.id::text,'[]'::jsonb))x where x->>'studentId'=r.id::text and (x->>'startsAt')::timestamptz=actual and x->>'status' in ('C','M','ON') and x->>'label'=r.label and not coalesce((x->>'cancelled')::boolean,false) order by x->>'sourceIdentity' limit 1;
   insert into mtm_hw_private.btvn_work(student_id,lesson_code) values(r.id,r.code) on conflict do nothing;
   select * into previous_work from mtm_hw_private.btvn_work where student_id=r.id and lesson_code=r.code for update;
   old_receipts=previous_work.receipts;
   -- Snapshot một phần không phủ hạn đã xác minh: giữ actual/source nếu hạn kế hoạch không đổi.
   -- Điểm danh mới tại hạn (kể cả L/K), hủy/chuyển rõ ràng hoặc luật đổi hạn vẫn thay kết quả cũ.
   if actual is null and previous_work.next_actual_class_at is not null and previous_work.expected_due_at=expected
    and not exists(select 1 from jsonb_array_elements(coalesce(matched_by_student->r.id::text,'[]'::jsonb))x where x->>'studentId'=r.id::text and x->>'label'=r.label and (x->>'startsAt')::timestamptz=expected)
    and not exists(select 1 from jsonb_array_elements(coalesce(sessions_by_class->r.label,'[]'::jsonb))x where x->>'label'=r.label and (coalesce((x->>'cancelled')::boolean,false) and (x->>'startsAt')::timestamptz=expected or x ? 'replacesAt' and (x->>'replacesAt')::timestamptz=planned)) then
    actual=previous_work.next_actual_class_at;src=previous_work.due_source_identity;
   end if;
   select coalesce(jsonb_agg(x||jsonb_build_object('late',case when actual is null then null else (x->>'submittedAt')::numeric>=extract(epoch from actual)*1000 end) order by ord),'[]') into new_receipts from jsonb_array_elements(old_receipts) with ordinality z(x,ord);
   select changed+count(*)::integer into changed from jsonb_array_elements(old_receipts) with ordinality z(x,ord) where x->'late' is distinct from new_receipts->(ord::integer-1)->'late';
   update mtm_hw_private.btvn_work set expected_due_at=expected,next_actual_class_at=actual,due_source_identity=src,receipts=new_receipts,revision=revision+1
    where student_id=r.id and lesson_code=r.code and (expected_due_at,next_actual_class_at,due_source_identity,receipts) is distinct from (expected,actual,src,new_receipts);
   if expected is not null then ne=ne+1;end if;if actual is not null then na=na+1;end if;
  end loop;
  summary=jsonb_build_object('sessions',jsonb_array_length(p_payload->'sessions'),'matchedStudents',(select count(distinct x->>'studentId') from jsonb_array_elements(matched)x),'unmatched',unmatched,'expectedDues',ne,'actualDues',na,'receiptsChanged',changed,'applied',p_apply);
  if not p_apply then raise exception 'Dry rollback' using errcode='PZ001';end if;
 exception when sqlstate 'PZ001' then if p_apply then raise;end if;end;
 return summary;
end$function$;

-- Schema QA chỉ tồn tại trong transaction. Helper btvn_phone/name/planned_due vẫn là helper live.
-- Hai hàm so sánh đều chỉ truy cập bảng QA, khóa advisory có prefix QA riêng.
create schema mtm_sync_due_qa068;
create table mtm_sync_due_qa068.btvn_roster_scope(singleton boolean primary key,owner_id uuid);
create table mtm_sync_due_qa068.classes(id uuid primary key,owner_id uuid,label text,active boolean default true);
create table mtm_sync_due_qa068.students(id uuid primary key,owner_id uuid,class_id uuid,full_name text,student_phone text,parent_phone text,active boolean default true);
create table mtm_sync_due_qa068.btvn_lessons(code text primary key,owner_id uuid,class_ids uuid[],material jsonb,active boolean default true);
create table mtm_sync_due_qa068.btvn_work(student_id uuid,lesson_code text,revision integer default 0,drafts jsonb default '[]',receipts jsonb default '[]',next_actual_class_at timestamptz,due_source_identity text,expected_due_at timestamptz,primary key(student_id,lesson_code));
insert into mtm_sync_due_qa068.btvn_roster_scope values(true,'11111111-1111-4111-8111-111111111111');
insert into mtm_sync_due_qa068.classes(id,owner_id,label) values
 ('00000000-0000-4000-8000-000000000101','11111111-1111-4111-8111-111111111111','2K9 9+'),
 ('00000000-0000-4000-8000-000000000102','11111111-1111-4111-8111-111111111111','2K9 8+'),
 ('00000000-0000-4000-8000-000000000103','11111111-1111-4111-8111-111111111111','2K10 9+');
insert into mtm_sync_due_qa068.students(id,owner_id,class_id,full_name,student_phone,parent_phone) values
 ('00000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000101','QA A','0900000001','0910000001'),
 ('00000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000102','QA A','0900000001',''),
 ('00000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000103','QA C','0900000003',''),
 ('00000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000101','QA DUPLICATE','0900000001','');
insert into mtm_sync_due_qa068.btvn_lessons(code,owner_id,class_ids,material)
select 'qa-'||c.label||'-'||d, c.owner_id,array[c.id],jsonb_build_object('date',d::text)
from mtm_sync_due_qa068.classes c cross join (values(date '2026-10-12'),(date '2026-10-14'),(date '2026-10-16')) days(d);
insert into mtm_sync_due_qa068.btvn_work(student_id,lesson_code,revision,drafts,receipts,next_actual_class_at,due_source_identity,expected_due_at)
select s.id,l.code,9,'[{}, {}, {}, {}, {}]'::jsonb,
 '[{"id":"qa-1","score":7.5,"submittedAt":1791973800000,"late":false,"privateExtra":{"qa":true}},{"id":"qa-2","score":9,"submittedAt":1792063800000,"late":true}]'::jsonb,
 '2026-10-14T17:30:00+07:00'::timestamptz,'qa-existing','2026-10-14T17:30:00+07:00'::timestamptz
from mtm_sync_due_qa068.students s join mtm_sync_due_qa068.btvn_lessons l on s.class_id=any(l.class_ids);
create table mtm_sync_due_qa068.seed_work as select * from mtm_sync_due_qa068.btvn_work;
CREATE OR REPLACE FUNCTION mtm_sync_due_qa068.before_due(p_payload jsonb, p_apply boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '60s'
AS $function$
declare owner uuid;v jsonb;a jsonb;ids uuid[];sid uuid;n integer;matched jsonb='[]';unmatched integer=0;
 r record;expected timestamptz;actual timestamptz;src text;old_receipts jsonb;new_receipts jsonb;changed integer=0;ne integer=0;na integer=0;summary jsonb; planned timestamptz; adjusted timestamptz; ov jsonb; cancelled_target boolean; slot_day integer; slot_count integer; rules jsonb; previous_work record;
begin
 if p_apply is null or jsonb_typeof(p_payload->'sessions') is distinct from 'array' or octet_length(p_payload::text)>10485760 then raise exception 'Invalid attendance payload';end if;
 select owner_id into owner from mtm_sync_due_qa068.btvn_roster_scope where singleton;
 if owner is null then raise exception 'Roster scope required' using errcode='42501';end if;
 rules=p_payload->'classRules';
 if rules is not null and (jsonb_typeof(rules) is distinct from 'object' or jsonb_typeof(rules->'classes') is distinct from 'object') then raise exception 'Invalid class rules';end if;
 perform pg_advisory_xact_lock(hashtextextended('qa-068-due:'||owner::text,0));
 for v in select value from jsonb_array_elements(p_payload->'sessions') loop
  if coalesce(v->>'startsAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$' or nullif(v->>'sourceIdentity','') is null or jsonb_typeof(v->'attendees') is distinct from 'array' or not exists(select 1 from mtm_sync_due_qa068.classes where owner_id=owner and active and label=v->>'label') then raise exception 'Invalid attendance session';end if;
  if v ? 'cancelled' and jsonb_typeof(v->'cancelled') is distinct from 'boolean' then raise exception 'Invalid cancellation';end if;
  if v ? 'replacesAt' and coalesce(v->>'replacesAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$' then raise exception 'Invalid replacement';end if;
  perform (v->>'startsAt')::timestamptz;
  if v ? 'replacesAt' then perform (v->>'replacesAt')::timestamptz;end if;
  for a in select value from jsonb_array_elements(v->'attendees') loop
   if coalesce(a->>'phone','') !~ '^0[0-9]{9}$' or coalesce(a->>'status','?') not in ('','C','M','L','K','ON','P','PH P') then raise exception 'Invalid attendee';end if;
   select array_agg(s.id) into ids from mtm_sync_due_qa068.students s join mtm_sync_due_qa068.classes c on c.id=s.class_id
   where s.owner_id=owner and s.active and c.active and substring(lower(c.label) from '^2k[0-9]+')=substring(lower(v->>'label') from '^2k[0-9]+')
   and a->>'phone' in (mtm_hw_private.btvn_phone(s.student_phone),mtm_hw_private.btvn_phone(s.parent_phone));
   n=coalesce(cardinality(ids),0);sid=null;
   if n=1 then sid=ids[1];elsif n>1 then
    -- 15/10 (Claude): một em có 2 hồ sơ cùng khoá (vd. 9+ và HSA) trùng tên, ưu tiên hồ sơ đúng lớp của khối điểm danh trước.
    select count(*),(array_agg(s.id))[1] into n,sid from mtm_sync_due_qa068.students s join mtm_sync_due_qa068.classes c on c.id=s.class_id where s.id=any(ids) and c.label=v->>'label';
    if n<>1 then
     select count(*),(array_agg(id))[1] into n,sid from mtm_sync_due_qa068.students where id=any(ids) and mtm_hw_private.btvn_name(full_name)=mtm_hw_private.btvn_name(regexp_replace(a->>'name','\s*\(.*$',''));
     if n<>1 then sid=null;end if;
    end if;
   end if;
   if sid is null then unmatched=unmatched+1;else matched=matched||jsonb_build_array(v-'attendees'||jsonb_build_object('studentId',sid,'status',a->>'status'));end if;
  end loop;
 end loop;
 begin
  for r in select s.id,c.label,l.code,coalesce(l.material->'classDates'->>c.label,l.material->>'date') lesson_day
   from mtm_sync_due_qa068.students s join mtm_sync_due_qa068.classes c on c.id=s.class_id
   join mtm_sync_due_qa068.btvn_lessons l on s.class_id=any(l.class_ids) and l.owner_id=s.owner_id
   where s.owner_id=owner and s.active and c.active and l.active loop
   -- Ca nguồn phải nằm trong tuần bài, C/M/ON; hai ca đều có mặt là mơ hồ.
   slot_day=null;slot_count=0;
   if r.label='2K10 9+' and extract(isodow from r.lesson_day::date)<>2 then
    select count(distinct extract(isodow from (x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')),
     min(extract(isodow from (x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh'))::integer into slot_count,slot_day
    from jsonb_array_elements(matched)x where x->>'studentId'=r.id::text and x->>'label'=r.label and x->>'status' in ('C','M','ON') and not coalesce((x->>'cancelled')::boolean,false)
     and date_trunc('week',(x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')=date_trunc('week',r.lesson_day::date::timestamp)
     and extract(isodow from (x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh') in (5,7)
     and exists(select 1 from jsonb_array_elements(coalesce(rules,'{"timezone":"Asia/Ho_Chi_Minh","notes":["Cặp T4-T5 mở sau T4; 2K10 Thứ 3, 6 hạn cùng thứ tuần sau theo hai giả định trong thiết kế đợt 24."],"classes":{"2K9 9+":{"sessions":[{"weekday":1,"start":"17:30","end":"19:30"},{"weekday":3,"start":"17:30","end":"19:30"},{"weekday":5,"start":"17:30","end":"19:30"}],"open":{"type":"paired","sourceLabel":"2K9 9+","days":{"1":1,"2":1,"3":3,"4":3,"5":5,"6":5}},"due":{"type":"pair_next"}},"2K14":{"sessions":[{"weekday":1,"start":"18:00","end":"20:00"},{"weekday":4,"start":"09:00","end":"11:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K10 XPT":{"sessions":[{"weekday":1,"start":"19:30","end":"21:30"},{"weekday":6,"start":"15:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K9 XPT":{"sessions":[{"weekday":1,"start":"19:30","end":"21:30"},{"weekday":2,"start":"19:30","end":"21:30"},{"weekday":4,"start":"19:30","end":"21:30"}],"open":{"type":"after_session"},"due":{"type":"map","days":{"1":{"weekday":1,"weeks":1},"2":{"weekday":4,"weeks":0},"4":{"weekday":2,"weeks":1}}}},"2K9 8+":{"sessions":[{"weekday":2,"start":"17:30","end":"19:30"},{"weekday":4,"start":"17:30","end":"19:30"},{"weekday":6,"start":"17:30","end":"19:30"}],"open":{"type":"paired","sourceLabel":"2K9 9+","days":{"1":1,"2":1,"3":3,"4":3,"5":5,"6":5}},"due":{"type":"pair_next"}},"2K10 9+":{"sessions":[{"weekday":2,"start":"19:30","end":"21:30"},{"weekday":5,"start":"19:30","end":"21:30"},{"weekday":7,"start":"08:00","end":"10:00"}],"open":{"type":"paired","sourceLabel":"2K10 9+","days":{"7":5}},"due":{"type":"slot_by_attendance"}},"2K13":{"sessions":[{"weekday":2,"start":"20:00","end":"22:00"},{"weekday":5,"start":"20:00","end":"22:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K11 8+":{"sessions":[{"weekday":3,"start":"19:30","end":"21:30"},{"weekday":7,"start":"15:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K11 XPT":{"sessions":[{"weekday":3,"start":"19:30","end":"21:30"},{"weekday":6,"start":"13:30","end":"15:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"HSA.2":{"sessions":[{"weekday":4,"start":"14:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"next_session"}},"2K12":{"sessions":[{"weekday":4,"start":"18:00","end":"20:00"},{"weekday":7,"start":"15:00","end":"17:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K15":{"sessions":[{"weekday":4,"start":"18:00","end":"20:00"},{"weekday":7,"start":"14:00","end":"16:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K11 9+":{"sessions":[{"weekday":4,"start":"19:30","end":"21:30"},{"weekday":7,"start":"13:30","end":"15:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K10 8+":{"sessions":[{"weekday":5,"start":"19:30","end":"21:30"},{"weekday":7,"start":"10:00","end":"12:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"TSA":{"sessions":[{"weekday":7,"start":"14:00","end":"17:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"HSA":{"sessions":[{"weekday":7,"start":"17:00","end":"20:00"}],"open":{"type":"after_session"},"due":{"type":"next_session"}},"2K9 HSA (THỨ 5)":{"sessions":[{"weekday":4,"start":"14:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"next_session"}},"2K10 Thứ 3, 6":{"sessions":[{"weekday":2,"start":"19:30","end":"21:30"},{"weekday":5,"start":"19:30","end":"21:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K9 HSA (CN)":{"sessions":[{"weekday":7,"start":"17:00","end":"20:00"}],"open":{"type":"after_session"},"due":{"type":"next_session"}}}}'::jsonb)->'classes'->r.label->'sessions')s where (s->>'weekday')::integer=extract(isodow from (x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh') and (s->>'start')::time=((x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')::time);
    if slot_count<>1 then slot_day=null;end if;
   end if;
   planned=mtm_hw_private.btvn_planned_due(r.label,r.lesson_day::date,slot_day,rules);
   expected=planned;actual=null;src=null;
   -- Chỉ thông báo nghỉ/chuyển buổi rõ ràng mới đổi hạn. L/K là vắng cá nhân.
   select x into ov from jsonb_array_elements(p_payload->'sessions')x where x->>'label'=r.label and x ? 'replacesAt' and (x->>'replacesAt')::timestamptz=planned and not coalesce((x->>'cancelled')::boolean,false) order by x->>'startsAt' limit 1;
   if ov is not null then expected=(ov->>'startsAt')::timestamptz;
   else
    select exists(select 1 from jsonb_array_elements(p_payload->'sessions')x where x->>'label'=r.label and (x->>'startsAt')::timestamptz=planned and coalesce((x->>'cancelled')::boolean,false)) into cancelled_target;
    if cancelled_target then
     select min((x->>'startsAt')::timestamptz) into adjusted from jsonb_array_elements(p_payload->'sessions')x
      where x->>'label'=r.label and not coalesce((x->>'cancelled')::boolean,false) and (x->>'startsAt')::timestamptz>planned
      and extract(isodow from (x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')=extract(isodow from planned at time zone 'Asia/Ho_Chi_Minh')
      and ((x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')::time=(planned at time zone 'Asia/Ho_Chi_Minh')::time;
     expected=adjusted;
    end if;
   end if;
   select min((x->>'startsAt')::timestamptz) into actual from jsonb_array_elements(matched)x where x->>'studentId'=r.id::text and x->>'label'=r.label and x->>'status' in ('C','M','ON') and not coalesce((x->>'cancelled')::boolean,false) and (x->>'startsAt')::timestamptz=expected;
   -- Snapshot không có em trong phạm vi này: giữ hạn đã đối soát trước đó.
   if not exists(select 1 from jsonb_array_elements(matched)x where x->>'studentId'=r.id::text and (x->>'label'=r.label or (r.label~' (8|9)\+$' and x->>'label'~' (8|9)\+$'))) then continue;end if;
   select x->>'sourceIdentity' into src from jsonb_array_elements(matched)x where x->>'studentId'=r.id::text and (x->>'startsAt')::timestamptz=actual and x->>'status' in ('C','M','ON') and x->>'label'=r.label and not coalesce((x->>'cancelled')::boolean,false) order by x->>'sourceIdentity' limit 1;
   insert into mtm_sync_due_qa068.btvn_work(student_id,lesson_code) values(r.id,r.code) on conflict do nothing;
   select * into previous_work from mtm_sync_due_qa068.btvn_work where student_id=r.id and lesson_code=r.code for update;
   old_receipts=previous_work.receipts;
   -- Snapshot một phần không phủ hạn đã xác minh: giữ actual/source nếu hạn kế hoạch không đổi.
   -- Điểm danh mới tại hạn (kể cả L/K), hủy/chuyển rõ ràng hoặc luật đổi hạn vẫn thay kết quả cũ.
   if actual is null and previous_work.next_actual_class_at is not null and previous_work.expected_due_at=expected
    and not exists(select 1 from jsonb_array_elements(matched)x where x->>'studentId'=r.id::text and x->>'label'=r.label and (x->>'startsAt')::timestamptz=expected)
    and not exists(select 1 from jsonb_array_elements(p_payload->'sessions')x where x->>'label'=r.label and (coalesce((x->>'cancelled')::boolean,false) and (x->>'startsAt')::timestamptz=expected or x ? 'replacesAt' and (x->>'replacesAt')::timestamptz=planned)) then
    actual=previous_work.next_actual_class_at;src=previous_work.due_source_identity;
   end if;
   select coalesce(jsonb_agg(x||jsonb_build_object('late',case when actual is null then null else (x->>'submittedAt')::numeric>=extract(epoch from actual)*1000 end) order by ord),'[]') into new_receipts from jsonb_array_elements(old_receipts) with ordinality z(x,ord);
   select changed+count(*)::integer into changed from jsonb_array_elements(old_receipts) with ordinality z(x,ord) where x->'late' is distinct from new_receipts->(ord::integer-1)->'late';
   update mtm_sync_due_qa068.btvn_work set expected_due_at=expected,next_actual_class_at=actual,due_source_identity=src,receipts=new_receipts,revision=revision+1
    where student_id=r.id and lesson_code=r.code and (expected_due_at,next_actual_class_at,due_source_identity,receipts) is distinct from (expected,actual,src,new_receipts);
   if expected is not null then ne=ne+1;end if;if actual is not null then na=na+1;end if;
  end loop;
  summary=jsonb_build_object('sessions',jsonb_array_length(p_payload->'sessions'),'matchedStudents',(select count(distinct x->>'studentId') from jsonb_array_elements(matched)x),'unmatched',unmatched,'expectedDues',ne,'actualDues',na,'receiptsChanged',changed,'applied',p_apply);
  if not p_apply then raise exception 'Dry rollback' using errcode='PZ001';end if;
 exception when sqlstate 'PZ001' then if p_apply then raise;end if;end;
 return summary;
end$function$;
CREATE OR REPLACE FUNCTION mtm_sync_due_qa068.after_due(p_payload jsonb, p_apply boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '60s'
AS $function$
declare owner uuid;v jsonb;a jsonb;ids uuid[];sid uuid;n integer;matched jsonb='[]';unmatched integer=0;
 r record;expected timestamptz;actual timestamptz;src text;old_receipts jsonb;new_receipts jsonb;changed integer=0;ne integer=0;na integer=0;summary jsonb; planned timestamptz; adjusted timestamptz; ov jsonb; cancelled_target boolean; slot_day integer; slot_count integer; rules jsonb; previous_work record; matched_by_student jsonb; sessions_by_class jsonb;
begin
 if p_apply is null or jsonb_typeof(p_payload->'sessions') is distinct from 'array' or octet_length(p_payload::text)>10485760 then raise exception 'Invalid attendance payload';end if;
 select owner_id into owner from mtm_sync_due_qa068.btvn_roster_scope where singleton;
 if owner is null then raise exception 'Roster scope required' using errcode='42501';end if;
 rules=p_payload->'classRules';
 if rules is not null and (jsonb_typeof(rules) is distinct from 'object' or jsonb_typeof(rules->'classes') is distinct from 'object') then raise exception 'Invalid class rules';end if;
 perform pg_advisory_xact_lock(hashtextextended('qa-068-due:'||owner::text,0));
 for v in select value from jsonb_array_elements(p_payload->'sessions') loop
  if coalesce(v->>'startsAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$' or nullif(v->>'sourceIdentity','') is null or jsonb_typeof(v->'attendees') is distinct from 'array' or not exists(select 1 from mtm_sync_due_qa068.classes where owner_id=owner and active and label=v->>'label') then raise exception 'Invalid attendance session';end if;
  if v ? 'cancelled' and jsonb_typeof(v->'cancelled') is distinct from 'boolean' then raise exception 'Invalid cancellation';end if;
  if v ? 'replacesAt' and coalesce(v->>'replacesAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$' then raise exception 'Invalid replacement';end if;
  perform (v->>'startsAt')::timestamptz;
  if v ? 'replacesAt' then perform (v->>'replacesAt')::timestamptz;end if;
  for a in select value from jsonb_array_elements(v->'attendees') loop
   if coalesce(a->>'phone','') !~ '^0[0-9]{9}$' or coalesce(a->>'status','?') not in ('','C','M','L','K','ON','P','PH P') then raise exception 'Invalid attendee';end if;
  end loop;
 end loop;

 -- Chuẩn hóa roster đúng một lần. Giữ thứ tự ưu tiên: một ứng viên, đúng lớp, rồi tên phân xử.
 with eligible as materialized (
  select s.id,c.label,substring(lower(c.label) from '^2k[0-9]+') cohort,
   mtm_hw_private.btvn_phone(s.student_phone) student_phone,mtm_hw_private.btvn_phone(s.parent_phone) parent_phone,
   mtm_hw_private.btvn_name(s.full_name) folded_name
  from mtm_sync_due_qa068.students s join mtm_sync_due_qa068.classes c on c.id=s.class_id
  where s.owner_id=owner and s.active and c.active
 ), attendees as materialized (
  select v.ord session_ord,a.ord attendee_ord,v.value-'attendees' session_row,v.value->>'label' label,
   substring(lower(v.value->>'label') from '^2k[0-9]+') cohort,a.value->>'phone' phone,a.value->>'status' status,
   mtm_hw_private.btvn_name(regexp_replace(a.value->>'name','\s*\(.*$','')) folded_name
  from jsonb_array_elements(p_payload->'sessions') with ordinality v(value,ord)
  cross join lateral jsonb_array_elements(v.value->'attendees') with ordinality a(value,ord)
 ), resolved as (
  select a.session_ord,a.attendee_ord,a.session_row,a.status,
   case when count(e.id)=1 then min(e.id::text)::uuid
    when count(e.id) filter(where e.label=a.label)=1 then (min(e.id::text) filter(where e.label=a.label))::uuid
    when count(e.id) filter(where e.folded_name=a.folded_name)=1 then (min(e.id::text) filter(where e.folded_name=a.folded_name))::uuid
   end sid
  from attendees a left join eligible e on e.cohort=a.cohort and a.phone in (e.student_phone,e.parent_phone)
  group by a.session_ord,a.attendee_ord,a.session_row,a.status,a.label,a.folded_name
 )
 select coalesce(jsonb_agg(rr.session_row||jsonb_build_object('studentId',rr.sid,'status',rr.status) order by rr.session_ord,rr.attendee_ord)
   filter(where rr.sid is not null),'[]'::jsonb),count(*) filter(where rr.sid is null)::integer
 into matched,unmatched from resolved rr;

 select coalesce(jsonb_object_agg(student_key,items),'{}'::jsonb) into matched_by_student
 from (select x->>'studentId' student_key,jsonb_agg(x) items from jsonb_array_elements(matched)x group by x->>'studentId') grouped;
 select coalesce(jsonb_object_agg(class_key,items),'{}'::jsonb) into sessions_by_class
 from (select x->>'label' class_key,jsonb_agg(x) items from jsonb_array_elements(p_payload->'sessions')x group by x->>'label') grouped;

 begin
  for r in select s.id,c.label,l.code,coalesce(l.material->'classDates'->>c.label,l.material->>'date') lesson_day
   from mtm_sync_due_qa068.students s join mtm_sync_due_qa068.classes c on c.id=s.class_id
   join mtm_sync_due_qa068.btvn_lessons l on s.class_id=any(l.class_ids) and l.owner_id=s.owner_id
   where s.owner_id=owner and s.active and c.active and l.active
    and matched_by_student ? s.id::text
    and exists(select 1 from jsonb_array_elements(matched_by_student->s.id::text)x
     where x->>'label'=c.label or (c.label~' (8|9)\+$' and x->>'label'~' (8|9)\+$')) loop
   -- Ca nguồn phải nằm trong tuần bài, C/M/ON; hai ca đều có mặt là mơ hồ.
   slot_day=null;slot_count=0;
   if r.label='2K10 9+' and extract(isodow from r.lesson_day::date)<>2 then
    select count(distinct extract(isodow from (x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')),
     min(extract(isodow from (x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh'))::integer into slot_count,slot_day
    from jsonb_array_elements(coalesce(matched_by_student->r.id::text,'[]'::jsonb))x where x->>'studentId'=r.id::text and x->>'label'=r.label and x->>'status' in ('C','M','ON') and not coalesce((x->>'cancelled')::boolean,false)
     and date_trunc('week',(x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')=date_trunc('week',r.lesson_day::date::timestamp)
     and extract(isodow from (x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh') in (5,7)
     and exists(select 1 from jsonb_array_elements(coalesce(rules,'{"timezone":"Asia/Ho_Chi_Minh","notes":["Cặp T4-T5 mở sau T4; 2K10 Thứ 3, 6 hạn cùng thứ tuần sau theo hai giả định trong thiết kế đợt 24."],"classes":{"2K9 9+":{"sessions":[{"weekday":1,"start":"17:30","end":"19:30"},{"weekday":3,"start":"17:30","end":"19:30"},{"weekday":5,"start":"17:30","end":"19:30"}],"open":{"type":"paired","sourceLabel":"2K9 9+","days":{"1":1,"2":1,"3":3,"4":3,"5":5,"6":5}},"due":{"type":"pair_next"}},"2K14":{"sessions":[{"weekday":1,"start":"18:00","end":"20:00"},{"weekday":4,"start":"09:00","end":"11:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K10 XPT":{"sessions":[{"weekday":1,"start":"19:30","end":"21:30"},{"weekday":6,"start":"15:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K9 XPT":{"sessions":[{"weekday":1,"start":"19:30","end":"21:30"},{"weekday":2,"start":"19:30","end":"21:30"},{"weekday":4,"start":"19:30","end":"21:30"}],"open":{"type":"after_session"},"due":{"type":"map","days":{"1":{"weekday":1,"weeks":1},"2":{"weekday":4,"weeks":0},"4":{"weekday":2,"weeks":1}}}},"2K9 8+":{"sessions":[{"weekday":2,"start":"17:30","end":"19:30"},{"weekday":4,"start":"17:30","end":"19:30"},{"weekday":6,"start":"17:30","end":"19:30"}],"open":{"type":"paired","sourceLabel":"2K9 9+","days":{"1":1,"2":1,"3":3,"4":3,"5":5,"6":5}},"due":{"type":"pair_next"}},"2K10 9+":{"sessions":[{"weekday":2,"start":"19:30","end":"21:30"},{"weekday":5,"start":"19:30","end":"21:30"},{"weekday":7,"start":"08:00","end":"10:00"}],"open":{"type":"paired","sourceLabel":"2K10 9+","days":{"7":5}},"due":{"type":"slot_by_attendance"}},"2K13":{"sessions":[{"weekday":2,"start":"20:00","end":"22:00"},{"weekday":5,"start":"20:00","end":"22:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K11 8+":{"sessions":[{"weekday":3,"start":"19:30","end":"21:30"},{"weekday":7,"start":"15:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K11 XPT":{"sessions":[{"weekday":3,"start":"19:30","end":"21:30"},{"weekday":6,"start":"13:30","end":"15:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"HSA.2":{"sessions":[{"weekday":4,"start":"14:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"next_session"}},"2K12":{"sessions":[{"weekday":4,"start":"18:00","end":"20:00"},{"weekday":7,"start":"15:00","end":"17:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K15":{"sessions":[{"weekday":4,"start":"18:00","end":"20:00"},{"weekday":7,"start":"14:00","end":"16:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K11 9+":{"sessions":[{"weekday":4,"start":"19:30","end":"21:30"},{"weekday":7,"start":"13:30","end":"15:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K10 8+":{"sessions":[{"weekday":5,"start":"19:30","end":"21:30"},{"weekday":7,"start":"10:00","end":"12:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"TSA":{"sessions":[{"weekday":7,"start":"14:00","end":"17:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"HSA":{"sessions":[{"weekday":7,"start":"17:00","end":"20:00"}],"open":{"type":"after_session"},"due":{"type":"next_session"}},"2K9 HSA (THỨ 5)":{"sessions":[{"weekday":4,"start":"14:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"next_session"}},"2K10 Thứ 3, 6":{"sessions":[{"weekday":2,"start":"19:30","end":"21:30"},{"weekday":5,"start":"19:30","end":"21:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K9 HSA (CN)":{"sessions":[{"weekday":7,"start":"17:00","end":"20:00"}],"open":{"type":"after_session"},"due":{"type":"next_session"}}}}'::jsonb)->'classes'->r.label->'sessions')s where (s->>'weekday')::integer=extract(isodow from (x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh') and (s->>'start')::time=((x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')::time);
    if slot_count<>1 then slot_day=null;end if;
   end if;
   planned=mtm_hw_private.btvn_planned_due(r.label,r.lesson_day::date,slot_day,rules);
   expected=planned;actual=null;src=null;
   -- Chỉ thông báo nghỉ/chuyển buổi rõ ràng mới đổi hạn. L/K là vắng cá nhân.
   select x into ov from jsonb_array_elements(coalesce(sessions_by_class->r.label,'[]'::jsonb))x where x->>'label'=r.label and x ? 'replacesAt' and (x->>'replacesAt')::timestamptz=planned and not coalesce((x->>'cancelled')::boolean,false) order by x->>'startsAt' limit 1;
   if ov is not null then expected=(ov->>'startsAt')::timestamptz;
   else
    select exists(select 1 from jsonb_array_elements(coalesce(sessions_by_class->r.label,'[]'::jsonb))x where x->>'label'=r.label and (x->>'startsAt')::timestamptz=planned and coalesce((x->>'cancelled')::boolean,false)) into cancelled_target;
    if cancelled_target then
     select min((x->>'startsAt')::timestamptz) into adjusted from jsonb_array_elements(coalesce(sessions_by_class->r.label,'[]'::jsonb))x
      where x->>'label'=r.label and not coalesce((x->>'cancelled')::boolean,false) and (x->>'startsAt')::timestamptz>planned
      and extract(isodow from (x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')=extract(isodow from planned at time zone 'Asia/Ho_Chi_Minh')
      and ((x->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')::time=(planned at time zone 'Asia/Ho_Chi_Minh')::time;
     expected=adjusted;
    end if;
   end if;
   select min((x->>'startsAt')::timestamptz) into actual from jsonb_array_elements(coalesce(matched_by_student->r.id::text,'[]'::jsonb))x where x->>'studentId'=r.id::text and x->>'label'=r.label and x->>'status' in ('C','M','ON') and not coalesce((x->>'cancelled')::boolean,false) and (x->>'startsAt')::timestamptz=expected;
   -- Snapshot không có em trong phạm vi này: giữ hạn đã đối soát trước đó.
   if not exists(select 1 from jsonb_array_elements(coalesce(matched_by_student->r.id::text,'[]'::jsonb))x where x->>'studentId'=r.id::text and (x->>'label'=r.label or (r.label~' (8|9)\+$' and x->>'label'~' (8|9)\+$'))) then continue;end if;
   select x->>'sourceIdentity' into src from jsonb_array_elements(coalesce(matched_by_student->r.id::text,'[]'::jsonb))x where x->>'studentId'=r.id::text and (x->>'startsAt')::timestamptz=actual and x->>'status' in ('C','M','ON') and x->>'label'=r.label and not coalesce((x->>'cancelled')::boolean,false) order by x->>'sourceIdentity' limit 1;
   insert into mtm_sync_due_qa068.btvn_work(student_id,lesson_code) values(r.id,r.code) on conflict do nothing;
   select * into previous_work from mtm_sync_due_qa068.btvn_work where student_id=r.id and lesson_code=r.code for update;
   old_receipts=previous_work.receipts;
   -- Snapshot một phần không phủ hạn đã xác minh: giữ actual/source nếu hạn kế hoạch không đổi.
   -- Điểm danh mới tại hạn (kể cả L/K), hủy/chuyển rõ ràng hoặc luật đổi hạn vẫn thay kết quả cũ.
   if actual is null and previous_work.next_actual_class_at is not null and previous_work.expected_due_at=expected
    and not exists(select 1 from jsonb_array_elements(coalesce(matched_by_student->r.id::text,'[]'::jsonb))x where x->>'studentId'=r.id::text and x->>'label'=r.label and (x->>'startsAt')::timestamptz=expected)
    and not exists(select 1 from jsonb_array_elements(coalesce(sessions_by_class->r.label,'[]'::jsonb))x where x->>'label'=r.label and (coalesce((x->>'cancelled')::boolean,false) and (x->>'startsAt')::timestamptz=expected or x ? 'replacesAt' and (x->>'replacesAt')::timestamptz=planned)) then
    actual=previous_work.next_actual_class_at;src=previous_work.due_source_identity;
   end if;
   select coalesce(jsonb_agg(x||jsonb_build_object('late',case when actual is null then null else (x->>'submittedAt')::numeric>=extract(epoch from actual)*1000 end) order by ord),'[]') into new_receipts from jsonb_array_elements(old_receipts) with ordinality z(x,ord);
   select changed+count(*)::integer into changed from jsonb_array_elements(old_receipts) with ordinality z(x,ord) where x->'late' is distinct from new_receipts->(ord::integer-1)->'late';
   update mtm_sync_due_qa068.btvn_work set expected_due_at=expected,next_actual_class_at=actual,due_source_identity=src,receipts=new_receipts,revision=revision+1
    where student_id=r.id and lesson_code=r.code and (expected_due_at,next_actual_class_at,due_source_identity,receipts) is distinct from (expected,actual,src,new_receipts);
   if expected is not null then ne=ne+1;end if;if actual is not null then na=na+1;end if;
  end loop;
  summary=jsonb_build_object('sessions',jsonb_array_length(p_payload->'sessions'),'matchedStudents',(select count(distinct x->>'studentId') from jsonb_array_elements(matched)x),'unmatched',unmatched,'expectedDues',ne,'actualDues',na,'receiptsChanged',changed,'applied',p_apply);
  if not p_apply then raise exception 'Dry rollback' using errcode='PZ001';end if;
 exception when sqlstate 'PZ001' then if p_apply then raise;end if;end;
 return summary;
end$function$;
create table mtm_sync_due_qa068.cases(case_name text,payload jsonb,apply_n boolean);
insert into mtm_sync_due_qa068.cases values
('empty','{"sessions":[]}'::jsonb,true),
('class_priority','{"sessions":[{"label":"2K9 8+","startsAt":"2026-10-15T17:30:00+07:00","sourceIdentity":"qa:2K9 8+:2026-10-15T17:30:00+07:00","attendees":[{"name":"QA A","phone":"0900000001","status":"C"}]}]}'::jsonb,true),
('name_tiebreak','{"sessions":[{"label":"2K9 9+","startsAt":"2026-10-14T17:30:00+07:00","sourceIdentity":"qa:2K9 9+:2026-10-14T17:30:00+07:00","attendees":[{"name":"QA A","phone":"0900000001","status":"C"}]}]}'::jsonb,true),
('ambiguous','{"sessions":[{"label":"2K9 9+","startsAt":"2026-10-14T17:30:00+07:00","sourceIdentity":"qa:2K9 9+:2026-10-14T17:30:00+07:00","attendees":[{"name":"QA UNKNOWN","phone":"0900000001","status":"C"}]}]}'::jsonb,true),
('parent_phone','{"sessions":[{"label":"2K9 9+","startsAt":"2026-10-14T17:30:00+07:00","sourceIdentity":"qa:2K9 9+:2026-10-14T17:30:00+07:00","attendees":[{"name":"QA A","phone":"0910000001","status":"ON"}]}]}'::jsonb,true),
('cancelled_makeup','{"sessions":[{"label":"2K9 9+","startsAt":"2026-10-14T17:30:00+07:00","sourceIdentity":"qa:2K9 9+:2026-10-14T17:30:00+07:00","attendees":[],"cancelled":true},{"label":"2K9 9+","startsAt":"2026-10-21T17:30:00+07:00","sourceIdentity":"qa:2K9 9+:2026-10-21T17:30:00+07:00","attendees":[{"name":"QA A","phone":"0900000001","status":"C"}]}]}'::jsonb,true),
('replaces','{"sessions":[{"label":"2K9 9+","startsAt":"2026-10-13T18:00:00+07:00","sourceIdentity":"qa:2K9 9+:2026-10-13T18:00:00+07:00","attendees":[{"name":"QA A","phone":"0900000001","status":"C"}],"replacesAt":"2026-10-14T17:30:00+07:00"}]}'::jsonb,true),
('slot_friday','{"sessions":[{"label":"2K10 9+","startsAt":"2026-10-16T19:30:00+07:00","sourceIdentity":"qa:2K10 9+:2026-10-16T19:30:00+07:00","attendees":[{"name":"QA C","phone":"0900000003","status":"C"}]},{"label":"2K10 9+","startsAt":"2026-10-23T19:30:00+07:00","sourceIdentity":"qa:2K10 9+:2026-10-23T19:30:00+07:00","attendees":[{"name":"QA C","phone":"0900000003","status":"C"}]}]}'::jsonb,true),
('slot_sunday','{"sessions":[{"label":"2K10 9+","startsAt":"2026-10-18T08:00:00+07:00","sourceIdentity":"qa:2K10 9+:2026-10-18T08:00:00+07:00","attendees":[{"name":"QA C","phone":"0900000003","status":"C"}]},{"label":"2K10 9+","startsAt":"2026-10-25T08:00:00+07:00","sourceIdentity":"qa:2K10 9+:2026-10-25T08:00:00+07:00","attendees":[{"name":"QA C","phone":"0900000003","status":"C"}]}]}'::jsonb,true),
('partial_snapshot','{"sessions":[{"label":"2K9 9+","startsAt":"2026-10-12T17:30:00+07:00","sourceIdentity":"qa:2K9 9+:2026-10-12T17:30:00+07:00","attendees":[{"name":"QA A","phone":"0900000001","status":"C"}]}]}'::jsonb,true),
('dry_run','{"sessions":[{"label":"2K9 9+","startsAt":"2026-10-13T18:00:00+07:00","sourceIdentity":"qa:2K9 9+:2026-10-13T18:00:00+07:00","attendees":[{"name":"QA A","phone":"0900000001","status":"C"}],"replacesAt":"2026-10-14T17:30:00+07:00"}]}'::jsonb,false);

create table mtm_sync_due_qa068.results(case_name text,passed boolean);
do $qa$
declare testcase record;baseline jsonb;optimized jsonb;old_state jsonb;new_state jsonb;initial_state jsonb;
begin
 for testcase in select * from mtm_sync_due_qa068.cases order by case_name loop
  truncate mtm_sync_due_qa068.btvn_work;
  insert into mtm_sync_due_qa068.btvn_work select * from mtm_sync_due_qa068.seed_work;
  select jsonb_agg(to_jsonb(w) order by w.student_id,w.lesson_code) into initial_state from mtm_sync_due_qa068.btvn_work w;
  baseline=mtm_sync_due_qa068.before_due(testcase.payload,testcase.apply_n);
  select jsonb_agg(to_jsonb(w) order by w.student_id,w.lesson_code) into old_state from mtm_sync_due_qa068.btvn_work w;
  truncate mtm_sync_due_qa068.btvn_work;
  insert into mtm_sync_due_qa068.btvn_work select * from mtm_sync_due_qa068.seed_work;
  optimized=mtm_sync_due_qa068.after_due(testcase.payload,testcase.apply_n);
  select jsonb_agg(to_jsonb(w) order by w.student_id,w.lesson_code) into new_state from mtm_sync_due_qa068.btvn_work w;
  if baseline is distinct from optimized or old_state is distinct from new_state then raise exception '068 source/output equivalence failed: %',testcase.case_name;end if;
  if not testcase.apply_n and new_state is distinct from initial_state then raise exception '068 dry run changed QA data';end if;
  insert into mtm_sync_due_qa068.results values(testcase.case_name,true);
 end loop;
end$qa$;
select jsonb_build_object('suite','sync_due068_native_rollback','passed',count(*) filter(where passed),'total',count(*),
 'qa_only',true,'real_data_written',false,'function_security_definer',(select prosecdef from pg_proc where oid='public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure)) as qa
from mtm_sync_due_qa068.results;
rollback;
