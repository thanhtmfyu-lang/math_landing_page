import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {MemoryHomeworkRepository} from '../server/btvn/repository';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
import {assignedMa,doneMa,thiThangBlock,thiThangPart,visibleThiThangCards} from '../server/btvn/thi-thang';
import {thiThangGroups} from '../src/native/homework/ThiThangSection';

// Thi kết thúc tháng (anh Thành 20/10/2026): 2 mã đề mỗi lớp mỗi kỳ, online làm 1 lần, sau ca mã còn lại là BTVN.
const base='thi-thang-2026-10-2k10-xpt';
assert.deepEqual(thiThangPart(base+'-thi-ma-2'),{base,phase:'thi',ma:2});
assert.deepEqual(thiThangPart(base+'-btvn-ma-1'),{base,phase:'btvn',ma:1});
assert.equal(thiThangPart('2k10-xpt-2026-10-20'),null,'BTVN thường không bị ảnh hưởng.');
assert.equal(thiThangPart(base+'-thi-ma-3'),null);

// Chia mã tất định và đủ cả hai mã trên một lớp giả.
const names=Array.from({length:40},(_,i)=>'Học sinh thử '+i);
const split=names.map(n=>assignedMa(base,n,'2K10 XPT'));
assert.deepEqual(split,names.map(n=>assignedMa(base,n,'2K10 XPT')));
assert.ok(split.filter(m=>m===1).length>=8&&split.filter(m=>m===2).length>=8,'Hai mã chia gần đều.');

const name='Học sinh thử thi tháng',cls='2K10 XPT',own=assignedMa(base,name,cls),otherMa=own===1?2:1;
const card=(code:string,submittedAt:number|null=null)=>({lessonCode:code,submittedAt});
const thiOwn=base+'-thi-ma-'+own,thiOther=base+'-thi-ma-'+otherMa,btvnOwn=base+'-btvn-ma-'+own,btvnOther=base+'-btvn-ma-'+otherMa;
// Trong ca: HS online chỉ thấy và chỉ mở được mã của mình.
let cards=[card(thiOwn),card(thiOther),card(btvnOwn),card(btvnOther),card('2k10-xpt-2026-10-20')];
assert.equal(thiThangBlock(thiOwn,cards,name,cls),null);
assert.match(thiThangBlock(thiOther,cards,name,cls)!,/sẽ là BTVN sau ca thi/);
assert.deepEqual(visibleThiThangCards(cards,name,cls).map(c=>c.lessonCode),[thiOwn,btvnOwn,btvnOther,'2k10-xpt-2026-10-20']);
// HS offline chưa nộp gì: cả hai BTVN mở để em tự chọn.
assert.equal(doneMa(base,cards),null);
// HS online đã nộp thi: BTVN cùng mã bị khóa, mã kia là BTVN.
cards=[card(thiOwn,1),card(thiOther),card(btvnOwn),card(btvnOther)];
assert.equal(doneMa(base,cards),own);
assert.match(thiThangBlock(btvnOwn,cards,name,cls)!,/BTVN của em là/);
assert.equal(thiThangBlock(btvnOther,cards,name,cls),null);
// HS offline nộp BTVN mã 1 → coi như đã làm mã 2 trên giấy, mã 2 bị khóa.
cards=[card(base+'-btvn-ma-1',5),card(base+'-btvn-ma-2')];
assert.equal(doneMa(base,cards),2);
assert.ok(thiThangBlock(base+'-btvn-ma-2',cards,name,cls));
assert.equal(thiThangBlock(base+'-btvn-ma-1',cards,name,cls),null);

