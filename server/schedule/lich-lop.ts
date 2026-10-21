import snapshot from './lich-lop.snapshot.json';
export type ScheduleRow={id:string;lop:string;thu:typeof DAYS[number];bat:string;ket:string;legacyOnly?:boolean};
export type Slot={weekday:number;start:string;end:string};
export const SCHEDULE_SNAPSHOT=snapshot.rows as ScheduleRow[];
export const SCHEDULE_SNAPSHOT_DATE=snapshot.snapshotDate;
export const DAYS=['T2','T3','T4','T5','T6','T7','CN'] as const;
const aliases:Record<string,string>={'2K9 HSA (THỨ 5)':'HSA.2','2K9 HSA (CN)':'HSA'};
export const scheduleClass=(name:string)=>aliases[name.trim()]??name.trim().replace(/\s+XPS(?=\s+[89]\+)/,'');
export function classSlots(rows:ScheduleRow[],label:string,attendanceAlternatives=false):Slot[]{
 const name=scheduleClass(label);
 const selected=rows.filter(row=>{
  const other=scheduleClass(row.lop);
  if(other===name)return true;
  // These are attendance policies, not additional weekly meetings of 9+.
  if(attendanceAlternatives&&name==='2K10 9+'&&other==='2K10 8+'&&row.thu==='T6')return true;
  if(name==='2K10 Thứ 3, 6')return other==='2K10 9+'&&row.thu==='T3'||other==='2K10 8+'&&row.thu==='T6';
  return false;
 });
 const unique=new Map(selected.map(row=>{const slot={weekday:DAYS.indexOf(row.thu)+1,start:row.bat,end:row.ket};return [JSON.stringify(slot),slot];}));
 return [...unique.values()].filter(s=>s.weekday>0).sort((a,b)=>a.weekday-b.weekday||a.start.localeCompare(b.start));
}
const hhmm=(raw:string)=>{const m=/^(\d{1,2})[:h](\d{2})/.exec(raw.trim());return m&&+m[1]<24&&+m[2]<60?m[1].padStart(2,'0')+':'+m[2]:null;};
const day=(raw:string):ScheduleRow['thu']|null=>{const v=raw.trim().toLowerCase();if(/^(cn|chủ nhật|chu nhat)$/.test(v))return 'CN';const m=/^(?:thứ|thu|t)\s*([2-7])$/.exec(v);return m?('T'+m[1]) as ScheduleRow['thu']:null;};
function csv(raw:string){const result:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<raw.length;i++){const c=raw[i];if(quoted){if(c==='"'){if(raw[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=c;}
 else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\r'||c==='\n'){if(c==='\r'&&raw[i+1]==='\n')i++;row.push(cell);result.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)return [];if(cell||row.length){row.push(cell);result.push(row);}return result;
}
export function parseScheduleCsv(raw:string):ScheduleRow[]{
 const rows=csv(raw.replace(/^\uFEFF/,'')),header=(rows.shift()??[]).map(v=>v.trim().toLowerCase());
 const cols=['lớp','thứ','bắt đầu','kết thúc'].map(v=>header.indexOf(v));if(cols.some(v=>v<0))return [];
 const found=new Map<string,ScheduleRow>();
 for(const row of rows){const [name,t,b,k]=cols.map(i=>row[i]??''),lop=name.trim().replace(/\s+/g,' '),thu=day(t),bat=hhmm(b),ket=hhmm(k);
  if(!lop||lop.length>30||lop.includes('|')||!thu||!bat||!ket||bat>=ket)continue;
  const id=[lop,thu,bat,ket].join('|');found.set(id,{id,lop,thu,bat,ket});}
 return [...found.values()];
}
type Schedule={rows:ScheduleRow[];source:'Lich_lop'|'Lich_lop-cache'|'snapshot';snapshotDate?:string};
export function scheduleEnvironment():Record<string,string|undefined>{
 const runtime=globalThis as typeof globalThis&{Deno?:{env:{get:(key:string)=>string|undefined}}};
 return {MTM_LICH_LOP_CSV:typeof process!=='undefined'?process.env.MTM_LICH_LOP_CSV:runtime.Deno?.env.get('MTM_LICH_LOP_CSV')};
}
let cache:{url:string;at:number;rows:ScheduleRow[]}|null=null;
export async function loadSchedule(env:Record<string,string|undefined>,transport:typeof fetch=fetch,now=Date.now()):Promise<Schedule>{
 const raw=env.MTM_LICH_LOP_CSV;
 const fallback=():Schedule=>({rows:SCHEDULE_SNAPSHOT,source:'snapshot',snapshotDate:SCHEDULE_SNAPSHOT_DATE});
 if(!raw)return fallback();
 let url:URL;try{url=new URL(raw);if(url.protocol!=='https:'||url.hostname!=='docs.google.com'||url.username||url.password)return fallback();}catch{return fallback();}
 if(cache?.url===url.href&&now-cache.at<600000)return {rows:cache.rows,source:'Lich_lop'};
 try{const response=await transport(url.href,{signal:AbortSignal.timeout(4000)});if(!response.ok)throw Error();const rows=parseScheduleCsv(await response.text());if(rows.length<5)throw Error();
  cache={url:url.href,at:now,rows};return {rows,source:'Lich_lop'};
 }catch{return cache?.url===url.href?{rows:cache.rows,source:'Lich_lop-cache'}:fallback();}
}
