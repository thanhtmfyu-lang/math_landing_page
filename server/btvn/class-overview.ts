import {classSlots,scheduleClass,type ScheduleRow} from '../schedule/lich-lop';
import type {HomeworkLesson} from '../../src/native/homework/btvn-contract';
import {displayHomeworkLessons,distinctHomeworkTitle} from '../../src/native/homework/presentation';

type Card={lessonCode:string;title:string;date:string};
export type ClassOverview={className:string;source:'Lich_lop'|'Lich_lop-cache'|'snapshot';snapshotDate?:string;legacySchedule:boolean;
 week:{startsAt:number;endsAt:number}[];next:{startsAt:number;endsAt:number}|null;open:Card[];monthly:Card[];latest:Card|null;progress:{submitted:number;opened:number}};
/** The class comes from the authenticated server state, never from a new query
 * parameter. Return no name, score, URL or class list belonging to another pupil. */
export function buildClassOverview(state:{className:string;lessons:HomeworkLesson[]},schedule:{rows:ScheduleRow[];source:ClassOverview['source'];snapshotDate?:string},now:number):ClassOverview{
 if(!state.className||!Number.isFinite(now))throw Error('CLASS_OVERVIEW_UNAVAILABLE');
 const label=scheduleClass(state.className);
 const own=displayHomeworkLessons(state.lessons).filter(l=>Array.isArray(l.classNames)&&l.classNames.some(name=>scheduleClass(name)===label));
 const card=(lesson:HomeworkLesson):Card=>({lessonCode:lesson.lessonCode,title:distinctHomeworkTitle(lesson,own),date:lesson.date});
 const unlocked=own.filter(l=>!l.locked&&(l.opensAt===undefined||l.opensAt<=now));
 const vn=new Date(now+7*3600000),today=vn.toISOString().slice(0,10),day=vn.getUTCDay()||7;
 const monday=Date.parse(today+'T00:00:00Z')-(day-1)*86400000;
 const times=(weekday:number,start:string,end:string,shift=0)=>{
  const date=new Date(monday+(weekday-1+shift)*86400000).toISOString().slice(0,10);
  return {startsAt:Date.parse(date+'T'+start+':00+07:00'),endsAt:Date.parse(date+'T'+end+':00+07:00')};
 };
 const slots=classSlots(schedule.rows,state.className),week=slots.map(s=>times(s.weekday,s.start,s.end));
 const next=slots.map(s=>{const current=times(s.weekday,s.start,s.end);return current.startsAt>=now?current:times(s.weekday,s.start,s.end,7);}).sort((a,b)=>a.startsAt-b.startsAt)[0]??null;
 const homework=unlocked.filter(l=>l.kind!=='kiem-tra-thang');
 const latest=[...unlocked].filter(l=>l.date<=today&&!!(l.videoId||l.videoUrl||l.handoutUrl||l.materialUrl)).sort((a,b)=>b.date.localeCompare(a.date)||a.lessonCode.localeCompare(b.lessonCode))[0];
 return {className:state.className,source:schedule.source,...(schedule.snapshotDate?{snapshotDate:schedule.snapshotDate}:{}),legacySchedule:schedule.rows.some(r=>scheduleClass(r.lop)===label&&r.legacyOnly===true),week,next,
  open:homework.filter(l=>l.available).map(card),
  monthly:unlocked.filter(l=>l.kind==='kiem-tra-thang').map(card),latest:latest?card(latest):null,
  progress:{submitted:homework.filter(l=>l.submittedAt!=null&&Number.isFinite(l.submittedAt)).length,opened:homework.length}};
}
