import type {PtKetQua} from './engine';

export type Distribution={available:false}|{available:true;scope:'de'|'dot';total:number;bins:{bin:number;count:number}[]};
/** Never pass through raw SQL rows or fields supplied by a client. */
export function publicDistribution(raw:any):Distribution{
 if(raw?.available===false)return {available:false};
 if(raw?.available!==true||!['de','dot'].includes(raw.scope)||!Number.isSafeInteger(raw.total)||raw.total<5||!Array.isArray(raw.bins)||raw.bins.length!==10)throw Error('Invalid distribution');
 const bins=raw.bins.map((row:any,index:number)=>{
  if(row?.bin!==index||!Number.isSafeInteger(row.count)||row.count<0)throw Error('Invalid bin');
  return {bin:index,count:row.count};
 });
 if(bins.reduce((sum:number,row:{count:number})=>sum+row.count,0)!==raw.total)throw Error('Invalid sample count');
 return {available:true,scope:raw.scope,total:raw.total,bins};
}
export function recoveryTopics(result:Pick<PtKetQua,'cau'>){
 const groups=new Map<string,{topic:string;lost:number;questions:{id:string;number:number}[]}>();
 for(const row of result.cau){
  if(!row.chuDe||!Number.isFinite(row.diem)||!Number.isFinite(row.toiDa)||row.diem<0||row.toiDa<=0||row.diem>=row.toiDa)continue;
  const item=groups.get(row.chuDe)??{topic:row.chuDe,lost:0,questions:[]};
  item.lost+=row.toiDa-row.diem;item.questions.push({id:row.ma,number:row.so});groups.set(row.chuDe,item);
 }
 return [...groups.values()].sort((a,b)=>b.lost-a.lost||a.questions[0].number-b.questions[0].number).slice(0,3);
}
