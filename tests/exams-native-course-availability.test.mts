import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {courses,consultationUrl,displayCourseTitle,step} from '../src/migration/catalogue';
import {nativeLessonUrl,resolveNativeLesson} from '../src/native/model';
import {routeMetadata} from '../src/migration/route-policy';

const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const code=buildSync({entryPoints:[join(root,'src/native/NativeCourses.tsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;
function load(hooks?:any){
  const mod={exports:{} as any};
  new Function('require','module','exports',code)((id:string)=>id==='react'&&hooks?{...React,...hooks}:require(id),mod,mod.exports);
  return mod.exports;
}
const {NativeCourseDetail,NativeLesson}=load();
const render=(component:any,props:any)=>renderToStaticMarkup(React.createElement(component,props));
const origin='https://www.minhthanhmath.vn';
const decode=(value:string)=>value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#x27;/g,"'");
const links=(html:string)=>[...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>/g)].map(match=>decode(match[1]));
const unchangedFiles=['src/migration/catalog.json','src/native/public-content.json','src/native/native.css'];
const originalFiles=unchangedFiles.map(file=>readFileSync(join(root,file),'utf8'));
let count=0;
const test=(name:string,fn:()=>void)=>{fn();console.log('ĐẠT '+(++count)+' '+name);};

// DOMParser tối thiểu chỉ phục vụ vùng mô tả ngoài phạm vi kiểm này.
// Không gọi đây là kiểm sanitizer hoặc bố cục bằng trình duyệt.
const before={DOMParser:(globalThis as any).DOMParser,fetch:globalThis.fetch};
let networkCalls=0;
(globalThis as any).DOMParser=class{parseFromString(){return{body:{childNodes:[{nodeType:3,textContent:'Mô tả nguồn công khai, vùng không kiểm trong ca này.'}]}};}};
globalThis.fetch=(()=>{networkCalls++;throw Error('Ca local không được gọi mạng.');}) as any;
try{
  test('Mọi khóa nguồn bỏ nút mua chết, dẫn tư vấn nội bộ đúng lớp/khóa và giữ bài đầu',()=>{
    for(const course of courses){
      const html=render(NativeCourseDetail,{course});
      assert.doesNotMatch(html,/MUA NGAY|<button\b[^>]*disabled|<textarea\b|placeholder="Viết bình luận"/);
      assert.match(html,/Chưa có thanh toán online\. Học phí và quyền học cần được MTM xác nhận\./);
      assert.match(html,/Biểu mẫu tư vấn không tự tạo tài khoản hoặc đăng ký mua khóa\./);
      const anchors=[...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
      const consultation=anchors.find(([,attrs])=>attrs.includes('href="'+consultationUrl(course).replace(/&/g,'&amp;')+'"'));
      assert.ok(consultation,'Có liên kết tư vấn của đúng khóa.');
      assert.match(consultation[1],/class="mig-button outline full"/);
      assert.doesNotMatch(consultation[1],/\bne-primary\b/);
      assert.match(consultation[1],/aria-describedby="ne-payment-state ne-consultation-state"/);
      assert.match(html,/<small id="ne-consultation-state">Biểu mẫu tư vấn không tự tạo tài khoản hoặc đăng ký mua khóa\.<\/small>/);
      const hrefs=links(html);assert.ok(hrefs.includes(consultationUrl(course)));
      const contact=new URL(consultationUrl(course),origin);
      assert.equal(contact.origin,origin);assert.equal(contact.pathname,'/');assert.equal(contact.hash,'#register');
      assert.equal(contact.searchParams.get('lop'),step(course)>4?'hsa':String(course.grade));assert.equal(contact.searchParams.get('quan-tam'),displayCourseTitle(course));
      assert.equal(routeMetadata('/khoa-hoc/'+course.slug,'www.minhthanhmath.vn').known,true);
      const first=course.sections.flatMap(section=>section.lessons)[0];
      if(first){
        assert.ok(hrefs.includes(nativeLessonUrl(course,first)));assert.match(html,/Thông tin bài học đầu tiên/);
        const lessonLink=anchors.find(([,attrs])=>attrs.includes('href="'+nativeLessonUrl(course,first).replace(/&/g,'&amp;')+'"')&&/class="ne-primary"/.test(attrs));
        assert.ok(lessonLink,'Bài học đầu tiên giữ nút chính.');
      }
      assert.equal(anchors.filter(([,attrs])=>/class="ne-primary"/.test(attrs)).length,first?1:0,'Chỉ bài học đầu tiên dùng kiểu nút chính.');
      const lessons=course.sections.flatMap(section=>section.lessons);
      assert.equal((html.match(/id="ne-video-state"/g)||[]).length,1);
      assert.equal((html.match(/aria-describedby="ne-video-state"/g)||[]).length,lessons.length);
      assert.match(html,/Danh mục hiện chỉ mở thông tin bài học\. Video chưa được kết nối tại đây/);
      assert.equal((html.match(/<em><span aria-hidden="true">Bài thử<\/span><span class="mig-sr-only">Bài thử theo nguồn, video chưa kết nối<\/span><\/em>/g)||[]).length,lessons.filter(lesson=>lesson.isFree).length);
      assert.equal((html.match(/<span class="mig-sr-only">Nguồn yêu cầu tài khoản, video chưa kết nối<\/span>/g)||[]).length,lessons.filter(lesson=>!lesson.isFree).length);
      assert.ok(hrefs.includes('/huong-dan'));
      assert.ok(hrefs.every(href=>new URL(href,origin).origin===origin),'Không mở cổng cũ hoặc trang mua bên ngoài.');
    }
  });

  test('Tab bình luận mở trạng thái thật và đường hướng dẫn, không còn ô nhập hoặc nút gửi giả',()=>{
    let slots:any[]=[],cursor=0;
    const hooks={useState:(initial:any)=>{const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],(next:any)=>{slots[index]=typeof next==='function'?next(slots[index]):next;}];},useRef:()=>({current:null})};
    const Course=load(hooks).NativeCourseDetail;
    const draw=()=>{cursor=0;return Course({course:courses[0]});};
    function find(tree:any,predicate:(node:any)=>boolean):any{
      if(!tree||typeof tree!=='object')return null;
      if(Array.isArray(tree))return tree.map(node=>find(node,predicate)).find(Boolean);
      return predicate(tree)?tree:find(tree.props?.children,predicate);
    }
    const tab=find(draw(),node=>node.props?.id==='ne-tab-discussion');
    assert.equal(tab.props['aria-selected'],false);tab.props.onClick();
    const tree=draw(),panel=find(tree,node=>node.props?.id==='ne-panel-discussion');
    assert.equal(panel.props.hidden,false);assert.equal(panel.props['aria-labelledby'],'ne-tab-discussion');
    const selected=find(tree,node=>node.props?.id==='ne-tab-discussion');
    assert.equal(selected.props['aria-selected'],true);assert.equal(selected.props.tabIndex,0);
    const html=renderToStaticMarkup(tree);
    assert.match(html,/Hiện chưa thể gửi bình luận hoặc đọc lịch sử trên trang này\./);
    assert.match(html,/<a href="\/huong-dan">Xem hướng dẫn và kênh hỗ trợ MTM/);
    assert.doesNotMatch(html,/<textarea\b|Gửi bình luận|placeholder="Viết bình luận"/);
  });

  test('Toàn bộ route bài nguồn giữ video chưa kết nối, link trước/sau và bỏ avatar U, ô bình luận chết',()=>{
    let lessonsChecked=0;
    for(const course of courses)for(const section of course.sections)for(const lesson of section.lessons){
      const url=new URL(nativeLessonUrl(course,lesson),origin),model=resolveNativeLesson(url.pathname,url.search)!;
      assert.equal(model.lesson.slug,lesson.slug);assert.equal(model.course.slug,course.slug);
      const html=render(NativeLesson,{pathname:url.pathname,search:url.search}),hrefs=links(html);
      assert.match(html,/Video chưa được kết nối/);assert.match(html,/Hiện chưa thể gửi bình luận hoặc đọc lịch sử trên trang này\./);
      assert.doesNotMatch(html,/<input\b|<textarea\b|ne-comment-disabled|<span>U<\/span>|Gửi bình luận/);
      assert.ok(hrefs.includes('/huong-dan'));assert.ok(hrefs.includes('/khoa-hoc/'+course.slug));
      if(model.previous)assert.ok(hrefs.includes(nativeLessonUrl(course,model.previous.lesson)));
      if(model.next)assert.ok(hrefs.includes(nativeLessonUrl(course,model.next.lesson)));
      assert.ok(hrefs.includes(nativeLessonUrl(course,lesson)));
      assert.ok(hrefs.every(href=>new URL(href,origin).origin===origin));lessonsChecked++;
    }
    assert.ok(lessonsChecked>0);console.log('Đã kiểm '+lessonsChecked+' route bài học nguồn công khai.');
  });

  test('Route thiếu không tự nhận bài, nguồn và CSS bất biến, không gọi mạng',()=>{
    const html=render(NativeLesson,{pathname:'/bai-hoc/bai-khong-ton-tai',search:''});
    assert.match(html,/Không tìm thấy bài học/);assert.ok(links(html).includes('/khoa-hoc'));
    for(let i=0;i<unchangedFiles.length;i++)assert.equal(readFileSync(join(root,unchangedFiles[i]),'utf8'),originalFiles[i]);
    assert.equal(networkCalls,0);
  });
}finally{
  if(before.DOMParser===undefined)delete (globalThis as any).DOMParser;else (globalThis as any).DOMParser=before.DOMParser;
  globalThis.fetch=before.fetch;
}
console.log(`${count}/${count} ca SSR/route/trạng thái khóa học đạt. Chưa kiểm bố cục, điều hướng hoặc gửi biểu mẫu trong trình duyệt.`);
