-- 29/10/2026: 4 HS thử (is_test=true ngay từ INSERT) để kiểm web vai học sinh, kèm bản sao is_test của bài tuần 26/10–01/11.
-- Cần 202610270100_is_test.sql và 20261029_1530_is_test_sync_capture.sql (không phát sync_events cho dữ liệu thử).
-- HS thử chỉ thấy bài is_test (mtm_btvn_read_scoped100), nên mỗi bài thật của lớp được sao thành <mã>-qa, chỉ gắn đúng lớp đó.
-- Đăng nhập bằng họ tên + SĐT + lớp (luồng thường); SĐT dạng 00000000xx không phải số thật. Không in mã/UUID.
-- Không đụng HS, bài, điểm thật. Chạy lại vô hại (theo source_identity và mã bài).
begin;
set local lock_timeout='5s';
do $seed$
declare u uuid; c mtm_hw_private.classes; l mtm_hw_private.btvn_lessons; r record; n integer=0; m integer=0; qcode text; mat jsonb;
begin
 if position('is_test' in pg_get_functiondef('mtm_hw_private.sync_capture()'::regprocedure))=0 then raise exception 'IS_TEST_QA: chua ap 1530 sync_capture';end if;
 select owner_id into u from mtm_hw_private.btvn_roster_scope where singleton;
 if u is null then raise exception 'IS_TEST_QA: khong co roster scope';end if;
 for r in select * from (values
  (1,'QA Thử 2K9','2K9 9+'),(2,'QA Thử 2K10','2K10 9+'),(3,'QA Thử 2K11','2K11 9+'),(4,'QA Thử HSA','2K9 HSA (THỨ 5)')) x(i,ten,lop) loop
  select * into c from mtm_hw_private.classes where label=r.lop and owner_id=u and active;
  if not found then raise exception 'IS_TEST_QA: khong co lop %',r.lop;end if;
  if not exists(select 1 from mtm_hw_private.students where source_identity='qa:is-test:20261029:'||r.i) then
   insert into mtm_hw_private.students(owner_id,class_id,full_name,school,school_class,public_alias,active,student_phone,cohort,source_identity,is_test)
   values(u,c.id,r.ten,'QA INTERNAL','QA','MTM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),true,
    '00000000'||(90+r.i)::text,split_part(c.label,' ',1),'qa:is-test:20261029:'||r.i,true);
   n=n+1;
  end if;
  for l in select * from mtm_hw_private.btvn_lessons b
   where b.active and not b.is_test and b.owner_id=u and c.id=any(b.class_ids)
    and (coalesce(b.material->'classDates'->>c.label,b.material->>'date') between '2026-10-26' and '2026-11-01'
     or (b.kind='kiem-tra-thang' and b.opens_at>=timestamptz '2026-10-26 00:00+07' and b.opens_at<timestamptz '2026-11-02 00:00+07')) loop
   qcode=left(l.code,157)||'-qa';
   if exists(select 1 from mtm_hw_private.btvn_lessons b2 where b2.code=qcode) then continue;end if;
   mat=l.material||jsonb_build_object('lessonCode',qcode,'classNames',jsonb_build_array(c.label));
   if l.material ? 'classDates' then mat=mat||jsonb_build_object('classDates',jsonb_build_object(c.label,coalesce(l.material->'classDates'->c.label,l.material->'date')));end if;
   if l.material ? 'classOpensAt' and l.material->'classOpensAt' ? c.label then mat=mat||jsonb_build_object('classOpensAt',jsonb_build_object(c.label,l.material->'classOpensAt'->c.label));end if;
   insert into mtm_hw_private.btvn_lessons select * from jsonb_populate_record(null::mtm_hw_private.btvn_lessons,
    to_jsonb(l)||jsonb_build_object('code',qcode,'class_ids',jsonb_build_array(c.id),'material',mat,'is_test',true));
   m=m+1;
  end loop;
 end loop;
 if exists(select 1 from mtm_hw_private.sync_events e where e.entity_table in ('students','btvn_lessons')
  and (e.entity_key->>'id' in (select id::text from mtm_hw_private.students where is_test and source_identity like 'qa:is-test:20261029:%')
   or e.entity_key->>'code' in (select code from mtm_hw_private.btvn_lessons where is_test and code like '%-qa'))) then
  raise exception 'IS_TEST_QA: du lieu thu lot vao sync_events';end if;
 raise notice 'IS_TEST_QA: % HS thu moi, % bai sao',n,m;
end$seed$;
commit;
