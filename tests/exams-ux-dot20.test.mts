import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {routeMetadata} from '../src/migration/route-policy';
const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file:string){const code=buildSync({entryPoints:[join(root,file)],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;const mod={exports:{} as any};new Function('require','module','exports',code)(require,mod,mod.exports);return mod.exports;}
const render=(c:any,p:any={})=>renderToStaticMarkup(React.createElement(c,p));
const notFound=render(load('src/migration/StudyRoutes.tsx').NotFound);
assert.match(notFound,/404/);for(const href of ['/','/khoa-hoc','/thi-thu','/btvn'])assert.ok(notFound.includes('href="'+href+'"'));
const {FloatingContact,contactAllowed}=load('src/components/FloatingContact.tsx');
for(const [pathname,search] of [['/btvn',''],['/btvn/lop-gia/buoi-gia',''],['/quan-tri/de-thi',''],['/admin',''],['/thi-thu/de-gia',''],['/luyen-tap','?id=gia'],['/luyen-tap','?luot=gia']]){assert.equal(contactAllowed(pathname,search),false);assert.equal(render(FloatingContact,{pathname,search}),'');}
const contact=render(FloatingContact,{pathname:'/khoa-hoc'});assert.doesNotMatch(contact,/tel:/);assert.match(contact,/href="\/#register"/);assert.match(contact,/https:\/\/zalo.me\/0967365413/);assert.match(contact,/Nhắn Zalo tư vấn/);assert.match(contact,/Zalo trợ lý/);
const homeContact=render(FloatingContact,{pathname:'/'});assert.match(homeContact,/mtm-home-consultation-dock/);assert.match(homeContact,/https:\/\/zalo.me\/0967365413/);assert.match(homeContact,/Tư vấn ngay/);assert.match(homeContact,/target="_blank"/);assert.doesNotMatch(homeContact,/tel:|href="\/#register"/);
const skeleton=render(load('src/components/LoadingCards.tsx').LoadingCards,{label:'Đang tải buổi học'});assert.match(skeleton,/aria-busy="true"/);assert.equal((skeleton.match(/class="mtm-skeleton-card"/g)||[]).length,3);
const read=(p:string)=>readFileSync(join(root,p),'utf8');
const manifest=JSON.parse(read('public/manifest.webmanifest'));assert.equal(manifest.name,'Minh Thành Math');assert.equal(manifest.start_url,'/');assert.equal(manifest.display,'standalone');assert.equal(manifest.theme_color,'#213269');assert.equal(manifest.background_color,'#ffcf24');
for(const icon of manifest.icons){const png=readFileSync(join(root,'public',icon.src));assert.equal(png.readUInt32BE(16),Number(icon.sizes.split('x')[0]));assert.equal(png.readUInt32BE(20),Number(icon.sizes.split('x')[1]));}assert.ok(manifest.icons.some((i:any)=>i.purpose==='maskable'));
assert.match(read('index.html'),/rel="manifest" href="\/manifest.webmanifest"/);assert.match(read('index.html'),/rel="apple-touch-icon"/);
const {SEO}=load('src/components/SEO.tsx'),{HelmetProvider}=require('react-helmet-async');HelmetProvider.canUseDOM=false;const context:any={};renderToStaticMarkup(React.createElement(HelmetProvider,{context},React.createElement(SEO,routeMetadata('/tai-lieu','localhost'))));assert.match(context.helmet.title.toString(),/Thư viện học liệu/);assert.match(context.helmet.meta.toString(),/property="og:image"/);
const {publicSitemapPaths,sitemapXml}=await import(pathToFileURL(join(root,'scripts/public-sitemap.mjs')).href);const paths=publicSitemapPaths();assert.ok(paths.some((p:string)=>p.startsWith('/thi-thu/')));assert.ok(paths.some((p:string)=>p.startsWith('/tai-lieu/')));assert.ok(paths.some((p:string)=>p.startsWith('/khoa-hoc/')));assert.ok(paths.every((p:string)=>!/^\/(btvn|quan-tri|admin|api|so-tay)(\/|$)/.test(p)));assert.match(sitemapXml(),/<urlset/);
for(const path of ['/','/khoa-hoc','/thi-thu','/luyen-tap','/so-tay','/tai-lieu','/huong-dan','/btvn']){const meta=routeMetadata(path,'localhost');assert.ok(meta.title&&meta.description);}
const metadata=JSON.parse(read('src/native/exams/public-metadata.json')),exams=JSON.parse(read('src/native/exams/catalog.json'));assert.deepEqual(metadata,exams.map(({id,title}:any)=>({id,title:title.replaceAll('—','-')})));for(const exam of exams)assert.ok(routeMetadata('/thi-thu/'+exam.id,'localhost').title.includes(exam.title.replaceAll('—','-')));
console.log('Đạt đợt 20: SSR 404, head/OG, liên hệ và tuyến ẩn, skeleton, PNG/manifest, sitemap công khai, metadata đề.');
