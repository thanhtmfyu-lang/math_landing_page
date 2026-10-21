import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createLeadStatusHandler,validCommand} from '../supabase/functions/mtm-lead-status/handler.ts';
const leadId='11111111-1111-4111-8111-111111111111';
const command={action:'set',leadId,eventId:'22222222-2222-4222-8222-222222222222',status:'HOC_THU',expectedStatus:null,expectedEventId:null,className:null,effectiveDate:null,source:'manager',actorRef:'gate:actor-hash',sourceReceipt:'receipt:verified-source'};
const request=(body:unknown,headers:Record<string,string>={})=>new Request('https://example.test/functions/v1/mtm-lead-status',{method:'POST',headers:{authorization:'Bearer test-capability-only','content-type':'application/json',...headers},body:JSON.stringify(body)});
test('each status accepted; official requires class and date',()=>{
 for(const status of ['HOC_THU','DA_HOC_THU','KHONG_HOC'])assert(validCommand({...command,status}));
 assert(!validCommand({...command,status:'CHINH_THUC'}));
 assert(validCommand({...command,status:'CHINH_THUC',className:'2K9 9+',effectiveDate:'2026-10-24'}));
 assert(!validCommand({...command,status:'CHINH_THUC',className:' ',effectiveDate:'2026-10-24'}));
 assert(!validCommand({...command,className:'2K9'}));
});
test('reject arbitrary fields, RPC names, invalid IDs, missing CAS and raw actor objects',()=>{
 for(const body of [{...command,table:'leads'},{...command,leadId:'no'},{...command,eventId:'no'},{...command,expectedStatus:undefined},{...command,source:'telegram'},{...command,source:['manager']},{...command,status:['HOC_THU']},{...command,expectedStatus:['HOC_THU']},{...command,actorRef:{uid:'invented'}}])assert(!validCommand(body));
 assert(validCommand({action:'get',leadId}));assert(!validCommand({action:'get',leadId,phone:'hidden'}));
});
test('unauthenticated / invalid request does not call RPC',async()=>{
 let calls=0;const handler=createLeadStatusHandler({rpc:async()=>{calls++;return{data:{ok:true},error:null};}});
 assert.equal((await handler(request(command,{authorization:''}))).status,401);
 assert.equal((await handler(request({...command,source:'unknown'}))).status,400);
 assert.equal((await handler(request({blob:'x'.repeat(9000)}))).status,413);
 assert.equal((await handler(request(command,{'content-type':'text/plain'}))).status,415);
 assert.equal(calls,0);
});
test('forwards only worker capability and validated command; returns committed receipt',async()=>{
 const handler=createLeadStatusHandler({rpc:async(token,c)=>{assert.equal(token,'test-capability-only');assert.deepEqual(c,command);return{data:{ok:true,eventId:c.eventId,replayed:false},error:null};}});
 const response=await handler(request(command));assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,eventId:command.eventId,replayed:false});
 assert.equal(response.headers.get('access-control-allow-origin'),null);
});
test('maps permission, conflicts, not-found and DB failure without leaking diagnostics',async()=>{
 for(const [out,status] of [
  [{data:null,error:{code:'42501',message:'secret diagnostic'}},401],
  [{data:null,error:{code:'22008'}},400],
  [{data:null,error:{code:'XX000',message:'secret diagnostic'}},503],
  [{data:{ok:false,code:'STATUS_CONFLICT'},error:null},409],
  [{data:{ok:false,code:'EVENT_CONFLICT'},error:null},409],
  [{data:{ok:false,code:'NOT_FOUND'},error:null},404],
 ] as const){
  const handler=createLeadStatusHandler({rpc:async()=>out});const response=await handler(request(command));
  assert.equal(response.status,status);assert(!(await response.text()).includes('secret diagnostic'));
 }
 const handler=createLeadStatusHandler({rpc:async()=>{throw Error('secret diagnostic');}});
 assert.equal((await handler(request(command))).status,503);
});
