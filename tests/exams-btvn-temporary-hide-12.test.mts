import assert from 'node:assert/strict';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
import {createDurableHomeworkHandler} from '../server/btvn/durable-http';
import {assignedMa,thiThangBlock,visibleThiThangCards} from '../server/btvn/thi-thang';

const bases=['thi-thang-2026-10-2k10-8'];
const targets=bases.flatMap(base=>['thi','btvn'].flatMap(phase=>[1,2].map(ma=>`${base}-${phase}-ma-${ma}`)));
const name='Học sinh giả kiểm chặn',className='2K10 8+',fixture=pipelineFixture();
const cards=targets.map(lessonCode=>({lessonCode,submittedAt:null}));
assert.equal(targets.length,4);
for(const slug of targets)assert.doesNotMatch(thiThangBlock(slug,cards,name,className)??'',/tạm ẩn/);
const own=assignedMa(bases[0],name,className),visible=targets.filter(slug=>slug.includes('-btvn-')||slug.endsWith(`-thi-ma-${own}`));
assert.deepEqual(visibleThiThangCards([...cards,{lessonCode:'btvn-thuong',submittedAt:null}],name,className).map(c=>c.lessonCode),[...visible,'btvn-thuong']);
for(const slug of targets)for(const near of [slug+'-suffix',slug.replace('2026-10','2026-11')])assert.doesNotMatch(thiThangBlock(near,cards,name,className)??'',/tạm ẩn/);

// Synthetic authenticated API: reopened lessons reach the missing-private-PDF gate;
// the other exam code still rejects by assignment. Neither reason is temporary hiding.
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
 for(const action of ['state','select','start']){
  const r=await handler({...input,body:{action,lessonCode:slug}});
  assert.doesNotMatch((r.body as any).message??'',/tạm ẩn/,slug+' '+action);
  if(r.status===409)assert.match((r.body as any).message,/sẽ là BTVN/);else {assert.equal(r.status,503);assert.match((r.body as any).message,/Chưa tải đủ đề/);}
 }
}
selected=material(`${bases[0]}-thi-ma-${own===1?2:1}`);const fallback=await handler({...input,body:{action:'state'}});
assert.equal(fallback.status,200);assert.equal((fallback.body as any).exam,null);assert.deepEqual((fallback.body as any).lessons.map((l:any)=>l.lessonCode),visible);
assert.equal(commits,0);assert.equal(signed,0);assert.ok(assets>0);

// Reopened lessons and other classes keep the original deterministic assignment.
for(const [base,cls] of [['thi-thang-2026-10-2k10-8','2K10 8+'],['thi-thang-2026-10-2k10-9','2K10 9+'],['thi-thang-2026-10-2k10-thu-3-6','2K10 9+'],['thi-thang-2026-10-2k11-8','2K11 8+'],['thi-thang-2026-10-2k11-9','2K11 9+']]){
 const own=assignedMa(base,name,cls);
 for(const phase of ['thi','btvn'])for(const ma of [1,2]){
  const slug=`${base}-${phase}-ma-${ma}`,reason=thiThangBlock(slug,[],name,cls);
  if(phase==='thi'&&ma!==own)assert.match(reason!,/sẽ là BTVN/);else assert.equal(reason,null);
 }
}
console.log('Đạt: mở tạm ẩn 4 bài 2K10 8+, API state/select/start không chặn tạm ẩn; giữ chia mã theo tên + lớp.');
