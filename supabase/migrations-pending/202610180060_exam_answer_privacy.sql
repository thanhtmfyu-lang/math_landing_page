-- M4: preserve the full immutable exam privately; expose questions only.
-- Apply this file only after its transaction-rollback rehearsal has passed.
begin;

create schema mtm_exam_private;
revoke all on schema mtm_exam_private from public,anon,authenticated,service_role;
create table mtm_exam_private.exam_keys(
 id text primary key,
 exam jsonb not null check(jsonb_typeof(exam)='object'),
 question_path text,
 solution_path text,
 static_visible boolean not null default false
);
create table mtm_exam_private.attempts(
 id uuid primary key default gen_random_uuid(),
 version_id text not null references mtm_exam_private.exam_keys(id),
 token_hash bytea not null check(octet_length(token_hash)=32),
 started_at timestamptz not null default clock_timestamp(),
 deadline timestamptz not null,
 submitted_at timestamptz,
 answers jsonb not null default '{}'::jsonb,
 score jsonb,
 check(deadline>started_at),
 check((submitted_at is null and score is null) or (submitted_at is not null and score is not null))
);
revoke all on all tables in schema mtm_exam_private from public,anon,authenticated,service_role;

create function mtm_exam_private.remove_fields(j jsonb,deny text[]) returns jsonb
language plpgsql immutable set search_path='' as $$
declare out_json jsonb;
begin
 if jsonb_typeof(j)='object' then
  select coalesce(jsonb_object_agg(k,mtm_exam_private.remove_fields(v,deny)),'{}'::jsonb)
  into out_json from jsonb_each(j) x(k,v) where not(k=any(deny));
 elsif jsonb_typeof(j)='array' then
  select coalesce(jsonb_agg(mtm_exam_private.remove_fields(x.value,deny) order by x.ordinality),'[]'::jsonb)
  into out_json from jsonb_array_elements(j) with ordinality x;
 else out_json=j;end if;
 return out_json;
end $$;

create function mtm_exam_private.segments(j jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg((select coalesce(jsonb_object_agg(k,v),'{}'::jsonb)
  from jsonb_each(x.value) s(k,v) where k=any(array[
   'path','width','height','sha256','sourcePage','mtmAuthored','privateUrl','privateUnavailable']))
  order by x.ordinality),'[]'::jsonb)
 from jsonb_array_elements(j) with ordinality x;
$$;

-- A positive field list also removes unexpected nested key/source metadata.
create function mtm_exam_private.question(q jsonb,p_review boolean default false)
returns jsonb language plpgsql immutable set search_path='' as $$
declare r jsonb;
begin
 select coalesce(jsonb_object_agg(k,v),'{}'::jsonb) into r
 from jsonb_each(q) x(k,v) where k=any(array[
  'id','kind','sourceRef','maxMillipoints','maxPoints','choices','pointsByCorrectCount',
  'mode','prompt','text','statements','sourcePdfPage','shortFormat','convertedFrom']);
 if jsonb_typeof(q->'sourceContent'->'questions')='array' then
  r=r||jsonb_build_object('sourceContent',jsonb_build_object('questions',mtm_exam_private.segments(q->'sourceContent'->'questions')));
 end if;
 if p_review then
  r=r||(select coalesce(jsonb_object_agg(k,v),'{}'::jsonb) from jsonb_each(q) x(k,v)
    where k=any(array['answer','acceptedAnswers','solution','solutionBlocks','answerVerified','answerConflict','shortRule','issues','correctionNote']));
  if jsonb_typeof(q->'sourceContent'->'solutions')='array' then
   r=jsonb_set(r,'{sourceContent}',coalesce(r->'sourceContent','{}'::jsonb)||jsonb_build_object('solutions',mtm_exam_private.segments(q->'sourceContent'->'solutions')));
  end if;
 end if;
 r=jsonb_set(r,'{sourceRef}',to_jsonb(regexp_replace(coalesce(q->>'sourceRef','Câu hỏi MTM'),'https?://[^[:space:]]+','','gi')));
 return mtm_exam_private.remove_fields(r,case when p_review then array['sourceUrl','solution_path']
  else array['sourceUrl','answer','acceptedAnswers','solution','solutions','solutionPdf','solution_path',
   'answerVerificationNote','shortRule','evidence','verificationEvidence'] end);
