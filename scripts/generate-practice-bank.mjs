import {readFileSync, mkdirSync, writeFileSync, readdirSync, unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
export function generatePracticeBank() {
  const root=fileURLToPath(new URL('../src/native/chapters/',import.meta.url));
  const out=join(root,'generated-bank');mkdirSync(out,{recursive:true});
  const read=name=>JSON.parse(readFileSync(join(root,name+'.json'),'utf8'));
  const current=[...read('practice-tests'),...read('exact-tests'),...read('probability-tests')];
  const ids=new Set(current.map(p=>p.exam.id));
  if(ids.size!==current.length)throw new Error('ID đề hiện hành bị trùng');
  const archived=read('archived-tests').filter(p=>!ids.has(p.exam.id));
  const rows=[...current,...archived], kept=new Set(['index.ts']);
  const imports=[],metadata=[];
  rows.forEach((p,i)=>{
    const name='exam-'+i+'.json';kept.add(name);
    const content=JSON.stringify(p);
    // Không ghi lại tệp giống nhau: dev không bị vòng lặp HMR.
    try{if(readFileSync(join(out,name),'utf8')!==content)writeFileSync(join(out,name),content);}catch{writeFileSync(join(out,name),content);}
    imports.push(`${JSON.stringify(p.exam.id)}:()=>import('./${name}').then(m=>m.default as unknown as PracticeItem)`);
    metadata.push([p.exam.id,{track:p.track,chapter:p.chapter,archived:i>=current.length}]);
  });
  for(const f of readdirSync(out))if(!kept.has(f)&&/^exam-\d+\.json$/.test(f))unlinkSync(join(out,f));
  const index=`// Sinh bởi scripts/generate-practice-bank.mjs; không sửa tay.\nimport type {PracticeItem} from '../practice-shared';\nexport const metadata:Record<string,{track:string;chapter:string;archived:boolean}>=${JSON.stringify(Object.fromEntries(metadata))};\nexport const loaders:Record<string,()=>Promise<PracticeItem>>={${imports.join(',\n')}};\n`;
  try{if(readFileSync(join(out,'index.ts'),'utf8')!==index)writeFileSync(join(out,'index.ts'),index);}catch{writeFileSync(join(out,'index.ts'),index);}
  console.log(`KT06: sinh ${current.length} đề hiện hành + ${archived.length} đề lưu trữ.`);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===fileURLToPath(new URL('file:///'+process.argv[1].replaceAll('\\','/'))))generatePracticeBank();
