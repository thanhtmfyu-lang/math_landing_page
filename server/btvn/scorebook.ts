export type ScoreRow={studentId:string;fullName:string;className:string;lessonCode:string;title:string;date:string;dueAt:number|null;expectedDueAt?:number|null;sourceIdentity?:string;attempts?:{startedAt:number|null;submittedAt:number|null}[];receipts:{score:number|null;submittedAt:number;late:boolean|null}[]};
const eligible=(rows:ScoreRow[])=>rows.filter(r=>r.date>='2026-10-01'&&!r.sourceIdentity?.startsWith('qa:'));
const receiptsFor=(row:ScoreRow)=>row.receipts.filter(r=>r.submittedAt>=Date.parse('2026-10-15T00:00:00+07:00'));
const pending=(row:ScoreRow)=>receiptsFor(row).some(r=>r.score===null);
export const bestReceipt=(row:ScoreRow)=>receiptsFor(row).filter((r):r is typeof r&{score:number}=>typeof r.score==='number'&&Number.isFinite(r.score)).sort((a,b)=>b.score-a.score||b.submittedAt-a.submittedAt)[0];
const point=(n:number)=>n.toLocaleString('vi-VN',{maximumFractionDigits:2});
export function buildScorebook(input:ScoreRow[],now=Date.now()){
 const rows=eligible(input),classes=[...new Set(rows.map(r=>r.className))].sort();
 return classes.map(className=>{
  const group=rows.filter(r=>r.className===className);
  const lessons=[...new Map(group.map(r=>[r.lessonCode,{code:r.lessonCode,date:r.date,title:r.title}])).values()].sort((a,b)=>a.date.localeCompare(b.date)||a.code.localeCompare(b.code));
  const months=[...new Set(lessons.map(l=>l.date.slice(0,7)))].sort();
  const values:string[][]=[['Họ và tên',...lessons.map(l=>l.date+' '+l.title),...months.map(m=>'TB tháng '+m)]];
  for(const id of [...new Set(group.map(r=>r.studentId))]){
   const own=group.filter(r=>r.studentId===id);
   values.push([own[0].fullName,...lessons.map(l=>{const r=own.find(x=>x.lessonCode===l.code);if(!r)return '';if(pending(r))return 'Chờ chấm';const best=bestReceipt(r);return best?point(best.score)+(best.late?' (muộn)':''):r.dueAt!==null&&now>=r.dueAt?'Chưa nộp':'';}),...months.map(month=>{
    // Mọi bài được giao trong kỳ đều vào mẫu số; bài bỏ tính 0.
    const assigned=own.filter(r=>r.date.startsWith(month));if(assigned.some(pending))return 'Chờ chấm';return point(assigned.reduce((sum,r)=>sum+(bestReceipt(r)?.score??0),0)/assigned.length);
   })]);
  }
  return {className,values};
 });
}
const date=(at:number)=>new Date(at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
export function buildClassReport(input:ScoreRow[],lessonCode:string,className:string,now=Date.now()){
 const rows=eligible(input).filter(r=>r.lessonCode===lessonCode&&r.className===className);
 if(!rows.length)throw Error('Không có buổi/lớp trong phạm vi');
 const submitted=rows.filter(r=>receiptsFor(r).length),waiting=submitted.filter(pending),graded=submitted.filter(r=>!pending(r)&&bestReceipt(r)),late=graded.filter(r=>bestReceipt(r)!.late===true),onTime=graded.filter(r=>bestReceipt(r)!.late!==true);
 const list=(rs:ScoreRow[],scores=false)=>rs.length?rs.map(r=>r.fullName+(scores?' - '+point(bestReceipt(r)!.score)+'/10':'')).join('; '):'Không có';
 const dues=[...new Set(rows.map(r=>r.dueAt!==null?'Hạn: '+date(r.dueAt):r.expectedDueAt!=null?'Hạn dự kiến: '+date(r.expectedDueAt):'Hạn: chờ xác minh'))];
 return [`Kính gửi quý phụ huynh và các con lớp ${className}.`, `BTVN: ${rows[0].title}`, ...dues,
  'Đã nộp: '+list(onTime,true),'Nộp muộn: '+list(late,true),...(waiting.length?['Chờ chấm: '+list(waiting)]:[]),'Chưa nộp: '+list(rows.filter(r=>!receiptsFor(r).length)),
  `Đã nộp ${submitted.length}/${rows.length} con. Điểm cao nhất lớp: ${waiting.length?'Chờ chấm':graded.length?point(Math.max(...graded.map(r=>bestReceipt(r)!.score)))+'/10':'Chưa có'}.`,
  ...(graded.some(r=>bestReceipt(r)!.late===null)||waiting.some(r=>receiptsFor(r).some(receipt=>receipt.late===null))?['Một số lượt đã nộp đang chờ xác minh hạn.']:[])
 ].join('\n');
}
