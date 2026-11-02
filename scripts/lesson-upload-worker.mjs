// Explicit finite invocation only. Hook into the existing VPS single worker, not a second cron.
import {build} from 'esbuild';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {isAbsolute} from 'node:path';
import {createClient} from '@supabase/supabase-js';

export async function main(args=process.argv.slice(2),env=process.env){
 if(args[0]!=='--once'||args.length>2||args.length===2&&args[1]!=='--is-test')throw Error('EXPLICIT_ONCE_REQUIRED');
 const adapterPath=env.MTM_LESSON_UPLOAD_ADAPTER,stateDir=env.MTM_LESSON_UPLOAD_STATE_DIR;
 if(!adapterPath||!isAbsolute(adapterPath)||!stateDir||!isAbsolute(stateDir))throw Error('VPS_ADAPTER_CONFIG_REQUIRED');
 const gateway=env.BTVN_PUBLISH_URL&&env.BTVN_PUBLISH_SECRET;
 if(!gateway&&(!env.SUPABASE_URL||!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(env.SUPABASE_URL)||!env.SUPABASE_SERVICE_ROLE_KEY))throw Error('SERVICE_CONFIG_REQUIRED');
 // Build repo TS in memory; secret/config files are never bundled or printed.
 const bundle=await build({stdin:{contents:"export {runUploadOnce} from './server/lesson-upload/worker';export {createWorkerRepository} from './server/lesson-upload/supabase-worker';export {createPrivateFileState} from './server/lesson-upload/private-state';export {createLessonGatewayClient} from './server/lesson-upload/publisher-client';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',target:'node20',logLevel:'silent',packages:'external'});
 const {runUploadOnce,createWorkerRepository,createPrivateFileState,createLessonGatewayClient}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 const adapter=await import(pathToFileURL(adapterPath).href);
 if(typeof adapter.createLessonUploadPipeline!=='function')throw Error('VPS_ADAPTER_REQUIRED');
 const db=gateway?createLessonGatewayClient(env.BTVN_PUBLISH_URL,env.BTVN_PUBLISH_SECRET):createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const pipeline=await adapter.createLessonUploadPipeline({db});
 const result=await runUploadOnce(createWorkerRepository(db,{isTest:args.includes('--is-test')}),pipeline,createPrivateFileState(stateDir),env.MTM_LESSON_UPLOAD_WORKER_ID??'vps-lesson-upload');
 // Status/code only: no answer/provider raw response/DB row/URL/secret.
 console.log(JSON.stringify({status:result.status,...('code' in result?{code:result.code}:{})}));
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Worker chưa chạy xong; kiểm cấu hình và biên nhận riêng trên VPS.');process.exitCode=1;});