// Máy chủ: mở mã bạn bên cạnh trong ca bị chặn trước khi trả đề, kể cả chỉ xem.
const fixture=pipelineFixture(),exam=fixture.exam,now=Date.parse('2026-10-31T18:30:00+07:00');
const monthly=(code:string)=>({...fixture.material,lessonCode:code,classNames:[cls],kind:'kiem-tra-thang' as const,opensAt:now-60000,closesAt:now+3600000});
const repo=new MemoryHomeworkRepository([{studentCode:'FAKE-THI',fullName:name,phone:'0900000000',className:cls}]);
const raw=repo.get('FAKE-THI')!;
let material=monthly(thiOther),commits=0;
const durable=new SupabaseHomeworkRepository({async rpc(rpcName){
  if(rpcName==='mtm_btvn_read')return {data:{revision:0,work:raw,exam,material,lessons:[monthly(thiOwn),monthly(thiOther)]},error:null};
  if(rpcName==='mtm_btvn_commit'){commits++;return {data:{ok:true},error:null};}
  throw Error(rpcName);
}},async()=>({}),()=>now);
await assert.rejects(durable.call('s','select',thiOther),/sẽ là BTVN sau ca thi/);
await assert.rejects(durable.call('s','start',thiOther),/sẽ là BTVN sau ca thi/);
assert.equal(commits,0);
const fallback=await durable.call('s','state');
assert.equal(fallback.exam,null,'Không có mã bài thì không lộ đề mã khác.');
assert.deepEqual(fallback.lessons!.map(l=>l.lessonCode),[thiOwn]);
material=monthly(thiOwn);
const opened=await durable.call('s','start',thiOwn);
assert.ok(opened.exam&&opened.draft,'Mã của em mở được và tạo lượt.');
assert.equal(opened.maxAttempts,1,'Thi online chỉ 1 lượt.');

// Giao diện: gom theo kỳ.
const groups=thiThangGroups([card(thiOwn),card(btvnOther),card(btvnOwn),card('2k10-xpt-2026-10-20')] as any);
assert.equal(groups.length,1);assert.equal(groups[0].thi!.lessonCode,thiOwn);assert.equal(groups[0].btvn.length,2);

// Mục hiển thị: sau ca, HS offline thấy câu hỏi chọn mã đã làm.
const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const code=buildSync({entryPoints:[join(root,'src/native/homework/ThiThangSection.tsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;
const mod={exports:{} as any};new Function('require','module','exports',code)((id:string)=>id.endsWith('.css')?{}:require(id),mod,mod.exports);
const after=now+7200000,closed={kind:'kiem-tra-thang',opensAt:now-60000,closesAt:now+3600000,available:true,bestScore:null,dueAt:null,late:null,date:'2026-10-31',title:'Thi tháng 10'};
const btvn=(code:string)=>({lessonCode:code,opensAt:now+3600000,available:true,bestScore:null,submittedAt:null,dueAt:null,late:null,date:'2026-10-31',title:'BTVN thi tháng'});
let html=renderToStaticMarkup(React.createElement(mod.exports.default,{lessons:[{...closed,lessonCode:thiOwn,submittedAt:null},btvn(btvnOwn),btvn(btvnOther)],now:after,busy:false,onSelect(){}}));
assert.match(html,/Thi kết thúc tháng/);assert.match(html,/Trên lớp em đã làm mã đề nào/);assert.match(html,/Mã đề 101/);assert.match(html,/Mã đề 102/);
html=renderToStaticMarkup(React.createElement(mod.exports.default,{lessons:[{...closed,lessonCode:thiOwn,submittedAt:now},btvn(btvnOther)],now:after,busy:false,onSelect(){}}));
assert.match(html,new RegExp('BTVN của em: <b>Mã đề 10'+otherMa));
html=renderToStaticMarkup(React.createElement(mod.exports.default,{lessons:[{...closed,lessonCode:thiOwn,submittedAt:null},btvn(btvnOwn),btvn(btvnOther)],now:now,busy:false,onSelect(){}}));
assert.match(html,/Vào làm bài thi/);assert.doesNotMatch(html,/Trên lớp em đã làm/);
console.log('Đạt: thi kết thúc tháng 2 mã đề, online 1 lần đúng mã, sau ca mã còn lại là BTVN.');
