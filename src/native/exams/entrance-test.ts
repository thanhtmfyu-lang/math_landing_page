import type {Result} from '../../../server/dau-vao/engine';
import {lichRanhText,type HoSo} from '../../../server/dau-vao/ho-so';
import {hoSoSummary,resultSummary} from '../../../server/dau-vao/phieu';
import {emailRegistration,normalizeRegistration} from '../../components/registration-submit';
export {resultSummary,hoSoSummary};
/** Đường dự phòng khi kho lead trên máy chủ chưa bật: gửi phiếu học thử + kết quả qua EmailJS như form đăng ký. */
export function entranceLeadPayload(h:HoSo,result:Result){
 const grade=['10','11','12'].includes(h.khoi)?h.khoi:h.khoi==='hsa'?'hsa':'thcs';
 const data=normalizeRegistration({studentName:h.hoTen,phone:h.sdtPh,grade,message:h.hinhThuc,notes:`Kiểm tra đầu vào: ${result.score}/10 · gợi ý ${result.suggestion.group}`,trial:true,trialSlot:lichRanhText(h).slice(0,80),leadSource:'Kiểm tra đầu vào web'+(h.leadSource?' · '+h.leadSource:'')});
 return {...emailRegistration(data),message:[hoSoSummary(h),'',resultSummary({name:h.hoTen,khoi:h.khoi,school:h.truong,result}),'— '+data.leadSource].join('\n')};
}
