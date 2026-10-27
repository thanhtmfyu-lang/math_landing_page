import {displayTitle as titleText} from '../../components/display-text';
/// <reference path="./react-dom-portal.d.ts" />
import {lazy,Suspense,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Choice} from './assessment';
import type {PracticeAttemptProps} from './attempt-types';
import type {PracticeAttemptState} from './usePracticeAttempt';
import MtmSourceQuestion,{roomSourceDisplay} from './MtmSourceQuestion';
import {questionLabel,shortAnswerStatus,shortFormatMessage,shortInterpretationMessage,shortHelpMessage,shortHasAmbiguousSeparator,scoredQuestionCount} from './attempt-ui';
import {questionShortFormat} from './short-format';
import {MAX_SHORT_LENGTH} from './store';
import {localStore} from './local-store';
import {readAux,writeAux,roomShortcut,warningBand} from './room-aux';
import {RoomAnswerContext} from './RoomAnswerContext';
import {RoomQuestionContext} from './RoomQuestionContext';
import './focus-room.css';
import './r104-room.css';
import './r106-assessment.css';
import './btvn-room-mobile.css';
import RoomNotice from './RoomNotice';
import HomeworkBrowserHelp from '../homework/HomeworkBrowserHelp';
import SourceSheetDialog from './SourceSheetDialog';
import {sourceQuestionPage,roomSectionLabel} from './room-presentation';
const QuestionPdf=lazy(()=>import('./QuestionPdf'));

