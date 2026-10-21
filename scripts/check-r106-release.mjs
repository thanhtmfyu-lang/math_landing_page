import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),build=resolve(process.argv[2]??join(root,'build')),checks=[];
const add=(name,pass,evidence)=>{checks.push({name,pass,...(evidence===undefined?{}:{evidence})});};
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
if(!existsSync(join(build,'index.html')))throw Error('Build chưa tồn tại.');
const ui=existsSync(join(build,'mtm-ui-release.json'))?JSON.parse(readFileSync(join(build,'mtm-ui-release.json'),'utf8')):{};
add('build contains approved R106 release metadata',ui.ui==='R106'&&ui.interfaceApproved===true);
const forbidden=/__preview|MTM_R106_PREVIEW|MTM_BTVN_DEMO|preview-scores\.csv|HS-TEST-0[123]|demo-profile|BẢN PREVIEW MTM/;
const leaks=[];
for(const file of walk(build)){
 const name=relative(build,file);
 if(/preview-scores|\.profiles\.json|(?:^|\/)\.env(?:\.|$)|server\/btvn|__preview/.test(name))leaks.push(name);
 if(/\.(?:html|js|mjs|css|json|csv|map)$/.test(file)&&statSync(file).size<30e6&&forbidden.test(readFileSync(file,'utf8')))leaks.push(name);
}
add('production assets contain no R106 preview routes flags synthetic student IDs or score file',leaks.length===0,leaks);
const config=JSON.parse(readFileSync(join(root,'vercel.json'),'utf8'));
add('production preview prefix is routed to terminal404 handler',config.rewrites?.some(r=>r.source==='/__preview/:path*'&&r.destination==='/api/exam?muc=preview-disabled')&&readFileSync(join(root,'server/preview-disabled.ts'),'utf8').includes('res.status(404)'));
add('appearance migration remains pending only',existsSync(join(root,'supabase/migrations-pending/202610170010_student_appearance.sql'))&&!existsSync(join(root,'supabase/migrations/202610170010_student_appearance.sql')));
const priorIgnore=execFileSync('git',['show','origin/main:.vercelignore'],{cwd:root,encoding:'utf8'}).split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')),currentIgnore=readFileSync(join(root,'.vercelignore'),'utf8').split(/\r?\n/).map(s=>s.trim());
add('all existing deployment exclusions remain intact',priorIgnore.every(line=>currentIgnore.includes(line)));
const protectedPaths=['src/native/exams/mtm-scoring.ts','src/native/exams/mtm-assessment.ts','src/native/exams/mtm-profile.ts','src/native/exams/assessment.ts','src/native/exams/store.ts','src/native/exams/usePracticeAttempt.ts','src/native/exams/attempt-types.ts','server/btvn/durable-http.ts','supabase/functions/mtm-homework-access','api/xep-hang.ts','api/xep-hang-cua-em.ts'];
const diff=execFileSync('git',['diff','--name-only','origin/main','--',...protectedPaths],{cwd:root,encoding:'utf8'}).trim();
add('main scoring storage timer self-check contract and ranking backend unchanged',!diff,diff.split('\n').filter(Boolean));
const features=[['src/migration/Guide.tsx','<GuideGraphLauncher'],['src/native/NativeResources.tsx','<ReadingReviewTool'],['src/native/chapters/PracticeLibrary.tsx','IntervalGame'],['src/native/homework/HomeworkSession.tsx','homeworkSelfCheck='],['src/native/exams/FocusRoom.tsx','ref={menuButton}']];
for(const [name,text] of features)add('main feature retained '+name,readFileSync(join(root,name),'utf8').includes(text));
// Exercise the actual config gates, not just a string search. Build stops before bundling.
for(const flag of ['MTM_BTVN_DEMO','MTM_R106_PREVIEW']){
 const env={...process.env,MTM_BTVN_DEMO:'0',MTM_R106_PREVIEW:'0',[flag]:'1'};
 const run=spawnSync(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'build'],{cwd:root,env,encoding:'utf8',timeout:20000});
 add('release build rejects enabled '+flag,run.status!==0&&(run.stdout+run.stderr).includes('trước khi tạo bản phát hành.'));
}
const result={at:new Date().toISOString(),pass:checks.every(c=>c.pass),checks};console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;
