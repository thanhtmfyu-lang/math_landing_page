-- 069 (19/10/2026): Thi thử HSA miễn phí (/thi-thu-hsa): bảng xếp hạng công khai theo từng đề. CHƯA ÁP.
-- Phụ thuộc 060 (mtm_exam_private.attempts, mtm_exam_start/mtm_exam_submit chấm trên máy chủ). Thứ tự: 060 -> (062) -> 069.
-- Điểm chỉ lấy từ lượt thi máy chủ đã chấm (attempt id + token băm), không bao giờ nhận điểm từ trình duyệt.
-- Luật chống spam: (1) mỗi lượt thi vào bảng tối đa một lần; (2) mỗi đề chỉ tính lượt nộp ĐẦU TIÊN của một thiết bị
-- (device_hash = sha256 do API tính từ mã ngẫu nhiên của trình duyệt); (3) mỗi đề một tên hiển thị chỉ có một dòng
-- (name_key: chữ thường, bỏ dấu); (4) lượt nộp sau hạn quá 2 phút không tính; (5) lượt làm dưới 10% thời gian đề
-- (tối thiểu 60 giây) không tính, chặn kiểu mở lượt rồi nộp ngay đáp án chép sẵn. Không lưu SĐT, IP hay mã thiết bị gốc.
-- RPC chỉ cấp cho service_role, gọi qua /api/hsa-xep-hang (bật bằng MTM_HSA_RANK_ENABLED=1).
-- Ẩn một dòng vi phạm: update mtm_hsa_rank.entries set hidden=true where attempt_id='<uuid>';
-- Thay đề mẫu bằng đề chính thức: seed đề vào mtm_exam_private.exam_keys (static_visible=true, như 062),
-- insert into mtm_hsa_rank.exams(exam_id) values('<id>'); rồi update mtm_hsa_rank.exams set active=false where placeholder;
begin;
do $guard$
begin
 if to_regclass('mtm_exam_private.attempts') is null or to_regclass('mtm_exam_private.exam_keys') is null
  or to_regprocedure('mtm_exam_private.attempt(uuid,text)') is null then
  raise exception '069 cần áp 060_exam_answer_privacy trước';
 end if;
end $guard$;

create schema mtm_hsa_rank;
revoke all on schema mtm_hsa_rank from public,anon,authenticated,service_role;

create table mtm_hsa_rank.exams(
 exam_id text primary key references mtm_exam_private.exam_keys(id),
 active boolean not null default true,
 placeholder boolean not null default false,
 created_at timestamptz not null default now()
);
create table mtm_hsa_rank.entries(
 attempt_id uuid primary key references mtm_exam_private.attempts(id),
 exam_id text not null references mtm_hsa_rank.exams(exam_id),
 display_name text not null check(char_length(display_name) between 2 and 24 and display_name=btrim(display_name)
  and display_name !~* '(https?:|www\.|@|[0-9]{6,}|\.(com|vn|net|org|io|me|xyz|info|link|ly)\M)'),
 name_key text not null check(name_key ~ '^[a-z0-9]([a-z0-9 ]{0,30}[a-z0-9])?$' and char_length(name_key)>=2),
 grade text not null check(grade in('10','11','12','khac')),
 device_hash text not null check(device_hash ~ '^[0-9a-f]{64}$'),
 score_millipoints integer not null check(score_millipoints between 0 and 10000),
 elapsed_ms bigint not null check(elapsed_ms>=0),
 submitted_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),
 hidden boolean not null default false,
 unique(exam_id,device_hash),
 unique(exam_id,name_key)
);
create index mtm_hsa_rank_entries_order on mtm_hsa_rank.entries(exam_id,score_millipoints desc,elapsed_ms,submitted_at) where not hidden;
alter table mtm_hsa_rank.exams enable row level security;
alter table mtm_hsa_rank.entries enable row level security;
revoke all on all tables in schema mtm_hsa_rank from public,anon,authenticated,service_role;

