-- 29/10/2026: bot Zalo trả lời HS "buổi 27/10 chưa có video" trong khi web đã có, vì bot đọc bản link buổi học tĩnh từ 20/10.
-- Hàm này cho máy chủ bot (service_role) làm mới bản đó mỗi giờ từ đúng dữ liệu web: mỗi lớp, mỗi ngày học, bài đã mở có video / handout chưa.
-- Chỉ trả nhãn lớp, ngày, tên bài, loại bài và cờ có/không; không trả link, không dữ liệu HS. Bỏ bài thử (is_test), bài tắt, bài chưa mở.
-- Bài kiểm tra tháng trả loai='kiem-tra-thang' để bot trả lời "buổi kiểm tra không có video xem lại" (luật anh Thành 29/10 20:14).
-- Chỉ đọc. Áp SAU 22:30. Chạy lại vô hại.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create or replace function public.mtm_bot_link_buoi_hoc(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare out jsonb;
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>62 then raise exception 'MTM_BOT_LINK_RANGE' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('lop',x.lop,'ngay',x.ngay,'tieuDe',x.tieu_de,'loai',x.loai,'coVideo',x.co_video,'coHandout',x.co_handout)
   order by x.ngay desc,x.lop,x.tieu_de),'[]'::jsonb) into out
 from (
  select c.label lop,
   coalesce(l.material->'classDates'->>c.label,l.material->>'date') ngay,
   coalesce(nullif(l.material->>'title',''),nullif(l.exam->>'title',''),l.code) tieu_de,
   coalesce(l.kind,'btvn') loai,
   (coalesce(l.material->>'videoId','')<>'' or coalesce(l.material->>'videoUrl','')<>'') co_video,
   (coalesce(l.material->>'handoutUrl','')<>'' or coalesce(l.material->>'materialUrl','')<>'') co_handout
  from mtm_hw_private.btvn_lessons l join mtm_hw_private.classes c on c.id=any(l.class_ids)
  where l.active and coalesce((to_jsonb(l)->>'is_test')::boolean,false)=false
   and (l.opens_at is null or l.opens_at<=current_timestamp)
 ) x
 where (case when x.ngay ~ '^\d{4}-\d{2}-\d{2}$' then x.ngay::date end) between p_from and p_to;
 return out;
end$$;
revoke all on function public.mtm_bot_link_buoi_hoc(date,date) from public,anon,authenticated;
grant execute on function public.mtm_bot_link_buoi_hoc(date,date) to service_role;
commit;
