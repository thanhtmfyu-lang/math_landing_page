// Generate the private seed on T. Never emit the private keys to stdout.
import catalog from '../src/native/exams/catalog.json';
import details from '../src/native/exams/detailed-solutions.json';
import {historyVersions} from '../src/native/exams/practice-errata';
import {writeFileSync} from 'node:fs';
import type {PracticeExam} from '../src/native/exams/data';
const exams=historyVersions(catalog as unknown as PracticeExam[]).map(exam=>{
 const detailed=details.find(d=>d.examId===exam.id&&d.versionHash===exam.versionHash);
 return {...exam,questions:exam.questions.map(q=>({...q,...(detailed?.questions.find(x=>x.id===q.id)?.blocks?{solutionBlocks:detailed.questions.find(x=>x.id===q.id)!.blocks}:{})}))};
});
const sql='begin;\n'+exams.map(e=>`insert into mtm_exam_private.exam_keys(id,exam,static_visible) values('${e.id.replaceAll("'","''")}',convert_from(decode('${Buffer.from(JSON.stringify(e)).toString('base64')}','base64'),'UTF8')::jsonb,true) on conflict(id) do nothing;`).join('\n')+'\ncommit;\n';
if(!process.argv[2])throw Error('Cần đường dẫn tệp seed riêng.');
writeFileSync(process.argv[2],sql);console.log(JSON.stringify({exams:exams.length,questions:exams.reduce((s,e)=>s+e.questions.length,0),bytes:Buffer.byteLength(sql)}));
