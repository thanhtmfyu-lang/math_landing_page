import type {PublishPort} from './publish-handler';
function requireValue(value:unknown,code:string):asserts value{if(!value)throw Error(code);}
const sha=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
/** Finite, secret-authenticated publication only. No AI calls, roster or regrading. */
export async function handleTwoPaperPublication(port:PublishPort,body:any,validate:(body:any,port:PublishPort)=>Promise<Response>){
 const pair=body.action==='publish_pair';
 requireValue(pair||body.action==='publish_variant','INVALID_TWO_PAPER_ACTION');
 requireValue(Object.keys(body).every(k=>(pair?['action','primary','second','review_evidence']:['action','lesson_key','expected_source_version','paper','review_evidence']).includes(k)),'INVALID_TWO_PAPER_FIELDS');
 const evidence=body.review_evidence;
 for(const provider of ['grok','agy'])requireValue(evidence?.[provider]&&typeof evidence[provider].model==='string'&&evidence[provider].model.trim()&&sha(evidence[provider].receipt_hash),'TWO_PROVIDER_EVIDENCE_REQUIRED');
 requireValue(evidence?.sympy?.status==='PASS'&&sha(evidence.sympy.receipt_hash),'SYMPY_EVIDENCE_REQUIRED');
 const inputs=pair?[body.primary,body.second]:[body.paper],normalized:any[]=[],assets:{path:string;bytes:Uint8Array;type:string;hash:string}[]=[];
 for(const input of inputs){
  requireValue(input?.action==='publish'&&(input.kind??'btvn')==='btvn','INVALID_TWO_PAPER_PAYLOAD');
  let captured:any=null;
  const response=await validate(input,{async rpc(action,payload){if(action==='lookup')return {status:null};requireValue(action==='publish','INVALID_TWO_PAPER_PAYLOAD');captured=payload;return {status:'validated'};},async upload(path,bytes,type,hash){assets.push({path,bytes,type,hash});}});
  requireValue(response.ok&&captured,response.headers.get('X-MTM-Reject-Code')??'TWO_PAPER_VALIDATION_FAILED');
  normalized.push(captured);
 }
 const code=pair?normalized[0].lesson_key:body.lesson_key;
 requireValue(typeof code==='string'&&/^[a-z0-9-]{1,150}$/.test(code)&&normalized.every(p=>p.lesson_key===code),'TWO_PAPER_LESSON_MISMATCH');
 if(pair)requireValue(normalized[0].exam.id!==normalized[1].exam.id,'TWO_PAPER_EXAM_ID_COLLISION');
 else requireValue(sha(body.expected_source_version),'PRIMARY_SOURCE_PIN_REQUIRED');
 // Preflight the current source before even immutable asset writes. The same
 // check repeats under the lesson lock in the atomic commit below.
 const payload=pair?{primary:normalized[0],second:normalized[1],review_evidence:evidence}:{lesson_key:code,expected_source_version:body.expected_source_version,second:normalized[0],review_evidence:evidence};
 const preflight=await port.rpc(pair?'two_paper_pair_preflight':'two_paper_variant_preflight',payload);
 if(preflight?.already_published===true)return {status:'already_published',lesson_key:code,papers:2,warnings:[],receipts_unchanged:true};
 for(const asset of assets)await port.upload(asset.path,asset.bytes,asset.type,asset.hash);
 return port.rpc(pair?'two_paper_pair_commit':'two_paper_variant_commit',payload);
}
