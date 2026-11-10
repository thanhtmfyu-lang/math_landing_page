import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import type {SourceQuestionLookup} from './room-presentation';
import type {QuestionPdf as QuestionPdfFile} from './pdf-source';
import './source-sheet.css';

const QuestionPdf=lazy(()=>import('./QuestionPdf'));
// Phiếu tham khảo không đổi trạng thái sẵn sàng của câu hỏi hay bài làm.
const referenceReady=()=>{};

export default function SourceSheetDialog({file,title,page,locate,number,onClose}:{file:QuestionPdfFile;title:string;page?:number;locate?:SourceQuestionLookup;number:number;onClose:()=>void}) {
  // Câu chưa có ánh xạ trang: tìm chữ "Câu N" trong phiếu; không thấy thì mở trang đầu và cho lật trang.
  const [located,setLocated]=useState<number|null|undefined>(page);
  const dialog=useRef<HTMLDialogElement>(null),closeButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const node=dialog.current,trigger=document.activeElement;
    if(!node)return;
    node.showModal();closeButton.current?.focus({preventScroll:true});
    return()=>{node.close();if(trigger instanceof HTMLElement&&trigger.isConnected)trigger.focus({preventScroll:true});};
  },[]);
  return <dialog ref={dialog} className="fr-source-dialog" aria-labelledby="fr-source-title" onCancel={event=>{event.preventDefault();onClose();}}>
    <header className="fr-source-bar"><div><h2 id="fr-source-title">Phiếu gốc · Câu {number}</h2><p>{located?`Trang ${located}/${file.totalPages} của phiếu`:located===null?'Chưa định vị được câu này; dùng nút ‹ › để xem các trang.':'Đang tìm trang của câu…'}</p></div><button ref={closeButton} type="button" className="fr-source-close" onClick={onClose}>Đóng phiếu</button></header>
    <div className="fr-source-body"><Suspense fallback={<p role="status">Đang mở phiếu gốc…</p>}><QuestionPdf file={file} title={title} targetPage={page} locate={page===undefined?locate??{number:0,occurrence:0}:undefined} onLocated={setLocated} onReady={referenceReady} allowFullscreen={false} compact fitToWidth/></Suspense></div>
  </dialog>;
}
