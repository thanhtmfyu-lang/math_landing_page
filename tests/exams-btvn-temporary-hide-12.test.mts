import assert from 'node:assert/strict';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
import {createDurableHomeworkHandler} from '../server/btvn/durable-http';
import {assignedMa,thiThangBlock,visibleThiThangCards} from '../server/btvn/thi-thang';

const bases=['thi-thang-2026-10-2k10-8','thi-thang-2026-10-2k11-8','thi-thang-2026-10-2k11-9'];
const targets=bases.flatMap(base=>['thi','btvn'].flatMap(phase=>[1,2].map(ma=>`${base}-${phase}-ma-${ma}`)));
const name='Học sinh giả kiểm chặn',className='2K10 8+',fixture=pipelineFixture();
const cards=targets.map(lessonCode=>({lessonCode,submittedAt:null}));
assert.equal(targets.length,12);
for(const slug of targets)assert.match(thiThangBlock(slug,cards,name,className)!,/tạm ẩn/);
assert.deepEqual(visibleThiThangCards([...cards,{lessonCode:'btvn-thuong',submittedAt:null}],name,className).map(c=>c.lessonCode),['btvn-thuong']);
for(const slug of targets)for(const near of [slug+'-suffix',slug.replace('2026-10','2026-11')])assert.doesNotMatch(thiThangBlock(near,cards,name,className)??'',/tạm ẩn/);

// Full exam intentionally supplied by a schema-shaped fake read RPC, even after opening.
// API with a synthetic authenticated cookie must reject before signing or committing.
const material=(lessonCode:string)=>({...fixture.material,lessonCode,classNames:[className],classOpensAt:{[className]:'2026-10-27T00:00:00+07:00'},kind:lessonCode.includes('-thi-')?'kiem-tra-thang' as const:'btvn' as const,opensAt:0,closesAt:Date.parse('2099-01-01T00:00:00Z')});
const lessons=targets.map(material);let selected=lessons[0],commits=0,signed=0,assets=0;
const repo=new SupabaseHomeworkRepository({async rpc(rpc,args){
 if(rpc==='mtm_btvn_read')return {data:{revision:0,work:{student:{studentCode:'FAKE',fullName:name,phone:'0900000000',className},drafts:[],receipts:[]},exam:fixture.exam,material:args.p_lesson?material(String(args.p_lesson)):selected,lessons},error:null};
 if(rpc==='mtm_btvn_commit'){commits++;return {data:{ok:true},error:null};}
 if(rpc==='mtm_btvn_assets'){assets++;return {data:[],error:null};}
 throw Error(rpc);
}},async()=>({}),()=>Date.parse('2026-11-01T00:00:00+07:00'),async()=>{signed++;return 'https://fake.invalid/signed';});
const handler=createDurableHomeworkHandler(repo),input={method:'POST',cookie:'mtm_btvn_demo='+'a'.repeat(64),origin:'https://www.minhthanhmath.vn',host:'www.minhthanhmath.vn',secure:true};
for(const slug of targets){
 for(const action of ['state','select','start','save','submit']){
  const r=await handler({...input,body:{action,lessonCode:slug,...(['save','submit'].includes(action)?{attemptId:'fake',answers:{}}:{})}});
  assert.equal(r.status,409,slug+' '+action);assert.match((r.body as any).message,/tạm ẩn/);assert.equal((r.body as any).exam,undefined);
 }
 selected=material(slug);const fallback=await handler({...input,body:{action:'state'}});
 assert.equal(fallback.status,200);assert.equal((fallback.body as any).exam,null);assert.deepEqual((fallback.body as any).lessons,[]);
}
assert.equal(commits,0);assert.equal(signed,0);assert.equal(assets,0);

// Tonight's eight lessons are outside the exact set; original deterministic assignment remains.
for(const base of ['thi-thang-2026-10-2k10-9','thi-thang-2026-10-2k10-thu-3-6']){
 const own=assignedMa(base,name,'2K10 9+');
 for(const phase of ['thi','btvn'])for(const ma of [1,2]){
  const slug=`${base}-${phase}-ma-${ma}`,reason=thiThangBlock(slug,[],name,'2K10 9+');
  if(phase==='thi'&&ma!==own)assert.match(reason!,/sẽ là BTVN/);else assert.equal(reason,null);
 }
}
console.log('Đạt: chặn đúng 12 bài cả đọc/ghi/phiên có sẵn, ẩn thẻ, không ký ảnh/commit; giữ 8 bài tối nay và bài khác.');
