import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {DV_TRACK_LABEL,type Result} from './engine';
import {CHON_BUOI,validateHoSo,lichRanhText,HS_GOAL_LABEL,HS_HEARD_LABEL,type HoSo} from './ho-so';
import {buoiCuaKhoi,buoiFromId,buoiGanNhat,buoiText,loadLich} from './lich-lop';
import {hoSoSummary,resultSummary} from './phieu';
// Phiếu học thử và kết quả bài kiểm tra đầu vào vào kho lead chung (mtm_lead.leads, migration 073 + 074).
// Bật cùng cờ MTM_LEAD_ENABLED=1 của kho lead; chưa bật thì trả enabled:false để trang gửi đường EmailJS cũ.
type Env=Record<string,string|undefined>;
export type LeadOut={status:number;body:unknown};
const sign=(key:Buffer,id:string)=>createHmac('sha256',key).update('dau-vao-ho-so:'+id).digest('hex');
/** Chữ ký mã phiếu: trình duyệt giữ (id, sig) để nộp bài gắn đúng phiếu, máy chủ không cần lưu phiên. */
export function validSig(key:Buffer,id:unknown,sig:unknown){
 if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)||typeof sig!=='string'||!/^[0-9a-f]{64}$/.test(sig))return false;
 return timingSafeEqual(Buffer.from(sign(key,id),'hex'),Buffer.from(sig,'hex'));
}
async function rpc(env:Env,transport:typeof fetch,name:string,args:Record<string,unknown>){
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Missing config');
 const url=new URL(env.SUPABASE_URL);if(url.protocol!=='https:')throw Error('HTTPS required');
 const r=await transport(url.origin+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('RPC failed');return r.json();
}
const grade=(h:HoSo)=>['10','11','12'].includes(h.khoi)?h.khoi:h.khoi==='hsa'?'hsa':'thcs';
/** Ghi phiếu học thử trước khi làm bài. */
export async function saveHoSo(raw:unknown,key:Buffer|null,today:string,env:Env,transport:typeof fetch=fetch,now=Date.now()):Promise<LeadOut>{
 const h=validateHoSo(raw,today);if(typeof h==='string')return {status:400,body:{message:h}};
 // Buổi chọn phải còn trong thời khóa biểu hiện hành của khối (lịch đổi giữa lúc mở trang và lúc gửi thì báo chọn lại).
 const lich=new Set(buoiCuaKhoi(await loadLich(env,transport),h.khoi,today).map(b=>b.id));
 if(lich.size&&!h.lichChon.length)return {status:400,body:{message:CHON_BUOI}};
 if(h.lichChon.some(x=>!lich.has(x)))return {status:400,body:{message:'Thời khóa biểu vừa cập nhật, em tải lại trang và chọn lại buổi học.'}};
 if(env.MTM_LEAD_ENABLED!=='1'||!key)return {status:200,body:{enabled:false}};
 const id=randomUUID(),gan=buoiGanNhat(h.lichChon,now);
 try{
  const data=await rpc(env,transport,'mtm_lead_dau_vao_add',{p_id:id,p_student_name:h.hoTen,p_phone:h.sdtPh,p_grade:grade(h),p_study_mode:h.hinhThuc,
   p_trial_slot:lichRanhText(h).slice(0,80),p_notes:hoSoSummary(h,now).slice(0,2000),p_lead_source:('Kiểm tra đầu vào web'+(h.leadSource?' · '+h.leadSource:'')).slice(0,300),
   p_ho_so:{khoi:h.khoi,khoi_label:DV_TRACK_LABEL[h.khoi],ngay_sinh:h.ngaySinh,truong:h.truong,lop_truong:h.lopTruong,phu_huynh:h.phuHuynh,sdt_hoc_sinh:h.sdtHs,
    lich_chon:h.lichChon.map(x=>{const b=buoiFromId(x);return {lop:b.lop,thu:b.thu,bat_dau:b.bat,ket_thuc:b.ket,text:buoiText(b)};}),
    buoi_gan_nhat:gan&&{lop:buoiFromId(gan.id).lop,ngay:gan.ngay,gio:gan.gio},muc_tieu:h.mucTieu?HS_GOAL_LABEL[h.mucTieu as keyof typeof HS_GOAL_LABEL]:'',nguon:h.nguon?HS_HEARD_LABEL[h.nguon as keyof typeof HS_HEARD_LABEL]:'',ghi_chu:h.ghiChu}});
  if(data?.status==='limit')return {status:429,body:{message:'Số điện thoại này đã đăng ký nhiều lần hôm nay. Em nhắn Zalo 0967 365 413 để được hỗ trợ.'}};
  if(!data||(data.status!=='accepted'&&data.status!=='already')||typeof data.id!=='string')throw Error('Invalid status');
  return {status:200,body:{enabled:true,id:data.id,sig:sign(key,data.id)}};
 }catch{return {status:503,body:{message:'Chưa lưu được phiếu thông tin. Em vẫn làm bài được, kết quả sẽ gửi MTM khi nộp.'}};}
}
/** Gắn kết quả vào phiếu sau khi máy chủ chấm; lỗi thì báo 'error' để trang gửi đường dự phòng. */
export async function saveKetQua(id:unknown,sig:unknown,result:Result,ctx:{name:string;school:string},key:Buffer|null,env:Env,transport:typeof fetch=fetch):Promise<'saved'|'off'|'error'>{
 if(env.MTM_LEAD_ENABLED!=='1'||!key)return 'off';
 if(!validSig(key,id,sig))return 'error';
 try{
  const ket={khoi:result.khoi,ma_bai:result.code,ngay:result.ngay,tuan:result.week,diem:result.score,dung:result.correct,tong:result.total,
   lop_goi_y:result.suggestion.group,muc_goi_y:result.suggestion.level,phan:result.bySection.map(s=>({ten:s.label,dung:s.correct,tong:s.total})),
   can_bu:result.topics.filter(t=>t.status!=='vung').map(t=>t.name)};
  const data=await rpc(env,transport,'mtm_lead_dau_vao_ket_qua',{p_id:id,p_ket_qua:ket,p_text:resultSummary({name:ctx.name,khoi:result.khoi,school:ctx.school,result}).slice(0,4000)});
  return data===true?'saved':'error';
 }catch{return 'error';}
}
