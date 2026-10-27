import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createEssayHandler} from '../server/btvn/tu-luan';
import {suite} from './exams-harness.mts';
const {test:record,finish}=suite('TU-LUAN-');
// The shared harness is synchronous. Await each async service check before recording.
const cases:{name:string;run:()=>void|Promise<void>}[]=[];
const test=(name:string,run:()=>void|Promise<void>)=>{cases.push({name,run});};
const jpeg=new Uint8Array([255,216,255,...Array(250).fill(7)]),sha=createHash('sha256').update(jpeg).digest('hex');
const cookie='mtm_btvn_demo='+'a'.repeat(64),scope={lessonCode:'thi-thang-2026-10-qa-thi-ma-1',attemptId:'qa-attempt'};
function fixture(){
 let received=false,uploaded=false,corrupt=false,deny:string|null=null;
 const calls:{op:string;args:any}[]=[],signs:{path:string;upsert:boolean}[]=[];
 const image=()=>({id:'qa-image',path:'owner/student/lesson/'+sha+'.jpg',sha256:sha,bytes:jpeg.length,pageNumber:1,receivedAt:received?'2026-10-27T13:00:00Z':null});
 const handler=createEssayHandler({
  rpc:async(_name,args)=>{calls.push({op:String(args.p_action),args});if(deny)return {data:null,error:{code:deny}};if(args.p_action==='list')return {data:{items:received?[image()]:[],deadline:100,serverNow:90},error:null};if(args.p_action==='confirm'){if(!uploaded)return {data:null,error:{code:'22023'}};received=true;}return {data:image(),error:null};},
  storage:{from:()=>({createSignedUploadUrl:async(path,options)=>{signs.push({path,upsert:options.upsert});return {data:{signedUrl:'https://qa.supabase.co/storage/v1/object/upload/sign/mtm-tu-luan/'+path+'?token=local-qa'},error:null};},download:async()=>!uploaded?{data:null,error:{}}:{data:new Blob([corrupt?new Uint8Array(jpeg.length):jpeg],{type:'image/jpeg'}),error:null}})},
 });
 return {handler,calls,signs,upload:()=>{uploaded=true;},corrupt:()=>{corrupt=true;},deny:(code:string)=>{deny=code;}};
}
const body=(action:string,extra={})=>({action,...scope,...(action==='essay-list'?{}:{sha256:sha,bytes:jpeg.length}),...extra});
test('missing/invalid session rejects before any RPC or Storage operation',async()=>{for(const session of ['',cookie.replace(/a/g,'g')]){const f=fixture();assert.equal((await f.handler(body('essay-sign'),session)).status,401);assert.equal(f.calls.length,0);assert.equal(f.signs.length,0);}});
test('student ID, path, page number and client deadline cannot be supplied',async()=>{for(const field of ['studentId','path','pageNumber','deadline']){const f=fixture();assert.equal((await f.handler(body('essay-sign',{[field]:'forged'}),cookie)).status,400);assert.equal(f.calls.length,0);}});
test('image hash, byte bounds and lesson/attempt syntax checked before RPC',async()=>{for(const extra of [{sha256:'bad'},{bytes:3145729},{bytes:-1},{bytes:1.5},{lessonCode:'../other'},{attemptId:'a/b'}]){const f=fixture();assert.equal((await f.handler(body('essay-sign',extra),cookie)).status,400);assert.equal(f.calls.length,0);}});
test('signed URL uses only database path, cookie session and upsert false',async()=>{const f=fixture(),r=await f.handler(body('essay-sign'),cookie);assert.equal(r.status,200);assert.equal(f.signs[0].upsert,false);assert.equal(f.signs[0].path,'owner/student/lesson/'+sha+'.jpg');assert.equal(f.calls[0].args.p_session,'a'.repeat(64));assert.equal('path' in (r.body as any).image,false);});
test('pending object cannot get a receipt before upload completes',async()=>{const f=fixture();assert.equal((await f.handler(body('essay-confirm'),cookie)).status,409);assert.equal(f.calls.some(x=>x.op==='confirm'),false);});
test('server verifies JPEG bytes/hash and then commits one receipt',async()=>{const f=fixture();f.upload();const r=await f.handler(body('essay-confirm'),cookie);assert.equal(r.status,200);assert.equal((r.body as any).image.pageNumber,1);assert.ok((r.body as any).image.receivedAt);assert.deepEqual(f.calls.map(x=>x.op),['reserve','confirm']);});
test('same-size corrupt bytes never reach confirm RPC',async()=>{const f=fixture();f.upload();f.corrupt();assert.equal((await f.handler(body('essay-confirm'),cookie)).status,400);assert.equal(f.calls.some(x=>x.op==='confirm'),false);});
test('retry after lost ACK returns original receipt without another signed upload',async()=>{const f=fixture();f.upload();const first=await f.handler(body('essay-confirm'),cookie),retry=await f.handler(body('essay-sign'),cookie);assert.equal(retry.status,200);assert.equal((retry.body as any).duplicate,true);assert.deepEqual((retry.body as any).image,(first.body as any).image);assert.equal(f.signs.length,0);});
test('upload succeeded but confirm never ran: sign recovers receipt instead of signing an existing path',async()=>{const f=fixture();f.upload();const recovered=await f.handler(body('essay-sign'),cookie);assert.equal(recovered.status,200);assert.ok((recovered.body as any).image.receivedAt);assert.equal(f.signs.length,0);assert.deepEqual(f.calls.map(x=>x.op),['reserve','confirm']);});
test('wrong student/exam, expired deadline and unavailable migration fail closed',async()=>{for(const [code,status] of [['42501',403],['P0015',409],['PGRST202',503]] as const){const f=fixture();f.deny(code);assert.equal((await f.handler(body('essay-sign'),cookie)).status,status);assert.equal(f.signs.length,0);}});
test('list exposes own receipts without issuing any upload URL',async()=>{const f=fixture(),r=await f.handler(body('essay-list'),cookie);assert.equal(r.status,200);assert.deepEqual((r.body as any).items,[]);assert.equal(f.signs.length,0);});
for(const check of cases){try{await check.run();record(check.name,()=>{});}catch(error){record(check.name,()=>{throw error;});}}
finish({note:'Awaited synthetic service contract; actual migration/RLS and browser coverage recorded separately in qa-tuluan.'});
