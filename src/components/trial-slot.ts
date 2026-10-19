/** Ca học thử mong muốn trong form đăng ký: chỉ là mong muốn của phụ huynh/học sinh, không phải lịch còn chỗ.
 * MTM gọi lại xác nhận ca còn chỗ; ở đây không có dữ liệu lịch lớp. Ngày tính theo giờ Việt Nam. */
export type TrialDay={value:string;label:string;weekend:boolean};
export type TrialSlotId='chieu'|'toi'|'cuoi-tuan-sang';
export const TRIAL_SLOT_LABEL:Record<TrialSlotId,string>={chieu:'Chiều (14h–17h)',toi:'Tối (18h–21h)','cuoi-tuan-sang':'Cuối tuần sáng'};
const WEEKDAY=['CN','T2','T3','T4','T5','T6','T7'];
const pad=(n:number)=>String(n).padStart(2,'0');
/** 7 ngày tới, không gồm hôm nay, nhãn kiểu "T3 21/10". */
export function trialDays(now:Date=new Date()):TrialDay[]{
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Saigon',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
 const base=Date.UTC(+p.year,+p.month-1,+p.day);
 return Array.from({length:7},(_,i)=>{const d=new Date(base+(i+1)*86400000),w=d.getUTCDay();
  return {value:d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate()),label:WEEKDAY[w]+' '+pad(d.getUTCDate())+'/'+pad(d.getUTCMonth()+1),weekend:w===0||w===6};});
}
/** Ca cho ngày đã chọn: "Cuối tuần sáng" chỉ khi ngày đó là T7/CN. */
export function trialSlotsFor(day:TrialDay|null|undefined):TrialSlotId[]{return day?.weekend?['chieu','toi','cuoi-tuan-sang']:['chieu','toi'];}
/** Dòng mô tả gửi trong email; rỗng khi chưa chọn gì. Ca không hợp với ngày (sáng cuối tuần vào ngày thường) bị bỏ. */
export function describeTrialSlot(day:TrialDay|null|undefined,slot:TrialSlotId|''|null|undefined){
 const s=slot&&trialSlotsFor(day).includes(slot)?TRIAL_SLOT_LABEL[slot]:'';
 return [day?.label??'',s].filter(Boolean).join(' · ');
}
