-- Run only inside a transaction that is rolled back. All fixtures are synthetic.
-- Rehearsal: BEGIN; migration body without its BEGIN/COMMIT; this file; ROLLBACK.
do $$
declare owner_id uuid=gen_random_uuid();draft_id uuid=gen_random_uuid();
 exam_id text='mtm-security-fixture-'||gen_random_uuid()::text;
 hidden_id text='mtm-security-hidden-'||gen_random_uuid()::text;
 e jsonb;t jsonb;r jsonb;failed boolean;
begin
 insert into auth.users(id) values(owner_id);
 insert into public.mtm_exam_drafts(id,owner_id,payload) values(draft_id,owner_id,'{}');
 e=jsonb_build_object('id',exam_id,'title','Kiểm thử bảo mật tổng hợp','grade',12,'period','GK1',
  'durationMinutes',60,'versionHash',repeat('1',64),'sourceHash',repeat('2',64),
  'rubricVersion','MTM-FLEX-10-v1','questionCount',3,'sourceRef','PRIVATE SOURCE',
  'sourceUrl','https://private-source.invalid/answer','answerVerificationNote','PRIVATE EVIDENCE',
  'sourceMaterial',jsonb_build_object('title','PRIVATE ORIGINAL','publisher','PRIVATE PUBLISHER'),
  'questions',jsonb_build_array(
   jsonb_build_object('id','q1','kind','mc','sourceRef','Câu 1','prompt','Chọn A.',
    'maxMillipoints',3000,'choices',jsonb_build_array('A','B','C','D'),'answer','A','solution','PRIVATE MC SOLUTION'),
   jsonb_build_object('id','q2','kind','tf','sourceRef','Câu 2','prompt','Bốn ý.',
    'maxMillipoints',4000,'answer',jsonb_build_array(true,false,true,false),
    'pointsByCorrectCount',jsonb_build_array(0,400,1000,2000,4000),'solution','PRIVATE TF SOLUTION'),
   jsonb_build_object('id','q3','kind','short','sourceRef','Câu 3','prompt','Nhập 1/2.',
    'maxMillipoints',3000,'mode','rational','acceptedAnswers',jsonb_build_array('1/2'),'solution','PRIVATE SHORT SOLUTION')));
 insert into public.mtm_exam_versions(id,draft_id,owner_id,exam,question_path,solution_path)
 values(exam_id,draft_id,owner_id,e,'security-fixture/questions.pdf','security-fixture/solutions.pdf');
 insert into public.mtm_exam_publications(draft_id,version_id,visible) values(draft_id,exam_id,true);
 insert into storage.objects(bucket_id,name,metadata) values
 ('mtm-exams','security-fixture/questions.pdf','{"mimetype":"application/pdf","size":8}'),
 ('mtm-exams','security-fixture/solutions.pdf','{"mimetype":"application/pdf","size":8}');
 if (select exam::text~'PRIVATE|sourceUrl|acceptedAnswers|"answer"|"solution"' or solution_path is not null
  from public.mtm_exam_versions where id=exam_id) then raise exception 'Public key/source redaction failed';end if;
 if (select exam->>'sourceUrl' from mtm_exam_private.exam_keys where id=exam_id) is distinct from 'https://private-source.invalid/answer'
  then raise exception 'Private source preservation failed';end if;
 insert into mtm_exam_private.exam_keys(id,exam,static_visible) values(hidden_id,e,false);
 failed=false;begin perform public.mtm_exam_start(hidden_id);exception when insufficient_privilege then failed=true;end;
 if not failed then raise exception 'Hidden exam start was accepted';end if;
 t=public.mtm_exam_start(exam_id);
 if t->'exam'->>'responseMode' is distinct from 'questions-only' or t->'exam'->>'serverGraded' is distinct from 'true'
  or (t->'exam')::text~'PRIVATE|sourceUrl|acceptedAnswers|"answer"|"solution"' then
  raise exception 'Start leaked private key/source';end if;
 failed=false;begin perform public.mtm_exam_result((t->>'attemptId')::uuid,t->>'attemptToken');exception when insufficient_privilege then failed=true;end;
 if not failed then raise exception 'Review before submit was accepted';end if;
 failed=false;begin perform public.mtm_exam_pdf_access((t->>'attemptId')::uuid,t->>'attemptToken','solutions');exception when insufficient_privilege then failed=true;end;
 if not failed then raise exception 'Solution PDF before submit was accepted';end if;
 failed=false;begin perform public.mtm_exam_submit((t->>'attemptId')::uuid,repeat('0',64),'{}');exception when insufficient_privilege then failed=true;end;
 if not failed then raise exception 'Wrong attempt capability was accepted';end if;
 failed=false;begin perform public.mtm_exam_submit((t->>'attemptId')::uuid,t->>'attemptToken','{"unknown":"A"}');exception when invalid_parameter_value then failed=true;end;
 if not failed then raise exception 'Unknown answer id was accepted';end if;
 r=public.mtm_exam_submit((t->>'attemptId')::uuid,t->>'attemptToken','{"q1":"A","q2":[true,false,true,false],"q3":"0,5"}');
 if r->'score'->>'earnedMillipoints' is distinct from '10000' or r->'exam'->'questions'->0->>'answer' is distinct from 'A'
  or r->'exam' ? 'responseMode' or (r->'exam')::text~'sourceUrl|PRIVATE ORIGINAL|PRIVATE PUBLISHER' then
  raise exception 'Server grade/review failed';end if;
 if public.mtm_exam_submit((t->>'attemptId')::uuid,t->>'attemptToken','{}')->'score' is distinct from r->'score'
  then raise exception 'Submitted answers were overwritten';end if;
 if public.mtm_exam_pdf_access((t->>'attemptId')::uuid,t->>'attemptToken','solutions')->>'path' is distinct from 'security-fixture/solutions.pdf'
  then raise exception 'Post-submission PDF mapping failed';end if;
 t=public.mtm_exam_start(exam_id);
 r=public.mtm_exam_submit((t->>'attemptId')::uuid,t->>'attemptToken','{"q1":"B","q2":[true,false,false,true],"q3":"-1/-2"}');
 if r->'score'->>'earnedMillipoints' is distinct from '4000' then raise exception 'Exact rational/partial TF grading failed';end if;
 t=public.mtm_exam_start(exam_id);
 r=public.mtm_exam_submit((t->>'attemptId')::uuid,t->>'attemptToken','{"q1":"A","q3":"sqrt(2)"}');
 if r->'score'->>'earnedMillipoints' is distinct from '3000' then raise exception 'Malformed short answer must earn zero';end if;
 if has_schema_privilege('anon','mtm_exam_private','USAGE') or has_table_privilege('anon','mtm_exam_private.exam_keys','SELECT')
  or has_function_privilege('anon','public.mtm_exam_pdf_access(uuid,text,text)','EXECUTE') then
  raise exception 'Anonymous private/PDF privileges detected';end if;
 -- RLS applies to both direct tables and the existing list RPC.
 perform set_config('role','anon',true);
 if not exists(select 1 from public.mtm_exam_versions where id=exam_id) then raise exception 'Visible exam missing for anon';end if;
 if not exists(select 1 from storage.objects where bucket_id='mtm-exams' and name='security-fixture/questions.pdf')
  or exists(select 1 from storage.objects where bucket_id='mtm-exams' and name='security-fixture/solutions.pdf') then
  raise exception 'Anonymous question/solution Storage access incorrect';end if;
 perform set_config('role','none',true);
 update public.mtm_exam_publications set visible=false where version_id=exam_id;
 perform set_config('role','anon',true);
 if exists(select 1 from public.mtm_exam_versions where id=exam_id) then raise exception 'Hidden version readable by anon';end if;
 if exists(select 1 from storage.objects where bucket_id='mtm-exams' and name='security-fixture/questions.pdf') then
  raise exception 'Hidden question PDF readable by anon';end if;
 perform set_config('role','none',true);
 raise notice 'M4 SQL synthetic assertions passed; rollback required.';
end $$;
