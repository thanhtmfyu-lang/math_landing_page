-- 077 Phòng thi thử THPT Quốc gia (/phong-thi-thu), 20/10/2026.
-- Đề và đáp án KHÔNG nằm trong CSDL: chỉ ở server/phong-thi/kho-de.bin (mã hóa). CSDL giữ: tài khoản người ngoài, quyền theo gói,
-- mã kích hoạt, lượt thi đã chấm (cho bảng xếp hạng, lịch sử, báo điểm phụ huynh), đăng ký kỳ khảo sát theo đợt, báo lỗi đề.
-- Lịch đợt thi nằm ở server/phong-thi/dot.json (không bí mật); CSDL chỉ ghi mã đợt vào lượt.
-- Mọi hàm chỉ service_role gọi qua /api/phong-thi; anon/authenticated không đọc được bảng nào.
-- Mật khẩu băm scrypt ở API (node:crypto), CSDL chỉ lưu chuỗi băm. Mã phiên và mã kích hoạt chỉ lưu sha256.
-- Bật trên web bằng MTM_PHONG_THI_DB=1 sau khi áp. Áp một lần; chạy lại an toàn (if not exists / or replace).
begin;
create schema if not exists mtm_phong_thi;
revoke all on schema mtm_phong_thi from public,anon,authenticated;

create table if not exists mtm_phong_thi.tai_khoan(
 id uuid primary key default gen_random_uuid(),
 sdt text not null unique check(sdt ~ '^0[0-9]{9}$'),
 ten text not null check(length(btrim(ten)) between 2 and 60),
 mat_khau text not null check(mat_khau ~ '^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$'),
 khoa boolean not null default false,
 sai_lien_tiep int not null default 0,
 khoa_den timestamptz,
 tao_luc timestamptz not null default clock_timestamp());

create table if not exists mtm_phong_thi.phien(
 digest text primary key check(digest ~ '^[0-9a-f]{64}$'),
 tai_khoan uuid not null references mtm_phong_thi.tai_khoan(id) on delete cascade,
 het_han timestamptz not null,
 tao_luc timestamptz not null default clock_timestamp());

create table if not exists mtm_phong_thi.quyen(
 id bigserial primary key,
 tai_khoan uuid not null references mtm_phong_thi.tai_khoan(id) on delete cascade,
 goi text not null check(goi ~ '^[a-z0-9-]{3,40}$'),
 loai text[] not null check(loai <@ array['thpt','hsa','tsa'] and cardinality(loai)>0),
 tu timestamptz not null default clock_timestamp(),
 den timestamptz not null,
 nguon text not null check(nguon in ('ma-kich-hoat','thanh-toan','quan-tri')),
 ghi_chu text);
create index if not exists quyen_tk on mtm_phong_thi.quyen(tai_khoan,den);

create table if not exists mtm_phong_thi.ma_kich_hoat(
 digest text primary key check(digest ~ '^[0-9a-f]{64}$'),
 goi text not null,
 loai text[] not null check(loai <@ array['thpt','hsa','tsa'] and cardinality(loai)>0),
 so_ngay int not null check(so_ngay between 1 and 730),
 het_han timestamptz not null,
 lo text not null default '',
 dung_boi uuid references mtm_phong_thi.tai_khoan(id),
 dung_luc timestamptz,
 tao_luc timestamptz not null default clock_timestamp());

