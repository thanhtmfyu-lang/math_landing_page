import raw from './hsa-mock.json';
import {HSA_GRADE_LABEL,validHsaExamId,type HsaGrade} from '../../../server/hsa/rank';
import {emailRegistration,normalizeRegistration} from '../../components/registration-submit';
/** Cấu hình đề cho /thi-thu-hsa. Nội dung đề không nằm ở đây: chỉ trỏ tới đề đã có trong ngân hàng MTM
 * (hsa-paper: đề chuyển từ tệp của tổ Học liệu bằng scripts/convert-hsa-paper.mjs, nằm ở ./hsa-papers). */
export type HsaMockSource='practice-bank'|'catalog'|'hsa-paper';
/** pointsScale: thang điểm hiển thị (đề HSA thật: 50, mỗi câu đúng 1 điểm); bộ chấm vẫn dùng thang 10. */
export type HsaMockExam={slug:string;examId:string;source:HsaMockSource;title:string;placeholder:boolean;active:boolean;pointsScale?:number};
export type HsaMockConfig={version:1;exams:HsaMockExam[]};
export function validateHsaMockConfig(input:unknown):{ok:true;value:HsaMockConfig}|{ok:false;errors:string[]}{
 const errors:string[]=[],o=input as Record<string,unknown>;
 if(!o||typeof o!=='object'||Array.isArray(o)||o.version!==1)return {ok:false,errors:['Cần version 1']};
 if(!Array.isArray(o.exams)||!o.exams.length||o.exams.length>20)return {ok:false,errors:['Cần 1–20 đề']};
 const slugs=new Set<string>(),ids=new Set<string>();
 o.exams.forEach((e:any,i:number)=>{
  const at='Đề '+(i+1)+': ';
  if(!e||typeof e!=='object'){errors.push(at+'không hợp lệ');return;}
  const extra=Object.keys(e).filter(k=>!['slug','examId','source','title','placeholder','active','pointsScale'].includes(k));if(extra.length)errors.push(at+'trường lạ '+extra.join(', '));
  if(typeof e.slug!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.slug)||e.slug.length>40)errors.push(at+'slug chỉ gồm a-z, 0-9, dấu gạch');else if(slugs.has(e.slug))errors.push(at+'slug trùng');else slugs.add(e.slug);
  if(!validHsaExamId(e.examId))errors.push(at+'examId không hợp lệ');else if(ids.has(e.examId))errors.push(at+'examId trùng');else ids.add(e.examId);
  if(!['practice-bank','catalog','hsa-paper'].includes(e.source))errors.push(at+'source phải là practice-bank, catalog hoặc hsa-paper');
  if(e.pointsScale!==undefined&&(!Number.isSafeInteger(e.pointsScale)||e.pointsScale<1||e.pointsScale>100||10000%e.pointsScale))errors.push(at+'pointsScale phải là số nguyên 1–100 chia hết 10000');
  if(typeof e.title!=='string'||e.title.trim().length<3||e.title.length>120)errors.push(at+'title 3–120 ký tự');
  if(typeof e.placeholder!=='boolean'||typeof e.active!=='boolean')errors.push(at+'placeholder và active phải là true/false');
 });
 if(!errors.length&&!o.exams.some((e:any)=>e.active))errors.push('Cần ít nhất một đề active');
 return errors.length?{ok:false,errors}:{ok:true,value:{version:1,exams:o.exams as HsaMockExam[]}};
}
const checked=validateHsaMockConfig(raw);
/** Đề đang mở trên trang; cấu hình lỗi thì trang báo chưa có đề thay vì mở đề sai. */
export const HSA_MOCK_EXAMS:readonly HsaMockExam[]=checked.ok?checked.value.exams.filter(e=>e.active):[];
export const hsaMockExam=(slug:string|null)=>HSA_MOCK_EXAMS.find(e=>e.slug===slug)??HSA_MOCK_EXAMS[0];
/** Số điện thoại không bắt buộc: rỗng trả ''; sai định dạng ném lỗi tiếng Việt như form đăng ký. */
export function normalizeHsaPhone(phone:string){const p=phone.trim();if(!p)return '';return normalizeRegistration({studentName:'Thi thử HSA',phone:p,grade:'hsa',message:'online'}).phone;}
/** Lead thi thử HSA dạng form đăng ký để lưu vào máy chủ trung tâm (/api/dang-ky). */
export function hsaLeadRegistration({name,grade,phone,scoreText,examTitle,leadSource}:{name:string;grade:HsaGrade;phone:string;scoreText:string;examTitle:string;leadSource:string}){
 return normalizeRegistration({studentName:name,phone,grade:grade==='khac'?'hsa':grade,message:'online',notes:[`Thi thử HSA: ${scoreText} · ${examTitle}`,`Tên trên bảng xếp hạng: ${name} · ${HSA_GRADE_LABEL[grade]}`].join('\n'),leadSource});
}
/** Lead gửi qua đúng đường EmailJS của form đăng ký; không có hình thức học vì em chưa chọn. */
export function hsaLeadPayload({name,grade,phone,scoreText,examTitle,leadSource}:{name:string;grade:HsaGrade;phone:string;scoreText:string;examTitle:string;leadSource:string}){
 const data=normalizeRegistration({studentName:name,phone,grade:grade==='khac'?'hsa':grade,message:'online',notes:`Thi thử HSA: ${scoreText}`,leadSource});
 const base=emailRegistration(data);
 return {...base,study_mode:'Chưa chọn (lead thi thử HSA)',message:[`Thi thử HSA: ${scoreText} · ${examTitle}`,`Tên trên bảng xếp hạng: ${name} · ${HSA_GRADE_LABEL[grade]}`,'Muốn nhận kết quả chi tiết và tư vấn lộ trình HSA',data.leadSource?'— '+data.leadSource:''].filter(Boolean).join('\n')};
}
