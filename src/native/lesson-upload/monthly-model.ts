import type {Staff} from './model';
export type MonthlyClass={class_id:string;class_name:string;teacher_key:string};
export type MonthlyUpload={id:string;title:string;class_ids:string[];class_names:Record<string,string>;exam_date:string;opens_at:string;closes_at:string;version:number;status:'waiting'|'reviewing'|'blocked'|'ready';detail:string;created_at:string};
export type MonthlyDashboard={staff:Staff;classes:MonthlyClass[];uploads:MonthlyUpload[];scheduled_classes:number;ready_classes:number;blocked_classes:number};
export function monthlyWindow(date:string,open:string,close:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(open)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(close)||!Number.isFinite(Date.parse(date))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Điền ngày thi và giờ mở/đóng hợp lệ.');
 const opensAt=new Date(`${date}T${open}:00+07:00`).toISOString(),closesAt=new Date(`${date}T${close}:00+07:00`).toISOString();
 if(Date.parse(closesAt)<=Date.parse(opensAt))throw Error('Giờ đóng phải sau giờ mở trong ngày thi.');
 return {opensAt,closesAt};
}
export function validateMonthlyPapers(papers:{files:File[];answers:File[];text:string}[]){
 if(papers.length!==2)return 'Cần đủ hai mã 101 và 102.';
 for(const [i,p] of papers.entries()){
  if(!p.files.length)return `Chưa có đề mã ${101+i}.`;
  if(!p.answers.length&&!p.text.trim())return `Chưa có đáp án riêng mã ${101+i}.`;
  if(p.answers.length&&p.text.trim())return `Mã ${101+i}: chọn tệp đáp án hoặc gõ nhanh.`;
 }
 return null;
}
