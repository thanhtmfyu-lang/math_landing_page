// Hook/SSR tổng hợp cho tương tác local, không thay thế trình duyệt thật.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
export const root=process.env.MTM_ROOT!;
export const require=createRequire(join(root,'package.json'));
export const React=require('react');
export const text=(tree:any):string=>tree==null||typeof tree==='boolean'?'':Array.isArray(tree)?tree.map(text).join(''):typeof tree==='object'?text(tree.props?.children):String(tree);
export const all=(tree:any,p:(node:any)=>boolean):any[]=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(node=>all(node,p)):[...(p(tree)?[tree]:[]),...all(tree.props?.children,p)];
export function load(file:string,hooks?:any,extra=''){
  const code=require('esbuild').buildSync({stdin:{contents:readFileSync(join(root,file),'utf8')+'\n'+extra,sourcefile:file,resolveDir:dirname(join(root,file)),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;
  const mod={exports:{} as any};new Function('require','module','exports',code)((id:string)=>id==='react'&&hooks?{...React,...hooks}:id.endsWith('.css')?{}:require(id),mod,mod.exports);return mod.exports;
}
export function mount(file:string,props:any={},exportName='default',extra=''){
  const values:any[]=[],effects:(()=>void)[]=[];let cursor=0,focused:any=null,scrolled:any=null,tree:any;
  const hooks={useId:()=>':daily19:',useRef:(initial:any)=>{const i=cursor++;if(!(i in values))values[i]={current:initial};return values[i];},useState:(initial:any)=>{const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],(next:any)=>values[i]=typeof next==='function'?next(values[i]):next];},useEffect:(effect:()=>void|(()=>void),deps:any[])=>{const i=cursor++,prior=values[i];if(!prior||deps.some((v,j)=>!Object.is(v,prior.deps[j]))){const slot={deps,cleanup:null as any};values[i]=slot;effects.push(()=>{prior?.cleanup?.();slot.cleanup=effect();});}}};
  const component=load(file,hooks,extra)[exportName];
  const draw=(next=props)=>{props=next;cursor=0;tree=component(props);for(const node of all(tree,()=>true)){const ref=Object.getOwnPropertyDescriptor(node.props,'ref')?.value??node.ref;if(ref&&typeof ref==='object')ref.current={open:true,focus:()=>focused={type:node.type,id:node.props.id,text:text(node)},scrollIntoView:(options:any)=>scrolled={type:node.type,id:node.props.id,text:text(node),options},select(){}};}while(effects.length)effects.shift()!();return tree;};
  const click=(label:string)=>{const b=all(tree,n=>n.type==='button'&&text(n)===label)[0];if(!b)throw Error('Thiếu nút '+label);b.props.onClick?.();draw();};
  draw();return {draw,click,get tree(){return tree;},get focused(){return focused;},get scrolled(){return scrolled;},unmount(){values.forEach(v=>v?.cleanup?.());}};
}
