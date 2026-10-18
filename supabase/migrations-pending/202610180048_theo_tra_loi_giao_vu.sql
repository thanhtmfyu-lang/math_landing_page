-- 048 (18/10, chị Hằng trả lời 11:59): "Nguyễn Quách Ngọc Minh chứ không phải Nguyễn Quang Minh, web đang sai tên" -> đổi tên;
-- Nguyễn Phương Linh 2K11 8+: Sheet học phí ghi NGHỈ HẲN ("bạn nghỉ em đã note là nghỉ") -> tắt (không xoá, có sao lưu). ĐÃ ÁP (Claude).
begin;
insert into mtm_hw_private.merge_backup(kept,merged,kind,data) select null,s.id,'giao_vu_1159_20261018',to_jsonb(s) from mtm_hw_private.students s
 where s.id in ('eef5ef72-3098-4952-9573-3fd838e2ee56','344aafd6-19e2-4d3f-bd9e-9d30c05af306');
update mtm_hw_private.students set full_name='Nguyễn Quách Ngọc Minh' where id='eef5ef72-3098-4952-9573-3fd838e2ee56';
update mtm_hw_private.students set active=false where id='344aafd6-19e2-4d3f-bd9e-9d30c05af306' and active;
update mtm_hw_private.memberships set left_at=coalesce(left_at,clock_timestamp()) where student_id='344aafd6-19e2-4d3f-bd9e-9d30c05af306';
commit;
