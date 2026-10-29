-- 29/10/2026: tài khoản/bài thử (is_test) không phát sync_events. Không có bản vá này, tạo HS thử sẽ đẩy
-- sang Sheet roster, bot_profile, guardian_report, đề xuất mời nhóm Zalo (group_invite_proposal).
-- Bỏ qua: hàng students/btvn_lessons có is_test, hàng có student_id của HS thử, hàng có lesson_code của bài thử.
-- Vá trên bản đang chạy (pg_get_functiondef), giữ quyền, chạy lại vô hại.
begin;
set local lock_timeout='5s';
do $sc$
declare fn constant regprocedure='mtm_hw_private.sync_capture()'::regprocedure; src text; acl text; a integer;
 anchor constant text='rowdata=case when TG_OP=''DELETE'' then oldrow else newrow end;';
begin
 src=pg_get_functiondef(fn);
 if position('is_test' in src)>0 then return;end if;
 a=(length(src)-length(replace(src,anchor,'')))/length(anchor);
 if a<>1 then raise exception 'IS_TEST_SYNC: neo doi (% lan, md5 %)',a,md5(src);end if;
 src=replace(src,anchor,anchor||$add$
 -- is_test: tài khoản/bài thử không đồng bộ ra Sheet, bot, nhóm Zalo, báo PH.
 if (TG_TABLE_NAME in ('students','btvn_lessons') and coalesce((rowdata->>'is_test')::boolean,false))
  or (rowdata ? 'student_id' and exists(select 1 from mtm_hw_private.students t where t.id=(rowdata->>'student_id')::uuid and t.is_test))
  or (rowdata ? 'lesson_code' and exists(select 1 from mtm_hw_private.btvn_lessons t where t.code=rowdata->>'lesson_code' and t.is_test)) then
  return case when TG_OP='DELETE' then old else new end;end if;$add$);
 select coalesce(proacl::text,'') into acl from pg_proc where oid=fn;
 execute src;
 if (select coalesce(proacl::text,'') from pg_proc where oid=fn) is distinct from acl then raise exception 'IS_TEST_SYNC_ACL';end if;
end$sc$;
commit;
