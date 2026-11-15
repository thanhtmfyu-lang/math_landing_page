/// <reference path="./react-dom-portal.d.ts" />
import {useCallback,useEffect,useId,useRef,useState,type CSSProperties,type SyntheticEvent} from 'react';
import {createPortal} from 'react-dom';
import {openDialogCompat} from './dialog-compat';
import './dialog-compat.css';
import './zoomable-image.css';

// TH-02 (Đợt 4): ảnh câu hỏi thu nhỏ còn khoảng 277 px trên điện thoại (ảnh gốc rộng 1562 px), chữ chỉ còn 4-7 px.
// Bấm ảnh (hoặc nút "Phóng to") mở khung xem toàn màn: ảnh vừa bề ngang, phóng tới 3 lần và cuộn hai chiều.
// Đóng bằng nút, phím Esc hoặc vuốt xuống khi đang ở cỡ vừa màn. Khung xem chỉ là lớp hiển thị: không đổi
// trạng thái bài làm, không đổi URL, không ghi bộ nhớ, nên đáp án đang nhập giữ nguyên.
import {IMAGE_ZOOM_LEVELS as LEVELS,initialZoomLevel as initialLevel} from './reading-tools';
const levelText=(level:number)=>'Phóng ×'+String(LEVELS[level]).replace('.',',');
// Ảnh đề là dải rộng (1562 px) nên "vừa bề ngang" trên điện thoại chỉ còn khoảng 24% cỡ gốc: khi mở chọn sẵn mức
// đọc được (initialZoomLevel); ảnh hình nhỏ hoặc màn rộng thì giữ vừa màn.

type Props={src:string;alt:string;width?:number;height?:number;label:string;watermark?:boolean;loading?:'lazy'|'eager';onError?:(event:SyntheticEvent<HTMLImageElement>)=>void};

export default function ZoomableImage({src,alt,width,height,label,watermark=false,loading='lazy',onError}:Props){
  const [open,setOpen]=useState(false);
  const [naturalWidth,setNaturalWidth]=useState(width??0);
  const trigger=useRef<HTMLButtonElement>(null),image=useRef<HTMLImageElement>(null);
  const wasOpen=useRef(false);
  const close=useCallback(()=>setOpen(false),[]);
  // Trả tiêu điểm về nút "Phóng to" sau khi khung xem đã gỡ (dialog.close() trả tiêu điểm về body trước đó).
  useEffect(()=>{if(wasOpen.current&&!open&&trigger.current?.isConnected)trigger.current.focus({preventScroll:true});wasOpen.current=open;},[open]);
  return <>
    <div className={`ep-inline-image${naturalWidth>600?' is-wide':''}`} style={{'--ep-readable-width':`${naturalWidth*.55}px`} as CSSProperties}>
      <div className="ep-inline-scroll"><img ref={image} className="ep-zoomable" src={src} width={width} height={height} alt={alt} loading={loading} decoding="async" onLoad={event=>setNaturalWidth(width??event.currentTarget.naturalWidth)} onError={onError} onClick={()=>setOpen(true)}/></div>
    </div>
    <div className={`ep-zoom-row${naturalWidth>600?' has-wide-image':''}`}><span className="ep-inline-hint">Chạm ảnh để xem to</span><button ref={trigger} type="button" className="ep-zoom-open" aria-haspopup="dialog" aria-label={`Phóng to ${label}`} onClick={()=>setOpen(true)}><span aria-hidden="true">⤢</span> Phóng to</button></div>
    {open&&<ZoomDialog src={src} alt={alt} width={width??(image.current?.naturalWidth||undefined)} height={height??(image.current?.naturalHeight||undefined)} label={label} watermark={watermark} onClose={close}/>}
  </>;
}

