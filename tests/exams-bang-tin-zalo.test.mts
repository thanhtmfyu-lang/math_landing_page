// Bảng tin: bài Zalo đã duyệt trả cho cả khách; Supabase lỗi vẫn giữ ảnh đóng gói (20/10/2026).
import {createBoardApi} from '../api/bang-tin';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const base={MTM_BANG_TIN_KEY:randomBytes(32).toString('base64'),MTM_BTVN_ALLOWED_ORIGINS:'https://minhthanhmath.vn',SUPABASE_URL:'https://x.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'k'} as any;
const p='2026-10/'+'a'.repeat(64)+'.jpg';
const ok=async(u:string)=>u.includes('/rpc/')?new Response(JSON.stringify([{id:'2026-10-20-lop',kind:'tai-lop',title:'T',date:'2026-10-20',summary:'',place:null,pinned:false,photos:[{path:p,alt:'a',width:1,height:1}]}])):new Response(JSON.stringify([{path:p,signedURL:'/object/sign/x?token=1'}]));
const bad=async()=>new Response('x',{status:500});
const out:string[]=[];
const run=async(env:any,t:any,cookie='')=>{let out:any;await createBoardApi(()=>env,t)({method:'POST',headers:{origin:'https://minhthanhmath.vn',host:'minhthanhmath.vn',cookie}},{setHeader(){},status:(n:number)=>({json:(v:any)=>{out=[n,v.public,v.posts?.map((x:any)=>x.id)]}})});return JSON.stringify(out);};
out.push(await run({...base,MTM_BANG_TIN_ENABLED:'1'},ok));
out.push(await run({...base,MTM_BANG_TIN_ENABLED:'1'},bad));
out.push(await run({...base,MTM_BANG_TIN_KEY:'',MTM_BANG_TIN_ENABLED:'1'},bad));
out.push(await run({...base,MTM_BANG_TIN_KEY:''},ok));
assert.match(out[0],/^\[200,true,\["2026-10-20-lop",/);
assert.ok(out[1].startsWith('[200,true,[')&&!out[1].includes('2026-10-20-lop'));
assert.equal(out[2],'[503,null,null]');
assert.equal(out[3],'[401,null,null]');
console.log('bang-tin zalo ok');
