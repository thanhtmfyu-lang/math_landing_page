import assert from 'node:assert/strict';
// PIN (18/10) thêm một useState trước room; giữ đủ ca checking, ngoài phòng và trong phòng.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {checkWarmupAnswer,HOMEWORK_WARMUP_CARDS,HOMEWORK_WARMUP_TOPICS,warmupCards} from '../src/native/homework/warmup';
import {all,load,mount,React,require,root,text} from './daily19-ui-harness.mts';
import {suite} from './exams-harness.mts';
const {test,finish}=suite('D1712-WARMUP-'),file='src/native/homework/HomeworkWarmup.tsx',tool='src/native/homework/HomeworkWarmupTool.tsx';

test('9 thẻ, mỗi trọng tâm 3 thẻ, đáp án kiểm độc lập bằng đại số và thử giá trị',()=>{
  assert.equal(HOMEWORK_WARMUP_CARDS.length,9);assert.equal(new Set(HOMEWORK_WARMUP_CARDS.map(item=>item.id)).size,9);
  for(const topic of HOMEWORK_WARMUP_TOPICS)assert.equal(warmupCards(topic.id).length,3);
  const answer=Object.fromEntries(HOMEWORK_WARMUP_CARDS.map(card=>[card.id,card.answer]));
  assert.equal(answer.denominator-3,0);assert.equal(answer['square-root']+4,0);assert.equal(answer['two-exclusions']**2-9,0);assert.ok(answer['two-exclusions']>0);
  for(const x of [-7,-1,0,2,9]){
    assert.equal(3-2*(x-4),-2*x+answer.brackets);
    assert.equal((x-5)**2,x*x+answer.identity*x+25);
    assert.equal(-3*x<12,x>answer.inequality);
  }
  assert.ok(answer.product>0);assert.equal((answer.product-2)*(answer.product+3),0);
  assert.notEqual(answer.rational,1);assert.equal(answer.rational/(answer.rational-1),2);
  assert.equal(Math.sqrt(answer.extraneous+4),answer.extraneous-2);
  const roots=Array.from({length:31},(_,i)=>i-10).filter(x=>x+4>=0&&Math.sqrt(x+4)===x-2);assert.deepEqual(roots,[answer.extraneous]);
  assert.notEqual(Math.sqrt(0+4),0-2,'Loại nghiệm 0 sinh ra khi bình phương');
  for(const card of HOMEWORK_WARMUP_CARDS){assert.ok(card.steps.length>=2);assert.ok(card.takeaway.length>40);assert.equal(checkWarmupAnswer(card,String(card.answer)),'correct');assert.equal(checkWarmupAnswer(card,String(card.answer+.5)),'retry');}
});

test('Nhập số có dấu, thập phân dấu phẩy; từ chối rỗng, biểu thức, vô hạn và ký tự lạ',()=>{
  const card=HOMEWORK_WARMUP_CARDS.find(item=>item.answer===-4)!;
  for(const value of [' -4 ','−4','-4,0','-4.000'])assert.equal(checkWarmupAnswer(card,value),'correct');
  for(const value of ['', ' ', 'Infinity','NaN','1/2','-2*2','−−4','--4','0x10','-4,0,0','1e3','<b>-4</b>','9'.repeat(31)])assert.equal(checkWarmupAnswer(card,value),'invalid');
  assert.equal(checkWarmupAnswer(card,'0'),'retry');assert.equal(checkWarmupAnswer(card,'+.5'),'retry');
});

test('Lời giải chỉ có sau nhập hợp lệ, đọc đủ bước, tiến đúng một thẻ và giữ focus',()=>{
  const m=mount(file),enter=(value:string)=>{all(m.tree,n=>n.type==='input')[0].props.onChange({target:{value}});m.draw();};
  try{
    assert.equal(all(m.tree,n=>n.type==='article').length,0);m.click('Bắt đầu 3 thẻ');assert.equal(m.focused.type,'h3');
    assert.equal(all(m.tree,n=>n.props?.className==='btvn-warmup-solution').length,0);
    m.click('Đối chiếu và xem từng bước');assert.match(text(m.tree),/nhập một số hợp lệ/);assert.equal(m.focused.type,'input');
    assert.equal(all(m.tree,n=>n.props?.className==='btvn-warmup-solution').length,0);
    enter('3');const staleCheck=all(m.tree,n=>n.type==='button'&&text(n)==='Đối chiếu và xem từng bước')[0].props.onClick;
    m.click('Đối chiếu và xem từng bước');assert.match(text(m.tree),/Kết quả khớp/);assert.match(text(m.tree),/x − 3 ≠ 0/);assert.equal(m.focused.type,'div');
    const staleNext=all(m.tree,n=>n.type==='button'&&text(n)==='Sang thẻ tiếp')[0].props.onClick;m.click('Sang thẻ tiếp');
    staleCheck();staleNext();m.draw();assert.match(text(m.tree),/Thẻ 2\/3/);assert.equal(all(m.tree,n=>n.type==='input')[0].props.value,'');assert.equal(m.focused.type,'h3');
    enter('-4');let prevented=0;all(m.tree,n=>n.type==='input')[0].props.onKeyDown({key:'Enter',preventDefault(){prevented++;}});m.draw();assert.equal(prevented,1);assert.match(text(m.tree),/x ≥ −4/);
  }finally{m.unmount();}
});

