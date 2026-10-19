-- Dữ liệu GIẢ cho 072 (đề ôn giữa kỳ I Toán 10, 11, 12). Chạy sau 060 (062, 069, 070 nếu có) và 072 trong transaction rồi ROLLBACK:
--   begin; \i supabase/tests/de_giua_ky_072_assertions.sql; rollback;
-- Kiểm: 3 khóa đề đã seed và mở lượt máy chủ; đề trả về khi bắt đầu không có đáp án/lời giải; chấm trên máy chủ đúng thang của Bộ
-- (trắc nghiệm 0,25; đúng/sai 0,1/0,25/0,5/1 theo số ý đúng; trả lời ngắn 0,5, nhận dấu phẩy hoặc chấm); lời giải trả về sau khi nộp.
create temporary table gk1_qa072_results(name text primary key,passed boolean not null) on commit drop;
do $qa$
declare ids constant text[]=array['mtm-gk1-toan-10-01','mtm-gk1-toan-11-01','mtm-gk1-toan-12-01'];
 ex text;e jsonb;s jsonb;r jsonb;full_ans jsonb;dot_ans jsonb;mix jsonb;tf jsonb;flip jsonb;n int;i int;expected int;got int;
begin
 if not has_function_privilege('anon','public.mtm_exam_start(text)','execute') or not has_function_privilege('anon','public.mtm_exam_submit(uuid,text,jsonb)','execute') then raise exception 'GK1_QA_072_GRANTS';end if;
 foreach ex in array ids loop
  select exam into e from mtm_exam_private.exam_keys where id=ex and static_visible;
  if e is null or jsonb_array_length(e->'questions')<>22 or e->>'rubricVersion'<>'MTM-THPT-3PART-2025-v1' or (e->>'durationMinutes')::int<>90
   or (select sum((q->>'maxMillipoints')::int) from jsonb_array_elements(e->'questions') q)<>10000
   or (select string_agg(x.q->>'kind',',' order by x.pos) from jsonb_array_elements(e->'questions') with ordinality x(q,pos))<>
      'mc,mc,mc,mc,mc,mc,mc,mc,mc,mc,mc,mc,tf,tf,tf,tf,short,short,short,short,short,short'
   or exists(select 1 from jsonb_array_elements(e->'questions') q where q->>'kind'='tf' and q->'pointsByCorrectCount'<>'[0,100,250,500,1000]'::jsonb) then
   raise exception 'GK1_QA_072_SEED %',ex;end if;
  -- Đáp án đúng lấy từ chính khóa đề; bản dấu chấm thập phân cho câu trả lời ngắn.
  select jsonb_object_agg(q->>'id',case q->>'kind' when 'short' then q->'acceptedAnswers'->0 else q->'answer' end),
   jsonb_object_agg(q->>'id',case q->>'kind' when 'short' then to_jsonb(replace(q->'acceptedAnswers'->>0,',','.')) else q->'answer' end)
   into full_ans,dot_ans from jsonb_array_elements(e->'questions') q;
  s=public.mtm_exam_start(ex);
  if exists(select 1 from jsonb_array_elements(s->'exam'->'questions') q where q ?| array['answer','acceptedAnswers','solution','solutionBlocks'])
   or s->'exam'->>'responseMode'<>'questions-only' or s->'exam'->>'versionHash'<>e->>'versionHash'
   or jsonb_array_length(s->'exam'->'questions'->12->'statements')<>4 then raise exception 'GK1_QA_072_LEAK %',ex;end if;
  r=public.mtm_exam_submit((s->>'attemptId')::uuid,s->>'attemptToken',full_ans);
  if (r->'score'->>'finalMillipoints')::int<>10000 or not (r->'exam'->'questions'->0 ? 'solution') or not (r->'exam'->'questions'->12 ? 'answer') then raise exception 'GK1_QA_072_FULL % %',ex,r->'score';end if;
  s=public.mtm_exam_start(ex);r=public.mtm_exam_submit((s->>'attemptId')::uuid,s->>'attemptToken',dot_ans);
  if (r->'score'->>'finalMillipoints')::int<>10000 then raise exception 'GK1_QA_072_DOT %',ex;end if;
  s=public.mtm_exam_start(ex);r=public.mtm_exam_submit((s->>'attemptId')::uuid,s->>'attemptToken','{}'::jsonb);
  if (r->'score'->>'finalMillipoints')::int<>0 then raise exception 'GK1_QA_072_BLANK %',ex;end if;
  -- Đúng/sai: mỗi câu Phần II, đổi ngược k ý đầu (k=0..4) -> 1000, 500, 250, 100, 0 phần nghìn; ý bỏ trống tính là chưa đúng.
  for i in 12..15 loop
   tf=e->'questions'->i;
   for n in 0..4 loop
    select jsonb_agg(case when x.k<=n then to_jsonb(not (x.v)::boolean) else x.v end order by x.k) into flip from jsonb_array_elements(tf->'answer') with ordinality x(v,k);
    s=public.mtm_exam_start(ex);r=public.mtm_exam_submit((s->>'attemptId')::uuid,s->>'attemptToken',jsonb_build_object(tf->>'id',flip));
    expected=(array[1000,500,250,100,0])[n+1];got=(r->'score'->>'finalMillipoints')::int;
    if got<>expected then raise exception 'GK1_QA_072_TF % câu % đổi % ý: % khác %',ex,i+1,n,got,expected;end if;
   end loop;
   s=public.mtm_exam_start(ex);r=public.mtm_exam_submit((s->>'attemptId')::uuid,s->>'attemptToken',jsonb_build_object(tf->>'id',jsonb_build_array(tf->'answer'->0,null,null,null)));
   if (r->'score'->>'finalMillipoints')::int<>100 then raise exception 'GK1_QA_072_TF_NULL %',ex;end if;
  end loop;
  -- Bài thực tế: sai 2 câu trắc nghiệm, Phần II đúng 4/3/2/1 ý, sai 1 câu trả lời ngắn: 2500 + 1850 + 2500 = 6850.
  mix=full_ans;
  for i in 0..1 loop mix=jsonb_set(mix,array[e->'questions'->i->>'id'],to_jsonb(case when e->'questions'->i->>'answer'='A' then 'B' else 'A' end));end loop;
  for i in 13..15 loop
   select jsonb_agg(case when x.k<=i-12 then to_jsonb(not (x.v)::boolean) else x.v end order by x.k) into flip from jsonb_array_elements(e->'questions'->i->'answer') with ordinality x(v,k);
   mix=jsonb_set(mix,array[e->'questions'->i->>'id'],flip);
  end loop;
  mix=jsonb_set(mix,array[e->'questions'->21->>'id'],'"9999"');
  s=public.mtm_exam_start(ex);r=public.mtm_exam_submit((s->>'attemptId')::uuid,s->>'attemptToken',mix);
  if (r->'score'->>'finalMillipoints')::int<>6850 then raise exception 'GK1_QA_072_MIX % %',ex,r->'score'->>'finalMillipoints';end if;
  insert into gk1_qa072_results values(ex||': 22 câu, mở lượt máy chủ, không lộ đáp án; chấm 10/0/6,85 và Đ/S 1/0,5/0,25/0,1/0 đúng',true);
 end loop;
end $qa$;
select name,passed from gk1_qa072_results order by name;
