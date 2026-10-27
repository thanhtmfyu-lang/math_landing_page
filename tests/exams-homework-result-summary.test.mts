import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import type {HomeworkState} from '../src/native/homework/btvn-contract';
import type {PracticeExam} from '../src/native/exams/data';
import {acknowledgedHomeworkReceipt,createHomeworkResultSummary} from '../src/native/homework/result-summary';

// Toàn bộ tên, mã, nguồn, đề và lượt trong tệp này là fixture GIẢ.
const startedAt=Date.parse('2026-10-16T14:00:00+07:00'),submittedAt=startedAt+70000;
const exam:PracticeExam={id:'DE-RIENG-GIA',title:'TIEU-DE-RIENG-GIA',grade:10,period:'GK1',durationMinutes:10,rubricVersion:'MTM-BTVN-10-v1',versionHash:'a'.repeat(64),sourceHash:'b'.repeat(64),sourceRef:'Nguồn GIẢ',sourceUrl:'https://example.invalid/nguon-gia',sourceMaterial:{title:'Nguồn GIẢ',publisher:'Kiểm thử local',version:'fake-v1',locator:'1 câu GIẢ'},publicationVerified:true,questionDisplayVerified:true,answerKeyVerified:true,rubricVerified:true,questionCount:1,sections:[{label:'I · Trắc nghiệm',kind:'mc',count:1}],questions:[{id:'CAU-RIENG-GIA',kind:'mc',sourceRef:'Nguồn GIẢ câu 1',maxMillipoints:10000,prompt:'Giải $2x=4$.',choices:['0','1','2','3'],answer:'C',solution:'Chia hai vế cho 2, được $x=2$.'}]};
const state:HomeworkState={exam,fullName:'TEN-NGUOI-HOC-RIENG-GIA',className:'LOP-RIENG-GIA',lessonCode:'MA-BUOI-RIENG-GIA',dueAt:null,maxAttempts:5,attemptsUsed:1,bestScore:8.25,demo:true,draft:{version:1,examId:exam.id,examVersionHash:exam.versionHash,rubricVersion:exam.rubricVersion,attemptId:'MA-LUOT-RIENG-GIA',startedAt,deadline:startedAt+600000,updatedAt:submittedAt,submittedAt,revision:1,answers:{'CAU-RIENG-GIA':'A'}},receipts:[{attemptId:'MA-LUOT-RIENG-GIA',attemptNumber:1,score:8.25,submittedAt,elapsedSeconds:70,late:false,timedOut:false}]};
const receipt=state.receipts[0],unchanged=JSON.stringify(state);
let count=0;
const test=async(name:string,fn:()=>unknown)=>{await fn();console.log('ĐẠT '+(++count)+' '+name);};

await test('Phiếu chỉ lấy biên nhận đúng lượt và các trường kết quả được phép',()=>{
  const text=createHomeworkResultSummary(state)!;
  assert.match(text,/^MINH THÀNH MATH\nKết quả BTVN\nLượt làm: 1\nĐiểm: 8,25\/10\n/);
  assert.match(text,/Nộp lúc: .*14:01.*16\/10\/2026.*giờ Việt Nam/);
  assert.match(text,/Thời gian làm bài: 1 phút 10 giây\nHạn nộp: Đúng hạn/);
  assert.match(text,/\nPhiếu này không được gửi tự động\.$/);
  for(const privateText of [state.fullName,state.className,state.lessonCode,exam.id,exam.title,exam.sourceUrl!,state.draft!.attemptId,exam.questions[0].id,exam.versionHash])assert.ok(!text.includes(privateText),privateText+' không được xuất');
  const extra={...state,phone:'0900000000',studentCode:'HS-GIA-RIENG',privateUrl:'https://example.invalid/rieng?token=FAKE',draft:{...state.draft!,answers:{'CAU-RIENG-GIA':'DAP-AN-RIENG-GIA'}},receipts:[{...receipt,fullName:'TEN-TRONG-RECEIPT-GIA',note:'GHI-CHU-RIENG-GIA'}]};
  assert.equal(createHomeworkResultSummary(extra),text,'Không ghép trường tự do hoặc câu trả lời vào phiếu');
  assert.equal(createHomeworkResultSummary({...state,kind:'kiem-tra-thang'})!.split('\n')[1],'Kết quả kiểm tra cuối tháng');
  assert.match(createHomeworkResultSummary({...state,receipts:[{...receipt,late:null,timedOut:true}]})!,/Hạn nộp: Đã ghi nhận bài nộp\nKết thúc lượt: Hết giờ tự nộp/);
  assert.match(createHomeworkResultSummary({...state,receipts:[{...receipt,late:true}]})!,/Hạn nộp: Nộp muộn/);
  for(const score of [0,10])assert.ok(createHomeworkResultSummary({...state,receipts:[{...receipt,score}]}));
  assert.ok(createHomeworkResultSummary({...state,receipts:[{...receipt,submittedAt:submittedAt+1000}]}),'Chấp nhận thời gian máy chủ cùng lượt khác thời gian draft');
  assert.equal(JSON.stringify(state),unchanged,'Không sửa bản nộp hoặc biên nhận nguồn');
});

