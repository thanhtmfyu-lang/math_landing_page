import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {PracticeExam} from '../src/native/exams/data';
import type {HomeworkState} from '../src/native/homework/btvn-contract';
import type {Draft} from '../src/native/exams/store';
import {validatePracticeExam} from '../src/native/exams/data';
import {hasReadableTfStatements} from '../src/native/exams/question-statements';

const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json'));
const retryCss=readFileSync(join(root,'src/native/homework/homework-retry.css'),'utf8');
assert.match(retryCss,/\.btvn-retry-feedback:focus\s*\{[^}]*outline:3px solid #b38619;[^}]*outline-offset:3px/,'Phản hồi nhận focus có vòng vàng rõ như vùng gợi ý');
assert.match(retryCss,/\.btvn-retry-feedback\s*\{[^}]*scroll-margin-top:100px;[^}]*scroll-margin-bottom:24px/,'Phản hồi chừa khoảng cuộn để không dính mép trang');
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
let values:any[]=[],cursor=0;
const hooks={useEffect(){},useId:()=>':retry-test:',useRef:(initial:any)=>{const i=cursor++;if(!(i in values))values[i]={current:initial};return values[i];},useState:(initial:any)=>{const i=cursor++,slots=values;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],(next:any)=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];}};
const code=buildSync({entryPoints:[join(root,'src/native/homework/HomeworkRetry.tsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;
const mod={exports:{} as any};
new Function('require','module','exports',code)((id:string)=>id==='react'?{...React,...hooks}:id.endsWith('.css')?{}:require(id),mod,mod.exports);
const {default:Retry,homeworkRetryQuestions,checkRetryAnswer,retryMismatchStatements,sourceRetrySteps,sourceRetryStepInfo}=mod.exports;

// Toàn bộ đề, nguồn và lượt làm dưới đây là dữ liệu GIẢ, không đọc hồ sơ học sinh.
const exam:PracticeExam={id:'mtm-preview-retry-fake',title:'Đề GIẢ kiểm ôn câu sai',grade:10,period:'GK1',durationMinutes:10,rubricVersion:'MTM-BTVN-10-v1',versionHash:'a'.repeat(64),sourceHash:'b'.repeat(64),sourceRef:'Bộ đề GIẢ để kiểm thử',sourceUrl:'https://example.invalid/de-gia',sourceMaterial:{title:'Đề GIẢ',publisher:'Kiểm thử cục bộ',version:'fake-v1',locator:'3 câu giả'},publicationVerified:true,questionDisplayVerified:true,answerKeyVerified:true,rubricVerified:true,questionCount:3,sections:[{label:'I · Trắc nghiệm',kind:'mc',count:1},{label:'II · Đúng sai',kind:'tf',count:1},{label:'III · Trả lời ngắn',kind:'short',count:1}],questions:[
  {id:'fake-mc',sourceRef:'Đề GIẢ, câu 1',kind:'mc',maxMillipoints:4000,prompt:'Giải phương trình $2x+1=5$ trên tập số thực.',choices:['-2','0','2','4'],answer:'C',solution:'Bước 1: Trừ 1 ở hai vế, được $2x=4$.\nBước 2: Chia hai vế cho 2, được $x=2$. Kiểm tra: $2\\cdot2+1=5$.'},
  {id:'fake-tf',sourceRef:'Đề GIẢ, câu 2',kind:'tf',maxMillipoints:4000,prompt:'Cho $x=2$. Xét đúng sai.',statements:['$x>0$','$x^2=4$','$x+1=2$','$x$ là số chẵn'],answer:[true,true,false,true],pointsByCorrectCount:[0,1000,2000,3000,4000],solution:'Thay $x=2$: các ý a, b, d đúng; ý c sai vì $2+1=3$.'},
  {id:'fake-short',sourceRef:'Đề GIẢ, câu 3',kind:'short',mode:'rational',maxMillipoints:2000,prompt:'Giải phương trình $2x=1$ trên tập số thực.',acceptedAnswers:['1/2'],solution:'Bước 1: Chia hai vế cho 2.\nBước 2: $x=1/2$. Thay lại: $2\\cdot(1/2)=1$.'},
]};
const draft:Draft={version:1,examId:exam.id,examVersionHash:exam.versionHash,rubricVersion:exam.rubricVersion,attemptId:'fake-attempt',startedAt:1000,deadline:601000,updatedAt:2000,submittedAt:2000,revision:1,answers:{'fake-mc':'A','fake-tf':[true,false,false,true],'fake-short':'0,5'}};
const state:HomeworkState={exam,draft,fullName:'Học sinh GIẢ',className:'Lớp GIẢ',lessonCode:'buoi-gia',dueAt:null,maxAttempts:5,attemptsUsed:1,bestScore:5,demo:true,receipts:[{attemptId:'fake-attempt',attemptNumber:1,score:5,submittedAt:2000,elapsedSeconds:1,late:false,timedOut:false}]};

// Kiểm Toán độc lập từ phương trình, trước khi gọi bộ so đáp án của component.
assert.deepEqual(exam.questions[0].choices.map((v:string)=>2*Number(v)+1===5),[false,false,true,false]);
const x=2;assert.deepEqual([x>0,x*x===4,x+1===2,x%2===0],[true,true,false,true]);
assert.equal(2*(1/2),1);assert.notEqual(2*(1/3),1); // Hệ số 2 khác 0, mỗi phương trình có đúng một nghiệm thực.

assert.deepEqual(homeworkRetryQuestions(state).map((r:any)=>r.question.id),['fake-mc','fake-tf']);
for(const changed of [
  {...state,receipts:[]},
  {...state,receipts:[{...state.receipts[0],attemptId:'another-fake-attempt'}]},
  {...state,draft:{...draft,submittedAt:null}},
  {...state,draft:{...draft,examVersionHash:'c'.repeat(64)}},
  {...state,draft:{...draft,examId:'another-fake-exam'}},
  {...state,draft:{...draft,rubricVersion:'another-fake-rubric'}},
  {...state,receipts:[state.receipts[0],{...state.receipts[0]}]},
  ...[-1,11,NaN,Infinity].map(score=>({...state,receipts:[{...state.receipts[0],score}]})),
  {...state,solutionsAvailable:false},
])assert.deepEqual(homeworkRetryQuestions(changed),[],'Không mở khi chưa ACK đúng bản nộp, khác phiên bản hoặc lời giải còn khóa');
assert.deepEqual(homeworkRetryQuestions({...state,receipts:[{...state.receipts[0],submittedAt:2001}]}).map((r:any)=>r.question.id),['fake-mc','fake-tf'],'Biên nhận cùng lượt không bị khóa chỉ vì thời điểm máy chủ lệch draft');
assert.deepEqual(homeworkRetryQuestions({...state,receipts:[{...state.receipts[0],elapsedSeconds:-1}]}).map((r:any)=>r.question.id),['fake-mc','fake-tf'],'Thời lượng máy chủ âm không khóa ôn của đúng lượt đã có điểm');
for(const answers of [null,[],undefined]){
  const malformed={...state,draft:{...draft,answers}} as unknown as HomeworkState;
  assert.doesNotThrow(()=>homeworkRetryQuestions(malformed),'Snapshot hỏng không làm đổ màn kết quả');
  assert.deepEqual(homeworkRetryQuestions(malformed),[],'Không đoán câu ôn từ snapshot answers hỏng');
}
assert.deepEqual(homeworkRetryQuestions({...state,exam:{...exam,questions:exam.questions.map(q=>({...q,solution:undefined}))}}),[]);
assert.deepEqual(homeworkRetryQuestions({...state,draft:{...draft,answers:{'fake-mc':'C','fake-tf':[true,true,false,true],'fake-short':'1/2'}}}),[]);
const blankState:HomeworkState={...state,draft:{...draft,answers:{'fake-mc':null,'fake-tf':[null,null,null,null],'fake-short':' \t '}},bestScore:0,receipts:[{...state.receipts[0],score:0}]};
const retryIds=(input:HomeworkState)=>homeworkRetryQuestions(input).map((r:any)=>r.question.id);
assert.deepEqual(retryIds(blankState),['fake-mc','fake-tf','fake-short'],'Cho ôn MC, Đ/S và câu ngắn bỏ trống của bản nộp đã ACK');
assert.deepEqual(retryIds({...blankState,draft:{...blankState.draft!,answers:{}}}),['fake-mc','fake-tf','fake-short'],'Câu không có khóa trả lời trong snapshot cũng là câu bỏ trống');
assert.deepEqual(retryIds({...blankState,draft:{...blankState.draft!,answers:{...blankState.draft!.answers,'fake-mc':' \t '}}}),[],'Đáp án MC hỏng không được coi là snapshot bỏ trống hợp lệ');
for(const changed of [
  {...blankState,receipts:[]},
  {...blankState,receipts:[{...blankState.receipts[0],attemptId:'another-fake-attempt'}]},
  {...blankState,draft:{...blankState.draft!,submittedAt:null}},
  {...blankState,draft:{...blankState.draft!,examVersionHash:'c'.repeat(64)}},
  {...blankState,solutionsAvailable:false},
  {...blankState,kind:'kiem-tra-thang' as const,solutionsAvailable:false},
])assert.deepEqual(retryIds(changed),[],'Bỏ trống vẫn giữ cổng ACK, bản nộp, phiên bản và lời giải, kể cả kiểm tra tháng đang khóa');
assert.deepEqual(retryIds({...blankState,exam:{...exam,questions:exam.questions.map(q=>({...q,solution:undefined}))}}),[],'Không ôn câu bỏ trống khi không có lời giải nguồn');
// PDF đề đầy đủ ở màn kết quả không có nghĩa phần ôn nhúng được các mệnh đề.
for(const statements of [undefined,[],['','','',''],['Ý a','Ý b','Ý c'],['Ý a','Ý b','Ý c',' \t '],new Array(4)]){
  const pdfOnly={...exam,sourcePdf:{url:'https://example.invalid/fake.pdf',verified:true,sha256:'e'.repeat(64),bytes:100,totalPages:1,questionPages:[1]},questions:exam.questions.map(q=>q.kind==='tf'?{...q,statements}:q)};
  if(statements===undefined)assert.equal(validatePracticeExam(pdfOnly).valid,true,'Đề PDF đầy đủ hợp lệ nhưng phần ôn phải kiểm riêng nội dung hiển thị');
  const available=homeworkRetryQuestions({...state,exam:pdfOnly}).map((r:any)=>r.question.id);
  assert.ok(!available.includes('fake-tf'),'Không mời ôn Đ/S khi chỉ có stem và không hiển thị được bốn mệnh đề');
  assert.ok(!retryIds({...blankState,exam:pdfOnly}).includes('fake-tf'),'Câu Đ/S bỏ trống vẫn bị loại khi thiếu văn bản của bốn mệnh đề');
  if(statements===undefined)assert.deepEqual(available,['fake-mc'],'Giữ câu trắc nghiệm hợp lệ trong cùng đề PDF');
}
const cropTf={...exam,questions:exam.questions.map(q=>q.kind==='tf'?{...q,statements:undefined,sourceContent:{questions:[{path:'fake-tf.png',sha256:'f'.repeat(64),sourcePage:1,width:600,height:400}],solutions:[{path:'fake-solution.png',sha256:'e'.repeat(64),sourcePage:2,width:600,height:400}]}}:q)};
assert.equal(validatePracticeExam(cropTf).valid,true);
assert.deepEqual(homeworkRetryQuestions({...state,exam:cropTf}).map((r:any)=>r.question.id),['fake-mc'],'Ảnh nguồn không thay thế văn bản của bốn mệnh đề để ôn');
const unreadableCropStates=[undefined,['','','',''],['Ý a','Ý b','Ý c',' \t ']].flatMap(statements=>[false,true].map(privateUnavailable=>({...state,exam:{...cropTf,questions:cropTf.questions.map(q=>q.kind==='tf'?{...q,statements,sourceContent:{...q.sourceContent!,questions:q.sourceContent!.questions.map(segment=>({...segment,privateUnavailable}))}}:q)}})));
for(const input of unreadableCropStates){
  const tf=input.exam.questions[1];
  assert.equal(hasReadableTfStatements(tf),false,'Ảnh có hoặc không tải được đều không thay mệnh đề thiếu/rỗng');
  const available=homeworkRetryQuestions(input).map((r:any)=>r.question.id);
  assert.ok(!available.includes('fake-tf'),'Không mời ôn khi thiếu văn bản, kể cả ảnh nguồn hợp lệ');
  if(tf.statements===undefined)assert.deepEqual(available,['fake-mc'],'Giữ câu MC khi các câu còn lại qua validator');
}
assert.deepEqual(homeworkRetryQuestions({...state,exam:{...cropTf,questions:cropTf.questions.map(q=>q.kind==='tf'?{...q,statements:exam.questions[1].kind==='tf'?exam.questions[1].statements:undefined}:q)}}).map((r:any)=>r.question.id),['fake-mc','fake-tf'],'Giữ câu có đủ bốn văn bản ngay cả khi kèm ảnh minh họa');
const malformedSource={...state,exam:{...exam,questions:exam.questions.map(q=>({...q,prompt:undefined,text:undefined,sourceContent:{} as any}))}};
assert.doesNotThrow(()=>homeworkRetryQuestions(malformedSource),'sourceContent thiếu questions không làm đổ màn điểm');
assert.deepEqual(homeworkRetryQuestions(malformedSource),[],'Bỏ câu thiếu cả văn bản lẫn mảng ảnh nguồn');
assert.equal(sourceRetrySteps('Chỉ có đáp án C.').length,0);
assert.equal(sourceRetrySteps('Bước 1: Chỉ một bước.').length,0);
assert.deepEqual(sourceRetrySteps(exam.questions[0].solution),exam.questions[0].solution!.split('\n'));
for(const preamble of ['Điều kiện: $x>0$.','Giả sử $a>0$.','Đặt $t=x+1$.','Miền xác định: $x\\ne0$.','Đáp án: C. Điều kiện: $x>0$.'])assert.deepEqual(sourceRetrySteps(preamble+'\nBước 1: Đọc điều kiện.\nBước 2: Đối chiếu nghiệm.'),[],'Không bỏ mất mở đầu của nguồn để tạo gợi ý rời điều kiện');
assert.deepEqual(sourceRetrySteps('Đáp án: C.\nBước 1: Trừ 1 ở hai vế.\nBước 2: Chia hai vế cho 2.'),['Bước 1: Trừ 1 ở hai vế.','Bước 2: Chia hai vế cho 2.'],'Không lộ đáp án đứng trước bước đầu trong gợi ý');
assert.deepEqual(sourceRetrySteps('Đáp án: C\nBước 1: A.\nĐáp án: D\nBước 2: B.'),['Bước 1: A.','Bước 2: B.'],'Bỏ dòng đáp án thuần ở mọi vị trí, không ghép vào gợi ý');
assert.deepEqual(sourceRetrySteps('Lời giải\nBước 1: A.\nBước 2: B.'),['Bước 1: A.','Bước 2: B.'],'Nhãn lời giải thuần không làm mất gợi ý hợp lệ');
assert.equal(sourceRetryStepInfo('Lời giải:\n'+exam.questions[0].solution).reason,'available');
assert.equal(sourceRetryStepInfo('Điều kiện: $x>0$.\n'+exam.questions[0].solution).reason,'preamble');
assert.equal(sourceRetryStepInfo(exam.questions[1].solution).reason,'none','Đoạn lời giải không có bước dùng nhắc nhở chung');
assert.deepEqual(sourceRetrySteps('Bước 2: Thiếu bước đầu.\nBước 3: Kết luận.'),[]);
assert.deepEqual(sourceRetrySteps('\nBước 1: Xét điều kiện.\nĐiều kiện: $x>0$.\nBước 2: Đối chiếu nghiệm.'),['Bước 1: Xét điều kiện.\nĐiều kiện: $x>0$.','Bước 2: Đối chiếu nghiệm.'],'Điều kiện bên trong bước vẫn giữ nguyên văn');

assert.equal(checkRetryAnswer(exam.questions[0],'C'),'correct');assert.equal(checkRetryAnswer(exam.questions[0],'A'),'wrong');
assert.equal(checkRetryAnswer(exam.questions[0],null),'incomplete');assert.equal(checkRetryAnswer(exam.questions[0],'E'),'invalid');
assert.equal(checkRetryAnswer(exam.questions[1],[true,true,false,true]),'correct');assert.equal(checkRetryAnswer(exam.questions[1],[true,false,false,true]),'wrong');assert.equal(checkRetryAnswer(exam.questions[1],[true,null,false,true]),'incomplete');
for(const answer of [undefined,null,'ĐĐSĐ',[],[true,true,false],[true,true,false,true,false],[true,true,null,true],new Array(4)])assert.equal(checkRetryAnswer({...exam.questions[1],answer},[true,true,false,true]),'invalid','Khóa đáp án Đ/S thiếu hoặc hỏng không làm trang đổ');
assert.equal(checkRetryAnswer(exam.questions[1],new Array(4)),'incomplete');
assert.equal(checkRetryAnswer(exam.questions[2],'2/4'),'correct');assert.equal(checkRetryAnswer(exam.questions[2],'0,5'),'correct');assert.equal(checkRetryAnswer(exam.questions[2],'1/3'),'wrong');assert.equal(checkRetryAnswer(exam.questions[2],'1/0'),'invalid');
assert.equal(checkRetryAnswer({...exam.questions[2],mode:'numeric',acceptedAnswers:['0.5']},'1/2'),'invalid');
assert.equal(checkRetryAnswer({...exam.questions[2],mode:'exact',acceptedAnswers:['AB']},'ab'),'wrong');
assert.deepEqual(retryMismatchStatements(exam.questions[1],[true,false,false,true]),['b']);
assert.deepEqual(retryMismatchStatements(exam.questions[1],[false,false,true,true]),['a','b','c']);
assert.deepEqual(retryMismatchStatements(exam.questions[1],[true,true,false,true]),[]);
for(const incomplete of [null,[true,null,false,true],new Array(4)])assert.deepEqual(retryMismatchStatements(exam.questions[1],incomplete),[],'Chưa chọn đủ không so khớp từng ý');
assert.deepEqual(retryMismatchStatements({...exam.questions[1],answer:undefined},[true,true,false,true]),[],'Khóa hỏng không đưa phản hồi ý sai');

// Dựng bằng React/React DOM server thật để kiểm ngữ nghĩa đầu ra, không chứng minh focus trình duyệt.
const actualCode=buildSync({stdin:{contents:readFileSync(join(root,'src/native/homework/HomeworkRetry.tsx'),'utf8')+'\nexport {RetryExercise};',resolveDir:join(root,'src/native/homework'),sourcefile:'HomeworkRetry.tsx',loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;
const actualModule={exports:{} as any};
new Function('require','module','exports',actualCode)((id:string)=>id.endsWith('.css')?{}:require(id),actualModule,actualModule.exports);
for(const [index,answer,verdict,message] of [
  [1,[true,false,false,true],'wrong',/Có ý chưa khớp/],
  [1,[true,true,false,true],'correct',/Em đã làm đúng câu này/],
  [1,[true,null,false,true],'incomplete',/Em trả lời đủ câu/],
  [2,'1/0','invalid',/Câu trả lời chưa đúng định dạng/],
] as const){
  const html=renderToStaticMarkup(React.createElement(actualModule.exports.RetryExercise,{exam,item:{question:exam.questions[index],index},submittedAnswer:draft.answers[exam.questions[index].id],onCorrect(){},onNext(){},hasNext:true,complete:false,corrected:false,focusTitle:false,canAttemptAgain:true,savedDraft:{answer,verdict,hints:0,solution:false,solutionViewed:false,hintsViewed:false,needsRecheck:false}}));
  assert.match(html,message,'React SSR thật dựng đúng nội dung phản hồi của '+verdict);
  assert.match(html,/role="group" aria-label="Phản hồi câu ôn" aria-live="off" aria-describedby="[^"]+-feedback-message" tabindex="-1"/,'React SSR thật giữ nhóm focus được, mô tả bằng nội dung và không có live đồng thời');
  assert.ok(!html.includes('role="status"'),'React SSR thật không dựng live status cho kết quả');
  if(index===1&&verdict==='wrong')assert.ok(!html.includes('Các ý chưa khớp:'),'Kênh phản hồi mới vẫn giữ cổng đáp án từng ý Đ/S');
}

function find(tree:any,predicate:(node:any)=>boolean):any{
  if(!tree||typeof tree!=='object')return null;
  if(Array.isArray(tree))return tree.map(n=>find(n,predicate)).find(Boolean)??null;
  return predicate(tree)?tree:find(tree.props?.children,predicate);
}
const button=(tree:any,label:string)=>find(tree,n=>n.type==='button'&&n.props.children===label);
const openSolution=(draw:()=>any)=>{
  const tree=draw(),trigger=button(tree,'Xem lời giải đầy đủ của câu ôn')??button(tree,'Mở lại lời giải đã xem');
  assert.ok(trigger);trigger.props.onClick();
  const confirmation=button(draw(),'Vẫn mở lời giải');
  if(confirmation)confirmation.props.onClick();
  return draw();
};
const openHint=(draw:()=>any,step=1)=>{
  button(draw(),'Xem gợi ý bước '+step).props.onClick();
  const confirmation=button(draw(),'Vẫn mở gợi ý');
  if(confirmation)confirmation.props.onClick();
  return draw();
};
const statementGroup=(tree:any,index:number)=>find(tree,n=>n.type==='fieldset'&&find(n,c=>c.props?.id===`:retry-test:-statement-${index}`));
const exerciseIn=(tree:any)=>find(tree,n=>typeof n.type==='function'&&n.type.name==='RetryExercise');
const nextButton=(tree:any)=>{const node=exerciseIn(tree),previousValues=values,previousCursor=cursor;values=[];cursor=0;const next=button(node.type(node.props),'Ôn câu chưa xong tiếp theo');values=previousValues;cursor=previousCursor;return next;};
const original=JSON.stringify(state),originalFetch=globalThis.fetch;
globalThis.fetch=()=>{throw Error('Phần ôn cục bộ không được gửi yêu cầu mạng');};
try{
  const blankSnapshot=JSON.stringify(blankState);
  for(const [index,question] of exam.questions.entries()){
    values=[{key:draft.attemptId+':'+exam.versionHash,selected:question.id,open:true,correct:[]}];cursor=0;
    const blankParent=Retry({state:blankState}),blankExercise=exerciseIn(blankParent);
    assert.equal(blankExercise.props.item.question.id,question.id,'Có thể chọn từng loại câu bỏ trống để ôn');
    assert.equal(blankExercise.props.canAttemptAgain,true,'Ôn câu bỏ trống giữ giới hạn xem phản hồi khi còn lượt tính điểm');
    const blankValues:any[]=[];
    const drawBlank=()=>{values=blankValues;cursor=0;return blankExercise.type(blankExercise.props);};
    let blankTree=drawBlank();
    const submitted=renderToStaticMarkup(find(blankTree,n=>n.type==='details'));
    assert.match(submitted,index===1?/a\) Chưa chọn; b\) Chưa chọn; c\) Chưa chọn; d\) Chưa chọn/:/Câu trả lời đã nộp: Chưa trả lời/,'Giữ cách hiển thị bản nộp bỏ trống, không điền đáp án thử vào snapshot');
    if(index===0)find(blankTree,n=>n.type==='input'&&n.props.value==='C').props.onChange();
    else if(index===1){
      for(const [i,value] of [true,true,false,true].entries()){
        const group=statementGroup(drawBlank(),i);
        const choice=find(group,n=>n.type==='label'&&n.props.children[1].props.children===(value?'Đúng':'Sai'));
        find(choice,n=>n.type==='input').props.onChange();
      }
    }else find(blankTree,n=>n.type==='input'&&n.props.type==='text').props.onChange({target:{value:'1/2'}});
    blankTree=drawBlank();
    find(blankTree,n=>n.type==='form').props.onSubmit({preventDefault(){}});
    assert.match(renderToStaticMarkup(find(drawBlank(),n=>n.props?.id===':retry-test:-feedback')),/Em đã làm đúng câu này/,'Câu bỏ trống có thể được hoàn thành trong phiên ôn');
    assert.equal(JSON.stringify(blankState),blankSnapshot,'Thử câu bỏ trống không sửa bản nộp, biên nhận, điểm hay lượt');
  }
  for(const input of unreadableCropStates){
    values=[{key:input.draft!.attemptId+':'+input.exam!.versionHash,selected:'fake-tf',open:true,correct:[]}];cursor=0;
    const html=renderToStaticMarkup(Retry({state:input}));
    assert.ok(!html.includes('II · Đúng sai · Câu 1'),'Pill câu TF không đọc được phải biến mất khỏi bản dựng');
    assert.ok(!html.includes('trong đề ở trên'),'Không hướng dẫn đọc PDF không được nhúng trong phần ôn');
    if(input.exam.questions[1].statements===undefined)assert.match(html,/I · Trắc nghiệm · Câu 1/,'Giữ câu MC hợp lệ khi câu TF bị bỏ qua');
  }
  values=[{key:state.draft!.attemptId+':'+exam.versionHash,selected:'fake-mc',open:true,correct:[]}];cursor=0;
  assert.doesNotThrow(()=>renderToStaticMarkup(Retry({state:{...state,exam:{...exam,questions:exam.questions.map(q=>({...q,sourceContent:{} as any}))}}})), 'Nguồn lệch dạng không làm đổ bản dựng khi câu còn đủ văn bản');
  const parentValues:any[]=[];
  function drawParent(input=state){values=parentValues;cursor=0;return Retry({state:input});}
  let tree=drawParent();
  const closedHtml=renderToStaticMarkup(tree);assert.match(closedHtml,/không tính điểm và không dùng thêm lượt/);assert.ok(!closedHtml.includes('fake-mc'));
  assert.match(closedHtml,/câu sai hoặc bỏ trống/,'Lời dẫn nói rõ phạm vi ôn cả câu chưa làm');
  assert.ok(!closedHtml.includes('Câu trả lời thử được giữ'),'Chú thích nháp chỉ hiện sau khi mở phần ôn');
  button(tree,'Ôn một câu của lượt này').props.onClick();tree=drawParent();
  assert.match(renderToStaticMarkup(tree),/Tải lại trang, đổi lượt, gặp bản đề khác, mất biên nhận của lượt hoặc mất quyền xem lời giải sẽ xóa phần thử này\./,'Mô tả đúng các ranh giới xóa nháp đã kiểm');
  const progress=()=>renderToStaticMarkup(find(drawParent(),n=>n.props?.className==='btvn-retry-status'));
  assert.match(progress(),/Đã làm đúng 0\/2 câu/);
  const exerciseNode=find(tree,n=>typeof n.type==='function'&&n.type.name==='RetryExercise');assert.ok(exerciseNode);
  // Mô phỏng callback ref, không thay thế kiểm React commit hoặc focus trình duyệt thật.
  for(const [question,index,answer,expected] of [
    [exam.questions[0],0,null,'incomplete'],
    [exam.questions[0],0,'A','wrong'],
    [exam.questions[0],0,'C','correct'],
    [exam.questions[1],1,[true,null,false,true],'incomplete'],
    [exam.questions[1],1,[true,false,false,true],'wrong'],
    [exam.questions[1],1,[true,true,false,true],'correct'],
    [exam.questions[2],2,'1/0','invalid'],
  ] as const){
    const checkValues:any[]=[];let checkFocus=0;
    const drawCheck=()=>{values=checkValues;cursor=0;return exerciseNode.type({...exerciseNode.props,item:{question,index},focusTitle:false,onDraftChange:undefined,onCorrect(){}});};
    const commitFeedback=(node=drawCheck())=>find(node,n=>n.props?.id===':retry-test:-feedback').ref({focus(){checkFocus++;}});
    const submitCheck=()=>{find(drawCheck(),n=>n.type==='form').props.onSubmit({preventDefault(){}});const node=drawCheck();commitFeedback(node);return node;};
    commitFeedback();assert.equal(checkFocus,0,'Không tự focus hộp phản hồi khi mới mở câu');
    if(typeof answer==='string'){
      if(question.kind==='mc')find(drawCheck(),n=>n.type==='input'&&n.props.value===answer).props.onChange();
      else find(drawCheck(),n=>n.type==='input'&&n.props.type==='text').props.onChange({target:{value:answer}});
    }else if(Array.isArray(answer)){
      for(const [i,value] of answer.entries())if(typeof value==='boolean'){
        const group=statementGroup(drawCheck(),i);
        const choice=find(group,n=>n.type==='label'&&n.props.children[1].props.children===(value?'Đúng':'Sai'));
        find(choice,n=>n.type==='input').props.onChange();
      }
    }
    commitFeedback();assert.equal(checkFocus,0,'Nhập hoặc chọn đáp án không lấy focus khỏi ô đang làm');
    let checked=submitCheck();assert.equal(checkFocus,1,'Kiểm '+expected+' yêu cầu focus tới phản hồi qua callback ref');
    const checkedFeedback=find(checked,n=>n.props?.id===':retry-test:-feedback');
    assert.equal(checkedFeedback.props.role,'group','Phản hồi có ngữ nghĩa nhóm, không dùng status có live ngầm định');
    assert.equal(checkedFeedback.props['aria-label'],'Phản hồi câu ôn');
    assert.equal(checkedFeedback.props['aria-live'],'off','Chỉ thông báo qua focus, không đồng thời đọc live');
    assert.equal(checkedFeedback.props['aria-describedby'],':retry-test:-feedback-message','Khi nhận focus, mô tả của nhóm trỏ đúng toàn bộ nội dung kết quả');
    assert.equal(checkedFeedback.props.tabIndex,-1,'Phản hồi không thêm điểm dừng vào thứ tự Tab');
    const firstFeedback=renderToStaticMarkup(find(checked,n=>n.props?.id===':retry-test:-feedback'));
    commitFeedback();assert.equal(checkFocus,1,'Render lại không có lần kiểm mới không giật focus');
    checked=submitCheck();assert.equal(checkFocus,2,'Kiểm lại cùng kết quả '+expected+' vẫn focus phản hồi mới');
    assert.equal(renderToStaticMarkup(find(checked,n=>n.props?.id===':retry-test:-feedback')),firstFeedback,'Ca lặp giữ nguyên nội dung phản hồi, không dựa vào thay text để pass');
    if(question.kind==='mc')find(drawCheck(),n=>n.type==='input'&&n.props.value==='B').props.onChange();
    else if(question.kind==='tf'){
      const choice=find(statementGroup(drawCheck(),0),n=>n.type==='label'&&n.props.children[1].props.children==='Sai');
      find(choice,n=>n.type==='input').props.onChange();
    }
    else find(drawCheck(),n=>n.type==='input'&&n.props.type==='text').props.onChange({target:{value:'2/4'}});
    commitFeedback();assert.equal(checkFocus,2,'Sửa đáp án sau kiểm không giật focus');
    button(drawCheck(),'Thử lại từ đầu').props.onClick();commitFeedback();
    assert.equal(checkFocus,2,'Reset không tự focus hộp phản hồi rỗng');
    button(drawCheck(),'Xem gợi ý bước 1')?.props.onClick();commitFeedback();
    assert.equal(checkFocus,2,'Mở xác nhận gợi ý không focus nhầm phản hồi kiểm');
  }
  const exerciseValues:any[]=[];
  const draw=()=>{values=exerciseValues;cursor=0;return exerciseNode.type(exerciseNode.props);};
  let exercise=draw();
  assert.equal(exerciseNode.props.submittedAnswer,'A','Lấy đúng câu trả lời MC từ bản nộp đã xác nhận');
  const originalDetails=find(exercise,n=>n.type==='details'&&find(n,c=>c.type==='summary'&&c.props.children==='Xem câu trả lời đã nộp của I · Trắc nghiệm · Câu 1'));
  assert.ok(originalDetails);assert.equal(originalDetails.props.open,undefined,'Đối chiếu bản nộp thu gọn mặc định');
  assert.equal(originalDetails.props.className,'btvn-retry-submitted','Khối đối chiếu có kiểu riêng, không dùng kiểu chữ chú thích');
  assert.match(renderToStaticMarkup(originalDetails),/Câu trả lời đã nộp: A/);
  assert.equal(find(exercise,n=>n.type==='input'&&n.props.value==='A').props.checked,false,'Không điền sẵn đáp án cũ vào ô ôn');
  for(const [submittedAnswer,expected] of [['<img src=x onerror=alert(1)>',/&lt;img/],['1/3',/1\/3/],[[true,null,false,true],/a\) Đúng; b\) Chưa chọn; c\) Sai; d\) Đúng/]] as const){
    values=[];cursor=0;
    const withOriginal=exerciseNode.type({...exerciseNode.props,submittedAnswer});
    const details=find(withOriginal,n=>n.type==='details');
    const html=renderToStaticMarkup(details);assert.match(html,expected);assert.ok(!html.includes('<img'),'Câu trả lời cũ luôn là văn bản, không parse HTML');
  }
  values=[];cursor=0;
  const malformedSourceExercise=exerciseNode.type({...exerciseNode.props,item:{question:{...exam.questions[0],sourceContent:{}},index:0}});
  assert.doesNotThrow(()=>renderToStaticMarkup(malformedSourceExercise),'Không render MtmSourceContent với mảng questions bị thiếu');
  exercise=draw();
  const prefacedSolution='Điều kiện: $x>0$.\n'+exam.questions[0].solution;
  values=[];cursor=0;
  const prefacedNode=exerciseNode.type({...exerciseNode.props,item:{question:{...exam.questions[0],solution:prefacedSolution},index:0}});
  assert.equal(button(prefacedNode,'Xem gợi ý bước 1'),null,'Nguồn có mở đầu quan trọng chỉ xem bản đầy đủ');
  const drawPrefaced=()=>{cursor=0;return exerciseNode.type({...exerciseNode.props,item:{question:{...exam.questions[0],solution:prefacedSolution},index:0}});};
  const prefacedOpen=openSolution(drawPrefaced);
  assert.ok(find(prefacedOpen,n=>n.props?.fallback===prefacedSolution),'Bản đầy đủ vẫn giữ nguyên điều kiện và các bước nguồn');
  values=[];cursor=0;
  const prefacedCropProps={...exerciseNode.props,item:{question:{...exam.questions[0],solution:prefacedSolution,sourceContent:{questions:[],solutions:[{path:'fake-unavailable.png',sha256:'f'.repeat(64),sourcePage:1,width:600,height:400,privateUnavailable:true}]}},index:0}};
  const prefacedCrop=exerciseNode.type(prefacedCropProps);
  const drawPrefacedCrop=()=>{cursor=0;return exerciseNode.type(prefacedCropProps);};
  const prefacedCropOpen=openSolution(drawPrefacedCrop),cropSource=find(prefacedCropOpen,n=>n.props?.kind==='solution');
  assert.equal(cropSource.props.context,'review','Ảnh lời giải được mở trong ngữ cảnh ôn');
  assert.equal(find(cropSource.props.errorFallback,n=>n.props?.text===prefacedSolution)?.props.text,prefacedSolution,'Ảnh lỗi vẫn có bản chữ nguyên vẹn của đúng câu');
  const prefacedCropHtml=renderToStaticMarkup(prefacedCropOpen);
  assert.match(prefacedCropHtml,/Điều kiện/,'Ảnh privateUnavailable vẫn dựng điều kiện ở bản chữ');
  assert.ok(!prefacedCropHtml.includes('nộp phần đã làm'),'Lời giải trong phần ôn không nhắc nộp bài');
  values=[];cursor=0;
  const noSteps=exerciseNode.type({...exerciseNode.props,item:{question:{...exam.questions[0],solution:'Thay số và đối chiếu kết quả.'},index:0}});
  assert.ok(!renderToStaticMarkup(noSteps).includes('điều kiện'),'Lời giải không có bước không bị nhắc điều kiện không tồn tại');
  exercise=draw();
  const initialStatus=find(exercise,n=>n.props?.id===':retry-test:-feedback');
  assert.equal(initialStatus.props.id,':retry-test:-feedback','Vùng phản hồi có id cố định ngay khi mở phần ôn');
  assert.equal(initialStatus.props.className,undefined,'Chưa kiểm tra thì vùng phản hồi không dựng khung kết quả rỗng');
  assert.equal(renderToStaticMarkup(initialStatus).replace(/<[^>]*>/g,''),'','Chưa có kết quả thì vùng phản hồi chưa có nội dung');
  assert.equal(initialStatus.props['aria-live'],'off','Phản hồi chỉ thông báo khi nhận focus');
  const support=find(exercise,n=>n.props?.className==='btvn-retry-support');assert.ok(button(support,'Xem gợi ý bước 1'));assert.ok(button(support,'Xem lời giải đầy đủ của câu ôn'),'Gợi ý và lời giải cùng một nhóm hỗ trợ');
  const confirmValues:any[]=[];
  const drawConfirm=()=>{values=confirmValues;cursor=0;return exerciseNode.type({...exerciseNode.props,onDraftChange:undefined,onCorrect(){}});};
  find(drawConfirm(),n=>n.type==='input'&&n.props.value==='C').props.onChange();
  let confirmTree=drawConfirm(),confirmFocusCount=0;
  const confirmTrigger=button(confirmTree,'Xem lời giải đầy đủ của câu ôn');
  confirmTrigger.ref.current={focus(){confirmFocusCount++;}};
  confirmTrigger.props.onClick();confirmTree=drawConfirm();
  assert.equal(button(confirmTree,'Xem lời giải đầy đủ của câu ôn').props['aria-expanded'],false,'Lần bấm đầu chỉ hỏi xác nhận khi còn lượt');
  assert.equal(button(confirmTree,'Xem lời giải đầy đủ của câu ôn').props['aria-describedby'],':retry-test:-solution-warning');
  assert.equal(find(confirmTree,n=>n.props?.fallback===exam.questions[0].solution),null,'Chưa xác nhận thì chưa dựng lời giải');
  assert.match(renderToStaticMarkup(find(confirmTree,n=>n.props?.id===':retry-test:-solution-warning')),/Em còn lượt tính điểm/);
  const confirmDialog=find(confirmTree,n=>n.type==='dialog');
  assert.equal(confirmDialog.props.role,'dialog');
  assert.equal(confirmDialog.props['aria-modal'],'true');
  assert.equal(confirmDialog.props['aria-labelledby'],':retry-test:-source-title');
  assert.equal(confirmDialog.props['aria-describedby'],':retry-test:-solution-warning','Cảnh báo là mô tả của dialog, được đọc cùng lúc nhận focus');
  // Native/fallback opening, initial focus and keyboard containment are exercised
  // in exams-dialog-compat.test.mts. This hook-light view checks answer gating
  // and cancellation without pretending a ref invocation is a browser commit.
  let modalCloseCount=0;
  const modalNode={open:true,close(){this.open=false;modalCloseCount++;},removeAttribute(){}};
  assert.ok(confirmDialog.ref&&typeof confirmDialog.ref==='object');
  confirmDialog.ref.current=modalNode;
  let escapePrevented=false;
  confirmDialog.props.onCancel({preventDefault(){escapePrevented=true;}});confirmTree=drawConfirm();
  assert.equal(escapePrevented,true,'Escape đi qua đường hủy được kiểm soát');
  assert.equal(modalCloseCount,1,'Escape đóng dialog native');
  assert.equal(button(confirmTree,'Vẫn mở lời giải'),null,'Escape hủy xác nhận');
  assert.equal(find(confirmTree,n=>n.type==='input'&&n.props.value==='C').props.checked,true,'Hủy xác nhận giữ câu trả lời đang thử');
  assert.equal(confirmFocusCount,1,'Hủy trả focus về nút mở lời giải');
  button(confirmTree,'Xem lời giải đầy đủ của câu ôn').props.onClick();confirmTree=drawConfirm();
  button(confirmTree,'Tiếp tục tự làm').props.onClick();confirmTree=drawConfirm();
  assert.equal(button(confirmTree,'Vẫn mở lời giải'),null,'Nút tiếp tục tự làm cũng hủy cùng đường');
  assert.equal(confirmFocusCount,2,'Nút hủy trả focus về đúng nút mở lời giải');
  confirmTree=openSolution(drawConfirm);
  assert.ok(button(confirmTree,'Đóng lời giải câu ôn'),'Vẫn cho mở khi em xác nhận');
  assert.equal(confirmFocusCount,3,'Xác nhận trả focus về nút đóng lời giải');
  button(confirmTree,'Đóng lời giải câu ôn').props.onClick();confirmTree=drawConfirm();
  button(confirmTree,'Mở lại lời giải đã xem').props.onClick();confirmTree=drawConfirm();
  assert.ok(button(confirmTree,'Đóng lời giải câu ôn'),'Mở lại lời giải đã xem không hỏi lặp');
  assert.equal(button(confirmTree,'Vẫn mở lời giải'),null);
  assert.equal(find(confirmTree,n=>n.type==='input'&&n.props.value==='C').props.checked,true,'Mở, đóng lời giải giữ nháp');
  // Gợi ý là nguyên văn lời giải, kể cả bước cuối nêu nghiệm: cùng cổng nhắc trước khi xem.
  const hintValues:any[]=[];
  const drawHint=(canAttemptAgain=true)=>{values=hintValues;cursor=0;return exerciseNode.type({...exerciseNode.props,canAttemptAgain,onDraftChange:undefined,onCorrect(){}});};
  find(drawHint(),n=>n.type==='input'&&n.props.value==='A').props.onChange();
  let hintTree=drawHint(),hintFocusCount=0;
  const hintTrigger=button(hintTree,'Xem gợi ý bước 1');
  hintTrigger.ref.current={focus(){hintFocusCount++;}};
  hintTrigger.props.onClick();hintTree=drawHint();
  assert.ok(button(hintTree,'Vẫn mở gợi ý'),'Còn lượt phải xác nhận gợi ý nguồn có thể lộ đáp án');
  assert.equal(button(hintTree,'Xem gợi ý bước 1').props['aria-describedby'],':retry-test:-solution-warning');
  assert.equal(button(hintTree,'Xem lời giải đầy đủ của câu ôn').props['aria-describedby'],undefined,'Lời nhắc liên kết đúng nút vừa bấm');
  assert.match(renderToStaticMarkup(find(hintTree,n=>n.props?.id===':retry-test:-solution-warning')),/Gợi ý trích từ lời giải có thể cho biết đáp án/);
  assert.ok(!renderToStaticMarkup(hintTree).includes('Trừ 1 ở hai vế'),'Chưa xác nhận thì chưa dựng bước nguồn');
  button(hintTree,'Tiếp tục tự làm').props.onClick();hintTree=drawHint();
  assert.equal(button(hintTree,'Vẫn mở gợi ý'),null);
  assert.equal(find(hintTree,n=>n.type==='input'&&n.props.value==='A').props.checked,true,'Hủy gợi ý giữ nháp');
  assert.ok(!renderToStaticMarkup(hintTree).includes('Trừ 1 ở hai vế'));
  assert.equal(hintFocusCount,1,'Hủy trả focus về nút gợi ý');
  hintTree=openHint(drawHint);
  assert.match(renderToStaticMarkup(hintTree),/Trừ 1 ở hai vế/);
  assert.equal(hintFocusCount,2,'Mở gợi ý trả focus về nút bước tiếp theo');
  assert.ok(button(hintTree,'Xem lời giải đầy đủ của câu ôn'),'Xem một gợi ý chưa được gọi là đã xem toàn bộ lời giải');
  button(hintTree,'Xem gợi ý bước 2').props.onClick();hintTree=drawHint();
  assert.equal(button(hintTree,'Vẫn mở gợi ý'),null,'Không hỏi lặp ở bước sau trong cùng câu');
  assert.match(renderToStaticMarkup(hintTree),/Chia hai vế cho 2/,'Vẫn giữ nguyên bước nguồn có nghiệm sau xác nhận');
  assert.equal(button(hintTree,'Đã mở hết các bước nguồn').props.disabled,true);
  const finalHintRegion=find(hintTree,n=>n.props?.id===':retry-test:-hints');
  assert.equal(finalHintRegion.props.tabIndex,-1,'Vùng bước cuối nhận focus nhưng không thêm điểm Tab');
  let finalHintFocusCount=0;
  finalHintRegion.ref({focus(){finalHintFocusCount++;}});
  assert.equal(finalHintFocusCount,1,'Mở bước cuối chuyển focus sau commit vào vùng gợi ý');
  assert.equal(hintFocusCount,2,'Bước cuối không trả focus về nút bị disabled');
  find(drawHint(),n=>n.props?.id===':retry-test:-hints').ref({focus(){finalHintFocusCount++;}});
  assert.equal(finalHintFocusCount,1,'Cập nhật tiếp theo không giật focus vùng gợi ý');
  assert.equal(button(hintTree,'Xem lời giải đầy đủ của câu ôn').props['aria-expanded'],false,'Mở hết gợi ý vẫn chưa mở lời giải đầy đủ');
  button(hintTree,'Thử lại từ đầu').props.onClick();hintTree=drawHint();
  assert.equal(find(hintTree,n=>n.type==='input'&&n.props.value==='A').props.checked,false,'Reset vẫn xóa câu trả lời thử');
  assert.equal(renderToStaticMarkup(find(hintTree,n=>n.props?.id===':retry-test:-feedback')).replace(/<[^>]*>/g,''),'','Reset nháp có đáp án không báo đã đổi lựa chọn khi ô vừa rỗng');
  button(hintTree,'Xem gợi ý bước 1').props.onClick();hintTree=drawHint();
  assert.equal(button(hintTree,'Vẫn mở gợi ý'),null,'Reset không xóa việc đã xem nguồn trong cùng câu');
  button(hintTree,'Xem lời giải đầy đủ của câu ôn').props.onClick();hintTree=drawHint();
  assert.ok(button(hintTree,'Vẫn mở lời giải'),'Xác nhận gợi ý không thay xác nhận riêng cho lời giải đầy đủ');
  assert.equal(find(hintTree,n=>n.props?.fallback===exam.questions[0].solution),null,'Chưa xác nhận riêng thì không dựng lời giải đầy đủ');
  button(hintTree,'Tiếp tục tự làm').props.onClick();hintTree=drawHint();
  assert.equal(button(hintTree,'Xem lời giải đầy đủ của câu ôn').props['aria-expanded'],false,'Hủy xác nhận lời giải giữ lời giải đóng dù đã xem gợi ý');
  button(hintTree,'Xem lời giải đầy đủ của câu ôn').props.onClick();hintTree=drawHint();
  button(hintTree,'Vẫn mở lời giải').props.onClick();hintTree=drawHint();
  assert.ok(button(hintTree,'Đóng lời giải câu ôn'));
  button(hintTree,'Thử lại từ đầu').props.onClick();hintTree=drawHint();
  assert.ok(button(hintTree,'Mở lại lời giải đã xem'),'Reset giữ nhãn đã xem toàn bộ đúng sự thật');
  button(hintTree,'Mở lại lời giải đã xem').props.onClick();hintTree=drawHint();
  assert.equal(button(hintTree,'Vẫn mở lời giải'),null,'Reset rồi mở lại lời giải không hỏi lần nữa');
  values=[];cursor=0;
  const exhaustedHintValues:any[]=[];
  const drawExhaustedHint=()=>{values=exhaustedHintValues;cursor=0;return exerciseNode.type({...exerciseNode.props,canAttemptAgain:false,onDraftChange:undefined,onCorrect(){}});};
  button(drawExhaustedHint(),'Xem gợi ý bước 1').props.onClick();
  assert.equal(button(drawExhaustedHint(),'Vẫn mở gợi ý'),null,'Hết lượt tính điểm không hỏi cảnh báo gợi ý thừa');
  assert.match(renderToStaticMarkup(drawExhaustedHint()),/Trừ 1 ở hai vế/);
  exercise=draw();
  find(exercise,n=>n.type==='input'&&n.props.value==='A').props.onChange();exercise=draw();
  find(exercise,n=>n.type==='form').props.onSubmit({preventDefault(){}});exercise=draw();assert.match(renderToStaticMarkup(exercise),/Chưa khớp đáp án/);
  find(exercise,n=>n.type==='input'&&n.props.value==='C').props.onChange();exercise=draw();assert.ok(!renderToStaticMarkup(exercise).includes('Chưa khớp đáp án'));
  find(exercise,n=>n.type==='form').props.onSubmit({preventDefault(){}});exercise=draw();assert.match(renderToStaticMarkup(exercise),/Em đã làm đúng câu này/);assert.match(find(exercise,n=>n.props?.id===':retry-test:-feedback').props.className,/btvn-retry-success/);
  assert.equal((renderToStaticMarkup(exercise).match(/aria-label="Phản hồi câu ôn"/g)??[]).length,1,'Chấm đúng chỉ có một nhóm phản hồi kết quả');
  assert.ok(!renderToStaticMarkup(exercise).includes('role="status"'),'Phản hồi không dùng status tạo live ngầm định cùng lúc với focus');
  const progressNode=find(drawParent(),n=>n.props?.className==='btvn-retry-status');
  assert.equal(progressNode.props['aria-live'],undefined,'Không đọc lại toàn bộ tiến độ khi số câu đúng tăng');
  assert.equal(progressNode.props.children[0].props['aria-live'],undefined,'Bộ đếm câu không có live region');
  assert.match(renderToStaticMarkup(find(progressNode,n=>n.props?.['aria-live']==='polite')),/Đang ôn/,'Chỉ nhãn câu đang ôn được đọc khi đổi câu');
  assert.match(nextButton(drawParent()).props.className,/btvn-retry-start/,'Sau sửa đúng, nút chuyển câu được nhấn màu vàng');
  assert.match(progress(),/Đã làm đúng 1\/2 câu/);
  find(exercise,n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.match(progress(),/Đã làm đúng 1\/2 câu/,'Kiểm lại cùng câu đúng không tăng bộ đếm');
  const correctedPill=find(drawParent(),n=>n.type==='button'&&n.props['aria-label']?.includes('Đã làm đúng trong phiên ôn'));
  assert.ok(correctedPill,'Pill ghi nhận đã làm đúng mà không ghi điểm/lượt');
  assert.equal(correctedPill.props['aria-label'],'I · Trắc nghiệm · Câu 1 · Đã làm đúng trong phiên ôn','Nhãn trợ năng giữ tên phần và trạng thái đầy đủ');
  assert.equal(find(correctedPill,n=>n.props?.className==='btvn-retry-pill-compact').props.children,'I · Câu 1','Nhãn mobile gọn nhưng không lẫn Câu 1 ở hai phần');
  exercise=openHint(draw);let html=renderToStaticMarkup(exercise);assert.match(html,/Trừ 1 ở hai vế/);assert.ok(!html.includes('Chia hai vế cho 2'));assert.ok(find(exercise,n=>n.props?.className==='btvn-retry-hints'),'Gợi ý có khung riêng để phân biệt với đề bài');
  button(exercise,'Xem gợi ý bước 2').props.onClick();exercise=draw();html=renderToStaticMarkup(exercise);assert.match(html,/Chia hai vế cho 2/);assert.equal(button(exercise,'Đã mở hết các bước nguồn').props.disabled,true);
  exercise=openSolution(draw);assert.equal(button(exercise,'Đóng lời giải câu ôn').props['aria-expanded'],true);
  const full=find(exercise,n=>n.props?.fallback===exam.questions[0].solution);assert.ok(full,'Đưa đúng lời giải gốc, đúng exam/version/question vào renderer');assert.equal(full.props.examId,exam.id);assert.equal(full.props.questionId,'fake-mc');assert.equal(full.props.versionHash,exam.versionHash);
  button(exercise,'Thử lại từ đầu').props.onClick();exercise=draw();assert.ok(!renderToStaticMarkup(exercise).includes('Em đã làm đúng câu này'));assert.equal(find(exercise,n=>n.type==='input'&&n.props.value==='C').props.checked,false);assert.ok(button(exercise,'Xem gợi ý bước 1'));
  assert.equal(renderToStaticMarkup(find(exercise,n=>n.props?.id===':retry-test:-feedback')).replace(/<[^>]*>/g,''),'','Reset câu vừa đúng cũng không báo đổi lựa chọn ở ô trống');
  assert.match(progress(),/Đã làm đúng 0\/2 câu/,'Reset câu đúng phải giảm bộ đếm');
  assert.equal(find(drawParent(),n=>n.type==='button'&&n.props['aria-label']?.includes('Đã làm đúng trong phiên ôn')),null,'Reset xóa trạng thái đúng của pill');
  assert.equal(button(exercise,'Thử lại từ đầu').props['aria-label'],'Thử lại từ đầu câu này');
  button(exercise,'Thử lại từ đầu').props.onClick();exercise=draw();
  assert.equal(renderToStaticMarkup(find(exercise,n=>n.props?.id===':retry-test:-feedback')).replace(/<[^>]*>/g,''),'','Reset nháp đang trống không báo đã đổi lựa chọn');
  find(exercise,n=>n.type==='input'&&n.props.value==='C').props.onChange();exercise=draw();
  assert.match(find(drawParent(),n=>n.type==='button'&&n.props['aria-label']?.startsWith('I · Trắc nghiệm')).props.className,/has-draft/,'Câu đang thử có dấu hiệu nháp');
  find(exercise,n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.match(progress(),/Đã làm đúng 1\/2 câu/,'Chỉ chấm đúng lại mới phục hồi tiến độ');
  tree=drawParent();assert.equal(find(tree,n=>n.type==='select'),null);const tfPill=find(tree,n=>n.type==='button'&&n.props['aria-label']==='II · Đúng sai · Câu 1');assert.equal(tfPill.props['aria-pressed'],false);nextButton(tree).props.onClick();tree=drawParent();const selected=find(tree,n=>typeof n.type==='function'&&n.type.name==='RetryExercise');assert.equal(selected.props.item.question.id,'fake-tf');assert.notEqual(selected.key,exerciseNode.key,'Đổi câu phải tạo state ôn riêng');assert.equal(find(tree,n=>n.type==='button'&&n.props['aria-label']==='II · Đúng sai · Câu 1').props['aria-pressed'],true);
  assert.match(progress(),/Đang ôn II · Đúng sai · Câu 1/,'Thông báo câu đang ôn khi chuyển bằng bàn phím');
  const tfValues:any[]=[];
  const drawTf=()=>{values=tfValues;cursor=0;return selected.type(selected.props);};
  let tfTree=drawTf();
  assert.deepEqual(selected.props.submittedAnswer,draft.answers['fake-tf'],'Đổi câu lấy đúng đáp án Đ/S trong bản nộp');
  assert.ok(!renderToStaticMarkup(tfTree).includes('Các ý chưa khớp:'),'Không lộ so khớp trước khi kiểm tra');
  let titleFocusCount=0;
  const tfTitle=find(tfTree,n=>n.type==='h3');
  assert.equal(tfTitle.props.tabIndex,-1,'Tiêu đề nhận focus sau khi đổi câu, không thêm điểm Tab thường');
  tfTitle.ref({focus(){titleFocusCount++;}});
  find(drawTf(),n=>n.type==='h3').ref({focus(){titleFocusCount++;}});
  assert.equal(titleFocusCount,1,'Chuyển focus một lần, không giật focus sau cập nhật câu trả lời');
  for(let i=0;i<4;i++){
    const group=find(tfTree,n=>n.type==='fieldset'&&n.props['aria-describedby']===`:retry-test:-statement-${i}`);
    assert.ok(group,'Nhóm Đúng/Sai liên kết với văn bản mệnh đề');
    assert.equal(find(group,n=>n.type==='legend').props.children.join(''),'Ý '+String.fromCharCode(97+i),'Legend ngắn, không nhét công thức dài');
    assert.equal(find(group,n=>n.props?.id===`:retry-test:-statement-${i}`).props.children.props.text,exam.questions[1].kind==='tf'?exam.questions[1].statements![i]:undefined);
  }
  assert.ok(!renderToStaticMarkup(tfTree).includes('trong đề ở trên'));
  find(tfTree,n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.match(renderToStaticMarkup(drawTf()),/Em trả lời đủ câu/);
  for(const [i,value] of [true,true,false,true].entries()){
    tfTree=drawTf(); // Tìm theo tên input để không phụ thuộc vị trí các fieldset.
    const all:any[]=[];const collect=(node:any)=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(collect);return;}if(node.type==='input'&&node.props.name===`:retry-test:-tf-${i}`)all.push(node);collect(node.props?.children);};collect(tfTree);
    all[value?0:1].props.onChange();
  }
  // Còn lượt tính điểm và chưa mở lời giải: không suy ra ý sai qua chữ hoặc thuộc tính.
  tfTree=drawTf();
  find(tfTree,n=>n.type==='input'&&n.props.name===':retry-test:-tf-1'&&n.props.checked===false).props.onChange();
  tfTree=drawTf();find(tfTree,n=>n.type==='form').props.onSubmit({preventDefault(){}});
  const mismatchStatus=find(drawTf(),n=>n.props?.id===':retry-test:-feedback');
  assert.equal(selected.props.canAttemptAgain,true,'Parent giữ trạng thái còn lượt tính điểm');
  assert.match(renderToStaticMarkup(mismatchStatus),/Có ý chưa khớp\. Em đọc lại từng mệnh đề hoặc mở lời giải\./);
  assert.ok(!renderToStaticMarkup(mismatchStatus).includes('Các ý chưa khớp:'),'Không liệt kê chữ cái khi chưa mở lời giải');
  assert.ok(!renderToStaticMarkup(mismatchStatus).includes('b) Đúng'),'Phản hồi không đưa khóa đáp án');
  for(let i=0;i<4;i++){
    const group=statementGroup(drawTf(),i);
    assert.equal(group.props.className,undefined,'Chưa mở lời giải thì không đánh dấu trực quan ý lệch');
    assert.equal(group.props['aria-invalid'],undefined,'Chưa mở lời giải thì aria không tiết lộ ý lệch');
    assert.equal(group.props['aria-describedby'],`:retry-test:-statement-${i}`,'Chỉ liên kết văn bản mệnh đề, không chỉ riêng ý lệch');
  }
  // Chỉ sau khi mở lời giải mới liệt kê và liên kết lỗi với mệnh đề tương ứng.
  button(drawTf(),'Xem lời giải đầy đủ của câu ôn').props.onClick();tfTree=drawTf();
  assert.ok(button(tfTree,'Vẫn mở lời giải'));
  assert.ok(!renderToStaticMarkup(find(tfTree,n=>n.props?.id===':retry-test:-feedback')).includes('Các ý chưa khớp:'),'Đang xác nhận vẫn không tiết lộ ý sai');
  assert.equal(statementGroup(tfTree,1).props['aria-invalid'],undefined);
  button(tfTree,'Vẫn mở lời giải').props.onClick();tfTree=drawTf();
  assert.match(renderToStaticMarkup(find(tfTree,n=>n.props?.id===':retry-test:-feedback')),/Các ý chưa khớp: Ý b\./);
  assert.equal(statementGroup(tfTree,1).props.className,'is-mismatch');
  assert.equal(statementGroup(tfTree,1).props['aria-invalid'],true);
  assert.equal(statementGroup(tfTree,1).props['aria-describedby'],':retry-test:-statement-1 :retry-test:-feedback','Ý lệch liên kết cùng nhóm phản hồi');
  assert.equal(statementGroup(tfTree,0).props['aria-invalid'],undefined,'Không đánh dấu ý đang khớp');
  button(tfTree,'Đóng lời giải câu ôn').props.onClick();tfTree=drawTf();
  assert.ok(!renderToStaticMarkup(find(tfTree,n=>n.props?.id===':retry-test:-feedback')).includes('Các ý chưa khớp:'),'Đóng lời giải khi còn lượt thì trở lại phản hồi chung');
  assert.equal(statementGroup(tfTree,1).props['aria-invalid'],undefined,'Đóng lời giải cũng bỏ dấu riêng từng ý');
  button(tfTree,'Mở lại lời giải đã xem').props.onClick();
  tfTree=drawTf();find(tfTree,n=>n.type==='input'&&n.props.name===':retry-test:-tf-1'&&n.props.checked===false).props.onChange();
  tfTree=drawTf();
  const changedStatus=find(tfTree,n=>n.props?.id===':retry-test:-feedback');
  assert.equal(changedStatus.props.id,mismatchStatus.props.id,'Đổi lựa chọn giữ cùng vùng phản hồi');
  assert.match(renderToStaticMarkup(changedStatus),/Em đã đổi lựa chọn\. Bấm Kiểm tra lại để chấm lại câu này\./);
  assert.ok(!renderToStaticMarkup(changedStatus).includes('chưa khớp'),'Đổi lựa chọn xóa phản hồi so khớp cũ');
  for(let i=0;i<4;i++){
    assert.equal(statementGroup(tfTree,i).props.className,undefined,'Đổi lựa chọn xóa đánh dấu ý lệch');
    assert.equal(statementGroup(tfTree,i).props['aria-invalid'],undefined,'Đổi lựa chọn xóa aria-invalid cũ');
    assert.equal(statementGroup(tfTree,i).props['aria-describedby'],`:retry-test:-statement-${i}`,'Đổi lựa chọn xóa liên kết lỗi cũ');
  }
  tfTree=drawTf();find(tfTree,n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.match(renderToStaticMarkup(drawTf()),/Em đã làm đúng câu này/);
  assert.match(progress(),/Đã làm đúng 2\/2 câu/);
  assert.equal(nextButton(drawParent()).props.disabled,true,'Hết câu chưa đúng thì không ép luyện thêm');
  const completeNode=exerciseIn(drawParent());values=tfValues;cursor=0;
  const completed=completeNode.type(completeNode.props),completedStatus=find(completed,n=>n.props?.id===':retry-test:-feedback');
  assert.match(completedStatus.props.className,/btvn-retry-feedback btvn-retry-success/,'Hoàn tất dùng chung hộp phản hồi có khung');
  const completedHtml=renderToStaticMarkup(completed);
  assert.match(completedHtml,/Em đã làm đúng các câu trong phiên ôn này/);
  assert.equal((completedHtml.match(/aria-label="Phản hồi câu ôn"/g)??[]).length,1,'Thông báo hoàn tất nằm trong cùng một nhóm phản hồi');
  // Tiến độ và hộp kết quả cùng đi theo câu trả lời đang thử.
  find(completed,n=>n.type==='input'&&n.props.name===':retry-test:-tf-1'&&n.props.checked===false).props.onChange();
  assert.match(progress(),/Đã làm đúng 1\/2 câu/,'Đổi một ý sau khi đúng phải giảm tiến độ ngay trước lần chấm sau');
  const changedTfPill=find(drawParent(),n=>n.type==='button'&&n.props['aria-label']?.startsWith('II · Đúng sai'));
  assert.match(changedTfPill.props.className,/has-draft/);
  assert.ok(!changedTfPill.props.className.includes('is-correct'));
  assert.match(changedTfPill.props['aria-label'],/Có nháp đang làm dở/,'Nhãn trợ năng không còn báo đúng sau khi thay đáp án');
  assert.equal(nextButton(drawParent()).props.disabled,true,'Đang ở câu chưa đúng duy nhất thì giữ giải thích nút tắt');
  values=tfValues;cursor=0;const completedChanged=completeNode.type(completeNode.props);
  assert.ok(!renderToStaticMarkup(find(completedChanged,n=>n.props?.id===':retry-test:-feedback')).includes('Em đã làm đúng các câu'),'Đang chờ chấm lại thì không lặp lời chúc hoàn tất');
  find(completedChanged,n=>n.type==='form').props.onSubmit({preventDefault(){}});
  values=tfValues;cursor=0;const completedWrong=completeNode.type(completeNode.props),completedWrongStatus=find(completedWrong,n=>n.props?.id===':retry-test:-feedback');
  assert.match(completedWrongStatus.props.className,/btvn-retry-error/);
  assert.match(renderToStaticMarkup(completedWrongStatus),/Chưa khớp đáp án/);
  assert.ok(!renderToStaticMarkup(completedWrongStatus).includes('Em đã làm đúng các câu'),'Không đặt lời chúc hoàn tất trong hộp lỗi sau khi đã hoàn thành rồi thử sai');
  assert.ok(completedHtml.indexOf('Ôn câu chưa xong tiếp theo')<completedHtml.indexOf('btvn-retry-support'),'Nút chuyển câu nằm cạnh kết quả, trước gợi ý và lời giải dài');
  // Hết lượt tính điểm: phản hồi từng ý được mở dù lời giải còn đóng.
  const exhaustedState={...state,attemptsUsed:state.maxAttempts};
  values=[{key:draft.attemptId+':'+exam.versionHash,selected:'fake-tf',open:true,correct:[]}];cursor=0;
  const exhaustedNode=exerciseIn(Retry({state:exhaustedState}));
  assert.equal(exhaustedNode.props.canAttemptAgain,false,'Parent truyền đúng trạng thái hết lượt');
  const exhaustedValues:any[]=[];
  const drawExhausted=()=>{values=exhaustedValues;cursor=0;return exhaustedNode.type(exhaustedNode.props);};
  for(const [i,value] of [true,false,false,true].entries()){
    const group=statementGroup(drawExhausted(),i);
    const choice=find(group,n=>n.type==='label'&&n.props.children[1].props.children===(value?'Đúng':'Sai'));
    find(choice,n=>n.type==='input').props.onChange();
  }
  const exhaustedTree=drawExhausted();
  find(exhaustedTree,n=>n.type==='form').props.onSubmit({preventDefault(){}});
  const exhaustedWrong=drawExhausted();
  assert.equal(button(exhaustedWrong,'Xem lời giải đầy đủ của câu ôn').props['aria-expanded'],false);
  assert.match(renderToStaticMarkup(find(exhaustedWrong,n=>n.props?.id===':retry-test:-feedback')),/Các ý chưa khớp: Ý b\./);
  assert.equal(statementGroup(exhaustedWrong,1).props['aria-invalid'],true);
  assert.equal(statementGroup(exhaustedWrong,1).props.className,'is-mismatch');
  button(exhaustedWrong,'Xem lời giải đầy đủ của câu ôn').props.onClick();
  assert.ok(button(drawExhausted(),'Đóng lời giải câu ôn'),'Hết lượt tính điểm thì mở trực tiếp');
  assert.equal(button(drawExhausted(),'Vẫn mở lời giải'),null,'Hết lượt không hỏi cảnh báo thừa');
  values=[];cursor=0;
  const exhaustedRestored=exhaustedNode.type({...exhaustedNode.props,savedDraft:{answer:[true,false,false,true],verdict:'wrong',hints:0,solution:true,solutionViewed:true,needsRecheck:false}});
  assert.equal(button(exhaustedRestored,'Đóng lời giải câu ôn').props['aria-expanded'],true,'Hết lượt vẫn khôi phục lời giải đang mở');
  assert.match(renderToStaticMarkup(find(exhaustedRestored,n=>n.props?.id===':retry-test:-feedback')),/Các ý chưa khớp: Ý b\./);
  values=[];cursor=0;const malformedTf=selected.type({...selected.props,item:{question:{...exam.questions[1],answer:undefined},index:1}});assert.doesNotThrow(()=>renderToStaticMarkup(malformedTf),'Màn Đ/S không gọi map trên khóa đáp án thiếu');
  const shortValues:any[]=[];
  const drawShort=()=>{values=shortValues;cursor=0;return selected.type({...selected.props,exam,item:{question:exam.questions[2],index:2},onDraftChange:undefined,onCorrect(){}});};
  let shortTree=drawShort();find(shortTree,n=>n.type==='input'&&n.props.type==='text').props.onChange({target:{value:'1/0'}});shortTree=drawShort();find(shortTree,n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(find(drawShort(),n=>n.type==='input').props['aria-invalid'],true);
  find(drawShort(),n=>n.type==='input').props.onChange({target:{value:'2/4'}});shortTree=drawShort();find(shortTree,n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.match(renderToStaticMarkup(drawShort()),/Em đã làm đúng câu này/);
  tree=drawParent();
  button(tree,'Đóng phần ôn').props.onClick();assert.ok(button(drawParent(),'Ôn một câu của lượt này'));
  button(drawParent(),'Ôn một câu của lượt này').props.onClick();assert.match(progress(),/Đã làm đúng 1\/2 câu/,'Đóng/mở cùng phiên giữ tiến độ của các câu trả lời hiện tại');
  const nextAttempt={...state,draft:{...draft,attemptId:'fake-attempt-next'},receipts:[{...state.receipts[0],attemptId:'fake-attempt-next'}]};
  tree=drawParent(nextAttempt);assert.ok(button(tree,'Ôn một câu của lượt này'));button(tree,'Ôn một câu của lượt này').props.onClick();tree=drawParent(nextAttempt);assert.equal(find(tree,n=>n.type==='button'&&n.props.className?.includes('is-correct')),null,'Lượt mới không giữ dấu đã làm đúng của lượt trước');assert.equal(find(tree,n=>typeof n.type==='function'&&n.type.name==='RetryExercise').props.item.question.id,'fake-mc','Lượt mới chọn lại câu đầu');
  assert.match(renderToStaticMarkup(find(tree,n=>n.props?.className==='btvn-retry-status')),/Đã làm đúng 0\/2 câu/);
  const nextVersion={...nextAttempt,exam:{...exam,versionHash:'d'.repeat(64)},draft:{...nextAttempt.draft,examVersionHash:'d'.repeat(64)}};assert.ok(button(drawParent(nextVersion),'Ôn một câu của lượt này'),'Đổi phiên bản cũng đóng phần ôn cũ');
  button(drawParent(nextVersion),'Ôn một câu của lượt này').props.onClick();assert.match(renderToStaticMarkup(find(drawParent(nextVersion),n=>n.props?.className==='btvn-retry-status')),/Đã làm đúng 0\/2 câu/);
  values=[{key:draft.attemptId+':'+exam.versionHash,selected:'fake-tf',open:true,correct:['fake-tf']}];cursor=0;
  const wrapped=Retry({state});nextButton(wrapped).props.onClick();cursor=0;
  assert.equal(find(Retry({state}),n=>typeof n.type==='function'&&n.type.name==='RetryExercise').props.item.question.id,'fake-mc','Chuyển từ câu cuối về câu chưa đúng đầu, bỏ qua câu đã sửa');
  values=[{key:draft.attemptId+':'+exam.versionHash,selected:'fake-mc',open:true,correct:['fake-tf']}];cursor=0;
  const lastRemaining=exerciseIn(Retry({state}));values=[];cursor=0;
  const lastRemainingTree=lastRemaining.type(lastRemaining.props),lastButton=button(lastRemainingTree,'Ôn câu chưa xong tiếp theo');
  assert.equal(lastButton.props.disabled,true);
  assert.equal(lastButton.props['aria-describedby'],':retry-test:-remaining');
  assert.match(renderToStaticMarkup(lastRemainingTree),/Em đang ở câu còn lại chưa đúng hoặc còn bỏ trống/,'Nút tắt được giải thích khi chỉ còn chính câu đang ôn');
  assert.ok(!renderToStaticMarkup(lastRemainingTree).includes('Em đã làm đúng các câu trong phiên ôn này'),'Không chúc mừng toàn bộ khi còn một câu chưa đúng');
  const wrongShortState={...state,draft:{...draft,answers:{...draft.answers,'fake-short':'1/3'}}};
  values=[];cursor=0;let shortParent=Retry({state:wrongShortState});
  button(shortParent,'Ôn một câu của lượt này').props.onClick();cursor=0;
  shortParent=Retry({state:wrongShortState});
  find(shortParent,n=>n.type==='button'&&n.props['aria-label']==='III · Trả lời ngắn · Câu 1').props.onClick();cursor=0;
  const shortFromParent=exerciseIn(Retry({state:wrongShortState}));
  assert.equal(shortFromParent.props.submittedAnswer,'1/3','Parent chuyển đúng đáp án ngắn đã nộp của câu vừa chọn');
  assert.equal(shortFromParent.props.item.question.id,'fake-short');
  values=[];cursor=0;const emptyShortRetry=shortFromParent.type(shortFromParent.props);
  assert.match(renderToStaticMarkup(find(emptyShortRetry,n=>n.type==='details')),/Câu trả lời đã nộp: 1\/3/);
  assert.equal(find(emptyShortRetry,n=>n.type==='input'&&n.props.type==='text').props.value,'','Ô ôn ngắn rỗng dù bản nộp có câu trả lời');
  assert.equal(wrongShortState.draft.answers['fake-short'],'1/3');
  assert.equal(JSON.stringify(state),original,'Câu trả lời ôn không sửa bản nộp, receipt, điểm hay số lượt gốc');

  // Mô phỏng mount/unmount theo key thật, không giữ hook của câu đã rời khỏi cây.
  const memoryParentValues:any[]=[];
  let memoryChildValues:any[]=[],memoryChildKey:string|null=null;
  const drawMemoryParent=(input=wrongShortState)=>{
    values=memoryParentValues;cursor=0;
    const parent=Retry({state:input});
    if(!exerciseIn(parent)){memoryChildKey=null;memoryChildValues=[];}
    return parent;
  };
  const drawMemoryExercise=(input=wrongShortState)=>{
    const node=exerciseIn(drawMemoryParent(input));assert.ok(node,'Phần ôn đang mở');
    if(node.key!==memoryChildKey){memoryChildKey=node.key;memoryChildValues=[];}
    values=memoryChildValues;cursor=0;
    return node.type(node.props);
  };
  const chooseMemoryQuestion=(id:string,input=wrongShortState)=>{
    const parent=drawMemoryParent(input),node=exerciseIn(parent);
    const index=input.exam!.questions.findIndex(q=>q.id===id);
    const label=['I · Trắc nghiệm · Câu 1','II · Đúng sai · Câu 1','III · Trả lời ngắn · Câu 1'][index];
    assert.ok(node);
    find(parent,n=>n.type==='button'&&n.props['aria-label']?.startsWith(label)).props.onClick();
    return drawMemoryExercise(input);
  };
  const submitMemory=(input=wrongShortState)=>{
    find(drawMemoryExercise(input),n=>n.type==='form').props.onSubmit({preventDefault(){}});
    return drawMemoryExercise(input);
  };
  const chooseMemoryTf=(index:number,value:boolean)=>{
    const group=statementGroup(drawMemoryExercise(),index);
    const label=find(group,n=>n.type==='label'&&n.props.children[1].props.children===(value?'Đúng':'Sai'));
    find(label,n=>n.type==='input').props.onChange();
  };
  const unchangedSnapshot=JSON.stringify(wrongShortState);
  button(drawMemoryParent(),'Ôn một câu của lượt này').props.onClick();
  let memoryTree=drawMemoryExercise();
  find(memoryTree,n=>n.type==='input'&&n.props.value==='A').props.onChange();
  assert.match(renderToStaticMarkup(submitMemory()),/Chưa khớp đáp án/);
  openHint(drawMemoryExercise);
  openSolution(drawMemoryExercise);

  chooseMemoryQuestion('fake-tf');
  for(const [i,value] of [true,false,false,true].entries())chooseMemoryTf(i,value);
  assert.match(renderToStaticMarkup(submitMemory()),/Có ý chưa khớp/);
  assert.equal(statementGroup(drawMemoryExercise(),1).props['aria-invalid'],undefined,'Nháp Đ/S chưa mở lời giải vẫn không lộ ý sai');
  openSolution(drawMemoryExercise);

  chooseMemoryQuestion('fake-short');
  button(drawMemoryExercise(),'Xem gợi ý bước 1').props.onClick();
  assert.ok(button(drawMemoryExercise(),'Vẫn mở gợi ý'),'Xem nguồn câu MC không bỏ lời nhắc ở câu ngắn khác');
  button(drawMemoryExercise(),'Tiếp tục tự làm').props.onClick();
  find(drawMemoryExercise(),n=>n.type==='input'&&n.props.type==='text').props.onChange({target:{value:'1/0'}});
  assert.equal(find(submitMemory(),n=>n.type==='input').props['aria-invalid'],true);
  memoryTree=chooseMemoryQuestion('fake-mc');
  assert.equal(find(memoryTree,n=>n.type==='input'&&n.props.value==='A').props.checked,true,'MC giữ lựa chọn khi quay lại');
  assert.match(renderToStaticMarkup(find(memoryTree,n=>n.props?.id===':retry-test:-feedback')),/Chưa khớp đáp án/,'MC giữ kết quả kiểm hiện tại');
  assert.ok(button(memoryTree,'Xem gợi ý bước 2'),'Giữ số bước gợi ý đã mở của đúng câu');
  assert.equal(button(memoryTree,'Mở lại lời giải đã xem').props['aria-expanded'],false,'Còn lượt thì quay lại câu không tự mở lời giải đã xem');
  button(memoryTree,'Thử lại từ đầu').props.onClick();
  memoryTree=drawMemoryExercise();
  assert.equal(find(memoryTree,n=>n.type==='input'&&n.props.value==='A').props.checked,false,'Reset chỉ xóa câu hiện tại');
  assert.ok(button(memoryTree,'Xem gợi ý bước 1'));
  assert.ok(button(memoryTree,'Mở lại lời giải đã xem'),'Reset cùng câu giữ lịch sử đã xem lời giải');
  assert.ok(!renderToStaticMarkup(find(memoryTree,n=>n.props?.id===':retry-test:-feedback')).includes('Chưa khớp đáp án'));
  button(memoryTree,'Xem gợi ý bước 1').props.onClick();memoryTree=drawMemoryExercise();
  assert.equal(button(memoryTree,'Vẫn mở gợi ý'),null,'Quay lại đúng câu rồi reset vẫn nhớ đã xem nguồn');
  assert.match(renderToStaticMarkup(memoryTree),/Trừ 1 ở hai vế/);

  memoryTree=chooseMemoryQuestion('fake-tf');
  assert.equal(find(statementGroup(memoryTree,1),n=>n.type==='input'&&n.props.checked===true)?.props.checked,true,'Đ/S giữ lựa chọn riêng qua chuyển câu và reset câu khác');
  assert.match(renderToStaticMarkup(find(memoryTree,n=>n.props?.id===':retry-test:-feedback')),/Có ý chưa khớp/);
  assert.ok(!renderToStaticMarkup(memoryTree).includes('Các ý chưa khớp:'),'Còn lượt thì remount đóng cổng chữ cái dù nháp từng mở lời giải');
  for(let i=0;i<4;i++){
    assert.equal(statementGroup(memoryTree,i).props['aria-invalid'],undefined,'Khôi phục nháp không lộ ý lệch qua aria');
    assert.equal(statementGroup(memoryTree,i).props.className,undefined,'Khôi phục nháp không lộ ý lệch qua màu');
    assert.equal(statementGroup(memoryTree,i).props['aria-describedby'],`:retry-test:-statement-${i}`);
  }
  button(memoryTree,'Mở lại lời giải đã xem').props.onClick();memoryTree=drawMemoryExercise();
  assert.match(renderToStaticMarkup(find(memoryTree,n=>n.props?.id===':retry-test:-feedback')),/Các ý chưa khớp: Ý b\./,'Bấm mở lại mới mở cổng chữ cái');
  assert.equal(statementGroup(memoryTree,1).props['aria-invalid'],true);
  chooseMemoryTf(1,true);
  memoryTree=drawMemoryExercise();
  assert.ok(!renderToStaticMarkup(find(memoryTree,n=>n.props?.id===':retry-test:-feedback')).includes('Các ý chưa khớp:'),'Đổi lựa chọn xóa verdict được khôi phục');
  assert.equal(statementGroup(memoryTree,1).props['aria-invalid'],undefined);
  memoryTree=chooseMemoryQuestion('fake-short');
  assert.equal(find(memoryTree,n=>n.type==='input'&&n.props.type==='text').props.value,'1/0','Câu ngắn giữ nguyên văn bản đang thử');
  assert.equal(find(memoryTree,n=>n.type==='input').props['aria-invalid'],true,'Câu ngắn giữ trạng thái định dạng');
  const restoredFeedback=find(memoryTree,n=>n.props?.id===':retry-test:-feedback');
  assert.equal(restoredFeedback.props.tabIndex,-1,'Vùng phản hồi phục hồi nhận focus mà không thêm điểm Tab');
  assert.ok(find(memoryTree,n=>n.type==='input').props['aria-describedby'].split(' ').includes(restoredFeedback.props.id),'Ô câu ngắn mô tả cả phản hồi được phục hồi');
  let restoredTitleFocus=0,restoredFeedbackFocus=0;
  find(memoryTree,n=>n.type==='h3').ref({focus(){restoredTitleFocus++;}});
  restoredFeedback.ref({focus(){restoredFeedbackFocus++;}});
  assert.equal(restoredTitleFocus,0,'Phản hồi được phục hồi có ưu tiên focus khi mount');
  assert.equal(restoredFeedbackFocus,1);
  memoryTree=drawMemoryExercise();find(memoryTree,n=>n.props?.id===':retry-test:-feedback').ref({focus(){restoredFeedbackFocus++;}});
  assert.equal(restoredFeedbackFocus,1,'Không giật focus lại sau cập nhật cùng câu');
  const beforeRepeat=exerciseIn(drawMemoryParent());
  memoryTree=chooseMemoryQuestion('fake-short');
  const afterRepeat=exerciseIn(drawMemoryParent());
  assert.equal(afterRepeat.key,beforeRepeat.key,'Bấm lại pill không remount hay xóa nháp');
  assert.ok(afterRepeat.props.focusSeq>beforeRepeat.props.focusSeq,'Bấm lại pill tạo yêu cầu focus mới');
  find(memoryTree,n=>n.type==='h3').ref({focus(){restoredTitleFocus++;}});
  assert.equal(restoredTitleFocus,1,'Pill cùng câu đưa focus lại vào tiêu đề');
  find(drawMemoryExercise(),n=>n.type==='h3').ref({focus(){restoredTitleFocus++;}});
  assert.equal(restoredTitleFocus,1,'Một lượt kích hoạt chỉ focus tiêu đề một lần');
  button(drawMemoryParent(),'Đóng phần ôn').props.onClick();
  assert.equal(exerciseIn(drawMemoryParent()),null);
  button(drawMemoryParent(),'Ôn một câu của lượt này').props.onClick();
  memoryTree=drawMemoryExercise();
  assert.equal(find(memoryTree,n=>n.type==='input'&&n.props.type==='text').props.value,'1/0','Đóng rồi mở lại giữ nháp câu ngắn');
  assert.equal(find(memoryTree,n=>n.type==='input').props['aria-invalid'],true);
  button(memoryTree,'Thử lại từ đầu').props.onClick();
  assert.equal(find(drawMemoryExercise(),n=>n.type==='input'&&n.props.type==='text').props.value,'');
  memoryTree=chooseMemoryQuestion('fake-tf');
  assert.match(renderToStaticMarkup(find(memoryTree,n=>n.props?.id===':retry-test:-feedback')),/Em đã đổi lựa chọn/,'Reset câu ngắn không làm mất nháp Đ/S');
  assert.ok(!renderToStaticMarkup(find(memoryTree,n=>n.props?.id===':retry-test:-feedback')).includes('Các ý chưa khớp:'),'Verdict cũ không sống lại sau chuyển câu');
  assert.equal(statementGroup(memoryTree,1).props['aria-invalid'],undefined);

  memoryTree=chooseMemoryQuestion('fake-mc');
  find(memoryTree,n=>n.type==='input'&&n.props.value==='C').props.onChange();
  submitMemory();
  assert.match(renderToStaticMarkup(find(drawMemoryParent(),n=>n.props?.className==='btvn-retry-status')),/Đã làm đúng 1\/3 câu/);
  memoryTree=drawMemoryExercise();button(memoryTree,'Thử lại từ đầu').props.onClick();
  assert.match(renderToStaticMarkup(find(drawMemoryParent(),n=>n.props?.className==='btvn-retry-status')),/Đã làm đúng 0\/3 câu/,'Reset câu MC đúng loại khỏi tiến độ cùng phiên có nháp khác');
  const resetMcPill=find(drawMemoryParent(),n=>n.type==='button'&&n.props['aria-label']?.startsWith('I · Trắc nghiệm'));
  assert.ok(!resetMcPill.props['aria-label'].includes('Đã làm đúng'));
  assert.ok(!resetMcPill.props.className.includes('has-draft'),'Reset câu trống cũng bỏ dấu nháp của đúng câu đó');
  memoryTree=chooseMemoryQuestion('fake-tf');
  assert.equal(find(statementGroup(memoryTree,1),n=>n.type==='input'&&n.props.checked===true)?.props.checked,true,'Reset câu MC đúng vẫn giữ nháp Đ/S của câu khác');
  assert.match(renderToStaticMarkup(find(memoryTree,n=>n.props?.id===':retry-test:-feedback')),/Em đã đổi lựa chọn/);

  const nextMemoryAttempt={...wrongShortState,draft:{...wrongShortState.draft,attemptId:'fake-memory-next'},receipts:[{...wrongShortState.receipts[0],attemptId:'fake-memory-next'}]};
  assert.ok(button(drawMemoryParent(nextMemoryAttempt),'Ôn một câu của lượt này'),'Lượt mới đóng phần ôn cũ');
  button(drawMemoryParent(nextMemoryAttempt),'Ôn một câu của lượt này').props.onClick();
  memoryTree=drawMemoryExercise(nextMemoryAttempt);
  assert.equal(find(memoryTree,n=>n.type==='input'&&n.props.value==='A').props.checked,false,'Lượt mới không hồi sinh nháp MC');
  assert.ok(button(memoryTree,'Xem gợi ý bước 1'));
  assert.ok(button(memoryTree,'Xem lời giải đầy đủ của câu ôn'));
  button(memoryTree,'Xem gợi ý bước 1').props.onClick();memoryTree=drawMemoryExercise(nextMemoryAttempt);
  assert.ok(button(memoryTree,'Vẫn mở gợi ý'),'Lượt mới phải nhắc lại, không dùng xác nhận của lượt trước');
  assert.ok(!renderToStaticMarkup(memoryTree).includes('Trừ 1 ở hai vế'));
  button(memoryTree,'Tiếp tục tự làm').props.onClick();memoryTree=drawMemoryExercise(nextMemoryAttempt);
  find(memoryTree,n=>n.type==='input'&&n.props.value==='A').props.onChange();
  openSolution(()=>drawMemoryExercise(nextMemoryAttempt));
  const nextMemoryVersion={...nextMemoryAttempt,exam:{...exam,versionHash:'f'.repeat(64)},draft:{...nextMemoryAttempt.draft,examVersionHash:'f'.repeat(64)}};
  assert.ok(button(drawMemoryParent(nextMemoryVersion),'Ôn một câu của lượt này'),'Bản đề mới đóng phiên ôn cũ');
  button(drawMemoryParent(nextMemoryVersion),'Ôn một câu của lượt này').props.onClick();
  memoryTree=drawMemoryExercise(nextMemoryVersion);
  assert.equal(find(memoryTree,n=>n.type==='input'&&n.props.value==='A').props.checked,false,'Phiên bản mới không hồi sinh câu trả lời');
  assert.ok(button(memoryTree,'Xem lời giải đầy đủ của câu ôn'),'Phiên bản mới không tự mở lời giải cũ');
  button(memoryTree,'Xem gợi ý bước 1').props.onClick();memoryTree=drawMemoryExercise(nextMemoryVersion);
  assert.ok(button(memoryTree,'Vẫn mở gợi ý'),'Bản đề mới không dùng xác nhận xem nguồn bản cũ');
  button(memoryTree,'Tiếp tục tự làm').props.onClick();
  openSolution(()=>drawMemoryExercise(nextMemoryVersion));
  assert.equal(drawMemoryParent({...nextMemoryVersion,solutionsAvailable:false}),null,'Khóa lời giải tháo phần ôn');
  assert.ok(button(drawMemoryParent(nextMemoryVersion),'Ôn một câu của lượt này'),'Khôi phục quyền vẫn bắt đầu phần ôn đóng');
  button(drawMemoryParent(nextMemoryVersion),'Ôn một câu của lượt này').props.onClick();
  assert.ok(button(drawMemoryExercise(nextMemoryVersion),'Xem lời giải đầy đủ của câu ôn'),'Không hồi sinh lời giải sau khi quyền đã bị thu hồi');
  button(drawMemoryExercise(nextMemoryVersion),'Xem gợi ý bước 1').props.onClick();
  assert.ok(button(drawMemoryExercise(nextMemoryVersion),'Vẫn mở gợi ý'),'Thu hồi rồi cấp lại quyền xóa xác nhận xem nguồn cũ');
  button(drawMemoryExercise(nextMemoryVersion),'Tiếp tục tự làm').props.onClick();
  openSolution(()=>drawMemoryExercise(nextMemoryVersion));
  assert.equal(drawMemoryParent({...nextMemoryVersion,receipts:[]}),null,'Mất biên nhận đúng lượt cũng tháo phần ôn và bỏ nháp');
  assert.ok(button(drawMemoryParent(nextMemoryVersion),'Ôn một câu của lượt này'));
  button(drawMemoryParent(nextMemoryVersion),'Ôn một câu của lượt này').props.onClick();
  assert.ok(button(drawMemoryExercise(nextMemoryVersion),'Xem lời giải đầy đủ của câu ôn'),'Có lại ACK không tự mở lời giải nháp trước đó');
  button(drawMemoryExercise(nextMemoryVersion),'Xem gợi ý bước 1').props.onClick();
  assert.ok(button(drawMemoryExercise(nextMemoryVersion),'Vẫn mở gợi ý'),'Mất ACK rồi có lại cũng xóa xác nhận xem nguồn');
  button(drawMemoryExercise(nextMemoryVersion),'Tiếp tục tự làm').props.onClick();
  assert.equal(JSON.stringify(wrongShortState),unchangedSnapshot,'Nháp trong RAM không sửa state, snapshot, receipt, điểm hay lượt');
}finally{globalThis.fetch=originalFetch;}
console.log('Đạt ôn một lỗi BTVN: ACK đúng lượt và khóa lời giải; câu sai hoặc bỏ trống có nguồn; MC/Đ/S/câu ngắn bỏ trống giữ snapshot; Toán kiểm độc lập; nháp MC/Đ/S/câu ngắn theo câu trong RAM, chuyển câu, đóng mở và reset; đổi lượt/phiên bản hoặc mất quyền xóa nháp; giữ nguyên điểm/lượt và không gọi mạng.');
