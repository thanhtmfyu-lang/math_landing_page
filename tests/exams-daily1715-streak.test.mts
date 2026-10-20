import assert from 'node:assert/strict';
// PIN (18/10) thêm một useState trước room; giữ đủ ca checking, ngoài phòng và trong phòng.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {STUDY_DAYS_KEY,clearStudyDays,localStudyDay,readStudyDays,saveStudyDays,studyDayNumber,studyDayOffset,studyDayStats,type StudyStore} from '../src/native/homework/self-study-days';
import {all,load,mount,React,root,text} from './daily19-ui-harness.mts';
import {suite} from './exams-harness.mts';
const {test,finish}=suite('D1715-STREAK-'),file='src/native/homework/HomeworkStudyRhythm.tsx',tool='src/native/homework/HomeworkStudyRhythmTool.tsx';
function memory(raw:string|null=null){let value=raw;const calls:string[]=[];return {calls,get value(){return value;},getItem(key:string){assert.equal(key,STUDY_DAYS_KEY);return value;},setItem(key:string,next:string){assert.equal(key,STUDY_DAYS_KEY);calls.push('write');value=next;},removeItem(key:string){assert.equal(key,STUDY_DAYS_KEY);calls.push('remove');value=null;}};}
function browser(store:StudyStore|undefined,run:(listeners:Map<string,Function>)=>void){
  const original=Object.getOwnPropertyDescriptor(globalThis,'window'),listeners=new Map<string,Function>();
  Object.defineProperty(globalThis,'window',{configurable:true,value:{get localStorage(){if(!store)throw Error('SecurityError');return store;},addEventListener:(name:string,fn:Function)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name),setTimeout:()=>1,clearTimeout:()=>{}}});
  try{run(listeners);}finally{if(original)Object.defineProperty(globalThis,'window',original);else delete (globalThis as any).window;}
}

test('Đếm ngày thật qua tháng, năm, năm nhuận và giữ chuỗi hôm qua trước khi tự ghi hôm nay',()=>{
  assert.equal(localStudyDay(new Date(2026,9,17,0,1)),'2026-10-17');
  assert.equal(studyDayOffset('2024-03-01',-1),'2024-02-29');assert.equal(studyDayOffset('2025-03-01',-1),'2025-02-28');assert.equal(studyDayOffset('2026-01-01',-1),'2025-12-31');
  for(const bad of ['2025-02-29','2024-02-30','2026-13-01','2026-10-00','2026-1-01','2026-10-17T00:00','<script>'])assert.ok(Number.isNaN(studyDayNumber(bad)));
  const dates=['2023-12-30','2023-12-31','2024-01-01'];assert.deepEqual(studyDayStats(dates,'2024-01-02'),{total:3,current:3,longest:3,marked:false,badges:[3]});
  assert.deepEqual(studyDayStats(dates,'2024-01-03'),{total:3,current:0,longest:3,marked:false,badges:[3]});
  assert.equal(studyDayStats(['2024-02-28','2024-02-29','2024-03-01'],'2024-03-01').current,3);
  const thirty=Array.from({length:30},(_,i)=>studyDayOffset('2026-10-17',i-29));assert.deepEqual(studyDayStats(thirty,'2026-10-17').badges,[3,7,30]);
  assert.equal(studyDayStats([...thirty,...thirty,'2026-10-18'],'2026-10-17').total,30);
});

