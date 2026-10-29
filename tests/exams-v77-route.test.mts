// Đối chiếu trực tiếp cách tính V76 trong Git, không tự viết lại đáp án tham chiếu.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
import {bank, sequences, sequenceNumber} from '../src/native/chapters/practice-bank';
import {routeGroupsOf, type PracticeItem} from '../src/native/chapters/practice-shared';
import {suite} from './exams-harness.mts';

const root=process.env.MTM_ROOT!;
const require=createRequire(join(root,'package.json'));
const {transformSync}=require('esbuild');
const {test,finish}=suite('V77');
const v76=execFileSync('git',['show','ae7b30e:src/native/chapters/PracticeLibrary.tsx'],{cwd:root,encoding:'utf8'});
const json=(file:string)=>JSON.parse(readFileSync(join(root,'src/native/chapters',file),'utf8'));
const context={tests:json('practice-tests.json'),exactTests:json('exact-tests.json'),archives:json('archived-tests.json'),chapterSequence:json('chapter-sequence.json')};
// Trích nguyên logic sản xuất V76; loại kiểu TS bằng esbuild trước khi chạy trong ngữ cảnh riêng.
const start=v76.indexOf('const rawBank='),end=v76.indexOf('const testLabel=');
assert.ok(start>=0&&end>start);
const oracle=runInNewContext(transformSync(v76.slice(start,end)+'\n({bank,sequences,sequenceNumber,routeGroupsOf});',{loader:'ts',target:'es2022'}).code,context) as {
  bank:PracticeItem[];sequences:Record<string,unknown>;sequenceNumber:Map<string,number>;routeGroupsOf:typeof routeGroupsOf;
};
const plain=(value:unknown)=>JSON.parse(JSON.stringify(value));
function routeView(items:PracticeItem[],seq:Record<string,unknown>,numbers:Map<string,number>,groupsOf:typeof routeGroupsOf,key:string){
  return groupsOf(seq[key]).map(g=>({...g,items:g.items.flatMap(it=>{
    const p=items.find(b=>b.exam.id===it.id);
    return p?[{...it,number:numbers.get(it.id),coverage:p.coverage,title:p.presentationTitle}]:[];
  })})).filter(g=>g.items.length>0);
}
for(const key of ['10:1','10:4','11:2','12:1'])test(`${key}: số Bài, tiêu đề, nhóm, ghi chú, mức và dạng giống V76`,()=>{
  const actual=routeView(bank,sequences,sequenceNumber,routeGroupsOf,key);
  const expected=routeView(oracle.bank,oracle.sequences,oracle.sequenceNumber,oracle.routeGroupsOf,key);
  assert.deepEqual(plain(actual),plain(expected));
  assert.deepEqual(actual.flatMap(g=>g.items.map(i=>i.number)),actual.flatMap(g=>g.items).map((_,i)=>i+1));
  const [track,chapter]=key.split(':');
  const fallback=(items:PracticeItem[],numbers:Map<string,number>)=>items.filter(p=>p.track===track&&p.chapter===chapter)
    .sort((a,b)=>a.order-b.order).map(p=>({id:p.exam.id,number:numbers.get(p.exam.id)??p.sourceSequence?.sequence??p.order,coverage:p.coverage,title:p.presentationTitle}));
  assert.ok(fallback(bank,sequenceNumber).length>0,'phải có bài thực để so, kể cả chương chưa có lộ trình');
  assert.deepEqual(plain(fallback(bank,sequenceNumber)),plain(fallback(oracle.bank,oracle.sequenceNumber)));
  console.log(`${key}: ${actual.length} nhóm, ${actual.flatMap(g=>g.items).length} bài khớp V76`);
});
test('toàn ngân hàng: coverage và presentationTitle giống V76',()=>{
  const titles=(items:PracticeItem[])=>items.map(p=>({id:p.exam.id,coverage:p.coverage,title:p.presentationTitle}));
  // 29/10/2026: bỏ ba chương xác suất mới (10:8, 10:9, 11:8) khỏi phép so với V76.
  const old=(p:PracticeItem)=>!(p.track==='10'&&['8','9'].includes(p.chapter)||p.track==='11'&&p.chapter==='8');
  assert.deepEqual(plain(titles(bank.filter(old))),plain(titles(oracle.bank)));
});
test('lộ trình và danh sách nguồn: giữ nguyên JSX V76; khung trang không nhập sequence JSON',()=>{
  const shelf=readFileSync(join(root,'src/native/chapters/PracticeShelf.tsx'),'utf8').replace(/\r\n/g,'\n');
  const block=(s:string)=>s.slice(s.indexOf('        {chapterRoute.length'),s.indexOf('        <details className="cp-previous-bank"'));
  assert.ok(block(v76).length>0);
  assert.equal(block(shelf),block(v76));
  for(const file of ['PracticeLibrary.tsx','practice-shared.ts']){
    const source=readFileSync(join(root,'src/native/chapters',file),'utf8');
    assert.ok(!source.split(/\r?\n/).filter(l=>/^\s*import\s/.test(l)).join('\n').includes('chapter-sequence.json'));
  }
});
test('routeGroupsOf còn đọc mảng ID cũ và bỏ qua cấu hình không có groups',()=>{
  assert.deepEqual(routeGroupsOf(['a','b']),[{title:'',items:[{id:'a'},{id:'b'}]}]);
  assert.deepEqual(routeGroupsOf(undefined),[]);
});
finish();
