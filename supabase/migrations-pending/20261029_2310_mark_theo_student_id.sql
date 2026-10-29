-- 29/10/2026: action mark nhận thêm studentId cho từng dòng. Em học 2 lớp cùng khóa (vd 2K9 9+ và HSA) có 2 hồ sơ thật,
-- nên tìm theo tên + lớp ca trả "ambiguous" khi em được chuyển sang ca lớp khác. Có studentId (hồ sơ đang học, không phải
-- tài khoản thử) thì ghi thẳng hồ sơ đó; không có thì tìm theo tên như cũ. Không đổi nhánh nào khác của API.
begin;
do $m$
declare
 src text:=pg_get_functiondef('public.mtm_dd_api(jsonb)'::regprocedure);
 a text:=$q$st=mtm_hw_private.dd_find_student(rr->>'student',rr->>'class');$q$;
 b text:=$q$st=case when coalesce(rr->>'studentId','') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then coalesce((select jsonb_build_object('id',s.id,'fullName',s.full_name,'className',c.label) from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id where s.id=(rr->>'studentId')::uuid and s.active and coalesce(s.source_identity,'') not like 'qa:%'),jsonb_build_object('error','not_found')) else mtm_hw_private.dd_find_student(rr->>'student',rr->>'class') end;$q$;
 n int;
begin
 if position('rr->>''studentId''' in src)>0 then return;end if;
 n:=(length(src)-length(replace(src,a,'')))/length(a);
 if n<>1 then raise exception 'MARK_STUDENT_ID: mốc mark trong mtm_dd_api đã đổi (% chỗ), cần xem tay',n;end if;
 execute replace(src,a,b);
end$m$;
commit;
