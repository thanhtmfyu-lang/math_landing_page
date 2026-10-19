-- Dữ liệu GIẢ cho 070 (đề thi thử HSA số 02). Chạy sau 060, 069, 070 trong transaction rồi ROLLBACK:
--   begin; \i supabase/tests/hsa_rank_070_assertions.sql; rollback;
create temporary table hsa_qa070_results(name text primary key,passed boolean not null) on commit drop;
do $qa$
declare e1 constant text='mtm-hsa-thi-thu-01';e2 constant text='mtm-hsa-thi-thu-02';s jsonb;r jsonb;a uuid[]='{}';tk text[]='{}';full_ans jsonb;i int;
 dev constant text:=repeat('7',64);
begin
 if not exists(select 1 from mtm_exam_private.exam_keys where id=e2 and static_visible)
  or not exists(select 1 from mtm_hsa_rank.exams where exam_id=e2 and active and not placeholder)
  or (select jsonb_array_length(exam->'questions') from mtm_exam_private.exam_keys where id=e2)<>50 then raise exception 'HSA_QA_070_SEED';end if;
 insert into hsa_qa070_results values('Đề 02 đã seed: 50 câu, mở lượt máy chủ, bảng xếp hạng active',true);
 select jsonb_object_agg(q->>'id',case q->>'kind' when 'mc' then q->'answer' else q->'acceptedAnswers'->0 end) into full_ans
  from mtm_exam_private.exam_keys k,jsonb_array_elements(k.exam->'questions') q where k.id=e2;
 s=public.mtm_exam_start(e2);a=a||(s->>'attemptId')::uuid;tk=tk||(s->>'attemptToken');
 if s->'exam'->'questions'->0 ?| array['answer','acceptedAnswers','solution'] then raise exception 'HSA_QA_070_LEAK';end if;
 r=public.mtm_exam_submit(a[1],tk[1],full_ans);
 if (r->'score'->>'finalMillipoints')::int<>10000 then raise exception 'HSA_QA_070_SCORE %',r->'score'->>'finalMillipoints';end if;
 insert into hsa_qa070_results values('Đề 02 chấm trên máy chủ: đúng hết 10000, đề trả về không có đáp án',true);
 s=public.mtm_exam_start(e1);a=a||(s->>'attemptId')::uuid;tk=tk||(s->>'attemptToken');
 perform public.mtm_exam_submit(a[2],tk[2],'{}'::jsonb);
 update mtm_exam_private.attempts set started_at=submitted_at-interval '20 minutes' where id=any(a);
 -- Cùng thiết bị, cùng tên vẫn vào được bảng của từng đề: mỗi đề một bảng riêng.
 if public.mtm_hsa_rank_submit(e2,a[1],tk[1],'Học sinh GIẢ Z','hoc sinh gia z','12',dev)->>'status'<>'accepted'
  or public.mtm_hsa_rank_submit(e1,a[2],tk[2],'Học sinh GIẢ Z','hoc sinh gia z','12',dev)->>'status'<>'accepted' then raise exception 'HSA_QA_070_SEPARATE';end if;
 -- Lượt của đề 02 gửi vào bảng đề 01 bị từ chối (lỗi hoặc trạng thái không ghi bảng).
 begin
  if public.mtm_hsa_rank_submit(e1,a[1],tk[1],'Học sinh GIẢ Y','hoc sinh gia y','12',repeat('8',64))->>'status' in('accepted','already') then raise exception 'HSA_QA_070_CROSS';end if;
 exception when others then if sqlerrm like 'HSA_QA_070_CROSS%' then raise;end if;end;
 if (public.mtm_hsa_rank_top(e2,50)->'rows'->0->>'score')::int<>10000 or (public.mtm_hsa_rank_top(e1,50)->'rows'->0->>'score')::int<>0
  or jsonb_array_length(public.mtm_hsa_rank_top(e2,50)->'rows')<>1 or jsonb_array_length(public.mtm_hsa_rank_top(e1,50)->'rows')<>1 then raise exception 'HSA_QA_070_TOP % %',public.mtm_hsa_rank_top(e1,50),public.mtm_hsa_rank_top(e2,50);end if;
 insert into hsa_qa070_results values('Mỗi đề một bảng xếp hạng; lượt đề 02 không ghi được vào bảng đề 01',true);
end $qa$;
select name,passed from hsa_qa070_results order by name;
