-- Dữ liệu GIẢ cho 078 (Góc phụ huynh). Chạy trong transaction rồi ROLLBACK:
--   begin; \i supabase/tests/phu_huynh_090_assertions.sql; rollback;
create temporary table ph_qa078(name text primary key,passed boolean not null) on commit drop;
do $qa$
declare o uuid=coalesce((select owner_id from mtm_hw_private.classes limit 1),(select id from auth.users limit 1));c1 uuid=gen_random_uuid();a uuid=gen_random_uuid();b uuid=gen_random_uuid();r jsonb;sa text;sb text;net constant text=repeat('a',32);net2 constant text=repeat('b',32);i int;code text;
begin
 insert into mtm_hw_private.classes(id,owner_id,label,grade,active) values(c1,o,'2K9 GIẢ QA',12,true);
 insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,student_phone,parent_phone,active) values
  (a,o,c1,'Học Sinh Giả A','THPT QA','12A','MTM-0000000000A1','0911000001','0922000001',true),(b,o,c1,'Học Sinh Giả B','THPT QA','12A','MTM-0000000000B2','0911000002','0922000002',true);
 insert into mtm_hw_private.attendance(student_id,class_label,session_date,status,source) values(a,'2K9 GIẢ QA',date '2026-10-15','co_mat','quan_ly'),(b,'2K9 GIẢ QA',date '2026-10-15','vang','quan_ly');
 -- Sai một trong bốn trường: cùng một kết quả, không nói ô nào sai.
 r=public.mtm_ph_link('0922000001',null,'Học Sinh Giả A','0911000001','2K9 GIẢ QA',null,'482915',net);
 if r->>'ok'<>'true' then raise exception 'PH_QA_LINK %',r;end if;sa=r->>'session';
 if public.mtm_ph_link('0922000009',null,'Học Sinh Giả B','0911000002','2K9 GIẢ QA',null,'482915',net2)::text<>'{"ok": false}'
  or public.mtm_ph_link('0922000002',null,'Học Sinh Giả X','0911000002','2K9 GIẢ QA',null,'482915',net2)::text<>'{"ok": false}'
  or public.mtm_ph_link('0922000002',null,'Học Sinh Giả B','0911000009','2K9 GIẢ QA',null,'482915',net2)::text<>'{"ok": false}'
  or public.mtm_ph_link('0922000002',null,'Học Sinh Giả B','0911000002','2K10 GIẢ',null,'482915',net2)::text<>'{"ok": false}' then raise exception 'PH_QA_SAME_ERROR';end if;
 insert into ph_qa078 values('Ghép đúng 4 thông tin mới vào; sai 1 trong 4 trả cùng {ok:false}',true);
 if (select pin_hash from mtm_hw_private.parent_accounts where phone='0922000001') like '%482915%' or (select pin_hash from mtm_hw_private.parent_accounts where phone='0922000001') !~ '^\$2' then raise exception 'PH_QA_HASH';end if;
 insert into ph_qa078 values('PIN phụ huynh lưu băm bcrypt',true);
 if public.mtm_ph_link('0922000002',null,'Học Sinh Giả B','0911000002','2K9 GIẢ QA',null,'111111',net2)->>'pin'<>'weak' then raise exception 'PH_QA_WEAK';end if;
 r=public.mtm_ph_link('0922000002',null,'Học Sinh Giả B','0911000002','2K9 GIẢ QA',null,'730146',net2);sb=r->>'session';
 -- PH A không xem được con của PH B dù gửi đúng mã học sinh B.
 begin perform public.mtm_ph_child_session(sa,b);raise exception 'PH_QA_CROSS';exception when sqlstate '42501' then null;end;
 begin perform public.mtm_ph_extras(sa,b);raise exception 'PH_QA_CROSS2';exception when sqlstate '42501' then null;end;
 if jsonb_array_length(public.mtm_ph_children(sa)->'children')<>1 or public.mtm_ph_children(sa)->'children'->0->>'fullName'<>'Học Sinh Giả A' then raise exception 'PH_QA_CHILDREN';end if;
 if public.mtm_ph_extras(sa,a)->'attendance'->0->>'status'<>'co_mat' or public.mtm_ph_extras(sa,a)::text ~ '0911|0922' then raise exception 'PH_QA_EXTRAS';end if;
 if mtm_hw_private.btvn_student(public.mtm_ph_child_session(sa,a))<>a then raise exception 'PH_QA_CHILD_SESSION';end if;
 insert into ph_qa078 values('PH A không đọc được con của PH B; đọc con mình không lộ SĐT',true);
 -- Đăng nhập lại bằng SĐT + PIN; sai 5 lần thì khoá 15 phút, kể cả nhập đúng sau đó.
 if public.mtm_ph_login('0922000001','482915',net)->>'ok'<>'true' then raise exception 'PH_QA_LOGIN';end if;
 for i in 1..5 loop r=public.mtm_ph_login('0922000001','000001',repeat(chr(99+i),32));end loop;
 if r->>'pin'<>'locked' or public.mtm_ph_login('0922000001','482915',repeat('z',32))->>'ok'='true' then raise exception 'PH_QA_LOCK %',r;end if;
 insert into ph_qa078 values('Sai PIN 5 lần khoá 15 phút theo SĐT phụ huynh',true);
 for i in 1..10 loop perform public.mtm_ph_login('09330000'||lpad(i::text,2,'0'),'000001',repeat('n',32));end loop;
 if public.mtm_ph_login('0922000002','730146',repeat('n',32))->>'pin'<>'locked' then raise exception 'PH_QA_NETLOCK';end if;
 insert into ph_qa078 values('Một mạng sai 10 lần bị khoá 15 phút',true);
 -- Mã ghép Zalo: dùng 1 lần, hết hạn 10 phút.
 code=public.mtm_ph_zalo_code(sb)->>'code';
 if public.mtm_ph_zalo_claim(code,'zalo-qa-1')->>'ok'<>'true' or public.mtm_ph_zalo_claim(code,'zalo-qa-2')->>'ok'<>'false' then raise exception 'PH_QA_ZALO_ONCE';end if;
 if public.mtm_ph_zalo_children('zalo-qa-1')->0->>'fullName'<>'Học Sinh Giả B' or jsonb_array_length(public.mtm_ph_zalo_children('zalo-qa-2'))<>0 then raise exception 'PH_QA_ZALO_SCOPE';end if;
 code=public.mtm_ph_zalo_code(sb)->>'code';update mtm_hw_private.parent_zalo_codes set expires_at=clock_timestamp()-interval '1 second' where phone='0922000002';
 if public.mtm_ph_zalo_claim(code,'zalo-qa-3')->>'ok'<>'false' then raise exception 'PH_QA_ZALO_EXPIRE';end if;
 insert into ph_qa078 values('Mã ghép Zalo dùng 1 lần, hết hạn thì từ chối, bot chỉ thấy con đã ghép',true);
 perform public.mtm_ph_logout(sb);
 begin perform public.mtm_ph_children(sb);raise exception 'PH_QA_LOGOUT';exception when sqlstate '42501' then null;end;
 r=public.mtm_ph_reset_pin('0922000002');raise notice 'reset %',r;
 if (r->>'ok')::boolean is not true or exists(select 1 from mtm_hw_private.parent_links where phone='0922000002') then raise exception 'PH_QA_RESET % %',public.mtm_ph_reset_pin('0922000002'),(select count(*) from mtm_hw_private.parent_links where phone='0922000002');end if;
 insert into ph_qa078 values('Đăng xuất thu hồi phiên; quản lý đặt lại PIN xoá tài khoản + ghép',true);
end $qa$;
select name,passed from ph_qa078 order by name;
