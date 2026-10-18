-- 057 (18/10, anh Thành): "bảng xếp hạng tháng sẽ có những điểm bằng nhau, thêm cả thời gian làm bài vào để so sánh".
-- Hạng: điểm TB (lần nộp đầu) cao hơn -> nộp nhiều bài hơn -> TỔNG THỜI GIAN LÀM (elapsedSeconds của lần nộp đầu) ít hơn -> nộp sớm hơn.
-- Hàng trả thêm 'seconds' (tổng giây). Vá bằng thay chuỗi trên định nghĩa đang chạy, chạy lại an toàn. ĐÃ ÁP (Claude).
begin;
do $$
declare src text; fixed text; pairs text[][]; i int;
begin
 select pg_get_functiondef('mtm_hw_private.btvn_rank_rows(text,text,text,text,uuid)'::regprocedure) into src;
 if position('best.secs' in src)>0 then return; end if;
 pairs=array[
  array[$a$left join lateral (select r.score,r.submitted_at at from mtm_hw_private.btvn_official_receipts(a.id,a.code) r$a$,
        $a$left join lateral (select r.score,r.submitted_at at,case when jsonb_typeof(r.receipt->'elapsedSeconds')='number' and (r.receipt->>'elapsedSeconds')::numeric between 0 and 86400 then (r.receipt->>'elapsedSeconds')::numeric end secs from mtm_hw_private.btvn_official_receipts(a.id,a.code) r$a$],
  array[$a$select a.*,best.score,best.at,$a$,$a$select a.*,best.score,best.at,best.secs,$a$],
  array[$a$count(*)::integer total,max(at) at$a$,$a$count(*)::integer total,max(at) at,sum(secs) secs$a$],
  array[$a$1 submitted,1 total,w.at from eligible s$a$,$a$1 submitted,1 total,w.at,null::numeric secs from eligible s$a$],
  array[$a$order by score desc,submitted desc,at asc nulls last,id) rank,id,full_name,label,score,submitted,total$a$,$a$order by score desc,submitted desc,secs asc nulls last,at asc nulls last,id) rank,id,full_name,label,score,submitted,total,secs$a$],
  array[$a$'score',round(r.score,2),$a$,$a$'score',round(r.score,2),'seconds',round(r.secs),$a$]];
 fixed=src;
 for i in 1..array_length(pairs,1) loop
  if position(pairs[i][1] in fixed)=0 then raise exception '057 patch % did not match',i; end if;
  fixed=replace(fixed,pairs[i][1],pairs[i][2]);
 end loop;
 execute fixed;
end$$;
revoke all on function mtm_hw_private.btvn_rank_rows(text,text,text,text,uuid) from public,anon,authenticated,service_role,mtm_btvn_publisher;
commit;
