-- 077 Phòng thi thử THPT Quốc gia (/phong-thi-thu), 20/10/2026.
-- Đề và đáp án KHÔNG nằm trong CSDL: chỉ ở server/phong-thi/kho-de.bin (mã hóa). CSDL giữ: tài khoản người ngoài, quyền theo gói,
-- mã kích hoạt, lượt thi đã chấm (cho bảng xếp hạng, lịch sử, báo điểm phụ huynh).
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
 nop_luc timestamptz not null default clock_timestamp());
create index if not exists luot_de on mtm_phong_thi.luot(de,diem desc,giay);
create index if not exists luot_nguoi on mtm_phong_thi.luot(nguoi,nop_luc desc);
create index if not exists luot_hs on mtm_phong_thi.luot(hoc_sinh,nop_luc) where hoc_sinh is not null;

alter table mtm_phong_thi.tai_khoan enable row level security;
alter table mtm_phong_thi.phien enable row level security;
alter table mtm_phong_thi.quyen enable row level security;
alter table mtm_phong_thi.ma_kich_hoat enable row level security;
alter table mtm_phong_thi.luot enable row level security;

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
create or replace function public.mtm_pt_ghi_luot(p_nonce text,p_de text,p_loai text,p_nguoi text,p_hoc_sinh uuid,p_tai_khoan uuid,p_diem numeric,p_thang numeric,p_dung int,p_tong int,p_giay int,p_qua_gio boolean,p_chi_tiet jsonb,p_ten text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare lan int;hang int;
begin
 insert into mtm_phong_thi.luot(nonce,de,loai,nguoi,hoc_sinh,tai_khoan,diem,thang,dung,tong,giay,qua_gio,chi_tiet,ten_hien_thi)
  values(p_nonce,p_de,p_loai,p_nguoi,p_hoc_sinh,p_tai_khoan,p_diem,p_thang,p_dung,p_tong,p_giay,p_qua_gio,p_chi_tiet,p_ten) on conflict(nonce) do nothing;
 if not found then return jsonb_build_object('status','da-ghi'); end if;
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
create or replace function public.mtm_pt_lich_su(p_nguoi text,p_limit int default 30) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('de',de,'loai',loai,'diem',diem,'thang',thang,'dung',dung,'tong',tong,'giay',giay,'quaGio',qua_gio,'luc',to_char(nop_luc at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')) order by nop_luc desc),'[]'::jsonb)
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
 'mtm_pt_ghi_luot(text,text,text,text,uuid,uuid,numeric,numeric,int,int,int,boolean,jsonb,text)','mtm_pt_xep_hang(text,int)','mtm_pt_lich_su(text,int)','mtm_pt_bao_phu_huynh(date,date)'] loop
 execute format('revoke all on function public.%s from public,anon,authenticated',f);
 execute format('grant execute on function public.%s to service_role',f);
end loop;end$$;
commit;