export default function FocusRoom({props,state,onExit}:{props:PracticeAttemptProps;state:PracticeAttemptState;onExit:()=>void}) {
  const {exam,displayTitle,questionReader,storeOverride}=props;
  const {draft,activeQuestion,setActiveQuestion,setQuestionFocus,seconds,answered,states,unsaved,notice,changeAnswer,pdfReady,setPdfReady,finish,confirmation}=state;
  const [aux,setAux]=useState(()=>readAux(storeOverride??localStore(),draft!.attemptId,exam.questions.length));
  const [menu,setMenu]=useState(false),[titleOpen,setTitleOpen]=useState(false);
  const [auxSaved,setAuxSaved]=useState(true),[sheet,setSheet]=useState(false),[help,setHelp]=useState(false),[tools,setTools]=useState(false),[full,setFull]=useState(false),[fullNotice,setFullNotice]=useState('');
  const [sourceQuestion,setSourceQuestion]=useState<string|null>(null);
  const host=useRef<HTMLDivElement>(null),toolsPanel=useRef<HTMLElement>(null),menuButton=useRef<HTMLButtonElement>(null),sheetButton=useRef<HTMLButtonElement>(null),sheetPanel=useRef<HTMLElement>(null),previousActive=useRef<Element|null>(null),initial=useRef(true),restoring=useRef(true),touch=useRef<{x:number;y:number}|null>(null);
  // Bàn phím di động thu vùng nhìn thấy; giữ thanh nút ngoài vùng đọc bằng flex.
  useEffect(()=>{
    if(!props.isHomework||typeof window==='undefined')return;
    const viewport=window.visualViewport,node=host.current;
    if(!viewport||!node)return;
    let frame=0,settle:ReturnType<typeof setTimeout>|undefined;
    const keepInputVisible=()=>{
      const input=document.activeElement,workspace=node.querySelector<HTMLElement>('.fr-workspace');
      if(!(input instanceof HTMLElement)||!input.matches('input,textarea')||!workspace?.contains(input))return;
      const bounds=input.getBoundingClientRect(),area=workspace.getBoundingClientRect();
      // Cuộn đúng vùng đọc, không kéo theo trang nền đã khóa cuộn.
      workspace.scrollTop+=bounds.top<area.top+12?bounds.top-area.top-12:Math.max(0,bounds.bottom-area.bottom+12);
    };
    const update=()=>{
      cancelAnimationFrame(frame);clearTimeout(settle);
      frame=requestAnimationFrame(()=>{
        if(viewport.scale!==1)return;
        node.style.setProperty('--btvn-viewport-height',`${viewport.height}px`);
        node.style.setProperty('--btvn-viewport-top',`${viewport.offsetTop}px`);
        keepInputVisible();
        // Trình duyệt còn điều chỉnh neo cuộn sau sự kiện bàn phím.
        settle=setTimeout(keepInputVisible,120);
      });
    };
    update();viewport.addEventListener('resize',update);viewport.addEventListener('scroll',update);node.addEventListener('focusin',update);
    return()=>{cancelAnimationFrame(frame);clearTimeout(settle);viewport.removeEventListener('resize',update);viewport.removeEventListener('scroll',update);node.removeEventListener('focusin',update);node.style.removeProperty('--btvn-viewport-height');node.style.removeProperty('--btvn-viewport-top');};
  },[props.isHomework]);
  useEffect(()=>{if(tools){toolsPanel.current?.focus();return()=>menuButton.current?.focus();}},[tools]);
  useLayoutEffect(()=>{setActiveQuestion(aux.active);},[]);
  useEffect(()=>{
    if(initial.current){initial.current=false;return;}
    setAuxSaved(writeAux(storeOverride??localStore(),draft!.attemptId,aux));
  },[aux,draft!.attemptId,storeOverride]);
  useEffect(()=>{if(restoring.current){restoring.current=false;return;}setAux(a=>a.active===activeQuestion?a:{...a,active:activeQuestion});},[activeQuestion]);
  useEffect(()=>{
    const root=document.getElementById('root'),wasInert=root?.inert,overflow=document.documentElement.style.overflow;
    previousActive.current=document.activeElement;if(root)root.inert=true;document.documentElement.style.overflow='hidden';host.current?.focus();
    return()=>{if(root)root.inert=wasInert??false;document.documentElement.style.overflow=overflow;if(previousActive.current instanceof HTMLElement&&previousActive.current.isConnected)previousActive.current.focus({preventScroll:true});};
  },[]);
  useEffect(()=>{const sync=()=>setFull(!!host.current&&document.fullscreenElement===host.current);document.addEventListener('fullscreenchange',sync);return()=>{document.removeEventListener('fullscreenchange',sync);if(host.current&&document.fullscreenElement===host.current)void document.exitFullscreen().catch(()=>{});};},[]);
  // Thoát fullscreen để hộp xác nhận ở cổng body luôn nhìn thấy được.
  useEffect(()=>{if(confirmation&&host.current&&document.fullscreenElement===host.current)void document.exitFullscreen().catch(()=>{});},[confirmation]);
  const go=(index:number)=>{setActiveQuestion(Math.min(exam.questions.length-1,Math.max(0,index)));setQuestionFocus(true);setSheet(false);};
  useEffect(()=>setSourceQuestion(null),[activeQuestion]);
  const mark=()=>setAux(a=>({...a,marked:a.marked.includes(activeQuestion)?a.marked.filter(i=>i!==activeQuestion):[...a.marked,activeQuestion]}));
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||confirmation||document.querySelector?.('[role="alertdialog"],[role="dialog"][aria-modal="true"],dialog[open]'))return;
      if(event.key==='Escape'&&(sheet||help||tools||menu||titleOpen)){event.preventDefault();setSheet(false);setHelp(false);setTools(false);setMenu(false);setTitleOpen(false);sheetButton.current?.focus();return;}
      const editing=event.target instanceof Element&&!!event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
      const shortcut=roomShortcut(event,editing);if(!shortcut||sheet||help||tools||menu)return;
      const q=exam.questions[activeQuestion];
      if(shortcut==='arrowleft'){event.preventDefault();go(activeQuestion-1);}
      else if(shortcut==='arrowright'){event.preventDefault();go(activeQuestion+1);}
      else if(shortcut==='m'){event.preventDefault();mark();}
      else if(shortcut==='?'){event.preventDefault();setHelp(true);}
      else if(q.kind==='mc'&&pdfReady&&!state.failedQuestions?.has(q.id)){event.preventDefault();changeAnswer(q.id,shortcut.toUpperCase() as Choice);}
    };
    document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
  });
  useEffect(()=>{if(!sheet)return;sheetPanel.current?.querySelector<HTMLButtonElement>('button')?.focus();const key=(event:KeyboardEvent)=>{if(event.key!=='Tab')return;const buttons=Array.from(sheetPanel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[href],input,textarea')??[]),first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[sheet]);
  const band=warningBand(seconds),[warning,setWarning]=useState(''),lastBand=useRef(0);
  useEffect(()=>{if(band!==lastBand.current){lastBand.current=band;if(band)setWarning(`Còn ${band} phút. Hãy kiểm tra các câu chưa xong và câu đánh dấu.`);}},[band]);
  const toggleFull=async()=>{try{if(host.current&&document.fullscreenElement===host.current)await document.exitFullscreen();else if(host.current?.requestFullscreen)await host.current.requestFullscreen();else setFullNotice('Trình duyệt chưa hỗ trợ toàn màn hình. Phòng tập trung vẫn dùng bình thường.');}catch{setFullNotice('Chưa mở được toàn màn hình. Bài làm vẫn được giữ.');}};
  const nextMatching=(predicate:(i:number)=>boolean)=>{for(let n=1;n<=exam.questions.length;n++){const i=(activeQuestion+n)%exam.questions.length;if(predicate(i)){go(i);return;}}};
  const q=exam.questions[activeQuestion];
  const sourceLabel=questionLabel(exam,activeQuestion);
  const label=props.isHomework?{...sourceLabel,number:activeQuestion+1,full:`Câu ${activeQuestion+1} · ${sourceLabel.part}`}:sourceLabel;
  const questionReady=pdfReady&&!state.failedQuestions?.has(q.id);
  const answer=draft!.answers[q.id],tfAnswers=Array.isArray(answer)?answer:[null,null,null,null];
  const shortFormat=questionShortFormat(exam,q);
  const questionPage=sourceQuestionPage(exam,q);
  const fullTitle=titleText(displayTitle??exam.title);
  const titleParts=fullTitle.split(/\s*[·–]\s*/);
  const titleSubtitle=titleParts.flatMap(part=>part.match(/^(Chương[^:]*|Bài\s+\d+)/i)?.[0]??[]).join(' · ');
  const shortTitle=titleParts.filter(part=>!/^Chương/i.test(part)).map(part=>part.replace(/^Bài\s+\d+\s*:\s*/i,'')).join(' · ')||fullTitle;
  const inlineChoices=q.kind==='mc'&&(!!roomSourceDisplay(q)?.choices?.length||!!questionReader&&!q.sourceContent);
  const answerStatus=q.kind==='self'&&props.onOpenEssay?'Tự luận · GV chấm':q.kind==='mc'?(answer?`Đã chọn ${answer}`:'Chưa trả lời'):q.kind==='tf'?`${tfAnswers.filter(v=>typeof v==='boolean').length}/4 ý đã chọn`:q.kind==='short'&&shortAnswerStatus(q.mode,answer,shortFormat)==='invalid'?'Sai định dạng':typeof answer==='string'&&answer.trim()?`Đã nhập ${answer}`:'Chưa trả lời';
  const saveLabel=props.isHomework?(props.saveStatus??'Đang giữ trên trang'):(unsaved?'Chưa lưu bài':'Đã lưu');
  const saveAction=!!(props.onRetrySave||props.onAcceptClosed);
  const showSaveStatus=saveAction||props.savePending;
  const closeSheet=()=>{setSheet(false);sheetButton.current?.focus();};
  useEffect(()=>{
    if(sheet)return;
    const panel=sheetPanel.current,selected=panel?.querySelector<HTMLElement>('[aria-current="step"]');
    if(!panel||!selected)return;
    const bounds=panel.getBoundingClientRect(),item=selected.getBoundingClientRect();
    const delta=item.left<bounds.left+8?item.left-bounds.left-8:item.right>bounds.right-8?item.right-bounds.right+8:0;
    if(delta)panel.scrollTo({left:panel.scrollLeft+delta,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  },[activeQuestion,sheet]);
  return createPortal(<div ref={host} tabIndex={-1} data-homework={props.isHomework||undefined} className={`ep-root fr-room r104-room r106-room${aux.dark?' fr-dark':''}`} aria-label="Phòng làm bài tập trung" style={{'--fr-font':aux.font} as React.CSSProperties}>
    <header className="fr-top"><div className="fr-brand"><span className="fr-brand-symbol"><img src="/mtm-original-logo-420w.webp" alt="Minh Thành Math" width="160" height="30"/></span><b aria-hidden="true">MTM</b></div><div className="fr-title"><button className="fr-title-button" aria-label={`Xem tên đầy đủ: ${fullTitle}`} aria-expanded={titleOpen} onClick={()=>setTitleOpen(v=>!v)}><strong title={fullTitle}><span className="fr-title-long">{fullTitle}</span><span className="fr-title-short">{shortTitle}</span></strong></button><small>{titleSubtitle||'Minh Thành Math'}</small></div><time className={`fr-clock fr-band-${band}`} role="timer" aria-label="Thời gian còn lại" aria-live="off"><small>THỜI GIAN CÒN LẠI</small><strong>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</strong></time><div className="fr-progress"><span>{answered}/{scoredQuestionCount(exam)} câu đã làm</span><progress aria-label="Tiến độ làm bài" max={scoredQuestionCount(exam)} value={answered}/></div><button className={`fr-submit${answered===scoredQuestionCount(exam)||seconds<=300?' is-ready':''}`} disabled={!pdfReady} onClick={()=>finish(false)}>Nộp bài</button><button ref={menuButton} className="fr-menu-toggle" aria-label="Tiện ích phòng làm bài" aria-expanded={menu} aria-controls="fr-actions" onClick={()=>setMenu(v=>!v)}><span aria-hidden="true">⋯</span><span className="fr-menu-label">Tiện ích</span></button><div id="fr-actions" className={`fr-actions${menu?' is-open':''}`}><button className="fr-menu-title" onClick={()=>{setTitleOpen(true);setMenu(false);}}>Tên đề: {fullTitle}</button><button onClick={()=>{void toggleFull();setMenu(false);}}>{full?'Thoát toàn màn hình':'Toàn màn hình'}</button><button onClick={onExit}>Thoát tập trung</button><button disabled={!pdfReady} onClick={()=>{setMenu(false);finish(false);}}>Nộp bài</button><button aria-expanded={tools} onClick={()=>{setTools(v=>!v);setMenu(false);}}>{props.isHomework&&props.homeworkSelfCheck?'Tự kiểm / Tiện ích':'Tiện ích'}</button><button aria-expanded={help} onClick={()=>{setHelp(v=>!v);setMenu(false);}}>{props.isHomework?'Hướng dẫn / Zalo':'Phím tắt ?'}</button></div></header>
    {titleOpen&&<section className="fr-tool-panel" aria-label="Tên đầy đủ của đề"><strong>{fullTitle}</strong><button onClick={()=>setTitleOpen(false)}>Đóng tên đề</button></section>}
    {(notice||unsaved)&&!showSaveStatus&&<p className="fr-notice" role="alert">{notice||'Chưa xác nhận lưu bài. Hãy giữ trang mở và tải bản lưu.'}{unsaved&&<button onClick={()=>{onExit();}}>Mở bản lưu bài làm</button>}</p>}
    {showSaveStatus&&<div className={`fr-save-status${props.onRetrySave?' is-error':''}`}><p role="status" aria-live="polite">{props.saveStatus||notice||'Chờ máy chủ lưu. Bài đang giữ trên trang.'}</p>{props.onRetrySave&&<button type="button" onClick={props.onRetrySave}>Gửi lại bài đang giữ</button>}{props.onAcceptClosed&&<button type="button" onClick={props.onAcceptClosed}>Chấp nhận bản máy chủ đã chấm</button>}</div>}
    <p className="fr-warning" role="status" aria-live="polite">{[warning,fullNotice,!auxSaved?'Chưa lưu được ghi chú và dấu xem lại; bài làm được lưu riêng.':''].filter(Boolean).join(' ')}</p>
    {help&&<section className="fr-tool-panel" aria-label="Phím tắt"><strong>Thao tác nhanh</strong><p>A / B / C / D: chọn đáp án · ← / →: đổi câu · M: đánh dấu · ?: trợ giúp. Phím tắt tạm ngừng khi nhập văn bản. Esc đóng bảng phụ hoặc thoát toàn màn hình, không mất bài.</p>{props.isHomework&&<HomeworkBrowserHelp/>}<button onClick={()=>setHelp(false)}>Đóng hướng dẫn</button></section>}
    {tools&&<section ref={toolsPanel} tabIndex={-1} className="fr-tool-panel" aria-label="Tiện ích phòng làm bài">{props.isHomework&&props.homeworkSelfCheck&&<div className="fr-homework-self-check">{props.homeworkSelfCheck}</div>}<label>Cỡ chữ <select value={aux.font} onChange={e=>setAux(a=>({...a,font:Number(e.target.value)}))}><option value="1">100%</option><option value="1.15">115%</option><option value="1.3">130%</option></select></label><button aria-pressed={aux.dark} onClick={()=>setAux(a=>({...a,dark:!a.dark}))}>Nền tối {aux.dark?'bật':'tắt'}</button><label className="fr-notes">Nháp chữ riêng · {label.full}<textarea maxLength={2000} value={aux.notes[activeQuestion]??''} onChange={e=>{const text=e.target.value;setAux(a=>({...a,notes:{...a.notes,[activeQuestion]:text}}));}} placeholder="Chỉ lưu trên trình duyệt này. Không ghi thông tin cá nhân."/></label><small>Nháp chữ không được chấm, không gửi lên máy chủ.</small><button onClick={()=>setTools(false)}>Đóng tiện ích</button></section>}
    <div className="fr-study-layout"><aside ref={sheetPanel} className={`fr-sheet${sheet?' is-open':''}`} role={sheet?'dialog':undefined} aria-modal={sheet||undefined} aria-label="Phiếu trả lời"><div className="fr-sheet-title"><h2>Bảng câu <small> {answered}/{exam.questions.length} đã làm</small></h2><button className="fr-sheet-close" onClick={closeSheet}>Đóng</button></div>
      <p className="fr-legend">○ Chưa làm · ● Đã làm · ◐ Làm dở · ★ Xem lại</p>
      {state.sections.map((part,partIndex)=><section key={`${partIndex}:${part.name}`}><h3 className="fr-section-label" title={part.name} aria-label={part.name}>{props.isHomework?roomSectionLabel(part.name,partIndex):part.name.match(/^I{1,3}(?=\s|$|[\u00b7.])/u)?.[0]??String(partIndex+1)}</h3><nav className="fr-grid" aria-label={part.name}>{exam.questions.slice(part.from,part.to).map((question,j)=>{const index=part.from+j,marked=aux.marked.includes(index),status=states[index],label=status==='self'?(props.onOpenEssay?'tự luận, giáo viên chấm':'tự làm, không tính điểm'):status==='answered'?'đã làm':status==='partial'?'làm dở':status==='invalid'?'sai định dạng':'chưa làm';return <button key={question.id} aria-current={activeQuestion===index?'step':undefined} className={`fr-${status}${marked?' fr-marked':''}`} aria-label={`${props.isHomework?`Câu ${index+1} · ${part.name}`:questionLabel(exam,index).full}: ${label}${marked?', đánh dấu xem lại':''}`} onClick={()=>go(index)}>{props.isHomework?index+1:j+1}{marked?' ★':status==='partial'?' ◐':status==='invalid'?' !':''}</button>;})}</nav></section>)}
      <button className="fr-sheet-submit" disabled={!pdfReady} onClick={()=>{closeSheet();finish(false);}}>Nộp bài</button><button className="fr-wide" disabled={states.every(s=>s==='answered'||s==='self')} onClick={()=>nextMatching(i=>states[i]!=='answered'&&states[i]!=='self')}>Đến câu chưa xong</button><button className="fr-wide" disabled={!aux.marked.length} onClick={()=>nextMatching(i=>aux.marked.includes(i))}>Xem câu đánh dấu ({aux.marked.length})</button><RoomNotice isHomework={props.isHomework} focused/>
    </aside>
    <main className={`fr-workspace${exam.sourcePdf&&!props.isHomework?' fr-pdf-workspace':''}`}><section className="fr-paper" data-question-id={q.id} aria-label="Đề và trả lời" onLoadCapture={event=>{if(event.target instanceof HTMLImageElement&&event.target.closest('.mtm-source-content')){const paper=event.currentTarget;if(!paper.querySelector('.mtm-source-content [role="alert"]')&&Array.from(paper.querySelectorAll<HTMLImageElement>('.mtm-source-content img')).every(image=>image.complete&&image.naturalWidth>0))state.setQuestionAssetReady?.(q.id,true);}}} onErrorCapture={event=>{if(event.target instanceof HTMLImageElement&&event.target.closest('.mtm-source-content')){state.setQuestionAssetReady?.(q.id,false);state.setNotice?.('Một phần đề chưa tải. Em vẫn làm câu khác và nộp phần đã làm; dùng nút Thử tải lại ảnh ở câu lỗi.');}}} onTouchStart={event=>{if(event.touches.length!==1||event.target instanceof Element&&event.target.closest('input,textarea,select,button,a,canvas,.ep-pdf-sheet,.ep-zoomable,.ep-zoom-row,.mtm-formula,.ep-inline-math,.ep-formula,.ep-formula-line,.ep-table-wrap,table,.ep-question-pdf')){touch.current=null;return;}touch.current={x:event.touches[0].clientX,y:event.touches[0].clientY};}} onTouchEnd={event=>{const start=touch.current;touch.current=null;if(!start||event.changedTouches.length!==1)return;const dx=event.changedTouches[0].clientX-start.x,dy=event.changedTouches[0].clientY-start.y;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.7)go(activeQuestion+(dx<0?1:-1));}}>
      {props.onOpenEssay&&<button type="button" className="btvn-btn" onClick={props.onOpenEssay}>Nộp ảnh tự luận</button>}<div className="fr-question-heading" id={`ep-question-${activeQuestion}`} tabIndex={-1}><span>Câu {label.number} · {q.kind==='self'&&props.onOpenEssay?'GV chấm':(q.maxMillipoints/1000).toLocaleString('vi-VN')+' điểm'}</span><small title={label.part}>{q.kind==='mc'?'Trắc nghiệm':q.kind==='tf'?'Đúng / Sai':q.kind==='self'&&props.onOpenEssay?'Tự luận trên giấy':'Trả lời ngắn'} · {label.part.split(' · ')[0].replace(/^(I{1,3})$/, 'Phần $1')}</small><button aria-label={aux.marked.includes(activeQuestion)?'Bỏ đánh dấu xem lại':'Đánh dấu để xem lại'} title="Đánh dấu để xem lại" aria-pressed={aux.marked.includes(activeQuestion)} onClick={mark}><span aria-hidden="true">{aux.marked.includes(activeQuestion)?'★':'☆'}</span><span className="fr-mark-label">{aux.marked.includes(activeQuestion)?' Đã đánh dấu':' Đánh dấu để xem lại'}</span></button></div>
      <RoomAnswerContext.Provider value={{questionId:q.id,answer,disabled:!questionReady,choose:choice=>changeAnswer(q.id,answer===choice?null:choice)}}><RoomQuestionContext.Provider value={activeQuestion}>{questionReader||<>{(q.prompt||q.text)&&<p className="ep-source-text">{props.renderText?props.renderText(q.prompt??q.text!):q.prompt??q.text}</p>}<MtmSourceQuestion question={q}/></>}</RoomQuestionContext.Provider>
      {exam.sourcePdf&&!props.isHomework&&<div className="fr-pdf-document"><Suspense fallback={<p role="status">Đang mở bản câu hỏi…</p>}><QuestionPdf file={exam.sourcePdf} title={titleText(exam.title)} onReady={setPdfReady} targetPage={questionPage} allowFullscreen={false} compact fitToWidth={props.isHomework}/>{!questionPage&&<p>Chưa có vị trí trang cho câu này; chọn trang bằng nút trên bản đề.</p>}</Suspense></div>}
      {props.isHomework&&exam.sourcePdf&&<div className="fr-source-action"><button type="button" className="fr-source-open" aria-haspopup="dialog" disabled={questionPage===undefined} onClick={()=>setSourceQuestion(q.id)}>Xem phiếu gốc</button>{questionPage===undefined&&<p>Chưa xác định được trang phiếu gốc của câu này.</p>}</div>}
      {!inlineChoices&&<section className="fr-quick" aria-label={`Trả lời ${label.full}`}>
      <fieldset disabled={!questionReady}><legend className="fr-sr-only">Câu {label.number} · Trả lời nhanh</legend>
        {q.kind==='self'&&(props.onOpenEssay?<p>Tự luận trên giấy — GV chấm. Chụp và gửi đủ trang bài làm bằng nút Nộp ảnh tự luận. Điểm máy chỉ tạm tính.</p>:<p>Tự làm, xem lời giải sau khi nộp. Không tính điểm.</p>)}
        {q.kind==='mc'&&!inlineChoices&&<div className={`fr-quick-mc${!q.sourceContent&&!exam.sourcePdf?' fr-text-choices':''}`}>{(['A','B','C','D'] as Choice[]).map((choice,i)=><button key={choice} aria-label={!q.sourceContent&&!exam.sourcePdf&&q.choices[i]!==choice?undefined:`Chọn ${choice}`} aria-pressed={answer===choice} onClick={()=>changeAnswer(q.id,answer===choice?null:choice)}><span className="fr-sr-only">Chọn </span><span className="fr-choice-letter">{choice}</span>{!q.sourceContent&&!exam.sourcePdf&&q.kind==='mc'&&q.choices[i]!==choice&&<span>{props.renderText?props.renderText(q.choices[i]):q.choices[i]}</span>}<span className="fr-choice-tick" aria-hidden="true">✓</span></button>)}</div>}
        {q.kind==='tf'&&<div className="fr-quick-tf">{['a','b','c','d'].map((letter,i)=><div key={letter} role="group" aria-label={`Ý ${letter}`}><span>{letter})</span>{q.kind==='tf'&&q.statements?.[i]&&<p>{props.renderText?props.renderText(q.statements[i]):q.statements[i]}</p>}{[true,false].map(value=><button key={String(value)} aria-label={`Ý ${letter}: ${value?'Đúng':'Sai'}`} aria-pressed={tfAnswers[i]===value} onClick={()=>{const next=[...tfAnswers] as (boolean|null)[];next[i]=next[i]===value?null:value;changeAnswer(q.id,next);}}>{value?'Đúng':'Sai'}</button>)}</div>)}</div>}
        {q.kind==='short'&&<><label htmlFor="fr-quick-short">Đáp án</label><input id="fr-quick-short" className="ep-short" type="text" inputMode="text" maxLength={MAX_SHORT_LENGTH} autoComplete="off" spellCheck={false} value={typeof answer==='string'?answer:''} aria-invalid={shortAnswerStatus(q.mode,answer,shortFormat)==='invalid'||undefined} aria-describedby="fr-quick-format fr-quick-interpretation fr-quick-help" onChange={event=>changeAnswer(q.id,event.target.value)}/><div className="ep-short-feedback"><small id="fr-quick-interpretation" className={`ep-short-interpretation${shortHasAmbiguousSeparator(q.mode,answer,shortFormat)?' is-ambiguous':''}`}>{shortInterpretationMessage(q.mode,answer,shortFormat)}</small><small id="fr-quick-format" className="ep-format-error" aria-live="polite">{shortAnswerStatus(q.mode,answer,shortFormat)==='invalid'?shortFormatMessage(q.mode,shortFormat):''}</small></div><small id="fr-quick-help">{shortHelpMessage(q.mode,shortFormat)}</small></>}
      </fieldset>
    </section>}
<p className="fr-source-credit">MTM sưu tầm và biên soạn</p></RoomAnswerContext.Provider><nav className="fr-navigation" aria-label="Điều hướng câu"><button aria-label="Câu trước" disabled={activeQuestion===0} onClick={()=>go(activeQuestion-1)}>← Câu trước</button><button aria-label="Câu sau" disabled={activeQuestion===exam.questions.length-1} onClick={()=>go(activeQuestion+1)}>Câu tiếp →</button><span>{answerStatus} · {saveLabel}</span></nav>
    </section></main></div>
    {props.isHomework&&sourceQuestion===q.id&&exam.sourcePdf&&questionPage!==undefined&&<SourceSheetDialog key={q.id} file={exam.sourcePdf} title={titleText(exam.title)} page={questionPage} number={label.number} onClose={()=>setSourceQuestion(null)}/>}
    {sheet&&<button className="fr-scrim" aria-label="Đóng phiếu trả lời" onClick={closeSheet} tabIndex={-1}/>}
    <div className="fr-answer-dock"><nav className="fr-mobile-nav" aria-label="Điều hướng câu trên điện thoại"><button disabled={activeQuestion===0} onClick={()=>go(activeQuestion-1)}>← Trước</button><button className="fr-sheet-toggle" ref={sheetButton} aria-label="Mở phiếu trả lời" aria-expanded={sheet} aria-haspopup="dialog" onClick={()=>setSheet(v=>!v)}>{activeQuestion+1}/{exam.questions.length} {aux.marked.includes(activeQuestion)?'★ ':''}▦</button><button disabled={activeQuestion===exam.questions.length-1} onClick={()=>go(activeQuestion+1)}>Sau →</button><button className="fr-submit" disabled={!pdfReady} onClick={()=>finish(false)}>Nộp bài</button></nav><small>{answerStatus} · {saveLabel}</small></div>
  </div>,document.body);
}