test('Tổng kết không tăng điểm BTVN; ôn lại chỉ thẻ chưa khớp, stale replay và đổi chủ đề không xen phiên',()=>{
  const m=mount(file),enter=(value:string)=>{all(m.tree,n=>n.type==='input')[0].props.onChange({target:{value}});m.draw();};
  try{
    const staleStart=all(m.tree,n=>n.type==='button'&&text(n)==='Bắt đầu 3 thẻ')[0].props.onClick;
    all(m.tree,n=>n.type==='select')[0].props.onChange({target:{value:'solutions'}});m.draw();staleStart();m.draw();assert.equal(all(m.tree,n=>n.type==='article').length,0);
    m.click('Bắt đầu 3 thẻ');
    for(const [index,value] of ['2','0','5'].entries()){enter(value);m.click('Đối chiếu và xem từng bước');m.click(index===2?'Xem tổng kết thẻ':'Sang thẻ tiếp');}
    assert.match(text(m.tree),/Khớp đáp án từ lần nhập: 2\/3/);assert.match(text(m.tree),/Cần luyện lại: 1 thẻ/);assert.equal(m.focused.type,'div');
    const staleReplay=all(m.tree,n=>n.type==='button'&&text(n)==='Ôn lại 1 thẻ cần luyện')[0].props.onClick;
    m.click('Ôn lại 1 thẻ cần luyện');assert.match(text(m.tree),/Ôn lại · Thẻ 1\/1/);assert.match(text(m.tree),/x\/\(x − 1\) = 2/);assert.doesNotMatch(text(m.tree),/√\(x \+ 4\) = x − 2/);
    enter('2');m.click('Đối chiếu và xem từng bước');m.click('Xem tổng kết thẻ');assert.match(text(m.tree),/Khớp đáp án từ lần nhập: 1\/1/);assert.match(text(m.tree),/Cần luyện lại: 0 thẻ/);
    m.click('Chọn lượt khởi động mới');staleReplay();m.draw();assert.equal(all(m.tree,n=>n.type==='article').length,0);
    m.click('Bắt đầu 3 thẻ');const staleInput=all(m.tree,n=>n.type==='input')[0].props.onChange;
    all(m.tree,n=>n.type==='select')[0].props.onChange({target:{value:'signs'}});m.draw();
    assert.equal(all(m.tree,n=>n.type==='article').length,1,'Giữ thẻ đang làm đến khi xác nhận đổi');
    staleInput({target:{value:'100'}});m.draw();assert.equal(all(m.tree,n=>n.type==='input')[0].props.value,'');
    m.click('Đổi trọng tâm và xóa lượt thẻ');assert.equal(all(m.tree,n=>n.type==='article').length,0);
    m.click('Bắt đầu 3 thẻ');assert.match(text(m.tree),/3 − 2\(x − 4\)/);assert.equal(all(m.tree,n=>n.type==='input')[0].props.value,'');
    assert.doesNotMatch(text(m.tree),/đã nộp thành công|điểm BTVN tăng|đã xác minh/i);
  }finally{m.unmount();}
});

test('Kết thúc lượt rồi chọn lượt mới trả focus về trọng tâm và bắt đầu được lượt tiếp',()=>{
  const m=mount(file);
  try{
    m.click('Bắt đầu 3 thẻ');
    for(const [index,value] of ['3','-4','3'].entries()){
      all(m.tree,n=>n.type==='input')[0].props.onChange({target:{value}});m.draw();
      m.click('Đối chiếu và xem từng bước');m.click(index===2?'Xem tổng kết thẻ':'Sang thẻ tiếp');
    }
    assert.equal(m.focused.type,'div');assert.match(text(m.tree),/Khớp đáp án từ lần nhập: 3\/3/);
    m.click('Chọn lượt khởi động mới');
    const chooser=all(m.tree,n=>n.type==='select')[0];
    assert.equal(m.focused.type,'select');assert.equal(m.focused.id,chooser.props.id);
    assert.equal(all(m.tree,n=>n.type==='article'||n.props?.className==='btvn-warmup-summary').length,0);
    chooser.props.onChange({target:{value:'signs'}});m.draw();m.click('Bắt đầu 3 thẻ');
    assert.equal(m.focused.type,'h3');assert.match(text(m.tree),/3 − 2\(x − 4\)/);assert.match(text(m.tree),/Thẻ 1\/3/);
  }finally{m.unmount();}
});

