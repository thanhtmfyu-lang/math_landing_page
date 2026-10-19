import type {Draft} from '../../src/native/exams/store';
import type {HomeworkReceipt} from '../../src/native/homework/btvn-contract';

export type Student = {studentCode:string; fullName:string; phone:string; parentPhone?:string; parentName?:string; school?:string; className:string; cohort?:string; nextActualClassAt?:number; effectiveDueAt?:number};
export type StudentWork = {student:Student; drafts:Draft[]; receipts:HomeworkReceipt[]; lessons?:Record<string,{drafts:Draft[];receipts:HomeworkReceipt[];nextActualClassAt?:number;effectiveDueAt?:number}>};
/** Thao tác đồng bộ trong bản RAM; adapter bền vững phải chuyển cả giao dịch
 * thành atomic transaction trước khi dùng nhiều instance serverless. */
export interface HomeworkRepository {
  get(code:string):StudentWork|undefined;
  put(work:StudentWork):void;
  all():StudentWork[];
}
export class MemoryHomeworkRepository implements HomeworkRepository {
  private rows=new Map<string,StudentWork>();
  constructor(students:Student[], private persist?:(rows:StudentWork[])=>void){students.forEach(student=>this.put({student,drafts:[],receipts:[]}));}
  get(code:string){const row=this.rows.get(code);return row?structuredClone(row):undefined;}
  all(){return structuredClone([...this.rows.values()]);}
  put(work:StudentWork){
    const next=new Map(this.rows);next.set(work.student.studentCode,structuredClone(work));
    // Không báo đã lưu khi sink CSV lỗi. Không ghi một phần trạng thái RAM.
    this.persist?.(structuredClone([...next.values()]));this.rows=next;
  }
}
const csvCell=(value:unknown)=>'"'+String(value??'').replace(/^[=+\-@]/,"'$&").replace(/"/g,'""')+'"';
/** Chỉ điểm tổng chính thức được tham gia điểm cao nhất. Null là chờ chấm. */
export const receiptScores=(receipts:HomeworkReceipt[])=>receipts.map(r=>r.score).filter((score):score is number=>typeof score==='number'&&Number.isFinite(score));
export function scoresCsv(rows:StudentWork[],lessonCode:string){
  const columns=['ma_hs','ho_ten','lop','ma_buoi','diem','so_lan','gio_nop','thoi_gian_lam_giay','ma_luot','nop_muon','het_gio','diem_cao_nhat','han_nop','trang_thai_han'];
  const data=rows.flatMap(row=>{
    const entries=[{code:lessonCode,receipts:row.receipts,due:row.student.effectiveDueAt??row.student.nextActualClassAt},...Object.entries(row.lessons??{}).map(([code,l])=>({code,receipts:l.receipts,due:l.effectiveDueAt??l.nextActualClassAt}))];
    return entries.flatMap(entry=>{const scores=receiptScores(entry.receipts);return entry.receipts.map(r=>[row.student.studentCode,row.student.fullName,row.student.className,entry.code,r.score,r.attemptNumber,new Date(r.submittedAt).toISOString(),r.elapsedSeconds,r.attemptId,r.late===null?'':r.late,r.timedOut,scores.length?Math.max(...scores):null,entry.due===undefined?'':new Date(entry.due).toISOString(),r.late===null?'cho_buoi_thuc_hoc':r.late?'muon':'dung_han']);});
  });
  return '\uFEFF'+[columns,...data].map(line=>line.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
