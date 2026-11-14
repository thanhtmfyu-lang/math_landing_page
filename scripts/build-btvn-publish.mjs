// Bundle nhỏ, thuần logic validator/handler, không env/mạng/credential.
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2);
if(args.length>1||args.some(arg=>arg!=='--check'))throw Error('PUBLISH_BUILD_ARGUMENTS_INVALID');
const outfile='supabase/functions/mtm-btvn-publish/handler.generated.js';
// The publisher validates the exam in the authenticated request. It does not
// need catalog fixtures; keep real keys out of the public generated bundle.
const privateFixtures=new Set(['src/native/exams/catalog.json','src/native/exams/detailed-solutions.json'].map(p=>resolve(p)));
const result=await build({entryPoints:['server/btvn/publish-handler.ts'],outfile,write:false,bundle:true,platform:'neutral',format:'esm',target:'es2022',treeShaking:true,logLevel:'warning',plugins:[{
 name:'publisher-without-private-fixtures',setup(plugin){plugin.onLoad({filter:/(catalog|detailed-solutions)\.json$/},args=>privateFixtures.has(resolve(args.path))?{contents:'[]',loader:'json'}:null);},
}]});
const generated=result.outputFiles.find(file=>file.path===resolve(outfile))?.contents;
if(!generated)throw Error('PUBLISH_BUILD_OUTPUT_MISSING');
if(args[0]==='--check'){
 if(!Buffer.from(generated).equals(readFileSync(outfile)))throw Error('PUBLISH_GENERATED_BUNDLE_STALE');
 console.log('Bundle Edge khớp byte với validator nguồn; không ghi tệp hoặc deploy.');
}else{
 writeFileSync(outfile,generated);
 console.log('Đã dựng handler Edge từ validator nguồn; chưa deploy.');
}