test('Kho chỉ chứa ngày, loại dữ liệu hỏng/ngày tương lai, phân biệt quyền lưu bị chặn và quota',()=>{
  const store=memory('["2026-10-16","2026-10-15","2026-10-16"]');assert.deepEqual(readStudyDays(store,'2026-10-17'),{days:['2026-10-15','2026-10-16'],status:'ready'});assert.equal(store.calls.length,0);
  for(const raw of ['{','{}','null','["2025-02-29"]','["2026-10-18"]','[4]','[{"name":"Giả"}]','["<script>"]',JSON.stringify(Array(5001).fill('2026-10-01')),' '.repeat(65002)]){const bad=memory(raw);assert.equal(readStudyDays(bad,'2026-10-17').status,'invalid');assert.equal(bad.calls.length,0);assert.equal(bad.value,raw);}
  assert.equal(readStudyDays(undefined).status,'unavailable');
  const blocked={getItem(){throw Error('SecurityError');},setItem(){throw Error('QuotaExceededError');},removeItem(){throw Error('SecurityError');}};
  assert.equal(readStudyDays(blocked).status,'unavailable');assert.deepEqual(saveStudyDays(['2026-10-17'],blocked),{days:['2026-10-17'],status:'unavailable'});assert.equal(clearStudyDays(blocked).status,'unavailable');
  const writeSafe=memory();for(const value of [['2025-02-29'],[studyDayOffset(localStudyDay(),1)],Array(5001).fill('2026-10-01'),[17],null] as any[]){assert.equal(saveStudyDays(value,writeSafe).status,'invalid');assert.equal(writeSafe.calls.length,0);}
  assert.equal(clearStudyDays(store).status,'ready');assert.equal(store.value,null);
});

test('Tự đánh dấu có chủ ý, bấm lặp không nhân ngày, bỏ dấu hôm nay và huy hiệu cũ giữ nguyên',()=>{
  const today=localStudyDay(),yesterday=studyDayOffset(today,-1),earlier=studyDayOffset(today,-2),store=memory(JSON.stringify([earlier,yesterday]));
  browser(store,()=>{const m=mount(file);try{
    assert.equal(store.calls.length,0);assert.match(text(m.tree),/không phải biên nhận nộp BTVN/);assert.match(text(m.tree),/dùng chung cho người cùng thiết bị/);
    const stale=all(m.tree,n=>n.type==='button'&&text(n)==='Em đã tự học hôm nay')[0].props.onClick;
    m.click('Em đã tự học hôm nay');assert.deepEqual(JSON.parse(store.value!),[earlier,yesterday,today]);assert.match(text(m.tree),/3 ngày liên tiếp: đã đạt/);
    stale();m.draw();assert.equal(JSON.parse(store.value!).length,3);
    m.click('Bỏ dấu hôm nay');assert.deepEqual(JSON.parse(store.value!),[earlier,yesterday]);assert.match(text(m.tree),/2 ngày/);
    m.click('Xóa lịch sử trên thiết bị');assert.equal(store.value,JSON.stringify([earlier,yesterday]));m.click('Giữ lại lịch');assert.equal(store.calls.filter(c=>c==='remove').length,0);
    m.click('Xóa lịch sử trên thiết bị');m.click('Xác nhận xóa lịch');assert.equal(store.value,null);assert.match(text(m.tree),/0 ngày/);
  }finally{m.unmount();}});
});

