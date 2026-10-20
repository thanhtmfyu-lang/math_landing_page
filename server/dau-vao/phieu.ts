import {DV_TRACK_LABEL,type DvTrack,type Result} from './engine';
import {HS_GOAL_LABEL,HS_HEARD_LABEL,lichRanhText,type HoSo} from './ho-so';
// Phiếu dạng chữ: học sinh xem/in ở trang kết quả; máy chủ lưu kèm lead để bot báo quản lý lớp đúng một mẫu.
const STATUS={vung:'vững','cung-co':'cần củng cố',hong:'hổng'} as const;
const vn=(iso:string)=>iso.split('-').reverse().join('/');
export function resultSummary({name,khoi,school,result:r}:{name:string;khoi:DvTrack;school:string;result:Result}){
 return [`Kiểm tra đầu vào ${DV_TRACK_LABEL[khoi]} · Mã bài ${r.code} · ngày ${vn(r.ngay)} (tuần ${r.week})`,
  `Học sinh: ${name}${school?' · '+school:''}`,
  `Điểm: ${r.score.toLocaleString('vi-VN')}/10 · đúng ${r.correct}/${r.total} câu`,
  ...r.bySection.map(s=>`- ${s.label}: ${s.correct}/${s.total} (${s.percent}%)`),
  ...(r.tn?[`Mini đề kiểu tốt nghiệp: ${r.tn.score.toLocaleString('vi-VN')}/10 (${r.tn.parts.map(x=>x.part+' '+x.earned.toLocaleString('vi-VN')+'/'+x.max.toLocaleString('vi-VN')).join(', ')}) · dạng còn sai: ${r.tn.byDang.filter(d=>d.correct<d.total).map(d=>d.dang).join('; ')||'không có'}`]:[]),
  `Theo mức: ${r.byLevel.map(l=>`${l.label} ${l.correct}/${l.total}`).join(', ')}`,
  `Gợi ý lớp: ${r.suggestion.group} · ${r.suggestion.level}`,
  ...r.suggestion.extra.map(x=>'* '+x),
  'Chủ đề cần bù: '+(r.topics.filter(t=>t.status!=='vung').map(t=>`${t.name} (${STATUS[t.status]} ${t.correct}/${t.total})`).join('; ')||'không có'),
 ].join('\n');
}
/** Phiếu học thử mới theo thứ tự cột danh sách "Học sinh mới" (Lớp, Họ tên, Trường, Ngày sinh, SĐT, Lịch học, NOTE). */
export function hoSoSummary(h:HoSo){
 return [`Học thử mới qua kiểm tra đầu vào web · ${DV_TRACK_LABEL[h.khoi]}`,
  `Họ tên: ${h.hoTen} · sinh ${vn(h.ngaySinh)}`,
  `Trường: ${h.truong}${h.lopTruong?' · lớp '+h.lopTruong:''}`,
  `Phụ huynh: ${h.phuHuynh} · ${h.sdtPh}${h.sdtHs?' · SĐT học sinh '+h.sdtHs:''}`,
  `Hình thức: ${h.hinhThuc==='online'?'Online':'Trực tiếp tại trung tâm'}`,
  `Lịch rảnh: ${lichRanhText(h)}`,
  h.mucTieu&&`Mục tiêu: ${HS_GOAL_LABEL[h.mucTieu as keyof typeof HS_GOAL_LABEL]}`,
  h.nguon&&`Biết MTM qua: ${HS_HEARD_LABEL[h.nguon as keyof typeof HS_HEARD_LABEL]}`,
  h.ghiChu&&`Ghi chú: ${h.ghiChu}`,
  h.leadSource&&`Nguồn: ${h.leadSource}`,
 ].filter(Boolean).join('\n');
}
