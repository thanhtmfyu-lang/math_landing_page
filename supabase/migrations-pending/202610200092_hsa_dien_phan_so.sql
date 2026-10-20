-- 092 (20/10/2026): Đề thi thử HSA MTM 01, 02: 16 câu điền theo quy chế HSA (chỉ nhập số nguyên hoặc phân số tối giản). CHƯA ÁP.
-- Tệp này KHÔNG chứa đáp án (kho công khai): chỉ có đề bài mới (vốn công khai trên web) và hàm áp.
-- Cách áp (Javis, qua luồng Công ty AI):
--   1. Chạy cả tệp này (tạo bảng đề mới + 2 hàm).
--   2. Tự giải độc lập 16 câu trong bảng mtm_exam_private.hsa092_cau, rồi chạy MỘT lệnh:
--        select mtm_exam_private.hsa092_ap('{"HSA01-11":"…","HSA01-12":"…", … đủ 16 câu}'::jsonb);
--      Đáp số: số nguyên hoặc phân số tối giản a/b (b>1). Đáp số chỉ nằm trong lệnh này, không ghi vào kho.
--   3. Báo 16 đáp số về luồng Phòng thi thử để Claude đối chiếu với bản đã kiểm bằng SymPy.
-- Hàm tự sao lưu 2 khóa cũ (mtm_exam_private.exam_keys_bak_092) trước khi sửa; hoàn tác: select mtm_exam_private.hsa092_hoan_tac();
-- Không đụng bảng xếp hạng (mtm_hsa_rank), không chấm lại bài đã nộp.
begin;
create table if not exists mtm_exam_private.hsa092_cau(exam_id text not null,id text primary key,prompt text not null);
revoke all on mtm_exam_private.hsa092_cau from public;
delete from mtm_exam_private.hsa092_cau;
insert into mtm_exam_private.hsa092_cau(exam_id,id,prompt) values
('mtm-hsa-thi-thu-01','HSA01-11',$cau$Cho hàm số $f(x)$ có đạo hàm liên tục trên $[0;1]$, thỏa mãn $f(1)=0$, $\int_0^1\left[f'(x)\right]^2dx=5$ và $\int_0^1xf(x)\,dx=\dfrac12$. Tính $\int_0^1f(x)\,dx$ (nhập kết quả dạng số nguyên hoặc phân số tối giản).$cau$),
('mtm-hsa-thi-thu-01','HSA01-12',$cau$Một bồn chứa nước dạng hình trụ được đặt nằm ngang, bán kính đáy $1$ m, chiều dài $4$ m. Mực nước trong bồn cao $0{,}5$ m (tính từ điểm thấp nhất của bồn). Thể tích nước trong bồn bằng bao nhiêu lít? (Làm tròn kết quả đến hàng đơn vị.)$cau$),
('mtm-hsa-thi-thu-01','HSA01-25',$cau$Ở một vùng, tỉ lệ người mắc bệnh X là $2\%$. Một xét nghiệm cho kết quả dương tính với $95\%$ người mắc bệnh và cho kết quả dương tính (sai) với $4\%$ người không mắc bệnh. Một người được xét nghiệm hai lần (kết quả hai lần độc lập với nhau khi đã biết tình trạng bệnh) và cả hai lần đều dương tính. Xác suất người đó thực sự mắc bệnh bằng $a\%$. Tìm $a$ (làm tròn đến hàng đơn vị).$cau$),
('mtm-hsa-thi-thu-01','HSA01-27',$cau$Gieo đồng thời $3$ con xúc xắc cân đối, đồng chất. Tính xác suất để tích số chấm xuất hiện trên ba con xúc xắc chia hết cho $6$ (nhập kết quả dạng số nguyên hoặc phân số tối giản).$cau$),
('mtm-hsa-thi-thu-01','HSA01-34',$cau$Số phút đi bộ mỗi ngày của $50$ người được cho dưới dạng mảng ghép nhóm:
nhóm = $[[0,6),[6,12),[12,18),[18,24),[24,30)]$; tần số = $[4, x, 15, y, 6]$ với $x,y$ là số tự nhiên.
Biết số trung bình của mẫu số liệu ghép nhóm bằng $15{,}36$. Tìm mốt của mẫu số liệu (nhập kết quả dạng số nguyên hoặc phân số tối giản).$cau$),
('mtm-hsa-thi-thu-01','HSA01-38',$cau$Một mẫu số liệu gồm $10$ giá trị có số trung bình bằng $8$ và phương sai bằng $4$. Bổ sung thêm hai giá trị $5$ và $11$ vào mẫu. Tính phương sai của mẫu số liệu mới (nhập kết quả dạng số nguyên hoặc phân số tối giản).$cau$),
('mtm-hsa-thi-thu-01','HSA01-46',$cau$Cho hình chóp tứ giác đều có cạnh đáy bằng $6$ và cạnh bên tạo với mặt phẳng đáy một góc $60^\circ$. Thể tích khối chóp bằng $a\sqrt6$. Tìm $a$.$cau$),
('mtm-hsa-thi-thu-02','HSA02-07',$cau$Một hàng rào cao $2$ m chạy song song với bức tường của một tòa nhà và cách tường $1$ m. Người ta đặt một chiếc thang thẳng: chân thang đặt trên mặt đất phía ngoài hàng rào, thân thang tựa lên đỉnh hàng rào và đầu thang chạm vào tường. Chiều dài ngắn nhất của chiếc thang bằng bao nhiêu xăng-ti-mét? (Bỏ qua bề dày hàng rào; làm tròn kết quả đến hàng đơn vị.)$cau$),
('mtm-hsa-thi-thu-02','HSA02-12',$cau$Mặt trước của một cổng chào có dạng hình phẳng giới hạn bởi một đường parabol và mặt đất; chân cổng rộng $8$ m, đỉnh cổng cao $6$ m. Người ta làm một cửa ra vào hình chữ nhật có hai đỉnh nằm trên mặt đất, hai đỉnh còn lại nằm trên parabol, sao cho diện tích cửa lớn nhất. Phần còn lại của mặt trước cổng được ốp trang trí. Tính diện tích phần ốp trang trí (đơn vị: dm², làm tròn đến hàng đơn vị).$cau$),
('mtm-hsa-thi-thu-02','HSA02-20',$cau$Đầu mỗi tháng, một người gửi vào ngân hàng $5$ triệu đồng theo hình thức lãi kép với lãi suất $0{,}5\%$/tháng (lãi được nhập vào gốc vào cuối mỗi tháng; lãi suất không đổi; người đó không rút tiền). Ngay sau khi nhận lãi của tháng thứ $24$, tổng số tiền người đó có trong tài khoản là bao nhiêu nghìn đồng? (Làm tròn kết quả đến hàng đơn vị.)$cau$),
('mtm-hsa-thi-thu-02','HSA02-26',$cau$Sau khi tiêm, nồng độ một loại thuốc trong máu giảm theo hàm mũ $C(t)=C_0e^{-kt}$ ($t$ tính bằng giờ, $k>0$), với chu kỳ bán thải là $4$ giờ (cứ sau $4$ giờ nồng độ giảm còn một nửa). Ngay sau khi tiêm, nồng độ là $120$ mg/L; thuốc chỉ có tác dụng khi nồng độ không dưới $25$ mg/L. Thời gian thuốc có tác dụng kể từ lúc tiêm là bao nhiêu phút? (Làm tròn kết quả đến hàng đơn vị.)$cau$),
('mtm-hsa-thi-thu-02','HSA02-35',$cau$Tính độ lệch chuẩn của mẫu số liệu ghép nhóm về thời gian giao hàng của công ty Y (đơn vị: phút; nhập kết quả dạng số nguyên hoặc phân số tối giản).$cau$),
('mtm-hsa-thi-thu-02','HSA02-37',$cau$Thời gian (phút) hoàn thành một bài kiểm tra trực tuyến của một nhóm học sinh được cho theo bảng sau, trong đó $x$ là số nguyên dương chưa biết. Biết trung vị của mẫu số liệu ghép nhóm bằng $24$. Tính tứ phân vị thứ ba $Q_3$ của mẫu số liệu (đơn vị: phút; nhập kết quả dạng số nguyên hoặc phân số tối giản).$cau$),
('mtm-hsa-thi-thu-02','HSA02-40',$cau$Kết quả khảo sát $500$ người trưởng thành về thói quen tập thể dục và tình trạng huyết áp được cho theo bảng sau. Chọn ngẫu nhiên một người trong $500$ người được khảo sát. Biết rằng người được chọn bị huyết áp cao, tính xác suất người đó có tập thể dục thường xuyên (nhập kết quả dạng số nguyên hoặc phân số tối giản).$cau$),
('mtm-hsa-thi-thu-02','HSA02-42',$cau$Để đo chiều cao của một tháp truyền hình $CD$ ($C$ là chân tháp, $D$ là đỉnh tháp, $CD$ vuông góc với mặt đất phẳng) mà không đến được chân tháp, người ta chọn hai điểm $A$, $B$ trên mặt đất cách nhau $50$ m và đo được $\widehat{CAB}=70^\circ$, $\widehat{CBA}=60^\circ$; từ $A$ nhìn lên đỉnh tháp được góc nâng $\widehat{DAC}=32^\circ$. Tính chiều cao $CD$ của tháp (đơn vị: m; bỏ qua chiều cao dụng cụ đo; làm tròn kết quả đến hàng đơn vị).$cau$),
('mtm-hsa-thi-thu-02','HSA02-50',$cau$Gieo một con xúc xắc cân đối và đồng chất $4$ lần liên tiếp. Tính xác suất để số chấm xuất hiện ở mỗi lần gieo (từ lần thứ hai) không nhỏ hơn số chấm xuất hiện ở lần gieo liền trước (nhập kết quả dạng số nguyên hoặc phân số tối giản).$cau$);
create table if not exists mtm_exam_private.exam_keys_bak_092 as select * from mtm_exam_private.exam_keys where false;
revoke all on mtm_exam_private.exam_keys_bak_092 from public;

create or replace function mtm_exam_private.hsa092_ap(p_dap_an jsonb) returns text
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r record;v text;n bigint;d bigint;a bigint;b bigint;t bigint;
begin
 if (select count(*) from jsonb_object_keys(p_dap_an))<>16 or exists(select 1 from mtm_exam_private.hsa092_cau c where not p_dap_an ? c.id) then raise exception '092: cần đúng 16 đáp số theo mã câu trong hsa092_cau'; end if;
 for r in select key,value from jsonb_each_text(p_dap_an) loop
  v:=r.value;
  if v !~ '^-?[0-9]{1,12}(/[0-9]{1,12})?$' then raise exception '092: % đáp số "%" phải là số nguyên hoặc phân số a/b',r.key,v; end if;
  if v like '%/%' then
   n:=abs(split_part(v,'/',1)::bigint);d:=split_part(v,'/',2)::bigint;a:=n;b:=d;
   while b<>0 loop t:=a%b;a:=b;b:=t; end loop;
   if d<2 or a<>1 then raise exception '092: % phân số "%" chưa tối giản',r.key,v; end if;
  end if;
 end loop;
 if not exists(select 1 from mtm_exam_private.exam_keys_bak_092) then
  insert into mtm_exam_private.exam_keys_bak_092 select * from mtm_exam_private.exam_keys where id in('mtm-hsa-thi-thu-01','mtm-hsa-thi-thu-02');
 end if;
 if (select count(*) from mtm_exam_private.exam_keys_bak_092)<>2 then raise exception '092: chưa sao lưu đủ 2 khóa cũ'; end if;
 update mtm_exam_private.exam_keys k set exam=jsonb_set(k.exam,'{questions}',(
   select jsonb_agg(case when c.id is null then q.e else q.e||jsonb_build_object(
     'prompt',c.prompt,
     'mode',case when p_dap_an->>c.id like '%/%' then 'rational' else 'numeric' end,
     'acceptedAnswers',jsonb_build_array(p_dap_an->>c.id),
     'solution',regexp_replace(q.e->>'solution','\s*(Đáp số|Đáp án)\s*:[^\n]*$','')||E'\n'||'Đáp số theo quy chế HSA (số nguyên hoặc phân số tối giản): '||(p_dap_an->>c.id)||'.')
   end order by q.o)
   from jsonb_array_elements(k.exam->'questions') with ordinality q(e,o)
   left join mtm_exam_private.hsa092_cau c on c.id=q.e->>'id'))
   ||jsonb_build_object('versionHash',case k.id when 'mtm-hsa-thi-thu-01' then '70d719eb912487953394789cc4c926246389fb7c8cbd44e2b198bc3e7a668920' when 'mtm-hsa-thi-thu-02' then '83171a4d30273c05ca394aab0e4c7494dc93ddf44e4cfdfed433d97f229b69ab' end,'sourceHash',case k.id when 'mtm-hsa-thi-thu-01' then '82c6a75c4516c9c7c2e34e92d25a8b09a16886fc1f4486bb38999f43e4314cf4' when 'mtm-hsa-thi-thu-02' then 'c57d7293e44d45cb89fce545e62a37fd425678c4d292dbb735d498fa18014a46' end)
 where k.id in('mtm-hsa-thi-thu-01','mtm-hsa-thi-thu-02');
 if (select count(*) from mtm_exam_private.exam_keys k join mtm_exam_private.hsa092_cau c on c.exam_id=k.id
     where exists(select 1 from jsonb_array_elements(k.exam->'questions') e where e->>'id'=c.id and e->>'prompt'=c.prompt and e->'acceptedAnswers'->>0=p_dap_an->>c.id))<>16
 then raise exception '092: chưa thay đủ 16 câu'; end if;
 return '092: đã thay 16 câu điền, versionHash 01=70d719eb9124…, 02=83171a4d3027…';
end $$;
revoke all on function mtm_exam_private.hsa092_ap(jsonb) from public;

create or replace function mtm_exam_private.hsa092_hoan_tac() returns text
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if (select count(*) from mtm_exam_private.exam_keys_bak_092)<>2 then raise exception '092: thiếu bản sao lưu'; end if;
 update mtm_exam_private.exam_keys k set exam=b.exam from mtm_exam_private.exam_keys_bak_092 b where k.id=b.id;
 return '092: đã trả 2 khóa HSA về bản cũ';
end $$;
revoke all on function mtm_exam_private.hsa092_hoan_tac() from public;
commit;
