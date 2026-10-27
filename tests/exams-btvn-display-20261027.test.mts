import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {cleanHomeworkTitle,lessonHomeworkTitle,homeworkTitle,displayHomeworkDeadline,displayHomeworkLessons,distinctHomeworkTitle,homeworkDisplayNote,MISSING_HOMEWORK_DEADLINE} from '../src/native/homework/presentation';
import type {HomeworkLesson} from '../src/native/homework/btvn-contract';
import {buildClassOverview} from '../server/btvn/class-overview';

const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file:string){const code=buildSync({entryPoints:[join(root,file)],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;const mod={exports:{} as any};new Function('require','module','exports',code)((id:string)=>id.endsWith('.css')?{}:require(id),mod,mod.exports);return mod.exports;}
const lesson=(extra:Partial<HomeworkLesson>={}):HomeworkLesson=>({lessonCode:'fixture-lesson',classNames:['2K10 9+'],date:'2026-10-25',title:'Ôn tập giữa học kỳ I',homeworkTitle:'[L1126]_18_10_2026_Đề.pdf [Có đính chính ở cuối PDF]',videoId:null,materialUrl:null,handoutUrl:null,homeworkUrl:null,dueAt:null,bestScore:null,late:null,submittedAt:null,available:true,...extra});
const raw=lesson();
assert.equal(cleanHomeworkTitle(raw.homeworkTitle),'Đề');
assert.equal(homeworkDisplayNote(raw),'Có đính chính ở cuối PDF');
assert.equal(homeworkDisplayNote(lesson({homeworkTitle:'Bài [Có_đính_chính (câu 3)]'.normalize('NFD')})),'Có đính chính (câu 3)');
assert.equal(homeworkDisplayNote(lesson({homeworkTitle:'Bài',title:'Buổi [tự luận nộp vở]'})),'tự luận nộp vở');
assert.equal(homeworkDisplayNote(undefined,'Đề [Có đính chính ở cuối PDF]'),'Có đính chính ở cuối PDF');
assert.equal(cleanHomeworkTitle('Đề - pdf'),'Đề');
assert.equal(cleanHomeworkTitle('Bài thống kê pdf.pdf'),'Bài thống kê');
assert.equal(lessonHomeworkTitle(raw),'Ôn tập giữa học kỳ I');
assert.equal(cleanHomeworkTitle('[L1126]_2026-10-18_Thống kê buổi 2.PDF (Có đính chính ở cuối PDF)'),'Thống kê buổi 2');
assert.equal(cleanHomeworkTitle('Hàm số trên [0; 1] · Đề 02'),'Hàm số trên [0; 1] · Đề 02');
assert.equal(lessonHomeworkTitle(lesson({homeworkTitle:'Đề ôn giữa HK I số 02'})),'Đề ôn giữa HK I số 02');
assert.equal(lessonHomeworkTitle(lesson({homeworkTitle:undefined,title:'Thống kê buổi 2'})),'Thống kê buổi 2');
assert.equal(lessonHomeworkTitle(lesson({title:'Đề',homeworkNote:undefined})),'Bài tập về nhà');
assert.equal(homeworkTitle({exam:{title:raw.homeworkTitle},lessonCode:raw.lessonCode,lessons:[raw]} as any),'Ôn tập giữa học kỳ I');

const due=Date.parse('2026-10-16T19:30:00+07:00'); // fixture only; not a finding about the real 09/10 lesson
assert.match(displayHomeworkDeadline(lesson({date:'2026-10-09',dueAt:due})),/19:30.*16[/-]10|16[/-]10.*19:30/);
assert.match(displayHomeworkDeadline(lesson(),due),/19:30/,'selected state deadline fills card missing due');
assert.equal(displayHomeworkDeadline(lesson()),MISSING_HOMEWORK_DEADLINE);
assert.equal(displayHomeworkDeadline(lesson({dueAt:NaN,expectedDueAt:Infinity})),MISSING_HOMEWORK_DEADLINE);
assert.match(displayHomeworkDeadline(lesson({expectedDueAt:due})),/^Hạn dự kiến:/,'expected is not promoted to actual');
assert.equal(lesson({dueAt:null}).dueAt,null,'display never assigns a deadline or changes lateness');

const a=lesson({date:'2026-10-27',lessonCode:'fixture-a',homeworkTitle:'Đề ôn giữa HK I số 02'});
const b={...a,lessonCode:'fixture-b'};
const c={...a,lessonCode:'fixture-c',homeworkTitle:'Đề ôn giữa HK I số 01'};
assert.equal(displayHomeworkLessons([a,{...a},b,c]).length,3,'only identical lesson codes are collapsed');
assert.equal(distinctHomeworkTitle(a,[a,b,c]),'Đề ôn giữa HK I số 02 · Bài 1');
assert.equal(distinctHomeworkTitle(b,[a,b,c]),'Đề ôn giữa HK I số 02 · Bài 2');
assert.equal(distinctHomeworkTitle(a,[c,b,a]),distinctHomeworkTitle(a,[a,b,c]),'stable across payload ordering');
assert.equal(distinctHomeworkTitle(c,[a,b,c]),'Đề ôn giữa HK I số 01');
assert.equal(displayHomeworkLessons([a,{...a,submittedAt:1000,bestScore:8}])[0].bestScore,8,'keep latest receipt snapshot');
assert.equal(displayHomeworkLessons([{...a,dueAt:due},{...a,dueAt:undefined as any,submittedAt:1000}])[0].dueAt,due,'omitted deadline does not erase an existing value');
assert.equal(displayHomeworkLessons([{...a,dueAt:due},{...a,dueAt:null,submittedAt:1000}])[0].dueAt,null,'explicit null is not overwritten by an older deadline');
assert.equal(displayHomeworkLessons([a,{...b,homeworkUrl:'https://example.invalid/shared.pdf'},{...a,lessonCode:'fixture-d',homeworkUrl:'https://example.invalid/shared.pdf'}]).length,3,'same PDF is not proof of equal content/scope');

// 8 thẻ thuộc đợt tối nay chỉ là metadata tổng hợp. Không đọc/đổi nội dung bài thi.
const protectedCards=['2k10-9','2k10-thu-3-6'].flatMap(cls=>['thi','btvn'].flatMap(kind=>[1,2].map(n=>Object.freeze(lesson({lessonCode:`thi-thang-2026-10-${cls}-${kind}-ma-${n}`,kind:kind==='thi'?'kiem-tra-thang':'btvn',homeworkTitle:'Đề ôn giữa HK I số 02',opensAt:due,closesAt:due+7200000})))));
const before=JSON.stringify(protectedCards);
for(const card of protectedCards){assert.equal(lessonHomeworkTitle(card),card.homeworkTitle);assert.equal(distinctHomeworkTitle(card,[...protectedCards,a,b]),card.homeworkTitle);}
assert.deepEqual(displayHomeworkLessons(protectedCards),protectedCards);
assert.equal(displayHomeworkLessons([protectedCards[0],protectedCards[0]]).length,2);
assert.equal(JSON.stringify(protectedCards),before);
const protectedPeer={...a,lessonCode:'thi-thang-fixture',kind:'btvn' as const};
assert.equal(distinctHomeworkTitle(a,[a,protectedPeer]),'Đề ôn giữa HK I số 02 · Bài bổ sung');
assert.equal(distinctHomeworkTitle(protectedPeer,[a,protectedPeer]),protectedPeer.homeworkTitle);

const Dashboard=load('src/native/homework/R104Dashboard.tsx').default;
const Cards=load('src/native/homework/LessonCards.tsx').default;
const Deadline=load('src/native/homework/HomeworkOverview.tsx').HomeworkDeadline;
const state={className:'2K10 9+',fullName:'Tài khoản kiểm thử',lessons:[raw,a,{...a},b,c],lessonCode:raw.lessonCode,dueAt:due,exam:null,demo:true,receipts:[]};
const render=(component:any,props:any)=>renderToStaticMarkup(React.createElement(component,props));
const html=render(Dashboard,{state,busy:false,onSelect(){}});
assert.ok(html.includes('Ôn tập giữa học kỳ I'));
assert.ok(html.includes('Đề ôn giữa HK I số 02 · Bài 1')&&html.includes('Đề ôn giữa HK I số 02 · Bài 2'));
assert.equal((html.match(/class="r104-hw-station r104-hw-station--/g)||[]).length,4);
assert.ok(!/\[L1126\]|\.pdf|chờ xác minh/i.test(html));
assert.match(render(Deadline,{lesson:raw,dueAt:due}),/19:30/);
const otherSelected=render(Dashboard,{state:{...state,lessonCode:a.lessonCode},busy:false,onSelect(){}});
assert.ok(!otherSelected.includes('Hạn: trước 19:30'),'selected deadline cannot leak onto a different preview/priority card');
assert.ok(!/chờ xác minh|Invalid Date/i.test(render(Cards,{lessons:[raw,a,a,b,c],busy:false,onHomework(){}})));
const overview=buildClassOverview({className:state.className,lessons:[raw,a,a,b,c]},{rows:[],source:'snapshot'},due);
assert.equal(overview.open.length,4);assert.ok(overview.open.some(x=>x.title==='Ôn tập giữa học kỳ I'));

const historic=JSON.parse(readFileSync(join(root,'tests/fixtures/btvn-display-historical-20261022.json'),'utf8'));
const classes=[...new Set<string>(historic.rows.map((r:any)=>r.className))].sort();
const audit=classes.map(className=>{
 const rows=historic.rows.filter((r:any)=>r.className===className);
 const filenames=rows.filter((r:any)=>/\.pdf|\[L\d+\]/i.test(r.title)).map((r:any)=>({lessonCode:r.lessonCode,date:r.date,title:r.title,cleanTitle:cleanHomeworkTitle(r.title)}));
 const annotations=rows.filter((r:any)=>/\[Có đính chính/i.test(r.title)).length;
 for(const row of rows)assert.ok(!/\.pdf|\[L\d+\]|\[Có đính chính/i.test(cleanHomeworkTitle(row.title)));
 return {className,lessonsChecked:rows.length,filenameIssues:filenames,annotationIssues:annotations,deadlineAudit:'not present in historical metadata',duplicateContentAudit:'no content identity in historical metadata'};
});
assert.equal(classes.length,12);assert.equal(historic.rows.length,53);
mkdirSync(join(root,'.qa-temp'),{recursive:true});
writeFileSync(join(root,'.qa-temp/btvn-display-class-audit.json'),JSON.stringify({source:historic.source,observedAt:historic.observedAt,audit},null,2));
writeFileSync(join(root,'.qa-temp/btvn-display-ssr.html'),html);
console.log('BTVN display: title source/filename, actual/expected/missing deadline, identity/collision/receipt, SSR, 8 protected cards, 53 historical rows/12 classes PASS.');
