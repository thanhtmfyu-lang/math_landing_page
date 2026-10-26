import type {Registration} from './registration-submit';
export type LeadKind='dang-ky'|'thi-thu-hsa'|'on-cuoi-ky-1';
export const LEAD_ERROR='Chưa xác nhận lưu được thông tin. Vui lòng liên hệ Zalo 0967 365 413 để trung tâm kiểm tra trước khi gửi lại.';
/** Chỉ báo thành công khi máy chủ xác nhận đã lưu lead. */
export async function postLead(kind:LeadKind,data:Registration,fetcher:typeof fetch=fetch):Promise<'saved'>{
 const {studentName,phone,grade,message,notes,groupSize,groupInterest,trial,trialSlot,leadSource}=data;
 let r:Response;
 try{r=await fetcher('/api/dang-ky',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,studentName,phone,grade,message,notes,groupSize,groupInterest,trial,trialSlot,leadSource})});}
 catch{throw new Error(LEAD_ERROR);}
 const body=await r.json().catch(()=>null);
 if(!r.ok||body?.enabled===false||(body?.status!=='accepted'&&body?.status!=='already'))throw new Error(LEAD_ERROR);
 return 'saved';
}
