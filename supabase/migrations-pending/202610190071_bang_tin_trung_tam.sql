-- 071 (19/10/2026): Bảng tin trung tâm ở đầu Góc học tập (/btvn) sau khi học sinh, phụ huynh đăng nhập.
-- Luồng ảnh: Javis nghe nhóm Zalo lớp -> Edge function mtm-bang-tin (action nhan_anh, header x-mtm-token = MTM_DD_TOKEN)
--   -> ảnh vào bucket RIÊNG TƯ mtm-bang-tin + dòng chờ duyệt -> bước duyệt của công ty (action duyet) -> hiện trên bảng tin.
-- Ảnh gom tự động thành một bài theo (ngày giờ Việt Nam, nhóm Zalo); ngày trùng ngày lễ trong bảng ngay_le thì lấy tên ngày lễ.
-- Web đọc qua /api/bang-tin (bật bằng MTM_BANG_TIN_ENABLED=1): chỉ trả khi phiên BTVN hợp lệ, ảnh là link ký 1 giờ.
-- Gỡ một ảnh khi phụ huynh xin gỡ: action an {photoId} (hoặc update mtm_bang_tin.photos set status='an' where id='<uuid>').
begin;
do $guard$
begin
 if to_regprocedure('mtm_hw_private.btvn_student(text)') is null then raise exception '071 cần các migration BTVN (005) trước'; end if;
end $guard$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mtm-bang-tin','mtm-bang-tin',false,6291456,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=6291456,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create schema if not exists mtm_bang_tin;
revoke all on schema mtm_bang_tin from public,anon,authenticated;

create table mtm_bang_tin.ngay_le(
 day date primary key,
 kind text not null check(kind in('ngay-le','su-kien')),
 title text not null check(char_length(title) between 2 and 120)
);
insert into mtm_bang_tin.ngay_le(day,kind,title) values
 ('2026-10-20','ngay-le','Chúc mừng ngày Phụ nữ Việt Nam 20/10'),
 ('2026-10-31','su-kien','Halloween ở lớp'),
 ('2026-11-20','ngay-le','Ngày Nhà giáo Việt Nam 20/11'),
 ('2026-12-24','su-kien','Giáng sinh ở MTM'),
 ('2026-12-25','su-kien','Giáng sinh ở MTM'),
 ('2027-01-01','ngay-le','Chào năm mới 2027'),
 ('2027-03-08','ngay-le','Quốc tế Phụ nữ 8/3'),
 ('2027-06-01','ngay-le','Quốc tế Thiếu nhi 1/6'),
 ('2027-09-05','su-kien','Khai giảng năm học mới'),
 ('2027-09-15','su-kien','Trung thu ở MTM')
on conflict (day) do nothing;

create table mtm_bang_tin.posts(
 id text primary key check(id ~ '^[a-z0-9-]{1,80}$'),
 kind text not null check(kind in('ngay-le','su-kien','tai-lop','thong-bao')),
 title text not null check(char_length(btrim(title)) between 2 and 120),
 day date not null,
 summary text not null default '' check(char_length(summary)<=1500),
 place text check(place is null or char_length(place)<=120),
 zalo_group text,
 pinned boolean not null default false,
 status text not null default 'cho-duyet' check(status in('cho-duyet','da-dang','an')),
 created_at timestamptz not null default clock_timestamp(),
 published_at timestamptz,
 reviewed_by text
);
create table mtm_bang_tin.photos(
 id uuid primary key default gen_random_uuid(),
 post_id text not null references mtm_bang_tin.posts(id) on delete cascade,
 storage_path text not null unique check(storage_path ~ '^[0-9]{4}-[0-9]{2}/[0-9a-f]{64}\.(jpg|png|webp)$'),
 source_msg text unique check(source_msg is null or char_length(source_msg) between 1 and 200),
 sender_role text check(sender_role is null or char_length(sender_role)<=60),
 alt text not null default 'Ảnh tại MTM' check(char_length(alt)<=200),
 width int check(width is null or width between 1 and 20000),
 height int check(height is null or height between 1 and 20000),
 sent_at timestamptz not null,
 status text not null default 'cho-duyet' check(status in('cho-duyet','da-dang','an')),
 review_note text check(review_note is null or char_length(review_note)<=300),
 created_at timestamptz not null default clock_timestamp()
);
create index photos_post_idx on mtm_bang_tin.photos(post_id,sent_at);
alter table mtm_bang_tin.ngay_le enable row level security;
alter table mtm_bang_tin.posts enable row level security;
alter table mtm_bang_tin.photos enable row level security;
revoke all on all tables in schema mtm_bang_tin from public,anon,authenticated;