test('Tải lười sau khi mở, thu gọn giữ phiên, boundary chỉ thử lại bộ thẻ',()=>{
  const m=mount(tool);try{
    assert.equal(all(m.tree,n=>n.type===React.Suspense).length,0);assert.equal(all(m.tree,n=>n.props?.role==='region')[0].props.hidden,true);
    m.click('Mở bộ thẻ khởi động');assert.equal(m.focused.type,'div');const child=all(m.tree,n=>n.type===React.Suspense)[0].props.children;
    assert.deepEqual(child.props,{});const region=all(m.tree,n=>n.props?.role==='region')[0];assert.equal(all(m.tree,n=>n.type==='button')[0].props['aria-controls'],region.props.id);
    m.click('Thu gọn bộ thẻ khởi động');assert.equal(all(m.tree,n=>n.props?.role==='region')[0].props.hidden,true);assert.equal(all(m.tree,n=>n.type===React.Suspense)[0].props.children.type,child.type);
    m.click('Mở bộ thẻ khởi động');all(m.tree,n=>n.type?.name==='HomeworkWarmupBoundary')[0].props.onRetry();m.draw();assert.notEqual(all(m.tree,n=>n.type===React.Suspense)[0].props.children.type,child.type);
  }finally{m.unmount();}
  const {HomeworkWarmupBoundary}=load(tool);let retries=0;const b=new HomeworkWarmupBoundary({onRetry:()=>retries++});b.state=HomeworkWarmupBoundary.getDerivedStateFromError();const fallback=b.render();assert.match(text(fallback),/vẫn dùng được các phần BTVN khác/);all(fallback,n=>n.type==='button')[0].props.onClick();assert.equal(retries,1);
});

test('Tiện ích và lối vào sân chơi chỉ ngoài lượt đang làm, không nhận dữ liệu học sinh, không mạng hoặc storage',()=>{
  const render=(state:any,room:boolean,checking=false)=>{let index=0;const View=load('src/native/homework/HomeworkSession.tsx',{useState:(initial:any)=>{const at=index++;return [at===0?state:at===7?room:at===11?checking:typeof initial==='function'?initial():initial,()=>{}];},useRef:(initial:any)=>({current:initial}),useMemo:(fn:()=>unknown)=>fn(),useEffect:()=>{}}).default;const tree=View({pathname:'/btvn'});return {tree,tools:all(tree,n=>n.type?.name==='HomeworkWarmupTool'),links:all(tree,n=>n.props?.href==='/san-choi')};};
  assert.equal(render(null,false,true).tools.length,0);assert.equal(render(null,false,true).links.length,0);
  const entry=render(null,false);assert.equal(entry.tools.length,1);assert.deepEqual(entry.tools[0].props,{});assert.equal(entry.links.length,1);assert.equal(text(entry.links[0]),'Đổi nhịp với Sân chơi Toán');assert.equal(entry.links[0].props.className,'btvn-btn');assert.match(text(entry.tree),/Luyện riêng.*không tính điểm BTVN/);
  const synthetic={lessonCode:'gia',lessons:[],draft:null};assert.equal(render(synthetic,false).tools.length,1);assert.equal(render(synthetic,false).links.length,1);assert.equal(render(synthetic,true).tools.length,0);assert.equal(render(synthetic,true).links.length,0);
  const code=[file,tool,'src/native/homework/warmup.ts'].map(p=>readFileSync(join(root,p),'utf8')).join('\n');assert.doesNotMatch(code,/fetch\(|localStorage|sessionStorage|setInterval|setTimeout|gateway|submittedAt|\.answers\b|dangerouslySetInnerHTML|\u2014/);
  const html=require('react-dom/server').renderToStaticMarkup(React.createElement(load(file).default));assert.match(html,/Bộ thẻ nền tảng THCS/);assert.doesNotMatch(html,/Mẫu số phải khác 0/);
  const css=readFileSync(join(root,'src/native/homework/warmup.css'),'utf8');assert.match(css,/min-height:48px/);assert.match(css,/:focus-visible/);assert.doesNotMatch(css,/\.mig-home|body\s*\{|:root\s*\{/);
});
finish({note:'7 nhóm: 9 thẻ kiểm Toán độc lập, nhập số, luồng tự nhớ/đối chiếu/ôn lại và callback cũ, focus khi chọn lượt mới, lazy/focus/ngoài phòng. Hook/SSR không thay QA trình duyệt.'});
