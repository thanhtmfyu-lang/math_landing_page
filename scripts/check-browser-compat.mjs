import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
const forbidden=['(?<'+'=','(?<'+'!'];
const bad=files('src').filter(f=>/\.[cm]?[jt]sx?$/.test(f)&&forbidden.some(s=>readFileSync(f,'utf8').includes(s)));
if(process.argv.includes('--build')){
  for(const file of files('build/assets').filter(f=>/\.(?:js|mjs)$/.test(f))){
    const source=readFileSync(file,'utf8');
    const legacy=/pdf|QuestionPdf|NativePdfReader|PrivatePdf|PdfInput/.test(file)&&/getOrInsertComputed/.test(source)&&/withResolvers/.test(source)&&/core-js|__core-js_shared__/.test(source);
    if(forbidden.some(s=>source.includes(s))||(!legacy&&/getOrInsertComputed|Promise\.try|withResolvers/.test(source)))bad.push(file);
  }
}
if(bad.length){console.error('Unsupported browser syntax/API:',bad);process.exit(1);}
console.log('Browser compatibility scan passed'+(process.argv.includes('--build')?' (source + build)':' (source)'));