await test('Thiếu ACK đúng lượt, trùng receipt hoặc giá trị kết quả hỏng đều không tạo phiếu',()=>{
  const invalidAcknowledgments:any[]=[{...state,draft:null},{...state,draft:{...state.draft,submittedAt:null}},{...state,receipts:[]},{...state,receipts:[{...receipt,attemptId:'LUOT-CU-GIA'}]},{...state,receipts:[receipt,{...receipt}]},
    ...[NaN,Infinity,-1,10.001,'8.25'].map(score=>({...state,receipts:[{...receipt,score}]})),
    ...[NaN,Infinity,-1,submittedAt+0.5].map(value=>({...state,draft:{...state.draft,submittedAt:value}})),
    {...state,draft:{...state.draft,attemptId:' '}},
  ];
  const invalidMetadata:any[]=[
    ...[0,-1,1.5,Infinity,'1'].map(attemptNumber=>({...state,receipts:[{...receipt,attemptNumber}]})),
    ...[NaN,Infinity,-1,submittedAt+0.5,Date.UTC(10000,0,1),startedAt-1].map(value=>({...state,receipts:[{...receipt,submittedAt:value}]})),
    ...[-1,1.5,Infinity,'70'].map(elapsedSeconds=>({...state,receipts:[{...receipt,elapsedSeconds}]})),
    ...[undefined,'false',0].map(late=>({...state,receipts:[{...receipt,late}]})),
    ...[undefined,'true',1].map(timedOut=>({...state,receipts:[{...receipt,timedOut}]})),
    {...state,draft:{...state.draft,startedAt:submittedAt+1}},{...state,draft:{...state.draft,updatedAt:submittedAt-1}},
  ];
  for(const input of [...invalidAcknowledgments,...invalidMetadata])assert.equal(createHomeworkResultSummary(input),null);
  for(const input of invalidAcknowledgments)assert.equal(acknowledgedHomeworkReceipt(input),null,'Thiếu bản nộp/ACK hoặc điểm hỏng không mở cổng kết quả');
  for(const input of invalidMetadata)assert.ok(acknowledgedHomeworkReceipt(input),'Metadata phiếu hỏng không được khóa điểm đã xác nhận');
});

await test('Công thức máy chủ cho thời gian âm vẫn xác nhận điểm, phiếu từ chối metadata âm',()=>{
  const now=startedAt-2000;
  const elapsedSeconds=Math.min(exam.durationMinutes*60,Math.floor((Math.min(now,Infinity)-startedAt)/1000));
  const input={...state,receipts:[{...receipt,elapsedSeconds}]};
  assert.equal(elapsedSeconds,-2);
  assert.equal(acknowledgedHomeworkReceipt(input),input.receipts[0]);
  assert.equal(createHomeworkResultSummary(input),null);
  for(const score of [NaN,Infinity,-0.01,10.01])assert.equal(acknowledgedHomeworkReceipt({...input,receipts:[{...input.receipts[0],score}]}),null);
});

