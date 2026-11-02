// Actual React screens in Chrome, with synthetic Auth/RPC/mail adapters; all external network is blocked.
import {createServer} from 'vite';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
const output=resolve(process.argv[2]||'.qa-temp/staff-password-ui');mkdirSync(output,{recursive:true});
const root=resolve('.'),cache=join(root,'.qa-temp/staff-password-ui-cache');
const harness=`import React from 'react';import {createRoot} from 'react-dom/client';import {HelmetProvider} from 'react-helmet-async';import {StaffResetPanel} from '/src/native/lesson-upload/StaffPasswords.tsx';import LessonUploadPortal from '/src/native/lesson-upload/LessonUploadPortal.tsx';
window.__passwordCalls=[];window.__changed=false;window.__dashboardReads=0;
createRoot(document.getElementById('root')).render(React.createElement(HelmetProvider,null,new URLSearchParams(location.search).get('mode')==='manager'?<div className="lu-root"><h1>Nhân sự thử · dữ liệu tổng hợp</h1><StaffResetPanel owner="fixture-owner"/></div>:<LessonUploadPortal/>));`;
const adminMock=`const client={auth:{getUser:async()=>({data:{user:{id:'fixture-owner'}}}),getSession:async()=>({data:{session:{user:{id:'fixture-owner'},access_token:'fixture',refresh_token:'fixture'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})}};export function backend(){return client;}export const requireBackend=backend;`;
const passwordMock=`export async function passwordProfile(owner){return {user_id:owner,short_name:'fixture',display_name:'Nhân sự thử',role:'gv',must_change_password:!window.__changed};}
export async function changeStaffPassword(owner,password){window.__passwordCalls.push({action:'change',owner,length:password.length});window.__changed=true;return passwordProfile(owner);}
export async function staffRoster(){return [{user_id:'fixture-target',display_name:'Giáo viên thử',short_name:'gv-thu',role:'gv',must_change_password:true,recovery_ready:true}];}
export async function requestStaffReset(owner,target){window.__passwordCalls.push({action:'reset',owner,target});return 'Máy chủ đã nhận yêu cầu gửi email đặt lại cho nhân sự.';}
export async function acceptPasswordRecovery(){throw Error('No real recovery tokens in UI QA');}`;
const mock=`export class StaffAccessError extends Error{};export async function lessonDashboard(owner){window.__dashboardReads++;return {staff:{user_id:owner,short_name:'fixture',display_name:'Nhân sự thử',role:'gv'},teachers:[],sessions:[],uploads:[],week_start:'2026-11-02',week_end:'2026-11-08'};}export async function staffSignIn(){throw Error('No cloud QA');}export async function uploadLessonFile(){throw Error('No cloud QA');}export async function submitLesson(){throw Error('No cloud QA');}`;
let server,chrome,ws;const report={localOnly:true,syntheticOnly:true,cloudCalls:false,shots:[],checks:[],errors:[]};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 server=await createServer({cacheDir:cache,server:{host:'127.0.0.1',port:5269,strictPort:true,open:false,fs:{allow:[root,realpathSync(join(root,'node_modules'))]},watch:{ignored:['**/.qa-temp/**','**/build/**']}},plugins:[{name:'lesson-upload-local-qa',enforce:'pre',configureServer(s){s.middlewares.use('/__qa-lesson-upload',async(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/__qa-lesson-upload','<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/qa-lesson-upload.jsx"></script></html>'));});},resolveId(id){if(id==='/qa-lesson-upload.jsx')return '\0lesson-upload-qa.jsx';},load(id){if(id==='\0lesson-upload-qa.jsx')return harness;},transform(code,id){const path=id.split('?')[0].replaceAll('\\','/');if(path.endsWith('/src/native/lesson-upload/backend.ts'))return {code:mock,map:null};if(path.endsWith('/src/native/lesson-upload/password.ts'))return {code:passwordMock,map:null};if(path.endsWith('/src/native/admin/backend.ts'))return {code:adminMock,map:null};}}]});await server.listen();
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--disable-background-networking','--disable-extensions','--hide-scrollbars','--remote-debugging-address=127.0.0.1','--remote-debugging-port=9469',`--user-data-dir=${join(root,'.qa-temp/staff-password-chrome')}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 let target;for(let i=0;i<70;i++){try{target=(await(await fetch('http://127.0.0.1:9469/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await pause(150);}if(!target)throw Error('Chrome CDP unavailable');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));let sequence=0;const pending=new Map();
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const pageErrors=[];
 ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);if(p){pending.delete(d.id);d.error?p.reject(Error(JSON.stringify(d.error))):p.resolve(d.result);}}else if(d.method==='Runtime.exceptionThrown'){pageErrors.push(d.params.exceptionDetails?.exception?.description||d.params.exceptionDetails?.text||'exception');}else if(d.method==='Fetch.requestPaused'){const {requestId,request}=d.params;const local=/^http:\/\/127\.0\.0\.1:5269\//.test(request.url);void send(local?'Fetch.continueRequest':'Fetch.failRequest',local?{requestId}:{requestId,errorReason:'BlockedByClient'});if(!local)report.errors.push({externalBlocked:new URL(request.url).origin});}});
 const evaluate=async(code)=>{const r=await send('Runtime.evaluate',{expression:`(async()=>{${code}})()`,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||'Browser evaluation failed');return r.result.value;};
 const check=(name,ok,detail)=>{report.checks.push({name,ok:!!ok,detail});if(!ok)throw Error(name);};
 const wait=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate('return !!('+expression+')'))return;await pause(150);}report.diagnostic=await evaluate('return {body:document.body.innerText.slice(0,800),changed:window.__changed,calls:window.__passwordCalls,reads:window.__dashboardReads,alerts:[...document.querySelectorAll("[role=alert],[role=status]")].map(n=>n.textContent)}');report.diagnostic.pageErrors=pageErrors.slice(0,4);console.error(JSON.stringify(report.diagnostic));const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(output,'diagnostic.png'),Buffer.from(shot.data,'base64'));throw Error('UI wait timeout: '+expression);};
 await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
 for(const mode of ['portal','manager'])for(const width of [390,1366]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
  await send('Page.navigate',{url:`http://127.0.0.1:5269/__qa-lesson-upload?mode=${mode}`});await wait(mode==='portal'?"document.querySelector('input[autocomplete=new-password]')":"document.querySelector('tbody button')");await pause(200);
  check(`${mode}-${width}: no horizontal overflow`,await evaluate('return document.documentElement.scrollWidth<=innerWidth+1'));
  if(mode==='portal'){
   check(`${mode}-${width}: locked before dashboard RPC`,await evaluate('return window.__dashboardReads===0&&!document.querySelector(".lu-summary")'));
   const change=`const change=(e,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));};const inputs=document.querySelectorAll('input[type=password]');`;
   await evaluate(change+"change(inputs[0],'synthetic-QA-password');change(inputs[1],'different-QA-password');");await pause(100);await evaluate("document.querySelector('form').requestSubmit()");await wait("document.querySelector('[role=alert]')");
   check(`${mode}-${width}: mismatch does not write Auth`,await evaluate('return window.__passwordCalls.length===0'));
   await evaluate(change+"change(inputs[1],'synthetic-QA-password');");await pause(100);await evaluate("document.querySelector('form').requestSubmit()");await wait("document.querySelector('.lu-summary')");
   check(`${mode}-${width}: dashboard opens only after confirmed change`,await evaluate("return window.__dashboardReads===1&&window.__passwordCalls.length===1&&window.__passwordCalls[0].owner==='fixture-owner'&&!document.querySelector('input[type=password]')"));
  }else{
   check(`${mode}-${width}: no password or recipient input`,await evaluate("return !document.querySelector('input')&&document.querySelector('tbody').innerText.includes('Đặt lại mật khẩu')"));
   await evaluate("document.querySelector('tbody button').click()");await wait("document.querySelector('[role=status]')?.textContent.includes('đã nhận yêu cầu')");
   check(`${mode}-${width}: reset targets selected staff only`,await evaluate("return window.__passwordCalls.length===1&&window.__passwordCalls[0].target==='fixture-target'&&window.__passwordCalls[0].owner==='fixture-owner'"));
  }
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}),file=`password-v2-${mode}-${width}.png`;writeFileSync(join(output,file),Buffer.from(shot.data,'base64'));report.shots.push({mode,width,file});
 }
 report.passed=true;console.log(JSON.stringify({passed:true,checks:report.checks.length,shots:report.shots.length,output}));
}catch(error){report.passed=false;report.errors.push({message:error.message});console.error(error.message);process.exitCode=1;}
finally{writeFileSync(join(output,'password-ui-qa.json'),JSON.stringify(report,null,2)+'\n');try{ws?.close();}catch{}chrome?.kill();await server?.close();}
