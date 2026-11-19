-- 19/11/2026: thẻ bài (HS + Góc phụ huynh) cũng hiện "đã nộp" cho bài được miễn (btvn_mien, 117).
-- Chỉ đổi thẻ chưa có lượt nộp thật; giữ nguyên mọi thứ wrapper cũ đã che.
do $$begin
 if to_regprocedure('public.mtm_btvn_read_before_mien119(text,text)') is null then alter function public.mtm_btvn_read(text,text) rename to mtm_btvn_read_before_mien119;end if;
end$$;
create or replace function public.mtm_btvn_read(p_session text,p_lesson text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;sid uuid;c record;cards jsonb='[]';card jsonb;m record;
begin
 r=public.mtm_btvn_read_before_mien119(p_session,p_lesson);
 if jsonb_typeof(r->'lessons') is distinct from 'array' then return r;end if;
 sid=mtm_hw_private.btvn_student(p_session);
 for c in select value card from jsonb_array_elements(r->'lessons') loop
  card=c.card;
  if jsonb_typeof(card->'submittedAt') is distinct from 'number' and coalesce(card->>'available','true')<>'false' then
   select x.diem,x.lam_luc into m from mtm_hw_private.btvn_mien x where x.student_id=sid and x.lesson_code=card->>'lessonCode' and x.revoked_at is null;
   if found then
    card=card||jsonb_build_object('submittedAt',floor(extract(epoch from m.lam_luc)*1000),'late',false,'bestScore',m.diem,'pendingGrading',false,'exempt',true);
   end if;
  end if;
  cards=cards||jsonb_build_array(card);
 end loop;
 return jsonb_set(r,'{lessons}',cards);
end$$;
revoke all on function public.mtm_btvn_read_before_mien119(text,text),public.mtm_btvn_read(text,text) from public,anon,authenticated,service_role,mtm_btvn_publisher;
grant execute on function public.mtm_btvn_read(text,text) to service_role;
do $r$begin if to_regprocedure('mtm_test100.refresh_reports()') is not null then perform mtm_test100.refresh_reports();end if;end$r$;
