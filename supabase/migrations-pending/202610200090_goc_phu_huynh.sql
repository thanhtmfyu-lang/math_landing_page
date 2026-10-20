-- 090 (20/10, anh Thành giao Góc phụ huynh /phu-huynh). Đặc tả: /mnt/project-files/ra-soat-web/DON_CODEX_GOC_PHU_HUYNH.md
-- Phụ huynh chỉ ghép được con khi khớp ĐỒNG THỜI sổ trung tâm: họ tên con + lớp + SĐT con + SĐT phụ huynh
-- (parent_phone hoặc số phụ giáo vụ đã xác nhận). Không tự khai. PIN phụ huynh riêng, băm bcrypt.
-- Khoá 15 phút sau 5 lần sai cho mỗi SĐT phụ huynh và sau 10 lần sai cho mỗi mạng (khoá mạng HMAC từ api/btvn.ts).
-- Phiên phụ huynh: token ngẫu nhiên, DB chỉ giữ digest, hết hạn 30 ngày. Mọi đọc dữ liệu kiểm lại quyền PH→HS.
-- Ghép Zalo: mã 6 số sinh sau khi đăng nhập web, hết hạn 10 phút, dùng 1 lần. Chỉ service_role gọi được mọi hàm.
-- Chỉ thêm bảng/hàm mới, không sửa hàm cũ. Rollback: drop các hàm mtm_ph_* và 6 bảng parent_* bên dưới.
begin;

create table if not exists mtm_hw_private.parent_accounts(
 phone text primary key check (phone ~ '^0[0-9]{9}$'),
 parent_name text,
 pin_hash text not null,
 failed int not null default 0,
 locked_until timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now());
create table if not exists mtm_hw_private.parent_links(
 phone text not null references mtm_hw_private.parent_accounts(phone) on delete cascade,
 student_id uuid not null references mtm_hw_private.students(id) on delete cascade,
 linked_at timestamptz not null default now(),
 source text not null default 'web',
 primary key(phone,student_id));
create table if not exists mtm_hw_private.parent_sessions(
 digest bytea primary key,
 phone text not null references mtm_hw_private.parent_accounts(phone) on delete cascade,
 expires_at timestamptz not null,
 revoked_at timestamptz);
create table if not exists mtm_hw_private.parent_net_limits(
 network_key text primary key,
 failed int not null default 0,
 window_start timestamptz not null default now(),
 locked_until timestamptz);
create table if not exists mtm_hw_private.parent_zalo_codes(
 digest bytea primary key,
 phone text not null references mtm_hw_private.parent_accounts(phone) on delete cascade,
 expires_at timestamptz not null,
 used_at timestamptz);
create table if not exists mtm_hw_private.parent_zalo(
 zalo_id text primary key check (length(zalo_id) between 1 and 128),
 phone text not null references mtm_hw_private.parent_accounts(phone) on delete cascade,
 linked_at timestamptz not null default now());
create index if not exists parent_links_student on mtm_hw_private.parent_links(student_id);
create index if not exists parent_sessions_phone on mtm_hw_private.parent_sessions(phone);

do $$declare t text;begin
 foreach t in array array['parent_accounts','parent_links','parent_sessions','parent_net_limits','parent_zalo_codes','parent_zalo'] loop
  execute format('alter table mtm_hw_private.%I enable row level security',t);
  execute format('revoke all on mtm_hw_private.%I from public,anon,authenticated',t);
 end loop;end$$;

create or replace function mtm_hw_private.ph_weak_pin(p text) returns boolean language sql immutable set search_path='' as $$
 select p is null or p !~ '^[0-9]{6}$' or p ~ '^(.)\1{5}$' or p in ('123456','654321','012345','098765','111222','121212')
$$;

