import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {planHomeworkTime,questionPace} from '../src/native/homework/time-plan';
import {all,load,mount,React,require,root,text} from './daily19-ui-harness.mts';
import {suite} from './exams-harness.mts';
const {test,finish}=suite('D1705-TIME-'),file='src/native/homework/HomeworkTimePlan.tsx';

test('Chia 30 phút/10 câu và hai biên, tổng các chặng bằng quỹ phút',()=>{
  assert.deepEqual(planHomeworkTime('30','10'),{minutes:30,questions:10,readMinutes:3,solveMinutes:21,reviewMinutes:6,secondsPerQuestion:126});
  const small=planHomeworkTime('5','100')!,large=planHomeworkTime('180','1')!;
  assert.equal(small.secondsPerQuestion,1);assert.equal(large.secondsPerQuestion,7560);
  for(let minutes=5;minutes<=180;minutes++)for(let count=1;count<=100;count++){
    const p=planHomeworkTime(String(minutes),String(count))!;
    assert.equal(p.readMinutes+p.solveMinutes+p.reviewMinutes,minutes);
    assert.ok(p.readMinutes>=1&&p.reviewMinutes>=2&&p.solveMinutes>0);
    assert.ok(Number.isSafeInteger(p.secondsPerQuestion)&&p.secondsPerQuestion>0);
    assert.ok(p.secondsPerQuestion*count<=p.solveMinutes*60);
    assert.ok((p.secondsPerQuestion+1)*count>p.solveMinutes*60);
  }
  assert.equal(questionPace(126),'2 phút 6 giây');assert.equal(questionPace(60),'1 phút');assert.equal(questionPace(1),'1 giây');
});

test('Từ chối rỗng, số âm, thập phân, mũ, vô hạn, ngoài biên và văn bản lẫn mã',()=>{
  for(const value of ['', ' ', '-1','0','4','181','1.5','NaN','Infinity','1e2','0x10','12a','<script>','1000'])assert.equal(planHomeworkTime(value,'10'),null,value);
  for(const value of ['', ' ', '-1','0','101','2.5','NaN','Infinity','1e1','0x10','<img>'])assert.equal(planHomeworkTime('30',value),null,value);
  assert.ok(planHomeworkTime(' 30 ',' 10 '));
});

test('Gửi form tính đúng, đổi dữ liệu xóa kết quả cũ, sửa lỗi và focus đầu ra có nhãn',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'requestAnimationFrame'),frames:FrameRequestCallback[]=[];
  Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,value:(f:FrameRequestCallback)=>{frames.push(f);return frames.length;}});
  const m=mount(file);try{
    const inputs=()=>all(m.tree,n=>n.type==='input');
    const submit=()=>{all(m.tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});m.draw();while(frames.length)frames.shift()!(0);};
    assert.equal(all(m.tree,n=>n.props?.role==='region').length,0);submit();
    assert.match(text(m.tree),/Kế hoạch 30 phút cho 10 câu/);assert.match(text(m.tree),/2 phút 6 giây\/câu/);assert.equal(m.focused.type,'div');
    assert.match(text(m.tree),/đọc đến phút 3, làm đến phút 24, soát đến phút 30/);
    inputs()[0].props.onChange({target:{value:'0'}});m.draw();assert.equal(all(m.tree,n=>n.props?.role==='region').length,0);submit();
    const alert=all(m.tree,n=>n.props?.role==='alert')[0];assert.match(text(alert),/từ 5 đến 180/);assert.equal(inputs()[0].props['aria-describedby'],alert.props.id);
    inputs()[0].props.onChange({target:{value:'45'}});m.draw();inputs()[1].props.onChange({target:{value:'15'}});m.draw();submit();
    assert.match(text(m.tree),/Kế hoạch 45 phút cho 15 câu/);assert.equal(all(m.tree,n=>n.props?.role==='alert').length,0);
    assert.doesNotMatch(text(m.tree),/Kế hoạch 30 phút/);
    const region=all(m.tree,n=>n.props?.role==='region')[0];assert.equal(all(m.tree,n=>n.props?.id===region.props['aria-labelledby']).length,1);
  }finally{m.unmount();if(previous)Object.defineProperty(globalThis,'requestAnimationFrame',previous);else delete (globalThis as any).requestAnimationFrame;}
});

test('Có thể dùng không đăng nhập, không ở phòng bài, không chạm API/điểm/storage/đồng hồ',()=>{
  const session=readFileSync(join(root,'src/native/homework/HomeworkSession.tsx'),'utf8');
  assert.match(session,/!checking&&\(!state\|\|!room\)&&<details className="btvn-extra-tools">[\s\S]*<HomeworkTimePlan\/>/);
  const code=readFileSync(join(root,file),'utf8')+readFileSync(join(root,'src/native/homework/time-plan.ts'),'utf8');
  assert.doesNotMatch(code,/fetch\(|localStorage|sessionStorage|setInterval|setTimeout|gateway|onStart|\u2014/);
  const html=require('react-dom/server').renderToStaticMarkup(React.createElement(load(file).default));
  assert.match(html,/Chia chặng làm BTVN/);assert.match(html,/không đổi thời lượng/);assert.doesNotMatch(html,/role="timer"/);
  const css=readFileSync(join(root,'src/native/homework/time-plan.css'),'utf8');
  assert.match(css,/min-height:44px/);assert.match(css,/:focus-visible/);assert.match(css,/#FFCF24/);assert.match(css,/\.ep-root \.btvn-time-plan button:hover\{background:#213269;color:#fff\}/);
});
finish({note:'4 nhóm kiểm với dữ liệu nhập giả, exhaustive 17600 cặp; hook/SSR chưa thay QA trình duyệt.'});
