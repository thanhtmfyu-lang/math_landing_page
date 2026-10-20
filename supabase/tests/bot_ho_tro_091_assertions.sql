-- Dữ liệu GIẢ cho 079 (bot Zalo hỗ trợ đăng nhập). Chạy trong transaction rồi ROLLBACK:
--   begin; \i supabase/tests/bot_ho_tro_091_assertions.sql; rollback;
do $qa$
declare o uuid=coalesce((select owner_id from mtm_hw_private.classes limit 1),(select id from auth.users limit 1));c1 uuid=gen_random_uuid();a uuid=gen_random_uuid();r jsonb;
begin
 insert into mtm_hw_private.classes(id,owner_id,label,grade,active) values(c1,o,'2K9 GIẢ BOT',12,true);
 insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,student_phone,parent_phone,active) values
  (a,o,c1,'Học Sinh Giả Bót','THPT QA','12A','MTM-0000000000C3','0911000071','0922000071',true);
 -- Không có trong sổ.
 r=public.mtm_bot_hs_check('Không Có Ai','0911000071','2K9 GIẢ BOT');
 if r->>'found'<>'false' or r->>'code'<>'khong-thay-ten' then raise exception 'BOT_QA_NOTFOUND %',r;end if;
 -- Chưa đặt PIN, SĐT lệch: chẩn đoán đúng, không trả SĐT trong sổ.
 r=public.mtm_bot_hs_check('hoc sinh gia bot','0999999999','2K9 GIẢ BOT');
 if r->>'code'<>'sdt-lech-chua-pin' or r->>'phoneMatch'<>'khong-khop' or r::text ~ '0911000071|0922000071' then raise exception 'BOT_QA_LECH %',r;end if;
 -- Có PIN và đang khoá → mở khoá.
 insert into mtm_hw_private.student_pins(student_id,pin_hash,failed,locked_until) values(a,extensions.crypt('482915',extensions.gen_salt('bf',8)),0,clock_timestamp()+interval '10 minutes');
 r=public.mtm_bot_hs_check('Học Sinh Giả Bót','0922000071','2K9');
 if r->>'code'<>'khoa-pin' or r->>'phoneMatch'<>'phu-huynh' then raise exception 'BOT_QA_LOCKED %',r;end if;
 r=public.mtm_bot_hs_unlock('Học Sinh Giả Bót','2K9 GIẢ BOT');
 if r->>'unlocked'<>'true' or (select locked_until from mtm_hw_private.student_pins where student_id=a) is not null then raise exception 'BOT_QA_UNLOCK %',r;end if;
 -- Đặt lại PIN: SĐT lạ bị từ chối; SĐT hồ sơ thì xoá PIN.
 if public.mtm_bot_hs_reset_pin('Học Sinh Giả Bót','2K9 GIẢ BOT','0988888888')->>'ok'<>'false' or not exists(select 1 from mtm_hw_private.student_pins where student_id=a) then raise exception 'BOT_QA_RESET_STRANGER';end if;
 r=public.mtm_bot_hs_reset_pin('Học Sinh Giả Bót','2K9 GIẢ BOT','0911000071');
 if r->>'ok'<>'true' or exists(select 1 from mtm_hw_private.student_pins where student_id=a) then raise exception 'BOT_QA_RESET %',r;end if;
 r=public.mtm_bot_hs_reset_pin('Học Sinh Giả Bót','2K9 GIẢ BOT','0911000071');
 if r->>'code'<>'qua-gioi-han' then raise exception 'BOT_QA_RESET_LIMIT %',r;end if;
 if (select count(*) from mtm_hw_private.bot_support_log where student_id=a)<5 then raise exception 'BOT_QA_LOG';end if;
 -- PH quên PIN: Zalo chưa ghép bị từ chối.
 if public.mtm_bot_ph_reset_pin('0922000071','zalo-la')->>'ok'<>'false' then raise exception 'BOT_QA_PH';end if;
 -- Chỉ service_role gọi được.
 if has_function_privilege('anon','public.mtm_bot_hs_reset_pin(text,text,text,text)','execute') or has_function_privilege('authenticated','public.mtm_bot_hs_unlock(text,text,text)','execute') then raise exception 'BOT_QA_GRANT';end if;
 raise notice 'BOT 091: 8/8 kiểm tra đạt (không thấy tên, SĐT lệch, khoá PIN, mở khoá, đặt lại có kiểm SĐT, giới hạn 1 lần/24 giờ, nhật ký, quyền).';
end$qa$;
