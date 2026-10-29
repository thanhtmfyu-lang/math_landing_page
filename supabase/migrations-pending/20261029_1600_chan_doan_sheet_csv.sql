-- CHẨN ĐOÁN (29/10, chỉ đọc, không áp lên main): Sheet học vụ báo HTTP 502 ở tab tongquan sau khi hết 403.
-- Đo thời gian và lỗi từng tab của mtm_btvn_sheet_csv6_real100 rồi raise để workflow in một dòng; không in dữ liệu.
do $$declare t text;t0 timestamptz;s text;msg text:='';begin
 foreach t in array array['tongquan','cahomnay','cachitiet','hocsinh','diem','xephang','chuyenbuoi','zoom','vantay','onchuongxs'] loop
  t0:=clock_timestamp();
  begin
   if t='onchuongxs' then s:=public.mtm_on_chuong_csv(); else s:=public.mtm_btvn_sheet_csv6_real100(t); end if;
   msg:=msg||t||'='||round(extract(epoch from clock_timestamp()-t0)*1000)||'ms/'||coalesce(length(s)/1000,-1)||'k ';
  exception when others then msg:=msg||t||'=ERR '||sqlstate||' '||left(regexp_replace(sqlerrm,'[0-9]','#','g'),40)||' ';
  end;
 end loop;
 raise exception 'CHAN DOAN %',msg;
end$$;
