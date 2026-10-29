import assert from 'node:assert/strict';
import { isLinkBuoiHoc, linkBuoiHoc } from '../supabase/functions/mtm-diem-danh/link-buoi-hoc';

// 29/10: action link_buoi_hoc của edge điểm danh chỉ chuyển khoảng ngày sang RPC chỉ đọc mtm_bot_link_buoi_hoc.
const calls:{url:string;init:RequestInit}[]=[];
const ok=(async(url:RequestInfo|URL,init?:RequestInit)=>{calls.push({url:String(url),init:init!});return new Response('[{"lop":"2K9 XPT","ngay":"2026-10-27","coVideo":true}]');}) as typeof fetch;
const db={url:'https://qa.invalid',key:'qa-key'};
assert.equal(isLinkBuoiHoc({action:'link_buoi_hoc'}),true);
for(const p of [null,'x',{action:'find'},{}])assert.equal(isLinkBuoiHoc(p),false);
const r=await linkBuoiHoc({action:'link_buoi_hoc',from:'2026-09-14',to:'2026-10-29'},db,ok);
assert.equal(r.status,200);assert.deepEqual(await r.json(),[{lop:'2K9 XPT',ngay:'2026-10-27',coVideo:true}]);
assert.equal(calls.length,1);assert.equal(calls[0].url,'https://qa.invalid/rest/v1/rpc/mtm_bot_link_buoi_hoc');
assert.deepEqual(JSON.parse(String(calls[0].init.body)),{p_from:'2026-09-14',p_to:'2026-10-29'});
assert.equal((calls[0].init.headers as Record<string,string>).apikey,'qa-key');
for(const bad of [{from:'29/10/2026',to:'2026-10-29'},{from:'2026-10-01'},{from:1,to:2},{from:"2026-10-01');--",to:'2026-10-29'}]){
 const b=await linkBuoiHoc({action:'link_buoi_hoc',...bad},db,ok);assert.equal(b.status,400);}
assert.equal(calls.length,1,'khoảng sai không gọi CSDL');
const down=await linkBuoiHoc({action:'link_buoi_hoc',from:'2026-10-01',to:'2026-10-29'},db,(async()=>new Response('{"message":"x"}',{status:404})) as typeof fetch);
assert.equal(down.status,502);
console.log(JSON.stringify({suite:'DD-LINK',total:1,passed:1,failed:0}));