test('Lưu bị chặn giữ tạm và báo rõ, dữ liệu lỗi chỉ xóa sau xác nhận, nhận thay đổi cửa sổ khác',()=>{
  const today=localStudyDay();browser(undefined,()=>{const m=mount(file);try{assert.match(text(m.tree),/chỉ giữ trong trang đang mở/);m.click('Em đã tự học hôm nay');assert.match(text(m.tree),/1 ngày/);m.click('Bỏ dấu hôm nay');assert.match(text(m.tree),/0 ngày/);m.click('Thử lưu lại lịch');assert.match(text(m.tree),/có thể mất khi tải lại/);}finally{m.unmount();}});
  const store=memory('{');browser(store,listeners=>{const m=mount(file);try{
    assert.equal(all(m.tree,n=>n.type==='button'&&text(n)==='Em đã tự học hôm nay')[0].props.disabled,true);assert.equal(store.calls.length,0);
    m.click('Xóa dữ liệu không đọc được');m.click('Giữ lại lịch');assert.equal(store.value,'{');m.click('Xóa dữ liệu không đọc được');m.click('Xác nhận xóa lịch');assert.equal(store.value,null);
    store.setItem(STUDY_DAYS_KEY,JSON.stringify([today]));listeners.get('storage')!({key:STUDY_DAYS_KEY});m.draw();assert.match(text(m.tree),/Hôm nay em đã tự đánh dấu/);
    listeners.get('storage')!({key:'unrelated'});assert.match(text(m.tree),/1 ngày/);
  }finally{m.unmount();assert.equal(listeners.size,0);}});
  const other=memory();browser(other,listeners=>{const m=mount(file),oldMark=all(m.tree,n=>n.type==='button'&&text(n)==='Em đã tự học hôm nay')[0].props.onClick;
    m.click('Xóa lịch sử trên thiết bị');const oldClear=all(m.tree,n=>n.type==='button'&&text(n)==='Xác nhận xóa lịch')[0].props.onClick;
    other.setItem(STUDY_DAYS_KEY,JSON.stringify([today]));const oldStorage=listeners.get('storage')!;oldStorage({key:STUDY_DAYS_KEY});m.draw();const count=other.calls.length;oldMark();oldClear();m.draw();assert.equal(other.calls.length,count);assert.deepEqual(JSON.parse(other.value!),[today]);
    const oldRemove=all(m.tree,n=>n.type==='button'&&text(n)==='Bỏ dấu hôm nay')[0].props.onClick;m.unmount();oldRemove();oldStorage({key:STUDY_DAYS_KEY});assert.equal(other.calls.length,count);
  });
});

test('Qua nửa đêm không tự ghi ngày; thao tác đọc lịch mới nhất để giữ ngày cửa sổ khác đã lưu',()=>{
  const RealDate=globalThis.Date;let now=new RealDate(2026,11,31,23,59).getTime();
  class ClockDate extends RealDate{constructor(...args:any[]){if(args.length===0)super(now);else if(args.length===1)super(args[0]);else super(args[0],args[1],...args.slice(2) as []);}}
  globalThis.Date=ClockDate as DateConstructor;
  try{const store=memory();browser(store,listeners=>{const m=mount(file);try{
    assert.match(text(m.tree),/31\/12\/2026/);assert.equal(store.calls.length,0);
    now=new RealDate(2027,0,1,0,1).getTime();listeners.get('focus')!();m.draw();assert.match(text(m.tree),/01\/01\/2027/);assert.equal(store.calls.length,0);
    store.setItem(STUDY_DAYS_KEY,'["2026-12-31"]');m.click('Em đã tự học hôm nay');assert.deepEqual(JSON.parse(store.value!),['2026-12-31','2027-01-01']);assert.match(text(m.tree),/2 ngày/);
    m.click('Bỏ dấu hôm nay');assert.deepEqual(JSON.parse(store.value!),['2026-12-31']);
    const oldMark=all(m.tree,n=>n.type==='button'&&text(n)==='Em đã tự học hôm nay')[0].props.onClick;now=new RealDate(2027,0,2,0,1).getTime();const count=store.calls.length;oldMark();m.draw();assert.equal(store.calls.length,count);assert.match(text(m.tree),/Ngày trên thiết bị đã đổi/);oldMark();m.draw();assert.equal(store.calls.length,count);m.click('Em đã tự học hôm nay');assert.deepEqual(JSON.parse(store.value!),['2026-12-31','2027-01-02']);
  }finally{m.unmount();}});}finally{globalThis.Date=RealDate;}
});

