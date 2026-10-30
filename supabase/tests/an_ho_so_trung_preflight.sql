-- CHỈ ĐỌC. Owner phát hành đối soát trước khi đề nghị duyệt áp migration.
-- Không đọc hàng học sinh/điện thoại/PIN và không thực hiện migration.
select p.oid::regprocedure::text as signature,pg_get_userbyid(p.proowner) as owner,
 p.prosecdef as security_definer,
 encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as source_sha256
from pg_proc p
where p.oid in (
 to_regprocedure('mtm_hw_private.student_login_visible(uuid)'),
 to_regprocedure('mtm_hw_private.dd_find_student(text,text)'),
 to_regprocedure('public.mtm_btvn_forgot(text,text,text)'),
 to_regprocedure('mtm_hw_private.session_student(text)'),
 to_regprocedure('mtm_hw_private.btvn_student_before_sync063(text)'),
 to_regprocedure('public.mtm_hw_resolve_code(text)'),
 to_regprocedure('public.mtm_hw_confirm(text,boolean)')
)
order by signature;

-- Danh mục gợi ý để owner rà các đường xác thực khác trên phiên bản live.
-- Không coi kết quả tìm chuỗi này là bằng chứng bao phủ mọi tuyến gọi gián tiếp.
select p.oid::regprocedure::text as signature,pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','mtm_hw_private') and p.prokind='f'
 and p.prosrc like '%mtm_hw_private.students%'
 and p.proname ~ '(find|login|forgot|resolve|confirm|session|bot_hs|ph_link)'
order by signature;
