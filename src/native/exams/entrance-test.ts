import {DV_TRACK_LABEL,type DvTrack,type Result} from '../../../server/dau-vao/engine';
import {emailRegistration,normalizeRegistration} from '../../components/registration-submit';
/** Số di động Việt Nam 10 chữ số; null nếu sai. */
export function normalizeEntryPhone(v:string){const p=v.replace(/[\s().-]/g,'').replace(/^\+84/,'0');return /^0[35789]\d{8}$/.test(p)?p:null;}
const STATUS={vung:'vững','cung-co':'cần củng cố',hong:'hổng'} as const;
/** Phiếu kết quả dạng chữ: hiện cho học sinh in/chụp và gửi kèm lead để quản lý lớp xếp lớp ngay. */
export function resultSummary({name,khoi,school,result:r}:{name:string;khoi:DvTrack;school:string;result:Result}){
 return [`Kiểm tra đầu vào ${DV_TRACK_LABEL[khoi]} · Mã bài ${r.code} · ngày ${r.ngay.split('-').reverse().join('/')} (tuần ${r.week})`,
  `Học sinh: ${name}${school?' · '+school:''}`,
  `Điểm: ${r.score.toLocaleString('vi-VN')}/10 · đúng ${r.correct}/${r.total} câu`,
  ...r.bySection.map(s=>`- ${s.label}: ${s.correct}/${s.total} (${s.percent}%)`),
  `Theo mức: ${r.byLevel.map(l=>`${l.label} ${l.correct}/${l.total}`).join(', ')}`,
  `Gợi ý lớp: ${r.suggestion.group} · ${r.suggestion.level}`,
  ...r.suggestion.extra.map(x=>'* '+x),
  'Chủ đề cần bù: '+(r.topics.filter(t=>t.status!=='vung').map(t=>`${t.name} (${STATUS[t.status]} ${t.correct}/${t.total})`).join('; ')||'không có'),
 ].join('\n');
}
export function entranceLeadPayload({name,khoi,school,phone,result,leadSource}:{name:string;khoi:DvTrack;school:string;phone:string;result:Result;leadSource:string}){
 const grade=['10','11','12'].includes(khoi)?khoi:khoi==='hsa'?'hsa':'thcs';
 const data=normalizeRegistration({studentName:name,phone,grade,message:'truc-tiep',notes:`Kiểm tra đầu vào: ${result.score}/10 · gợi ý ${result.suggestion.group}`,trial:true,leadSource:'Kiểm tra đầu vào web · '+leadSource});
 return {...emailRegistration(data),study_mode:'Chưa chọn (lead kiểm tra đầu vào)',message:[resultSummary({name,khoi,school,result}),'Muốn nhận tư vấn xếp lớp và học thử','— '+data.leadSource].join('\n')};
}
