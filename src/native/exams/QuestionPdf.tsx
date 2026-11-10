/// <reference path="./react-dom-portal.d.ts" />
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {getDocument,GlobalWorkerOptions,AnnotationMode,type PDFDocumentProxy,type RenderTask} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {fetchQuestionPdf,type QuestionPdf as QuestionPdfFile} from './pdf-source';
import {findQuestionPageIndex,type SourceQuestionLookup} from './room-presentation';
GlobalWorkerOptions.workerSrc=workerUrl;
// TH-02 (Đợt 4): trang đề vẽ theo đúng bề ngang vùng đọc (trước đây trừ 24 px nên trên điện thoại chỉ còn 293 px),
// thêm mức phóng (cuộn hai chiều) và chế độ toàn màn hình. Không đổi tệp đề, số trang hay điều kiện "bản đề đã hiển thị".
const ZOOMS=[1,1.5,2,3] as const;
const MAX_RENDER_WIDTH=3200;
export default function QuestionPdf({file,title,onReady,targetPage,locate,onLocated,allowFullscreen=true,compact=false,fitToWidth=false}:{file:QuestionPdfFile;title:string;onReady:(ready:boolean)=>void;targetPage?:number;locate?:SourceQuestionLookup;onLocated?:(page:number|null)=>void;allowFullscreen?:boolean;compact?:boolean;fitToWidth?:boolean}) {
  const [doc,setDoc]=useState<PDFDocumentProxy|null>(null),[index,setIndex]=useState(()=>Math.max(0,file.questionPages.indexOf(targetPage??-1))),[width,setWidth]=useState(600),[error,setError]=useState(''),[busy,setBusy]=useState(true);
  useEffect(()=>{if(targetPage!==undefined){const next=file.questionPages.indexOf(targetPage);if(next>=0)setIndex(next);}},[targetPage,file]);
  // Câu thiếu ánh xạ trang: đọc chữ các trang câu hỏi, chuyển tới trang có tiêu đề "Câu N" (đúng lần xuất hiện).
  const locateNumber=locate?.number,locateOccurrence=locate?.occurrence,located=useRef(onLocated);located.current=onLocated;
  useEffect(()=>{if(!doc||locateNumber===undefined)return;let active=true;
    void(async()=>{try{const texts:string[]=[];if(locateNumber>0)for(const p of file.questionPages){const content=await (await doc.getPage(p)).getTextContent();if(!active)return;texts.push(content.items.map(item=>'str' in item?item.str+(item.hasEOL?' ':''):'').join(''));}
      const found=locateNumber>0?findQuestionPageIndex(texts,{number:locateNumber,occurrence:locateOccurrence??0}):undefined;if(!active)return;
      if(found!==undefined)setIndex(found);located.current?.(found!==undefined?file.questionPages[found]:null);}catch{if(active)located.current?.(null);}})();
    return()=>{active=false;};
  },[doc,file,locateNumber,locateOccurrence]);
  // Chỉ phòng tập trung dùng mức đọc lớn trên điện thoại; nhánh cũ giữ vừa ngang.
  const [zoom,setZoom]=useState(()=>!fitToWidth&&compact&&typeof window!=='undefined'&&window.matchMedia('(max-width:760px)').matches?1:0),[full,setFull]=useState(false);
  const host=useRef<HTMLElement>(null),sheet=useRef<HTMLDivElement>(null),fullButton=useRef<HTMLButtonElement>(null),ready=useRef(onReady);ready.current=onReady;
  const [placeholder,setPlaceholder]=useState(0);
  // Trang đang hiển thị thật (để biết lúc nào "bản đề đã hiện"), và vị trí cuộn cần giữ khi đổi chế độ toàn màn hình.
  const shown=useRef<{index:number;canvas:HTMLCanvasElement}|null>(null),scrollMemo=useRef<{x:number;y:number;cx:number;cy:number}|null>(null),restorePending=useRef(false),restoredAt=useRef(-1e9);
  // Review Codex đợt 4 vòng 2: vị trí đang đọc tính theo PHẦN TRANG ĐỀ ĐANG NHÌN THẤY (điểm giữa, tỉ lệ theo canvas),
  // đi qua mọi khung cuộn chứa trang (khung đề, .ep-pdf-pane/.cp-reader, cả trang), nên đúng cả khi khung cha cuộn chứ không phải khung đề.
  const scrollers=(el:HTMLElement)=>{const list:HTMLElement[]=[];for(let e:HTMLElement|null=el;e&&e!==document.body&&e!==document.documentElement;e=e.parentElement){const st=getComputedStyle(e);if(/(auto|scroll)/.test(st.overflowX+st.overflowY))list.push(e);}if(el.closest('.ep-pdf-full'))return list;/* toàn màn hình: không cuộn trang nền đang khoá */const root=document.scrollingElement;if(root instanceof HTMLElement)list.push(root);return list;};
  const visibleBox=(el:HTMLElement)=>{let l=0,t=0,r=innerWidth,b=innerHeight;for(const s of scrollers(el)){if(s===document.scrollingElement)continue;const c=s.getBoundingClientRect();l=Math.max(l,c.left+s.clientLeft);t=Math.max(t,c.top+s.clientTop);r=Math.min(r,c.left+s.clientLeft+s.clientWidth);b=Math.min(b,c.top+s.clientTop+s.clientHeight);}return {l,t,r,b};};
  const captureScroll=()=>{const target=sheet.current,canvas=target?.querySelector('canvas');if(!target||!canvas){scrollMemo.current=null;return;}const c=canvas.getBoundingClientRect();if(!c.width||!c.height){scrollMemo.current=null;return;}const v=visibleBox(target),l=Math.max(v.l,c.left),t=Math.max(v.t,c.top),r=Math.min(v.r,c.right),b=Math.min(v.b,c.bottom);
    scrollMemo.current=r>l&&b>t?{x:((l+r)/2-c.left)/c.width,y:((t+b)/2-c.top)/c.height,cx:(l+r)/2,cy:(t+b)/2}:null;};
  const restoreScroll=(target:HTMLElement)=>{const m=scrollMemo.current,canvas=target.querySelector('canvas');if(!m||!canvas)return;restoredAt.current=performance.now();const c=canvas.getBoundingClientRect();let x=c.left+m.x*c.width,y=c.top+m.y*c.height;
    // Từ khung trong ra ngoài: mỗi khung cuộn phần còn thiếu để điểm đang đọc về đúng chỗ cũ trên màn hình
    // (đổi mức phóng thì trang nền không nhảy); chỗ cũ nằm ngoài khung (vừa vào/ra toàn màn hình) thì về giữa khung.
    for(const s of scrollers(target)){const page=s===document.scrollingElement,box=page?{left:0,top:0,width:innerWidth,height:innerHeight}:(()=>{const r=s.getBoundingClientRect(),left=Math.max(0,r.left+s.clientLeft),top=Math.max(0,r.top+s.clientTop);/* chỉ phần khung đang nằm trong màn hình */return {left,top,width:Math.max(0,Math.min(innerWidth,r.left+s.clientLeft+s.clientWidth)-left),height:Math.max(0,Math.min(innerHeight,r.top+s.clientTop+s.clientHeight)-top)};})();
      const left=s.scrollLeft,top=s.scrollTop;const inside=(v:number,from:number,size:number)=>v>=from&&v<=from+size,wantX=inside(m.cx,box.left,box.width)?m.cx:box.left+box.width/2,wantY=inside(m.cy,box.top,box.height)?m.cy:box.top+box.height/2;
      s.scrollLeft=left+x-wantX;s.scrollTop=top+y-wantY;x-=s.scrollLeft-left;y-=s.scrollTop-top;}};
  // Khung đọc được gắn lại (vào body khi toàn màn hình) nên theo dõi lại bề ngang mỗi lần đổi chế độ.
  useEffect(()=>{const target=sheet.current;if(!target)return;const observer=new ResizeObserver(entries=>setWidth(Math.max(240,Math.floor(entries[0].contentRect.width))));observer.observe(target);return()=>observer.disconnect();},[full]);
  useEffect(()=>{let active=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);let task:ReturnType<typeof getDocument>|undefined;
    ready.current(false);shown.current=null;setDoc(null);setIndex(Math.max(0,file.questionPages.indexOf(targetPage??-1)));setError('');setBusy(true);
    void(async()=>{try{const bytes=await fetchQuestionPdf(file,controller.signal);if(!active)return;task=getDocument({data:bytes,enableXfa:false,stopAtErrors:true,useSystemFonts:true,maxImageSize:16000000});const loaded=await task.promise;if(loaded.numPages!==file.totalPages)throw Error('Số trang bản đề không khớp.');if(active){setDoc(loaded);clearTimeout(timeout);}}catch(e){if(active){setError(e instanceof Error?e.message:'Chưa xem được bản đề.');setBusy(false);ready.current(false);}}})();
    return()=>{active=false;controller.abort();clearTimeout(timeout);void task?.destroy().catch(()=>{});};
  },[file]);
  useEffect(()=>{if(!doc||!sheet.current)return;let active=true;let render:RenderTask|undefined;setBusy(true);setError('');
    // Review Codex đợt 4: đổi trang thì gỡ trang cũ và báo "chưa hiện" cho tới khi trang mới vẽ xong (như trước đợt);
    // đổi mức phóng giữ trang đang hiện; vào/ra toàn màn hình chuyển chính canvas đang hiện sang khung mới nên trang không biến mất.
    const target=sheet.current,previous=shown.current;
    if(!previous||previous.index!==index){shown.current=null;scrollMemo.current=null;ready.current(false);target.replaceChildren();}
    else if(!target.contains(previous.canvas)){target.replaceChildren(previous.canvas);restoreScroll(target);}
    // Vẽ lại vì đổi bề ngang (vừa vào toàn màn hình, xoay máy): giữ điểm đang đọc như khi đổi mức phóng.
    else if(!scrollMemo.current)captureScroll();
    void(async()=>{try{const pageNumber=file.questionPages[index];if(!pageNumber)throw Error('Trang câu hỏi chưa hợp lệ.');const page=await doc.getPage(pageNumber);if(!active)return;
      // Vừa bề ngang vùng đọc (ở cỡ vừa, chữ không vượt 1050 px như trước); mức phóng nhân thêm và cho cuộn ngang.
      const fit=Math.min(full?1400:1050,Math.max(240,width-2)),natural=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(MAX_RENDER_WIDTH,fit*ZOOMS[zoom])/natural.width}),density=Math.min(2,devicePixelRatio||1,Math.sqrt(6000000/(viewport.width*viewport.height)));
      const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{alpha:false});if(!context)throw Error('Trình duyệt chưa hiển thị được bản đề.');canvas.width=Math.ceil(viewport.width*density);canvas.height=Math.ceil(viewport.height*density);canvas.style.width=Math.ceil(viewport.width)+'px';canvas.style.height=Math.ceil(viewport.height)+'px';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${title}, trang câu hỏi ${pageNumber}`);
      render=page.render({canvas,viewport,transform:density!==1?[density,0,0,density,0,0]:undefined,annotationMode:AnnotationMode.DISABLE});await render.promise;
      // Vẽ xong mới thay canvas cũ: đổi mức phóng không làm trang nháy trắng hay nhảy chiều cao.
      if(active&&sheet.current){sheet.current.replaceChildren(canvas);canvas.dataset.questionPage=String(pageNumber);shown.current={index,canvas};restorePending.current=true;setBusy(false);ready.current(true);}
    }catch(e){if(active){setError(e instanceof Error?e.message:'Chưa hiển thị được trang đề.');setBusy(false);ready.current(false);}}})();return()=>{active=false;render?.cancel();};
  },[doc,file,index,width,zoom,full]);
  // Review Codex đợt 4 vòng cuối: người đọc tự cuộn trong lúc trang đang vẽ lại thì cập nhật điểm giữ theo chỗ mới nhất
  // (đo trên trang đang hiện), không kéo về chỗ lúc bấm. Chỉ tính lần cuộn ngay sau thao tác tay/phím, không tính cuộn do mã.
  useEffect(()=>{let userAt=-1e9;const mark=()=>{userAt=performance.now();};const onScroll=()=>{const now=performance.now();if(scrollMemo.current&&now-userAt<600&&now-restoredAt.current>200)captureScroll();};
    const options={capture:true,passive:true},gestures=['wheel','touchmove','keydown','pointerdown'] as const;
    for(const type of gestures)document.addEventListener(type,mark,options);document.addEventListener('scroll',onScroll,options);
    return()=>{for(const type of gestures)document.removeEventListener(type,mark,options);document.removeEventListener('scroll',onScroll,options);};
  },[]);
  // Trả điểm đang đọc SAU khi dòng "Đang hiển thị bản đề…" đã gỡ (dòng đó đẩy khung đề xuống), trước khi trình duyệt vẽ.
  useLayoutEffect(()=>{if(busy||!restorePending.current||!sheet.current)return;restorePending.current=false;restoreScroll(sheet.current);scrollMemo.current=null;},[busy]);
  // Toàn màn hình: khoá cuộn trang nền, Esc để thoát, Tab chỉ đi trong khung; thoát xong trả tiêu điểm về nút.
  const wasFull=useRef(false);
  useEffect(()=>{
    if(!full){if(wasFull.current)fullButton.current?.focus({preventScroll:true});wasFull.current=false;return;}
    wasFull.current=true;const root=document.documentElement,previous=root.style.overflow;root.style.overflow='hidden';fullButton.current?.focus({preventScroll:true});
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();captureScroll();setFull(false);return;}
      if(event.key!=='Tab'||!host.current)return;
      const items=[...host.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex="0"]')];if(!items.length)return;
      const first=items[0],last=items[items.length-1];
      if(!host.current.contains(document.activeElement)){event.preventDefault();first.focus();}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);root.style.overflow=previous;};
  },[full]);
  const zoomLabel=zoom===0?'Vừa bề ngang':'Phóng ×'+String(ZOOMS[zoom]).replace('.',',');
  const toggleFull=()=>{captureScroll();if(!full)setPlaceholder(host.current?.offsetHeight??0);setFull(f=>!f);};
  const viewer=<section className={`ep-card ep-pdf-viewer${full?' ep-pdf-full':''}${compact?' ep-pdf-compact':''}`} ref={host} aria-label="Bản câu hỏi PDF" role={full?'dialog':undefined} aria-modal={full||undefined}>{!compact&&<h2>Bản câu hỏi</h2>}
    {compact?<div className="ep-pdf-compact-toolbar" role="group" aria-label="Trang và cỡ bản đề"><button type="button" aria-label="Trang trước" disabled={!doc||index===0} onClick={()=>setIndex(i=>i-1)}>‹</button><span aria-live="polite">{index+1}/{file.questionPages.length}</span><button type="button" aria-label="Trang sau" disabled={!doc||index===file.questionPages.length-1} onClick={()=>setIndex(i=>i+1)}>›</button><span className="ep-pdf-divider" aria-hidden="true">|</span><button type="button" aria-label="Thu nhỏ trang đề" disabled={!doc||zoom===0} onClick={()=>{captureScroll();setZoom(z=>Math.max(0,z-1));}}>−</button><button className="ep-pdf-fit" type="button" aria-label="Vừa ngang" disabled={!doc} onClick={()=>{captureScroll();setZoom(0);}}>{zoom===0?'Vừa ngang':`×${String(ZOOMS[zoom]).replace('.',',')} · Vừa ngang`}</button><button type="button" aria-label="Phóng to trang đề" disabled={!doc||zoom===ZOOMS.length-1} onClick={()=>{captureScroll();setZoom(z=>Math.min(ZOOMS.length-1,z+1));}}>+</button></div>:<>
    <div className="ep-toolbar"><button type="button" disabled={!doc||index===0} onClick={()=>setIndex(i=>i-1)} aria-label={full?'Trang trước':undefined}>{full?'‹ Trước':'Trang trước'}</button><span>{full?'Trang':'Trang câu hỏi'} {index+1}/{file.questionPages.length}</span><button type="button" disabled={!doc||index===file.questionPages.length-1} onClick={()=>setIndex(i=>i+1)} aria-label={full?'Trang sau':undefined}>{full?'Sau ›':'Trang sau'}</button></div>
    <div className="ep-toolbar ep-pdf-zoom" role="group" aria-label="Cỡ trang đề"><button type="button" aria-label="Thu nhỏ trang đề" disabled={!doc||zoom===0} onClick={()=>{captureScroll();setZoom(z=>Math.max(0,z-1));}}>−</button><span aria-live="polite">{zoomLabel}</span><button type="button" aria-label="Phóng to trang đề" disabled={!doc||zoom===ZOOMS.length-1} onClick={()=>{captureScroll();setZoom(z=>Math.min(ZOOMS.length-1,z+1));}}>+</button>{allowFullscreen&&<button ref={fullButton} type="button" className="ep-pdf-full-toggle" aria-pressed={full} disabled={!doc&&!full} onClick={toggleFull} aria-label={full?'Thoát toàn màn hình':undefined}>{full?'Đóng ✕':'Toàn màn hình'}</button>}</div>
    </>}
    {busy&&<p role="status">Đang hiển thị bản đề…</p>}{error&&<p role="alert">{error} Chưa mở làm bài khi bản câu hỏi chưa hiển thị. Liên kết nguồn có thể chứa đáp án hoặc mã đề khác.</p>}
    <div className={`ep-question-pdf${zoom>0?' is-zoomed':''}`} ref={sheet} tabIndex={zoom>0||full?0:undefined} aria-label={zoom>0||full?'Trang đề, cuộn để xem phần khác':undefined}/></section>;
  // Toàn màn hình gắn vào body (lớp trên cùng), không bị đầu trang dính hay vùng cuộn của khung bài làm che/cắt.
  // Chỗ cũ giữ một khối cùng chiều cao để trang nền không nhảy; bài làm và đồng hồ vẫn chạy bình thường.
  return full?<><section className="ep-card ep-pdf-placeholder" style={{minHeight:placeholder||undefined}} aria-label="Bản câu hỏi PDF"><p role="status">Bản đề đang mở toàn màn hình.</p></section>{createPortal(viewer,document.body)}</>:viewer;
}
