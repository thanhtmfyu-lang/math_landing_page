-- 29/10/2026: CHỈ KIỂM, không ghi (luôn rollback bằng exception có số đếm).
-- Đếm bài đã mở từ 19/10 có link video/handout (material.videoId/videoUrl/handoutUrl/materialUrl) theo lớp, bài thật và bản "-qa".
-- Thông báo chỉ có nhãn lớp và số đếm, không tên HS, không mã bài.
begin;
set local statement_timeout='30s';
do $kiem$
declare r record; msg text='';
begin
 -- CSDL kiểm thử (không có HS QA) thì bỏ qua; chỉ báo số trên CSDL thật.
 if not exists(select 1 from mtm_hw_private.students where source_identity like 'qa:is-test:20261029:%') then return;end if;
 for r in select c.label,
   count(*) filter (where not l.is_test) th,
   count(*) filter (where not l.is_test and (l.material ?| array['videoId','videoUrl','handoutUrl','materialUrl'])) thv,
   count(*) filter (where l.is_test) qa,
   count(*) filter (where l.is_test and (l.material ?| array['videoId','videoUrl','handoutUrl','materialUrl'])) qav
  from mtm_hw_private.classes c join mtm_hw_private.btvn_lessons l on c.id=any(l.class_ids) and l.active
  where c.label in ('2K9 9+','2K10 9+','2K11 9+','2K9 HSA (THỨ 5)') and l.kind<>'kiem-tra-thang'
   and coalesce(l.material->'classDates'->>c.label,l.material->>'date') between '2026-10-19' and to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD')
   and (l.opens_at is null or l.opens_at<=now())
  group by c.label order by c.label loop
  msg=msg||format('%s: that %s/%s, qa %s/%s; ',r.label,r.thv,r.th,r.qav,r.qa);
 end loop;
 raise exception 'DEM_VIDEO %',coalesce(nullif(msg,''),'khong co bai');
end$kiem$;
commit;
