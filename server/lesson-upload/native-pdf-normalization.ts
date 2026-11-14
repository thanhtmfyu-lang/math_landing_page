/** Pure transport normalization. Never rewrites native source/cache or calls AI. */
import {createHash} from 'node:crypto';

export const NATIVE_PDF_NORMALIZATION_CONTRACT='MTM-WEB-NATIVE-PDF-PATHS-20261114-v1';
export type NativePdfPathMapping={old:string;path:string;sha256:string};
export type ChangedNativePdfNormalizationReceipt={contract:typeof NATIVE_PDF_NORMALIZATION_CONTRACT;changed:true;input_native_version:string;output_version:string;source_version:string;input_record_sha256:string;output_record_sha256:string;mappings:NativePdfPathMapping[]};
export type NativePdfNormalizationReceipt=ChangedNativePdfNormalizationReceipt|{contract:typeof NATIVE_PDF_NORMALIZATION_CONTRACT;changed:false;input_native_version:unknown;output_version:unknown};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function need(value:unknown,code:string):asserts value {if(!value)throw Error(code);}
/** Node-side receipt hashing; callers reuse this function rather than mirror it. */
export function nativeCanonicalJson(value:unknown):string{
 if(value===null)return 'null';
 if(typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){need(Number.isFinite(value),'NORMALIZATION_FINITE_JSON_REQUIRED');return JSON.stringify(value);}
 if(Array.isArray(value))return '['+value.map(nativeCanonicalJson).join(',')+']';
 need(record(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)),'NORMALIZATION_PLAIN_JSON_REQUIRED');
 return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+nativeCanonicalJson(value[key])).join(',')+'}';
}
export function nativeCanonicalDigest(value:unknown){return hash(nativeCanonicalJson(value));}

/** Preserve native raw response; return a separately versioned derived copy. */
export function normalizeNativePdfPaths(input:unknown,expectedSourceVersion:string):{value:any;receipt:NativePdfNormalizationReceipt}{
 need(record(input)&&sha(expectedSourceVersion)&&input.sourceVersion===expectedSourceVersion,'NORMALIZATION_SOURCE_REQUIRED');
 // Keep insertion order for JSON.stringify-based worker checkpoint projections.
 const original=nativeCanonicalJson(input),value=JSON.parse(JSON.stringify(input));
 const draft=value.draft,exam=draft?.exam,assets=draft?.assets;
 need(record(draft)&&record(exam)&&Array.isArray(assets),'NORMALIZATION_DRAFT_REQUIRED');
 const priorVersion=exam.versionHash;
 const unchanged=():{value:any;receipt:NativePdfNormalizationReceipt}=>({value,receipt:{contract:NATIVE_PDF_NORMALIZATION_CONTRACT,changed:false,input_native_version:priorVersion,output_version:priorVersion}});
 const refs:Record<string,any>[]=[];
 if(exam.sourcePdf!==undefined){need(record(exam.sourcePdf),'NORMALIZATION_PDF_REFS_REQUIRED');refs.push(exam.sourcePdf);}
 if(exam.mtmDocuments!==undefined){
  need(record(exam.mtmDocuments),'NORMALIZATION_PDF_REFS_REQUIRED');
  for(const name of ['questions','solutions'])if(exam.mtmDocuments[name]!==undefined){need(record(exam.mtmDocuments[name]),'NORMALIZATION_PDF_REFS_REQUIRED');refs.push(exam.mtmDocuments[name]);}
 }
 // No invented references and no rewrite of unreferenced PDF assets.
 if(!refs.length)return unchanged();
 const mappings:NativePdfPathMapping[]=[];
 const linked=new Map<Record<string,any>,string>();
 for(const ref of refs){
  need(typeof ref.url==='string'&&sha(ref.sha256),'NORMALIZATION_PDF_REFS_REQUIRED');
  const matches=assets.filter((asset:any)=>record(asset)&&asset.content_type==='application/pdf'&&'/'+asset.path===ref.url);
  need(matches.length===1&&matches[0].sha256===ref.sha256,'NORMALIZATION_PDF_REFERENCE_MISMATCH');
  const asset=matches[0];
  need(typeof asset.path==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_/-]*\.pdf$/.test(asset.path)&&!asset.path.includes('//')&&!asset.path.split('/').includes('..'),'NORMALIZATION_PDF_ASSET_REQUIRED');
  const path='exam-assets/'+ref.sha256+'.pdf';
  if(!linked.has(asset)&&asset.path!==path)mappings.push({old:asset.path,path,sha256:ref.sha256});
  linked.set(asset,path);ref.url='/'+path;
 }
 if(!mappings.length)return unchanged();
 need(sha(exam.versionHash)&&record(exam.mtmGrading)&&exam.mtmGrading.examVersion===exam.versionHash,'NORMALIZATION_NATIVE_VERSION_REQUIRED');
 for(const [asset,path] of linked)asset.path=path;
 need(assets.every((asset:any)=>record(asset)&&typeof asset.path==='string')&&new Set(assets.map((asset:any)=>asset.path)).size===assets.length,'NORMALIZATION_ASSET_COLLISION');
 mappings.sort((a,b)=>a.old<b.old?-1:a.old>b.old?1:0);
 const content=Object.fromEntries(Object.entries(exam).filter(([key])=>key!=='versionHash'&&key!=='mtmGrading'));
 const outputVersion=nativeCanonicalDigest({contract:NATIVE_PDF_NORMALIZATION_CONTRACT,input_native_version:priorVersion,source_version:expectedSourceVersion,content});
 exam.versionHash=outputVersion;exam.mtmGrading.examVersion=outputVersion;
 return {value,receipt:{contract:NATIVE_PDF_NORMALIZATION_CONTRACT,changed:true,input_native_version:priorVersion,output_version:outputVersion,source_version:expectedSourceVersion,input_record_sha256:hash(original),output_record_sha256:nativeCanonicalDigest(value),mappings}};
}
