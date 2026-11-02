import assert from 'node:assert/strict';
import {lessonUploadRoutePlugin} from '../scripts/lesson-upload-route.mjs';
import {routeMetadata} from '../src/migration/route-policy';
const plugin=lessonUploadRoutePlugin(),files:any[]=[];
const html='<!doctype html><script type="module" src="/assets/app-hash.js"></script>';
plugin.generateBundle.handler.call({emitFile:(file:any)=>files.push(file)},null,{'index.html':{type:'asset',source:html}});
assert.deepEqual(files,['quan-tri/len-bai/index.html','quan-tri/index.html','quan-tri/doi-mat-khau/index.html'].map(fileName=>({type:'asset',fileName,source:html})));
assert.throws(()=>plugin.generateBundle.handler.call({emitFile:()=>{}},null,{}));
assert.equal(plugin.apply,'build');
for(const [path,title] of [['/quan-tri','Quản trị nhân sự'],['/quan-tri/doi-mat-khau','Đặt lại mật khẩu nhân sự'],['/quan-tri/len-bai','Lên bài buổi học']]){
 const meta=routeMetadata(path,'minhthanhmath.vn');
 assert.equal(meta.known,true);assert.equal(meta.robots,'noindex, nofollow');assert.match(meta.title,new RegExp(title));
}
console.log('Static portal entry retains absolute hashed bundle links and fails closed without SPA entry.');
