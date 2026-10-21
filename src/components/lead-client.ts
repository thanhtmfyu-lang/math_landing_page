import type {Registration} from './registration-submit';
export type LeadKind='dang-ky'|'thi-thu-hsa'|'on-cuoi-ky-1';
/** Gửi lead về máy chủ trung tâm. 'saved': đã lưu; 'fallback': máy chủ chưa bật, gửi đường EmailJS cũ; lỗi thì ném Error tiếng Việt. */
export async function postLead(kind:LeadKind,data:Registration,fetcher:typeof fetch=fetch):Promise<'saved'|'fallback'>{
 const {studentName,phone,grade,message,notes,groupSize,groupInterest,trial,trialSlot,leadSource}=data;
 const r=await fetcher('/api/dang-ky',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,studentName,phone,grade,message,notes,groupSize,groupInterest,trial,trialSlot,leadSource})});
 const body=await r.json().catch(()=>null);
 // Trang chạy local (vite dev) không có /api: dùng đường cũ.
 if(r.status===404)return 'fallback';
 if(!r.ok)throw new Error(typeof body?.message==='string'?body.message:'Chưa gửi được đăng ký. Vui lòng thử lại.');
 if(body?.enabled===false)return 'fallback';
 if(body?.status!=='accepted'&&body?.status!=='already')throw new Error('Chưa xác nhận gửi được. Vui lòng thử lại.');
 return 'saved';
}