-- Ghi một lần sai cho SĐT và cho mạng; trả thời điểm khoá nếu vừa chạm ngưỡng.
create or replace function mtm_hw_private.ph_fail(p_phone text,p_net text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_phone ~ '^0[0-9]{9}$' then
  update mtm_hw_private.parent_accounts set failed=failed+1,
   locked_until=case when failed+1>=5 then clock_timestamp()+interval '15 minutes' else locked_until end,
   updated_at=now() where phone=p_phone;
  update mtm_hw_private.parent_accounts set failed=0 where phone=p_phone and failed>=5;
 end if;
 if p_net is not null then
  insert into mtm_hw_private.parent_net_limits as l(network_key,failed,window_start) values(p_net,1,clock_timestamp())
  on conflict(network_key) do update set
   failed=case when l.window_start<clock_timestamp()-interval '15 minutes' then 1 else l.failed+1 end,
   window_start=case when l.window_start<clock_timestamp()-interval '15 minutes' then clock_timestamp() else l.window_start end,
   locked_until=case when l.window_start>=clock_timestamp()-interval '15 minutes' and l.failed+1>=10 then clock_timestamp()+interval '15 minutes' else l.locked_until end;
 end if;
end$$;

create or replace function mtm_hw_private.ph_locked(p_phone text,p_net text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from mtm_hw_private.parent_accounts where phone=p_phone and locked_until>clock_timestamp())
     or exists(select 1 from mtm_hw_private.parent_net_limits where network_key=p_net and locked_until>clock_timestamp())
$$;

create or replace function mtm_hw_private.ph_new_session(p_phone text) returns text language plpgsql security definer set search_path='' as $$
declare raw text=mtm_hw_private.random_token();
begin
 delete from mtm_hw_private.parent_sessions where phone=p_phone and (expires_at<clock_timestamp() or revoked_at is not null);
 insert into mtm_hw_private.parent_sessions(digest,phone,expires_at) values(mtm_hw_private.token_digest('mtm-ph',raw),p_phone,clock_timestamp()+interval '30 days');
 return raw;
end$$;

create or replace function mtm_hw_private.ph_session_phone(p_session text) returns text language sql stable security definer set search_path='' as $$
 select s.phone from mtm_hw_private.parent_sessions s
 where p_session ~ '^[0-9a-f]{64}$' and s.digest=mtm_hw_private.token_digest('mtm-ph',p_session) and s.revoked_at is null and s.expires_at>clock_timestamp()
$$;

-- Ghép con lần đầu (hoặc thêm con). Mọi sai lệch thông tin trả cùng một kết quả {ok:false}.
-- Trạng thái: pin='setup' (khớp sổ, chưa có PIN: cần tạo), 'required' (đã có PIN: nhập PIN), 'weak', 'wrong', 'locked'.
create or replace function public.mtm_ph_link(p_parent_phone text,p_parent_name text,p_child_name text,p_child_phone text,p_class_name text,p_pin text,p_new_pin text,p_net text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ph text=mtm_hw_private.btvn_phone2(p_parent_phone);cp text=mtm_hw_private.btvn_phone2(p_child_phone);sid uuid;n int;acc record;
begin
 if p_net is null or length(p_net)<16 then return '{"ok":false}'::jsonb;end if;
 if mtm_hw_private.ph_locked(ph,p_net) then return jsonb_build_object('ok',false,'pin','locked');end if;
 if ph !~ '^0[0-9]{9}$' or cp !~ '^0[0-9]{9}$' or not mtm_hw_private.valid_text(p_child_name,160) or not mtm_hw_private.valid_text(p_class_name,160)
  or (p_parent_name is not null and not mtm_hw_private.valid_text(p_parent_name,160)) then
  perform mtm_hw_private.ph_fail(ph,p_net);return '{"ok":false}'::jsonb;end if;
 select count(*),(array_agg(s.id))[1] into n,sid
 from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
 where s.active and c.active
  and mtm_hw_private.btvn_name(s.full_name)=mtm_hw_private.btvn_name(p_child_name)
  and mtm_hw_private.btvn_name(c.label)=mtm_hw_private.btvn_name(p_class_name)
  and (mtm_hw_private.btvn_phone2(s.student_phone)=cp
       or (coalesce(mtm_hw_private.btvn_phone2(s.student_phone),'')!~'^0[0-9]{9}$' and mtm_hw_private.btvn_phone2(s.parent_phone)=cp))
  and (mtm_hw_private.btvn_phone2(s.parent_phone)=ph
       or exists(select 1 from mtm_hw_private.student_extra_phones x where x.student_id=s.id and mtm_hw_private.btvn_phone2(x.phone)=ph));
 if n<>1 then perform mtm_hw_private.ph_fail(ph,p_net);return '{"ok":false}'::jsonb;end if;
 select * into acc from mtm_hw_private.parent_accounts where phone=ph for update;
 if acc.phone is null then
  if p_new_pin is null then return jsonb_build_object('ok',false,'pin','setup');end if;
  if mtm_hw_private.ph_weak_pin(p_new_pin) then return jsonb_build_object('ok',false,'pin','weak');end if;
  insert into mtm_hw_private.parent_accounts(phone,parent_name,pin_hash) values(ph,nullif(btrim(p_parent_name),''),extensions.crypt(p_new_pin,extensions.gen_salt('bf',8)));
 else
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then return jsonb_build_object('ok',false,'pin','required');end if;
  if extensions.crypt(p_pin,acc.pin_hash)<>acc.pin_hash then
   perform mtm_hw_private.ph_fail(ph,p_net);
   return jsonb_build_object('ok',false,'pin',case when mtm_hw_private.ph_locked(ph,p_net) then 'locked' else 'wrong' end,
    'remaining',greatest(0,5-coalesce((select failed from mtm_hw_private.parent_accounts where phone=ph),0)));
  end if;
  update mtm_hw_private.parent_accounts set failed=0,locked_until=null,updated_at=now(),parent_name=coalesce(nullif(btrim(p_parent_name),''),parent_name) where phone=ph;
 end if;
 insert into mtm_hw_private.parent_links(phone,student_id) values(ph,sid) on conflict do nothing;
 return jsonb_build_object('ok',true,'session',mtm_hw_private.ph_new_session(ph));
end$$;

-- Lần sau: SĐT phụ huynh + PIN. Sai thì cùng một thông báo, không nói SĐT có tồn tại hay không.
create or replace function public.mtm_ph_login(p_parent_phone text,p_pin text,p_net text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ph text=mtm_hw_private.btvn_phone2(p_parent_phone);acc record;
begin
 if p_net is null or length(p_net)<16 then return '{"ok":false}'::jsonb;end if;
 if mtm_hw_private.ph_locked(ph,p_net) then return jsonb_build_object('ok',false,'pin','locked');end if;
 select * into acc from mtm_hw_private.parent_accounts where phone=ph for update;
 if acc.phone is null or p_pin is null or p_pin !~ '^[0-9]{6}$' or extensions.crypt(p_pin,acc.pin_hash)<>acc.pin_hash
  or not exists(select 1 from mtm_hw_private.parent_links l join mtm_hw_private.students s on s.id=l.student_id where l.phone=ph and s.active) then
  perform mtm_hw_private.ph_fail(ph,p_net);
  return jsonb_build_object('ok',false,'pin',case when mtm_hw_private.ph_locked(ph,p_net) then 'locked' else 'wrong' end);
 end if;
 update mtm_hw_private.parent_accounts set failed=0,locked_until=null,updated_at=now() where phone=ph;
 return jsonb_build_object('ok',true,'session',mtm_hw_private.ph_new_session(ph));
end$$;

create or replace function public.mtm_ph_logout(p_session text) returns void language sql security definer set search_path='' as $$
 update mtm_hw_private.parent_sessions set revoked_at=clock_timestamp() where p_session ~ '^[0-9a-f]{64}$' and digest=mtm_hw_private.token_digest('mtm-ph',p_session)
$$;

-- Danh sách con đã ghép (chỉ tên + lớp + mã nội bộ để chọn thẻ).
create or replace function public.mtm_ph_children(p_session text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ph text=mtm_hw_private.ph_session_phone(p_session);
begin
 if ph is null then raise exception 'Parent session required' using errcode='42501';end if;
 return jsonb_build_object('parentName',(select parent_name from mtm_hw_private.parent_accounts where phone=ph),
  'children',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'fullName',s.full_name,'className',c.label) order by s.full_name)
   from mtm_hw_private.parent_links l join mtm_hw_private.students s on s.id=l.student_id join mtm_hw_private.classes c on c.id=s.class_id
   where l.phone=ph and s.active and c.active),'[]'::jsonb));
