-- Staff can read the student-facing questions of an exact published upload.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

create function mtm_hw_private.lesson_preview_scalars120(p_value jsonb,p_keys text[]) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
 from jsonb_each(case when jsonb_typeof(p_value)='object' then p_value else '{}'::jsonb end)
 where key=any(p_keys) and jsonb_typeof(value) in ('string','number','boolean')
$$;

create function mtm_hw_private.lesson_preview_array120(p_value jsonb,p_element_type text) returns jsonb
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(p_value)='array' then
  case when not exists(select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e)<>p_element_type)
   then p_value end
 end
$$;

create function mtm_hw_private.lesson_preview_crops120(p_segments jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(mtm_hw_private.lesson_preview_scalars120(crop,array[
  'path','sha256','width','height','sourcePage','mtmAuthored'
 ]) order by position),'[]'::jsonb)
 from jsonb_array_elements(case when jsonb_typeof(p_segments)='array' then p_segments else '[]'::jsonb end)
      with ordinality s(crop,position)
 where length(crop->>'path')<=300 and crop->>'path' ~ '^[a-zA-Z0-9][a-zA-Z0-9_/-]*\.png$'
   and crop->>'path' not like '%//%'
   and crop->>'sha256' ~ '^[0-9a-f]{64}$'
$$;

