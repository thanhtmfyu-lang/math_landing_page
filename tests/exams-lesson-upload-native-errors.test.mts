import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {CLASS_CONTEXT_CONTRACT,classContextHash} from '../server/lesson-upload/class-context';
import {createLessonUploadPipeline} from '../server/lesson-upload/native-adapter';

// Real local child streams, synthetic sources; no native engine or network.
const parent=join(process.env.MTM_ROOT??process.cwd(),'.qa-temp','driver-public-errors');mkdirSync(parent,{recursive:true});
const area=mkdtempSync(join(parent,'run-')),fd=openSync(join(area,'synthetic.lock'),'w+');
const keys=['BTVN_PYTHON','MTM_LESSON_NATIVE_DRIVER','MTM_LESSON_LOCK_FD'] as const;
const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
const codes=[
 'NATIVE_SOURCE_INVENTORY_REQUIRED','NATIVE_SOURCE_INVENTORY_AMBIGUOUS','NATIVE_SOURCE_INVENTORY_PAGE_UNRESOLVED',
 'NATIVE_SCOPE_UNRESOLVED','NATIVE_SCOPE_REF_MISSING','NATIVE_SCOPE_AMBIGUOUS',
 'NATIVE_EXTRACT_INVENTORY_MISMATCH','NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED',
 'NATIVE_CLASS_METADATA_REQUIRED','NATIVE_CLASS_GRADE_AMBIGUOUS','NATIVE_CLASS_GRADE_CONFLICT',
 'NATIVE_CLASS_GRADE_MISMATCH','NATIVE_CLASS_METADATA_CHANGED',
];
let calls=0,cases=0;
const db={sourceOrigin:'https://example.invalid',async rpc(name:string){calls++;assert.equal(name,'mtm_lesson_upload_source');return {data:{data_base64:Buffer.from('SYNTHETIC_HS').toString('base64')},error:null};}};
const cid='22222222-2222-4222-8222-222222222222';
const job:any={class_ids:[cid],class_names:{[cid]:'Synthetic grade11'},class_dates:{[cid]:'2026-11-10'},class_grades:{[cid]:11},grade_source:'managed_class_catalog',class_grade_complete:true,class_grade_issue:null,lesson_date:'2026-11-10',id:'11111111-1111-4111-8111-111111111111',paper:1,homework_path:'synthetic/hs',answer_path:null,answer_text:'SYNTHETIC_TEACHER_KEY',task_scope:'Câu 1',title:'Synthetic'};
async function invoke(stderr:string,exit=1,stdout=''){
 const file=join(area,'child-'+cases+'.mjs');
 writeFileSync(file,"for await (const ignored of process.stdin) {}\n"+
  "if (['BTVN_PUBLISH_SECRET','BTVN_PUBLISH_URL','SUPABASE_SERVICE_ROLE_KEY'].some(k=>process.env[k]!==undefined)) throw Error('PRIVATE_ENV_NOT_STRIPPED');\n"+
  'process.stderr.write('+JSON.stringify(stderr)+');\nprocess.stdout.write('+JSON.stringify(stdout)+');\nprocess.exitCode='+exit+';\n');
 process.env.BTVN_PYTHON=process.execPath;process.env.MTM_LESSON_NATIVE_DRIVER=file;process.env.MTM_LESSON_LOCK_FD=String(fd);
 cases++;return (await createLessonUploadPipeline({db})).read(job);
}
try{
 for(const code of codes)await assert.rejects(invoke(code+'\n'),(e:any)=>e.message===code);
 for(const raw of ['ValueError\n','SYNTHETIC_PRIVATE_AUTH_TEXT https://private.invalid/key','NATIVE_SCOPE_UNRESOLVED\nSYNTHETIC_PRIVATE_AUTH_TEXT',codes[0]+' '.repeat(300),codes[0]+'\n'+'x'.repeat(65536)]){
  await assert.rejects(invoke(raw),(e:any)=>e.message==='NATIVE_DRIVER_FAILED');
 }
 // A valid-looking stdout must not convert a failed process into success.
 await assert.rejects(invoke('ValueError',1,'{"sourceVersion":"synthetic"}'),(e:any)=>e.message==='NATIVE_DRIVER_FAILED');
 await assert.rejects(invoke('',0,'malformed-json'),(e:any)=>e.message==='NATIVE_DRIVER_FAILED');
 const source='a'.repeat(64),good={sourceVersion:source,class_context_contract:CLASS_CONTEXT_CONTRACT,class_metadata_sha256:classContextHash(job,source),extractor:{provider:'chatgpt-oauth',model:'synthetic'},draft:{exam:{grade:11,questions:[]},assets:[]}};
 assert.equal((await invoke('',0,JSON.stringify(good))).sourceVersion,source);
 assert.equal(calls,cases);
 console.log(`${cases} ca process thật cục bộ: whitelist lỗi nguồn, bounded stderr, không lộ nội dung riêng; không AI/mạng: đạt.`);
}finally{
 for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
 closeSync(fd);
}