create or replace function mtm_bang_tin.slug(p text) returns text language sql immutable set search_path='' as $$
 select coalesce(nullif(trim(both '-' from left(regexp_replace(lower(translate(coalesce(p,''),
  'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ',
  'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD')),
  '[^a-z0-9]+','-','g'),40)),''),'lop')
$$;

-- Javis gửi từng ảnh (qua Edge function). Gọi lại cùng source_msg không tạo dòng mới.
create or replace function public.mtm_bang_tin_nhan_anh(p_group text,p_group_label text,p_source_msg text,p_path text,p_sent_at timestamptz,
 p_sender_role text default null,p_width int default null,p_height int default null,p_caption text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d date=(p_sent_at at time zone 'Asia/Ho_Chi_Minh')::date; le mtm_bang_tin.ngay_le; pid text; ph uuid; label text=left(btrim(coalesce(nullif(p_group_label,''),p_group,'Lớp')),60);
begin
 if p_group is null or p_source_msg is null or p_path is null or p_sent_at is null then raise exception 'Thiếu dữ liệu ảnh' using errcode='22023'; end if;
 select id into ph from mtm_bang_tin.photos where source_msg=p_source_msg;
 if ph is not null then return jsonb_build_object('ok',true,'photoId',ph,'duplicate',true); end if;
 select * into le from mtm_bang_tin.ngay_le where day=d;
 pid=to_char(d,'YYYY-MM-DD')||'-'||mtm_bang_tin.slug(p_group);
 insert into mtm_bang_tin.posts(id,kind,title,day,summary,place,zalo_group)
 values(pid,coalesce(le.kind,'tai-lop'),coalesce(le.title||' · '||label,'Ảnh tại lớp '||label||' ngày '||to_char(d,'DD/MM')),d,'',label,p_group)
 on conflict (id) do nothing;
 insert into mtm_bang_tin.photos(post_id,storage_path,source_msg,sender_role,alt,width,height,sent_at)
 values(pid,p_path,p_source_msg,left(p_sender_role,60),left(coalesce(nullif(btrim(p_caption),''),'Ảnh tại lớp '||label),200),p_width,p_height,p_sent_at)
 on conflict (storage_path) do update set source_msg=coalesce(mtm_bang_tin.photos.source_msg,excluded.source_msg)
 returning id into ph;
 return jsonb_build_object('ok',true,'photoId',ph,'postId',pid);
end$$;

-- Hàng chờ cho bước duyệt (Edge function ký link ảnh trước khi trả).
create or replace function public.mtm_bang_tin_cho_duyet(p_limit int default 60) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('postId',p.id,'kind',p.kind,'title',p.title,'day',p.day,'status',p.status,'place',p.place,
  'photos',(select jsonb_agg(jsonb_build_object('id',f.id,'path',f.storage_path,'alt',f.alt,'sender',f.sender_role,'sentAt',f.sent_at) order by f.sent_at)
            from mtm_bang_tin.photos f where f.post_id=p.id and f.status='cho-duyet')) order by p.day desc),'[]'::jsonb)
 from mtm_bang_tin.posts p
 where exists(select 1 from mtm_bang_tin.photos f where f.post_id=p.id and f.status='cho-duyet')
   and p.id in (select post_id from mtm_bang_tin.photos where status='cho-duyet' group by post_id order by min(sent_at) limit least(greatest(coalesce(p_limit,60),1),200))
