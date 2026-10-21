// Hồ sơ công khai: toàn bộ fixture là dữ liệu tổng hợp, không dùng hồ sơ học sinh thật.
import assert from 'node:assert/strict';
import {publicRankRow} from '../server/btvn/rank-row';
import {createRankApi} from '../api/xep-hang';
import {createMyRankApi} from '../server/btvn/my-rank-api';
import {handleAvatar,PHOTO_MAX_CHARS,validPhoto,type AvatarRecord,type AvatarRepository} from '../server/btvn/avatar-http';

const jpeg=(width=192,height=192)=>Buffer.from([0xff,0xd8,0xff,0xc0,0,0x11,8,height>>8,height&255,width>>8,width&255,3,1,0x22,0,2,0x11,1,3,0x11,1,0xff,0xda,0,0x0c,3,1,0,2,0x11,3,0x11,0,0x3f,0,0x12,0x34,0xff,0xd9]);
const PHOTO='data:image/jpeg;base64,'+jpeg().toString('base64');
const largeJpeg=Buffer.concat([jpeg().subarray(0,-2),Buffer.alloc(30000,0x12),Buffer.from([0xff,0xd9])]);
const LARGE_PHOTO='data:image/jpeg;base64,'+largeJpeg.toString('base64');
const row={rank:1,fullName:'Học sinh mẫu',className:'2K9 9+',school:'Trường thử nghiệm',avatar:'spark',photo:PHOTO,score:8.25,submitted:2,total:3};
assert.equal(PHOTO_MAX_CHARS,40000);
assert.deepEqual(publicRankRow({...row,phone:'PRIVATE-PHONE',studentId:'PRIVATE-ID',studentCode:'PRIVATE-CODE',photo_hidden:false}),row);
assert.deepEqual(Object.keys(publicRankRow(row)).sort(),['rank','fullName','className','school','avatar','photo','score','submitted','total'].sort());
for(const school of [undefined,null,'','   ','Chưa cập nhật',' chưa cập nhật ','Chua cap nhat',' CHUA   CAP NHAT ','CHƯA CẬP NHẬT'])assert.equal(publicRankRow({...row,school}).school,null);
assert.equal(publicRankRow({...row,school:'  Trường   mẫu  '}).school,'Trường mẫu');
assert.equal(publicRankRow({...row,avatar:undefined,photo:undefined}).avatar,null);
assert.equal(publicRankRow({...row,avatar:null,photo:null}).photo,null);
assert.equal(publicRankRow({...row,photo:''}).photo,null);
assert.equal(publicRankRow({...row,photo_hidden:true}).photo,null,'ẩn ảnh tại phép chiếu, không lộ cờ nội bộ');
assert.ok(LARGE_PHOTO.length>40000);
assert.equal(publicRankRow({...row,photo:LARGE_PHOTO}).photo,null,'ảnh cũ quá trần chỉ bỏ ảnh, giữ bảng');
for(const bad of [
  {...row,school:1},{...row,school:'x'.repeat(161)},{...row,school:'Trường\u0000mẫu'},
  {...row,avatar:'https://fixture.invalid/a.svg'},{...row,avatar:{}},
  {...row,photo:123},{...row,photo:'https://fixture.invalid/a.jpg'},
  {...row,photo:'data:image/svg+xml;base64,PHN2Zy8+'},{...row,photo:'data:image/jpeg;base64,'+jpeg(191).toString('base64')},
  {...row,photo:PHOTO+' '},{...row,photo_hidden:'false'},
])assert.throws(()=>publicRankRow(bad));
assert.equal(validPhoto(PHOTO),true);assert.equal(validPhoto(LARGE_PHOTO),false,'ảnh đúng cấu trúc nhưng quá lớn vẫn bị chặn');

const env={MTM_RANK_ENABLED:'1',MTM_BTVN_ENABLED:'1',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'SERVICE-FIXTURE'};
const privateFields={phone:'PRIVATE-PHONE',studentId:'PRIVATE-ID',studentCode:'PRIVATE-CODE',profileKey:'PRIVATE-PROFILE',photo_hidden:false};
async function invoke(handler:any,method:string){
 const result:{status:number;headers:Record<string,string>;body:any}={status:0,headers:{},body:null};
 await handler({method,query:{khoi:'2K9',loai:'btvn-tuan'},body:{khoi:'2K9',loai:'btvn-tuan'},headers:{origin:'https://minhthanhmath.vn',host:'minhthanhmath.vn',cookie:'mtm_btvn_demo='+'a'.repeat(64)}},
  {setHeader:(k:string,v:string)=>result.headers[k]=v,status:(n:number)=>{result.status=n;return{json:(body:any)=>result.body=body};}});
 return result;
}
const top=await invoke(createRankApi(()=>env,async()=>new Response(JSON.stringify([{...row,...privateFields}]))),'GET');
assert.equal(top.status,200);assert.deepEqual(top.body.rows,[row]);assert.equal(top.headers['Cache-Control'],'no-store');
const own=await invoke(createMyRankApi(()=>env,async()=>new Response(JSON.stringify({...row,...privateFields,rank:27}))),'POST');
assert.equal(own.status,200);assert.deepEqual(own.body.row,{...row,rank:27});assert.match(own.headers['Cache-Control'],/no-store/);
for(const payload of [top.body,own.body])assert.doesNotMatch(JSON.stringify(payload),/PRIVATE-|SERVICE-FIXTURE|phone|studentId|studentCode|profileKey|photo_hidden/);
const broken=await invoke(createRankApi(()=>env,async()=>new Response(JSON.stringify([{...row,school:'x'.repeat(161)}]))),'GET');
assert.equal(broken.status,503);assert.equal(broken.headers['Cache-Control'],'no-store');

// Học sinh không được tự sửa cờ ẩn. Server bỏ ảnh khi kho trả cờ giao vụ ẩn.
const record:AvatarRecord={profileKey:'00000000-0000-4000-8000-000000000001',revision:3,school:'Trường mẫu',appearance:{avatar:'spark',photo:PHOTO},photoHidden:true};
let saves=0;
const repo:AvatarRepository={read:async()=>record,save:async()=>{saves++;return record;}};
const call=(body:unknown,repository=repo)=>handleAvatar(repository,{method:'POST',origin:'https://fixture.invalid',host:'fixture.invalid',secure:true,cookie:'mtm_btvn_demo='+'a'.repeat(64),body});
let result=await call({action:'read'});assert.equal(result.status,200);assert.equal((result.body as AvatarRecord).photoHidden,true);assert.equal((result.body as AvatarRecord).appearance.photo,'');
for(const extra of [{photo_hidden:false},{photoHidden:false}]){
 result=await call({action:'save',revision:3,expectedProfileKey:record.profileKey,school:'Trường mẫu',appearance:{avatar:'spark',photo:''},...extra});
 assert.equal(result.status,400);
}
assert.equal(saves,0);
result=await call({action:'read'},{...repo,read:async()=>({...record,photoHidden:'true'} as any)});assert.equal(result.status,503,'cờ ẩn sai kiểu không được lọt ra');
console.log('Đạt hồ sơ công khai API: school/avatar/photo, own ngoài top 10, whitelist, JPEG 192 nhẹ, no-store và cờ ẩn chỉ giao vụ.');
