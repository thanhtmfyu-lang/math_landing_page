-- 29/10/2026 (anh Thành): HS lớp 12 (2K9 XPS 8+, 9+) bắt buộc làm 22 đề ôn 3 chương xác suất (Toán 10 Ch.VIII, IX; Toán 11 Ch.VIII)
-- trên /luyen-tap, hạn hết Chủ nhật 08/11/2026, tính như điểm danh. Đề luyện chấm trên trình duyệt; khi HS đã đăng nhập tài khoản web,
-- máy chủ Vercel chấm lại theo khóa trong kho rồi gọi hàm này để ghi lượt. Không nhận mã HS hay tên từ trình duyệt: chỉ phiên BTVN.
-- Bảng nội bộ cho QL: mtm_on_chuong_csv() qua Edge mtm-btvn-sheet tab "onchuongxs". Chạy lại vô hại.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create schema if not exists mtm_on_chuong;
revoke all on schema mtm_on_chuong from public,anon,authenticated;
create table if not exists mtm_on_chuong.cai_dat(singleton boolean primary key default true check(singleton),han timestamptz not null,
 lop_ap_dung text[] not null);
insert into mtm_on_chuong.cai_dat(singleton,han,lop_ap_dung) values(true,'2026-11-08 23:59:59+07',array['2K9 9+','2K9 8+'])
 on conflict(singleton) do update set han=excluded.han,lop_ap_dung=excluded.lop_ap_dung;
create table if not exists mtm_on_chuong.de(exam_id text primary key check(exam_id ~ '^mtm-practice-[a-z0-9-]{1,80}$'),
 chuong text not null,thu_tu int not null unique);
insert into mtm_on_chuong.de(exam_id,chuong,thu_tu) values
 ('mtm-practice-g10-c8-b01-v1','10·VIII',1),
 ('mtm-practice-g10-c8-l23a-v1','10·VIII',2),
 ('mtm-practice-g10-c8-l23b-v1','10·VIII',3),
 ('mtm-practice-g10-c8-l24a-v1','10·VIII',4),
 ('mtm-practice-g10-c8-l24b-v1','10·VIII',5),
 ('mtm-practice-g10-c8-l25a-v1','10·VIII',6),
 ('mtm-practice-g10-c8-l25b-v1','10·VIII',7),
 ('mtm-practice-g10-c8-k01-v1','10·VIII',8),
 ('mtm-practice-g10-c9-b01-v1','10·IX',9),
 ('mtm-practice-g10-c9-l26a-v1','10·IX',10),
 ('mtm-practice-g10-c9-l26b-v1','10·IX',11),
 ('mtm-practice-g10-c9-l27a-v1','10·IX',12),
 ('mtm-practice-g10-c9-l27b-v1','10·IX',13),
 ('mtm-practice-g10-c9-k01-v1','10·IX',14),
 ('mtm-practice-g11-c8-b01-v1','11·VIII',15),
 ('mtm-practice-g11-c8-l28a-v1','11·VIII',16),
 ('mtm-practice-g11-c8-l28b-v1','11·VIII',17),
 ('mtm-practice-g11-c8-l29a-v1','11·VIII',18),
 ('mtm-practice-g11-c8-l29b-v1','11·VIII',19),
 ('mtm-practice-g11-c8-l30a-v1','11·VIII',20),
 ('mtm-practice-g11-c8-l30b-v1','11·VIII',21),
 ('mtm-practice-g11-c8-k01-v1','11·VIII',22)
 on conflict(exam_id) do update set chuong=excluded.chuong,thu_tu=excluded.thu_tu;
create table if not exists mtm_on_chuong.luot(student_id uuid not null references mtm_hw_private.students(id),
 exam_id text not null references mtm_on_chuong.de(exam_id),attempt_key text not null check(attempt_key ~ '^[A-Za-z0-9_-]{1,120}$'),
 diem_milli int not null check(diem_milli between 0 and 10000),nop_luc timestamptz not null default clock_timestamp(),
 primary key(student_id,attempt_key));
create index if not exists mtm_on_chuong_luot_de on mtm_on_chuong.luot(student_id,exam_id);
do $$declare t text;begin
 foreach t in array array['cai_dat','de','luot'] loop
  execute format('alter table mtm_on_chuong.%I enable row level security',t);
  execute format('revoke all on mtm_on_chuong.%I from public,anon,authenticated',t);
 end loop;
end$$;

-- Ghi một lượt đã nộp. Trùng attempt_key thì giữ lượt đầu (gửi lại vô hại). Giờ nộp là giờ máy chủ nhận.
create or replace function public.mtm_on_chuong_ghi(p_session text,p_exam text,p_attempt text,p_score int) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare sid uuid;n int;ten text;
begin
 begin sid=mtm_hw_private.btvn_student(p_session);exception when insufficient_privilege then return '{"status":"login"}'::jsonb;end;
 if sid is null then return '{"status":"login"}'::jsonb;end if;
 if p_exam is null or not exists(select 1 from mtm_on_chuong.de where exam_id=p_exam) or p_attempt is null or p_attempt !~ '^[A-Za-z0-9_-]{1,120}$'
  or p_score is null or p_score not between 0 and 10000 then raise exception 'Invalid practice attempt' using errcode='22023';end if;
 if (select count(*) from mtm_on_chuong.luot where student_id=sid)>=500 then raise exception 'Too many attempts' using errcode='P0064';end if;
 insert into mtm_on_chuong.luot(student_id,exam_id,attempt_key,diem_milli) values(sid,p_exam,p_attempt,p_score) on conflict do nothing;
 select count(distinct exam_id) into n from mtm_on_chuong.luot where student_id=sid;
 select btrim(regexp_replace(full_name,'\s*[\(\[].*$','')) into ten from mtm_hw_private.students where id=sid;
 return jsonb_build_object('status','ok','ten',ten,'done',n,'total',(select count(*) from mtm_on_chuong.de));
