/** Scratch PostgreSQL only. Verify the real preview migration with synthetic
 * rows matching the native upload, publication receipt and asset protocol. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const migrations=process.env.MTM_ROOT+'/supabase/migrations-pending/';
const authority=readFileSync(migrations+'202611130110_lesson_assessment.sql','utf8');
const currentUpload=authority.match(/create or replace function mtm_hw_private\.lesson_upload_current\(u mtm_hw_private\.lesson_uploads\)[\s\S]*?\$\$;/)?.[0];
assert(currentUpload);
const uid=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [manager,teacher,otherTeacher,disabled,needsPassword,stranger]=[1,2,3,4,5,6].map(uid);
const [classA,classB,qaClass]=[11,12,13].map(uid);
const source='a'.repeat(64),source2='b'.repeat(64),cropSha='c'.repeat(64),pdfSha='d'.repeat(64),answerSha='e'.repeat(64);
const questionPath='crop/q1.png',answerCrop='crop/solution.png',pdfPath='exam-assets/'+pdfSha+'.pdf',answerPdf='exam-assets/'+answerSha+'.pdf';
const crop={path:questionPath,sha256:cropSha,width:720,height:330,sourcePage:1};
const hidden='MUST_NOT_APPEAR_IN_STAFF_PREVIEW';

try{
 await db.exec(`
  create role authenticated;
  create role anon;
  create role service_role bypassrls;
  alter default privileges grant execute on functions to anon,service_role;
  create schema auth;
  create schema mtm_hw_private;
  create function auth.uid() returns uuid language sql stable as $$
   select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  create table public.mtm_staff(user_id uuid primary key,role text not null,teacher_key text,active boolean not null,must_change_password boolean not null);
  create table mtm_hw_private.classes(id uuid primary key,label text not null,active boolean not null,is_test boolean not null);
  create table mtm_hw_private.lesson_uploads(id uuid primary key,work_kind text not null,assessment_id uuid,is_test boolean not null,
   class_ids uuid[] not null,class_dates jsonb not null,class_names jsonb not null,lesson_date date not null,
   teacher_key text not null,group_key text not null,version int not null,created_at timestamptz not null,title text not null,
   homework_path text,homework2_path text,checkpoint jsonb not null default '{}');
  create table mtm_hw_private.lesson_upload_steps(upload_id uuid,step int,status text,primary key(upload_id,step));
  create table mtm_hw_private.lesson_upload_paper2_steps(like mtm_hw_private.lesson_upload_steps including all);
  create table mtm_hw_private.btvn_lessons(code text primary key,kind text not null,assessment_id uuid,is_test boolean not null,
   active boolean not null,publish_status text not null,class_ids uuid[] not null,material jsonb not null,
   exam jsonb,assets jsonb,source_version text);
  create table mtm_hw_private.btvn_second_papers(lesson_code text primary key,exam jsonb,assets jsonb,source_version text);
 `);
 await db.exec(currentUpload);
 await db.exec(readFileSync(migrations+'202611200120_lesson_published_preview.sql','utf8'));
 await db.query("insert into public.mtm_staff values ($1,'ql',null,true,false),($2,'gv','teacher-a',true,false),($3,'gv','teacher-b',true,false),($4,'ql',null,false,false),($5,'admin',null,true,true)",[manager,teacher,otherTeacher,disabled,needsPassword]);
 await db.query("insert into mtm_hw_private.classes values ($1,'Lớp thử A',true,false),($2,'Lớp thử B',true,false),($3,'Lớp QA',true,true)",[classA,classB,qaClass]);

 type Fixture={id:string;day:string;classId?:string;name?:string;exam?:boolean;assessment?:string;test?:boolean;pair?:boolean;materials?:boolean;pending?:boolean;version?:number};
 function content(title:string){return {
  id:'staff-preview-fixture',title,grade:11,period:'GK1',durationMinutes:30,questionCount:3,
  versionHash:source,sourceHash:source,sourceRef:'Phiếu 1',rubricVersion:'MTM-BTVN-10-v1',issue:hidden,
  sections:[{label:'Trắc nghiệm',kind:'mc',count:1,solution:hidden},{label:'Đúng sai',kind:'tf',count:1},{label:'Trả lời ngắn',kind:'short',count:1}],
  sourceMaterial:{title:'Đề mẫu',publisher:'MTM',locator:'Trang 1',answer:hidden},
  sourceInstructions:[{...crop,privateUrl:hidden,extra:hidden}],solutionInstructions:[{...crop,path:answerCrop,sha256:answerSha}],
  sourcePdf:{url:'/'+pdfPath,sha256:pdfSha,bytes:130,totalPages:1,questionPages:[1],verified:true,solution:hidden},
  mtmDocuments:{questions:{url:'/'+pdfPath,sha256:pdfSha,extra:hidden},solutions:{url:'/'+answerPdf,sha256:answerSha}},
  questions:[
   {id:'q1',kind:'mc',sourceRef:'Câu 1',prompt:'Tính 2+2',choices:['2','3','4','5'],answer:'C',solution:hidden,
    maxPoints:{numerator:'10',denominator:'3',solution:hidden},sourcePdfPage:1,
    sourceContent:{questions:[{...crop,privateUrl:hidden,alt:hidden}],solutions:[{...crop,path:answerCrop,sha256:answerSha}]}},
   {id:'q2',kind:'tf',sourceRef:'Câu 2',statements:['2+2=4','2+2=5','2+2=3','2+2=1'],answer:[true,false,false,false],solution:hidden},
   {id:'q3',kind:'short',sourceRef:'Câu 3',text:'Nhập tổng 2+2',mode:'numeric',acceptedAnswers:['4'],shortRule:{answer:hidden},solutionBlocks:[{text:hidden}]}
  ]
 };}
 function assets(code:string,version:string){
  const asset=(path:string,sha256:string)=>({path,sha256,storage_path:'btvn/'+code+'/'+version+'/'+path,content_type:path.endsWith('.png')?'image/png':'application/pdf',bytes:130});
  return [
   asset(questionPath,cropSha),asset(pdfPath,pdfSha),asset(answerCrop,answerSha),asset(answerPdf,answerSha),
   {...asset(questionPath,cropSha),storage_path:'btvn/foreign/'+version+'/'+questionPath,extra:hidden}
  ];
 }
 async function fixture(spec:Fixture){
  const classId=spec.classId??classA,name=spec.name??'Lớp thử A';
  const code=spec.materials?'sheet-existing-homework':'web-'+spec.id.replaceAll('-','');
  const checkpoint=spec.pending?{}:{publish_receipts:{[classId]:{lesson_code:code,receipt:{status:spec.materials?'updated':'da_dang'}}}};
  await db.query(`insert into mtm_hw_private.lesson_uploads(id,work_kind,assessment_id,is_test,class_ids,class_dates,class_names,
   lesson_date,teacher_key,group_key,version,created_at,title,homework_path,homework2_path,checkpoint)
   values($1,$2,$3,$4,$5,$6,$7,$8,'teacher-a',$9,$10,$11,'Nội dung gốc',$12,$13,$14)`,
   [spec.id,spec.exam?'exam':'homework',spec.assessment??null,!!spec.test,[classId],JSON.stringify({[classId]:spec.day}),
    JSON.stringify({[classId]:name}),spec.day,classId+spec.day,spec.version??1,spec.day+'T12:00:00Z',spec.materials?null:'source.pdf',spec.pair?'source2.pdf':null,JSON.stringify(checkpoint)]);
  if(spec.pending)return code;
  await db.query("insert into mtm_hw_private.lesson_upload_steps values($1,6,'xong')",[spec.id]);
  await db.query("insert into mtm_hw_private.btvn_lessons values($1,$2,$3,$4,true,'da_dang',$5,$6,$7,$8,$9)",
   [code,spec.exam?'kiem-tra':'btvn',spec.assessment??null,!!spec.test,[classId],
    JSON.stringify({date:spec.day,classDates:{[name]:spec.day}}),JSON.stringify(content(spec.exam?'Đề kiểm tra':'Bài tập')),JSON.stringify(assets(code,source)),source]);
  if(spec.pair){
   await db.query("insert into mtm_hw_private.lesson_upload_paper2_steps values($1,6,'xong')",[spec.id]);
   await db.query("insert into mtm_hw_private.btvn_second_papers values($1,$2,$3,$4)",[code,JSON.stringify(content('Đề BTVN số 2')),JSON.stringify(assets(code,source2)),source2]);
  }
  return code;
 }

 async function preview(upload:string,who=teacher,classId=classA,paper=1,isTest=false,role='authenticated'){
  return db.transaction(async tx=>{
   await tx.exec('set transaction read only; set local role '+role);
   await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[who]);
   return (await tx.query<{result:any}>('select public.mtm_lesson_published_preview($1,$2,$3,$4) result',[upload,classId,paper,isTest])).rows[0].result;
  });
 }
 const [homework,pair,exam,qa,materials,pending,unconfirmed,stale]=[21,22,23,24,25,26,27,28].map(uid);
 const assessment=uid(40);
 const homeCode=await fixture({id:homework,day:'2026-11-12'});
 const pairCode=await fixture({id:pair,day:'2026-11-13',pair:true});
 const examCode=await fixture({id:exam,day:'2026-11-14',exam:true,assessment});
 const shared=uid(30),sharedDay='2026-11-23';
 const sharedCode=await fixture({id:shared,day:sharedDay});
 await db.query(`update mtm_hw_private.lesson_uploads set class_ids=array[$2::uuid,$3::uuid],
  class_dates=class_dates||jsonb_build_object($3::text,$4::text),
  class_names=class_names||jsonb_build_object($3::text,'Lớp thử B'),
  checkpoint=jsonb_set(checkpoint,'{publish_receipts}',(checkpoint->'publish_receipts')||
    jsonb_build_object($3::text,checkpoint->'publish_receipts'->$2::text)) where id=$1`,[shared,classA,classB,sharedDay]);
 await db.query(`update mtm_hw_private.btvn_lessons set class_ids=array[$2::uuid,$3::uuid],
  material=jsonb_set(material,'{classDates}',(material->'classDates')||jsonb_build_object('Lớp thử B',$4::text))
  where code=$1`,[sharedCode,classA,classB,sharedDay]);
 await fixture({id:uid(31),day:sharedDay,version:2,pending:true});
 await fixture({id:qa,day:'2026-11-15',classId:qaClass,name:'Lớp QA',test:true});
 await fixture({id:materials,day:'2026-11-16',materials:true});
 await fixture({id:pending,day:'2026-11-17',pending:true});
 await fixture({id:unconfirmed,day:'2026-11-18'});
 await fixture({id:stale,day:'2026-11-19'});
 await fixture({id:uid(29),day:'2026-11-19',version:2,pending:true});

 const home=await preview(homework);
 assert.equal(home.lessonCode,homeCode);
 assert.equal(home.kind,'homework');
 assert.equal(home.className,'Lớp thử A');
 assert.equal(home.exam.responseMode,'questions-only');
 assert.deepEqual(home.exam.questions[0].choices,['2','3','4','5']);
 assert.deepEqual(home.exam.questions[0].sourceContent.questions,[crop]);
 assert.equal(home.exam.questions[1].statements.length,4);
 assert.equal(home.exam.questions[2].mode,'numeric');
 assert.deepEqual(home.exam.sourcePdf.questionPages,[1]);
 assert.equal(home.exam.mtmDocuments.questions.url,'/'+pdfPath);
 assert.deepEqual(home.assets.map((asset:{path:string})=>asset.path).sort(),[questionPath,pdfPath].sort());
 assert(!JSON.stringify(home).includes(hidden));
 assert(!Object.hasOwn(home.exam.questions[0],'answer'));
 assert(!Object.hasOwn(home.exam.questions[2],'acceptedAnswers'));
 assert(!Object.hasOwn(home.exam.mtmDocuments,'solutions'));

 assert.equal((await preview(homework,manager)).lessonCode,homeCode);
 assert.equal((await preview(pair)).lessonCode,pairCode);
 const second=await preview(pair,teacher,classA,2);
 assert.equal(second.lessonCode,pairCode);
 assert.equal(second.title,'Đề BTVN số 2');
 assert.equal(second.sourceVersion,source2);
 assert(second.assets.every((a:{storage_path:string})=>a.storage_path.includes('/'+source2+'/')));
 assert.equal((await preview(exam)).lessonCode,examCode);
 assert.equal((await preview(exam)).kind,'exam');
 assert.equal((await preview(qa,manager,qaClass,1,true)).className,'Lớp QA');
 assert.equal((await preview(materials)).lessonCode,'sheet-existing-homework');
 assert.equal((await preview(shared,teacher,classB)).lessonCode,sharedCode);

 for(const wrong of [otherTeacher,disabled,needsPassword,stranger,''])await assert.rejects(preview(homework,wrong),{code:'42501'});
 for(const role of ['anon','service_role'])await assert.rejects(preview(homework,manager,classA,1,false,role),{code:'42501'});
 await assert.rejects(preview(homework,manager,classB),{code:'42501'});
 await assert.rejects(preview(qa,teacher,qaClass,1,true),{code:'42501'});
 await assert.rejects(preview(qa,manager,qaClass),{code:'42501'});
 await assert.rejects(preview(homework,teacher,classA,3),{code:'22023'});
 await assert.rejects(preview(homework,teacher,classA,2),{code:'P0002'});
 await assert.rejects(preview(exam,teacher,classA,2),{code:'P0002'});
 await assert.rejects(preview(pending),{code:'P0002'});
 await assert.rejects(preview(stale),{code:'P0002'});
 await assert.rejects(preview(shared,teacher,classA),{code:'P0002'});

 await db.query("update mtm_hw_private.lesson_uploads set checkpoint='{}' where id=$1",[unconfirmed]);
 await assert.rejects(preview(unconfirmed),{code:'P0002'});
 await db.query("update mtm_hw_private.lesson_upload_paper2_steps set status='dang' where upload_id=$1",[pair]);
 await assert.rejects(preview(pair),{code:'P0002'});
 await db.query("update mtm_hw_private.lesson_upload_paper2_steps set status='xong' where upload_id=$1",[pair]);
 await db.query("delete from mtm_hw_private.btvn_second_papers where lesson_code=$1",[pairCode]);
 await assert.rejects(preview(pair,teacher,classA,2),{code:'P0002'});
 await db.query("update mtm_hw_private.btvn_lessons set assessment_id=$2 where code=$1",[examCode,uid(41)]);
 await assert.rejects(preview(exam),{code:'P0002'});
 await db.query("update mtm_hw_private.btvn_lessons set active=false,publish_status='cho_duyet' where code=$1",[homeCode]);
 await assert.rejects(preview(homework),{code:'P0002'});

 console.log('Published lesson preview: actual SQL, staff scope, read-only transaction, receipt/paper fences and question-only assets passed.');
}finally{await db.close();}
