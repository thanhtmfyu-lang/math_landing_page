import assert from 'node:assert/strict';
import {createWorkerRepository,parseWorkerInvocation,OPERATOR_CONTINUATION_UPLOAD_ID as target,OPERATOR_CONTINUATION_RUNTIME_ENV as runtimeEnv} from '../server/lesson-upload/supabase-worker';
let checks=0;const sha='a'.repeat(64);
const operator={uploadId:target,runtimeManifestSha256:sha};
const calls:any[]=[];let receipt:any=null;
const db={async rpc(name:string,{p}:any){assert.equal(name,'mtm_lesson_upload_api');calls.push(p);return {data:{job:receipt,ok:true},error:null};}};
for(const options of [{},{isTest:true},{auto:true},{isTest:true,auto:true}]){
 await createWorkerRepository(db,options).claim('fixture');
 assert.equal(JSON.stringify(calls.at(-1)),JSON.stringify({action:'worker_claim',worker_protocol:110,worker_id:'fixture',lease_seconds:900,is_test:options.isTest===true,...(options.auto?{auto:true}:{})}));checks++;
}
const forbiddenEnv={get [runtimeEnv]():string{throw Error('MUST_NOT_READ_UNOPTED_ENV');}};
assert.deepEqual(parseWorkerInvocation(['--once'],forbiddenEnv),{mode:'--once',options:{isTest:false,auto:false}});checks++;
assert.deepEqual(parseWorkerInvocation(['--review-once','--auto','--is-test'],{}),{mode:'--review-once',options:{isTest:true,auto:true}});checks++;
const parsed=parseWorkerInvocation(['--once','--is-test','--operator-continuation'],{[runtimeEnv]:sha});assert.deepEqual(parsed.options.operatorContinuation,operator);checks++;
await createWorkerRepository(db,parsed.options).claim('manual-fixture');
assert.deepEqual(calls.at(-1),{action:'worker_claim',worker_protocol:111,worker_id:'manual-fixture',lease_seconds:900,is_test:true,operator_continuation:true,upload_id:target,runtime_manifest_sha256:sha,auto:false});checks++;
for(const args of [[],['--enable'],['--once','--manual'],['--once','--once'],['--once','--operator-continuation'],['--once','--auto','--is-test','--operator-continuation'],['--review-once','--is-test','--operator-continuation']]){
 assert.throws(()=>parseWorkerInvocation(args,{[runtimeEnv]:sha}),/EXPLICIT_ONCE_REQUIRED|OPERATOR_CONTINUATION_EXPLICIT_TEST_REQUIRED/);checks++;
}
for(const value of [undefined,'','A'.repeat(64),'x'.repeat(64),'a'.repeat(63),'https://private.invalid/fixture']){
 assert.throws(()=>parseWorkerInvocation(['--once','--is-test','--operator-continuation'],{[runtimeEnv]:value}),/OPERATOR_CONTINUATION_RUNTIME_REQUIRED/);checks++;
}
for(const options of [{operatorContinuation:operator},{isTest:false,operatorContinuation:operator},{isTest:true,auto:true,operatorContinuation:operator},{isTest:true,operatorContinuation:{...operator,uploadId:'other'}},{isTest:true,operatorContinuation:{...operator,claim_token:'do-not-override'}}]){
 const before=calls.length;assert.throws(()=>createWorkerRepository(db,options as any),/OPERATOR_CONTINUATION_/);assert.equal(calls.length,before);checks++;
}
const mutable={isTest:true,auto:false,operatorContinuation:{...operator}},repo=createWorkerRepository(db,mutable);mutable.auto=true;const before=calls.length;await assert.rejects(()=>repo.claim('mutated'),/OPERATOR_CONTINUATION_EXPLICIT_TEST_REQUIRED/);assert.equal(calls.length,before);checks++;
for(const wrong of [{id:'other',version:1,is_test:true,operator_continuation:true},{id:target,version:2,is_test:true,operator_continuation:true},{id:target,version:1,is_test:false,operator_continuation:true},{id:target,version:1,is_test:true}]){
 receipt=wrong;await assert.rejects(()=>createWorkerRepository(db,{isTest:true,operatorContinuation:operator}).claim('fixture'),/OPERATOR_CONTINUATION_RECEIPT_MISMATCH/);checks++;
}
receipt={id:target,version:1,is_test:true,operator_continuation:true,claim_token:'server-issued-token'};
assert.equal((await createWorkerRepository(db,{isTest:true,operatorContinuation:operator}).claim('fixture'))?.claim_token,'server-issued-token');checks++;
console.log(`${checks} continuation options/payload guards PASS; synthetic RPC only, no environment/auth/provider access.`);
