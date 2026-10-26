import {opensAt,type ClassRules} from './class-rules';

/** weekday: 1 = thứ Hai, 7 = Chủ nhật. Ngày học và giờ luôn ở Việt Nam. */
export function classOpeningTimes(material:{classNames:string[];classDates?:Record<string,string>;date:string},rules?:ClassRules,strict=false){
 const result:Record<string,string>={};
 for(const name of material.classNames){
  const date=material.classDates?.[name]??material.date;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('INVALID_CLASS_DATE');
  if(strict&&rules&&!rules.classes[name]?.sessions.length)throw Error('CLASS_SCHEDULE_UNAVAILABLE');
  if(strict&&rules){
   const rule=rules.classes[name],day=new Date(date+'T00:00:00Z').getUTCDay()||7;
   const source=rules.classes[rule.open.sourceLabel??name],openingDay=rule.open.days?.[String(day)]??day;
   if(!source?.sessions.some(slot=>slot.weekday===openingDay))throw Error('CLASS_SCHEDULE_UNAVAILABLE');
  }
  result[name]=opensAt(name,date,rules);
 }
 return result;
}
