import config from './class-rules.json';

export type Slot={weekday:number;start:string;end:string};
type Rule={sessions:Slot[];open:{type:string;sourceLabel?:string;days?:Record<string,number>};due:{type:string;days?:Record<string,{weekday:number;weeks:number}>}};
export const classRules=config;
const rules=config.classes as Record<string,Rule>;
export function lessonDay(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('INVALID_CLASS_DATE');
 return new Date(value+'T00:00:00Z');
}
const weekday=(d:Date)=>d.getUTCDay()||7;
const shift=(d:Date,n:number)=>new Date(d.getTime()+n*86400000);
const iso=(d:Date,time:string)=>d.toISOString().slice(0,10)+'T'+time+':00+07:00';
/** Hạn nộp = giờ bắt đầu buổi hạn − 30 phút (luật trung tâm, khớp btvn_planned_due 073). Lùi qua 00:00 thì lùi cả ngày. */
const DUE_LEAD_MINUTES=30;
const dueIso=(d:Date,start:string)=>{
 const [h,m]=start.split(':').map(Number),total=h*60+m-DUE_LEAD_MINUTES,day=Math.floor(total/1440),mins=total-day*1440;
 return iso(shift(d,day),String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0'));
};
const slot=(r:Rule,day:number)=>r.sessions.filter(s=>s.weekday===day).sort((a,b)=>a.start.localeCompare(b.start)).at(-1);
/** ISO giờ VN; lịch ngoài khung đã biết vẫn khóa tới 21:30, không tự mở sớm. */
export function opensAt(label:string,lessonDate:string):string{
 const d=lessonDay(lessonDate),w=weekday(d),r=rules[label];
 if(!r)return iso(d,'21:30');
 const sourceDay=r.open.days?.[String(w)]??w,source=rules[r.open.sourceLabel??label];
 return iso(shift(d,sourceDay-w),slot(source,sourceDay)?.end??'21:30');
}
/** attendedSlot là thứ 1..7 (hoặc slot). Không đoán ca T6/CN khi chưa có điểm danh. Trả hạn = giờ bắt đầu buổi hạn − 30 phút. */
export function plannedDueAt(label:string,lessonDate:string,attendedSlot?:number|Slot):string|null{
 const d=lessonDay(lessonDate),w=weekday(d),r=rules[label];if(!r)return null;
 let target=w,days=7;
 switch(r.due.type){
  case 'map': {const m=r.due.days?.[String(w)];if(!m)return null;target=m.weekday;days=target-w+7*m.weeks;break;}
  case 'pair_next': {
   const first=r.open.days?.[String(w)];if(first===undefined)return null;
   const sourceNext=first===5?1:first+2;
   target=sourceNext+(label==='2K9 8+'?1:0);days=(sourceNext<=first?7:0)+target-w;break;
  }
  case 'slot_by_attendance':
   if(w!==2){target=typeof attendedSlot==='number'?attendedSlot:attendedSlot?.weekday??0;if(![5,7].includes(target))return null;days=target-w+7;}
   break;
  case 'next_session': {
   const next=r.sessions.map(s=>({s,delta:(s.weekday-w+7)%7||7})).sort((a,b)=>a.delta-b.delta)[0];if(!next)return null;
   target=next.s.weekday;days=next.delta;break;
  }
  case 'same_weekday_next_week':break;
  default:throw Error('INVALID_DUE_RULE');
 }
 const next=slot(r,target);return next?dueIso(shift(d,days),next.start):null;
}
