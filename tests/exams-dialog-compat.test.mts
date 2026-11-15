import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {openDialogCompat,closeDialogCompat} from '../src/native/exams/dialog-compat';

// Deliberately no real browser/native dialog in this unit: emulate API presence,
// event routing and focus so unsupported-WebView paths execute independently.
class Element {
  attrs=new Map<string,string>();classes=new Set<string>();children:Element[]=[];parentNode:Element|null=null;
  className='';hidden=false;isConnected=true;focuses=0;listeners=new Map<string,Set<(event:any)=>void>>();
  classList={add:(name:string)=>this.classes.add(name),remove:(name:string)=>this.classes.delete(name),contains:(name:string)=>this.classes.has(name)};
  constructor(public ownerDocument:Document){}
  setAttribute(name:string,value:string){this.attrs.set(name,value);}
  getAttribute(name:string){return this.attrs.get(name)??null;}
  hasAttribute(name:string){return this.attrs.has(name);}
  removeAttribute(name:string){this.attrs.delete(name);}
  get open(){return this.hasAttribute('open');}
  getClientRects(){return this.hidden?[]:[{}];}
  querySelectorAll(){return this.children;}
  contains(value:any):boolean{return this===value||this.children.some(child=>child.contains(value));}
  focus(){this.focuses++;this.ownerDocument.activeElement=this;this.ownerDocument.emit('focusin',{target:this});}
  addEventListener(name:string,callback:(event:any)=>void){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name)!.add(callback);}
  removeEventListener(name:string,callback:(event:any)=>void){this.listeners.get(name)?.delete(callback);}
  insertBefore(element:Element,before:Element){element.parentNode=this;this.children.splice(this.children.indexOf(before),0,element);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.isConnected=false;}
}
class Document {
  documentElement={style:{overflow:'scroll'}};activeElement:Element|null=null;
  listeners=new Map<string,Set<(event:any)=>void>>();
  createElement(){return new Element(this);}
  addEventListener(name:string,callback:(event:any)=>void){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name)!.add(callback);}
  removeEventListener(name:string,callback:(event:any)=>void){this.listeners.get(name)?.delete(callback);}
  emit(name:string,event:any){for(const callback of [...this.listeners.get(name)??[]])callback(event);}
}
function fixture(mode:'missing'|'native'|'throw'='missing',doc=new Document()){
  const body=new Element(doc),node=new Element(doc),first=new Element(doc),last=new Element(doc),previous=new Element(doc);
  first.parentNode=last.parentNode=node;node.children=[first,last];node.parentNode=body;body.children=[node];doc.activeElement=previous;
  let opens=0,closes=0,cancels=0;
  if(mode!=='missing')Object.assign(node,{showModal(){opens++;if(mode==='throw')throw Error('Unsupported native modal');node.setAttribute('open','');},close(){closes++;node.removeAttribute('open');}});
  const release=openDialogCompat(node as any,{initialFocus:first as any,onCancel:()=>cancels++});
  return {doc,body,node,first,last,previous,release,counts:()=>({opens,closes,cancels})};
}
function key(doc:Document,name:string,shift=false){
  const event={key:name,shiftKey:shift,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
  doc.emit('keydown',event);return event;
}

for(const mode of ['missing','throw'] as const){
  const f=fixture(mode);
  assert.equal(f.node.open,true);assert.equal(f.node.classList.contains('mtm-dialog-fallback'),true);
  assert.equal(f.body.children[0].className,'mtm-dialog-fallback-scrim');assert.equal(f.body.children[1],f.node);
  assert.equal(f.node.getAttribute('aria-modal'),'true');assert.equal(f.doc.activeElement,f.first);
  f.last.focus();assert.equal(key(f.doc,'Tab').prevented,true);assert.equal(f.doc.activeElement,f.first);
  assert.equal(key(f.doc,'Tab',true).prevented,true);assert.equal(f.doc.activeElement,f.last);
  const outside=new Element(f.doc);outside.focus();assert.equal(f.doc.activeElement,f.first);
  const escape=key(f.doc,'Escape');assert.equal(escape.prevented,true);assert.equal(escape.stopped,true);assert.equal(f.counts().cancels,1);
  for(const click of f.body.children[0].listeners.get('click')??[])click({});assert.equal(f.counts().cancels,2);
  f.release();assert.equal(f.node.open,false);assert.equal(f.body.children.length,1);assert.equal(f.doc.activeElement,f.previous);
  assert.equal(f.doc.documentElement.style.overflow,'scroll');assert.equal(f.node.getAttribute('aria-modal'),null);
  assert.equal(f.doc.listeners.get('keydown')?.size,0);assert.equal(f.doc.listeners.get('focusin')?.size,0);
  f.release();assert.equal(f.previous.focuses,1,'Cleanup is idempotent');
}
{
  const f=fixture('native');assert.equal(f.counts().opens,1);assert.equal(f.node.classList.contains('mtm-dialog-fallback'),false);assert.equal(f.body.children.length,1);
  f.release();assert.equal(f.counts().closes,1);assert.equal(f.node.open,false);
}
{
  const outer=fixture(),inner=fixture('missing',outer.doc);
  key(outer.doc,'Escape');assert.equal(outer.counts().cancels,0);assert.equal(inner.counts().cancels,1,'Only top modal responds');
  outer.release();assert.equal(outer.doc.documentElement.style.overflow,'hidden');
  inner.release();assert.equal(outer.doc.documentElement.style.overflow,'scroll');
}
{
  const f=fixture();f.doc.documentElement.style.overflow='auto';f.release();
  assert.equal(f.doc.documentElement.style.overflow,'auto','Do not overwrite scroll state already restored by unmounting room');
  const node=new Element(new Document());node.setAttribute('open','');Object.assign(node,{close(){throw Error('Incomplete dialog API');}});
  assert.doesNotThrow(()=>closeDialogCompat(node as any));assert.equal(node.open,false);
}
const css=readFileSync(join(process.env.MTM_ROOT!,'src/native/exams/dialog-compat.css'),'utf8');
assert.match(css,/\.mtm-dialog-fallback\[open\][^{]*\{[^}]*position:fixed;[^}]*z-index:10020/);
assert.match(css,/\.mtm-dialog-fallback-scrim\s*\{[^}]*z-index:10019/);
console.log('Dialog compatibility: native, missing/throwing API, fallback layer, focus/Escape, nesting and cleanup passed (unit DOM, no device claim).');
