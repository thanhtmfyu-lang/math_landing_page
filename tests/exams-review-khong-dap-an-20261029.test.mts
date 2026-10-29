import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import type {PracticeExam} from '../src/native/exams/data';
import type {Draft} from '../src/native/exams/store';

// 29/10: đề thi thử chấm trên máy chủ (bundle đã bỏ đáp án) mà trình duyệt còn bài
// nộp cũ thì trang xem lại đọc q.answer.map → "Chưa tải được nội dung" mãi mãi.
const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const code=buildSync({entryPoints:[join(root,'src/native/exams/ExamReview.tsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;
const mod={exports:{} as any};
new Function('require','module','exports',code)((id:string)=>id.endsWith('.css')?{}:require(id),mod,mod.exports);
const Review=mod.exports.default;

// Dữ liệu GIẢ, đúng hình dạng danh mục công khai: không answer/acceptedAnswers.
const exam={id:'mtm-gia-khong-dap-an',title:'Đề GIẢ không đáp án',grade:11,period:'GK1',durationMinutes:90,rubricVersion:'MTM-THPT-3PART-2025-v1',versionHash:'a'.repeat(64),sourceHash:'b'.repeat(64),sourceRef:'MTM sưu tầm và biên soạn',serverGraded:true,responseMode:'questions-only',sourceMaterial:{title:'GIẢ',publisher:'GIẢ',version:'GIẢ',locator:'3 câu'},publicationVerified:true,questionDisplayVerified:true,answerKeyVerified:true,rubricVerified:true,questionCount:3,
 questions:[{id:'q-mc',sourceRef:'Câu 1',kind:'mc',choices:['A','B','C','D'],maxMillipoints:250,prompt:'Câu GIẢ 1'},{id:'q-tf',sourceRef:'Câu 2',kind:'tf',maxMillipoints:1000,prompt:'Câu GIẢ 2',statements:['a','b','c','d']},{id:'q-short',sourceRef:'Câu 3',kind:'short',mode:'decimal',maxMillipoints:500,prompt:'Câu GIẢ 3'}]} as unknown as PracticeExam;
const draft:Draft={version:1,examId:exam.id,examVersionHash:exam.versionHash,rubricVersion:exam.rubricVersion,attemptId:'gia',startedAt:1000,deadline:5401000,updatedAt:2000,submittedAt:2000,revision:1,answers:{}};
let html='';
assert.doesNotThrow(()=>{html=renderToStaticMarkup(React.createElement(Review,{exam,draft,showSummary:false}));},'Bài nộp cũ của đề không có đáp án trong bundle không được làm vỡ trang');
assert.equal((html.match(/Chưa có đáp án đã xác minh/g)||[]).length,3,'Cả ba dạng câu báo chưa có đáp án thay vì trống/vỡ');
assert.ok(!html.includes('ep-statement-review'),'Không liệt kê đối chiếu từng ý khi chưa có khóa');
console.log(JSON.stringify({suite:'REVIEW-KHONG-DAP-AN',total:3,passed:3,failed:0}));
