import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createSemesterApi,activationDigest,semesterSession} from '../server/semester/api';
import {createLeadApi} from '../api/dang-ky';
import {leadRpcArgs} from '../server/lead/lead';
import {semesterLessons} from '../src/native/semester/catalogue';

const token='a'.repeat(64),origin='https://www.minhthanhmath.vn';
const env={MTM_SEMESTER_ENABLED:'1',MTM_LEAD_ENABLED:'1',SUPABASE_URL:'https://sample.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only'};
const headers={origin,host:'www.minhthanhmath.vn',cookie:'mtm_btvn_demo='+token};
async function call(handler:any,body:unknown,override:any={}){let code=0,data:any;const out:Record<string,string>={};await handler({method:'POST',headers,body,...override},{setHeader:(k:string,v:string)=>out[k]=v,status:(n:number)=>{code=n;return{json:(v:any)=>data=v};}});return {code,data,headers:out};}
const id='11111111-1111-4111-8111-111111111111';
let rpcCalls:any[]=[],signedCalls:any[]=[];
const now=Date.now(),deadline=new Date(now+3600000).toISOString();
const factory=(status='ok',storageError=false)=>()=>({rpc:async(name:string,args:any)=>{rpcCalls.push({name,args});return {data:status==='ok'?{status,path:'hk1/sample.mp4',expiresAt:deadline,views:1,limit:3,registered:true,lessons:[]}: {status},error:null};},storage:{from:(bucket:string)=>({createSignedUrl:async(path:string,ttl:number)=>{signedCalls.push({bucket,path,ttl});return storageError?{data:null,error:{message:'private'}}:{data:{signedUrl:'https://sample.supabase.co/signed-fixture'},error:null};}})}}) as any;
const api=createSemesterApi(()=>env,factory(),()=>now);
for(const grade of ['10','11','12'] as const){assert.equal(semesterLessons(grade).length,8);assert.equal(new Set(semesterLessons(grade).map(x=>x.id)).size,8);}
assert.equal(activationDigest('a'.repeat(40)),activationDigest('AAAAA-'.repeat(7)+'AAAAA'));
assert.match(activationDigest('a'.repeat(40))!,/^[a-f0-9]{64}$/);assert.equal(activationDigest('bad'),null);
assert.equal(semesterSession(headers.cookie),token);assert.equal(semesterSession(['mtm_btvn_demo='+token]),'');
for(const b of [null,[],{}, {action:'state',grade:'13'}, {action:'state',grade:'12',studentId:'forged'}, {action:'play',grade:'12',video:'hk1-12-w1-core',requestId:'not-uuid'}, {action:'activate',grade:'12',code:'x'}])assert.equal((await call(api,b)).code,400);
for(const override of [{method:'GET'}, {headers:{...headers,origin:'https://foreign.example'}}, {headers:{...headers,host:'foreign.example'}}, {headers:{origin:headers.origin,host:headers.host}}])assert.ok((await call(api,{action:'state',grade:'12'},override)).code>=400);
assert.equal(rpcCalls.length,0);
assert.equal((await call(createSemesterApi(()=>({...env,MTM_SEMESTER_ENABLED:'0'}),factory()),{action:'state',grade:'12'})).code,503);
const state=await call(api,{action:'state',grade:'12'});assert.equal(state.code,200);assert.equal(signedCalls.length,0);assert.equal(state.headers['Cache-Control'],'no-store, private');
const play={action:'play',grade:'12',video:'hk1-12-w1-core',requestId:id};
const result=await call(api,play);assert.equal(result.code,200);assert.deepEqual(signedCalls[0],{bucket:'mtm-semester',path:'hk1/sample.mp4',ttl:3600});
assert.doesNotMatch(JSON.stringify(result.data),/private_path|"path"|test-only/);
assert.deepEqual(rpcCalls.at(-1),{name:'mtm_hk1_access',args:{p_session:token,p_action:'play',p_grade:'12',p_video:'hk1-12-w1-core',p_request:id,p_hash:''}});
await call(api,{action:'activate',grade:'12',code:'a'.repeat(40)});
assert.equal(rpcCalls.at(-1).args.p_hash,activationDigest('a'.repeat(40)));assert.equal('code' in rpcCalls.at(-1).args,false);
for(const status of ['login','register','closed','advanced','limit','missing','invalid','rate']){const before=signedCalls.length;assert.ok((await call(createSemesterApi(()=>env,factory(status)),play)).code>=400);assert.equal(signedCalls.length,before);}
assert.equal((await call(createSemesterApi(()=>env,factory(),()=>now+3600001),play)).code,409);
assert.equal((await call(createSemesterApi(()=>env,factory('ok',true),()=>now),play)).code,503);
// Lỗi ký URL không cấp requestId mới: RPC retry cùng id, hạn URL còn lại không tăng.
await call(createSemesterApi(()=>env,factory(),()=>now+10000),play);assert.equal(signedCalls.at(-1).ttl,3590);assert.equal(rpcCalls.at(-1).args.p_request,id);
const reg={kind:'on-cuoi-ky-1',studentName:'Học sinh mẫu',phone:'0900000001',grade:'12',message:'online'};
assert.equal((leadRpcArgs(reg) as any).p_kind,'on-cuoi-ky-1');assert.equal(typeof leadRpcArgs({...reg,grade:'hsa'}),'string');
let leadArgs:any;
const leadApi=createLeadApi(()=>env,async(url:any,init:any)=>{assert.ok(String(url).endsWith('/rpc/mtm_hk1_register'));leadArgs=JSON.parse(init.body);return new Response(JSON.stringify({status:'accepted'}));});
assert.equal((await call(leadApi,reg,{headers:{origin:headers.origin,host:headers.host}})).code,401);
assert.equal((await call(leadApi,reg)).code,200);assert.equal(leadArgs.p_session,token);
const root=process.env.MTM_ROOT||process.cwd();
const sql=readFileSync(join(root,'supabase/migrations-pending/202610210093_on_cuoi_ky_1.sql'),'utf8');
const params=sql.match(/create function public\.mtm_hk1_register\(([^)]+)\)/)![1].split(',').map(x=>x.trim().split(' ')[0]).sort();
assert.deepEqual(Object.keys(leadArgs).sort(),params);
assert.equal((JSON.parse(readFileSync(join(root,'package.json'),'utf8')).dependencies)['@supabase/supabase-js'],'2.117.3');
console.log('HKI: catalogue, whitelist, origin/session, default-off, server counter handoff, retry expiry, hash-only activation, signed private media and lead registration passed.');
