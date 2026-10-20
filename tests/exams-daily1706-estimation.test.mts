import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createEstimationRound,estimationNumber} from '../src/native/chapters/estimation-game';
import {all,load,mount,React,require,root,text} from './daily19-ui-harness.mts';
import {suite} from './exams-harness.mts';
const {test,finish}=suite('D1706-ESTIMATE-'),file='src/native/chapters/EstimationGame.tsx';
const button=(m:any,label:string)=>all(m.tree,n=>n.type==='button'&&text(n)===label)[0];
const answer=(m:any,index:number,wrong=false,round=0)=>{const q=createEstimationRound(round)[index],c=q.choices.find(c=>wrong?c.id!==q.correctId:c.id===q.correctId)!;m.click(String.fromCharCode(65+q.choices.indexOf(c))+'. '+c.text);};

test('Kiểm số học độc lập cả 30 câu bằng cộng lặp, mỗi câu có đúng một khoảng chứa tích',()=>{
  const ids=new Set<string>();
  for(let round=0;round<6;round++){
    const questions=createEstimationRound(round);assert.equal(questions.length,5);
    for(const q of questions){
      assert.ok(Number.isSafeInteger(q.a)&&q.a>0&&Number.isSafeInteger(q.b)&&q.b>0);
      const independent=Array.from({length:q.b},()=>q.a).reduce((s,v)=>s+v,0);
      assert.equal(q.product,independent);assert.equal(q.choices.length,3);
      const containing=q.choices.filter(c=>c.lower<=independent&&independent<c.upper);
      assert.equal(containing.length,1);assert.equal(containing[0].id,q.correctId);
      q.choices.forEach((c,i)=>{assert.ok(c.lower>=0&&c.lower<c.upper);if(i)assert.equal(q.choices[i-1].upper,c.lower);});
      assert.ok(q.steps[0].endsWith(estimationNumber(q.roundedA*q.roundedB)+'.'));
      assert.ok(q.steps[1].endsWith(estimationNumber(independent)+'.'));
      assert.ok(q.steps[2].includes(estimationNumber(independent)));assert.match(q.steps[3],/gần biên/);
      ids.add(q.id);
    }
  }
  assert.equal(ids.size,30);assert.equal(createEstimationRound(0)[2].product,19747);
  assert.equal(createEstimationRound(0)[2].roundedA*createEstimationRound(0)[2].roundedB,20000);
});

