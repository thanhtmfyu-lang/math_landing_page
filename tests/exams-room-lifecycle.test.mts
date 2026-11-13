import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {PRACTICE_EXAMS} from '../src/native/exams/data';
import {createDraft,saveDraft,draftKey} from '../src/native/exams/store';
import {emptyAux,readAux,writeAux} from '../src/native/exams/room-aux';
import {FakeStore,suite} from './exams-harness.mts';
const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json')),{buildSync}=require('esbuild');
const fixture=join(root,'tests/fixtures/room-react.mts');
const portals:{children:any;target:any}[]=[];
function loadRoomComponent(file:string){
 const code=buildSync({entryPoints:[join(root,file)],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',alias:{react:fixture,'react/jsx-runtime':fixture},loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;
 const mod={exports:{} as any};new Function('require','module','exports',code)((id:string)=>id==='react-dom'?{createPortal(children:any,target:any){portals.push({children,target});return children;}}:id.endsWith('.css')?{}:require(id),mod,mod.exports);return mod.exports.default;
}
const FocusRoom=loadRoomComponent('src/native/exams/FocusRoom.tsx'),HomeworkSelfCheck=loadRoomComponent('src/native/homework/HomeworkSelfCheck.tsx');
class Events extends EventTarget {removeEventListener(t:string,l:any,o?:any){super.removeEventListener(t,l,typeof o==='boolean'?{capture:o}:o);}}
const doc=new Events();Object.assign(doc,{body:{},getElementById:()=>null,documentElement:{style:{overflow:''}},activeElement:null,fullscreenElement:null});
class FakeElement{isConnected=true;closest(){return null;}focus(){(doc as any).activeElement=this;}querySelector(){return null;}querySelectorAll(){return [];}}
Object.assign(globalThis,{document:doc,Element:FakeElement,HTMLElement:FakeElement});
class Runtime{
  slots:any[]=[];index=0;changed=false;effects:(()=>void)[]=[];value:any;attached=new Set<any>();
  constructor(public fn:()=>any){}
  state(initial:any){const i=this.index++;if(!this.slots[i])this.slots[i]={value:typeof initial==='function'?initial():initial};return[this.slots[i].value,(v:any)=>{const next=typeof v==='function'?v(this.slots[i].value):v;if(!Object.is(next,this.slots[i].value)){this.slots[i].value=next;this.changed=true;}}];}
  ref(value:any){const i=this.index++;return this.slots[i]??(this.slots[i]={current:value});}
  effect(fn:any,deps:any){const i=this.index++,old=this.slots[i];if(!old||!deps||!old.deps||deps.length!==old.deps.length||deps.some((v:any,j:number)=>!Object.is(v,old.deps[j]))){this.slots[i]={deps,cleanup:old?.cleanup};this.effects.push(()=>{old?.cleanup?.();this.slots[i].cleanup=fn();});}}
  attach(tree:any){
    const current=new Set<any>();
    const visit=(node:any)=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}const ref=node.props?.ref;if(typeof node.type==='string'&&ref&&typeof ref==='object'){current.add(ref);if(!ref.current)ref.current=new FakeElement();}visit(node.props?.children);};
    visit(tree);for(const ref of this.attached)if(!current.has(ref))ref.current=null;this.attached=current;
  }
  flush(){for(let i=0;i<30;i++){(globalThis as any).__mtmRoomRuntime=this;this.index=0;this.changed=false;this.value=this.fn();this.attach(this.value);this.effects.splice(0).forEach(fn=>fn());if(!this.changed)return this.value;}throw Error('Không ổn định');}
  dispose(){this.slots.forEach(s=>s?.cleanup?.());}
}
const exam=PRACTICE_EXAMS[0];
function mount(store:FakeStore,examOverride=exam,questionReader?:unknown,extraProps:any={}){
  const exam=examOverride;
  const made=createDraft(exam,'room-test',Date.now());assert.ok(made.ok);saveDraft(store,exam,made.value,null);
  const answers:any[]=[],submissions:boolean[]=[];let exits=0;
  const state:any={draft:made.value,activeQuestion:0,setActiveQuestion(i:number){state.activeQuestion=i;r.changed=true;},setQuestionFocus(){},seconds:5400,answered:0,states:exam.questions.map(()=> 'blank'),unsaved:false,notice:'',changeAnswer(...args:any[]){answers.push(args);},pdfReady:true,setPdfReady(){},finish(auto:boolean){submissions.push(auto);},confirmation:null,sections:[{name:'I',from:0,to:12},{name:'II',from:12,to:16},{name:'III',from:16,to:22}]};
  const r=new Runtime(()=>FocusRoom({props:{exam,catalogUrl:'/thi-thu',storeOverride:store,questionReader,...extraProps},state,onExit(){exits++;}}));r.flush();return {r,state,answers,submissions,get exits(){return exits;}};
}
function buttons(tree:any):any[]{if(!tree||typeof tree!=='object')return[];if(Array.isArray(tree))return tree.flatMap(buttons);return [...(tree.type==='button'?[tree]:[]),...buttons(tree.props?.children)];}
function textOf(tree:any):string{if(tree==null||typeof tree==='boolean')return'';if(Array.isArray(tree))return tree.map(textOf).join('');if(typeof tree==='object')return textOf(tree.props?.children);return String(tree);}
function find(tree:any,predicate:(node:any)=>boolean):any{if(!tree||typeof tree!=='object')return null;if(Array.isArray(tree))return tree.map(t=>find(t,predicate)).find(Boolean);return predicate(tree)?tree:find(tree.props?.children,predicate);}
function findAll(tree:any,predicate:(node:any)=>boolean):any[]{if(!tree||typeof tree!=='object')return[];if(Array.isArray(tree))return tree.flatMap(t=>findAll(t,predicate));return [...(predicate(tree)?[tree]:[]),...findAll(tree.props?.children,predicate)];}
function press(key:string,target?:any){const e=new Event('keydown',{cancelable:true});Object.assign(e,{key,ctrlKey:false,altKey:false,metaKey:false,isComposing:false});if(target)Object.defineProperty(e,'target',{value:target});doc.dispatchEvent(e);return e;}
const {test,finish}=suite('FR');
test('Mount/reload khôi phục câu 18 trước lưu, không ghi đè thành câu 1',()=>{
  const store=new FakeStore();writeAux(store,'room-test',{...emptyAux(),active:17,marked:[17]});const {r,state}=mount(store);
  assert.equal(state.activeQuestion,17);assert.equal(readAux(store,'room-test',22).active,17);
  press('ArrowRight');r.flush();assert.equal(state.activeQuestion,18);assert.equal(readAux(store,'room-test',22).active,18);r.dispose();
  const reload=mount(store);assert.equal(reload.state.activeQuestion,18);reload.r.dispose();
});
test('Gọi handler bàn phím thật: chọn A, đánh dấu M, phím không bắn khi nhập chữ',()=>{
  const store=new FakeStore(),{r,state,answers}=mount(store);press('A');r.flush();assert.deepEqual(answers,[[exam.questions[0].id,'A']]);press('M');r.flush();assert.deepEqual(readAux(store,'room-test',22).marked,[0]);
  const input=new FakeElement();input.closest=()=>({} as any);for(const key of ['B','M','ArrowRight','?'])assert.equal(press(key,input).defaultPrevented,false);r.flush();assert.equal(answers.length,1);assert.equal(state.activeQuestion,0);assert.deepEqual(readAux(store,'room-test',22).marked,[0]);r.dispose();
});
test('Bấm bảng số nhảy đúng câu, làm dở và đánh dấu giữ riêng nhau',()=>{
  const store=new FakeStore(),{r,state}=mount(store);state.states[12]='partial';r.flush();const entry=buttons(r.value).find(b=>b.props['aria-label']?.includes('Câu 1: làm dở'));assert.ok(entry);entry.props.onClick();r.flush();assert.equal(state.activeQuestion,12);
  press('M');r.flush();assert.ok(buttons(r.value).some(b=>b.props.className?.includes('fr-partial fr-marked')));assert.equal(state.states[12],'partial');r.dispose();
});
test('Kho phụ hỏng vẫn mở, cảnh báo đổi ngưỡng và nút câu chưa xong hoạt động',()=>{
  const store=new FakeStore();store.setItem('mtm:exam-aux:v1:room-test','{');const {r,state}=mount(store);assert.equal(state.activeQuestion,0);state.seconds=300;r.flush();assert.ok(textOf(r.value).includes('Còn 5 phút.'));state.states[1]='answered';buttons(r.value).find(b=>textOf(b)==='Đến câu chưa xong').props.onClick();r.flush();assert.equal(state.activeQuestion,2);r.dispose();
});
test('Handler vuốt: ngang đổi câu, dọc và control nhập không đổi; mở/đóng phiếu',()=>{
  const store=new FakeStore(),{r,state}=mount(store),paper=find(r.value,(n:any)=>n.props?.className==='fr-paper');
  const target=new FakeElement();paper.props.onTouchStart({target,touches:[{clientX:200,clientY:100}]});paper.props.onTouchEnd({changedTouches:[{clientX:100,clientY:104}]});r.flush();assert.equal(state.activeQuestion,1);
  paper.props.onTouchStart({target,touches:[{clientX:200,clientY:100}]});paper.props.onTouchEnd({changedTouches:[{clientX:100,clientY:210}]});r.flush();assert.equal(state.activeQuestion,1);
  target.closest=()=>({} as any);paper.props.onTouchStart({target,touches:[{clientX:200,clientY:100}]});paper.props.onTouchEnd({changedTouches:[{clientX:100,clientY:104}]});r.flush();assert.equal(state.activeQuestion,1);
  buttons(r.value).find(b=>b.props['aria-haspopup']==='dialog').props.onClick();r.flush();assert.ok(find(r.value,(n:any)=>n.props?.className==='fr-sheet is-open'));
  press('Escape');r.flush();assert.ok(!find(r.value,(n:any)=>n.props?.className==='fr-sheet is-open'));r.dispose();
});
test('Hợp đồng Fullscreen API vào/ra và thoát tập trung không ghi lại byte bản nháp',()=>{
  const store=new FakeStore(),mounted=mount(store),{r}=mounted,before=store.getItem(draftKey(exam.id));let enter=0,exit=0;
  const host={requestFullscreen(){enter++;(doc as any).fullscreenElement=host;doc.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve();}};
  (doc as any).exitFullscreen=()=>{exit++;(doc as any).fullscreenElement=null;doc.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve();};
  r.value.props.ref.current=host;buttons(r.value).find(b=>textOf(b)==='Toàn màn hình').props.onClick();r.flush();assert.equal(enter,1);
  buttons(r.value).find(b=>textOf(b)==='Thoát toàn màn hình').props.onClick();r.flush();assert.equal(exit,1);buttons(r.value).find(b=>textOf(b)==='Thoát tập trung').props.onClick();assert.equal(mounted.exits,1);assert.equal(store.getItem(draftKey(exam.id)),before);r.value.props.ref.current=null;r.dispose();
});
test('Trả lời tại câu A-D dùng bộ ghi hiện có, phản ánh đáp án và bỏ chọn',()=>{
  const {r,state,answers}=mount(new FakeStore());const q=exam.questions[0];assert.equal(q.kind,'mc');
  let quick=find(r.value,(n:any)=>n.props?.className==='fr-quick');
  buttons(quick).find(b=>b.props['aria-label']==='Chọn B').props.onClick();assert.deepEqual(answers.pop(),[q.id,'B']);
  state.draft.answers[q.id]='B';r.flush();quick=find(r.value,(n:any)=>n.props?.className==='fr-quick');
  const selected=buttons(quick).find(b=>b.props['aria-label']==='Chọn B');assert.equal(selected.props['aria-pressed'],true);
  selected.props.onClick();assert.deepEqual(answers.pop(),[q.id,null]);
  state.pdfReady=false;r.flush();assert.ok(!find(r.value,(n:any)=>n.type==='fieldset'&&n.props.disabled));r.dispose();
});
test('Trả lời tại câu Đ/S giữ đủ bốn ý, sửa/xóa một ý không mất ý khác',()=>{
  const {r,state,answers}=mount(new FakeStore());state.activeQuestion=exam.questions.findIndex(q=>q.kind==='tf');
  const q=exam.questions[state.activeQuestion];state.draft.answers[q.id]=[true,null,false,null];r.flush();
  let quick=find(r.value,(n:any)=>n.props?.className==='fr-quick');
  buttons(quick).find(b=>b.props['aria-label']==='Ý b: Sai').props.onClick();assert.deepEqual(answers.pop(),[q.id,[true,false,false,null]]);
  state.draft.answers[q.id]=[true,false,false,null];r.flush();quick=find(r.value,(n:any)=>n.props?.className==='fr-quick');
  buttons(quick).find(b=>b.props['aria-label']==='Ý b: Sai').props.onClick();assert.deepEqual(answers.pop(),[q.id,[true,null,false,null]]);r.dispose();
});
test('Ô nhanh câu ngắn giữ nguyên chuỗi, đồng bộ và không kích phím tắt',()=>{
  const {r,state,answers}=mount(new FakeStore());state.activeQuestion=exam.questions.findIndex(q=>q.kind==='short');r.flush();
  const q=exam.questions[state.activeQuestion],input=find(r.value,(n:any)=>n.props?.id==='fr-quick-short');
  input.props.onChange({target:{value:'-0,25'}});assert.deepEqual(answers.pop(),[q.id,'-0,25']);
  state.draft.answers[q.id]='-0,25';r.flush();assert.equal(find(r.value,(n:any)=>n.props?.id==='fr-quick-short').props.value,'-0,25');
  const target=new FakeElement();target.closest=()=>({} as any);press('ArrowRight',target);r.flush();assert.equal(state.activeQuestion,exam.questions.indexOf(q));r.dispose();
});
test('Menu công cụ mở/đóng bằng Esc và chọn tiện ích đóng menu',()=>{
  const {r}=mount(new FakeStore());let toggle=buttons(r.value).find(b=>b.props['aria-controls']==='fr-actions');
  toggle.props.onClick();r.flush();assert.equal(find(r.value,(n:any)=>n.props?.id==='fr-actions').props.className,'fr-actions is-open');
  press('Escape');r.flush();assert.equal(find(r.value,(n:any)=>n.props?.id==='fr-actions').props.className,'fr-actions');
  toggle=buttons(r.value).find(b=>b.props['aria-controls']==='fr-actions');toggle.props.onClick();r.flush();
  buttons(r.value).find(b=>textOf(b)==='Tiện ích').props.onClick();r.flush();assert.equal(find(r.value,(n:any)=>n.props?.id==='fr-actions').props.className,'fr-actions');
  assert.ok(find(r.value,(n:any)=>n.props?.['aria-label']==='Tiện ích phòng làm bài'));r.dispose();
});
test('BTVN: mở Tiện ích đặt phiếu thật trong portal dù root inert, giữ dấu và không chặn nộp',()=>{
  const previousGet=(doc as any).getElementById,background={inert:false};(doc as any).getElementById=(id:string)=>id==='root'?background:null;
  let selected:string[]=[];
  const check=new Runtime(()=>HomeworkSelfCheck({selection:[selected,(next:any)=>{selected=typeof next==='function'?next(selected):next;check.changed=true;}]}));check.flush();
  const extra={isHomework:true,homeworkSelfCheck:check.value},store=new FakeStore(),mounted=mount(store,exam,undefined,extra),{r,state,answers,submissions}=mounted;
  const beforeDraft=JSON.stringify(state.draft),beforeSaved=store.getItem(draftKey(exam.id));
  const menuButton=()=>buttons(r.value).find(b=>b.props['aria-controls']==='fr-actions');
  const openTools=()=>{menuButton().props.onClick();r.flush();buttons(r.value).find(b=>textOf(b)==='Tự kiểm / Tiện ích').props.onClick();r.flush();};
  const panel=()=>find(r.value,(n:any)=>n.type==='section'&&n.props?.['aria-label']==='Tiện ích phòng làm bài');
  const boxes=()=>findAll(panel(),n=>n.type==='input'&&n.props.type==='checkbox');
  try{
    assert.equal(background.inert,true);assert.ok(!find(r.value,(n:any)=>n.props?.className==='btvn-self-check-content'));
    openTools();assert.equal(portals.at(-1)?.target,(doc as any).body);assert.equal(portals.at(-1)?.children,r.value);
    assert.ok(panel());assert.equal(panel().props.tabIndex,-1);assert.equal((doc as any).activeElement,panel().props.ref.current);
    assert.equal(findAll(panel(),n=>n.props?.className==='btvn-self-check-content').length,1);assert.equal(boxes().length,5);assert.ok(boxes().every(b=>!b.props.checked));
    assert.equal(panel().props.children[0].props.className,'fr-homework-self-check','Phiếu đứng đầu panel, không bị chôn sau tiện ích');
    const submitButtons=buttons(r.value).filter(b=>textOf(b)==='Nộp bài');assert.ok(submitButtons.length>=3);assert.ok(submitButtons.every(b=>!b.props.disabled));
    submitButtons[0].props.onClick();r.flush();assert.deepEqual(submissions,[false],'Có thể nộp ngay cả khi chưa đánh dấu mục nào');
    boxes()[2].props.onChange();check.flush();extra.homeworkSelfCheck=check.value;r.flush();assert.equal(boxes()[2].props.checked,true);
    buttons(panel()).find(b=>textOf(b)==='Đóng tiện ích').props.onClick();r.flush();assert.ok(!panel());assert.equal((doc as any).activeElement,menuButton().props.ref.current);
    openTools();assert.equal(boxes()[2].props.checked,true);assert.equal(find(panel(),(n:any)=>n.type==='progress').props.value,1);
    press('Escape');r.flush();assert.ok(!panel());assert.equal((doc as any).activeElement,menuButton().props.ref.current);
    openTools();assert.equal(boxes()[2].props.checked,true);buttons(r.value).find(b=>textOf(b)==='Thoát tập trung').props.onClick();assert.equal(mounted.exits,1);
    assert.equal(JSON.stringify(state.draft),beforeDraft);assert.equal(store.getItem(draftKey(exam.id)),beforeSaved);assert.deepEqual(answers,[]);
  }finally{r.dispose();check.dispose();assert.equal(background.inert,false);(doc as any).getElementById=previousGet;}
});
test('Luyện tập thường không đưa phiếu BTVN vào portal kể cả khi có slot truyền nhầm',()=>{
  const check=new Runtime(()=>HomeworkSelfCheck());check.flush();
  const {r,submissions}=mount(new FakeStore(),exam,undefined,{isHomework:false,homeworkSelfCheck:check.value});
  try{
    assert.ok(!buttons(r.value).some(b=>textOf(b)==='Tự kiểm / Tiện ích'));
    buttons(r.value).find(b=>b.props['aria-controls']==='fr-actions').props.onClick();r.flush();
    buttons(r.value).find(b=>textOf(b)==='Tiện ích').props.onClick();r.flush();
    assert.ok(!find(r.value,(n:any)=>n.props?.className==='fr-homework-self-check'));assert.ok(!find(r.value,(n:any)=>n.props?.className==='btvn-self-check-content'));
    buttons(r.value).find(b=>textOf(b)==='Nộp bài').props.onClick();assert.deepEqual(submissions,[false]);
  }finally{r.dispose();check.dispose();}
});
test('Tên đề đầy đủ mở bằng chạm, Esc đóng; nhãn phiếu thống nhất',()=>{
  const {r}=mount(new FakeStore());const title=buttons(r.value).find(b=>b.props.className==='fr-title-button');
  title.props.onClick();r.flush();assert.ok(find(r.value,(n:any)=>n.props?.['aria-label']==='Tên đầy đủ của đề'));
  press('Escape');r.flush();assert.ok(!find(r.value,(n:any)=>n.props?.['aria-label']==='Tên đầy đủ của đề'));
  const sheet=buttons(r.value).find(b=>b.props['aria-label']==='Mở phiếu trả lời');assert.ok(sheet);assert.ok(!textOf(sheet).startsWith('Phiếu ·'));r.dispose();
});
test('Phương án DOM trong đề dùng bộ ghi/bỏ chọn hiện có',()=>{
  const {r,state,answers}=mount(new FakeStore()),q=exam.questions[0];
  const provider=()=>find(r.value,(n:any)=>n.props?.value?.questionId===q.id).props.value;
  provider().choose('B');assert.deepEqual(answers.pop(),[q.id,'B']);
  state.draft.answers[q.id]='B';r.flush();assert.equal(provider().answer,'B');provider().choose('B');assert.deepEqual(answers.pop(),[q.id,null]);
  state.pdfReady=false;r.flush();assert.equal(provider().disabled,false);r.dispose();
});
test('Nộp bài luôn vàng theo mẫu B, vẫn giữ trạng thái sẵn sàng và dấu sao theo câu',()=>{
  const {r,state}=mount(new FakeStore());
  const submit=()=>buttons(r.value).find(b=>textOf(b)==='Nộp bài');
  assert.equal(submit().props.className,'fr-submit');
  state.seconds=301;r.flush();assert.equal(submit().props.className,'fr-submit');
  state.seconds=300;r.flush();assert.equal(submit().props.className,'fr-submit is-ready');
  state.seconds=5400;state.answered=exam.questions.length;r.flush();assert.equal(submit().props.className,'fr-submit is-ready');
  press('M');r.flush();assert.match(textOf(buttons(r.value).find(b=>b.props.className==='fr-sheet-toggle')),/★/);
  press('ArrowRight');r.flush();assert.doesNotMatch(textOf(buttons(r.value).find(b=>b.props.className==='fr-sheet-toggle')),/★/);
  buttons(r.value).find(b=>b.props.className==='fr-menu-title').props.onClick();r.flush();
  assert.ok(find(r.value,(n:any)=>n.props?.['aria-label']==='Tên đầy đủ của đề'));r.dispose();
});
test('PDF: BTVN mở vừa ngang, compact thường giữ mức phóng cũ và nút vừa ngang hoạt động',()=>{
  const pdfCode=buildSync({entryPoints:[join(root,'src/native/exams/QuestionPdf.tsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',alias:{react:fixture,'react/jsx-runtime':fixture,'react-dom':fixture},logLevel:'silent'}).outputFiles[0].text;
  const m={exports:{} as any};new Function('require','module','exports',pdfCode)((id:string)=>id.startsWith('pdfjs-dist')?(id.includes('worker')?{default:'worker'}:{GlobalWorkerOptions:{},AnnotationMode:{DISABLE:0},getDocument(){}}):require(id),m,m.exports);
  const original=(globalThis as any).window;
  try{for(const [mobile,compact,fitToWidth,want] of [[true,true,false,'×1,5'],[false,true,false,'Vừa ngang'],[true,false,false,'Vừa bề ngang'],[true,true,true,'Vừa ngang']] as const){
    (globalThis as any).window={matchMedia:()=>({matches:mobile})};
    const r=new Runtime(()=>m.exports.default({file:{questionPages:[1]},title:'Đề kiểm',onReady(){},compact,fitToWidth}));
    // Kiểm khởi tạo và handler; không mô phỏng vẽ canvas bằng fixture React.
    (globalThis as any).__mtmRoomRuntime=r;r.value=r.fn();
    assert.ok(textOf(r.value).includes(want));
    if(compact){buttons(r.value).find(b=>b.props['aria-label']==='Vừa ngang').props.onClick();r.index=0;r.value=r.fn();assert.equal(textOf(buttons(r.value).find(b=>b.props['aria-label']==='Vừa ngang')),'Vừa ngang');}
  }}finally{(globalThis as any).window=original;}
});
test('B: chỉ một bộ trả lời, đáy chỉ điều hướng và không chứa A-D/ô nhập',()=>{
  const {r,state}=mount(new FakeStore());
  for(let i=0;i<exam.questions.length;i++){
    state.activeQuestion=i;r.flush();
    const dock=find(r.value,(n:any)=>n.props?.className==='fr-answer-dock');
    assert.equal(buttons(dock).length,4);assert.ok(buttons(dock).some(b=>textOf(b)==='Nộp bài'));
    assert.ok(!find(dock,(n:any)=>n.type==='input'||n.type==='fieldset'));
    assert.ok(!buttons(dock).some(b=>/^Chọn [A-D]$/.test(b.props['aria-label']??'')));
    const paper=find(r.value,(n:any)=>n.props?.className==='fr-paper');
    assert.ok(find(paper,(n:any)=>n.props?.className==='fr-quick'));
    if(exam.questions[i].kind==='mc')assert.equal(buttons(paper).filter(b=>/^Chọn [A-D]$/.test(b.props['aria-label']??'')).length,4);
    if(exam.questions[i].kind==='tf')assert.equal(buttons(paper).filter(b=>/^Ý [a-d]:/.test(b.props['aria-label']??'')).length,8);
    if(exam.questions[i].kind==='short')assert.ok(find(paper,(n:any)=>n.props?.id==='fr-quick-short'));
  }
  r.dispose();
});
test('B: nguồn chỉ hiện một lần, không render tên tệp ảnh trong phòng',()=>{
  const {r}=mount(new FakeStore());
  assert.equal(textOf(r.value).split('MTM sưu tầm và biên soạn').length-1,1);
  assert.ok(!find(r.value,(n:any)=>n.type==='figcaption'));
  assert.doesNotMatch(textOf(r.value),/\.(png|webp|jpg)\b/);
  assert.ok(find(r.value,(n:any)=>n.props?.className==='fr-progress'));
  r.dispose();
});
test('B: câu chữ có phương án tương tác trong nguồn không sinh bộ A-D thứ hai',()=>{
  const exams=JSON.parse(readFileSync(join(root,'src/native/chapters/exact-tests.json'),'utf8')).map((p:any)=>p.exam);
  const displays=JSON.parse(readFileSync(join(root,'src/native/chapters/exact-source-display.json'),'utf8'));
  const example=exams.find((e:any)=>e.questions.some((q:any)=>q.kind==='mc'&&displays.some((d:any)=>d.questionId===q.id&&d.choices?.length===4&&q.sourceContent?.questions.some((seg:any)=>seg.sha256===d.sourceDisplayCropSha256))));
  assert.ok(example);
  const index=example.questions.findIndex((q:any)=>q.kind==='mc'&&displays.some((d:any)=>d.questionId===q.id&&d.choices?.length===4));
  const {r,state}=mount(new FakeStore(),example);state.activeQuestion=index;r.flush();
  assert.ok(!find(r.value,(n:any)=>n.props?.className==='fr-quick'));
  assert.ok(find(r.value,(n:any)=>n.props?.question?.id===example.questions[index].id));
  r.dispose();
  const reader=mount(new FakeStore(),exam,{type:'reader'});
  assert.ok(!find(reader.r.value,(n:any)=>n.props?.className==='fr-quick'));
  reader.r.dispose();
});
test('B: ảnh chưa có bản chép đủ điều kiện vẫn giữ bốn nút chọn dưới ảnh',()=>{
  const exams=JSON.parse(readFileSync(join(root,'src/native/chapters/exact-tests.json'),'utf8')).map((p:any)=>p.exam);
  const original=exams.find((e:any)=>e.questions.some((q:any)=>q.kind==='mc'&&q.sourceContent));
  const example=structuredClone(original),index=example.questions.findIndex((q:any)=>q.kind==='mc'&&q.sourceContent);
  example.questions[index].id='image-fallback';
  const {r,state}=mount(new FakeStore(),example);state.activeQuestion=index;r.flush();
  const paper=find(r.value,(n:any)=>n.props?.className==='fr-paper');
  assert.equal(buttons(paper).filter(b=>/^Chọn [A-D]$/.test(b.props['aria-label']??'')).length,4);
  assert.ok(find(paper,(n:any)=>n.props?.question?.id==='image-fallback'));
  r.dispose();
});
test('Vòng 1: PDF cuộn riêng, giữ đúng một bộ trả lời ở ngoài vùng tài liệu',()=>{
  const {r,state,answers}=mount(new FakeStore());
  assert.ok(exam.sourcePdf);
  const workspace=find(r.value,(n:any)=>n.props?.className==='fr-workspace fr-pdf-workspace');
  const document=find(workspace,(n:any)=>n.props?.className==='fr-pdf-document');
  assert.ok(document);
  assert.ok(!find(document,(n:any)=>n.props?.className==='fr-quick'));
  for(const kind of ['mc','tf','short']){
    state.activeQuestion=exam.questions.findIndex(q=>q.kind===kind);r.flush();
    const paper=find(r.value,(n:any)=>n.props?.className==='fr-paper');
    const quick=find(paper,(n:any)=>n.props?.className==='fr-quick');assert.ok(quick);
    if(kind==='mc'){
      assert.equal(buttons(paper).filter(b=>/^Chọn [A-D]$/.test(b.props['aria-label']??'')).length,4);
      buttons(quick).find(b=>b.props['aria-label']==='Chọn C').props.onClick();
      assert.deepEqual(answers.pop(),[exam.questions[state.activeQuestion].id,'C']);
    }
    if(kind==='tf')assert.equal(buttons(paper).filter(b=>/^Ý [a-d]:/.test(b.props['aria-label']??'')).length,8);
    if(kind==='short')assert.ok(find(quick,(n:any)=>n.props?.id==='fr-quick-short'));
  }
  const mark=buttons(r.value).find(b=>b.props['aria-label']==='Đánh dấu để xem lại');assert.ok(mark);
  mark.props.onClick();r.flush();assert.ok(buttons(r.value).find(b=>b.props['aria-label']==='Bỏ đánh dấu xem lại'&&b.props['aria-pressed']));
  r.dispose();
});
test('Ảnh lỗi chỉ khóa câu đó; tải đủ ảnh mở lại và vẫn nộp được phần đã làm',()=>{
 const {r,state}=mount(new FakeStore());state.failedQuestions=new Set();
 state.setQuestionAssetReady=(id:string,ready:boolean)=>{ready?state.failedQuestions.delete(id):state.failedQuestions.add(id);r.changed=true;};
 state.setNotice=(message:string)=>{state.notice=message;r.changed=true;};
 class Image extends FakeElement{complete=true;naturalWidth=100;closest(){return {} as any;}}
 (globalThis as any).HTMLImageElement=Image;
 const image=new Image(),firstId=exam.questions[0].id;
 let paper=find(r.value,(n:any)=>n.props?.className==='fr-paper');paper.props.onErrorCapture({target:image});r.flush();
 assert.equal(state.pdfReady,true);assert.ok(state.failedQuestions.has(firstId));assert.equal(find(r.value,(n:any)=>n.type==='fieldset').props.disabled,true);
 assert.ok(buttons(r.value).filter(b=>textOf(b)==='Nộp bài').every(b=>!b.props.disabled));
 state.activeQuestion=1;r.flush();assert.equal(find(r.value,(n:any)=>n.type==='fieldset').props.disabled,false);
 state.activeQuestion=0;r.flush();paper=find(r.value,(n:any)=>n.props?.className==='fr-paper');
 const currentTarget={querySelector:()=>null,querySelectorAll:()=>[image]};image.naturalWidth=0;paper.props.onLoadCapture({target:image,currentTarget});r.flush();assert.ok(state.failedQuestions.has(firstId));
 image.naturalWidth=100;paper.props.onLoadCapture({target:image,currentTarget});r.flush();assert.equal(state.failedQuestions.has(firstId),false);assert.equal(find(r.value,(n:any)=>n.type==='fieldset').props.disabled,false);
 r.dispose();delete (globalThis as any).HTMLImageElement;
});
finish();
