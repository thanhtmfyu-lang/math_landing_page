import assert from 'node:assert/strict';
import {opensAt,plannedDueAt,classRules} from '../server/btvn/class-rules';
import {classOpeningTimes} from '../server/btvn/class-schedule';
import {attendanceRpc} from '../server/btvn/publish-attendance';
import {parseAttendanceSheet} from '../server/btvn/attendance-sheet';
const at=(d:string,t:string)=>d+'T'+t+':00+07:00';
// Luật trung tâm: hạn = giờ bắt đầu buổi hạn − 30 phút (giờ VN).
const minus30=(t:string)=>{const m=Number(t.slice(0,2))*60+Number(t.slice(3))-30;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
const pairs=[['2K9 9+','2026-10-12','2026-10-12','2026-10-14'],['2K9 8+','2026-10-13','2026-10-12','2026-10-15'],['2K9 9+','2026-10-14','2026-10-14','2026-10-16'],['2K9 8+','2026-10-15','2026-10-14','2026-10-17'],['2K9 9+','2026-10-30','2026-10-30','2026-11-02'],['2K9 8+','2026-10-31','2026-10-30','2026-11-03']];
for(const [label,date,opening,due] of pairs){assert.equal(opensAt(label,date),at(opening,'19:30'));assert.equal(plannedDueAt(label,date),at(due,'17:00'));}
for(const [date,due] of [['2026-10-12','2026-10-19'],['2026-10-13','2026-10-15'],['2026-10-29','2026-11-03']])assert.equal(plannedDueAt('2K9 XPT',date),at(due,'19:00'));
const simple=[['2K10 8+','2026-10-30','19:30','21:30'],['2K10 8+','2026-11-01','10:00','12:00'],['2K10 Thứ 3, 6','2026-10-27','19:30','21:30'],['2K10 Thứ 3, 6','2026-10-30','19:30','21:30'],['2K10 XPT','2026-10-26','19:30','21:30'],['2K10 XPT','2026-10-31','15:30','17:30'],['2K11 8+','2026-10-28','19:30','21:30'],['2K11 8+','2026-11-01','15:30','17:30'],['2K11 9+','2026-10-29','19:30','21:30'],['2K11 9+','2026-11-01','13:30','15:30'],['2K11 XPT','2026-10-28','19:30','21:30'],['2K11 XPT','2026-10-31','13:30','15:30'],['2K9 HSA (CN)','2026-11-01','17:00','20:00'],['2K9 HSA (THỨ 5)','2026-10-29','14:30','17:30']];
for(const [label,date,start,end] of simple){const next=new Date(Date.parse(date+'T00:00Z')+7*864e5).toISOString().slice(0,10);assert.equal(opensAt(label,date),at(date,end));assert.equal(plannedDueAt(label,date),at(next,minus30(start)));}
assert.equal(plannedDueAt('2K10 9+','2026-12-29'),at('2027-01-05','19:00'));
assert.equal(opensAt('2K10 9+','2027-01-03'),at('2027-01-01','21:30'));
for(const date of ['2027-01-01','2027-01-03']){assert.equal(plannedDueAt('2K10 9+',date),null);assert.equal(plannedDueAt('2K10 9+',date,5),at('2027-01-08','19:00'));assert.equal(plannedDueAt('2K10 9+',date,{weekday:7,start:'08:00',end:'10:00'}),at('2027-01-10','07:30'));}
// Ba mốc anh chốt: buổi 19:30 → hạn 19:00; 08:00 → 07:30 (lùi qua giờ); 15:30 → 15:00. Giờ mở bài vẫn theo giờ kết thúc buổi, không trừ.
assert.equal(plannedDueAt('2K11 8+','2026-10-21'),at('2026-10-28','19:00'));
assert.equal(plannedDueAt('2K10 9+','2026-10-25',7),at('2026-11-01','07:30'));assert.equal(plannedDueAt('2K10 9+','2026-10-25',5),at('2026-10-30','19:00'));
assert.equal(plannedDueAt('2K10 XPT','2026-10-24'),at('2026-10-31','15:00'));assert.equal(plannedDueAt('2K11 8+','2026-10-25'),at('2026-11-01','15:00'));
assert.equal(plannedDueAt('2K10 8+','2026-10-25'),at('2026-11-01','09:30'));assert.equal(plannedDueAt('2K9 9+','2026-10-19'),at('2026-10-21','17:00'));assert.equal(plannedDueAt('2K9 XPT','2026-10-19'),at('2026-10-26','19:00'));
assert.equal(opensAt('2K11 8+','2026-10-21'),at('2026-10-21','21:30'));assert.equal(opensAt('2K10 9+','2026-10-25'),at('2026-10-23','21:30'));
for(const date of ['2026-02-30','invalid','2026-10-15T00:00Z']){assert.throws(()=>opensAt('2K9 8+',date));assert.throws(()=>plannedDueAt('2K9 9+',date));}
assert.equal(opensAt('Lớp chưa có lịch','2026-10-15'),at('2026-10-15','21:30'));assert.equal(plannedDueAt('Lớp chưa có lịch','2026-10-15'),null);
assert.deepEqual(classOpeningTimes({classNames:['2K9 9+','2K9 8+'],date:'2026-10-16',classDates:{'2K9 8+':'2026-10-17'}}),{'2K9 9+':at('2026-10-16','19:30'),'2K9 8+':at('2026-10-16','19:30')});
const snapshot={'Thứ 2':[['','TÊN LỚP','19/10','26/10'],['Lớp (2k9)','17h30-19h30'],['Danh tính GIẢ','0900000001','K','C']]};
const map={schoolYear:2026,classes:{'2k9':'2K9 9+'}};
const parsed=parseAttendanceSheet(snapshot,{...map,sessionOverrides:[{label:'2K9 9+',plannedStartsAt:at('2026-10-19','17:30'),actualStartsAt:at('2026-10-26','17:30')}]});
assert.equal(parsed.sessions[0].cancelled,true);assert.equal(parsed.sessions[1].replacesAt,at('2026-10-19','17:30'));
const rpc=attendanceRpc({action:'sync_due',sessions:parsed.sessions});assert.deepEqual((rpc!.payload.p_payload as any).classRules,classRules);
assert.throws(()=>attendanceRpc({action:'sync_due',sessions:parsed.sessions,classRules:{}}));
assert.throws(()=>attendanceRpc({action:'sync_due',sessions:[{...parsed.sessions[1],replacesAt:'tomorrow'}]}));
assert.throws(()=>parseAttendanceSheet(snapshot,{...map,sessionOverrides:[{label:'2K9 9+',plannedStartsAt:at('2026-10-19','17:30'),actualStartsAt:at('2026-10-20','17:30')}]}));
console.log('ĐẠT đợt 24 (hạn = giờ bắt đầu − 30 phút): mọi lớp, cặp mở, XPT, ca điểm danh, tuần/tháng/năm, ngày lỗi, override được duyệt và cổng không nhận luật tùy ý.');