-- Đề mẫu tạm thời (PLACEHOLDER): bài luyện HSA số 1 do MTM biên soạn, đúng bản src/native/chapters/practice-tests.json.
-- static_visible=true cho phép mtm_exam_start mở lượt thi máy chủ; đáp án chỉ trả sau khi nộp (public_exam của 060).
insert into mtm_exam_private.exam_keys(id,exam,static_visible) values('mtm-preview-practice-hsa-01-v1',convert_from(decode('eyJpZCI6Im10bS1wcmV2aWV3LXByYWN0aWNlLWhzYS0wMS12MSIsInNvdXJjZUhhc2giOiJmMjRjY2MwODJjYjc1OTNlNjMxMGU5ODUxNDg2NTQ4YzI1OTI0ZWMyNzY0ZjE0ZjA2MDkxYThjODA0YWQyMGIzIiwic291cmNlUmVmIjoiTVRNIGJpw6puIHNv4bqhbiBt4bubaSDCtyBIU0EgVG/DoW4gwrcgYsOgaSBsdXnhu4duIDEiLCJxdWVzdGlvbkNvdW50Ijo2LCJhbnN3ZXJLZXlWZXJpZmllZCI6dHJ1ZSwicnVicmljVmVyaWZpZWQiOnRydWUsImdyYWRlIjoxMiwicGVyaW9kIjoiR0sxIiwidGl0bGUiOiJIU0EgwrcgVG/DoW4gdsOgIHjhu60gbMOtIHPhu5EgbGnhu4d1IMK3IELDoGkgbHV54buHbiAxIMK3IE1UTSAyMDI24oCTMjAyNyIsImR1cmF0aW9uTWludXRlcyI6MjUsInJ1YnJpY1ZlcnNpb24iOiJNVE0tRkxFWC0xMC12MSIsInNlY3Rpb25zIjpbeyJsYWJlbCI6IkkgwrcgVHLhuq9jIG5naGnhu4dtIiwia2luZCI6Im1jIiwiY291bnQiOjN9LHsibGFiZWwiOiJJSSDCtyDEkMO6bmcvU2FpIiwia2luZCI6InRmIiwiY291bnQiOjF9LHsibGFiZWwiOiJJSUkgwrcgVHLhuqMgbOG7nWkgbmfhuq9uIiwia2luZCI6InNob3J0IiwiY291bnQiOjJ9XSwic291cmNlVXJsIjoiaHR0cHM6Ly93d3cuaHNhLmVkdS52bi9odW9uZy1kYW4vZGFuZy10aHVjLWJhaS10aGkiLCJzb3VyY2VNYXRlcmlhbCI6eyJ0aXRsZSI6IkLDoGkgbHV54buHbiBUb8OhbiBIU0Egc+G7kSAxIGRvIE1UTSBiacOqbiBzb+G6oW4gbeG7m2kiLCJwdWJsaXNoZXIiOiJNaW5oIFRow6BuaCBNYXRoIiwidmVyc2lvbiI6Ik1UTSAyMDI24oCTMjAyNyDCtyB2MSIsImxvY2F0b3IiOiI2IG5ow7NtIGPDonUgdHJvbmcgYXJ0aWZhY3QgbsOgeTsgVVJMIGNo4buJIMSR4buRaSBjaGnhur91IG5ow7NtIGvhu7kgbsSDbmcgY+G7p2Ega+G7syB0aGksIGtow7RuZyBwaOG6o2kgbmd14buTbiBjw6J1IGjhu49pIn0sInB1YmxpY2F0aW9uVmVyaWZpZWQiOnRydWUsInF1ZXN0aW9uRGlzcGxheVZlcmlmaWVkIjp0cnVlLCJhbnN3ZXJWZXJpZmljYXRpb25Ob3RlIjoiS2jDs2EgY2jhuqVtIHbDoCBs4budaSBnaeG6o2kgxJHDoyDEkcaw4bujYyDEkeG7kWkgY2hp4bq/dSDEkeG7mWMgbOG6rXAuIFRoYW5nIGx1eeG7h24gTVRNIDEwIMSRaeG7g20sIMSRw7puZ+KAk3NhaSB0w61uaCDEkWnhu4NtIHRoZW8gc+G7kSDDvSDEkcO6bmc7IGtow7RuZyBwaOG6o2kgxJFp4buDbSBr4buzIHRoaSBIU0EvVFNBIGNow61uaCB0aOG7qWMuIELhuqNuIGx1eeG7h24gdOG6rXAgbsOgeSDEkWFuZyB0aOG7rSB0csOqbiBQQywgY2jGsGEgxJHEg25nIHdlYi4iLCJxdWVzdGlvbnMiOlt7ImlkIjoiaHNhLXAxLW1jMSIsImtpbmQiOiJtYyIsInBhcnQiOjEsIm51bWJlciI6MSwic291cmNlUmVmIjoiTVRNIGJpw6puIHNv4bqhbiBt4bubaSDCtyBoc2EtcDEtbWMxIiwicHJvbXB0IjoiTeG7mXQgc+G6o24gcGjhuqltIMSRxrDhu6NjIHTEg25nIGdpw6EgJDIwXFwlJCBzbyB24bubaSBnacOhIGJhbiDEkeG6p3UsIHNhdSDEkcOzIGdp4bqjbSAkMTBcXCUkIHRyw6puIGdpw6EgduG7q2EgdMSDbmcuIEtow6FjaCB0cuG6oyAkMjcwXFwsMDAwJCDEkeG7k25nLiBHacOhIGJhbiDEkeG6p3UgY+G7p2Egc+G6o24gcGjhuqltIGzDoCBiYW8gbmhpw6p1PyIsImNob2ljZXMiOlsiJDIyNVxcLDAwMCQgxJHhu5NuZyIsIiQyNTBcXCwwMDAkIMSR4buTbmciLCIkMjc1XFwsMDAwJCDEkeG7k25nIiwiJDMwMFxcLDAwMCQgxJHhu5NuZyJdLCJhbnN3ZXIiOiJCIiwic29sdXRpb24iOiJH4buNaSBnacOhIGJhbiDEkeG6p3UgbMOgICR4JCDEkeG7k25nLCAkeD4wJC4gR2nDoSBzYXUga2hpIHTEg25nIGzDoCAkMXssfTJ4JDsgc2F1IGtoaSBnaeG6o20gdGnhur9wIGzDoCAkMHssfTlcXGNkb3Qxeyx9Mng9MXssfTA4eCQuIFRhIGPDsyAkMXssfTA4eD0yNzBcXCwwMDAkLCBzdXkgcmEgJHg9MjUwXFwsMDAwJC4gS2nhu4NtIGzhuqFpOiAkMjUwXFwsMDAwXFxjZG90MXssfTI9MzAwXFwsMDAwJCB2w6AgJDMwMFxcLDAwMFxcY2RvdDB7LH05PTI3MFxcLDAwMCQuIENo4buNbiBCLiBIYWkgdOG7iSBs4buHIHTDoWMgxJHhu5luZyBsacOqbiB0aeG6v3AsIGtow7RuZyBj4buZbmcgdHLhu6sgdHLhu7FjIHRp4bq/cCB0aMOgbmggdMSDbmcgJDEwXFwlJC4iLCJtYXhNaWxsaXBvaW50cyI6MTAwMCwiZGlmZmljdWx0eSI6Ik0yIiwiYXV0aG9yTWF0aENoZWNrZWQiOnRydWUsImNvbnRlbnRTdGF0dXMiOiJJTkRFUEVOREVOVF9NQVRIX1ZFUklGSUVEX1BDX1VJX1FBIn0seyJpZCI6ImhzYS1wMS1tYzIiLCJraW5kIjoibWMiLCJwYXJ0IjoxLCJudW1iZXIiOjIsInNvdXJjZVJlZiI6Ik1UTSBiacOqbiBzb+G6oW4gbeG7m2kgwrcgaHNhLXAxLW1jMiIsInByb21wdCI6Ik3hu5l0IGPDtG5nIHZp4buHYyBjw7Mga2jhu5FpIGzGsOG7o25nIGPhu5EgxJHhu4tuaC4gQSBsw6BtIG3hu5l0IG3DrG5oIHhvbmcgdHJvbmcgJDYkIGdp4budLCBCIGzDoG0gbeG7mXQgbcOsbmggeG9uZyB0cm9uZyAkOSQgZ2nhu507IG7Eg25nIHN14bqldCBj4bunYSBt4buXaSBuZ8aw4budaSBraMO0bmcgxJHhu5VpLiBIYWkgbmfGsOG7nWkgY8O5bmcgbMOgbSAkMiQgZ2nhu50sIHLhu5NpIEIgbmdo4buJLiBU4burIGzDumMgQiBuZ2jhu4ksIEEgY+G6p24gbMOgbSB0aMOqbSBiYW8gbMOidSDEkeG7gyBob8OgbiB0aMOgbmg/IiwiY2hvaWNlcyI6WyIxIGdp4budIDIwIHBow7p0IiwiMiBnaeG7nSIsIjIgZ2nhu50gNDAgcGjDunQiLCIzIGdp4budIl0sImFuc3dlciI6IkMiLCJzb2x1dGlvbiI6IlF1eSDGsOG7m2MgY+G6oyBjw7RuZyB2aeG7h2MgbMOgICQxJC4gTsSDbmcgc3XhuqV0IGPhu6dhIEEgbMOgICRcXGZyYWMxNiQgY8O0bmcgdmnhu4djL2dp4budLCBj4bunYSBCIGzDoCAkXFxmcmFjMTkkIGPDtG5nIHZp4buHYy9naeG7nS4gU2F1ICQyJCBnaeG7nSBjw7luZyBsw6BtLCBraOG7kWkgbMaw4bujbmcgaG/DoG4gdGjDoG5oIGLhurFuZyAkMihcXGZyYWMxNitcXGZyYWMxOSk9XFxmcmFjNTkkLiBQaOG6p24gY8OybiBs4bqhaSBsw6AgJDEtXFxmcmFjNTk9XFxmcmFjNDkkLiBBIGzDoG0gcGjhuqduIG7DoHkgdHJvbmcgJFxcZnJhYzQ5OiBcXGZyYWMxNj1cXGZyYWM4MyQgZ2nhu50sIGLhurFuZyAkMiQgZ2nhu50gJDQwJCBwaMO6dC4gxJDDonkgbMOgIHRo4budaSBnaWFuIHTDrW5oIHThu6sga2hpIEIgbmdo4buJLCBraMO0bmcgcGjhuqNpIHThu5VuZyB0aOG7nWkgZ2lhbi4gQ2jhu41uIEMuIiwibWF4TWlsbGlwb2ludHMiOjEwMDAsImRpZmZpY3VsdHkiOiJNMiIsImF1dGhvck1hdGhDaGVja2VkIjp0cnVlLCJjb250ZW50U3RhdHVzIjoiSU5ERVBFTkRFTlRfTUFUSF9WRVJJRklFRF9QQ19VSV9RQSJ9LHsiaWQiOiJoc2EtcDEtbWMzIiwia2luZCI6Im1jIiwicGFydCI6MSwibnVtYmVyIjozLCJzb3VyY2VSZWYiOiJNVE0gYmnDqm4gc2/huqFuIG3hu5tpIMK3IGhzYS1wMS1tYzMiLCJwcm9tcHQiOiJN4buZdCBuaMOzbSBjw7MgJDQwJCBo4buNYyBzaW5oOiAkMjgkIGLhuqFuIHRoYW0gZ2lhIGhv4bqhdCDEkeG7mW5nIEEsICQyNCQgYuG6oW4gdGhhbSBnaWEgaG/huqF0IMSR4buZbmcgQiwgdsOgICQxNiQgYuG6oW4gdGhhbSBnaWEgY+G6oyBoYWkuIE3hu5dpIGLhuqFuIGPDsyB0aOG7gyB0aGFtIGdpYSBj4bqjIGhhaSBob+G6oXQgxJHhu5luZy4gQ8OzIGJhbyBuaGnDqnUgYuG6oW4ga2jDtG5nIHRoYW0gZ2lhIGhv4bqhdCDEkeG7mW5nIG7DoG8gdHJvbmcgaGFpIGhv4bqhdCDEkeG7mW5nIMSRw7M/IiwiY2hvaWNlcyI6WyIkMiQiLCIkNCQiLCIkNiQiLCIkOCQiXSwiYW5zd2VyIjoiQiIsInNvbHV0aW9uIjoiR+G7jWkgJEEsQiQgbMOgIGhhaSB04bqtcCBo4buNYyBzaW5oIHTGsMahbmcg4bupbmcuIFPhu5EgYuG6oW4gdGh14buZYyDDrXQgbmjhuqV0IG3hu5l0IGhv4bqhdCDEkeG7mW5nIGzDoCAkfEFcXGN1cCBCfD18QXwrfEJ8LXxBXFxjYXAgQnw9MjgrMjQtMTY9MzYkLiBQaOG6o2kgdHLhu6sgJDE2JCB2w6wgY8OhYyBi4bqhbiB0aGFtIGdpYSBj4bqjIGhhaSDEkcOjIMSRxrDhu6NjIGPhu5luZyBoYWkgbOG6p24uIERvIMSRw7MgY8OzICQ0MC0zNj00JCBi4bqhbiBraMO0bmcgdGhhbSBnaWEgaG/huqF0IMSR4buZbmcgbsOgby4gS2nhu4NtIGPDoWMgdsO5bmc6IGNo4buJIEEgY8OzICQxMiQsIGNo4buJIEIgY8OzICQ4JCwgY+G6oyBoYWkgY8OzICQxNiQsIGtow7RuZyB0aGFtIGdpYSBjw7MgJDQkOyB04buVbmcgYuG6sW5nICQ0MCQuIENo4buNbiBCLiIsIm1heE1pbGxpcG9pbnRzIjoxMDAwLCJkaWZmaWN1bHR5IjoiTTIiLCJhdXRob3JNYXRoQ2hlY2tlZCI6dHJ1ZSwiY29udGVudFN0YXR1cyI6IklOREVQRU5ERU5UX01BVEhfVkVSSUZJRURfUENfVUlfUUEifSx7ImlkIjoiaHNhLXAxLXRmMSIsImtpbmQiOiJ0ZiIsInBhcnQiOjIsIm51bWJlciI6MSwic291cmNlUmVmIjoiTVRNIGJpw6puIHNv4bqhbiBt4bubaSDCtyBoc2EtcDEtdGYxIiwicHJvbXB0IjoiQ2hvIGPhuqVwIHPhu5EgY+G7mW5nICQodV9uKSQgduG7m2kgJHVfMT03JCB2w6AgY8O0bmcgc2FpICRkPTMkLiBYw6l0IGPDoWMga2jhurNuZyDEkeG7i25oIHNhdTsgJFNfbiQgbMOgIHThu5VuZyAkbiQgc+G7kSBo4bqhbmcgxJHhuqd1LiIsInN0YXRlbWVudHMiOlsiJHVfNSt1X3sxMn09NTkkLiIsIiRTX3sxMH09MjA1JC4iLCIkdV97MzN9PTEwMCQuIiwiVOG7lW5nIGPDoWMgc+G7kSBo4bqhbmcgY8OzIGNo4buJIHPhu5EgbOG6uyB0cm9uZyAkMjAkIHPhu5EgaOG6oW5nIMSR4bqndSBsw6AgJDM0MCQuIl0sImFuc3dlciI6W3RydWUsdHJ1ZSxmYWxzZSx0cnVlXSwic29sdXRpb24iOiJDw7RuZyB0aOG7qWMgc+G7kSBo4bqhbmcgdOG7lW5nIHF1w6F0OiAkdV9uPTcrMyhuLTEpPTNuKzQkLlxuXG5hKSAkdV81PTE5JCwgJHVfezEyfT00MCQsIG7Dqm4gJHVfNSt1X3sxMn09NTkkOiDEkcO6bmcuXG5cbmIpICR1X3sxMH09MzQkLCBkbyDEkcOzICRTX3sxMH09XFxmcmFjezEwKDcrMzQpfTI9MjA1JDogxJHDum5nLlxuXG5jKSAkdV97MzN9PTNcXGNkb3QzMys0PTEwMyQsIGtow7RuZyBwaOG6o2kgJDEwMCQ6IHNhaS5cblxuZCkgQ8OhYyBjaOG7iSBz4buRIGzhursgbMOgICQxLDMsNSxcXGxkb3RzLDE5JCwgY8OzICQxMCQgc+G7kSBo4bqhbmcuIENow7puZyB04bqhbyBj4bqlcCBz4buRIGPhu5luZyBt4bubaSBjw7Mgc+G7kSBo4bqhbmcgxJHhuqd1ICR1XzE9NyQsIHPhu5EgaOG6oW5nIGN14buRaSAkdV97MTl9PTYxJCwgbsOqbiB04buVbmcgYuG6sW5nICRcXGZyYWN7MTAoNys2MSl9Mj0zNDAkOiDEkcO6bmcuIiwibWF4TWlsbGlwb2ludHMiOjQwMDAsInBvaW50c0J5Q29ycmVjdENvdW50IjpbMCwxMDAwLDIwMDAsMzAwMCw0MDAwXSwiZGlmZmljdWx0eSI6Ik0yIiwiYXV0aG9yTWF0aENoZWNrZWQiOnRydWUsImNvbnRlbnRTdGF0dXMiOiJJTkRFUEVOREVOVF9NQVRIX1ZFUklGSUVEX1BDX1VJX1FBIn0seyJpZCI6ImhzYS1wMS1zaG9ydDEiLCJraW5kIjoic2hvcnQiLCJwYXJ0IjozLCJudW1iZXIiOjEsInNvdXJjZVJlZiI6Ik1UTSBiacOqbiBzb+G6oW4gbeG7m2kgwrcgaHNhLXAxLXNob3J0MSIsInByb21wdCI6IlThu6sgY8OhYyBjaOG7ryBz4buRICQwLDEsMiwzLDQkLCBs4bqtcCDEkcaw4bujYyBiYW8gbmhpw6p1IHPhu5EgdOG7sSBuaGnDqm4gY8OzIGJhIGNo4buvIHPhu5EgxJHDtGkgbeG7mXQga2jDoWMgbmhhdSB2w6AgY2hpYSBo4bq/dCBjaG8gJDUkPyBDaOG7iSBuaOG6rXAgc+G7kSBsxrDhu6NuZy4iLCJtb2RlIjoibnVtZXJpYyIsImFjY2VwdGVkQW5zd2VycyI6WyIxMiJdLCJzb2x1dGlvbiI6IlPhu5EgY2hpYSBo4bq/dCBjaG8gJDUkIHBo4bqjaSBjw7MgY2jhu68gc+G7kSB04bqtbiBjw7luZyBsw6AgJDAkIGhv4bq3YyAkNSQuIFRyb25nIGPDoWMgY2jhu68gc+G7kSDEkcaw4bujYyBj4bqlcCBjaOG7iSBjw7MgJDAkLCBuw6puIGjDoG5nIMSRxqFuIHbhu4sgY+G7kSDEkeG7i25oIGzDoCAkMCQuIEjDoG5nIHRyxINtIGtow7RuZyDEkcaw4bujYyBi4bqxbmcgJDAkLCBjw7MgJDQkIGzhu7FhIGNo4buNbiAkMSwyLDMsNCQuIEjDoG5nIGNo4bulYyBwaOG6o2kga2jDoWMgY2jhu68gc+G7kSBow6BuZyB0csSDbSB2w6Aga2jDoWMgJDAkLCBjw7MgJDMkIGzhu7FhIGNo4buNbi4gVGhlbyBxdXkgdOG6r2MgbmjDom4sIGPDsyAkNFxcY2RvdDM9MTIkIHPhu5EuIEtow7RuZyBs4bqleSBz4buRIGLhuq90IMSR4bqndSBi4bqxbmcgJDAkLiIsIm1heE1pbGxpcG9pbnRzIjoxNTAwLCJkaWZmaWN1bHR5IjoiTTIiLCJhdXRob3JNYXRoQ2hlY2tlZCI6dHJ1ZSwiY29udGVudFN0YXR1cyI6IklOREVQRU5ERU5UX01BVEhfVkVSSUZJRURfUENfVUlfUUEifSx7ImlkIjoiaHNhLXAxLXNob3J0MiIsImtpbmQiOiJzaG9ydCIsInBhcnQiOjMsIm51bWJlciI6Miwic291cmNlUmVmIjoiTVRNIGJpw6puIHNv4bqhbiBt4bubaSDCtyBoc2EtcDEtc2hvcnQyIiwicHJvbXB0IjoiTeG7mXQgxJHGoW4gaMOgbmcgZ+G7k20gJDM2JCBtw7NuLCBjaOG7iSBjw7MgYsO6dCBnacOhICQ4XFwsMDAwJCDEkeG7k25nL23Ds24gdsOgIHbhu58gZ2nDoSAkMTJcXCwwMDAkIMSR4buTbmcvbcOzbi4gVOG7lW5nIHRp4buBbiBsw6AgJDM4NFxcLDAwMCQgxJHhu5NuZywga2jDtG5nIGPDsyBnaeG6o20gZ2nDoSBob+G6t2MgcGjhu6UgcGjDrS4gxJDGoW4gaMOgbmcgY8OzIGJhbyBuaGnDqnUgcXV54buDbiB24bufPyBDaOG7iSBuaOG6rXAgc+G7kSBsxrDhu6NuZy4iLCJtb2RlIjoibnVtZXJpYyIsImFjY2VwdGVkQW5zd2VycyI6WyIyNCJdLCJzb2x1dGlvbiI6Ikfhu41pICR4JCBsw6Agc+G7kSBiw7p0LCAkeSQgbMOgIHPhu5EgduG7nzsgJHgseSQgbMOgIHPhu5Egbmd1ecOqbiBraMO0bmcgw6JtLiBUYSBjw7MgJHgreT0zNiQgdsOgICQ4eCsxMnk9Mzg0JCAoxJHGoW4gduG7iyBuZ2jDrG4gxJHhu5NuZykuIFThu6sgJHg9MzYteSQsIHN1eSByYSAkOCgzNi15KSsxMnk9Mzg0JCwgdOG7qWMgJDI4OCs0eT0zODQkLiBWw6wgduG6rXkgJHk9MjQkLCAkeD0xMiQuIEtp4buDbSBs4bqhaTogJDEyKzI0PTM2JCBtw7NuIHbDoCAkMTJcXGNkb3Q4KzI0XFxjZG90MTI9Mzg0JCBuZ2jDrG4gxJHhu5NuZy4gxJDDoXAgw6FuOiAkMjQkLiIsIm1heE1pbGxpcG9pbnRzIjoxNTAwLCJkaWZmaWN1bHR5IjoiTTIiLCJhdXRob3JNYXRoQ2hlY2tlZCI6dHJ1ZSwiY29udGVudFN0YXR1cyI6IklOREVQRU5ERU5UX01BVEhfVkVSSUZJRURfUENfVUlfUUEifV0sInZlcnNpb25IYXNoIjoiMTg5OWE1MzZiMTljZDhiOWYwNzkxODViZTE3NjRhZjc3NTVkZWFkZjRkMmI5OTNjNGRhZTNhODFhMzI1MTZmMiJ9','base64'),'UTF8')::jsonb,true) on conflict(id) do nothing;
insert into mtm_hsa_rank.exams(exam_id,placeholder) values('mtm-preview-practice-hsa-01-v1',true) on conflict(exam_id) do nothing;

