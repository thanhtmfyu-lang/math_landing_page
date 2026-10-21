import {normalizeRegistration,type Registration} from '../../src/components/registration-submit';
import {canSdtHs,coSdtHs} from '../../src/components/student-phone';
export const LEAD_KINDS=['dang-ky','thi-thu-hsa','on-cuoi-ky-1'] as const;
export type LeadKind=typeof LEAD_KINDS[number];
const FIELDS=['kind','studentName','phone','grade','message','notes','groupSize','groupInterest','trial','trialSlot','leadSource'];
/** Kiểm lead từ trình duyệt bằng đúng luật của form; trả tham số RPC mtm_lead_add hoặc chuỗi lỗi tiếng Việt. */
export function leadRpcArgs(body:unknown):Record<string,unknown>|string{
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!FIELDS.includes(k)))return 'Yêu cầu không hợp lệ.';
 const b=body as Record<string,unknown>;
 if(!LEAD_KINDS.includes(b.kind as LeadKind))return 'Yêu cầu không hợp lệ.';
 if(b.kind==='on-cuoi-ky-1'&&!['10','11','12'].includes(String(b.grade)))return 'Chọn lớp 10, 11 hoặc 12.';
 for(const k of ['studentName','phone','grade','message','notes','groupSize','trialSlot','leadSource'])if(b[k]!==undefined&&typeof b[k]!=='string')return 'Yêu cầu không hợp lệ.';
 for(const k of ['groupInterest','trial'])if(b[k]!==undefined&&typeof b[k]!=='boolean')return 'Yêu cầu không hợp lệ.';
 if(typeof b.leadSource==='string'&&b.leadSource.length>300)return 'Yêu cầu không hợp lệ.';
 let d:Registration;
 try{d=normalizeRegistration({studentName:b.studentName as string,phone:b.phone as string,grade:b.grade as string,message:b.message as string,notes:b.notes as string|undefined,groupSize:b.groupSize as string|undefined,groupInterest:b.groupInterest as boolean|undefined,trial:b.trial as boolean|undefined,trialSlot:b.trialSlot as string|undefined,leadSource:b.leadSource as string|undefined});}
 catch(e){return e instanceof Error?e.message:'Yêu cầu không hợp lệ.';}
 if(canSdtHs(d.leadSource||'')&&!coSdtHs(d.notes||''))return 'Em điền số điện thoại của học sinh nhé (số di động 10 chữ số).';
 return {p_kind:b.kind,p_student_name:d.studentName,p_phone:d.phone,p_grade:d.grade,p_study_mode:d.message,p_trial:!!d.trial,p_trial_slot:d.trialSlot||'',p_group_size:d.groupSize||'',p_group_interest:!!d.groupInterest,p_notes:d.notes||'',p_lead_source:d.leadSource||''};
}
