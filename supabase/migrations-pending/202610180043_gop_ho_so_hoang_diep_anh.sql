-- 043 (18/10, anh Thành xác nhận "có 1 Hoàng Diệp Anh thôi"): gộp hồ sơ trùng 2K11 9+.
-- Giữ bd4f7cd5 (có 3 bài BTVN đã nộp + ảnh hồ sơ), nhận từ 4f073e7c: SĐT PH, mã đồng bộ Sheet (source_identity), phiên đăng nhập, lịch sử lớp.
-- Bài trùng lesson: giữ bản của bd4f7cd5 (bản kia 0 lượt nộp). Toàn bộ dữ liệu bản bị gộp sao lưu ở mtm_hw_private.merge_backup. ĐÃ ÁP (Claude).
begin;
create table if not exists mtm_hw_private.merge_backup(id bigserial primary key, at timestamptz not null default now(), kept uuid, merged uuid, kind text, data jsonb);
alter table mtm_hw_private.merge_backup enable row level security;
revoke all on mtm_hw_private.merge_backup from public,anon,authenticated;

do $$
declare keep uuid='bd4f7cd5-9d2c-4f3c-8a6d-b1b233bb7c8f'; drop_ uuid='4f073e7c-071d-4d0d-b80d-26ae636abeae'; t text; ident text; pp text;
begin
 if (select count(*) from mtm_hw_private.students where id in (keep,drop_) and active)<>2 then raise exception 'Ho so khong dung trang thai'; end if;
 insert into mtm_hw_private.merge_backup(kept,merged,kind,data) select keep,drop_,'students',to_jsonb(s) from mtm_hw_private.students s where s.id in (keep,drop_);
 foreach t in array array['btvn_work','sessions','btvn_identity_sessions','codes','memberships','attempts','challenges','support_events','student_appearance',
   'btvn_manual_grades','attendance','schedule_moves','attendance_raw','attendance_alias','guardians','class_transfers','btvn_rank_exclusions','btvn_monthly_scores'] loop
  execute format('insert into mtm_hw_private.merge_backup(kept,merged,kind,data) select $1,$2,%L,to_jsonb(x) from mtm_hw_private.%I x where x.student_id=$2',t,t) using keep,drop_;
 end loop;
 -- bài trùng: giữ bản đã nộp của hồ sơ giữ lại
 delete from mtm_hw_private.btvn_work w where w.student_id=drop_ and exists(select 1 from mtm_hw_private.btvn_work k where k.student_id=keep and k.lesson_code=w.lesson_code);
 -- lịch sử lớp: đóng membership đang mở của bản bị gộp (bản giữ lại đã có membership mở cùng lớp)
 update mtm_hw_private.memberships set left_at=coalesce(left_at,clock_timestamp()) where student_id=drop_;
 foreach t in array array['btvn_work','sessions','btvn_identity_sessions','codes','memberships','attempts','challenges','support_events',
   'btvn_manual_grades','attendance','schedule_moves','attendance_raw','attendance_alias','guardians','class_transfers','btvn_rank_exclusions','btvn_monthly_scores'] loop
  execute format('update mtm_hw_private.%I set student_id=$1 where student_id=$2',t) using keep,drop_;
 end loop;
 delete from mtm_hw_private.student_appearance where student_id=drop_;
 select source_identity,parent_phone into ident,pp from mtm_hw_private.students where id=drop_;
 update mtm_hw_private.students set source_identity=null,active=false where id=drop_;
 update mtm_hw_private.students set source_identity=coalesce(ident,source_identity),parent_phone=coalesce(parent_phone,pp) where id=keep;
end$$;
commit;
