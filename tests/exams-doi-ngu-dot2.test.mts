import assert from 'node:assert/strict';
import {mount} from './daily19-ui-harness.mts';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {createHomeworkDeadlineICS,hasHomeworkDeadline} from '../src/native/homework/deadline-calendar';
import {createRankApi} from '../api/xep-hang';
import {anonymousRankRow,publicRankRow} from '../server/btvn/rank-row';
const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const render=(c:any,p:any={})=>renderToStaticMarkup(React.createElement(c,p));
function load(file:string){
  const code=buildSync({entryPoints:[join(root,file)],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;
  const mod={exports:{} as any};new Function('require','module','exports',code)(require,mod,mod.exports);return mod.exports;
}
let count=0;async function test(name:string,fn:()=>unknown){await fn();console.log('ĐẠT '+(++count)+' '+name);}
await test('API công khai đúng tên đã duyệt, loại mã và điện thoại, hạng cá nhân giữ hợp đồng',async()=>{
  const row={rank:1,fullName:'TÊN THỬ RIÊNG',className:'Lớp thử',score:8,submitted:2,total:3,phone:'0000000000',studentId:'PRIVATE-TEST'};
  assert.deepEqual(anonymousRankRow(row),{rank:1,className:'Lớp thử',score:8,submitted:2,total:3});
  assert.equal(publicRankRow(row).fullName,row.fullName);
  let calls=0,result:any,status=0,headers:Record<string,string>={};
  const handler=createRankApi(()=>({MTM_RANK_ENABLED:'1',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'SYNTHETIC-TEST'}),async()=>{calls++;return new Response(JSON.stringify([row]));});
  const res={setHeader:(k:string,v:string)=>headers[k]=v,status:(n:number)=>{status=n;return {json:(v:any)=>{result=v;}};}};
  await handler({method:'GET',query:{khoi:'2K9',loai:'btvn-tuan'}},res);
  assert.equal(calls,1);assert.equal(status,200);assert.equal(result.enabled,true);assert.deepEqual(result.rows,[publicRankRow(row)]);
  assert.doesNotMatch(JSON.stringify(result),/phone|studentId|PRIVATE-TEST|SYNTHETIC-TEST/);
  await handler({method:'GET',query:{khoi:'invalid',loai:'btvn-tuan'}},res);assert.equal(status,400);assert.equal(calls,1);
  await handler({method:'POST'},res);assert.equal(status,405);assert.equal(calls,1);
});
await test('Bảng công khai và hạng cá nhân đều hiển thị tên đã duyệt',()=>{
  const {RankContent}=load('src/native/homework/HomeLeaderboard.tsx'),rows=[{rank:1,fullName:'TÊN THỬ RIÊNG',className:'Lớp thử',score:8,submitted:2,total:3}];
  assert.match(render(RankContent,{rows,status:'ready'}),/TÊN THỬ RIÊNG/);
  assert.match(render(RankContent,{rows:[{...rows[0],fullName:''}],status:'ready'}),/Học sinh MTM/);
  assert.match(render(RankContent,{rows,status:'ready',own:true}),/TÊN THỬ RIÊNG/);
});
const all=(t:any,p:(n:any)=>boolean):any[]=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(n=>all(n,p)):[...(p(t)?[t]:[]),...all(t.props?.children,p)];
const now=Date.parse('2099-10-16T10:00:00+07:00'),dueAt=Date.parse('2099-10-16T17:30:00+07:00');
await test('Lịch BTVN dùng đúng UTC và UID ổn định, một nhắc 15 phút và không lặp',async()=>{
  const a=await createHomeworkDeadlineICS({lessonCode:'synthetic-code',dueAt},now);
  const b=await createHomeworkDeadlineICS({lessonCode:'synthetic-code',dueAt},now+1000);
  assert.match(a,/DTSTART:20991016T103000Z\r\n/);assert.match(a,/DTSTAMP:20991016T030000Z\r\n/);
  assert.equal(a.match(/UID:([^\r]+)/)![1],b.match(/UID:([^\r]+)/)![1]);
  assert.notEqual(a.match(/UID:([^\r]+)/)![1],(await createHomeworkDeadlineICS({lessonCode:'synthetic-code',dueAt:dueAt+1000},now)).match(/UID:([^\r]+)/)![1]);
  assert.doesNotMatch(a,/RRULE|ATTENDEE|ORGANIZER/);assert.match(a,/DTEND:20991016T103100Z\r\n/);assert.match(a,/TRIGGER:-PT15M\r\n/);assert.equal((a.match(/BEGIN:VALARM/g)||[]).length,1);assert.ok(a.endsWith('END:VCALENDAR\r\n'));
  for(const line of a.split('\r\n'))assert.ok(new TextEncoder().encode(line).length<=75);
});
await test('Hạn thiếu, hỏng, quá hạn hoặc ngoài năm ICS không tạo lịch',async()=>{
  for(const due of [null,undefined,NaN,Infinity,-Infinity,0,now,now-1,'2099-10-16',Date.UTC(10000,0,1),8.64e15]){
    assert.equal(hasHomeworkDeadline(due,now),false);
    assert.throws(()=>createHomeworkDeadlineICS({lessonCode:'synthetic',dueAt:due as any},now),/Chưa có hạn/);
  }
});
await test('Lịch không đưa tên, điện thoại, mã, điểm hay URL riêng ra tệp',async()=>{
  const fixture={lessonCode:'synthetic\r\nATTENDEE:private@example.test',dueAt,fullName:'TÊN THỬ RIÊNG',phone:'0000000000',studentCode:'SECRET-TEST',score:9,materialUrl:'https://private.example.test/file?token=TEST'};
  const ics=await createHomeworkDeadlineICS(fixture,now);
  for(const secret of [fixture.lessonCode,fixture.fullName,fixture.phone,fixture.studentCode,fixture.materialUrl,'private@example.test'])assert.ok(!ics.includes(secret));
  assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,1);assert.match(ics,/URL:https:\/\/www.minhthanhmath.vn\/btvn/);
});
const {default:Cards}=load('src/native/homework/LessonCards.tsx');
const lesson={lessonCode:'synthetic',classNames:['Lớp thử'],date:'2099-10-16',title:'Buổi học thử',videoId:null,materialUrl:null,handoutUrl:null,homeworkUrl:null,dueAt,bestScore:null,late:null,submittedAt:null,available:true};
await test('Thẻ chỉ xuất lịch khi đã mở, có bài và hạn thật trong tương lai',()=>{
  const card=(patch:any={})=>render(Cards,{lessons:[{...lesson,...patch}],busy:false,onHomework(){}});
  assert.match(card(),/Nhắc lịch hạn nộp/);assert.match(card(),/Làm BTVN/);
  for(const patch of [{dueAt:null,expectedDueAt:dueAt},{dueAt:NaN},{dueAt:1},{available:false},{locked:true},{opensAt:Date.now()+600000}])assert.doesNotMatch(card(patch),/Nhắc lịch hạn nộp/);
  assert.match(card({opensAt:Date.now()-1,locked:true}),/Nhắc lịch hạn nộp/);
});
const {default:Gate}=load('src/native/homework/HomeworkGate.tsx');
const props={studentCode:'SYNTHETIC-CODE',identity:{fullName:'Tên thử',phone:'0000000000',className:'Lớp thử'},busy:false,classNames:['Lớp thử']};
await test('Hai form BTVN gửi riêng, giữ payload và chặn khi bận/lớp không hợp lệ',()=>{
  const calls:any[]=[],make=(patch:any={})=>mount('src/native/homework/HomeworkGate.tsx',{...props,onCode(){},onIdentity(){},onLogin:(input:any)=>calls.push(input),...patch}).tree;
  const forms=all(make(),n=>n.type==='form');assert.equal(forms.length,2);
  forms[0].props.onSubmit({preventDefault(){}});forms[1].props.onSubmit({preventDefault(){}});
  assert.deepEqual(calls,[{studentCode:props.studentCode},props.identity]);
  for(const patch of [{busy:true},{classesLoading:true},{identity:{...props.identity,className:'Không được cấp'}}])all(make(patch),n=>n.type==='form')[1].props.onSubmit({preventDefault(){}});
  all(make({busy:true}),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});assert.equal(calls.length,2);
});
await test('Cổng có hai hướng dẫn, Zalo đúng số và cách mở từ Zalo, không giả vai PH',()=>{
  const html=render(Gate,{...props,onCode(){},onIdentity(){},onLogin(){}});
  for(const href of ['/huong-dan','/huong-dan?cho=phu-huynh','https://zalo.me/0967365413'])assert.ok(html.includes('href="'+href+'"'));
  assert.match(html,/Mã học sinh lấy ở đâu/);assert.match(html,/Chrome hoặc Safari/);assert.match(html,/nhiều con cùng lớp/);
  assert.doesNotMatch(html,/role="tab"|chatgpt\.site|Tình hình con hôm nay/);
});
await test('Thông báo hết quyền hiện trong đúng form, cả chế độ nhập PIN và tạo PIN',()=>{
  const notice='Phần bài chưa gửi xong có thể chưa được tính.';
  for(const pinMode of ['enter','setup']){
    const m=mount('src/native/homework/HomeworkGate.tsx',{...props,pinMode,notice,onCode(){},onIdentity(){},onLogin(){}});
    try{
      const forms=()=>all(m.tree,n=>n.type==='form');
      assert.equal(all(forms()[0],n=>n.props?.role==='alert').length,0);
      assert.equal(all(forms()[1],n=>n.props?.role==='alert')[0].props.children,notice);
      assert.equal(m.scrolled.text,notice);assert.deepEqual(m.scrolled.options,{block:'nearest'});
      forms()[0].props.onSubmit({preventDefault(){}});m.draw();
      assert.equal(all(forms()[0],n=>n.props?.role==='alert')[0].props.children,notice);
      assert.equal(all(forms()[1],n=>n.props?.role==='alert').length,0);
      assert.equal(m.scrolled.text,notice);assert.deepEqual(m.scrolled.options,{block:'nearest'});
    }finally{m.unmount();}
  }
});
await test('Đích công khai trong dialog/footer nằm trên MTM, menu có Hướng dẫn',()=>{
  const {AccessDialog,MigrationHeader}=load('src/migration/Experience.tsx');
  const dialog=render(AccessDialog),footer=render(load('src/components/PortalLinks.tsx').PortalLinks,{footer:true});
  for(const html of [dialog,footer]){
    assert.match(html,/href="\/btvn"/);assert.match(html,/href="\/huong-dan\?cho=phu-huynh"/);assert.doesNotMatch(html,/chatgpt\.site|audience=|VITE_MTM_PORTAL_URL/);
  }
  assert.match(dialog,/Chưa được kết nối/);
  assert.match(render(MigrationHeader,{pathname:'/huong-dan'}),/<a(?=[^>]*href="\/huong-dan")(?=[^>]*aria-current="page")[^>]*>/);
});
await test('FAQ, lợi ích và lịch phân biệt chức năng hiện có với phần chưa tích hợp',()=>{
  const faq=render(load('src/components/FAQSection.tsx').FAQSection),benefits=render(load('src/components/BenefitsSection.tsx').BenefitsSection);
  assert.match(faq,/href="\/btvn"/);assert.match(faq,/Cổng phụ huynh riêng chưa được kết nối/);assert.match(faq,/số điện thoại đã đăng ký/);
  assert.match(benefits,/Cổng phụ huynh riêng chưa được kết nối/);
  const timetable=render(load('src/components/MtmTimetable.tsx').MtmTimetable);
  assert.match(timetable,/Lịch học tham chiếu MTM/);assert.match(timetable,/chưa xác minh lịch hiện tại/);assert.match(timetable,/Tải lịch tham chiếu/);
});
await test('Link nội bộ đổi học sinh/phụ huynh trên cùng Hướng dẫn cập nhật tab, Back cũng đúng',()=>{
  class Runtime{
    slots:any[]=[];index=0;changed=false;effects:(()=>void)[]=[];value:any;
    constructor(public fn:()=>any){}
    same(a:any,b:any){return a&&b&&a.length===b.length&&a.every((v:any,i:number)=>Object.is(v,b[i]));}
    state(initial:any){const i=this.index++;if(!this.slots[i])this.slots[i]={value:typeof initial==='function'?initial():initial};return [this.slots[i].value,(v:any)=>{const next=typeof v==='function'?v(this.slots[i].value):v;if(!Object.is(next,this.slots[i].value)){this.slots[i].value=next;this.changed=true;}}];}
    effect(fn:any,deps:any){const i=this.index++,old=this.slots[i];if(!old||!this.same(old.deps,deps)){this.slots[i]={deps,cleanup:old?.cleanup};this.effects.push(()=>{old?.cleanup?.();this.slots[i].cleanup=fn();});}}
    flush(){for(let n=0;n<20;n++){(globalThis as any).__doiNguRuntime=this;this.index=0;this.changed=false;this.value=this.fn();this.effects.splice(0).forEach(f=>f());if(!this.changed)return this.value;}throw Error('Hook không ổn định');}
    dispose(){this.slots.forEach(s=>s?.cleanup?.());}
  }
  const fixture=join(root,'tests/fixtures/doi-ngu-react.mts');
  const hooks=(file:string)=>{const code=buildSync({entryPoints:[join(root,file)],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',alias:{react:fixture,'react/jsx-runtime':fixture},loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;const m={exports:{} as any};new Function('require','module','exports',code)(require,m,m.exports);return m.exports;};
  const win=new EventTarget(),location=new URL('https://local.test/huong-dan');
  Object.assign(globalThis,{window:win,location,history:{pushState(_s:any,_t:any,url:string){location.href=new URL(url,location.href).href;},replaceState(_s:any,_t:any,url:string){location.href=new URL(url,location.href).href;}}});
  const {default:Guide}=hooks('src/migration/Guide.tsx'),{navigate}=hooks('src/migration/navigation.tsx'),r=new Runtime(Guide);
  const parent=()=>all(r.value,n=>n.props?.id==='mg-tab-ph')[0].props['aria-selected'];
  r.flush();assert.equal(parent(),false);
  navigate('/huong-dan?cho=phu-huynh');r.flush();assert.equal(parent(),true);
  all(r.value,n=>n.props?.id==='mg-tab-hs')[0].props.onClick();r.flush();assert.equal(parent(),false);
  navigate('/huong-dan?cho=phu-huynh');r.flush();assert.equal(parent(),true);
  navigate('/huong-dan?cho=hoc-sinh');r.flush();assert.equal(parent(),false);
  location.search='?cho=phu-huynh';win.dispatchEvent(new Event('popstate'));r.flush();assert.equal(parent(),true);r.dispose();
});
console.log(`${count}/${count} ca Đợt 2 đạt; chỉ fixture tổng hợp, hook/SSR và ICS, chưa phải browser.`);
