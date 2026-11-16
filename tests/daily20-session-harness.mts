import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pipelineFixture} from './btvn-pipeline-fixture';
import type {HomeworkState} from '../src/native/homework/btvn-contract';
import {createHomeworkSaver} from '../src/native/homework/remote-save';
import {createDraft} from '../src/native/exams/store';

const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json')),{buildSync}=require('esbuild');
const fixture=join(root,'tests/fixtures/doi-ngu-react.mts');
const code=buildSync({entryPoints:[join(root,'src/native/homework/HomeworkSession.tsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',alias:{react:fixture,'react/jsx-runtime':fixture,'react-dom':fixture},loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;
const module={exports:{} as any};new Function('require','module','exports',code)((id:string)=>id.endsWith('.css')?{}:require(id),module,module.exports);
const Session=module.exports.default;
class Runtime{
 slots:any[]=[];index=0;changed=false;effects:(()=>void)[]=[];value:any;
 constructor(private pathname='/btvn'){}
 same(a:any,b:any){return a&&b&&a.length===b.length&&a.every((v:any,i:number)=>Object.is(v,b[i]));}
 state(initial:any){const i=this.index++;if(!this.slots[i])this.slots[i]={value:typeof initial==='function'?initial():initial};return[this.slots[i].value,(v:any)=>{const next=typeof v==='function'?v(this.slots[i].value):v;if(!Object.is(next,this.slots[i].value)){this.slots[i].value=next;this.changed=true;}}];}
 ref(value:any){const i=this.index++;return this.slots[i]??(this.slots[i]={current:value});}
 memo(fn:()=>any,deps:any){const i=this.index++;if(!this.slots[i]||!this.same(this.slots[i].deps,deps))this.slots[i]={value:fn(),deps};return this.slots[i].value;}
 effect(fn:any,deps:any){const i=this.index++,old=this.slots[i];if(!old||!this.same(old.deps,deps)){this.slots[i]={deps,cleanup:old?.cleanup};this.effects.push(()=>{old?.cleanup?.();this.slots[i].cleanup=fn();});}}
 flush(){for(let n=0;n<30;n++){(globalThis as any).__doiNguRuntime=this;this.index=0;this.changed=false;this.value=Session({pathname:this.pathname});this.effects.splice(0).forEach(f=>f());if(!this.changed)return;}throw Error('Runtime hook không ổn định');}
 dispose(){this.slots.forEach(s=>s?.cleanup?.());}
}
const all=(t:any,p:(n:any)=>boolean):any[]=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(n=>all(n,p)):[...(p(t)?[t]:[]),...all(t.props?.children,p)];
const text=(t:any):string=>t==null||typeof t==='boolean'?'':Array.isArray(t)?t.map(text).join(''):typeof t==='object'?text(t.props?.children):String(t);
const microtasks=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
class Events extends EventTarget{removeEventListener(type:string,listener:any,options?:any){super.removeEventListener(type,listener,typeof options==='boolean'?{capture:options}:options);}}
const win=new Events(),doc=new Events();
Object.assign(globalThis,{window:win,document:Object.assign(doc,{visibilityState:'visible',querySelector:()=>null,getElementById:()=>null}),location:new URL('https://fake.local/btvn'),history:{pushState(){}},requestAnimationFrame:(fn:()=>void)=>fn()});
const f=pipelineFixture();
const state=(name='Người học GIẢ A'):HomeworkState=>({exam:f.exam,fullName:name,className:'LỚP GIẢ',lessonCode:'buoi-gia',dueAt:null,maxAttempts:5,attemptsUsed:0,draft:null,receipts:[],bestScore:null,demo:false,lessons:[],assetsExpiresAt:Date.now()+1000,canStart:true});
type Request={body:any;reply:(status:number,data?:unknown,raw?:string)=>void;fail:()=>void};
async function mount(initial=state(),initialStatus=200,options:{pathname?:string;classNames?:string[];search?:string}={}){
 const requests:Request[]=[],classRequests:any[]=[];
 (globalThis as any).location=new URL('https://fake.local'+(options.pathname??'/btvn')+(options.search??''));
 (globalThis as any).fetch=(path:string,init:any)=>{
  assert.equal(path,'/api/btvn','Chỉ transport giả, không kết nối mạng');const body=JSON.parse(init.body);
  if(body.action==='classes'){classRequests.push(body);return Promise.resolve(new Response(JSON.stringify({classNames:options.classNames??['LỚP GIẢ']})));}
  return new Promise<Response>((resolve,reject)=>requests.push({body,reply:(status,data,raw)=>resolve(new Response(raw??JSON.stringify(data),{status})),fail:()=>reject(Error('Mất mạng giả'))}));
 };
 const runtime=new Runtime(options.pathname);const settle=async()=>{await microtasks();runtime.flush();};runtime.flush();requests[0].reply(initialStatus,initial);await settle();
 const gate=()=>all(runtime.value,n=>typeof n.type==='function'&&typeof n.props?.onLogin==='function')[0];
 const cards=()=>all(runtime.value,n=>typeof n.type==='function'&&typeof n.props?.onHomework==='function')[0];
 const renew=async()=>{win.dispatchEvent(new Event('mtm:retry-assets'));await settle();return requests.at(-1)!;};
 if(initialStatus===200)assert.match(text(runtime.value),/Người học GIẢ A/);return {requests,classRequests,runtime,settle,gate,cards,renew,dispose:()=>runtime.dispose()};
}

export {mount,state,all,text,f};
