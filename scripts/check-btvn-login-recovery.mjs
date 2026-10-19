// Kiểm trình duyệt thật với hồ sơ tổng hợp, chặn mọi API BTVN trước khi tới máy chủ.
// Chạy sau npm run build -- --outDir .qa-temp/btvn-login-build.
// --url kiểm cùng luồng trên bản public mà không ghi kho, --width đổi viewport.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {preview} from 'vite';
const root=resolve('.'),args=process.argv.slice(2),urlIndex=args.indexOf('--url');
const widthIndex=args.indexOf('--width'),width=widthIndex>=0?Number(args[widthIndex+1]):390;
assert.ok(Number.isInteger(width)&&width>=360&&width<=1920,'Viewport phải từ 360 đến 1920');
const output=resolve('.qa-temp',(urlIndex>=0?'btvn-login-public-':'btvn-login-local-')+width);mkdirSync(output,{recursive:true});
const profile=join(output,'chrome-'+Date.now());mkdirSync(profile);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let server,chrome,ws;const pending=new Map();let id=0,mode='setup';
const report={at:new Date().toISOString(),syntheticOnly:true,allBtvnApiIntercepted:true,interceptedPaths:[],requests:[],checks:[],browserErrors:[]};
async function waitFor(check,label){for(let n=0;n<100;n++){if(await check())return;await sleep(50);}throw Error('Quá thời gian chờ: '+label);}
try{
 if(urlIndex<0)server=await preview({root,build:{outDir:'.qa-temp/btvn-login-build'},preview:{host:'127.0.0.1',port:5319,strictPort:true,open:false}});
 const url=urlIndex>=0?args[urlIndex+1]:'http://127.0.0.1:5319/btvn';report.url=url;
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){try{port=Number(readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch{await sleep(100);}}assert.ok(port,'Chrome phải mở cổng CDP');
 const pages=await fetch('http://127.0.0.1:'+port+'/json').then(r=>r.json());ws=new WebSocket(pages.find(x=>x.type==='page').webSocketDebuggerUrl);
 await new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=no;});
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
 ws.onmessage=async event=>{
  const data=JSON.parse(event.data);if(data.id){const p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(Error(JSON.stringify(data.error))):p.resolve(data.result);}return;}
  if(data.method==='Runtime.exceptionThrown')report.browserErrors.push(data.params.exceptionDetails.text);
  if(data.method==='Fetch.requestPaused'){
   const {requestId,request}=data.params,path=new URL(request.url).pathname;report.interceptedPaths.push(path);
   if(path!=='/api/btvn'){await cdp('Fetch.fulfillRequest',{requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from('{}').toString('base64')});return;}
   const body=JSON.parse(request.postData||'{}');report.requests.push(body);let status=200,result={};
   if(body.action==='classes')result={classNames:['LỚP KIỂM UI']};
   else if(body.action==='state'){status=401;result={message:'Không thể vào bài.'};}
   else if(body.action==='login'){
    if(mode==='network'){await cdp('Fetch.failRequest',{requestId,errorReason:'ConnectionFailed'});return;}
    if(mode==='wrong'){status=422;result={message:'Sai mã PIN. Em còn 4 lần thử trước khi bị khoá 15 phút.'};}
    else if(mode==='phone'){status=422;result={message:'Số điện thoại chưa khớp hồ sơ lớp nên chưa tạo được mã PIN.'};}
    else if(mode==='code'){status=401;result={message:'Không thể vào bài.'};}
    else if(mode==='weak'||body.gate?.newPin==='123456'){status=422;result={message:'Mã PIN quá dễ đoán. Em chọn 6 số khác, không dùng 123456 hay 6 số giống nhau.'};}
    else{status=428;result={message:mode==='required'?'PIN_REQUIRED':'PIN_SETUP'};}
   }
   await cdp('Fetch.fulfillRequest',{requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json; charset=utf-8'}],body:Buffer.from(JSON.stringify(result)).toString('base64')});
  }
 };
 const evaluate=async expression=>{const out=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(out.exceptionDetails)throw Error(out.exceptionDetails.text);return out.result.value;};
 await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Fetch.enable',{patterns:[{urlPattern:'*/api/*',requestStage:'Request'}]});
 await cdp('Emulation.setDeviceMetricsOverride',{width,height:width<768?844:1000,deviceScaleFactor:1,mobile:width<768});await cdp('Page.navigate',{url});
 const form='form[aria-labelledby="btvn-identity-title"]',code='form[aria-labelledby="btvn-code-title"]';
 for(let i=0;i<150;i++){if(await evaluate("Boolean(document.querySelector('form[aria-labelledby=\"btvn-identity-title\"] select option[value=\"LỚP KIỂM UI\"]'))"))break;await sleep(100);}
 async function set(selector,value){await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));if(el instanceof HTMLSelectElement)el.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(40);}
 async function click(selector=form,expectRequest=false){const count=report.requests.length;await evaluate(`document.querySelector(${JSON.stringify(selector+' button[type=submit]')}).click()`);if(expectRequest)await waitFor(()=>report.requests.length>count,'request đăng nhập');await waitFor(()=>evaluate(`!document.querySelector(${JSON.stringify(selector+' button[type=submit]')}).disabled`),'nút hoàn tất xử lý');await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');}
 const logins=()=>report.requests.filter(x=>x.action==='login');
 async function check(name,expression,expected){const actual=await evaluate(expression);assert.deepEqual(actual,expected,name);report.checks.push({name,pass:true,actual});}
 await click(code);await check('Thiếu mã có thông báo sát nút',`document.querySelector(${JSON.stringify(code+' button[type=submit]')}).previousElementSibling.textContent`,'Em nhập mã học sinh do MTM cấp riêng cho em.');assert.equal(logins().length,0);
 await click();await check('Thiếu họ tên có thông báo',`document.querySelector(${JSON.stringify(form+' [role=alert]')}).textContent`,'Em nhập họ tên học sinh hoặc phụ huynh đã đăng ký với MTM.');
 await set(form+' input[type=text]','Học Sinh Kiểm Thử');await click();await check('Thiếu điện thoại có thông báo',`document.querySelector(${JSON.stringify(form+' [role=alert]')}).textContent`,'Em nhập số điện thoại đã đăng ký với lớp.');
 await set(form+' input[type=tel]','0000000000');await click();await check('Chưa chọn lớp có thông báo',`document.querySelector(${JSON.stringify(form+' [role=alert]')}).textContent`,'Em chọn lớp đang học trước khi vào bài.');
 await set(form+' select','LỚP KIỂM UI');await set('[name=btvn-pin]','abcdef');await click();await check('PIN 6 ký tự không phải số có thông báo',`document.querySelector(${JSON.stringify(form+' button[type=submit]')}).previousElementSibling.textContent`,'Mã PIN phải gồm đúng 6 chữ số từ 0 đến 9.');assert.equal(logins().length,0);
 await set('[name=btvn-pin]','123');await click();await check('PIN thiếu số có thông báo',`document.querySelector(${JSON.stringify(form+' [role=alert]')}).textContent`,'Mã PIN phải gồm đúng 6 chữ số từ 0 đến 9.');assert.equal(logins().length,0);
 await check('Form không tràn ngang',"document.documentElement.scrollWidth<=innerWidth",true);
 await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(r=>writeFileSync(join(output,'pin-invalid.png'),Buffer.from(r.data,'base64')));
 await set('[name=btvn-pin]','482937');await click(form,true);assert.equal(logins().length,1);assert.equal(logins()[0].gate.pin,'482937');await check('PIN_SETUP hiện đủ 2 ô tạo mã',"document.querySelectorAll('[name^=btvn-new-pin]').length",2);
 await set('[name=btvn-new-pin]','482937');await set('[name=btvn-new-pin-2]','482938');await click();assert.equal(logins().length,1);await check('Xác nhận lệch có thông báo',`document.querySelector(${JSON.stringify(form+' [role=alert]')}).textContent`,'Hai lần nhập mã PIN chưa giống nhau.');
 await set('[name=btvn-new-pin-2]','482937');await click(form,true);assert.equal(logins().length,2);assert.equal(logins()[1].gate.newPin,'482937');await check('Sửa xác nhận xong gửi lại được',"document.querySelector('[name=btvn-new-pin-2]').validity.customError",false);
 await set('[name=btvn-new-pin]','123456');await set('[name=btvn-new-pin-2]','123456');await click(form,true);assert.equal(logins().length,3);await check('PIN yếu vẫn giữ form tạo PIN',"document.querySelectorAll('[name^=btvn-new-pin]').length",2);await check('PIN yếu có thông báo máy chủ',`document.querySelector(${JSON.stringify(form+' [role=alert]')}).textContent.includes('quá dễ đoán')`,true);
 await set('[name=btvn-new-pin]','682947');await set('[name=btvn-new-pin-2]','682947');await click(form,true);assert.equal(logins().length,4);assert.equal(logins()[3].gate.newPin,'682947');report.checks.push({name:'Đổi PIN yếu sang mã khác gửi đúng newPin',pass:true});
 mode='required';await click(form,true);await check('PIN_REQUIRED trở lại ô nhập PIN',"Boolean(document.querySelector('[name=btvn-pin]'))",true);await check('PIN_REQUIRED bỏ form tạo PIN',"document.querySelectorAll('[name^=btvn-new-pin]').length",0);
 await set('[name=btvn-pin]','482937');
 for(const [serverMode,text] of [['weak','quá dễ đoán'],['wrong','Sai mã PIN'],['phone','Số điện thoại chưa khớp'],['network','Chưa kết nối được máy chủ']]){
  mode=serverMode;await click(form,true);await check(serverMode+': thông báo sát nút đúng form',`(()=>{const b=document.querySelector(${JSON.stringify(form+' button[type=submit]')}),p=b.previousElementSibling;return p.getAttribute('role')==='alert'&&p.textContent.includes(${JSON.stringify(text)});})()`,true);
  await check(serverMode+': thông báo nhìn thấy trong viewport',`(()=>{const p=document.querySelector(${JSON.stringify(form+' [role=alert]')}),r=p.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})()`,true);
 }
 await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}).then(r=>writeFileSync(join(output,'server-notice-visible.png'),Buffer.from(r.data,'base64')));
 mode='code';await set(code+' input','0123456789abcdef0123456789abcdef');await click(code,true);await check('Lỗi mã hiển thị đúng form Có mã',`(()=>{const p=document.querySelector(${JSON.stringify(code+' button[type=submit]')}).previousElementSibling;return p.getAttribute('role')==='alert'&&p.textContent.includes('Chưa khớp danh sách lớp');})()`,true);
 assert.ok(report.interceptedPaths.includes('/api/btvn'));assert.ok(report.interceptedPaths.every(path=>path==='/api/btvn'));report.checks.push({name:'Mọi API bị chặn, chỉ có đúng endpoint BTVN dự kiến',pass:true});
 assert.deepEqual(report.browserErrors,[]);report.checks.push({name:'Không lỗi JavaScript trong trình duyệt',pass:true});
 report.allPass=true;console.log(JSON.stringify({checks:report.checks.length,allPass:true,requests:report.requests.length,output},null,2));await cdp('Browser.close');
}catch(error){report.allPass=false;report.error=error.stack;throw error;}
finally{writeFileSync(join(output,'receipt.json'),JSON.stringify(report,null,2));ws?.close();chrome?.kill();server?.httpServer.close();}
