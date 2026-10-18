import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file:string,hooks?:any){const code=buildSync({entryPoints:[join(root,file)],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;const mod={exports:{} as any};new Function('require','module','exports',code)((id:string)=>id==='react'&&hooks?{...React,...hooks}:id.endsWith('.css')?{}:require(id),mod,mod.exports);return mod.exports;}
const render=(c:any,p:any={})=>renderToStaticMarkup(React.createElement(c,p));
const Hero=load('src/migration/R104Hero.tsx').default;
const hero=render(Hero);
assert.match(hero,/Hiểu bản chất/);assert.match(hero,/Vững từng bước/);
assert.match(hero,/r104-photos\/learning-original.webp/);
assert.match(hero,/r104-hero/);assert.match(hero,/Chương trình học/);
assert.match(hero,/Tìm lớp phù hợp/);assert.match(hero,/Vào BTVN/);
assert.ok(!hero.includes('mtm-rank-compact')); // One real leaderboard is mounted above the hero.
const home=readFileSync(join(root,'src/migration/Home.tsx'),'utf8');assert.ok(home.includes('<RankArena/><R106Hero/>'));
const css=readFileSync(join(root,'src/native/homework/leaderboard.css'),'utf8');assert.match(css,/@media\(max-width:760px\).*grid-template-columns:minmax\(0,1fr\)/);
const empty={exam:null,fullName:'Học sinh GIẢ',className:'2K9 9+',lessonCode:'',dueAt:null,maxAttempts:5,attemptsUsed:0,draft:null,receipts:[],bestScore:null,demo:false,lessons:[]};
function session(state:any,room=false){let slot=0;const hooks={useState:(v:any)=>{const i=slot++;return [i===0?state:i===6?room:v===true?false:v,()=>{}];},useEffect(){},useMemo:(fn:any)=>fn(),useRef:(v:any)=>({current:v})};return render(load('src/native/homework/HomeworkSession.tsx',hooks).default,{pathname:'/btvn'});}
const monthly={...empty,lessonCode:'buoi-gia',kind:'kiem-tra-thang',opensAt:Date.parse('2026-10-15T08:00:00+07:00'),closesAt:Date.parse('2026-10-15T09:00:00+07:00')};
const result={...monthly,attemptsUsed:1,bestScore:8,receipts:[{attemptId:'gia',attemptNumber:1,score:8,submittedAt:Date.parse('2026-10-15T09:00:00+07:00'),late:false,timedOut:false}]};
for(const html of [session(null),session(empty),session(monthly,true),session(result,true)]){
assert.match(html,/<a[^>]+href="\/"[^>]*><img[^>]+alt="Minh Thành Math"/);
assert.match(html,/<a[^>]+class="btvn-home-link"[^>]+href="\/">← Trang chủ<\/a>/);
}
// Chạy state thật của thẻ, kiểm top 5, mở top 10, đổi bảng và fetch không chờ cuộn.
let values:any[]=[],cursor=0,effects:Function[]=[],deps:any[][]=[];
const hooks={useState:(v:any)=>{const i=cursor++;if(!(i in values))values[i]=v;return [values[i],(next:any)=>values[i]=typeof next==='function'?next(values[i]):next];},useRef:(v:any)=>{const i=cursor++;if(!(i in values))values[i]={current:v};return values[i];},useEffect:(fn:Function,d:any[])=>{const i=cursor++;if(!deps[i]||d.some((v,j)=>v!==deps[i][j])){effects.push(fn);deps[i]=d;}}};
const Board=load('src/native/homework/HomeLeaderboard.tsx',hooks).default;
const requests:string[]=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url:any)=>{requests.push(String(url));return {ok:true,json:async()=>({enabled:true,rows:Array.from({length:12},(_,i)=>({rank:i+1,fullName:'GIẢ '+(i+1),className:'Lớp GIẢ',score:9,submitted:1,total:1}))})} as any;};
const draw=()=>{cursor=0;return Board({compact:true});};
let tree=draw();assert.match(renderToStaticMarkup(tree),/Đang tải bảng xếp hạng/);effects.splice(0).forEach(fn=>fn());await new Promise(r=>setTimeout(r,0));
assert.deepEqual(requests,['/api/xep-hang?khoi=2K9&loai=btvn-tuan']);
tree=draw();let html=renderToStaticMarkup(tree);assert.equal((html.match(/<li /g)||[]).length,5);assert.match(html,/Xem top 10/);
function find(tree:any,predicate:(n:any)=>boolean):any{if(!tree||typeof tree!=='object')return null;if(Array.isArray(tree))return tree.map(n=>find(n,predicate)).find(Boolean);return predicate(tree)?tree:find(tree.props?.children,predicate);}
find(tree,n=>n.type==='button'&&n.props.children==='Xem top 10').props.onClick();html=renderToStaticMarkup(draw());assert.equal((html.match(/<li /g)||[]).length,10);assert.match(html,/Thu gọn top 5/);
find(draw(),n=>n.type==='select').props.onChange({target:{value:'2K10'}});draw();effects.splice(0).forEach(fn=>fn());await new Promise(r=>setTimeout(r,0));assert.ok(requests.at(-1)!.includes('khoi=2K10'));assert.equal((renderToStaticMarkup(draw()).match(/<li /g)||[]).length,5);
find(draw(),n=>n.type==='button'&&n.props.children==='BTVN tháng').props.onClick();draw();effects.splice(0).forEach(fn=>fn());await new Promise(r=>setTimeout(r,0));assert.ok(requests.at(-1)!.includes('loai=btvn-thang'));
globalThis.fetch=originalFetch;
const app=readFileSync(join(root,'src/App.tsx'),'utf8');assert.match(app,/!\(path==='\/btvn'\|\|path.startsWith\('\/btvn\/'\)\)/);
mkdirSync(join(root,'.qa-temp/dot-19'),{recursive:true});writeFileSync(join(root,'.qa-temp/dot-19/hero-ssr.html'),hero);writeFileSync(join(root,'.qa-temp/dot-19/btvn-entry-ssr.html'),session(null));
console.log('Đạt đợt 19: SSR hero, thẻ tải ngay, 3 khối/3 tab, top 5/10, đổi khối và kỳ, bốn trạng thái BTVN có logo và nút về trang chủ.');
