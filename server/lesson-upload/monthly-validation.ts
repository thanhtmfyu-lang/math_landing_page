import {createBtvnPublishHandler,expectedSlots,type PublishPort} from '../btvn/publish-handler';
function need(value:unknown,code:string):asserts value{if(!value)throw Error(code);}
export async function validateMonthlyPayload(payload:any,port:PublishPort){
 const proof=payload.monthly_verification;
 need(proof?.passed===true&&proof.sourceVersion===payload.source_version&&proof.sympy?.engine==='sympy'&&proof.sympy.passed===true&&proof.sympy.sourceVersion===payload.source_version&&/^[a-f0-9]{64}$/.test(proof.sympy.receipt_hash)&&proof.sympy.version,'MONTHLY_SYMPY_REQUIRED');
 need(Array.isArray(proof.reviews)&&proof.reviews.length===2&&new Set(proof.reviews.map((r:any)=>r.provider)).size===2&&proof.reviews.every((r:any)=>['grok','agy'].includes(r.provider)&&r.sourceVersion===payload.source_version&&/^[a-f0-9]{64}$/.test(r.request_hash)),'TWO_INDEPENDENT_REVIEWS_REQUIRED');
 const slots=expectedSlots(payload.exam);
 need(Array.isArray(proof.sympy.slots)&&proof.sympy.slots.length===slots.length&&slots.every(s=>proof.sympy.slots.filter((r:any)=>r.question_id===s.question_id&&r.slot===s.slot).length===1),'SYMPY_COVERAGE');
 let normalized:any;const secret='monthly-local-production-validator-'.repeat(2);
 // Every independent result and CAS slot is checked by the unchanged production validator.
 for(const review of [...proof.reviews,{provider:'sympy',model:proof.sympy.version,receipt_hash:proof.sympy.receipt_hash,slots:proof.sympy.slots}]){
  const verification={...review,validator:true,independent:true,extractor_provider:payload.verification.extractor_provider,slots:slots.map(s=>{const matches=review.slots.filter((r:any)=>r.question_id===s.question_id&&r.slot===s.slot);need(matches.length===1,'REVIEW_COVERAGE');return {...matches[0],expected:s.expected};})};
  const handler=createBtvnPublishHandler({async rpc(a,p){if(a==='lookup')return {status:null};need(a==='publish','INVALID_MONTHLY_ACTION');normalized=p;return {status:'validated'};},upload:port.upload.bind(port)},secret);
  const response=await handler(new Request('https://monthly-validation.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':secret},body:JSON.stringify({...payload,action:'publish',verification})}));
  need(response.ok&&normalized,'MONTHLY_ANSWER_MISMATCH');
 }
 return {...normalized,verification:{...payload.verification,validator:true,independent:true},monthly_verification:proof};
}
