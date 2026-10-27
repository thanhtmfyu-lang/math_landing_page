-- Chuyển 1 HS sang lớp 2K10 9+ theo lệnh anh Thành 27/10 20:01 (học Thứ 3 + Chủ nhật lớp 9+, làm bài thi tháng tối nay).
-- Kho công khai: HS nhận diện bằng băm tên, không ghi tên/SĐT. Đã ở 9+ thì không làm gì.
-- Theo đúng mẫu dd_apply_transfers (063): đổi students.class_id, đóng membership cũ, mở membership mới.
do $chuyen$
declare sid uuid; oid uuid; cur uuid; cid uuid; n int; t timestamptz=clock_timestamp();
begin
 select count(*) into n from mtm_hw_private.students
  where active and encode(sha256(convert_to(lower(btrim(normalize(full_name,NFC))),'UTF8')),'hex')='d080949adbb82c84c9b3f9c46da229ccdc750aaf2ffe58e63fa18d0513b34bd6';
 if n<>1 then raise exception 'Can dung 1 HS, thay %',n; end if;
 select id,owner_id,class_id into sid,oid,cur from mtm_hw_private.students
  where active and encode(sha256(convert_to(lower(btrim(normalize(full_name,NFC))),'UTF8')),'hex')='d080949adbb82c84c9b3f9c46da229ccdc750aaf2ffe58e63fa18d0513b34bd6'
  for update;
 select count(*) into n from mtm_hw_private.classes where owner_id=oid and active and label='2K10 9+';
 if n<>1 then raise exception 'Can dung 1 lop 2K10 9+, thay %',n; end if;
 select id into cid from mtm_hw_private.classes where owner_id=oid and active and label='2K10 9+';
 if cur=cid and exists(select 1 from mtm_hw_private.memberships where student_id=sid and class_id=cid and left_at is null) then
  raise notice 'Da o 2K10 9+, khong doi'; return;
 end if;
 update mtm_hw_private.students set class_id=cid where id=sid;
 update mtm_hw_private.memberships set left_at=greatest(joined_at,t) where student_id=sid and left_at is null and class_id<>cid;
 if not exists(select 1 from mtm_hw_private.memberships where student_id=sid and left_at is null) then
  insert into mtm_hw_private.memberships(student_id,class_id,joined_at) values(sid,cid,t);
 end if;
 -- Ghi lệnh chuyển lớp đã áp để lượt đồng bộ Sheet không kéo ngược về lớp cũ (bảng sống ngoài repo; lỗi cột thì bỏ qua phần này).
 begin
  insert into mtm_hw_private.class_transfers(student_id,to_class,effective_date,applied_at)
   values(sid,'2K10 9+',(t at time zone 'Asia/Ho_Chi_Minh')::date,t);
 exception when others then raise notice 'Bo qua class_transfers: %',sqlstate;
 end;
 if (select class_id from mtm_hw_private.students where id=sid)<>cid then raise exception 'Chuyen lop khong ghi duoc'; end if;
end$chuyen$;
