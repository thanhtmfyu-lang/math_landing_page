import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createRankRouter} from '../api/xep-hang';
import {createBoardRouter} from '../api/bang-tin';
import exam from '../api/exam';
const root=process.env.MTM_ROOT!;
const walk=(p:string):string[]=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name)]);
assert.equal(walk(join(root,'api')).filter(p=>p.endsWith('.ts')).length,8);
const config=JSON.parse(readFileSync(join(root,'vercel.json'),'utf8'));
for(const [source,destination] of [
 ['/api/hsa-xep-hang','/api/xep-hang?muc=hsa'],
 ['/api/xep-hang-cua-em','/api/xep-hang?muc=cua-em'],
 ['/api/bang-tin-anh','/api/bang-tin?muc=anh'],
 ['/__preview/:path*','/api/exam?muc=preview-disabled'],
])assert.ok(config.rewrites.some((r:any)=>r.source===source&&r.destination===destination));
async function call(handler:any,req:any){
 let status=0,body:any;const headers:any={};
 await handler(req,{setHeader:(k:string,v:any)=>headers[k]=v,status:(n:number)=>{status=n;return {json:(v:any)=>body=v,end:(v:any)=>body=v};}});
 return {status,body,headers};
}
const rank=createRankRouter(()=>({}),async()=>{throw Error('No network');});
assert.deepEqual((await call(rank,{method:'GET',query:{}})).body,{enabled:false,rows:[]});
assert.deepEqual((await call(rank,{method:'GET',query:{muc:'hsa',de:'synthetic-exam'}})).body,{enabled:false,open:false,rows:[]});
assert.equal((await call(rank,{method:'GET',query:{muc:'cua-em'}})).status,405);
assert.equal((await call(rank,{method:'GET',query:{muc:['hsa','cua-em']}})).status,404);
assert.equal((await call(createBoardRouter(()=>({})),{method:'GET',query:{muc:'anh'}})).status,404);
assert.equal((await call(createBoardRouter(()=>({})),{method:'GET',query:{muc:'bad'}})).status,404);
assert.equal((await call(exam,{method:'GET',query:{muc:'preview-disabled'},headers:{}})).status,404);
assert.equal((await call(exam,{method:'GET',query:{muc:['preview-disabled','phong-thi']},headers:{}})).status,404);
console.log('Eight Vercel entries; old URLs route to shared handlers; invalid routes fail closed.');
