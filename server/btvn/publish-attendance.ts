import {classRules,type ClassRules} from './class-rules';
const record=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:any,max:number)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
// DB kiểm lại lớp active. Cổng chỉ nhận nhãn lớp MTM, không nhận tên tuỳ ý.
export const validAttendanceLabel=(v:unknown)=>typeof v==='string'&&/^2K\d{1,2}(?: (?:[89]\+|XPT|Thứ [2-7], [2-7]|HSA \((?:CN|THỨ 5)\)))?$/.test(v);
const ensure=(v:unknown)=>{if(!v)throw Error('INVALID_ATTENDANCE');};
const date=(v:any)=>text(v,40)&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===v.slice(0,10);
/** Whitelist chính xác trước khi port có quyền service_role. */
export function attendanceRpc(body:any,rules:ClassRules=classRules):{name:string;payload:Record<string,unknown>}|null{
 if(!['sync_attendance','sync_due','support_report'].includes(body.action))return null;
 if(body.action==='support_report'){
  ensure(Object.keys(body).every(k=>['action','since'].includes(k))&&date(body.since));
  return {name:'support_report',payload:{p_since:body.since}};
 }
 ensure(Object.keys(body).every(k=>['action','apply',body.action==='sync_due'?'sessions':'rows'].includes(k)));
 ensure(body.apply===undefined||typeof body.apply==='boolean');
 if(body.action==='sync_attendance'){
  ensure(Array.isArray(body.rows)&&body.rows.length>0&&body.rows.length<=10000);
  for(const r of body.rows)ensure(record(r)&&Object.keys(r).every(k=>['label','fullName','phone','source','school'].includes(k))&&validAttendanceLabel(r.label)&&text(r.fullName,160)&&typeof r.phone==='string'&&/^0\d{9}$/.test(r.phone)&&(r.source===undefined||text(r.source,200))&&(r.school===undefined||typeof r.school==='string'&&r.school.length<=160&&!/[\u0000-\u001f\u007f-\u009f]/.test(r.school)));
  return {name:'sync_attendance',payload:{p_payload:{rows:body.rows},p_apply:body.apply??false}};
 }
 ensure(Array.isArray(body.sessions)&&body.sessions.length<=2000);
 let count=0;const ids=new Set<string>();
 for(const s of body.sessions){
  ensure(record(s)&&Object.keys(s).every(k=>['classKey','label','startsAt','sourceIdentity','attendees','cancelled','replacesAt'].includes(k))&&validAttendanceLabel(s.label)&&text(s.classKey,100)&&date(s.startsAt)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$/.test(s.startsAt)&&text(s.sourceIdentity,300)&&!ids.has(s.sourceIdentity)&&Array.isArray(s.attendees)&&s.attendees.length<=1000);ids.add(s.sourceIdentity);
  ensure(s.cancelled===undefined||typeof s.cancelled==='boolean');
  ensure(s.replacesAt===undefined||date(s.replacesAt)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$/.test(s.replacesAt)&&s.replacesAt!==s.startsAt&&s.cancelled!==true);
  count+=s.attendees.length;ensure(count<=20000);
  for(const a of s.attendees)ensure(record(a)&&Object.keys(a).every(k=>['name','phone','status'].includes(k))&&text(a.name,160)&&typeof a.phone==='string'&&/^0\d{9}$/.test(a.phone)&&typeof a.status==='string'&&['','C','M','L','K','ON','P','PH P'].includes(a.status));
 }
 return {name:'sync_due',payload:{p_payload:{sessions:body.sessions,classRules:rules},p_apply:body.apply??false}};
}