end $$;

create function mtm_exam_private.public_exam(e jsonb,p_review boolean default false)
returns jsonb language plpgsql immutable set search_path='' as $$
declare r jsonb;
begin
 select coalesce(jsonb_object_agg(k,v),'{}'::jsonb) into r from jsonb_each(e) x(k,v)
 where k=any(array['id','title','grade','period','durationMinutes','versionHash','rubricVersion',
  'answerKeyVersion','sourceHash','questionCount','answerKeyVerified','rubricVerified',
  'publicationVerified','questionDisplayVerified','sourceComplete','sections','preAttemptNotice',
  'sourcePdf','sourceInstructions','assetWarnings']);
 r=r||jsonb_build_object('serverGraded',true,'sourceRef','MTM sưu tầm và biên soạn',
  'sourceMaterial',jsonb_build_object('title','MTM sưu tầm và biên soạn',
    'publisher','MTM sưu tầm và biên soạn','version','Bản đề MTM','locator','Bản đề MTM'),
  'questions',(select coalesce(jsonb_agg(mtm_exam_private.question(q.value,p_review) order by q.ordinality),'[]'::jsonb)
    from jsonb_array_elements(e->'questions') with ordinality q));
 if jsonb_typeof(e->'sourcePdf')='object' then
  r=jsonb_set(r,'{sourcePdf}',(select coalesce(jsonb_object_agg(k,v),'{}'::jsonb)
   from jsonb_each(e->'sourcePdf') s(k,v) where k=any(array['url','verified','sha256','bytes','totalPages','questionPages'])));
 end if;
 if jsonb_typeof(e->'sourceInstructions')='array' then
  r=jsonb_set(r,'{sourceInstructions}',mtm_exam_private.segments(e->'sourceInstructions'));
 end if;
 if p_review then
  if jsonb_typeof(e->'solutionInstructions')='array' then r=r||jsonb_build_object('solutionInstructions',mtm_exam_private.segments(e->'solutionInstructions'));end if;
 else r=r||jsonb_build_object('responseMode','questions-only');end if;
 -- Only a verified questions PDF may be exposed in document metadata.
 if jsonb_typeof(e->'mtmDocuments'->'questions')='object' then
  r=r||jsonb_build_object('mtmDocuments',jsonb_build_object('questions',e->'mtmDocuments'->'questions'));
 end if;
 return mtm_exam_private.remove_fields(r,case when p_review then array['sourceUrl','solution_path']
  else array['sourceUrl','answer','acceptedAnswers','solution','solutions','solutionPdf','solution_path',
   'answerVerificationNote','shortRule','evidence','verificationEvidence'] end);
end $$;

-- Backfill occurs before sanitizing any public rows, retaining the complete source.
insert into mtm_exam_private.exam_keys(id,exam,question_path,solution_path)
select id,exam,question_path,solution_path from public.mtm_exam_versions;
update public.mtm_exam_versions set exam=mtm_exam_private.public_exam(exam),solution_path=null;

create function mtm_exam_private.capture_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into mtm_exam_private.exam_keys(id,exam,question_path,solution_path)
 values(new.id,new.exam,new.question_path,new.solution_path) on conflict(id) do nothing;
 new.exam=mtm_exam_private.public_exam(new.exam);new.solution_path=null;
 return new;
end $$;
create trigger mtm_capture_exam_key before insert on public.mtm_exam_versions
for each row execute function mtm_exam_private.capture_version();

drop policy mtm_version_read on public.mtm_exam_versions;
drop policy mtm_publication_read on public.mtm_exam_publications;
create policy mtm_publication_visible on public.mtm_exam_publications for select to anon,authenticated
using(visible);
create policy mtm_publication_owner on public.mtm_exam_publications for select to authenticated
using(exists(select 1 from public.mtm_exam_drafts d where d.id=mtm_exam_publications.draft_id and d.owner_id=(select auth.uid())));
create policy mtm_version_visible on public.mtm_exam_versions for select to anon,authenticated
using(exists(select 1 from public.mtm_exam_publications p where p.version_id=mtm_exam_versions.id and p.visible));
create policy mtm_version_owner on public.mtm_exam_versions for select to authenticated
using(owner_id=(select auth.uid()) and public.mtm_is_exam_admin());

