-- 046 (18/10, anh Thành "làm đi"): đối chiếu Sheet "[MTM - nhóm tổng] Danh sách học sinh (tính học phí)" (1hPUaIUr..., nay là danh sách gốc).
-- 3 em Sheet ghi NGHỈ HẲN, trên web không có lượt nộp/không có buổi có mặt: tắt (active=false, KHÔNG xoá, bật lại được).
-- Nguyễn Phương Linh 2K11 8+ (Sheet ghi nghỉ hẳn nhưng có Zoom 11/10): CHƯA tắt, chờ giáo vụ xác nhận. ĐÃ ÁP (Claude).
begin;
insert into mtm_hw_private.merge_backup(kept,merged,kind,data)
select null,s.id,'tat_nghi_han_20261018',to_jsonb(s) from mtm_hw_private.students s
where s.id in ('1f4b23ac-d008-4517-b8ff-e8a3569f1f55','747e5ca6-aedf-497f-bbbd-99f8d4fb17d6','895e9913-b904-41d3-8881-3a75592e970d');
update mtm_hw_private.students set active=false
where id in ('1f4b23ac-d008-4517-b8ff-e8a3569f1f55','747e5ca6-aedf-497f-bbbd-99f8d4fb17d6','895e9913-b904-41d3-8881-3a75592e970d') and active;
update mtm_hw_private.memberships set left_at=coalesce(left_at,clock_timestamp())
where student_id in ('1f4b23ac-d008-4517-b8ff-e8a3569f1f55','747e5ca6-aedf-497f-bbbd-99f8d4fb17d6','895e9913-b904-41d3-8881-3a75592e970d');
commit;
