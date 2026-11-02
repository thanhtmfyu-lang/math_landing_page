// Serve this new SPA entry as a static directory index without adding a Vercel
// function or editing the deployment configuration owned by PR #148.
export function lessonUploadRoutePlugin(){
 return {
  name:'mtm-lesson-upload-static-entry',
  apply:'build',
  enforce:'post',
  generateBundle:{order:'post',handler(_options,bundle){
   const index=bundle['index.html'];
   if(!index||index.type!=='asset')throw Error('Thiếu index.html cho cổng lên bài.');
   this.emitFile({type:'asset',fileName:'quan-tri/len-bai/index.html',source:index.source});
  }},
 };
}
