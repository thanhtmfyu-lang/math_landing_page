import {build} from 'esbuild';
import {mkdirSync,copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const output='.qa-temp/lesson-upload-adapter-off';mkdirSync(output,{recursive:true});
const privateFixtures=new Set(['src/native/exams/catalog.json','src/native/exams/detailed-solutions.json'].map(p=>resolve(p)));
await build({entryPoints:['tools/lesson-upload/runner.ts'],outfile:output+'/runner.mjs',bundle:true,platform:'node',format:'esm',target:'node20',logLevel:'warning',plugins:[{name:'no-private-fixtures',setup(p){p.onLoad({filter:/(catalog|detailed-solutions)\.json$/},a=>privateFixtures.has(resolve(a.path))?{contents:'[]',loader:'json'}:null);}}]});
const files=['runner.mjs'];for(const file of ['native-driver.py','native-budget.py','btvn-web-upload.py']){copyFileSync('tools/lesson-upload/'+file,output+'/'+file);files.push(file);}
const hashes=Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(output+'/'+file)).digest('hex')]));writeFileSync(output+'/manifest.json',JSON.stringify({enabled:false,auto_poll:false,files:hashes},null,2));console.log(JSON.stringify({output,enabled:false,files:files.length}));
