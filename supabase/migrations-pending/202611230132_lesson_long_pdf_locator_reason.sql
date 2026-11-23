begin;

do $long_pdf_locator$
declare
  prior pg_proc%rowtype;
  definition text;
  anchor constant text:=$anchor$when code='NATIVE_LONG_PDF_SEGMENT_REVIEW_REQUIRED' then$anchor$;
  reason constant text:=$reason$when code='NATIVE_LONG_PDF_LOCATOR_UNRESOLVED' then 'Chưa ghép được câu giữa tệp đề và đáp án. Kiểm tra số phần, số câu và thứ tự trong hai PDF.'$reason$;
begin
  select * into strict prior from pg_proc where oid='mtm_hw_private.lesson_retry_reason108(text)'::regprocedure;
  definition:=pg_get_functiondef(prior.oid);
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'LONG_PDF_LOCATOR_RETRY_REASON_CHANGED';
  end if;
  if strpos(definition,reason)=0 then
    execute replace(definition,anchor,reason||E'\n  '||anchor);
  end if;
  if not exists(select 1 from pg_proc p where p.oid=prior.oid and p.proowner=prior.proowner
    and p.prosecdef=prior.prosecdef and p.proacl is not distinct from prior.proacl
    and p.proconfig is not distinct from prior.proconfig) then
    raise exception 'LONG_PDF_LOCATOR_RETRY_REASON_METADATA_CHANGED';
  end if;
end
$long_pdf_locator$;

commit;