test('Mất quyền đọc tạm thời giữ ngày đã biết, không ghi mù và thử lại giữ ngày cửa sổ khác',()=>{
  const today=localStudyDay(),yesterday=studyDayOffset(today,-1),earlier=studyDayOffset(today,-2),other=studyDayOffset(today,-4),base=memory(JSON.stringify([earlier,yesterday]));
  let blockRead=false,blockWrite=false;
  const store={getItem(key:string){if(blockRead)throw Error('SecurityError');return base.getItem(key);},setItem(key:string,value:string){if(blockWrite)throw Error('SecurityError');base.setItem(key,value);},removeItem:(key:string)=>base.removeItem(key)};
  browser(store,()=>{const m=mount(file);try{
    blockRead=true;blockWrite=true;m.click('Em đã tự học hôm nay');
    assert.match(text(m.tree),/Tổng ngày tự ghi3 ngày/);assert.deepEqual(JSON.parse(base.value!),[earlier,yesterday]);assert.equal(base.calls.length,0);
    blockWrite=false;m.click('Thử lưu lại lịch');assert.equal(base.calls.length,0);assert.match(text(m.tree),/Tổng ngày tự ghi3 ngày/);
    base.setItem(STUDY_DAYS_KEY,JSON.stringify([other,yesterday]));blockRead=false;m.click('Thử lưu lại lịch');
    assert.deepEqual(JSON.parse(base.value!),[other,yesterday,today]);assert.match(text(m.tree),/Tổng ngày tự ghi3 ngày/);assert.equal(all(m.tree,n=>n.type==='button'&&text(n)==='Thử lưu lại lịch').length,0);
  }finally{m.unmount();}});
});

test('Thử lại sau quota và sự kiện storage giữ ngày tab khác, không phục hồi dấu hôm nay vừa bỏ',()=>{
  const today=localStudyDay(),yesterday=studyDayOffset(today,-1),other=studyDayOffset(today,-3),base=memory(JSON.stringify([yesterday,today]));let blockWrite=false;
  const store={getItem:(key:string)=>base.getItem(key),setItem(key:string,value:string){if(blockWrite)throw Error('QuotaExceededError');base.setItem(key,value);},removeItem:(key:string)=>base.removeItem(key)};
  browser(store,listeners=>{const m=mount(file);try{
    blockWrite=true;m.click('Bỏ dấu hôm nay');assert.match(text(m.tree),/Tổng ngày tự ghi1 ngày/);assert.deepEqual(JSON.parse(base.value!),[yesterday,today]);
    base.setItem(STUDY_DAYS_KEY,JSON.stringify([other,yesterday,today]));listeners.get('storage')!({key:STUDY_DAYS_KEY});m.draw();
    assert.match(text(m.tree),/Tổng ngày tự ghi2 ngày/);assert.equal(all(m.tree,n=>n.type==='button'&&text(n)==='Bỏ dấu hôm nay').length,0);
    blockWrite=false;m.click('Thử lưu lại lịch');assert.deepEqual(JSON.parse(base.value!),[other,yesterday]);assert.equal(all(m.tree,n=>n.type==='button'&&text(n)==='Thử lưu lại lịch').length,0);
  }finally{m.unmount();}});
});

test('Xóa lúc bị chặn không phục hồi ngày cũ; thử lại không ghi đè kho mới bị hỏng chưa xác nhận',()=>{
  const today=localStudyDay(),yesterday=studyDayOffset(today,-1),base=memory(JSON.stringify([yesterday]));let blocked=true;
  const store={getItem:(key:string)=>base.getItem(key),setItem(key:string,value:string){if(blocked)throw Error('QuotaExceededError');base.setItem(key,value);},removeItem(key:string){if(blocked)throw Error('SecurityError');base.removeItem(key);}};
  browser(store,listeners=>{const m=mount(file);try{
    m.click('Xóa lịch sử trên thiết bị');m.click('Xác nhận xóa lịch');assert.match(text(m.tree),/Tổng ngày tự ghi0 ngày/);assert.deepEqual(JSON.parse(base.value!),[yesterday]);
    m.click('Em đã tự học hôm nay');listeners.get('storage')!({key:STUDY_DAYS_KEY});m.draw();assert.match(text(m.tree),/Tổng ngày tự ghi1 ngày/);
    blocked=false;m.click('Thử lưu lại lịch');assert.deepEqual(JSON.parse(base.value!),[today]);
  }finally{m.unmount();}});
  const changed=memory();let quota=true;
  const later={getItem:(key:string)=>changed.getItem(key),setItem(key:string,value:string){if(quota)throw Error('QuotaExceededError');changed.setItem(key,value);},removeItem:(key:string)=>changed.removeItem(key)};
  browser(later,()=>{const m=mount(file);try{
    m.click('Em đã tự học hôm nay');changed.setItem(STUDY_DAYS_KEY,'{');quota=false;const count=changed.calls.length;m.click('Thử lưu lại lịch');
    assert.equal(changed.value,'{');assert.equal(changed.calls.length,count);assert.match(text(m.tree),/Dữ liệu cũ không đọc được/);
  }finally{m.unmount();}});
});

