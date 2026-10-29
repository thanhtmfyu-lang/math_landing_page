// KT06: oracle lấy trực tiếp V78 trong Git, kiểm mọi chương và lịch sử v1 thật.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {chapterRoman,foundationLabel,lessonName,routeGroupsOf,tracks,type PracticeItem} from '../src/native/chapters/practice-shared';
import {metadata,chapterIds,loadItems,readItems,savedExamId,sequences,sequenceNumber} from '../src/native/chapters/practice-loader';
import {createDraft,submitDraft,saveDraft,archiveSubmitted,readHistory,HISTORY_KEY,draftKey} from '../src/native/exams/store';
import {FakeStore,suite} from './exams-harness.mts';
import {bank as sourceBank,pilotBank as sourcePilotBank,sequences as sourceSequences,sequenceNumber as sourceNumbers} from '../src/native/chapters/practice-bank';
const root=process.env.MTM_ROOT!;
const show=(path:string)=>execFileSync('git',['show','0ed6dd3:src/native/chapters/'+path],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
const context={tests:JSON.parse(show('practice-tests.json')),exactTests:JSON.parse(show('exact-tests.json')),archives:JSON.parse(show('archived-tests.json')),chapterSequence:JSON.parse(show('chapter-sequence.json')),chapterRoman,foundationLabel,lessonName,routeGroupsOf};
const {transformSync}=createRequire(join(root,'package.json'))('esbuild');
const code=show('practice-bank.ts');
const oracle=runInNewContext(transformSync(code.slice(code.indexOf('const rawBank=')).replace(/export /g,'')+'\n({bank,pilotBank,sequences,sequenceNumber});',{loader:'ts'}).code,context);
const plain=(p:unknown)=>JSON.parse(JSON.stringify(p));
const {test,finish}=suite('KT06');
const actual=await loadItems(Object.keys(metadata));
const current=actual.filter(p=>!metadata[p.exam.id].archived);
// 29/10/2026: ba chương xác suất (10:8, 10:9, 11:8) là ngân hàng mới, không có trong V78.
const newChapter=(track:string,chapter:string)=>track==='11'&&['1','2','3','4','8'].includes(chapter)||track==='10'&&['8','9'].includes(chapter);
const v80Chapter=(p:PracticeItem)=>newChapter(p.track,p.chapter);
test('ngoài bốn chương lớp 11 nhập V80 và ba chương xác suất mới: nội dung/id/versionHash/tiêu đề và lưu trữ giống V78',()=>assert.deepEqual(plain(actual.filter(p=>!v80Chapter(p))),plain([...oracle.bank,...oracle.pilotBank].filter(p=>!v80Chapter(p)))));
test('mọi shard và lộ trình V80 khớp bộ nạp ngân hàng nguồn nguyên khối',()=>assert.deepEqual(plain(actual),plain([...sourceBank,...sourcePilotBank])));
const route=(bank:PracticeItem[],seq:Record<string,unknown>,nums:Map<string,number>,key:string)=>routeGroupsOf(seq[key]).map(g=>({...g,items:g.items.flatMap(it=>{const p=bank.find(p=>p.exam.id===it.id);return p?[{...it,number:nums.get(it.id),coverage:p.coverage,title:p.presentationTitle}]:[];})})).filter(g=>g.items.length);
for(const track of tracks)for(const chapter of track.chapters){
  const key=track.id+':'+chapter.id,ids=chapterIds(track.id,chapter.id),loaded=await loadItems(ids);
  test(key+': chỉ tải chương này; thứ tự, mọi tiêu đề và lộ trình đúng nguồn đối chiếu',()=>{
    assert.ok(loaded.every(p=>p.track===track.id&&p.chapter===chapter.id));
    const updated=newChapter(track.id,chapter.id);
    const reference=updated?[...sourceBank,...sourcePilotBank]:[...oracle.bank,...oracle.pilotBank];
    const expected=reference.filter(p=>p.track===track.id&&p.chapter===chapter.id);
    assert.deepEqual(plain(loaded),plain(expected));
    assert.deepEqual(plain(route(loaded,sequences,sequenceNumber,key)),plain(route(updated?sourceBank:oracle.bank,updated?sourceSequences:oracle.sequences,updated?sourceNumbers:oracle.sequenceNumber,key)));
  });
}
for(const p of [current[0],actual.find(p=>metadata[p.exam.id].archived)!]){
  const storage=new FakeStore(),made=createDraft(p.exam,'old-'+p.exam.id,1000000);assert.ok(made.ok);
  const submitted=submitDraft(p.exam,made.value,1001000);assert.ok(submitted.ok);
  assert.ok(saveDraft(storage,p.exam,submitted.value,null).ok);
  const before=storage.snapshot(),id=savedExamId(storage,submitted.value.attemptId),items=await loadItems(id?[id]:[]);
  test('lượt nháp đã nộp cũ mở đúng một đề: '+p.exam.id,()=>{
    assert.equal(id,p.exam.id);assert.equal(items.length,1);
    assert.deepEqual(readHistory(storage,items.map(p=>p.exam)).items[0].draft,submitted.value);
    assert.equal(storage.snapshot(),before);
  });
  assert.ok(archiveSubmitted(storage,p.exam,submitted.value).ok);
  // Bản snapshot phiên bản cũ tự chứa đề, không dùng đáp án mới.
  storage.data.delete(draftKey(p.exam.id));
  const archived=readHistory(storage,[]).items[0];
  const saved=JSON.parse(storage.getItem(HISTORY_KEY)!);saved.entries[0].exam.versionHash='a'.repeat(64);saved.entries[0].draft.examVersionHash='a'.repeat(64);storage.data.set(HISTORY_KEY,JSON.stringify(saved));
  const archivedId=savedExamId(storage,submitted.value.attemptId),one=await loadItems(archivedId?[archivedId]:[]);
  test('kho lịch sử v1 giữ snapshot phiên bản cũ: '+p.exam.id,()=>{
    assert.equal(archivedId,p.exam.id);assert.equal(one.length,1);
    assert.equal(readHistory(storage,one.map(p=>p.exam)).items[0].exam.versionHash,'a'.repeat(64));
    assert.equal(archived.exam.id,p.exam.id);
  });
}
test('id/lượt không tồn tại và storage lỗi không kéo cả ngân hàng',()=>{
  assert.equal(savedExamId(null,'missing'),undefined);
  const store=new FakeStore();store.failGet=true;assert.equal(savedExamId(store,'missing'),undefined);
  assert.deepEqual(chapterIds('missing','missing'),[]);
});
assert.deepEqual(await loadItems(['missing']),[]);
// Thử đúng cơ chế Suspense dùng ở giao diện, không chỉ đọc trực tiếp JSON.
async function renderItems(key:string,ids:string[]) {
  try{return readItems(key,ids);}catch(pending){assert.ok(pending instanceof Promise);await pending;return readItems(key,ids);}
}
const first=await renderItems('test-chapter:10:1',chapterIds('10','1'));
const second=await renderItems('test-chapter:12:1',chapterIds('12','1'));
const one=await renderItems('test-exam:'+current[0].exam.id,[current[0].exam.id]);
test('Suspense đổi chương không trả đề cũ; trang id chỉ có một đề',()=>{
  assert.ok(first.length&&second.length);
  assert.ok(first.every(p=>p.track==='10'&&p.chapter==='1'));
  assert.ok(second.every(p=>p.track==='12'&&p.chapter==='1'));
  assert.equal(one.length,1);assert.equal(one[0].exam.id,current[0].exam.id);
  assert.equal(readItems('test-chapter:10:1',chapterIds('10','1')),first);
});
finish({chapters:tracks.reduce((n,t)=>n+t.chapters.length,0),exams:actual.length});
