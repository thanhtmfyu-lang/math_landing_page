type DialogOptions={onCancel:()=>void;initialFocus?:HTMLElement|null};
const activeDialogs:HTMLDialogElement[]=[];
let pageOverflow:string|undefined;

/** Close only the presentation. No answer, attempt, URL or storage is changed. */
export function closeDialogCompat(node:HTMLDialogElement|null){
  if(!node)return;
  try{if(typeof node.close==='function'&&node.open)node.close();}catch{/* Old WebViews can expose an incomplete dialog API. */}
  node.removeAttribute('open');
}

/** Native modal when available; a visible, focus-contained modal otherwise. */
export function openDialogCompat(node:HTMLDialogElement,{onCancel,initialFocus}:DialogOptions){
  const doc=node.ownerDocument,previous=doc.activeElement as HTMLElement|null;
  const role=node.getAttribute('role'),modal=node.getAttribute('aria-modal'),tabindex=node.getAttribute('tabindex');
  let scrim:HTMLElement|null=null,native=false,disposed=false;
  const focus=(element:HTMLElement|null|undefined)=>{try{element?.focus({preventScroll:true});}catch{element?.focus();}};
  const controls=()=>Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')).filter(el=>!el.hidden&&el.getClientRects().length>0);
  const focusFirst=()=>focus(initialFocus?.isConnected?initialFocus:controls()[0]??node);
  const top=()=>activeDialogs[activeDialogs.length-1]===node;
  node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');node.setAttribute('tabindex','-1');
  try{if(typeof node.showModal==='function'){node.showModal();native=true;}}catch{/* Use the same fallback as browsers without native dialogs. */}
  if(!native){
    node.setAttribute('open','');node.classList.add('mtm-dialog-fallback');
    scrim=doc.createElement('div');scrim.className='mtm-dialog-fallback-scrim';scrim.setAttribute('aria-hidden','true');
    scrim.addEventListener('click',()=>{if(top())onCancel();});node.parentNode?.insertBefore(scrim,node);
  }
  if(!activeDialogs.length){pageOverflow=doc.documentElement.style.overflow;doc.documentElement.style.overflow='hidden';}
  activeDialogs.push(node);
  const key=(event:KeyboardEvent)=>{
    if(!top())return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onCancel();return;}
    if(event.key!=='Tab')return;
    const items=controls(),first=items[0],last=items[items.length-1];
    if(!first){event.preventDefault();focus(node);}
    else if(event.shiftKey&&(doc.activeElement===first||!node.contains(doc.activeElement))){event.preventDefault();focus(last);}
    else if(!event.shiftKey&&(doc.activeElement===last||!node.contains(doc.activeElement))){event.preventDefault();focus(first);}
  };
  const contain=(event:FocusEvent)=>{if(top()&&!node.contains(event.target as Node))focusFirst();};
  doc.addEventListener('keydown',key,true);doc.addEventListener('focusin',contain);focusFirst();
  return()=>{
    if(disposed)return;disposed=true;
    doc.removeEventListener('keydown',key,true);doc.removeEventListener('focusin',contain);
    const index=activeDialogs.lastIndexOf(node);if(index>=0)activeDialogs.splice(index,1);
    closeDialogCompat(node);scrim?.remove();node.classList.remove('mtm-dialog-fallback');
    for(const [name,value] of [['role',role],['aria-modal',modal],['tabindex',tabindex]] as const){if(value===null)node.removeAttribute(name);else node.setAttribute(name,value);}
    // A parent room may already have restored its own scrolling during unmount.
    if(!activeDialogs.length){if(doc.documentElement.style.overflow==='hidden')doc.documentElement.style.overflow=pageOverflow??'';pageOverflow=undefined;}
    if(previous?.isConnected)focus(previous);
  };
}
