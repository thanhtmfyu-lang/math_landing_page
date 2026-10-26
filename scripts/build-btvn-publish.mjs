// Bundle nhỏ, thuần logic validator/handler, không env/mạng/credential.
import {build} from 'esbuild';
import {resolve} from 'node:path';
// The publisher validates the exam in the authenticated request. It does not
// need catalog fixtures; keep real keys out of the public generated bundle.
const privateFixtures=new Set(['src/native/exams/catalog.json','src/native/exams/detailed-solutions.json'].map(p=>resolve(p)));
await build({entryPoints:['server/btvn/publish-handler.ts'],outfile:'supabase/functions/mtm-btvn-publish/handler.generated.js',bundle:true,platform:'neutral',format:'esm',target:'es2022',treeShaking:true,logLevel:'warning',plugins:[{
 name:'publisher-without-private-fixtures',setup(plugin){plugin.onLoad({filter:/(catalog|detailed-solutions)\.json$/},args=>privateFixtures.has(resolve(args.path))?{contents:'[]',loader:'json'}:null);},
}]});
console.log('Đã dựng handler Edge từ validator nguồn; chưa deploy.');
