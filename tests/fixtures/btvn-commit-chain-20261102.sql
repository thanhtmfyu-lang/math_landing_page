-- Actual function definitions read with a READ ONLY transaction on 2026-11-02. No student rows.
CREATE OR REPLACE FUNCTION public.mtm_btvn_commit_before_rank(p_session text, p_lesson text, p_revision integer, p_drafts jsonb, p_receipts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sid uuid=mtm_hw_private.btvn_student(p_session);n integer;begin
 if jsonb_typeof(p_drafts)<>'array' or jsonb_array_length(p_drafts)>5 or jsonb_typeof(p_receipts)<>'array' or octet_length(p_drafts::text)+octet_length(p_receipts::text)>524288 then raise exception 'Payload invalid';end if;
 if not exists(select 1 from mtm_hw_private.btvn_lessons l join mtm_hw_private.students s on s.id=sid where l.code=p_lesson and l.active and mtm_hw_private.btvn_access_class(sid,l.code) IS NOT NULL) then raise exception 'Lesson unavailable' using errcode='42501';end if;
 if not exists(select 1 from mtm_hw_private.students s join mtm_hw_private.btvn_lessons l on l.code=p_lesson where s.id=sid and s.class_id=any(l.class_ids)) then
  -- Serialize cancellation against writes authorized only by this move.
  perform m.id from mtm_hw_private.schedule_moves m
   join mtm_hw_private.students s on s.id=m.student_id
   join mtm_hw_private.classes target_class on target_class.label=m.to_class and target_class.owner_id=s.owner_id and target_class.active
   join mtm_hw_private.btvn_lessons l on l.code=p_lesson and l.owner_id=s.owner_id and target_class.id=any(l.class_ids)
   where m.student_id=sid and m.cancelled_at is null and l.active and l.kind='btvn'
    and nullif(btrim(m.source_msg),'') is not null and nullif(btrim(m.confirmed_by),'') is not null
    and coalesce(l.material->'classDates'->>target_class.label,l.material->>'date')=to_char(m.to_date,'YYYY-MM-DD')
   for share of m;
  if not found or mtm_hw_private.btvn_access_class(sid,p_lesson) is null then raise exception 'Lesson unavailable' using errcode='42501';end if;
 end if;
 update mtm_hw_private.btvn_work set drafts=p_drafts,receipts=p_receipts,revision=revision+1 where student_id=sid and lesson_code=p_lesson and revision=p_revision;
 get diagnostics n=row_count;return jsonb_build_object('ok',n=1);
end$function$
;
CREATE OR REPLACE FUNCTION public.mtm_btvn_commit_before_class_open(p_session text, p_lesson text, p_revision integer, p_drafts jsonb, p_receipts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sid uuid=mtm_hw_private.btvn_student(p_session);l mtm_hw_private.btvn_lessons;w mtm_hw_private.btvn_work;
begin
 select * into l from mtm_hw_private.btvn_lessons where code=p_lesson;
 if l.kind='kiem-tra-thang' then
  select * into w from mtm_hw_private.btvn_work where student_id=sid and lesson_code=p_lesson for update;
  if jsonb_array_length(p_drafts)>1 or jsonb_array_length(p_receipts)>1 or clock_timestamp()<l.opens_at
   or (jsonb_array_length(w.drafts)=0 and clock_timestamp()>=l.closes_at)
   or (jsonb_array_length(w.receipts)>0 and (p_drafts<>w.drafts or p_receipts<>w.receipts)) then raise exception 'Monthly attempt unavailable' using errcode='42501';end if;
 end if;
 return public.mtm_btvn_commit_before_rank(p_session,p_lesson,p_revision,p_drafts,p_receipts);
end$function$
;
CREATE OR REPLACE FUNCTION public.mtm_btvn_commit_before_thi_thang_choice101(p_session text, p_lesson text, p_revision integer, p_drafts jsonb, p_receipts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE sid uuid=mtm_hw_private.btvn_student(p_session);access_label text;kind text;opens timestamptz;
BEGIN
 access_label=mtm_hw_private.btvn_access_class(sid,p_lesson);
 IF access_label IS NULL THEN RAISE EXCEPTION 'Lesson unavailable' USING errcode='42501';END IF;
 SELECT l.kind,CASE WHEN l.kind='btvn' THEN mtm_hw_private.btvn_opens_at(l.material,access_label) END
 INTO kind,opens FROM mtm_hw_private.btvn_lessons l WHERE l.code=p_lesson AND l.active;
 IF kind='btvn' AND (opens IS NULL OR clock_timestamp()<opens) THEN RAISE EXCEPTION 'Homework opens after class' USING errcode='42501';END IF;
 RETURN public.mtm_btvn_commit_before_class_open(p_session,p_lesson,p_revision,p_drafts,p_receipts);
END $function$
;
CREATE OR REPLACE FUNCTION public.mtm_btvn_commit_before_answer_correction(p_session text, p_lesson text, p_revision integer, p_drafts jsonb, p_receipts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sid uuid=mtm_hw_private.btvn_student(p_session);part text[];base text;chosen integer;current_work mtm_hw_private.btvn_work;
begin
 part=regexp_match(p_lesson,'^(thi-thang-[0-9]{4}-[0-9]{2}-[a-z0-9-]+)-(thi|btvn)-ma-([12])$');
 if part is not null then
  base=part[1];
  -- CAS cũ chỉ khóa từng bài. Hai mã cùng kỳ phải cùng khóa giao dịch trước khi đọc lựa chọn.
  perform pg_advisory_xact_lock(hashtextextended('btvn-thi-thang:'||sid::text||':'||base,0));
  select right(w.lesson_code,1)::integer into chosen from mtm_hw_private.btvn_work w
  where w.student_id=sid and w.lesson_code in (base||'-thi-ma-1',base||'-thi-ma-2')
   and (jsonb_array_length(w.drafts)>0 or jsonb_array_length(w.receipts)>0)
  order by (select min(case when jsonb_typeof(d->'startedAt')='number' then (d->>'startedAt')::numeric end)
   from jsonb_array_elements(w.drafts) d) nulls last,w.lesson_code limit 1;
  -- HS offline: giữ quy tắc cũ, nộp BTVN mã kia mới xác nhận mã làm trên giấy.
  if chosen is null then
   select 3-right(w.lesson_code,1)::integer into chosen from mtm_hw_private.btvn_work w
   where w.student_id=sid and w.lesson_code in (base||'-btvn-ma-1',base||'-btvn-ma-2')
    and exists(select 1 from jsonb_array_elements(w.receipts) r where r->>'submittedAt' is not null)
   order by w.lesson_code limit 1;
  end if;
  if chosen is not null and ((part[2]='thi' and part[3]::integer<>chosen)
   or (part[2]='btvn' and part[3]::integer=chosen)) then
   -- Adapter đọc lại snapshot để trả lý do khóa; không ký/trả đề của mã thua.
   return jsonb_build_object('ok',false);
  end if;
  if part[2]='thi' then
   select * into current_work from mtm_hw_private.btvn_work where student_id=sid and lesson_code=p_lesson;
   -- Không được xóa/thay lượt đã bắt đầu để gỡ khóa hoặc khởi động lại đồng hồ.
   if jsonb_array_length(current_work.drafts)>0 and
    (p_drafts->0->>'attemptId' is distinct from current_work.drafts->0->>'attemptId'
     or p_drafts->0->'startedAt' is distinct from current_work.drafts->0->'startedAt') then
    return jsonb_build_object('ok',false);
   end if;
  end if;
 end if;
 return public.mtm_btvn_commit_before_thi_thang_choice101(p_session,p_lesson,p_revision,p_drafts,p_receipts);
end$function$
;
CREATE OR REPLACE FUNCTION mtm_hw_private.btvn_override_receipts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare due timestamptz;force_all boolean=coalesce(current_setting('mtm.force_receipt_reclassify',true),'')='1';
begin
 if not exists(select 1 from mtm_hw_private.btvn_lessons l where l.code=new.lesson_code and l.kind='btvn') then return new;end if;
 due=coalesce(mtm_hw_private.btvn_override_due_before_schedule066(new.student_id,new.lesson_code),
  new.next_actual_class_at);
 if TG_OP='INSERT' then force_all=true;
 elsif new.next_actual_class_at is distinct from old.next_actual_class_at then force_all=true;end if;
 select coalesce(jsonb_agg(case
  when not force_all and prior.receipt is not null and prior.receipt->'submittedAt' is not distinct from r->'submittedAt'
   then case when prior.receipt ? 'late' then r||jsonb_build_object('late',prior.receipt->'late') else r-'late' end
  else r||jsonb_build_object('late',case when due is null then 'null'::jsonb
   else to_jsonb((r->>'submittedAt')::numeric>=extract(epoch from due)*1000) end) end order by ord),'[]'::jsonb)
 into new.receipts from jsonb_array_elements(new.receipts) with ordinality x(r,ord)
 left join lateral(select oldrec.receipt from jsonb_array_elements(case when TG_OP='INSERT' then '[]'::jsonb else old.receipts end)
  with ordinality oldrec(receipt,oldord)
  where (coalesce(r->>'attemptId','')<>'' and oldrec.receipt->>'attemptId'=r->>'attemptId')
   or (coalesce(r->>'attemptId','')='' and coalesce(oldrec.receipt->>'attemptId','')='' and oldord=ord)
  order by oldord limit 1) prior on true;
 return new;
end$function$
;