create function public.mtm_lesson_published_preview(p_upload_id uuid,p_class_id uuid,p_paper integer,p_is_test boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare staff public.mtm_staff;
 u mtm_hw_private.lesson_uploads;
 scoped_upload mtm_hw_private.lesson_uploads;
 lesson mtm_hw_private.btvn_lessons;
 second mtm_hw_private.btvn_second_papers;
 class_label text;
 receipt jsonb;
 lesson_code text;
 source_version text;
 source_exam jsonb;
 source_assets jsonb;
 preview jsonb;
 questions jsonb;
 sections jsonb;
 question_pdf jsonb;
 question_document jsonb;
 question_assets jsonb;
begin
 if p_upload_id is null or p_class_id is null or p_paper is null or p_paper not in (1,2) or p_is_test is null then
  raise exception 'STAFF_PREVIEW_INVALID_REQUEST' using errcode='22023';
 end if;
 select s.* into staff from public.mtm_staff s where s.user_id=auth.uid() and s.active and not s.must_change_password;
 if not found or staff.role not in ('gv','ql','admin') or (p_is_test and staff.role='gv') then
  raise exception 'STAFF_PREVIEW_FORBIDDEN' using errcode='42501';
 end if;
 select x.* into u from mtm_hw_private.lesson_uploads x
 where x.id=p_upload_id and x.is_test=p_is_test and p_class_id=any(x.class_ids)
   and (staff.role in ('ql','admin') or x.teacher_key=staff.teacher_key);
 if not found then raise exception 'STAFF_PREVIEW_FORBIDDEN' using errcode='42501';end if;
 select c.label into class_label from mtm_hw_private.classes c where c.id=p_class_id and c.active and c.is_test=p_is_test;
 if not found then raise exception 'STAFF_PREVIEW_FORBIDDEN' using errcode='42501';end if;

 -- A newer upload can replace just one class of a shared homework edition.
 -- Check its lane for this class before confirming the active canonical row.
 scoped_upload:=u;
 scoped_upload.class_ids:=array[p_class_id];
 if not mtm_hw_private.lesson_upload_current(scoped_upload)
  or not exists(select 1 from mtm_hw_private.lesson_upload_steps s where s.upload_id=u.id and s.step=6 and s.status='xong')
  or (u.homework2_path is not null and not exists(select 1 from mtm_hw_private.lesson_upload_paper2_steps s
      where s.upload_id=u.id and s.step=6 and s.status='xong'))
  or (p_paper=2 and (u.work_kind<>'homework' or u.homework2_path is null)) then
  raise exception 'STAFF_PREVIEW_NOT_PUBLISHED' using errcode='P0002';
 end if;

 receipt:=u.checkpoint->'publish_receipts'->(p_class_id::text);
 lesson_code:=receipt->>'lesson_code';
 if lesson_code is null or lesson_code !~ '^[a-z0-9][a-z0-9-]{0,159}$' or
  (u.homework_path is not null and
   (lesson_code<>'web-'||replace(u.id::text,'-','') or coalesce(receipt->'receipt'->>'status','') not in ('da_dang','already_published')))
  or (u.homework_path is null and (u.work_kind<>'homework' or receipt->'receipt'->>'status' is distinct from 'updated')) then
  raise exception 'STAFF_PREVIEW_NOT_PUBLISHED' using errcode='P0002';
 end if;
 select l.* into lesson from mtm_hw_private.btvn_lessons l
 where l.code=lesson_code and l.active and l.publish_status='da_dang' and l.is_test=p_is_test and p_class_id=any(l.class_ids)
   and ((u.work_kind='exam' and l.kind='kiem-tra' and l.assessment_id=u.assessment_id)
     or (u.work_kind='homework' and l.kind='btvn'))
   and coalesce(l.material->'classDates'->>coalesce(u.class_names->>(p_class_id::text),class_label),l.material->>'date')
      =coalesce(u.class_dates->>(p_class_id::text),u.lesson_date::text);
 if not found then raise exception 'STAFF_PREVIEW_NOT_PUBLISHED' using errcode='P0002';end if;

 if u.homework2_path is not null then
  select p.* into second from mtm_hw_private.btvn_second_papers p where p.lesson_code=lesson.code;
  if not found then raise exception 'STAFF_PREVIEW_NOT_PUBLISHED' using errcode='P0002';end if;
 end if;
 if p_paper=2 then
  source_exam:=second.exam;source_assets:=second.assets;source_version:=second.source_version;
 else
  source_exam:=lesson.exam;source_assets:=lesson.assets;source_version:=lesson.source_version;
 end if;
 if source_version is null or source_version !~ '^[0-9a-f]{64}$'
  or jsonb_typeof(source_exam->'questions') is distinct from 'array' then
  raise exception 'STAFF_PREVIEW_NOT_PUBLISHED' using errcode='P0002';
 end if;
 if jsonb_array_length(source_exam->'questions') not between 1 and 300 then
  raise exception 'STAFF_PREVIEW_NOT_PUBLISHED' using errcode='P0002';
 end if;

 select jsonb_agg(
  mtm_hw_private.lesson_preview_scalars120(q,array[
    'id','kind','sourceRef','prompt','text','sourcePdfPage','maxMillipoints','mode','convertedFrom'
  ]) || jsonb_strip_nulls(jsonb_build_object(
    'choices',mtm_hw_private.lesson_preview_array120(q->'choices','string'),
    'statements',mtm_hw_private.lesson_preview_array120(q->'statements','string'),
    'pointsByCorrectCount',mtm_hw_private.lesson_preview_array120(q->'pointsByCorrectCount','number'),
    'maxPoints',case when jsonb_typeof(q->'maxPoints')='object'
      then mtm_hw_private.lesson_preview_scalars120(q->'maxPoints',array['numerator','denominator']) end,
    'sourceContent',case when crops<>'[]'::jsonb then jsonb_build_object('questions',crops) end
  )) order by position)
 into questions from jsonb_array_elements(source_exam->'questions') with ordinality src(q,position)
 cross join lateral (select mtm_hw_private.lesson_preview_crops120(q->'sourceContent'->'questions') crops) image;

 preview:=mtm_hw_private.lesson_preview_scalars120(source_exam,array[
  'id','title','grade','period','durationMinutes','questionCount','versionHash','rubricVersion','sourceHash','sourceRef',
  'publicationVerified','questionDisplayVerified','rubricVerified','answerKeyVerified','answerKeyVersion','sourceComplete'
 ]) || jsonb_build_object('responseMode','questions-only','questions',questions);
 if jsonb_typeof(source_exam->'sections')='array' then
  select jsonb_agg(mtm_hw_private.lesson_preview_scalars120(s,array['label','kind','count']) order by position)
  into sections from jsonb_array_elements(source_exam->'sections') with ordinality src(s,position);
  if sections is not null then preview:=preview||jsonb_build_object('sections',sections);end if;
 end if;
 if jsonb_typeof(source_exam->'sourceMaterial')='object' then
  preview:=preview||jsonb_build_object('sourceMaterial',
   mtm_hw_private.lesson_preview_scalars120(source_exam->'sourceMaterial',array['title','publisher','version','locator']));
 end if;
 preview:=preview||jsonb_build_object('sourceInstructions',mtm_hw_private.lesson_preview_crops120(source_exam->'sourceInstructions'));

 question_pdf:=source_exam->'sourcePdf';
 if question_pdf->'verified'='true'::jsonb and question_pdf->>'sha256' ~ '^[0-9a-f]{64}$'
  and question_pdf->>'url'='/exam-assets/'||(question_pdf->>'sha256')||'.pdf' then
  preview:=preview||jsonb_build_object('sourcePdf',
   mtm_hw_private.lesson_preview_scalars120(question_pdf,array['url','sha256','bytes','totalPages','verified'])
   ||jsonb_strip_nulls(jsonb_build_object('questionPages',mtm_hw_private.lesson_preview_array120(question_pdf->'questionPages','number'))));
 end if;
 question_document:=source_exam->'mtmDocuments'->'questions';
 if question_document->>'sha256' ~ '^[0-9a-f]{64}$'
  and question_document->>'url'='/exam-assets/'||(question_document->>'sha256')||'.pdf' then
  preview:=preview||jsonb_build_object('mtmDocuments',jsonb_build_object('questions',
   mtm_hw_private.lesson_preview_scalars120(question_document,array['url','sha256'])));
 end if;

 with refs(path,digest) as (
  select crop->>'path',crop->>'sha256' from jsonb_array_elements(preview->'sourceInstructions') crop
  union
  select crop->>'path',crop->>'sha256' from jsonb_array_elements(questions) q
  cross join lateral jsonb_array_elements(coalesce(q->'sourceContent'->'questions','[]'::jsonb)) crop
  union
  select ltrim(preview->'sourcePdf'->>'url','/'),preview->'sourcePdf'->>'sha256'
  union
  select ltrim(preview->'mtmDocuments'->'questions'->>'url','/'),preview->'mtmDocuments'->'questions'->>'sha256'
 )
 select coalesce(jsonb_agg(mtm_hw_private.lesson_preview_scalars120(a,array[
  'path','sha256','storage_path','content_type','bytes'
 ]) order by ref.path),'[]'::jsonb) into question_assets
 from jsonb_array_elements(case when jsonb_typeof(source_assets)='array' then source_assets else '[]'::jsonb end) a
 join refs ref on ref.path=a->>'path' and ref.digest=a->>'sha256'
 where a->>'storage_path'='btvn/'||lesson.code||'/'||source_version||'/'||ref.path
  and (case when ref.path like '%.pdf' then a->>'content_type'='application/pdf' else a->>'content_type'='image/png' end)
  and jsonb_typeof(a->'bytes')='number' and a->'bytes' >= '8'::jsonb and a->'bytes' <= '15728640'::jsonb;

 return jsonb_build_object(
  'uploadId',u.id,'classId',p_class_id,'className',class_label,'kind',u.work_kind,'paper',p_paper,
  'lessonCode',lesson.code,'sourceVersion',source_version,'title',coalesce(preview->>'title',u.title),
  'exam',preview,'assets',question_assets
 );
end$$;

-- Remove any grants inherited from this installation's default function ACL.
do $acl$
declare f record;g record;role_name text;
begin
 for f in select p.oid::regprocedure signature,p.proowner,p.proacl from pg_proc p
  where p.oid in (
   'public.mtm_lesson_published_preview(uuid,uuid,integer,boolean)'::regprocedure,
   'mtm_hw_private.lesson_preview_scalars120(jsonb,text[])'::regprocedure,
   'mtm_hw_private.lesson_preview_array120(jsonb,text)'::regprocedure,
   'mtm_hw_private.lesson_preview_crops120(jsonb)'::regprocedure
  ) loop
  for g in select distinct grantee from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) where grantee<>f.proowner loop
   role_name:=case when g.grantee=0 then 'public' else quote_ident((select rolname from pg_roles where oid=g.grantee)) end;
   execute format('revoke all on function %s from %s',f.signature,role_name);
  end loop;
 end loop;
end$acl$;
grant execute on function public.mtm_lesson_published_preview(uuid,uuid,integer,boolean) to authenticated;

commit;
