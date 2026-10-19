import assert from 'node:assert/strict';
import { feedbackImageSource, prepareFeedbackImages } from '../supabase/functions/mtm-diem-danh/feedback-images';

const stores=new Map<string,Uint8Array>();let uploads=0;let reads=0;
const png=(n:number)=>new Uint8Array([137,80,78,71,13,10,26,10,n]);
const b64=(n:number)=>Buffer.from(png(n)).toString('base64');
const fakeFetch=(async (input:RequestInfo|URL,init?:RequestInit)=>{
 const key=String(input);
 if(init?.method==='GET'){reads++;const bytes=stores.get(key);return bytes?new Response(bytes):new Response('',{status:404});}
 assert.equal(init?.method,'POST');assert.equal((init?.headers as Record<string,string>)['x-upsert'],undefined);
 uploads++;if(stores.has(key))return new Response('',{status:409});
 stores.set(key,new Uint8Array(init?.body as Uint8Array));return new Response('{}');
}) as typeof fetch;
const opts={url:'https://qa.invalid',key:'qa-key',fetcher:fakeFetch};
const body=(source:string,image=1)=>({action:'sync_execute',sourceMsg:source,command:{action:'feedback_add',date:'2026-10-19',role:'PH',text:'QA',imagePng:b64(image)}});
let passed=0;
const first=body('QA-1');assert.equal(feedbackImageSource(first),'QA-1');await prepareFeedbackImages(first,opts);
assert.equal(first.command.sourceMsg,'QA-1');assert.equal(first.command.imagePng,undefined);assert.match(first.command.imagePath,/^2026-10\/[0-9a-f-]{36}\.png$/);assert.equal(uploads,1);passed++;
const same=body('QA-1');await prepareFeedbackImages(same,opts);assert.equal(same.command.imagePath,first.command.imagePath);assert.equal(uploads,1);passed++;
const changedSource=body('QA-2');await prepareFeedbackImages(changedSource,opts);assert.notEqual(changedSource.command.imagePath,first.command.imagePath);assert.equal(uploads,2);passed++;
const changedContent=body('QA-1',2);await prepareFeedbackImages(changedContent,{...opts,skipUploads:true});assert.notEqual(changedContent.command.imagePath,first.command.imagePath);assert.equal(uploads,2);passed++;
const previousReads=reads;const replay=body('QA-1');await prepareFeedbackImages(replay,{...opts,skipUploads:true});assert.equal(replay.command.imagePath,first.command.imagePath);assert.equal(reads,previousReads);passed++;
const corrupted=body('QA-1');stores.set('https://qa.invalid/storage/v1/object/mtm-feedback-proof/'+first.command.imagePath,png(9));await assert.rejects(()=>prepareFeedbackImages(corrupted,opts),/image_path_conflict/);assert.equal(uploads,2);passed++;
const invalid=body('QA-bad');invalid.command.imagePng=Buffer.from([137,80,78,71,0]).toString('base64');await assert.rejects(()=>prepareFeedbackImages(invalid,opts),/must be PNG/);assert.equal(uploads,2);passed++;
const batch:any={action:'sync_execute',sourceMsg:'QA-batch',command:{action:'feedback_add',rows:[{date:'2026-10-19',imagePng:b64(3)},{date:'2026-10-19',imagePng:b64(4)}]}};
await prepareFeedbackImages(batch,{...opts,skipUploads:true});assert.equal(batch.command.rows[0].sourceMsg,'QA-batch#feedback-1');assert.equal(batch.command.rows[1].sourceMsg,'QA-batch#feedback-2');assert.notEqual(batch.command.rows[0].imagePath,batch.command.rows[1].imagePath);passed++;
let raceCalls=0;const race=body('QA-race',5);
const raceFetch=(async(_input:RequestInfo|URL,init?:RequestInit)=>{raceCalls++;if(raceCalls===1)return new Response('',{status:404});if(init?.method==='POST')return new Response('',{status:409});return new Response(png(5));}) as typeof fetch;
await prepareFeedbackImages(race,{...opts,fetcher:raceFetch});assert.equal(raceCalls,3);passed++;
let permissionCalls=0;const forbiddenFetch=(async()=>{permissionCalls++;return new Response('',{status:403});}) as typeof fetch;
await assert.rejects(()=>prepareFeedbackImages(body('QA-denied'),{...opts,fetcher:forbiddenFetch}),/image_lookup_failed/);assert.equal(permissionCalls,1);passed++;
const malformed=body('QA-base64');malformed.command.imagePng='%%%not-base64';await assert.rejects(()=>prepareFeedbackImages(malformed,opts),/valid base64/);passed++;
let wrappedCalls=0;const wrappedMissing=(async(_input:RequestInfo|URL,init?:RequestInit)=>{wrappedCalls++;return init?.method==='GET'?Response.json({statusCode:'404',error:'not_found'},{status:400}):new Response('{}');}) as typeof fetch;
await prepareFeedbackImages(body('QA-wrapped-404'),{...opts,fetcher:wrappedMissing});assert.equal(wrappedCalls,2);passed++;
let deniedCalls=0;const wrappedDenied=(async()=>{deniedCalls++;return Response.json({statusCode:'403',error:'Unauthorized'},{status:400});}) as typeof fetch;
await assert.rejects(()=>prepareFeedbackImages(body('QA-wrapped-denied'),{...opts,fetcher:wrappedDenied}),/image_lookup_failed/);assert.equal(deniedCalls,1);passed++;
console.log(JSON.stringify({suite:'sync_feedback_images',passed,total:13}));
