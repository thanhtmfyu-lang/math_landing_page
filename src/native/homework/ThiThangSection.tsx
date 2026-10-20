import {useState} from 'react';
import type {HomeworkLesson} from './btvn-contract';
import {thiThangPart,maDeLabel,thiThangMonth} from './thi-thang-codes';
import {isHomeworkLocked} from './homework-priority';

const dateTime=(at:number)=>new Date(at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
export type ThiThangGroup={base:string;thi:HomeworkLesson|null;btvn:HomeworkLesson[]};
/** Gom thẻ theo kỳ; máy chủ đã lọc mã không thuộc về HS. */
export function thiThangGroups(lessons:HomeworkLesson[]):ThiThangGroup[]{
  const groups=new Map<string,ThiThangGroup>();
  for(const lesson of lessons){
    const part=thiThangPart(lesson.lessonCode);if(!part)continue;
    const group=groups.get(part.base)??{base:part.base,thi:null,btvn:[]};
    if(part.phase==='thi')group.thi=lesson;else group.btvn.push(lesson);
    groups.set(part.base,group);
  }
  return [...groups.values()].map(g=>({...g,btvn:g.btvn.sort((a,b)=>a.lessonCode.localeCompare(b.lessonCode))})).sort((a,b)=>b.base.localeCompare(a.base));
}
const maOf=(lesson:HomeworkLesson)=>thiThangPart(lesson.lessonCode)!.ma;
const other=(ma:1|2)=>(ma===1?2:1) as 1|2;
const scoreText=(lesson:HomeworkLesson)=>lesson.bestScore!==null&&!lesson.pendingGrading?lesson.bestScore.toLocaleString('vi-VN',{maximumFractionDigits:2})+'/10':lesson.submittedAt!=null?'Đã nộp · điểm công bố sau giờ đóng':null;

/** Mục "Thi kết thúc tháng" trong BTVN: thi online 1 lần trong ca, sau ca mã còn lại là BTVN. */
export default function ThiThangSection({lessons,now,busy,onSelect}:{lessons:HomeworkLesson[];now:number;busy:boolean;onSelect:(code:string)=>void}){
  const groups=thiThangGroups(lessons);
  const [picked,setPicked]=useState<Record<string,1|2>>({});
  if(!groups.length)return null;
  return <section className="r104-hw-thi-thang" aria-labelledby="thi-thang-title">
    <h2 id="thi-thang-title">Thi kết thúc tháng</h2>
    <p className="r104-hw-thi-note">Mỗi kỳ có 2 mã đề. Học offline thi đề giấy trên lớp; học online làm đề trên web đúng ca, chỉ 1 lần. Sau ca thi, mã đề em chưa làm là BTVN.</p>
    {groups.map(group=>{
      const thi=group.thi,opens=thi?.opensAt,closes=thi?.closesAt,month=thiThangMonth(group.base);
      const inWindow=thi&&opens!=null&&closes!=null&&now>=opens&&now<closes,before=thi&&opens!=null&&now<opens;
      const onlineDone=thi&&thi.submittedAt!=null?maOf(thi):null;
      const openBtvn=group.btvn.filter(l=>!isHomeworkLocked(l,now));
      // Một thẻ còn lại = máy chủ đã biết mã em làm; hai thẻ = em tự chọn mã đã làm trên giấy.
      const chosen=onlineDone??(openBtvn.length===1?other(maOf(openBtvn[0])):picked[group.base]??null);
      const homework=chosen?openBtvn.find(l=>maOf(l)===other(chosen))??null:null;
      return <article key={group.base} className="r104-hw-thi-card">
        <header><strong>Kỳ thi tháng {month}</strong>{closes!=null&&<small>Ca thi đóng: {dateTime(closes)}</small>}</header>
        {thi&&<div className="r104-hw-thi-step"><h3>Bài thi online · {maDeLabel(maOf(thi))}</h3>
          {before&&<p>Mở lúc {dateTime(opens!)}. Đây là ca học bình thường theo lịch lớp.</p>}
          {inWindow&&thi.submittedAt==null&&<><p>Dành cho học sinh học online. Em chỉ được làm 1 lần, nộp trước giờ đóng ca.</p><button type="button" className="r104-hw-primary" disabled={busy} onClick={()=>onSelect(thi.lessonCode)}>Vào làm bài thi</button></>}
          {scoreText(thi)&&<p>Kết quả: <b>{scoreText(thi)}</b></p>}
          {!before&&!inWindow&&thi.submittedAt==null&&<p>Ca thi online đã đóng. Học offline thi giấy, điểm do MTM chấm từ bài trên lớp.</p>}
        </div>}
        {(!thi||(closes!=null&&now>=closes))&&<div className="r104-hw-thi-step"><h3>BTVN sau ca thi</h3>
          {!openBtvn.length&&<p>{group.btvn.length?'BTVN mở sau giờ đóng ca thi.':'BTVN của kỳ này đang chuẩn bị.'}</p>}
          {openBtvn.length===2&&!onlineDone&&<fieldset className="r104-hw-thi-choose"><legend>Trên lớp em đã làm mã đề nào?</legend>
            {([1,2] as const).map(ma=><label key={ma}><input type="radio" name={'thi-'+group.base} checked={picked[group.base]===ma} onChange={()=>setPicked(p=>({...p,[group.base]:ma}))}/> {maDeLabel(ma)}</label>)}
            <small>Khi em nộp BTVN mã còn lại, lựa chọn được ghi lại và không đổi được.</small></fieldset>}
          {homework&&<><p>BTVN của em: <b>{maDeLabel(maOf(homework))}</b>{chosen&&' (em đã làm '+maDeLabel(chosen)+')'}.</p>{scoreText(homework)&&<p>Kết quả: <b>{scoreText(homework)}</b></p>}<button type="button" className="r104-hw-primary" disabled={busy} onClick={()=>onSelect(homework.lessonCode)}>{homework.submittedAt!=null?'Xem bài BTVN':'Làm BTVN '+maDeLabel(maOf(homework))}</button></>}
        </div>}
      </article>;})}
  </section>;
}
