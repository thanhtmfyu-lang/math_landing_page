import assert from 'node:assert/strict';
import {lessonUploadRoutePlugin} from '../scripts/lesson-upload-route.mjs';
const plugin=lessonUploadRoutePlugin(),files:any[]=[];
const html='<!doctype html><script type="module" src="/assets/app-hash.js"></script>';
plugin.generateBundle.handler.call({emitFile:(file:any)=>files.push(file)},null,{'index.html':{type:'asset',source:html}});
assert.deepEqual(files,[{type:'asset',fileName:'quan-tri/len-bai/index.html',source:html}]);
assert.throws(()=>plugin.generateBundle.handler.call({emitFile:()=>{}},null,{}));
assert.equal(plugin.apply,'build');
console.log('Static portal entry retains absolute hashed bundle links and fails closed without SPA entry.');
