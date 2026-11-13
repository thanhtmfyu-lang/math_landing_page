import {latestForSession,sessionKey,STEP_LABELS,type LessonSession,type LessonUpload,type UploadDashboard} from './model';

export type UploadIssue={paper:1|2;step:number;label:string;detail:string;status:'loi'|'canh_bao'};
export function uploadProgress(upload:LessonUpload|undefined){
  if(!upload)return {processedPercent:0,remainingPercent:100,published:false,issues:[] as UploadIssue[],stage_label:'Chưa gửi bài'};
  const papers=[upload.steps,...(upload.homework2_uploaded?[upload.paper2_steps??[]]:[])];
  const issues:UploadIssue[]=[],issueKeys=new Set<string>();let completed=0;
  for(let paper=0;paper<papers.length;paper++){
    const steps=papers[paper].filter(s=>Number.isInteger(s.step)&&s.step>=1&&s.step<=6);
    completed+=new Set(steps.filter(s=>s.status==='xong').map(s=>s.step)).size;
    for(const step of steps){
      if(step.status!=='loi'&&step.status!=='canh_bao')continue;
      const key=`${paper}:${step.step}:${step.status}:${step.detail??''}`;if(issueKeys.has(key))continue;issueKeys.add(key);
      issues.push({paper:(paper+1) as 1|2,step:step.step,label:STEP_LABELS[step.step-1],detail:step.detail||'Cần kiểm tra biên nhận của bước này.',status:step.status});
    }
  }
  const processedPercent=Math.round(completed/(papers.length*6)*100);
  // A publish receipt remains true if a later independent review or material warning appears.
  const published=papers.every(steps=>steps.some(s=>s.step===6&&s.status==='xong'));
  let stage_label=published?(issues.length?'Đã giao bài · cần kiểm tra bổ sung':'Đã giao bài cho lớp'):'Đã nhận, chờ AI xử lý';
  if(!published&&issues.length)stage_label='Cần kiểm tra';
  else if(!published){
    const active=papers.flatMap((steps,paper)=>steps.map(step=>({step,paper}))).find(({step})=>step.step>=1&&step.step<=6&&step.status==='dang');
    if(active)stage_label=(papers.length>1?`Đề ${active.paper+1} · `:'')+STEP_LABELS[active.step.step-1];
    else if(completed>1)stage_label='AI đang xử lý';
  }
  return {processedPercent,remainingPercent:100-processedPercent,published,issues,stage_label};
}

function sessionEnd(session:LessonSession){
  const date=session.lesson_date,time=session.end_time;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time))return NaN;
  const end=Date.parse(`${date}T${time.length===5?time+':00':time}+07:00`);
  if(!Number.isFinite(end)||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)return NaN;
  const start=session.start_time;
  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(start)&&time.slice(0,5)<start.slice(0,5)?end+86400000:end;
}

/** Denominator comes only from the authenticated dashboard's finished sessions. */
export function overallUploadProgress(data:UploadDashboard,now=new Date(data.server_now||Date.now())){
  const clockValid=Number.isFinite(now.getTime());
  const sessions=clockValid?[...new Map(data.sessions.map(s=>[sessionKey(s),s])).values()].filter(s=>sessionEnd(s)<=now.getTime()):[];
  const total=sessions.length,publishedCount=sessions.filter(s=>uploadProgress(latestForSession(data.uploads,s)).published).length;
  const unpublishedCount=total-publishedCount,publishedPercent=total?Math.round(publishedCount/total*100):0;
  return {total,publishedCount,unpublishedCount,publishedPercent,unpublishedPercent:total?100-publishedPercent:0,clockValid};
}
