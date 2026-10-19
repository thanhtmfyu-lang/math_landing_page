-- Dữ liệu GIẢ cho 069 (thi thử HSA). Chạy trong transaction bao ngoài rồi ROLLBACK, sau 060 và 069:
--   begin; \i supabase/tests/hsa_rank_069_assertions.sql; rollback;
create temporary table hsa_qa069_results(name text primary key,passed boolean not null) on commit drop;
do $qa$
declare ex constant text='mtm-preview-practice-hsa-01-v1';s jsonb;r jsonb;a uuid[]='{}';tk text[]='{}';i int;top jsonb;
 dev constant text[]=array[repeat('1',64),repeat('2',64),repeat('3',64),repeat('4',64),repeat('5',64),repeat('6',64)];
begin
 if has_function_privilege('anon','public.mtm_hsa_rank_submit(text,uuid,text,text,text,text,text)','execute')
  or has_function_privilege('authenticated','public.mtm_hsa_rank_top(text,integer)','execute')
  or not has_function_privilege('service_role','public.mtm_hsa_rank_top(text,integer)','execute') then raise exception 'HSA_QA_069_GRANTS';end if;
 insert into hsa_qa069_results values('Chỉ service_role gọi được RPC xếp hạng',true);
 for i in 1..6 loop
  s=public.mtm_exam_start(ex);a=a||(s->>'attemptId')::uuid;tk=tk||(s->>'attemptToken');
 end loop;
 -- Chưa nộp thì không vào bảng.
 if public.mtm_hsa_rank_submit(ex,a[1],tk[1],'Học sinh GIẢ A','hoc sinh gia a','12',dev[1])->>'status'<>'not_submitted' then raise exception 'HSA_QA_069_NOT_SUBMITTED';end if;
 -- 1: 5,5 điểm; 2: 10 điểm; 3: 5,5 điểm nhưng nhanh hơn 1; 4 trùng thiết bị với 2; 5 nộp quá hạn; 6 nộp sau 30 giây.
 perform public.mtm_exam_submit(a[1],tk[1],'{"hsa-p1-mc1":"B","hsa-p1-tf1":[true,true,false,false],"hsa-p1-short1":"12"}'::jsonb);
 perform public.mtm_exam_submit(a[2],tk[2],'{"hsa-p1-mc1":"B","hsa-p1-mc2":"C","hsa-p1-mc3":"B","hsa-p1-tf1":[true,true,false,true],"hsa-p1-short1":"12","hsa-p1-short2":"24"}'::jsonb);
 perform public.mtm_exam_submit(a[3],tk[3],'{"hsa-p1-mc1":"B","hsa-p1-tf1":[true,true,false,false],"hsa-p1-short1":"12"}'::jsonb);
 perform public.mtm_exam_submit(a[4],tk[4],'{}'::jsonb);
 perform public.mtm_exam_submit(a[5],tk[5],'{}'::jsonb);
 perform public.mtm_exam_submit(a[6],tk[6],'{}'::jsonb);
 update mtm_exam_private.attempts set started_at=submitted_at-interval '20 minutes' where id=a[1];
 update mtm_exam_private.attempts set started_at=submitted_at-interval '10 minutes' where id=a[3];
 update mtm_exam_private.attempts set started_at=submitted_at-interval '15 minutes' where id in(a[2],a[4]);
 update mtm_exam_private.attempts set started_at=submitted_at-interval '30 seconds' where id=a[6];
 update mtm_exam_private.attempts set started_at=submitted_at-interval '40 minutes',deadline=submitted_at-interval '15 minutes' where id=a[5];
 r=public.mtm_hsa_rank_submit(ex,a[1],tk[1],'Học sinh GIẢ A','hoc sinh gia a','12',dev[1]);
 if r->>'status'<>'accepted' or (r->>'score')::int<>5500 or (r->>'rank')::int<>1 or (r->>'seconds')::int<>1200 then raise exception 'HSA_QA_069_ACCEPT %',r;end if;
 insert into hsa_qa069_results values('Điểm và thời gian lấy từ lượt máy chủ đã chấm',true);
 if public.mtm_hsa_rank_submit(ex,a[1],tk[1],'Học sinh GIẢ A','hoc sinh gia a','12',dev[1])->>'status'<>'already' then raise exception 'HSA_QA_069_IDEMPOTENT';end if;
 begin perform public.mtm_hsa_rank_submit(ex,a[2],tk[1],'Học sinh GIẢ B','hoc sinh gia b','11',dev[2]);raise exception 'HSA_QA_069_TOKEN';
 exception when insufficient_privilege then null;end;
 if public.mtm_hsa_rank_submit('mtm-g11-gk1-2024-2025-code101',a[2],tk[2],'Học sinh GIẢ B','hoc sinh gia b','11',dev[2])->>'status'<>'closed' then raise exception 'HSA_QA_069_CLOSED2';end if;
 insert into hsa_qa069_results values('Token sai bị chặn, đề không mở xếp hạng trả closed',true);
 if public.mtm_hsa_rank_submit(ex,a[2],tk[2],'Học sinh GIẢ B','hoc sinh gia b','11',dev[2])->>'status'<>'accepted' then raise exception 'HSA_QA_069_B';end if;
 if public.mtm_hsa_rank_submit(ex,a[4],tk[4],'Học sinh GIẢ D','hoc sinh gia d','10',dev[2])->>'status'<>'device' then raise exception 'HSA_QA_069_DEVICE';end if;
 if public.mtm_hsa_rank_submit(ex,a[3],tk[3],'Hoc Sinh Gia A','hoc sinh gia a','khac',dev[3])->>'status'<>'name' then raise exception 'HSA_QA_069_NAME';end if;
 if public.mtm_hsa_rank_submit(ex,a[5],tk[5],'Học sinh GIẢ E','hoc sinh gia e','12',dev[5])->>'status'<>'late' then raise exception 'HSA_QA_069_LATE';end if;
 if public.mtm_hsa_rank_submit(ex,a[6],tk[6],'Học sinh GIẢ F','hoc sinh gia f','12',dev[6])->>'status'<>'fast' then raise exception 'HSA_QA_069_FAST';end if;
 insert into hsa_qa069_results values('Chỉ lượt đầu mỗi thiết bị và mỗi tên; nộp quá hạn hoặc quá nhanh không tính',true);
 r=public.mtm_hsa_rank_submit(ex,a[3],tk[3],'Học sinh GIẢ C','hoc sinh gia c','khac',dev[3]);
 if r->>'status'<>'accepted' or (r->>'rank')::int<>2 then raise exception 'HSA_QA_069_ORDER %',r;end if;
 top=public.mtm_hsa_rank_top(ex,50);
 if not (top->>'open')::boolean or jsonb_array_length(top->'rows')<>3
  or top->'rows'->0->>'name'<>'Học sinh GIẢ B' or top->'rows'->1->>'name'<>'Học sinh GIẢ C' or top->'rows'->2->>'name'<>'Học sinh GIẢ A'
  or (top->'rows'->1->>'seconds')::int<>600 or top->'rows'->0 ?| array['attempt_id','device_hash','name_key','phone'] then raise exception 'HSA_QA_069_TOP %',top;end if;
 insert into hsa_qa069_results values('Top: điểm giảm dần, cùng điểm thì ít thời gian hơn đứng trên; không lộ trường riêng',true);
 update mtm_hsa_rank.entries set hidden=true where attempt_id=a[2];
 top=public.mtm_hsa_rank_top(ex,1);
 if jsonb_array_length(top->'rows')<>1 or top->'rows'->0->>'name'<>'Học sinh GIẢ C' then raise exception 'HSA_QA_069_HIDDEN %',top;end if;
 if (public.mtm_hsa_rank_top('khong-co',5)->>'open')::boolean then raise exception 'HSA_QA_069_UNKNOWN';end if;
 insert into hsa_qa069_results values('Dòng ẩn bị loại, giới hạn top N, đề lạ không mở',true);
 begin insert into mtm_hsa_rank.entries(attempt_id,exam_id,display_name,name_key,grade,device_hash,score_millipoints,elapsed_ms,submitted_at)
  values(a[4],ex,'xem www.spam.vn','xem www spam vn','12',dev[4],10000,1,now());raise exception 'HSA_QA_069_CHECK';
 exception when check_violation then null;end;
 insert into hsa_qa069_results values('Bảng tự chặn tên có đường dẫn',true);
end $qa$;
select name,passed from hsa_qa069_results order by name;
