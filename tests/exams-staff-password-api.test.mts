import assert from 'node:assert/strict';
import {createStaffPasswordApi} from '../server/lesson-upload/password-api';
let checks=0;const actor='00000000-0000-4000-8000-000000000001',targetId='00000000-0000-4000-8000-000000000002';
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-fixture-only'};
const normal={method:'POST',headers:{origin:'https://minhthanhmath.vn',host:'minhthanhmath.vn',authorization:'Bearer fixture-session'},body:{action:'reset',targetId}};
async function run(overrides:any={},options:any={}){
 const calls:any[]=[];let status=0,body:any;const headers:Record<string,string>={};
 const factory=(_url:string,_key:string,clientOptions:any)=>{calls.push(['client',clientOptions?.auth?.flowType,clientOptions?.auth?.detectSessionInUrl]);return {auth:{getUser:async(token:string)=>{calls.push(['getUser',token]);if(options.throw)throw Error('synthetic network error');return {data:{user:options.noUser?null:{id:actor}},error:null};},resetPasswordForEmail:async(email:string,params:any)=>{calls.push(['mail',email,params]);return {error:options.mailError||null,data:{secret:'must-never-appear'}};}},rpc:async(name:string,params:any)=>{calls.push(['rpc',name,params]);return {data:{email:'staff@registered.example.test'},error:options.rpcError?{message:options.rpcError}:null};}};}
 await createStaffPasswordApi(()=>options.noConfig?{}:env,factory as any)({...normal,...overrides},{setHeader:(k,v)=>{headers[k]=v;},status:(code)=>{status=code;return {json:value=>{body=value;}};}});
 assert.equal(headers['Cache-Control'],'no-store, private');assert.equal(headers.Vary,'Authorization');
 return {status,body,calls};
}
const ok=await run();assert.equal(ok.status,200);assert.deepEqual(ok.calls,[['client','implicit',false],['getUser','fixture-session'],['rpc','mtm_staff_password_reset_target',{p_actor:actor,p_target:targetId}],['mail','staff@registered.example.test',{redirectTo:'https://minhthanhmath.vn/quan-tri/doi-mat-khau'}]]);checks++;
assert.deepEqual(Object.keys(ok.body),['message']);assert(!JSON.stringify(ok.body).includes('@'));assert(!JSON.stringify(ok.body).includes('must-never-appear'));checks++;
for(const method of ['GET','PUT']){const r=await run({method});assert.equal(r.status,405);assert.equal(r.calls.length,0);checks++;}
for(const origin of ['https://evil.example','http://minhthanhmath.vn',undefined]){const r=await run({headers:{...normal.headers,origin}});assert.equal(r.status,403);assert.equal(r.calls.length,0);checks++;}
for(const body of [null,[],{action:'reset',targetId,email:'evil@example.test'},{action:'reset',targetId,p_actor:actor},{action:'reset',targetId,redirectTo:'https://evil.example'},{action:'reset',targetId:'x'},'{invalid']){const r=await run({body});assert.equal(r.status,400);assert.equal(r.calls.length,0);checks++;}
for(const authorization of [undefined,'Basic x','Bearer x y']){const r=await run({headers:{...normal.headers,authorization}});assert.equal(r.status,401);assert.equal(r.calls.length,0);checks++;}
assert.equal((await run({}, {noConfig:true})).status,503);checks++;
const unauthorized=await run({}, {noUser:true});assert.equal(unauthorized.status,401);assert.deepEqual(unauthorized.calls.map(call=>call[0]),['client','getUser']);checks++;
for(const [rpcError,status] of [['MANAGER_REQUIRED',403],['STAFF_REQUIRED',403],['REGISTERED_EMAIL_REQUIRED',409],['RESET_RATE_LIMIT',429]]){const r=await run({},{rpcError});assert.equal(r.status,status);assert(!r.calls.some(c=>c[0]==='mail'));checks++;}
for(const status of [429,500]){const r=await run({}, {mailError:{status}});assert.equal(r.status,status===429?429:503);assert(!JSON.stringify(r.body).includes('staff@'));checks++;}
assert.equal((await run({}, {throw:true})).status,503);checks++;
console.log(`${checks} ca API đặt lại mật khẩu đạt: người gửi thật, quyền DB, đích hồ sơ, không lộ link/mật khẩu; mock không gửi email.`);