test('Chỉ số bất hợp lệ quay về bộ đầu, 6 bộ luân phiên ổn định, định dạng không nhầm dấu thập phân',()=>{
  for(const n of [NaN,Infinity,-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.deepEqual(createEstimationRound(n),createEstimationRound(0));
  assert.deepEqual(createEstimationRound(6),createEstimationRound(0));assert.notDeepEqual(createEstimationRound(1),createEstimationRound(0));
  assert.equal(estimationNumber(10080),'10 080');assert.equal(estimationNumber(0),'0');
  for(const q of createEstimationRound(0))assert.doesNotMatch(q.steps.join(' '),/\u2014/);
});

test('Chọn rồi mới hiện lời giải, khóa ba nút và chống bấm đúp hoặc sự kiện câu cũ',()=>{
  const m=mount(file);try{
    m.click('Bắt đầu 5 câu ước lượng');assert.equal(m.focused.type,'h4');
    assert.doesNotMatch(text(m.tree),/Kiểm tra bằng phân phối|Tích tiếp theo|Chưa cần nhân từng chữ số/);
    assert.match(text(m.tree),/Ước lượng chỉ cho cỡ kết quả/);assert.match(text(m.tree),/giấy nháp, tính nhẩm chính xác và kiểm tra hai biên trước khi chọn/);
    const first=all(m.tree,n=>n.type==='button'&&n.props['aria-pressed']!==undefined)[0].props.onClick;
    answer(m,0);assert.equal(m.focused.type,'div');assert.match(text(m.tree),/Đúng rồi!/);
    assert.equal(all(m.tree,n=>n.type==='button'&&n.props['aria-pressed']!==undefined&&n.props.disabled).length,3);
    first();m.draw();assert.match(text(m.tree),/Đúng rồi!/);
    const oldNext=button(m,'Tích tiếp theo').props.onClick;m.click('Tích tiếp theo');oldNext();first();m.draw();
    assert.match(text(m.tree),/Câu 2\/5/);assert.doesNotMatch(text(m.tree),/Kiểm tra bằng phân phối/);assert.equal(m.focused.type,'h4');
    m.click('Dừng lượt ước lượng');assert.equal(m.focused.type,'h3');first();oldNext();m.draw();assert.match(text(m.tree),/Bắt đầu 5 câu ước lượng/);
  }finally{m.unmount();}
});

test('Tổng kết, ôn riêng câu sai, ngăn sự kiện lượt cũ và đổi sang bộ khác',()=>{
  const m=mount(file);try{
    m.click('Bắt đầu 5 câu ước lượng');
    const staleAnswer=all(m.tree,n=>n.type==='button'&&n.props['aria-pressed']!==undefined)[0].props.onClick;
    for(let i=0;i<5;i++){answer(m,i,i===0);m.click(i===4?'Xem tổng kết ước lượng':'Tích tiếp theo');}
    assert.match(text(m.tree),/Em chọn đúng 4\/5/);assert.equal(all(m.tree,n=>n.type==='details').length,5);
    const staleChange=button(m,'Thử bộ 5 câu khác').props.onClick;
    m.click('Ôn lại khoảng đã chọn sai');assert.match(text(m.tree),/Ôn lại · Câu 1\/1/);
    staleAnswer();staleChange();m.draw();assert.match(text(m.tree),/Ôn lại · Câu 1\/1/);assert.doesNotMatch(text(m.tree),/Kiểm tra bằng phân phối/);
    answer(m,0);m.click('Xem tổng kết ước lượng');assert.match(text(m.tree),/Em chọn đúng 1\/1/);assert.equal(button(m,'Ôn lại khoảng đã chọn sai'),undefined);
    m.click('Thử bộ 5 câu khác');assert.ok(text(m.tree).includes('Tích '+createEstimationRound(1)[0].a+' × '+createEstimationRound(1)[0].b));
    for(let i=0;i<5;i++){answer(m,i,false,1);m.click(i===4?'Xem tổng kết ước lượng':'Tích tiếp theo');}
    assert.match(text(m.tree),/Em chọn đúng 5\/5/);m.click('Kết thúc ước lượng');assert.equal(m.focused.type,'h3');
  }finally{m.unmount();}
});

test('SSR có hướng dẫn, nguồn tự biên soạn và giới hạn lưu; nút native dùng bàn phím, phản hồi có status',()=>{
  const component=load(file).default,html=require('react-dom/server').renderToStaticMarkup(React.createElement(component));
  assert.match(html,/Ước lượng rồi kiểm tra/);assert.match(html,/Bộ câu tự biên soạn MTM/);assert.match(html,/không thuộc ngân hàng đề gốc/);
  assert.match(html,/không bấm giờ/);assert.match(html,/nếu gần biên hoặc chưa phân biệt được khoảng/);assert.match(html,/tính nhẩm chính xác và kiểm tra hai biên trước khi chọn/);assert.match(html,/đổi chương hoặc tải lại/);assert.doesNotMatch(html,/Kiểm tra bằng phân phối|role="timer"|<input/);
  const m=mount(file);try{
    m.click('Bắt đầu 5 câu ước lượng');
    all(m.tree,n=>n.type==='button').forEach(b=>{assert.equal(b.props.type,'button');assert.equal(b.props.tabIndex,undefined);});
    answer(m,0);assert.ok(all(m.tree,n=>n.props.role==='status').length);assert.equal(m.focused.type,'div');
  }finally{m.unmount();}
});

test('Lazy import chỉ gắn trong PracticeTool, CSS thắng nền ep-root và không thêm mạng hay bộ nhớ',()=>{
  const library=readFileSync(join(root,'src/native/chapters/PracticeLibrary.tsx'),'utf8');
  const checkIntegration=(source:string)=>{
    assert.match(source,/const EstimationGame=lazy\(\(\)=>import\('\.\/EstimationGame'\)\)/);
    assert.doesNotMatch(source,/import\s+EstimationGame\s+from/);
    const wrapped=/<PracticeTool\b[^>]*>\s*<EstimationGame\s*\/>\s*<\/PracticeTool>/g;
    assert.equal([...source.matchAll(wrapped)].length,1,'Chỉ một EstimationGame trong PracticeTool');
    assert.doesNotMatch(source.replace(wrapped,''),/<EstimationGame\b/,'Không gắn EstimationGame ngoài PracticeTool');
  };
  // Git lưu LF, checkout Windows có thể dùng CRLF. Kiểm tích hợp thay vì ép kiểu xuống dòng.
  const lf=library.replace(/\r\n/g,'\n');
  for(const eol of ['\n','\r\n']){
    const source=lf.replace(/\n/g,eol);
    checkIntegration(source);
    const multiline=source.replace('<EstimationGame/></PracticeTool>',eol+'<EstimationGame/>'+eol+'</PracticeTool>');
    assert.notEqual(multiline,source,'Ca JSX nhiều dòng phải thực sự đổi nguồn');
    checkIntegration(multiline);
    assert.throws(()=>checkIntegration(source.replace("lazy(()=>import('./EstimationGame'))","null")),assert.AssertionError);
    assert.throws(()=>checkIntegration("import EstimationGame from './EstimationGame';"+eol+source),assert.AssertionError);
    assert.throws(()=>checkIntegration(source.replace('<EstimationGame/>','')),assert.AssertionError);
    assert.throws(()=>checkIntegration(source+eol+'<EstimationGame/>'),assert.AssertionError);
    assert.throws(()=>checkIntegration(source+eol+'<PracticeTool><EstimationGame/></PracticeTool>'),assert.AssertionError);
  }
  const m=mount('src/native/chapters/PracticeTool.tsx',{label:'Ước lượng',loading:'Đang tải',children:React.createElement('span',null,'Nội dung chưa tải')});try{
    assert.doesNotMatch(text(m.tree),/Nội dung chưa tải/);
    all(m.tree,n=>n.type==='details')[0].props.onToggle({currentTarget:{open:true}});m.draw();assert.match(text(m.tree),/Nội dung chưa tải/);
  }finally{m.unmount();}
  const css=readFileSync(join(root,'src/native/chapters/estimation-game.css'),'utf8');
  assert.match(css,/\.cp-estimation\.cp-estimation button\{/);assert.match(css,/min-height:48px/);assert.match(css,/#213269/);assert.match(css,/#FFCF24/);
  for(const path of [file,'src/native/chapters/estimation-game.ts']){
    const source=readFileSync(join(root,path),'utf8');assert.doesNotMatch(source,/localStorage|sessionStorage|fetch\(|setInterval|setTimeout|https?:|\u2014/);
  }
});
finish({note:'30 câu kiểm số học độc lập, hook, SSR và lazy integration; không thay QA trình duyệt thật.'});