end$$;

-- Phiên đọc tạm 2 phút của đúng một con đã ghép, chỉ máy chủ web dùng để gọi lại mtm_btvn_read / mtm_btvn_my_rank
-- (cùng một nguồn dữ liệu với học sinh). Không bao giờ gửi về trình duyệt; máy chủ thu hồi ngay sau khi đọc.
create or replace function public.mtm_ph_child_session(p_session text,p_student_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare ph text=mtm_hw_private.ph_session_phone(p_session);raw text;
begin
 if ph is null or p_student_id is null or not exists(
  select 1 from mtm_hw_private.parent_links l join mtm_hw_private.students s on s.id=l.student_id join mtm_hw_private.classes c on c.id=s.class_id
  where l.phone=ph and l.student_id=p_student_id and s.active and c.active) then
  raise exception 'Not your child' using errcode='42501';end if;
 delete from mtm_hw_private.btvn_identity_sessions where expires_at<clock_timestamp()-interval '1 day';
 raw=mtm_hw_private.random_token();
 insert into mtm_hw_private.btvn_identity_sessions(digest,student_id,expires_at) values(mtm_hw_private.token_digest('btvn-identity',raw),p_student_id,clock_timestamp()+interval '2 minutes');
 return raw;
end$$;

-- Điểm danh + điểm bài thi giấy của đúng một con đã ghép. Không trả ghi chú tự do, SĐT hay học sinh khác.
create or replace function public.mtm_ph_extras(p_session text,p_student_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ph text=mtm_hw_private.ph_session_phone(p_session);
begin
 if ph is null or p_student_id is null or not exists(select 1 from mtm_hw_private.parent_links l where l.phone=ph and l.student_id=p_student_id) then
  raise exception 'Not your child' using errcode='42501';end if;
 return jsonb_build_object(
  'attendance',coalesce((select jsonb_agg(jsonb_build_object('date',a.session_date,'status',a.status,'classLabel',a.class_label) order by a.session_date desc)
   from mtm_hw_private.attendance a where a.student_id=p_student_id and a.session_date>=date '2026-08-01' and a.status<>'du_kien' and a.session_date<=(now() at time zone 'Asia/Ho_Chi_Minh')::date),'[]'::jsonb),
  'upcoming',(select min(a.session_date) from mtm_hw_private.attendance a where a.student_id=p_student_id and a.status='du_kien' and a.session_date>=(now() at time zone 'Asia/Ho_Chi_Minh')::date),
  'papers',coalesce((select jsonb_agg(jsonb_build_object('testCode',p.test_code,'date',p.test_date,'subject',p.subject,'score',p.score,'maxScore',p.max_score) order by p.test_date desc)
   from mtm_hw_private.paper_scores p where p.student_id=p_student_id and p.superseded_by is null),'[]'::jsonb));
end$$;

-- Mã ghép Zalo 6 số: chỉ sinh sau khi phụ huynh đã đăng nhập web. Hết hạn 10 phút, dùng 1 lần.
create or replace function public.mtm_ph_zalo_code(p_session text) returns jsonb language plpgsql security definer set search_path='' as $$
declare ph text=mtm_hw_private.ph_session_phone(p_session);code text;
begin
 if ph is null then raise exception 'Parent session required' using errcode='42501';end if;
 delete from mtm_hw_private.parent_zalo_codes where phone=ph or expires_at<clock_timestamp()-interval '1 day';
 loop
  code=lpad(((('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint)%1000000)::text,6,'0');
  exit when not exists(select 1 from mtm_hw_private.parent_zalo_codes where digest=mtm_hw_private.token_digest('mtm-ph-zalo',code) and used_at is null and expires_at>clock_timestamp());
 end loop;
 insert into mtm_hw_private.parent_zalo_codes(digest,phone,expires_at) values(mtm_hw_private.token_digest('mtm-ph-zalo',code),ph,clock_timestamp()+interval '10 minutes');
 return jsonb_build_object('code',code,'expiresAt',extract(epoch from clock_timestamp()+interval '10 minutes')*1000);
end$$;

-- Bot Zalo (service_role) đổi mã lấy quyền: ghép zalo_id với tài khoản phụ huynh; trả tên + lớp các con đã ghép.
create or replace function public.mtm_ph_zalo_claim(p_code text,p_zalo_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare z record;
begin
 if p_code !~ '^[0-9]{6}$' or p_zalo_id is null or length(p_zalo_id) not between 1 and 128 then return '{"ok":false}'::jsonb;end if;
 update mtm_hw_private.parent_zalo_codes set used_at=clock_timestamp()
 where digest=mtm_hw_private.token_digest('mtm-ph-zalo',p_code) and used_at is null and expires_at>clock_timestamp() returning * into z;
 if z.phone is null then return '{"ok":false}'::jsonb;end if;
 insert into mtm_hw_private.parent_zalo(zalo_id,phone) values(p_zalo_id,z.phone) on conflict(zalo_id) do update set phone=excluded.phone,linked_at=now();
 return jsonb_build_object('ok',true,'children',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'fullName',s.full_name,'className',c.label))
  from mtm_hw_private.parent_links l join mtm_hw_private.students s on s.id=l.student_id join mtm_hw_private.classes c on c.id=s.class_id where l.phone=z.phone and s.active),'[]'::jsonb));
end$$;

-- Bot đọc quyền: zalo_id đã ghép được xem những học sinh nào.
create or replace function public.mtm_ph_zalo_children(p_zalo_id text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'fullName',s.full_name,'className',c.label)),'[]'::jsonb)
 from mtm_hw_private.parent_zalo z join mtm_hw_private.parent_links l on l.phone=z.phone join mtm_hw_private.students s on s.id=l.student_id join mtm_hw_private.classes c on c.id=s.class_id
 where z.zalo_id=p_zalo_id and s.active
$$;

-- Quên PIN: chỉ quản lý lớp đặt lại (xoá PIN + đăng xuất mọi phiên). Phụ huynh ghép lại bằng đủ 4 thông tin và tạo PIN mới.
create or replace function public.mtm_ph_reset_pin(p_parent_phone text) returns jsonb language plpgsql security definer set search_path='' as $$
declare ph text=mtm_hw_private.btvn_phone2(p_parent_phone);n int;
begin
 delete from mtm_hw_private.parent_accounts where phone=ph;get diagnostics n=row_count;
 return jsonb_build_object('ok',n=1);
end$$;

do $$declare f text;begin
 foreach f in array array['mtm_ph_link(text,text,text,text,text,text,text,text)','mtm_ph_login(text,text,text)','mtm_ph_logout(text)','mtm_ph_children(text)',
  'mtm_ph_child_session(text,uuid)','mtm_ph_extras(text,uuid)','mtm_ph_zalo_code(text)','mtm_ph_zalo_claim(text,text)','mtm_ph_zalo_children(text)','mtm_ph_reset_pin(text)'] loop
  execute 'revoke all on function public.'||f||' from public,anon,authenticated';
  execute 'grant execute on function public.'||f||' to service_role';
 end loop;
 foreach f in array array['ph_weak_pin(text)','ph_fail(text,text)','ph_locked(text,text)','ph_new_session(text)','ph_session_phone(text)'] loop
  execute 'revoke all on function mtm_hw_private.'||f||' from public,anon,authenticated';
 end loop;
end$$;
commit;
