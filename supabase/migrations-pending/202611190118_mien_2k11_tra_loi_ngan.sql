-- 19/11/2026 (anh Thành 11:54): BTVN Trả lời ngắn 2K11 18–19/11 đăng lại câu 4–30, bài 47 câu cũ ẩn.
-- HS đã nộp bài cũ giữ kết quả, coi như đã làm bài mới, không yêu cầu làm lại.
-- Không ghi tên/mã HS ở đây: chọn theo "đã nộp bài cũ".
do $mien$
declare kq jsonb; co int;
 cu constant text='btvn-ae8e7e2b9b0970121eade1d9346b6e5f74b2672c-v-0092d3fa7d0a2f34ff8fba0dc613172b74fd5612';
 moi constant text='btvn-ae8e7e2b9b0970121eade1d9346b6e5f74b2672c-v-ffad3961d47f4312193eba189a3eb2ad14215d74';
begin
 if not exists(select 1 from mtm_hw_private.btvn_lessons where code=cu) or not exists(select 1 from mtm_hw_private.btvn_lessons where code=moi) then
  raise exception 'MIEN_2K11_THIEU_BAI';end if;
 kq=mtm_hw_private.btvn_mien_tu_bai_cu(cu,moi,'Đã làm bài 47 câu cũ trước khi đăng lại câu 4–30; giữ kết quả theo anh Thành 19/11','mien-2k11-tln-20261119');
 select count(*) into co from mtm_hw_private.btvn_mien where lesson_code=moi and tu_bai=cu and revoked_at is null;
 if co=0 then raise exception 'MIEN_2K11_KHONG_CO_HS: %',kq;end if;
 raise notice 'MIEN_2K11 moi=% boQua=% dangHieuLuc=%',kq->>'moi',kq->>'boQua',co;
end$mien$;
do $r$begin if to_regprocedure('mtm_test100.refresh_reports()') is not null then perform mtm_test100.refresh_reports();end if;end$r$;
