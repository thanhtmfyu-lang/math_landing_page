import {approveRelease,canonical,hashJson,GateError,object,sha,type PinnedSource,type AcceptedItem,type ReleaseManifest} from './release-gate.ts';

/** Các binding này phải do registry đã kiểm cấp, không lấy từ request worker. */
export type BridgeRegistry={assignmentId:string;sourceId:string;classId:string;className:string;planHash:string;pin:PinnedSource;reviewed:Record<string,{sourceQuestionHash:string;item:AcceptedItem}>};
const fail=(ok:unknown,code:string)=>{if(!ok)throw new GateError(code);};
/** Chuyển hợp đồng Python sang web chỉ khi từng biến đổi đã có evidence.
 * Không tạo prompt, review receipt hoặc contentHash giả để khớp validator. */
export async function bridgePublicationPlan(plan:unknown,registry:BridgeRegistry){
  fail(object(plan),'PLAN_SCHEMA');if(!object(plan))throw new GateError('PLAN_SCHEMA');
  fail(plan.contract==='MTM-BTVN-RESILIENT-20261019-v1'&&['complete','partial','simple_pdf'].includes(String(plan.mode)),'PLAN_CONTRACT');
  fail(plan.assignment_id===registry.assignmentId&&plan.source_id===registry.sourceId&&plan.class_id===registry.classId,'PLAN_IDENTITY_MISMATCH');
  fail(plan.source_version===registry.pin.source.sourceVersion&&plan.scope_hash===registry.pin.source.scopeHash,'PLAN_SOURCE_MISMATCH');
  fail(plan.open_at===registry.pin.classOpensAt[registry.className]&&plan.due_at===registry.pin.classDueAt[registry.className]&&Object.hasOwn(registry.pin.source.classDates,registry.className),'PLAN_SCHEDULE_MISMATCH');
  fail(sha(plan.exam_version_hash)&&plan.exam_version_hash===registry.planHash,'PLAN_NOT_REGISTERED');
  const core=Object.fromEntries(Object.entries(plan).filter(([k])=>!['exam_version_hash','idempotency_key'].includes(k)));
  fail(await hashJson(core)===plan.exam_version_hash,'PLAN_HASH_MISMATCH');
  fail(plan.idempotency_key===await hashJson([plan.assignment_id,plan.exam_version_hash]),'PLAN_IDEMPOTENCY_MISMATCH');
  fail(object(plan.student_pdf)&&object(plan.teacher_answer_pdf)&&plan.student_pdf.sha256===registry.pin.source.hsSha256&&plan.teacher_answer_pdf.sha256===registry.pin.source.gvSha256,'PLAN_PDF_MISMATCH');
  fail(Array.isArray(plan.questions)&&Array.isArray(plan.manual_questions)&&object(plan.inventory),'PLAN_INVENTORY_REQUIRED');
  const questions=plan.questions as Record<string,unknown>[],manual=plan.manual_questions as Record<string,unknown>[];
  // Manual vẫn thuộc phạm vi; web transport hiện chưa có accepted manual.
  // Chặn mapping thay vì âm thầm hạ câu đã được giao thành pending.
  fail(manual.length===0,'ACCEPTED_MANUAL_REQUIRES_EXPLICIT_DOCUMENT_POLICY');
  const accepted:AcceptedItem[]=[],ids=new Set<string>();
  for(const q of questions){
    fail(object(q)&&typeof q.id==='string'&&!ids.has(q.id),'PLAN_QUESTION_ID');const id=String(q.id);ids.add(id);
    const review=registry.reviewed[id];fail(review&&review.sourceQuestionHash===await hashJson(q),'PLAN_QUESTION_REVIEW_MISMATCH');
    fail(review.item.id===id,'PLAN_QUESTION_REVIEW_MISMATCH');accepted.push(structuredClone(review.item));
  }
  const refs=registry.pin.inventory.map(x=>x.sourceRef);
  const planRefs=(plan.inventory as Record<string,unknown>).source_refs;
  fail(canonical(planRefs)===canonical(refs),'PLAN_SOURCE_ORDER_MISMATCH');
  if(Object.hasOwn(plan,'teacher_key_complete')||Object.hasOwn(plan,'teacher_key_coverage_refs')||Object.hasOwn(plan,'teacher_key_pending_refs')){
    fail(plan.teacher_key_complete===registry.pin.teacherPdfKeyComplete&&canonical(plan.teacher_key_coverage_refs)===canonical(registry.pin.teacherKeyCoveredSourceRefs)&&canonical(plan.teacher_key_pending_refs)===canonical(refs.filter(ref=>!registry.pin.teacherKeyCoveredSourceRefs.includes(ref))),'PLAN_TEACHER_KEY_COVERAGE_MISMATCH');
  }
  const manifest:ReleaseManifest={contract:'MTM-BTVN-RELEASE-20261019-v1',mode:plan.mode==='simple_pdf'?'pdf-simple':'partial',source:structuredClone(registry.pin.source),accepted,
    pending:await Promise.all(registry.pin.inventory.filter(q=>!ids.has(q.id)).map(async q=>({id:q.id,reasonCode:registry.pin.teacherKeyCoveredSourceRefs.includes(q.sourceRef)?'REVIEW_PENDING' as const:'ANSWER_MISSING' as const,repairTaskId:'repair_'+await hashJson([registry.pin.source.sourceVersion,registry.pin.source.scopeHash,q.id])}))),
    pdf:{questions:structuredClone(registry.pin.questionsPdf),answers:structuredClone(registry.pin.answersPdf),questionOnlyReceiptHash:registry.pin.questionOnlyReceiptHash,teacherKeyReceiptHash:registry.pin.teacherKeyReceiptHash}};
  const approved=await approveRelease(manifest,registry.pin);
  return {manifest,approved,pythonPlanHash:plan.exam_version_hash,manifestHash:approved.manifestHash};
}
