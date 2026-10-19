import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
export function publicSitemapPaths(){
 const courses=read('src/migration/catalog.json').courses;
 const exams=read('src/native/exams/catalog.json');
 const documents=read('src/native/reader-files.json').files;
 // Allowlist only: never crawl a private tree, authenticated API or runtime data.
 return [...new Set(['/', '/khoa-hoc','/thi-thu','/thi-thu-hsa','/de-giua-ky-1','/luyen-tap','/tai-lieu','/huong-dan','/san-choi',
  ...courses.map(c=>'/khoa-hoc/'+encodeURIComponent(c.slug)),
  ...exams.filter(e=>e.publicationVerified===true&&e.questionDisplayVerified===true).map(e=>'/thi-thu/'+encodeURIComponent(e.id)),
  ...documents.map(d=>'/tai-lieu/'+encodeURIComponent(d.id))])];
}
export function sitemapXml(){return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+publicSitemapPaths().map(path=>'<url><loc>https://www.minhthanhmath.vn'+path+'</loc></url>').join('\n')+'\n</urlset>\n';}
export function publicSitemapPlugin(){return{name:'mtm-public-sitemap',apply:'build',generateBundle(){this.emitFile({type:'asset',fileName:'sitemap.xml',source:sitemapXml()});}};}