-- Top N công khai: chỉ tên hiển thị đã lọc, lớp, điểm, thời gian làm, ngày nộp (giờ Việt Nam).
create function public.mtm_hsa_rank_top(p_exam text,p_limit integer default 50) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('open',exists(select 1 from mtm_hsa_rank.exams x where x.exam_id=p_exam and x.active),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('rank',r.n,'name',r.display_name,'grade',r.grade,'score',r.score_millipoints,
     'seconds',(r.elapsed_ms+500)/1000,'date',to_char(r.submitted_at at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD')) order by r.n)
   from (select e.*,row_number() over(order by e.score_millipoints desc,e.elapsed_ms,e.submitted_at,e.attempt_id) n
     from mtm_hsa_rank.entries e where e.exam_id=p_exam and not e.hidden) r
   where r.n<=least(greatest(coalesce(p_limit,50),1),100)),'[]'::jsonb));
$$;

-- Ghi một dòng từ lượt thi đã nộp. Tên, name_key và device_hash do API chuẩn hóa; bảng còn tự kiểm lại.
create function public.mtm_hsa_rank_submit(p_exam text,p_attempt uuid,p_token text,p_name text,p_name_key text,p_grade text,p_device_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t mtm_exam_private.attempts;e mtm_hsa_rank.entries;elapsed bigint;pos integer;fresh boolean=false;
begin
 if not exists(select 1 from mtm_hsa_rank.exams x where x.exam_id=p_exam and x.active) then return jsonb_build_object('status','closed');end if;
 t=mtm_exam_private.attempt(p_attempt,p_token);
 if t.version_id is distinct from p_exam then raise exception 'Attempt unavailable' using errcode='42501';end if;
 if t.submitted_at is null or t.score is null then return jsonb_build_object('status','not_submitted');end if;
 select * into e from mtm_hsa_rank.entries x where x.attempt_id=t.id;
 if not found then
  if t.submitted_at>t.deadline+interval '2 minutes' then return jsonb_build_object('status','late');end if;
  elapsed=greatest(0,floor(extract(epoch from(least(t.submitted_at,t.deadline)-t.started_at))*1000))::bigint;
  if elapsed<greatest(60000,floor(extract(epoch from(t.deadline-t.started_at))*100))::bigint then return jsonb_build_object('status','fast');end if;
  if exists(select 1 from mtm_hsa_rank.entries x where x.exam_id=p_exam and x.device_hash=p_device_hash) then return jsonb_build_object('status','device');end if;
  if exists(select 1 from mtm_hsa_rank.entries x where x.exam_id=p_exam and x.name_key=p_name_key) then return jsonb_build_object('status','name');end if;
  begin
   insert into mtm_hsa_rank.entries(attempt_id,exam_id,display_name,name_key,grade,device_hash,score_millipoints,elapsed_ms,submitted_at)
   values(t.id,p_exam,p_name,p_name_key,p_grade,p_device_hash,(t.score->>'finalMillipoints')::integer,elapsed,t.submitted_at) returning * into e;
  exception when unique_violation then
   return jsonb_build_object('status',case when exists(select 1 from mtm_hsa_rank.entries x where x.attempt_id=t.id) then 'already'
    when exists(select 1 from mtm_hsa_rank.entries x where x.exam_id=p_exam and x.device_hash=p_device_hash) then 'device' else 'name' end);
  end;
  fresh=true;
 end if;
 select count(*)+1 into pos from mtm_hsa_rank.entries x where x.exam_id=e.exam_id and not x.hidden and x.attempt_id<>e.attempt_id
  and (x.score_millipoints,-x.elapsed_ms,-extract(epoch from x.submitted_at))>(e.score_millipoints,-e.elapsed_ms,-extract(epoch from e.submitted_at));
 return jsonb_build_object('status',case when fresh then 'accepted' else 'already' end,'rank',case when e.hidden then null else pos end,
  'score',e.score_millipoints,'seconds',(e.elapsed_ms+500)/1000);
end $$;

revoke all on function public.mtm_hsa_rank_top(text,integer),public.mtm_hsa_rank_submit(text,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.mtm_hsa_rank_top(text,integer),public.mtm_hsa_rank_submit(text,uuid,text,text,text,text,text) to service_role;
commit;
