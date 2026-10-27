-- EXAMPLE ONLY: do not run before approval/time window and external consumer gates.
-- Use an authenticated admin SQL session; replace the class UUID first.
begin;
set local mtm.qa_class_id = 'REPLACE_WITH_VERIFIED_EXISTING_CLASS_UUID';
do $seed$
declare u uuid=mtm_hw_private.admin_id();c mtm_hw_private.classes;
 sid uuid;code text='is-test-qa-'||replace(gen_random_uuid()::text,'-','');
 today text=(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date::text;
 exam jsonb=$exam${
  "id": "mtm-custom-is-test-20261027",
  "title": "IS_TEST - bài QA nội bộ, không dùng cho học sinh",
  "sourceHash": "bb42ee27e87b8e3d0e1a7dda509731a7704184a6c8e1c481a840a411941a9455",
  "versionHash": "bb42ee27e87b8e3d0e1a7dda509731a7704184a6c8e1c481a840a411941a9455",
  "sourceRef": "Fixture QA do Codex soạn tại scripts/fixtures/is-test-exam.json; không phải đề MTM phát hành",
  "sourceUrl": "https://example.invalid/is-test",
  "grade": 11,
  "period": "GK1",
  "durationMinutes": 120,
  "rubricVersion": "MTM-BTVN-10-v1",
  "questionCount": 2,
  "answerKeyVerified": true,
  "rubricVerified": true,
  "publicationVerified": true,
  "questionDisplayVerified": true,
  "sourceMaterial": {
    "title": "IS_TEST nội bộ",
    "publisher": "MTM QA",
    "version": "QA 20261027",
    "locator": "MC01 + SELF01, chỉ dữ liệu tổng hợp"
  },
  "sections": [
    {
      "label": "Kiểm nút nộp",
      "kind": "mc",
      "count": 1
    },
    {
      "label": "Kiểm ảnh thử",
      "kind": "self",
      "count": 1
    }
  ],
  "questions": [
    {
      "id": "qa-mc",
      "kind": "mc",
      "prompt": "Bài thử: 1 + 1 bằng bao nhiêu?",
      "choices": [
        "2",
        "3",
        "4",
        "5"
      ],
      "answer": "A",
      "solution": "1 + 1 = 2.",
      "sourceRef": "QA tự soạn, MC01",
      "maxMillipoints": 10000
    },
    {
      "id": "qa-photo",
      "kind": "self",
      "prompt": "Viết IS_TEST trên giấy trắng, chụp ảnh rồi nộp. Không chụp người hoặc dữ liệu cá nhân.",
      "solution": "Ảnh thử có chữ IS_TEST rõ nét; không chấm điểm chính thức.",
      "sourceRef": "QA tự soạn, SELF01",
      "maxMillipoints": 0
    }
  ]
}$exam$::jsonb;
begin
 select * into strict c from mtm_hw_private.classes
 where id=current_setting('mtm.qa_class_id')::uuid and owner_id=u and active;
 insert into mtm_hw_private.students(owner_id,class_id,full_name,school,school_class,public_alias,source_identity,is_test)
 values(u,c.id,'IS_TEST QA - NO STUDENT DATA','QA INTERNAL','QA',
  'MTM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
  'qa:is-test:'||code,true) returning id into sid;
 insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status,kind,opens_at,closes_at,is_test)
 values(code,u,array[c.id],jsonb_build_object('lessonCode',code,'date',today,'title','IS_TEST QA',
  'classNames',jsonb_build_array(c.label),'classDates',jsonb_build_object(c.label,today)),
  exam,true,'da_dang','kiem-tra-thang',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '45 minutes',true);
 -- Only non-secret identifiers. Do not print codes/JWT/cookies.
 raise notice 'Created QA studentId=%, lessonCode=%',sid,code;
end$seed$;
commit;

-- Separately, in a PRIVATE authenticated administrator session, obtain a login code:
-- select public.mtm_hw_admin_issue_code(p_student_id => '<QA_STUDENT_UUID>'::uuid, p_days => 1);
-- Never paste its output into a report/Brain/chat/commit. This example has NOT been run.
