-- 031 (18/10, anh Thành: Sheet tiến trình BTVN cần giờ vào làm + số lần làm): scorebook trả thêm attempts [{startedAt, submittedAt}] từ drafts. ĐÃ ÁP (Claude).
begin;
CREATE OR REPLACE FUNCTION public.mtm_btvn_scorebook(p_from date DEFAULT '2026-10-15'::date, p_apply boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('studentId',s.id,'fullName',s.full_name,'className',c.label,'lessonCode',l.code,'title',l.exam->>'title','date',coalesce(l.material->'classDates'->>c.label,l.material->>'date'),'dueAt',extract(epoch from w.next_actual_class_at)*1000,'expectedDueAt',extract(epoch from w.expected_due_at)*1000,'attempts',(select coalesce(jsonb_agg(jsonb_build_object('startedAt',(dr->>'startedAt')::numeric,'submittedAt',(dr->>'submittedAt')::numeric) order by (dr->>'startedAt')::numeric),'[]') from jsonb_array_elements(case when jsonb_typeof(w.drafts)='array' then w.drafts else '[]' end) dr),'receipts',(select coalesce(jsonb_agg(receipt),'[]') from jsonb_array_elements(coalesce(w.receipts,'[]')) receipt where (receipt->>'submittedAt')::numeric>=extract(epoch from '2026-10-15T00:00:00+07:00'::timestamptz)*1000)) order by c.label,s.full_name,l.code),'[]')
 from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
 join mtm_hw_private.btvn_roster_scope scope on scope.singleton and scope.owner_id=s.owner_id
 join mtm_hw_private.btvn_lessons l on s.class_id=any(l.class_ids) and l.owner_id=s.owner_id
 left join mtm_hw_private.btvn_work w on w.student_id=s.id and w.lesson_code=l.code
 where s.active and c.active and l.active and coalesce(s.source_identity,'') not like 'qa:%'
 and coalesce(l.material->'classDates'->>c.label,l.material->>'date')::date>=greatest(coalesce(p_from,'2026-10-01'::date),'2026-10-01'::date)
$function$;
commit;
