import assert from 'node:assert/strict';
import {mount} from './daily19-ui-harness.mts';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {compactStudentPhoto,STUDENT_PHOTO_MAX_CHARS,validAppearanceRecord,studentAppearanceChanged,APPEARANCE_EVENT,SYNC_KEY} from '../src/components/student-appearance';
import {PHOTO_MAX_CHARS} from '../server/btvn/avatar-http';
import {ZALO_ASSISTANT_URL} from '../src/components/mtm-contact';

const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file:string){const code=buildSync({entryPoints:[join(root,file)],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;const mod={exports:{} as any};new Function('require','module','exports',code)(require,mod,mod.exports);return mod.exports;}
const render=(component:any,props:any={})=>renderToStaticMarkup(React.createElement(component,props));
const all=(tree:any,predicate:(node:any)=>boolean):any[]=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(node=>all(node,predicate)):[...(predicate(tree)?[tree]:[]),...all(tree.props?.children,predicate)];

assert.equal(STUDENT_PHOTO_MAX_CHARS,40000);assert.equal(STUDENT_PHOTO_MAX_CHARS,PHOTO_MAX_CHARS);
// Tín hiệu sau lưu hoặc quản trị ảnh chỉ mang nonce, không chép hồ sơ vào storage.
const priorWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),priorStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
const events=new EventTarget();let notifications=0,storageWrite:any;
events.addEventListener(APPEARANCE_EVENT,()=>notifications++);
try{
 Object.defineProperty(globalThis,'window',{configurable:true,value:events});
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{setItem:(key:string,value:string)=>storageWrite={key,value:JSON.parse(value)}}});
 studentAppearanceChanged();assert.equal(notifications,1);assert.equal(storageWrite.key,SYNC_KEY);assert.equal(storageWrite.value.kind,'profile');assert.deepEqual(Object.keys(storageWrite.value).sort(),['kind','nonce']);
}finally{
 if(priorWindow)Object.defineProperty(globalThis,'window',priorWindow);else delete (globalThis as any).window;
 if(priorStorage)Object.defineProperty(globalThis,'localStorage',priorStorage);else delete (globalThis as any).localStorage;
}
let qualities:number[]=[];
const exact='x'.repeat(STUDENT_PHOTO_MAX_CHARS);
assert.equal(compactStudentPhoto(quality=>{qualities.push(quality);return exact;}),exact);assert.equal(qualities.length,1);
qualities=[];let attempts=0;
assert.equal(compactStudentPhoto(quality=>{qualities.push(quality);return ++attempts<3?'x'.repeat(STUDENT_PHOTO_MAX_CHARS+1):'ảnh nén thử';}),'ảnh nén thử');
assert.equal(qualities.length,3);assert.ok(qualities.every((quality,i)=>quality>0&&quality<=1&&(i===0||quality<qualities[i-1])));
assert.throws(()=>compactStudentPhoto(()=>'x'.repeat(STUDENT_PHOTO_MAX_CHARS+1)),/Ảnh còn quá lớn/);
const record={profileKey:'00000000-0000-4000-8000-000000000001',revision:1,school:'Trường thử hồ sơ',appearance:{avatar:'orbit',photo:''},photoHidden:true};
assert.equal(validAppearanceRecord(record),true);
assert.equal(validAppearanceRecord({...record,photoHidden:'true'}),false);
assert.equal(validAppearanceRecord({...record,school:'Trường\u0000thử'}),false);
assert.equal(validAppearanceRecord({...record,appearance:{avatar:'orbit',photo:'data:image/jpeg;base64,'+'A'.repeat(STUDENT_PHOTO_MAX_CHARS)}}),false);

const {HomeConsultation}=load('src/components/HomeConsultation.tsx'),{FloatingContact,contactAllowed}=load('src/components/FloatingContact.tsx');
for(const html of [render(HomeConsultation),render(FloatingContact,{pathname:'/'})]){
 assert.ok(html.includes('href="'+ZALO_ASSISTANT_URL+'"'));
 assert.match(html,/target="_blank"/);assert.match(html,/rel="noopener noreferrer"/);assert.match(html,/>Zalo<\/text>/);
 assert.doesNotMatch(html,/chatgpt\.site|\/register|tel:/);
}
assert.match(render(HomeConsultation),/>Tư vấn lớp học qua Zalo<\/span>/);
assert.match(render(FloatingContact,{pathname:'/'}),/mtm-home-consultation-dock/);
for(const route of ['/btvn','/btvn/bai-thu','/quan-tri/btvn','/thi-thu/de-thu']){assert.equal(contactAllowed(route),false);assert.equal(render(FloatingContact,{pathname:route}),'');}
const home=readFileSync(join(root,'src/migration/Home.tsx'),'utf8');assert.ok(home.indexOf('<HomeConsultation/>')<home.indexOf('<R106Hero/>'));
const css=readFileSync(join(root,'src/components/home-consultation.css'),'utf8');
assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/position:fixed/);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/padding-bottom:calc\(84px/);assert.match(css,/background:#ffcf24/);

const identity={fullName:'Học sinh thử đăng nhập',phone:'0000000000',className:'Lớp thử'};
const submissions:any[]=[],tree=mount('src/native/homework/HomeworkGate.tsx',{studentCode:'MÃ THỬ',identity,busy:false,classNames:['Lớp thử'],onCode(){},onIdentity(){},onLogin:(payload:any)=>submissions.push(payload)}).tree;
const form=all(tree,node=>node.type==='form'&&node.props['aria-labelledby']==='btvn-identity-title')[0];
assert.ok(form);const fields=all(form,node=>node.type==='input'||node.type==='select');
assert.equal(fields.length,3);assert.deepEqual(fields.map(field=>field.type==='select'?'className':field.props.type),['text','tel','className']);
assert.ok(fields.every(field=>field.props.required));
assert.ok(!all(form,node=>node.type==='input').some(field=>field.props.type==='file'));
form.props.onSubmit({preventDefault(){}});assert.deepEqual(submissions,[identity]);assert.deepEqual(Object.keys(submissions[0]).sort(),['className','fullName','phone']);
console.log('Đạt hồ sơ/tư vấn: ảnh nén dưới cùng hạn mức server, cờ ẩn ảnh đúng kiểu, hai CTA dùng Zalo cấu hình và tab mới; CSS mobile có safe-area; đăng nhập giữ đúng họ tên, số điện thoại, lớp. Chưa thay thế kiểm trình duyệt.');
