-- Phòng thi thử: thêm kỳ thi ĐGNL Bộ Công an (loai 'bca') vào các ràng buộc loại kỳ thi của 077.
-- Chưa áp thì bài BCA vẫn chấm và hiện điểm, chỉ không lưu lịch sử, xếp hạng.
alter table mtm_phong_thi.luot drop constraint if exists luot_loai_check;
alter table mtm_phong_thi.luot add constraint luot_loai_check check(loai in ('thpt','hsa','tsa','bca'));
alter table mtm_phong_thi.quyen drop constraint if exists quyen_loai_check;
alter table mtm_phong_thi.quyen add constraint quyen_loai_check check(loai <@ array['thpt','hsa','tsa','bca'] and cardinality(loai)>0);
alter table mtm_phong_thi.ma_kich_hoat drop constraint if exists ma_kich_hoat_loai_check;
alter table mtm_phong_thi.ma_kich_hoat add constraint ma_kich_hoat_loai_check check(loai <@ array['thpt','hsa','tsa','bca'] and cardinality(loai)>0);