create table if not exists mtm_phong_thi.luot(
 id uuid primary key default gen_random_uuid(),
 nonce text not null unique check(length(nonce) between 8 and 40),
 de text not null check(de ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
 loai text not null check(loai in ('thpt','hsa','tsa')),
 nguoi text not null check(length(nguoi) between 4 and 80),
 hoc_sinh uuid references mtm_hw_private.students(id) on delete set null,
 tai_khoan uuid references mtm_phong_thi.tai_khoan(id) on delete set null,
 diem numeric(6,2) not null check(diem>=0),
 thang numeric(6,2) not null check(thang>0),
 dung int not null,
 tong int not null,
 giay int not null check(giay between 0 and 200000),
 qua_gio boolean not null,
 chi_tiet jsonb not null,
 ten_hien_thi text check(ten_hien_thi is null or length(ten_hien_thi) between 2 and 24),
 dot text check(dot is null or dot ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
 sbd text check(sbd is null or sbd ~ '^[A-Z][A-Z0-9]{1,7}-1[012]-[0-9]{4}$'),
 nop_luc timestamptz not null default clock_timestamp());
create index if not exists luot_de on mtm_phong_thi.luot(de,diem desc,giay);
create index if not exists luot_nguoi on mtm_phong_thi.luot(nguoi,nop_luc desc);
create index if not exists luot_hs on mtm_phong_thi.luot(hoc_sinh,nop_luc) where hoc_sinh is not null;
create index if not exists luot_dot on mtm_phong_thi.luot(dot,nguoi,nop_luc) where dot is not null;

-- Kỳ khảo sát theo đợt (05–06/12/2026 cho khối 10–12, mở cả học sinh ngoài trung tâm). SBD {tiền tố}-{khối}-{stt 4 số}.
-- Họ tên, trường, SĐT phụ huynh chỉ đọc lại được bằng SBD + mã tra cứu (lưu sha256); bảng xếp hạng chỉ có SBD và tên rút gọn.
create table if not exists mtm_phong_thi.dang_ky_dot(
 id uuid primary key default gen_random_uuid(),
 dot text not null check(dot ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
 khoi smallint not null check(khoi in (10,11,12)),
 stt int not null check(stt between 1 and 9999),
 sbd text not null unique check(sbd ~ '^[A-Z][A-Z0-9]{1,7}-1[012]-[0-9]{4}$'),
 ten text not null check(length(btrim(ten)) between 2 and 60),
 truong text not null check(length(btrim(truong)) between 2 and 120),
 sdt_phu_huynh text not null check(sdt_phu_huynh ~ '^0[0-9]{9}$'),
 tra_cuu text not null check(tra_cuu ~ '^[0-9a-f]{64}$'),
 ip text not null check(ip ~ '^[0-9a-f]{64}$'),
 hoc_sinh_mtm boolean not null default false,
 hoc_sinh uuid references mtm_hw_private.students(id) on delete set null,
 tao_luc timestamptz not null default clock_timestamp(),
 unique(dot,khoi,stt));
create index if not exists dang_ky_dot_sdt on mtm_phong_thi.dang_ky_dot(dot,sdt_phu_huynh);
create index if not exists dang_ky_dot_ip on mtm_phong_thi.dang_ky_dot(ip,tao_luc);

-- Báo lỗi đề từ màn kết quả: đề, mã câu, nội dung ≤ 500 ký tự. Người gửi theo mã người (hs:/tk:) hoặc IP băm cho khách.
create table if not exists mtm_phong_thi.bao_loi(
 id bigserial primary key,
 de text not null check(de ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
 ma_cau text not null check(length(ma_cau) between 1 and 40),
 noi_dung text not null check(length(btrim(noi_dung)) between 5 and 500),
 nguoi text not null check(length(nguoi) between 4 and 80),
 ip text not null check(ip ~ '^[0-9a-f]{64}$'),
 xu_ly text not null default 'moi' check(xu_ly in ('moi','dung','khong-loi','da-sua')),
 tao_luc timestamptz not null default clock_timestamp());
create index if not exists bao_loi_nguoi on mtm_phong_thi.bao_loi(nguoi,tao_luc);
create index if not exists bao_loi_ip on mtm_phong_thi.bao_loi(ip,tao_luc);
create index if not exists bao_loi_de on mtm_phong_thi.bao_loi(de,xu_ly);

alter table mtm_phong_thi.tai_khoan enable row level security;
alter table mtm_phong_thi.phien enable row level security;
alter table mtm_phong_thi.quyen enable row level security;
alter table mtm_phong_thi.ma_kich_hoat enable row level security;
alter table mtm_phong_thi.luot enable row level security;
alter table mtm_phong_thi.dang_ky_dot enable row level security;
alter table mtm_phong_thi.bao_loi enable row level security;

-- Học sinh trung tâm: phiên BTVN (cookie mtm_btvn_demo) → mã, họ tên, lớp. Phiên sai: lỗi 42501.
create or replace function public.mtm_pt_hoc_sinh(p_session text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid=mtm_hw_private.btvn_student(p_session);r jsonb;
begin
 if sid is null then raise exception 'Session required' using errcode='42501'; end if;
 select jsonb_build_object('id',s.id,'ten',s.full_name,'lop',c.label) into r from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id where s.id=sid;
 return r;
end$$;

create or replace function public.mtm_pt_dang_ky(p_sdt text,p_ten text,p_mat_khau text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 insert into mtm_phong_thi.tai_khoan(sdt,ten,mat_khau) values(p_sdt,btrim(p_ten),p_mat_khau) on conflict(sdt) do nothing returning id into v_id;
 if v_id is null then raise exception 'Phone exists' using errcode='23505'; end if;
 return v_id;
end$$;

-- Đăng nhập: API lấy chuỗi băm để so mật khẩu; tài khoản khóa tạm 15 phút sau 8 lần sai liền.
create or replace function public.mtm_pt_tim_tai_khoan(p_sdt text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'matKhau',mat_khau,'khoa',khoa or coalesce(khoa_den>clock_timestamp(),false)) from mtm_phong_thi.tai_khoan where sdt=p_sdt
$$;
create or replace function public.mtm_pt_ket_qua_dang_nhap(p_tai_khoan uuid,p_dung boolean,p_digest text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_dung then
  update mtm_phong_thi.tai_khoan set sai_lien_tiep=0,khoa_den=null where id=p_tai_khoan;
  delete from mtm_phong_thi.phien where tai_khoan=p_tai_khoan and het_han<clock_timestamp();
  insert into mtm_phong_thi.phien(digest,tai_khoan,het_han) values(p_digest,p_tai_khoan,clock_timestamp()+interval '30 days');
 else
  update mtm_phong_thi.tai_khoan set sai_lien_tiep=sai_lien_tiep+1,khoa_den=case when sai_lien_tiep+1>=8 then clock_timestamp()+interval '15 minutes' else khoa_den end where id=p_tai_khoan;
 end if;
end$$;

create or replace function public.mtm_pt_phien(p_digest text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',t.id,'ten',t.ten,'goi',coalesce((select jsonb_agg(jsonb_build_object('goi',q.goi,'loai',to_jsonb(q.loai),'den',to_char(q.den at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')) order by q.den desc)
   from mtm_phong_thi.quyen q where q.tai_khoan=t.id and q.den>clock_timestamp()),'[]'::jsonb))
 from mtm_phong_thi.phien p join mtm_phong_thi.tai_khoan t on t.id=p.tai_khoan where p.digest=p_digest and p.het_han>clock_timestamp() and not t.khoa
$$;
create or replace function public.mtm_pt_dang_xuat(p_digest text) returns void
language sql security definer set search_path='' as $$ delete from mtm_phong_thi.phien where digest=p_digest $$;

-- Kích hoạt mã (mã in trong sách MTM, mã phát cho đối tác, hoặc mã sau thanh toán chuyển khoản thủ công).
create or replace function public.mtm_pt_kich_hoat(p_tai_khoan uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m mtm_phong_thi.ma_kich_hoat;den timestamptz;
begin
 select * into m from mtm_phong_thi.ma_kich_hoat where digest=p_digest for update;
 if m.digest is null then return jsonb_build_object('status','sai'); end if;
 if m.dung_boi is not null then return jsonb_build_object('status',case when m.dung_boi=p_tai_khoan then 'da-dung-boi-em' else 'da-dung' end); end if;
 if m.het_han<clock_timestamp() then return jsonb_build_object('status','het-han'); end if;
 -- Cộng dồn: gói cùng mã kéo dài từ ngày hết hạn hiện tại.
 select greatest(clock_timestamp(),coalesce(max(q.den),clock_timestamp())) into den from mtm_phong_thi.quyen q where q.tai_khoan=p_tai_khoan and q.goi=m.goi;
 insert into mtm_phong_thi.quyen(tai_khoan,goi,loai,den,nguon,ghi_chu) values(p_tai_khoan,m.goi,m.loai,den+make_interval(days=>m.so_ngay),'ma-kich-hoat',m.lo);
 update mtm_phong_thi.ma_kich_hoat set dung_boi=p_tai_khoan,dung_luc=clock_timestamp() where digest=p_digest;
 return jsonb_build_object('status','ok','goi',m.goi,'den',to_char((den+make_interval(days=>m.so_ngay)) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
end$$;
-- Quản trị tạo lô mã: truyền sẵn danh sách sha256 của mã (mã gốc sinh ở scripts/phong-thi-tao-ma.mjs, không đi qua CSDL).
create or replace function public.mtm_pt_them_ma(p_digests text[],p_goi text,p_loai text[],p_so_ngay int,p_het_han timestamptz,p_lo text) returns int
language plpgsql security definer set search_path='' as $$
declare n int;
begin
 insert into mtm_phong_thi.ma_kich_hoat(digest,goi,loai,so_ngay,het_han,lo) select d,p_goi,p_loai,p_so_ngay,p_het_han,coalesce(p_lo,'') from unnest(p_digests) d on conflict do nothing;
 get diagnostics n=row_count;return n;
end$$;

-- Ghi lượt đã chấm. Bảng xếp hạng mỗi đề: lượt đầu tiên đúng giờ của mỗi người (điểm cao, rồi làm nhanh, rồi nộp sớm).
-- Lượt theo đợt (p_dot): xếp hạng trong đợt theo lượt đầu của mỗi người trong đợt; đợt khảo sát (p_sbd) xếp trong khối theo SBD, không cần ghi tên.
create or replace function public.mtm_pt_ghi_luot(p_nonce text,p_de text,p_loai text,p_nguoi text,p_hoc_sinh uuid,p_tai_khoan uuid,p_diem numeric,p_thang numeric,p_dung int,p_tong int,p_giay int,p_qua_gio boolean,p_chi_tiet jsonb,p_ten text,p_dot text default null,p_sbd text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare lan int;hang int;n int;
begin
 insert into mtm_phong_thi.luot(nonce,de,loai,nguoi,hoc_sinh,tai_khoan,diem,thang,dung,tong,giay,qua_gio,chi_tiet,ten_hien_thi,dot,sbd)
  values(p_nonce,p_de,p_loai,p_nguoi,p_hoc_sinh,p_tai_khoan,p_diem,p_thang,p_dung,p_tong,p_giay,p_qua_gio,p_chi_tiet,p_ten,p_dot,p_sbd) on conflict(nonce) do nothing;
 if not found then return jsonb_build_object('status','da-ghi'); end if;
 if p_sbd is not null then
  select count(*) into lan from mtm_phong_thi.luot where dot=p_dot and sbd=p_sbd;
  if p_qua_gio or lan>1 then return jsonb_build_object('status','luyen-tap','lan',lan); end if;
  select count(*) filter(where x.diem>p_diem or (x.diem=p_diem and x.giay<p_giay))+1,count(*) into hang,n from (select distinct on (sbd) diem,giay from mtm_phong_thi.luot
   where dot=p_dot and sbd like split_part(p_sbd,'-',1)||'-'||split_part(p_sbd,'-',2)||'-%' and not qua_gio order by sbd,nop_luc) x;
  return jsonb_build_object('status','xep-hang','hang',hang,'n',n,'lan',lan,'dot',p_dot);
 end if;
 if p_dot is not null then
  select count(*) into lan from mtm_phong_thi.luot where dot=p_dot and nguoi=p_nguoi;
  if p_qua_gio or lan>1 or p_ten is null or p_nguoi='khach' then return jsonb_build_object('status','luyen-tap','lan',lan,'dot',p_dot); end if;
  select count(*)+1 into hang from (select distinct on (nguoi) diem,giay,nop_luc,qua_gio,ten_hien_thi from mtm_phong_thi.luot where dot=p_dot and nguoi<>'khach' order by nguoi,nop_luc) x
   where not x.qua_gio and x.ten_hien_thi is not null and (x.diem>p_diem or (x.diem=p_diem and x.giay<p_giay));
  return jsonb_build_object('status','xep-hang','hang',hang,'lan',lan,'dot',p_dot);
 end if;
 select count(*) into lan from mtm_phong_thi.luot where de=p_de and nguoi=p_nguoi;
 if p_qua_gio or lan>1 or p_ten is null or p_nguoi='khach' then return jsonb_build_object('status','luyen-tap','lan',lan); end if;
 select count(*)+1 into hang from (select distinct on (nguoi) diem,giay,nop_luc from mtm_phong_thi.luot where de=p_de and not qua_gio and ten_hien_thi is not null and nguoi<>'khach' order by nguoi,nop_luc) x
  where x.diem>p_diem or (x.diem=p_diem and x.giay<p_giay);
 return jsonb_build_object('status','xep-hang','hang',hang,'lan',lan);
end$$;
create or replace function public.mtm_pt_xep_hang(p_de text,p_limit int default 50) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('hang',r.hang,'ten',r.ten_hien_thi,'mtm',r.mtm,'diem',r.diem,'giay',r.giay,'ngay',to_char(r.nop_luc at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD')) order by r.hang),'[]'::jsonb)
 from (select row_number() over(order by x.diem desc,x.giay,x.nop_luc)::int hang,x.* from
  (select distinct on (nguoi) ten_hien_thi,hoc_sinh is not null mtm,diem,giay,nop_luc from mtm_phong_thi.luot where de=p_de and nguoi<>'khach' order by nguoi,nop_luc) x
  where x.ten_hien_thi is not null) r where r.hang<=least(greatest(p_limit,1),100)
$$;
-- Bảng trên chỉ tính lượt đầu của mỗi người; lượt đầu quá giờ hoặc không ghi tên thì người đó không vào bảng của đề.
-- Bảng xếp hạng một đợt (không phải khảo sát): lượt đầu trong đợt của mỗi người, đúng giờ, có ghi tên.
create or replace function public.mtm_pt_xep_hang_dot(p_dot text,p_limit int default 50) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('hang',r.hang,'ten',r.ten_hien_thi,'mtm',r.mtm,'diem',r.diem,'giay',r.giay) order by r.hang),'[]'::jsonb)
 from (select row_number() over(order by x.diem desc,x.giay,x.nop_luc)::int hang,x.* from
  (select distinct on (nguoi) ten_hien_thi,hoc_sinh is not null mtm,diem,giay,nop_luc,qua_gio from mtm_phong_thi.luot where dot=p_dot and sbd is null and nguoi<>'khach' order by nguoi,nop_luc) x
  where x.ten_hien_thi is not null and not x.qua_gio) r where r.hang<=least(greatest(p_limit,1),100)
$$;

-- Đăng ký kỳ khảo sát: chống rác theo IP băm (30 lượt/giờ, đủ cho một lớp chung wifi trường) và SĐT phụ huynh (tối đa 3 thí sinh mỗi đợt). Trả SBD; mã tra cứu do API sinh, chỉ lưu sha256.
create or replace function public.mtm_pt_dang_ky_dot(p_dot text,p_khoi int,p_tien_to text,p_ten text,p_truong text,p_sdt text,p_tra_cuu text,p_ip text,p_hoc_sinh uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_stt int;v_sbd text;
begin
 if (select count(*) from mtm_phong_thi.dang_ky_dot where ip=p_ip and tao_luc>clock_timestamp()-interval '1 hour')>=30 then return jsonb_build_object('status','qua-nhieu'); end if;
 if (select count(*) from mtm_phong_thi.dang_ky_dot where dot=p_dot and sdt_phu_huynh=p_sdt)>=3 then return jsonb_build_object('status','sdt-du'); end if;
 perform pg_advisory_xact_lock(hashtext('mtm_pt_dang_ky_dot:'||p_dot||':'||p_khoi));
 select coalesce(max(stt),0)+1 into v_stt from mtm_phong_thi.dang_ky_dot where dot=p_dot and khoi=p_khoi;
 if v_stt>9999 then return jsonb_build_object('status','het-cho'); end if;
 v_sbd=p_tien_to||'-'||p_khoi||'-'||lpad(v_stt::text,4,'0');
 insert into mtm_phong_thi.dang_ky_dot(dot,khoi,stt,sbd,ten,truong,sdt_phu_huynh,tra_cuu,ip,hoc_sinh_mtm,hoc_sinh)
  values(p_dot,p_khoi,v_stt,v_sbd,btrim(p_ten),btrim(p_truong),p_sdt,p_tra_cuu,p_ip,p_hoc_sinh is not null,p_hoc_sinh);
 return jsonb_build_object('status','ok','sbd',v_sbd,'khoi',p_khoi);
end$$;
-- Tra cứu thí sinh bằng SBD + mã tra cứu: chỉ trả cho chính người giữ mã.
create or replace function public.mtm_pt_tra_cuu_dot(p_sbd text,p_tra_cuu text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('dot',dot,'sbd',sbd,'khoi',khoi::text,'ten',ten,'truong',truong,'mtm',hoc_sinh_mtm) from mtm_phong_thi.dang_ky_dot where sbd=p_sbd and tra_cuu=p_tra_cuu
$$;
-- Kỳ khảo sát: thứ hạng, phân vị trong khối và tỉ lệ đúng từng câu của khối (lượt đầu đúng giờ của mỗi SBD). Không có họ tên đầy đủ, trường, SĐT.
create or replace function public.mtm_pt_khao_sat(p_dot text,p_khoi int,p_sbd text default null,p_limit int default 50) returns jsonb
language sql stable security definer set search_path='' as $$
 with x as (select distinct on (l.sbd) l.sbd,l.diem,l.giay,l.chi_tiet,d.ten,d.hoc_sinh_mtm from mtm_phong_thi.luot l join mtm_phong_thi.dang_ky_dot d on d.sbd=l.sbd
   where l.dot=p_dot and d.dot=p_dot and d.khoi=p_khoi and not l.qua_gio order by l.sbd,l.nop_luc),
  r as (select row_number() over(order by diem desc,giay)::int hang,count(*) over()::int n,(select count(*) from x y where y.diem<x.diem)::int thap_hon,x.* from x)
 select jsonb_build_object('n',(select count(*) from x),
  'bang',coalesce((select jsonb_agg(jsonb_build_object('hang',hang,'sbd',sbd,'ten',ten,'mtm',hoc_sinh_mtm,'diem',diem,'phanVi',case when n>1 then round(100.0*thap_hon/(n-1)) else 0 end) order by hang) from r where hang<=least(greatest(p_limit,1),200)),'[]'::jsonb),
  'em',(select jsonb_build_object('hang',hang,'n',n,'diem',diem,'phanVi',case when n>1 then round(100.0*thap_hon/(n-1)) else 0 end) from r where sbd=p_sbd),
  'cau',coalesce((select jsonb_object_agg(k,v) from (select e->>0 k,round(avg((e->>1)::numeric),3) v from x,jsonb_array_elements(x.chi_tiet->'cau') e group by e->>0) t),'{}'::jsonb))
$$;

-- Báo lỗi đề: tối đa 10 báo mỗi giờ cho một người hoặc một IP băm.
create or replace function public.mtm_pt_bao_loi(p_de text,p_ma text,p_noi_dung text,p_nguoi text,p_ip text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if (select count(*) from mtm_phong_thi.bao_loi where (nguoi=p_nguoi and p_nguoi<>'khach' or ip=p_ip) and tao_luc>clock_timestamp()-interval '1 hour')>=10 then return jsonb_build_object('status','qua-nhieu'); end if;
 insert into mtm_phong_thi.bao_loi(de,ma_cau,noi_dung,nguoi,ip) values(p_de,p_ma,btrim(p_noi_dung),p_nguoi,p_ip);
 return jsonb_build_object('status','ok');
end$$;
create or replace function public.mtm_pt_lich_su(p_nguoi text,p_limit int default 30) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('de',de,'loai',loai,'diem',diem,'thang',thang,'dung',dung,'tong',tong,'giay',giay,'quaGio',qua_gio,'dot',dot,'luc',to_char(nop_luc at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')) order by nop_luc desc),'[]'::jsonb)
 from (select * from mtm_phong_thi.luot where nguoi=p_nguoi order by nop_luc desc limit least(greatest(p_limit,1),100)) l
$$;
-- Báo điểm phụ huynh: bot Zalo/Javis đọc các lượt của học sinh trung tâm trong khoảng ngày (giờ Việt Nam) rồi gửi theo danh bạ phụ huynh của học vụ.
create or replace function public.mtm_pt_bao_phu_huynh(p_tu date,p_den date) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('hocSinh',s.id,'ten',s.full_name,'lop',c.label,'de',l.de,'diem',l.diem,'thang',l.thang,'dung',l.dung,'tong',l.tong,'phut',round(l.giay/60.0),'quaGio',l.qua_gio,
  'luc',to_char(l.nop_luc at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD HH24:MI')) order by c.label,s.full_name,l.nop_luc),'[]'::jsonb)
 from mtm_phong_thi.luot l join mtm_hw_private.students s on s.id=l.hoc_sinh join mtm_hw_private.classes c on c.id=s.class_id
 where (l.nop_luc at time zone 'Asia/Ho_Chi_Minh')::date between p_tu and p_den
$$;

do $$declare f text;begin foreach f in array array[
 'mtm_pt_hoc_sinh(text)','mtm_pt_dang_ky(text,text,text)','mtm_pt_tim_tai_khoan(text)','mtm_pt_ket_qua_dang_nhap(uuid,boolean,text)','mtm_pt_phien(text)','mtm_pt_dang_xuat(text)',
 'mtm_pt_kich_hoat(uuid,text)','mtm_pt_them_ma(text[],text,text[],int,timestamptz,text)',
 'mtm_pt_ghi_luot(text,text,text,text,uuid,uuid,numeric,numeric,int,int,int,boolean,jsonb,text,text,text)','mtm_pt_xep_hang(text,int)','mtm_pt_lich_su(text,int)','mtm_pt_bao_phu_huynh(date,date)',
 'mtm_pt_xep_hang_dot(text,int)','mtm_pt_dang_ky_dot(text,int,text,text,text,text,text,text,uuid)','mtm_pt_tra_cuu_dot(text,text)','mtm_pt_khao_sat(text,int,text,int)','mtm_pt_bao_loi(text,text,text,text,text)'] loop
 execute format('revoke all on function public.%s from public,anon,authenticated',f);
 execute format('grant execute on function public.%s to service_role',f);
end loop;end$$;
commit;