function ZoomDialog({src,alt,width,height,label,watermark,onClose}:{src:string;alt:string;width?:number;height?:number;label:string;watermark:boolean;onClose:()=>void}){
  const pattern=useId();
  const dialog=useRef<HTMLDialogElement>(null),area=useRef<HTMLDivElement>(null),closeButton=useRef<HTMLButtonElement>(null);
  const [level,setLevel]=useState(0);
  const swipe=useRef<{x:number;y:number;active:boolean;dy:number}|null>(null);
  useEffect(()=>{
    const node=dialog.current;if(!node)return;
    const close=openDialogCompat(node,{onCancel:onClose,initialFocus:closeButton.current});
    setLevel(initialLevel(area.current?.clientWidth??0,width));
    return close;
  },[]);
  // Giữ điểm giữa vùng đang xem khi đổi mức phóng, để không bị nhảy về góc trên trái.
  const zoomTo=(next:number)=>{
    // Review Codex đợt 4 vòng cuối: ảnh nhỏ hơn vùng xem thì nằm giữa (margin:auto), nên tính điểm theo toạ độ trong ảnh:
    // trừ khoảng căn giữa trước khi đổi, cộng khoảng căn giữa mới (đo lại sau khi vẽ) khi trả vị trí.
    const box=area.current,canvas=box?.firstElementChild as HTMLElement|null;if(next===level||next<0||next>=LEVELS.length)return;
    const ratio=LEVELS[next]/LEVELS[level];
    const px=box&&canvas?(box.scrollLeft+box.clientWidth/2-canvas.offsetLeft)*ratio:0,py=box&&canvas?(box.scrollTop+box.clientHeight/2-canvas.offsetTop)*ratio:0;
    setLevel(next);
    window.setTimeout(()=>{if(box&&canvas){box.scrollLeft=Math.max(0,px+canvas.offsetLeft-box.clientWidth/2);box.scrollTop=Math.max(0,py+canvas.offsetTop-box.clientHeight/2);}},0);
  };
  const reset=(element:HTMLElement|null)=>{if(element){element.style.transform='';element.style.opacity='';}};
  return createPortal(<dialog ref={dialog} className="ep-zoom-dialog" aria-label={`Xem lớn ${label}`} onCancel={event=>{event.preventDefault();onClose();}}>
    <div className="ep-zoom-bar">
      <p className="ep-zoom-title">{label}</p>
      <div className="ep-zoom-tools" role="group" aria-label="Mức phóng">
        <button type="button" onClick={()=>zoomTo(level-1)} disabled={level===0} aria-label="Thu nhỏ">−</button>
        <span aria-live="polite">{level===0?'Vừa màn':levelText(level)}</span>
        <button type="button" onClick={()=>zoomTo(level+1)} disabled={level===LEVELS.length-1} aria-label="Phóng to thêm">+</button>
      </div>
      <button ref={closeButton} type="button" className="ep-zoom-close" onClick={onClose}>Đóng <span aria-hidden="true">✕</span></button>
    </div>
    <div ref={area} className={`ep-zoom-area${level>0?' is-zoomed':''}`} tabIndex={0} aria-label="Vùng ảnh, cuộn để xem phần khác"
      onTouchStart={event=>{const t=event.touches[0];// Vuốt xuống để đóng chỉ khi vùng xem đang ở mép trên (kéo xuống lúc này vốn không cuộn được gì).
        swipe.current=event.touches.length===1&&(area.current?.scrollTop??0)<=0?{x:t.clientX,y:t.clientY,active:true,dy:0}:null;}}
      onTouchMove={event=>{const s=swipe.current,t=event.touches[0];if(!s?.active||!t)return;const dx=t.clientX-s.x,dy=t.clientY-s.y;
        if(dy<-10||Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)){s.active=false;reset(area.current?.firstElementChild as HTMLElement|null);return;}
        s.dy=Math.max(0,dy);const img=area.current?.firstElementChild as HTMLElement|null;if(img){img.style.transform=`translateY(${s.dy}px)`;img.style.opacity=String(Math.max(.4,1-s.dy/400));}}}
      onTouchEnd={()=>{const s=swipe.current;swipe.current=null;reset(area.current?.firstElementChild as HTMLElement|null);if(s?.active&&s.dy>90)onClose();}}
      onTouchCancel={()=>{swipe.current=null;reset(area.current?.firstElementChild as HTMLElement|null);}}>
      {/* Ảnh và lớp chữ chìm MTM đi cùng nhau (review Codex đợt 4): bản phóng to giữ watermark như trong bài. */}
      <div className="ep-zoom-canvas" style={{width:`calc(min(100%, ${width??2000}px) * ${LEVELS[level]})`}}>
        <img src={src} alt={alt} width={width} height={height} decoding="async"/>
        {watermark&&<svg className="mtm-source-watermark" aria-hidden="true" width="100%" height="100%"><defs><pattern id={pattern} width="390" height="115" patternUnits="userSpaceOnUse" patternTransform={`scale(${LEVELS[level]})`}><text x="24" y="40" transform="rotate(-8 24 40)">MINH THÀNH MATH</text></pattern></defs><rect width="100%" height="100%" fill={`url(#${pattern})`}/></svg>}
      </div>
    </div>
    <p className="ep-zoom-hint">{level===0?'Bấm + để phóng to. Vuốt xuống, bấm Đóng hoặc phím Esc để quay lại bài.':'Kéo để xem phần khác của ảnh; bấm − để thu nhỏ. Vuốt xuống ở mép trên hoặc bấm Đóng để quay lại bài.'}</p>
  </dialog>,document.body);
}
