import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {MTM_SOCIAL_CHANNELS,ZALO_ASSISTANT_URL} from '../src/components/mtm-contact';

const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const expected=[
 ['zalo','https://zalo.me/0967365413'],
 ['facebook','https://www.facebook.com/minhthanhmath/'],
 ['tiktok','https://www.tiktok.com/@minhthanhmath'],
 ['youtube','https://www.youtube.com/channel/UC1n4Z0exxmO8iEW90rJK-Sg'],
 ['threads','https://www.threads.com/@minhthanhmaths'],
 ['instagram','https://www.instagram.com/minhthanhmaths/'],
] as const;
function load(file:string,programme?:string){
 const result=buildSync({entryPoints:[join(root,file)],bundle:true,write:false,metafile:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'});
 const mod={exports:{} as any};
 new Function('require','module','exports',result.outputFiles[0].text)((id:string)=>id==='react'?{...React,useLayoutEffect(){},useState:(value:any)=>React.useState(programme&&value==='Toán 12'?programme:value)}:require(id),mod,mod.exports);
 return {exports:mod.exports,metafile:result.metafile};
}
const render=(component:any,props:any={})=>renderToStaticMarkup(React.createElement(component,props));
function attribute(attributes:string,name:string){return attributes.match(new RegExp('(?:^|\\s)'+name+'="([^"]*)"'))?.[1];}
const anchors=(html:string)=>[...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(match=>({attributes:match[1],content:match[2]}));
const socialGroups=(html:string)=>[...html.matchAll(/<nav\b(?=[^>]*class="[^"]*\bmtm-social-links\b)[^>]*>([\s\S]*?)<\/nav>/g)].map(match=>match[1]);
function checkChannels(html:string,urls:readonly string[]=expected.map(([,url])=>url)){
 const links=anchors(html);
 assert.deepEqual(links.map(link=>attribute(link.attributes,'href')),urls);
 for(const link of links){
  assert.equal(attribute(link.attributes,'target'),'_blank');
  assert.deepEqual(attribute(link.attributes,'rel')?.split(/\s+/).sort(),['noopener','noreferrer']);
  assert.match(attribute(link.attributes,'aria-label')??'',/\S/);
  assert.match(link.content,/<svg\b[^>]*aria-hidden="true"/);
  assert.doesNotMatch(link.content,/<img\b/);
 }
}

assert.equal(ZALO_ASSISTANT_URL,expected[0][1]);
assert.deepEqual(MTM_SOCIAL_CHANNELS.map(({id,url})=>[id,url]),expected);
const social=load('src/components/SocialLinks.tsx');
checkChannels(render(social.exports.SocialLinks));
// Biểu tượng được đóng gói từ SVG nội bộ, không đưa thêm thư viện biểu tượng vào nhóm kênh.
const externalImports=Object.values(social.metafile.outputs).flatMap((output:any)=>output.imports.filter((entry:any)=>entry.external).map((entry:any)=>entry.path));
assert.ok(externalImports.every((name:any)=>name==='react'||name==='react/jsx-runtime'));

const homeConsultation=render(load('src/components/HomeConsultation.tsx').exports.HomeConsultation);
assert.match(homeConsultation,/<h2>Kênh của Minh Thành Math<\/h2>/);
assert.match(homeConsultation,/>Tư vấn lớp học qua Zalo<\/span>/);
checkChannels(homeConsultation);
const footer=render(load('src/components/Footer.tsx').exports.Footer),footerGroups=socialGroups(footer);
assert.equal(footerGroups.length,1);checkChannels(footerGroups[0]);
// 20/10: BTVN và hướng dẫn phụ huynh ở chân trang là dòng chữ thường, không còn ô viền bị thanh liên hệ che.
assert.doesNotMatch(footer,/mtm-portal-links/);
for(const href of ['/btvn','/huong-dan?cho=phu-huynh'])assert.equal(anchors(footer).filter(link=>attribute(link.attributes,'href')===href).length,1,href);
const r106Site=readFileSync(join(process.env.MTM_ROOT??process.cwd(),'src/migration/r106-site.css'),'utf8');
assert.match(r106Site,/:not\(\.r106-home-page\) \.mig-header\{[^}]*background:#fff;/,'Thanh đầu trang dính phải nền đặc');

for(const [file,prefix,groups] of [['R104Hero.tsx','r104',2],['R106Hero.tsx','r106',1]] as const){
 const path='src/migration/'+file,hero=render(load(path).exports.default),channels=socialGroups(hero);
 assert.equal(channels.length,groups,file+' có đủ nhóm kênh cạnh CTA');
 channels.forEach(group=>checkChannels(group));
 const ctas=anchors(hero).filter(link=>attribute(link.attributes,'class')?.split(/\s+/).includes(prefix+'-primary'));
 assert.equal(ctas.length,groups);
 for(const cta of ctas){assert.equal(attribute(cta.attributes,'href'),'/#courses');assert.match(cta.content,/Tìm lớp phù hợp/);}
 // Render nhánh chương trình thật để tránh hồi quy nút tìm lớp THCS quay về mẫu đăng ký.
 for(const programme of ['THCS','Toán 10 & 11']){
  const guided=render(load(path,programme).exports.default);
  const explore=anchors(guided).filter(link=>attribute(link.attributes,'class')?.split(/\s+/).includes(prefix+'-course-explore'));
  assert.equal(explore.length,1);assert.equal(attribute(explore[0].attributes,'href'),'/#courses');assert.match(explore[0].content,/Tìm lớp phù hợp/);
 }
}

const {FloatingContact,contactAllowed}=load('src/components/FloatingContact.tsx').exports;
const dock=render(FloatingContact,{pathname:'/'});
assert.equal((dock.match(/class="mtm-home-consultation-dock"/g)||[]).length,1);
assert.match(dock,/Tư vấn ngay/);checkChannels(dock,[expected[0][1]]);
for(const [pathname,search] of [['/btvn',''],['/btvn/bai-thu',''],['/quan-tri',''],['/quan-tri/btvn',''],['/admin',''],['/admin/bai-thu',''],['/thi-thu/de-thu',''],['/luyen-tap','?id=thu'],['/luyen-tap','?luot=thu']]){
 assert.equal(contactAllowed(pathname,search),false);assert.equal(render(FloatingContact,{pathname,search}),'');
}
console.log('Đạt kênh trang chủ: 6 URL đúng, liên kết tab mới có tên truy cập và SVG nội bộ; dải Zalo, chân trang, R104/R106, CTA tìm khóa học và một dock với các tuyến loại trừ. Bố cục cần kiểm thêm trên trình duyệt.');