test('Tải lười, thu gọn giữ nội dung, thử lại thay loader và boundary khoanh riêng công cụ',()=>{
  const m=mount(tool);try{
    assert.equal(all(m.tree,n=>n.type===React.Suspense).length,0);m.click('Mở lịch tự học');assert.equal(m.focused.type,'div');
    const child=all(m.tree,n=>n.type===React.Suspense)[0].props.children;assert.deepEqual(child.props,{});m.click('Thu gọn lịch tự học');assert.equal(all(m.tree,n=>n.props?.role==='region')[0].props.hidden,true);assert.equal(all(m.tree,n=>n.type===React.Suspense)[0].props.children.type,child.type);
    m.click('Mở lịch tự học');all(m.tree,n=>n.type?.name==='HomeworkStudyRhythmBoundary')[0].props.onRetry();m.draw();assert.notEqual(all(m.tree,n=>n.type===React.Suspense)[0].props.children.type,child.type);
  }finally{m.unmount();}
  const {HomeworkStudyRhythmBoundary}=load(tool);let retries=0;const b=new HomeworkStudyRhythmBoundary({onRetry:()=>retries++});b.state=HomeworkStudyRhythmBoundary.getDerivedStateFromError();assert.match(text(b.render()),/BTVN khác vẫn dùng được/);all(b.render(),n=>n.type==='button')[0].props.onClick();assert.equal(retries,1);
});

test('Mount trên BTVN thật ngoài phòng làm bài, không truyền danh tính, dữ liệu bài hoặc gọi API',()=>{
  const render=(state:any,room:boolean,checking=false)=>{let index=0;const View=load('src/native/homework/HomeworkSession.tsx',{useState:(initial:any)=>{const at=index++;return [at===0?state:at===7?room:at===11?checking:typeof initial==='function'?initial():initial,()=>{}];},useRef:(v:any)=>({current:v}),useMemo:(fn:()=>unknown)=>fn(),useEffect(){}}).default;return all(View({pathname:'/btvn'}),n=>n.type?.name==='HomeworkStudyRhythmTool');};
  assert.equal(render(null,false,true).length,0);assert.equal(render(null,false).length,1);assert.deepEqual(render(null,false)[0].props,{});
  assert.equal(render({lessons:[],draft:null},false).length,1);assert.equal(render({lessons:[],draft:null},true).length,0);
  const source=[file,tool,'src/native/homework/self-study-days.ts'].map(path=>readFileSync(join(root,path),'utf8')).join('\n');assert.doesNotMatch(source,/fetch\(|gateway|\.answers\b|fullName|phone|studentCode|dangerouslySetInnerHTML|\u2014/);
  const css=readFileSync(join(root,'src/native/homework/study-rhythm.css'),'utf8');assert.match(css,/min-height:48px/);assert.match(css,/:focus-visible/);assert.match(css,/@media\(max-width:600px\)/);assert.doesNotMatch(css,/\.mig-home|body\s*\{|:root\s*\{/);
});
finish({note:'10 nhóm: lịch qua tháng/năm/năm nhuận/nửa đêm, 3/7/30 ngày, dữ liệu hỏng/quota/quyền riêng tư, tương tác tự ghi/bỏ/xóa, phục hồi quyền lưu và giữ thao tác chưa lưu khi tab khác đổi lịch, lazy/retry và mount BTVN thật. Hook UI không thay QA trình duyệt.'});