const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const sameDeps=(a:unknown[]|undefined,b:unknown[]|undefined)=>!!a&&!!b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
class Runtime{
  slots:any[]=[];cursor=0;effects:(()=>void)[]=[];writes=0;
  hooks={
    useId:()=>':result-summary-test:',
    useRef:(initial:any)=>{const i=this.cursor++;if(!(i in this.slots))this.slots[i]={current:initial};return this.slots[i];},
    useState:(initial:any)=>{const i=this.cursor++;if(!(i in this.slots))this.slots[i]=typeof initial==='function'?initial():initial;return [this.slots[i],(next:any)=>{this.writes++;this.slots[i]=typeof next==='function'?next(this.slots[i]):next;}];},
    useEffect:(effect:()=>void|(()=>void),deps?:unknown[])=>{const i=this.cursor++,previous=this.slots[i];if(!previous||!sameDeps(previous.deps,deps)){const slot={deps,cleanup:undefined as undefined|(()=>void)};this.slots[i]=slot;this.effects.push(()=>{previous?.cleanup?.();slot.cleanup=effect()||undefined;});}},
  };
  draw(component:any,props:any){this.cursor=0;const tree=component(props);this.effects.splice(0).forEach(fn=>fn());return tree;}
  unmount(){this.slots.forEach(value=>value?.cleanup?.());}
}
function compile(path:string,runtime:Runtime){
  const code=buildSync({entryPoints:[join(root,path)],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text,mod={exports:{} as any};
  new Function('require','module','exports',code)((id:string)=>id==='react'?{...React,...runtime.hooks}:id.endsWith('.css')?{}:require(id),mod,mod.exports);
  return mod.exports.default;
}
const text=(tree:any):string=>tree==null||typeof tree==='boolean'?'':Array.isArray(tree)?tree.map(text).join(''):typeof tree==='object'?text(tree.props?.children):String(tree);
const find=(tree:any,predicate:(node:any)=>boolean):any=>!tree||typeof tree!=='object'?null:Array.isArray(tree)?tree.map(node=>find(node,predicate)).find(Boolean)??null:predicate(tree)?tree:find(tree.props?.children,predicate);
const copyButton=(tree:any)=>find(tree,node=>node.type==='button'&&text(node)==='Sao chép phiếu kết quả');
const status=(tree:any)=>text(find(tree,node=>node.props?.role==='status'));
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const globals={navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator'),storage:Object.getOwnPropertyDescriptor(globalThis,'localStorage'),fetch:globalThis.fetch};
const setNavigator=(value:any)=>Object.defineProperty(globalThis,'navigator',{configurable:true,value});
try{
  globalThis.fetch=()=>{throw Error('Phiếu không được gọi mạng');};
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Phiếu không được đọc storage');}});
  await test('UI chờ người học bấm, chỉ báo sao chép thành công sau khi clipboard xác nhận',async()=>{
    let resolve!:()=>void;const copied:string[]=[];
    setNavigator({clipboard:{writeText(value:string){copied.push(value);return new Promise<void>(done=>{resolve=done;});}}});
    const runtime=new Runtime(),Summary=compile('src/native/homework/HomeworkResultSummary.tsx',runtime),draw=()=>runtime.draw(Summary,{state});
    let tree=draw();assert.deepEqual(copied,[]);assert.equal(status(tree),'');assert.equal(find(tree,node=>node.type==='textarea').props.readOnly,true);
    assert.equal(find(tree,node=>node.type==='textarea').props.value,createHomeworkResultSummary(state));assert.equal(find(tree,node=>node.type==='details').props.open,false);
    assert.equal(copyButton(tree).props.onClick(),undefined);tree=draw();assert.equal(copyButton(tree).props.disabled,true);assert.match(status(tree),/^Đang sao chép/);assert.doesNotMatch(status(tree),/Đã sao chép/);
    assert.deepEqual(copied,[createHomeworkResultSummary(state)]);resolve();await settle();tree=draw();assert.equal(copyButton(tree).props.disabled,false);assert.match(status(tree),/^Đã sao chép phiếu kết quả/);assert.match(status(tree),/tự gửi/);assert.doesNotMatch(status(tree),/Đã gửi/);
    const live=find(tree,node=>node.props?.role==='status');assert.equal(live.props['aria-live'],'polite');assert.equal(live.props['aria-atomic'],'true');runtime.unmount();
  });

  await test('Clipboard thiếu hoặc bị từ chối mở ô chỉ đọc, focus và chọn thủ công',async()=>{
    for(const navigatorValue of [{},{clipboard:{writeText(){return Promise.reject(Error('Bị từ chối GIẢ'));}}},{get clipboard(){throw Error('Quyền GIẢ chưa cho đọc');}}]){
      setNavigator(navigatorValue);const runtime=new Runtime(),Summary=compile('src/native/homework/HomeworkResultSummary.tsx',runtime),draw=()=>runtime.draw(Summary,{state});
      let tree=draw(),focused=0,selected=0;find(tree,node=>node.type==='textarea').ref.current={focus(){focused++;},select(){selected++;}};
      copyButton(tree).props.onClick();await settle();tree=draw();assert.match(status(tree),/^Chưa sao chép tự động được/);assert.doesNotMatch(status(tree),/Đã sao chép/);assert.equal(copyButton(tree).props.disabled,false);assert.equal(find(tree,node=>node.type==='details').props.open,true);assert.equal(focused,1);assert.equal(selected,1);
      find(tree,node=>node.type==='textarea').props.onFocus({currentTarget:{select(){selected++;}}});assert.equal(selected,2);runtime.unmount();
    }
  });

  await test('Promise cũ không ghi trạng thái lên lượt mới, receipt mới, ACK mất hoặc component đã đóng',async()=>{
    for(const changed of [
      {...state,draft:{...state.draft!,attemptId:'LUOT-MOI-GIA'},receipts:[{...receipt,attemptId:'LUOT-MOI-GIA',attemptNumber:2}]},
      {...state,receipts:[{...receipt,score:9}]},
      {...state,receipts:[]},
    ]){
      let resolve!:()=>void;setNavigator({clipboard:{writeText(){return new Promise<void>(done=>{resolve=done;});}}});
      const runtime=new Runtime(),Summary=compile('src/native/homework/HomeworkResultSummary.tsx',runtime);copyButton(runtime.draw(Summary,{state})).props.onClick();runtime.draw(Summary,{state});
      const next=runtime.draw(Summary,{state:changed}),before=runtime.writes;assert.equal(status(next),'');resolve();await settle();assert.equal(runtime.writes,before);assert.equal(status(runtime.draw(Summary,{state:changed})),'');runtime.unmount();
    }
    let reject!:(error:Error)=>void;setNavigator({clipboard:{writeText(){return new Promise<void>((_done,fail)=>{reject=fail;});}}});
    const runtime=new Runtime(),Summary=compile('src/native/homework/HomeworkResultSummary.tsx',runtime);copyButton(runtime.draw(Summary,{state})).props.onClick();runtime.unmount();const before=runtime.writes;reject(Error('Lỗi GIẢ sau tháo component'));await settle();assert.equal(runtime.writes,before);
  });

  await test('Overview giữ lịch sử, thiếu ACK lượt hiện tại không mở lời giải hoặc phiếu của lượt cũ',()=>{
    const runtime=new Runtime(),Overview=compile('src/native/homework/HomeworkOverview.tsx',runtime),draw=(input:HomeworkState)=>runtime.draw(Overview,{state:input,busy:false,onStart(){}});
    let tree=draw(state),open=find(tree,node=>node.type==='button'&&text(node)==='Xem lời giải');assert.ok(open);open.props.onClick();tree=draw(state);assert.ok(find(tree,node=>node.props?.id==='btvn-solutions'));
    const noAck={...state,draft:{...state.draft!,attemptId:'LUOT-CHUA-ACK-GIA'}};
    tree=draw(noAck);assert.equal(find(tree,node=>node.type==='button'&&text(node)==='Xem lời giải'),null);assert.equal(find(tree,node=>node.props?.id==='btvn-solutions'),null);assert.match(text(tree),/Đang xác nhận lượt vừa nộp/);assert.match(text(tree),/Các lượt em đã làm/);assert.match(text(tree),/Lượt 1/);assert.doesNotMatch(text(tree),/Em đã hoàn thành lượt/);assert.equal(find(tree,node=>node.type==='button'&&text(node)==='Làm lượt tiếp').props.disabled,true);
    const child=find(tree,node=>typeof node.type==='function'&&node.type.name==='HomeworkResultSummary');assert.ok(child);assert.equal(createHomeworkResultSummary(child.props.state),null);
    const html=renderToStaticMarkup(tree);assert.ok(!html.includes('Sao chép phiếu kết quả'));assert.ok(!html.includes('id="btvn-solutions"'));
    tree=draw({...state,draft:{...state.draft!,examVersionHash:'c'.repeat(64)}});assert.equal(find(tree,node=>node.type==='button'&&text(node)==='Xem lời giải'),null,'Khác bản đề không mở lời giải cho draft cũ');
    assert.doesNotMatch(text(tree),/Lượt làm sau khi đã xem lời giải/,'Không cảnh báo lời giải khi không có nút mở');
    runtime.unmount();
  });

  await test('Overview chờ ACK với lịch sử rỗng mô tả nút khóa, không mời làm bài',()=>{
    const runtime=new Runtime(),Overview=compile('src/native/homework/HomeworkOverview.tsx',runtime);
    const tree=runtime.draw(Overview,{state:{...state,receipts:[]},busy:false,onStart(){throw Error('Không được làm lượt tiếp khi chờ ACK');}});
    const next=find(tree,node=>node.type==='button'&&text(node)==='Làm lượt tiếp');
    assert.equal(next.props.disabled,true);assert.equal(next.props.className,'btvn-btn');
    const description=find(tree,node=>node.props?.id===next.props['aria-describedby']);
    assert.equal(description.props.role,'status');assert.match(text(description),/Chưa có biên nhận/);
    assert.match(text(tree),/ĐANG CHỜ BIÊN NHẬN/);assert.match(text(tree),/Còn lại4 lượt/);
    assert.doesNotMatch(text(tree),/SẴN SÀNG RỒI CHỨ|Đến lượt em thử sức|Lượt tiếp theo:|phút\/lượt/);
    runtime.unmount();
  });

  await test('Overview giữ điểm và lượt tiếp khi thời gian âm hoặc answers hỏng, lịch sử không in NaN',()=>{
    const runtime=new Runtime(),Overview=compile('src/native/homework/HomeworkOverview.tsx',runtime);
    let starts=0;
    const draw=(input:any)=>runtime.draw(Overview,{state:input,busy:false,onStart(){starts++;}});
    const negative={...state,receipts:[{...receipt,elapsedSeconds:-2}]};
    let tree=draw(negative),next=find(tree,node=>node.type==='button'&&text(node)==='Làm lượt tiếp');
    assert.equal(next.props.disabled,false);next.props.onClick();assert.equal(starts,1);
    assert.match(text(tree),/Em đã hoàn thành lượt 1/);assert.match(text(tree),/8,25\/10Điểm lượt này/);
    assert.match(text(tree),/Chưa xác định được thời gian làm bài/);assert.doesNotMatch(text(tree),/Đang xác nhận lượt vừa nộp/);
    assert.ok(find(tree,node=>node.type==='button'&&text(node)==='Xem lời giải'));
    for(const answers of [null,[],undefined,'hỏng']){
      const broken={...negative,draft:{...negative.draft!,answers}};
      assert.doesNotThrow(()=>renderToStaticMarkup(draw(broken)));
      tree=draw(broken);assert.match(text(tree),/Điểm lượt này/);
      assert.equal(find(tree,node=>node.type==='button'&&text(node)==='Làm lượt tiếp').props.disabled,false);
      assert.equal(find(tree,node=>node.type==='button'&&text(node)==='Xem lời giải'),null);
    }
    tree=draw({...state,bestScore:NaN,receipts:[{...receipt,score:NaN,submittedAt:NaN}]});
    const html=renderToStaticMarkup(tree);assert.doesNotMatch(html,/NaN|Invalid Date/);
    assert.match(html,/Chưa hiện được điểm lượt này/);assert.match(html,/Chưa xác định thời điểm/);
    runtime.unmount();
  });
}finally{
  if(globals.navigator)Object.defineProperty(globalThis,'navigator',globals.navigator);else delete (globalThis as any).navigator;
  if(globals.storage)Object.defineProperty(globalThis,'localStorage',globals.storage);else delete (globalThis as any).localStorage;
  globalThis.fetch=globals.fetch;
}
assert.equal(JSON.stringify(state),unchanged);
console.log(`${count}/${count} ca phiếu kết quả đạt với receipt GIẢ, clipboard và hook tổng hợp. Chưa kiểm clipboard/trình đọc màn hình thật.`);
