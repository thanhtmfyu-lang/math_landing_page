import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {getDocument,GlobalWorkerOptions,AnnotationMode,type PDFDocumentProxy,type RenderTask} from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {ChevronLeft,ChevronRight,Download,RefreshCw,FileText} from 'lucide-react';
import {navigate} from '../migration/navigation';
import {fetchReaderBytes,readerView,readerPath,readerMessage,ZOOM_LEVELS,type ReaderFile} from './reader-policy';
import './reader.css';
import ReaderSearch from './ReaderSearch';
import ReaderPosition from './ReaderPosition';
import ReaderBookmarks from './ReaderBookmarks';
GlobalWorkerOptions.workerSrc=workerUrl;
export default function NativePdfReader({file,title,search}:{file:ReaderFile;title:string;search:string}){
 const view=readerView(search,file.pages),[doc,setDoc]=useState<PDFDocumentProxy|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[busy,setBusy]=useState(true),[width,setWidth]=useState(600),[shown,setShown]=useState(0),[text,setText]=useState(''),[jump,setJump]=useState(String(view.page)),[jumpError,setJumpError]=useState('');
 const scroll=useRef<HTMLDivElement>(null),sheet=useRef<HTMLDivElement>(null);
 useEffect(()=>setJump(String(view.page)),[view.page]);
 useEffect(()=>{if(!scroll.current)return;const target=scroll.current,observer=new ResizeObserver(entries=>{const n=Math.floor(entries[0].contentRect.width);if(n>0)setWidth(n);});observer.observe(target);return()=>observer.disconnect();},[]);
 useEffect(()=>{let active=true;const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),20000);let task:ReturnType<typeof getDocument>|undefined;
  setDoc(null);setError('');setBusy(true);setShown(0);setText('');sheet.current?.replaceChildren();
  void(async()=>{try{const data=await fetchReaderBytes(file,controller.signal);if(!active)return;window.clearTimeout(timeout);task=getDocument({data,enableXfa:false,stopAtErrors:true,useSystemFonts:true,maxImageSize:16000000});const next=await task.promise;if(!active)return;if(next.numPages!==file.pages)throw new Error('PAGE_COUNT_CHANGED');setDoc(next);}catch(e){if(active){setError(readerMessage(e));setBusy(false);}}})();
  return()=>{active=false;controller.abort();window.clearTimeout(timeout);void task?.destroy().catch(()=>{});};
 },[file,retry]);
 useEffect(()=>{if(!doc||!sheet.current)return;let active=true;let rendering:RenderTask|undefined;setBusy(true);setError('');setText('');setShown(0);
  void(async()=>{try{const pdfPage=await doc.getPage(view.page);if(!active)return;const natural=pdfPage.getViewport({scale:1}),fit=Math.max(240,Math.min(1050,width-32)),viewport=pdfPage.getViewport({scale:fit/natural.width*(view.zoom/100)}),density=Math.min(2,window.devicePixelRatio||1,Math.sqrt(6000000/(viewport.width*viewport.height)));
   const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('CANVAS_UNAVAILABLE');canvas.width=Math.ceil(viewport.width*density);canvas.height=Math.ceil(viewport.height*density);canvas.style.width=Math.ceil(viewport.width)+'px';canvas.style.height=Math.ceil(viewport.height)+'px';canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Trang '+view.page+' / '+file.pages+' · '+title);canvas.setAttribute('aria-busy','true');sheet.current?.replaceChildren(canvas);
   rendering=pdfPage.render({canvas,viewport,transform:density!==1?[density,0,0,density,0,0]:undefined,annotationMode:AnnotationMode.DISABLE});await rendering.promise;if(!active)return;canvas.dataset.pdfPage=String(view.page);canvas.setAttribute('aria-busy','false');setShown(view.page);setBusy(false);
   try{const extracted=await pdfPage.getTextContent();if(active)setText(extracted.items.filter(item=>'str'in item).map(item=>'str'in item?item.str:'').join(' '));}catch{if(active)setText('Trang PDF đã hiển thị; chưa trích được lớp chữ. Nội dung nguyên bản ở phía trên không bị thay đổi.');}
  }catch(e){if(active&&!(e instanceof Error&&e.name==='RenderingCancelledException')){setError('Không dựng được trang này. Thử tải lại tài liệu; bản gốc được giữ nguyên.');setBusy(false);}}})();
  return()=>{active=false;rendering?.cancel();};
 },[doc,view.page,view.zoom,width,file.pages,title]);
 const go=(page:number,zoom=view.zoom)=>{
  if(!doc||page<1||page>doc.numPages)return;
  setJumpError('');
  let path=readerPath(file,page,zoom);
  const params=new URLSearchParams(search),muc=params.get('muc'),query=(params.get('q')??'').normalize('NFC').replace(/\s+/g,' ').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,120);
  if(muc!==null){const category=['all','grade-10','grade-11','grade-12'].includes(muc)?muc:'all';path+=(path.includes('?')?'&':'?')+'muc='+category;}
  if(query.trim())path+=(path.includes('?')?'&':'?')+new URLSearchParams({q:query});
  navigate(path,{replace:true});
 };
 const pageKeys=(e:KeyboardEvent)=>{if(e.target!==scroll.current&&!sheet.current?.contains(e.target as Node))return;if(e.ctrlKey||e.altKey||e.metaKey||e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;const next=e.key==='PageDown'?view.page+1:e.key==='PageUp'?view.page-1:e.key==='Home'?1:e.key==='End'?file.pages:null;if(next!==null){e.preventDefault();go(next);}};
 return <section className="mtm-pdf-reader" aria-label={'Đọc tài liệu '+title} onKeyDown={pageKeys} data-document-id={file.id}>
  <div className="reader-heading"><FileText size={20}/><div><b>Đọc ngay trong MTM</b><small>PDF gốc đã kiểm mã tệp · {file.pages} trang · {(file.bytes/1024/1024).toFixed(1)} MB</small></div><a className="reader-download" href={file.path} download={file.id+'.pdf'}><Download size={16}/> PDF gốc</a></div>
  <div className="reader-source-note"><b>Nội dung trên bìa PDF:</b> {file.observedContents}. {file.sourceMetadataNeedsReview?'Nhãn mục/lớp trong danh mục gốc chưa khớp hoàn toàn nội dung tệp; cần trung tâm chuẩn hóa trước khi công bố. ':''}Tệp được giữ nguyên, không chỉnh đề hoặc lời giải.</div>
  <div className="reader-toolbar" role="group" aria-label="Điều khiển đọc tài liệu"><button type="button" disabled={!doc||view.page<=1} onClick={()=>go(view.page-1)} aria-label="Trang trước"><ChevronLeft size={18}/></button><form onSubmit={e=>{e.preventDefault();const p=Number(jump);if(!/^[1-9][0-9]*$/.test(jump)||!Number.isInteger(p)||p>file.pages){setJumpError('Nhập số trang từ 1 đến '+file.pages);return;}go(p);}}><label>Trang <input aria-label="Số trang PDF" value={jump} disabled={!doc} onChange={e=>setJump(e.target.value)} inputMode="numeric" maxLength={4}/></label><span>/ {file.pages}</span><button disabled={!doc} type="submit">Đến</button></form><button type="button" disabled={!doc||view.page>=file.pages} onClick={()=>go(view.page+1)} aria-label="Trang sau"><ChevronRight size={18}/></button><label className="reader-zoom">Thu/phóng <select aria-label="Độ phóng PDF" disabled={!doc} value={view.zoom} onChange={e=>go(view.page,Number(e.target.value))}>{ZOOM_LEVELS.map(n=><option key={n} value={n}>{n===100?'Vừa khung':n+'%'}</option>)}</select></label></div>
  <ReaderPosition key={file.sha256} file={file} page={view.page} zoom={view.zoom} shown={shown} busy={busy} explicit={new URLSearchParams(search).has('trang')||new URLSearchParams(search).has('zoom')} onPage={go}/>
  <ReaderBookmarks key={file.sha256} file={file} page={view.page} shown={shown} busy={busy} onPage={go}/>
  <ReaderSearch doc={doc} onPage={page=>go(page)}/>
  {jumpError&&<p className="reader-error" role="alert">{jumpError}</p>}
  <p className="reader-status" role="status" aria-live="polite">{error?'Chưa đọc được trang':busy?doc?'Đang dựng trang '+view.page+'…':'Đang tải và kiểm tệp PDF…':'Đã hiển thị trang '+shown+' / '+file.pages}</p>
  {error&&<div className="reader-error" role="alert"><p>{error}</p><button type="button" onClick={()=>setRetry(n=>n+1)}><RefreshCw size={16}/> Thử tải lại</button></div>}
  <div ref={scroll} className="reader-scroll" tabIndex={0} aria-label="Trang tài liệu; dùng PageUp và PageDown để chuyển trang" aria-busy={busy} data-rendered-page={shown}><div ref={sheet} className="reader-sheet"/></div>
  {shown>0&&!busy&&!error&&<details className="reader-text"><summary>Văn bản của trang {shown}</summary><p>{text||'Trang này là ảnh quét hoặc không có lớp chữ trích xuất. Xem nguyên bản ở khung phía trên; không tự nhận dạng hay sửa công thức.'}</p></details>}
  <p className="reader-footnote">Đọc tệp công khai ngay trong website; không chuyển qua E-learning cũ. Số trang và mức phóng được giữ trong địa chỉ; vị trí đọc còn được nhớ trên trình duyệt này. Chưa đồng bộ tài khoản hoặc lịch sử lên máy chủ.</p>
 </section>;
}