$$;

-- Duyệt: đăng các ảnh được chọn (null = mọi ảnh đang chờ), ảnh còn lại của bài chuyển 'an'. Có thể sửa tiêu đề, lời dẫn, loại.
create or replace function public.mtm_bang_tin_duyet(p_post text,p_photo_ids uuid[] default null,p_title text default null,p_summary text default null,
 p_kind text default null,p_pinned boolean default null,p_reviewer text default 'cong-ty',p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n int;
begin
 update mtm_bang_tin.photos set status=case when p_photo_ids is null or id=any(p_photo_ids) then 'da-dang' else 'an' end,review_note=left(p_note,300)
  where post_id=p_post and status='cho-duyet';
 get diagnostics n=row_count;
 update mtm_bang_tin.posts set title=coalesce(nullif(btrim(p_title),''),title),summary=coalesce(p_summary,summary),kind=coalesce(p_kind,kind),
  pinned=coalesce(p_pinned,pinned),reviewed_by=left(p_reviewer,60),
  status=case when exists(select 1 from mtm_bang_tin.photos where post_id=p_post and status='da-dang') then 'da-dang' else status end,
  published_at=case when published_at is null and exists(select 1 from mtm_bang_tin.photos where post_id=p_post and status='da-dang') then clock_timestamp() else published_at end
  where id=p_post;
 if not found then raise exception 'Không có bài %',p_post using errcode='P0002'; end if;
 return jsonb_build_object('ok',true,'reviewed',n);
end$$;

-- Gỡ: cả bài hoặc một ảnh.
create or replace function public.mtm_bang_tin_an(p_post text default null,p_photo uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_photo is not null then update mtm_bang_tin.photos set status='an' where id=p_photo;
 elsif p_post is not null then update mtm_bang_tin.posts set status='an' where id=p_post;
 else raise exception 'Cần bài hoặc ảnh' using errcode='22023'; end if;
 return jsonb_build_object('ok',found);
end$$;

-- Web: bài đã đăng trong 180 ngày, chỉ khi phiên BTVN hợp lệ (btvn_student báo lỗi 42501 nếu không).
create or replace function public.mtm_bang_tin_doc(p_session text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sid uuid=mtm_hw_private.btvn_student(p_session);
begin
 if sid is null then raise exception 'Session required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(x.j order by x.day desc,x.id),'[]'::jsonb) from (
  select p.id,p.day,jsonb_build_object('id',p.id,'kind',p.kind,'title',p.title,'date',to_char(p.day,'YYYY-MM-DD'),'summary',p.summary,'place',p.place,'pinned',p.pinned,
   'photos',(select jsonb_agg(jsonb_build_object('path',f.storage_path,'alt',f.alt,'width',f.width,'height',f.height) order by f.sent_at)
             from (select * from mtm_bang_tin.photos where post_id=p.id and status='da-dang' order by sent_at limit 60) f)) j
  from mtm_bang_tin.posts p
  where p.status='da-dang' and p.day>=(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date-180
    and exists(select 1 from mtm_bang_tin.photos f where f.post_id=p.id and f.status='da-dang')
  order by p.day desc limit 30) x);
end$$;

do $$declare f text;begin foreach f in array array[
 'mtm_bang_tin_nhan_anh(text,text,text,text,timestamptz,text,int,int,text)','mtm_bang_tin_cho_duyet(int)',
 'mtm_bang_tin_duyet(text,uuid[],text,text,text,boolean,text,text)','mtm_bang_tin_an(text,uuid)','mtm_bang_tin_doc(text)'] loop
 execute format('revoke all on function public.%s from public,anon,authenticated',f);
 execute format('grant execute on function public.%s to service_role',f);
end loop;end$$;
commit;
