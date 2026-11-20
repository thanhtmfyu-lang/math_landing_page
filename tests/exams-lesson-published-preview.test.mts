import assert from 'node:assert/strict';
import {readStaffPublishedLesson} from '../server/btvn/published-lesson-preview';
import type {PublishedLessonPreviewRequest} from '../src/native/lesson-upload/published-preview';

const uploadId='10000000-0000-4000-8000-000000000001';
const classId='20000000-0000-4000-8000-000000000001';
const sourceVersion='a'.repeat(64);
const lessonCode='web-10000000000040008000000000000001';
const request={uploadId,classId,paper:1 as const,isTest:false};
const body={action:'lesson-published-preview',...request};
const auth='Bearer header.claims.signature';
const base='btvn/'+lessonCode+'/'+sourceVersion+'/';
const questionAsset={path:'questions/q1.png',sha256:'1'.repeat(64),storage_path:base+'questions/q1.png',content_type:'image/png',bytes:80};
const answerAsset={path:'solutions/q1.png',sha256:'2'.repeat(64),storage_path:base+'solutions/q1.png',content_type:'image/png',bytes:80};
const pdfAsset={path:'exam-assets/'+ '3'.repeat(64)+'.pdf',sha256:'3'.repeat(64),storage_path:base+'questions.pdf',content_type:'application/pdf',bytes:120};
const canonical={
  uploadId,classId,paper:1,kind:'exam',className:'Lớp thử',title:'Kiểm tra thử',lessonCode,sourceVersion,
  exam:{
    title:'Kiểm tra thử',sourceUrl:'https://example.invalid/private-solutions',answerVerificationNote:'private',
    sourcePdf:{url:'/'+pdfAsset.path,sha256:pdfAsset.sha256,verified:true,bytes:120,totalPages:1,questionPages:[1]},
    questions:[{id:'q1',kind:'mc',sourceRef:'Câu 1',prompt:'Tính 2 + 2.',choices:['2','3','4','5'],answer:'C',
      solution:'Kết quả là 4',solutionBlocks:[{type:'text',text:'4'}],
      sourceContent:{questions:[{path:questionAsset.path,sha256:questionAsset.sha256}],solutions:[{path:answerAsset.path,sha256:answerAsset.sha256}]}}],
  },
  assets:[questionAsset,answerAsset,pdfAsset],
  checkpoint:{claim_token:'never send'},
};
let readCount=0;
let signed:string[]=[];
function port(data:unknown=canonical,error:null|{code:string}=null){
  return {
    read:async(got:PublishedLessonPreviewRequest,jwt:string)=>{
      assert.equal(jwt,auth);
      assert.equal(got.uploadId,uploadId);
      assert.equal(got.classId,classId);
      readCount++;
      return {data,error};
    },
    sign:async(path:string)=>{
      signed.push(path);
      return 'https://example.invalid/signed/'+path;
    },
  };
}

assert.equal((await readStaffPublishedLesson(port(),body,'')).status,401);
assert.equal((await readStaffPublishedLesson(port(),body,'Bearer malformed')).status,401);
assert.equal((await readStaffPublishedLesson(port(),{...body,assetPath:'other'},auth)).status,400);
assert.equal((await readStaffPublishedLesson(port(),{...body,paper:3},auth)).status,400);
assert.equal((await readStaffPublishedLesson(port(),{...body,isTest:'false'},auth)).status,400);
assert.equal(readCount,0);
assert.equal((await readStaffPublishedLesson(port(null,{code:'42501'}),body,auth)).status,403);
assert.equal((await readStaffPublishedLesson(port(null,{code:'P0002'}),body,auth)).status,404);
assert.equal((await readStaffPublishedLesson(port({...canonical,classId:'incorrect'}),body,auth)).status,503);
assert.equal((await readStaffPublishedLesson(port({...canonical,paper:2,kind:'exam'}),{...body,paper:2},auth)).status,503);
assert.deepEqual(signed,[]);

const read=await readStaffPublishedLesson(port(),body,auth);
assert('exam' in read.body);
assert.equal(read.status,200);
assert.equal(read.body.exam.sourceUrl,'https://minhthanhmath.vn');
assert.equal(read.body.exam.responseMode,'questions-only');
assert.equal(read.body.exam.questions[0].prompt,'Tính 2 + 2.');
assert.equal(read.body.exam.questions[0].choices?.[2],'4');
assert(!('answer' in read.body.exam.questions[0]));
assert(!('solution' in read.body.exam.questions[0]));
assert(!('solutionBlocks' in read.body.exam.questions[0]));
assert(!('solutions' in read.body.exam.questions[0].sourceContent!));
assert(!('assets' in read.body));
assert(!('checkpoint' in read.body));
assert.equal(read.body.exam.sourcePdf?.url,'https://example.invalid/signed/'+pdfAsset.storage_path);
assert.deepEqual(signed.sort(),[questionAsset.storage_path,pdfAsset.storage_path].sort());

signed=[];
const otherSource={...questionAsset,storage_path:'btvn/'+lessonCode+'/'+'b'.repeat(64)+'/questions/q1.png'};
const second=await readStaffPublishedLesson(port({...canonical,paper:2,kind:'homework',assets:[otherSource]}),{...body,paper:2},auth);
assert('exam' in second.body);
assert.equal(second.status,200);
assert.equal(second.body.paper,2);
assert.equal(second.body.exam.questions[0].sourceContent?.questions[0].privateUnavailable,true);
assert.equal(second.body.exam.sourcePdf,undefined);
assert.deepEqual(signed,[]);
console.log('Published preview: scoped staff reads, exact response binding, question-only rendering data and safe signed assets passed.');