-- Authenticated admins retain their existing staging read. Students can only
-- read questions belonging to the current visible publication, never solutions.
drop policy mtm_pdf_published_read on storage.objects;
create policy mtm_pdf_published_questions_read on storage.objects for select to anon,authenticated
using(bucket_id='mtm-exams' and exists(select 1 from public.mtm_exam_versions v
 join public.mtm_exam_publications p on p.version_id=v.id
 where p.visible and v.question_path=storage.objects.name));
update storage.buckets set public=false where id='mtm-exams';

create function mtm_exam_private.attempt(p_attempt uuid,p_token text)
returns mtm_exam_private.attempts language plpgsql stable set search_path='' as $$
declare t mtm_exam_private.attempts;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Attempt unavailable' using errcode='42501';end if;
 select * into t from mtm_exam_private.attempts where id=p_attempt and token_hash=sha256(convert_to(p_token,'UTF8'));
 if not found then raise exception 'Attempt unavailable' using errcode='42501';end if;
 return t;
end $$;

-- Reuse the reviewed, exact decimal/rational matcher without modifying BTVN.
create function mtm_exam_private.grade(e jsonb,a jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare q jsonb;v jsonb;rows jsonb='[]';earned integer;total integer=0;cap integer;
 correct_n integer;i integer;k text;blank boolean;
begin
 if not mtm_hw_private.answers_valid(e,a) then raise exception 'Answers invalid' using errcode='22023';end if;
 for q in select value from jsonb_array_elements(e->'questions') loop
  v=a->(q->>'id');cap=(q->>'maxMillipoints')::integer;earned=0;
  blank=v is null or v='null'::jsonb or (jsonb_typeof(v)='string' and mtm_hw_private.js_trim(v#>>'{}')='');
  if not blank then
   if q->>'kind'='mc' then if v=q->'answer' then earned=cap;end if;
   elsif q->>'kind'='tf' then
    correct_n=0;for i in 0..3 loop if v->i=q->'answer'->i then correct_n=correct_n+1;end if;end loop;
    earned=(q->'pointsByCorrectCount'->>correct_n)::integer;
   else
    for k in select jsonb_array_elements_text(q->'acceptedAnswers') loop
     if mtm_hw_private.short_matches(q->>'mode',v#>>'{}',k) then earned=cap;exit;end if;
    end loop;
   end if;
  end if;
  total=total+earned;
  rows=rows||jsonb_build_array(jsonb_build_object('id',q->>'id','earnedMillipoints',earned,'maxMillipoints',cap));
 end loop;
 return jsonb_build_object('ok',true,'earnedMillipoints',total,'maxMillipoints',10000,
   'finalMillipoints',total,'manualPending','[]'::jsonb,'rows',rows);
end $$;

create function mtm_exam_private.result(t mtm_exam_private.attempts) returns jsonb
language plpgsql stable set search_path='' as $$
declare e jsonb;
begin
 if t.submitted_at is null then raise exception 'Submit before viewing answers' using errcode='42501';end if;
 select exam into e from mtm_exam_private.exam_keys where id=t.version_id;
 return jsonb_build_object('attemptId',t.id,'answers',t.answers,'score',t.score,
  'exam',mtm_exam_private.public_exam(e,true),'startedAt',floor(extract(epoch from t.started_at)*1000),
  'deadline',floor(extract(epoch from t.deadline)*1000),'submittedAt',floor(extract(epoch from t.submitted_at)*1000),
  'elapsedMs',greatest(0,floor(extract(epoch from(least(t.submitted_at,t.deadline)-t.started_at))*1000)),
  'serverNow',floor(extract(epoch from clock_timestamp())*1000));
end $$;

create function public.mtm_exam_start(p_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e mtm_exam_private.exam_keys;t mtm_exam_private.attempts;token text;
 started timestamptz=clock_timestamp();minutes integer;
begin
 select * into e from mtm_exam_private.exam_keys k where k.id=p_version and
 (k.static_visible or exists(select 1 from public.mtm_exam_publications p where p.version_id=k.id and p.visible));
 if not found then raise exception 'Exam unavailable' using errcode='42501';end if;
 if coalesce(e.exam->>'rubricVersion','') not in('MTM-THPT-3PART-2025-v1','MTM-12MC-4TF-6SHORT-v1','MTM-FLEX-10-v1')
   or exists(select 1 from jsonb_array_elements(e.exam->'questions') q
    where q->>'kind' not in('mc','tf','short') or (q->>'maxMillipoints')::numeric<>trunc((q->>'maxMillipoints')::numeric))
   or (select sum((q->>'maxMillipoints')::integer) from jsonb_array_elements(e.exam->'questions') q)<>10000 then
  raise exception 'Exam grading profile unavailable' using errcode='22023';end if;
 minutes=(e.exam->>'durationMinutes')::integer;
 if minutes not between 1 and 1440 then raise exception 'Exam duration invalid' using errcode='22023';end if;
 token=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into mtm_exam_private.attempts(version_id,token_hash,started_at,deadline)
 values(e.id,sha256(convert_to(token,'UTF8')),started,started+make_interval(mins=>minutes)) returning * into t;
 return jsonb_build_object('attemptId',t.id,'attemptToken',token,'exam',mtm_exam_private.public_exam(e.exam),
  'startedAt',floor(extract(epoch from t.started_at)*1000),'deadline',floor(extract(epoch from t.deadline)*1000),
  'serverNow',floor(extract(epoch from clock_timestamp())*1000));
end $$;

create function public.mtm_exam_submit(p_attempt uuid,p_token text,p_answers jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t mtm_exam_private.attempts;e jsonb;
begin
 t=mtm_exam_private.attempt(p_attempt,p_token);
 select * into t from mtm_exam_private.attempts where id=t.id for update;
 if t.submitted_at is not null then return mtm_exam_private.result(t);end if;
 select exam into e from mtm_exam_private.exam_keys where id=t.version_id;
 update mtm_exam_private.attempts set answers=p_answers,score=mtm_exam_private.grade(e,p_answers),
 submitted_at=clock_timestamp() where id=t.id returning * into t;
 return mtm_exam_private.result(t);
end $$;

create function public.mtm_exam_result(p_attempt uuid,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin return mtm_exam_private.result(mtm_exam_private.attempt(p_attempt,p_token));end $$;

-- Transport calls this RPC with service_role, then signs the returned object for
-- a short lifetime. A caller cannot nominate an arbitrary path or exam version.
create function public.mtm_exam_pdf_access(p_attempt uuid,p_token text,p_kind text default 'solutions') returns jsonb
language plpgsql security definer set search_path='' as $$
declare t mtm_exam_private.attempts;k mtm_exam_private.exam_keys;path text;
begin
 if p_kind is null or p_kind not in('questions','solutions') then raise exception 'PDF kind invalid' using errcode='22023';end if;
 t=mtm_exam_private.attempt(p_attempt,p_token);
 if p_kind='solutions' and t.submitted_at is null then raise exception 'Submit before viewing solutions' using errcode='42501';end if;
 select * into k from mtm_exam_private.exam_keys where id=t.version_id;
 path=case when p_kind='questions' then k.question_path else k.solution_path end;
 if path is null then return jsonb_build_object('kind',p_kind,'attemptId',t.id,'bucket','mtm-exams','path',null);end if;
 return jsonb_build_object('kind',p_kind,'attemptId',t.id,'bucket','mtm-exams','path',path);
end $$;

do $$ declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='mtm_exam_private' or(n.nspname='public' and p.proname in('mtm_exam_start','mtm_exam_submit','mtm_exam_result','mtm_exam_pdf_access')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 end loop;
end $$;
grant execute on function public.mtm_exam_start(text),public.mtm_exam_submit(uuid,text,jsonb),
 public.mtm_exam_result(uuid,text) to anon,authenticated,service_role;
grant execute on function public.mtm_exam_pdf_access(uuid,text,text) to service_role;
commit;