end$$;

-- Các đề em đã có lượt ghi nhận (để trang luyện hiện dấu đã ghi).
create or replace function public.mtm_on_chuong_cua_em(p_session text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare sid uuid;
begin
 begin sid=mtm_hw_private.btvn_student(p_session);exception when insufficient_privilege then return '{"status":"login"}'::jsonb;end;
 if sid is null then return '{"status":"login"}'::jsonb;end if;
 return jsonb_build_object('status','ok',
  'ten',(select btrim(regexp_replace(full_name,'\s*[\(\[].*$','')) from mtm_hw_private.students where id=sid),
  'done',coalesce((select jsonb_agg(distinct exam_id) from mtm_on_chuong.luot where student_id=sid),'[]'::jsonb),
  'total',(select count(*) from mtm_on_chuong.de));
end$$;

-- Bảng QL: mỗi HS lớp áp dụng một dòng; chỉ tính lượt nộp trước hạn. Bỏ tài khoản thử.
create or replace function public.mtm_on_chuong_csv() returns text
language plpgsql stable security definer set search_path='' as $$
declare head text;body text;cfg mtm_on_chuong.cai_dat;tong int;
begin
 select * into cfg from mtm_on_chuong.cai_dat where singleton;
 select count(*) into tong from mtm_on_chuong.de;
 head='Lớp,Học sinh,Trạng thái,Đã làm (hạn '||to_char(cfg.han at time zone 'Asia/Ho_Chi_Minh','DD/MM')||'),Toán 10 Ch.VIII (8 đề),Toán 10 Ch.IX (6 đề),Toán 11 Ch.VIII (8 đề),Điểm TB (cao nhất mỗi đề),Đề còn thiếu,Lần nộp gần nhất,Nộp sau hạn (không tính),Cập nhật lúc';
 with hs as(
  select s.id,c.label lop,btrim(regexp_replace(s.full_name,'\s*[\(\[].*$','')) ten
  from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
  join mtm_hw_private.btvn_roster_scope scope on scope.singleton and scope.owner_id=s.owner_id
  where s.active and c.active and not s.is_test and coalesce(s.source_identity,'') not like 'qa:%' and c.label=any(cfg.lop_ap_dung)),
 tot as(
  select l.student_id,l.exam_id,max(l.diem_milli) diem from mtm_on_chuong.luot l where l.nop_luc<=cfg.han group by 1,2),
 r as(
  select hs.lop,hs.ten,
   (select count(*) from tot where tot.student_id=hs.id) da,
   (select count(*) from tot join mtm_on_chuong.de d using(exam_id) where tot.student_id=hs.id and d.chuong='10·VIII') c1,
   (select count(*) from tot join mtm_on_chuong.de d using(exam_id) where tot.student_id=hs.id and d.chuong='10·IX') c2,
   (select count(*) from tot join mtm_on_chuong.de d using(exam_id) where tot.student_id=hs.id and d.chuong='11·VIII') c3,
   (select round(avg(diem)/1000.0,2) from tot where tot.student_id=hs.id) tb,
   (select string_agg(d.chuong||' bài '||(d.thu_tu-(select min(x.thu_tu) from mtm_on_chuong.de x where x.chuong=d.chuong)+1),'; ' order by d.thu_tu)
     from mtm_on_chuong.de d where not exists(select 1 from tot where tot.student_id=hs.id and tot.exam_id=d.exam_id)) thieu,
   (select max(l.nop_luc) from mtm_on_chuong.luot l where l.student_id=hs.id) cuoi,
   (select count(distinct l.exam_id) from mtm_on_chuong.luot l where l.student_id=hs.id and l.nop_luc>cfg.han
     and not exists(select 1 from tot where tot.student_id=hs.id and tot.exam_id=l.exam_id)) muon
  from hs)
 select string_agg(concat_ws(',',mtm_hw_private.csvq(r.lop),mtm_hw_private.csvq(r.ten),
   mtm_hw_private.csvq(case when r.da>=tong then 'Đủ' when r.da=0 then 'Chưa làm' else 'Chưa đủ' end),
   mtm_hw_private.csvq(r.da||'/'||tong),mtm_hw_private.csvq(r.c1||'/8'),mtm_hw_private.csvq(r.c2||'/6'),mtm_hw_private.csvq(r.c3||'/8'),
   mtm_hw_private.csvq(coalesce(replace(rtrim(rtrim(r.tb::text,'0'),'.'),'.',','),'')),mtm_hw_private.csvq(case when r.da>=tong then '' when r.da=0 then 'Cả '||tong||' đề' else r.thieu end),
   mtm_hw_private.csvq(case when r.cuoi is null then '' else mtm_hw_private.vn_ts(r.cuoi) end),mtm_hw_private.csvq(case when r.muon>0 then r.muon::text else '' end),
   mtm_hw_private.csvq(mtm_hw_private.vn_ts(current_timestamp))),E'\n' order by r.lop,r.da,r.ten) into body from r;
 return head||E'\n'||coalesce(body,'');
end$$;
revoke all on function public.mtm_on_chuong_ghi(text,text,text,int),public.mtm_on_chuong_cua_em(text),public.mtm_on_chuong_csv() from public,anon,authenticated;
grant execute on function public.mtm_on_chuong_ghi(text,text,text,int),public.mtm_on_chuong_cua_em(text),public.mtm_on_chuong_csv() to service_role;
commit;
