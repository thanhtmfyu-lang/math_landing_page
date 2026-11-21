import {lazy,Suspense,useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {HISTORY_NO_DATA,cleanHistoryQuery,defaultHistoryQuery,historyAttendance,historyAttendanceSource,historyAttendanceTime,historyDate,historyDateTime,historyEnrollment,historyRowKey,historyScore,historyScoreBasis,historyStudentName,historyWorkLabel,historyWorkStatus,validateHistoryPage,validateHistoryQuery,type StaffHistoryClass,type StaffHistoryHomework,type StaffHistoryPage,type StaffHistoryQuery,type StaffHistoryRow,type StaffHistoryWorkKind} from './staff-history';
import {canOpenStudentWork,type StaffStudentWorkData,type StaffStudentWorkRequest} from './staff-student-work';
import './staff-history.css';
const StaffStudentWorkDialog=lazy(()=>import('./StaffStudentWorkDialog'));
export type {StaffHistoryPage,StaffHistoryQuery} from './staff-history';

type View={owner:string;data:StaffHistoryPage|null;query:StaffHistoryQuery};
export type StaffHistoryProps={owner:string;classes?:StaffHistoryClass[];loadPage:(query:StaffHistoryQuery)=>Promise<StaffHistoryPage>;loadStudentWork?:(request:StaffStudentWorkRequest,signal?:AbortSignal)=>Promise<StaffStudentWorkData>;active?:boolean;initialData?:StaffHistoryPage;initialWorkKind?:StaffHistoryWorkKind};
function initialPage(data:StaffHistoryPage|undefined,kind:StaffHistoryWorkKind){try{return data?validateHistoryPage(data,kind):null;}catch{return null;}}
function studentMatchKey(row:StaffHistoryRow){
  return JSON.stringify([row.class_id,historyStudentName(row).normalize('NFC').toLocaleLowerCase('vi')]);
}

function StudentWorkList({items,kind,busy,recordLabel,onOpen}:{
  items:StaffHistoryHomework[];
  kind:StaffHistoryWorkKind;
  busy:boolean;
  recordLabel:string;
  onOpen?:(item:StaffHistoryHomework)=>void;
}){
  if(!items.length)return <span className="sh-no-data">{kind==='exam'?'Chưa có đề kiểm tra':'Chưa có BTVN'}</span>;

  return <ul className="sh-homework-list">
    {items.map((item,index)=>{
      const title=item.title||historyWorkLabel(kind);
      const released=item.status!=='not_released';
      const showScore=released&&item.score!==null;
      const open=onOpen&&canOpenStudentWork(item)?()=>onOpen(item):undefined;
      return <li key={`${item.assignment_id}|${index}`}>
        <div className="sh-assignment-info">
          <b>{title}</b>
          <span className="sh-status" data-status={item.status}>{historyWorkStatus(item.status)}</span>
          {item.lesson_date&&<small>{kind==='exam'?'Ngày kiểm tra':'Ngày giao'}: {historyDate(item.lesson_date)}</small>}
          {released&&item.submitted_at&&<small>Nộp {historyDateTime(item.submitted_at)}</small>}
        </div>
        {(showScore||open)&&<div className="sh-work-actions">
          {showScore&&<span className="sh-score"><span>Điểm</span><strong>{historyScore(item.score)}</strong></span>}
          {open&&<button type="button" disabled={busy} aria-haspopup="dialog" onClick={open}
            aria-label={`Xem bài làm · ${title} · ${recordLabel}`}>Xem bài làm</button>}
        </div>}
      </li>;
    })}
  </ul>;
}

function Attendance({row,showClocks}:{row:StaffHistoryRow;showClocks:boolean}){
  const status=historyAttendance(row.attendance_status);
  const source=historyAttendanceSource(row.attendance_source);

  return <div className="sh-attendance-info">
    <div className="sh-attendance-state">
      {status===HISTORY_NO_DATA
        ?<span className="sh-no-data">{HISTORY_NO_DATA}</span>
        :<span className="sh-status" data-status={row.attendance_status}>{status}</span>}
      {source&&<small>Nguồn: {source}</small>}
    </div>
    {showClocks&&<dl className="sh-attendance-times">
      <div><dt>Giờ vào</dt><dd>{historyAttendanceTime(row.attendance_time_in)??'—'}</dd></div>
      <div><dt>Giờ ra</dt><dd>{historyAttendanceTime(row.attendance_time_out)??'—'}</dd></div>
    </dl>}
  </div>;
}

export default function StaffHistory({owner,classes=[],loadPage,loadStudentWork,active=true,initialData,initialWorkKind='homework'}:StaffHistoryProps){
  const defaultQuery=()=>defaultHistoryQuery(undefined,initialWorkKind),firstOwner=useRef(owner),loader=useRef(loadPage),activeOwner=useRef(owner),generation=useRef(0),mounted=useRef(true);
  loader.current=loadPage;activeOwner.current=owner;
  const [form,setForm]=useState({owner,query:defaultQuery()}),[view,setView]=useState<View>(()=>({owner,data:initialPage(initialData,initialWorkKind),query:defaultQuery()}));
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[focus,setFocus]=useState<{owner:string;student_id:string;name:string}|null>(null);
  const [work,setWork]=useState<{owner:string;row:StaffHistoryRow;item?:StaffHistoryHomework}|null>(null);
  const closeWork=useCallback(()=>setWork(null),[]);
  useEffect(()=>{if(!active)closeWork();},[active,closeWork]);
  const returnView=useRef<View|null>(null);
  const visible=view.owner===owner?view.data:null,draft=form.owner===owner?form.query:defaultQuery(),selected=focus?.owner===owner?focus:null;
  const options=[...new Map([...classes,...(visible?.classes??[])].map(item=>[item.class_id,item])).values()];
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);

  async function request(query:StaffHistoryQuery,clear=false){
    const error=validateHistoryQuery(query);if(error){setMessage(error);return;}
    const captured=cleanHistoryQuery(query),requestOwner=owner,token=++generation.current;
    closeWork();if(clear)setView({owner:requestOwner,data:null,query:captured});setBusy(true);setMessage('');
    try{
      const result=validateHistoryPage(await loader.current(captured),captured.work_kind);
      if(!mounted.current||activeOwner.current!==requestOwner||generation.current!==token)return;
      setView({owner:requestOwner,data:result,query:captured});
    }catch{
      if(mounted.current&&activeOwner.current===requestOwner&&generation.current===token)setMessage('Chưa tải được lịch sử. Thử chọn một lớp hoặc khoảng ngày ngắn hơn.'+(!clear&&view.owner===requestOwner&&view.data?' Kết quả bên dưới là lần tra trước.':''));
    }finally{if(mounted.current&&activeOwner.current===requestOwner&&generation.current===token)setBusy(false);}
  }
  useEffect(()=>{
    generation.current++;setBusy(false);setMessage('');setFocus(null);closeWork();returnView.current=null;
    const query=defaultQuery();setForm({owner,query});
    if(owner){if(firstOwner.current!==owner)setView({owner,data:null,query});void request(query);}
    else setView({owner,data:null,query});
    return()=>{generation.current++;};
  },[owner]);
  function edit(patch:Partial<StaffHistoryQuery>){setForm({owner,query:{...draft,...patch,page:1,student_id:undefined}});}
  function search(event:FormEvent){event.preventDefault();const query={...draft,page:1,student_id:undefined};const error=validateHistoryQuery(query);if(error){setMessage(error);return;}setFocus(null);returnView.current=null;void request(query);}
  function detail(row:StaffHistoryRow){returnView.current=view;setFocus({owner,student_id:row.student_id,name:historyStudentName(row)});void request({...view.query,student_id:row.student_id,name:undefined,page:1},true);}
  function back(){closeWork();generation.current++;setBusy(false);setMessage('');setFocus(null);const previous=returnView.current;if(previous?.owner===owner){setView(previous);setForm({owner,query:previous.query});}returnView.current=null;}
  const totalPages=visible?Math.max(1,Math.ceil(visible.total/visible.page_size)):1;
  const hasNext=visible?(visible.has_more??visible.page*visible.page_size<visible.total):false;
  const kind=view.query.work_kind??'homework';
  const perSession=view.query.mode==='session';
  const showExamShortcut=!!loadStudentWork&&perSession&&kind==='homework';
  const studentIdsByName=new Map<string,Set<string>>();
  for(const row of visible?.rows??[]){
    const key=studentMatchKey(row);
    const studentIds=studentIdsByName.get(key)??new Set<string>();
    studentIds.add(row.student_id);
    studentIdsByName.set(key,studentIds);
  }

  if(!owner)return <section className="sh-root"><h2>Điểm &amp; điểm danh</h2><p role="status">Đăng nhập tài khoản được cấp quyền để tra cứu.</p></section>;
  return <section className="sh-root" aria-labelledby="sh-heading">
    <header className="sh-header">
      <h2 id="sh-heading">Điểm &amp; điểm danh</h2>
      <p>Tra cứu theo lớp, tên học sinh hoặc khoảng ngày.</p>
    </header>
    <form className="sh-filter-form" onSubmit={search}>
      <fieldset disabled={busy}>
        <div className="sh-filters">
          <label>Loại bài<select value={draft.work_kind??'homework'} onChange={event=>edit({work_kind:event.target.value as StaffHistoryWorkKind})}><option value="homework">BTVN</option><option value="exam">Đề kiểm tra</option></select></label>
          <label>Xem theo<select value={draft.mode} onChange={event=>edit({mode:event.target.value as StaffHistoryQuery['mode']})}><option value="session">Theo buổi học</option><option value="assignment">Theo ngày giao bài</option></select></label>
          <label className="sh-class-filter">Lớp<select value={draft.class_id??''} onChange={event=>edit({class_id:event.target.value})}><option value="">Tất cả lớp được phép xem</option>{options.map(item=><option key={item.class_id} value={item.class_id}>{item.class_name}</option>)}</select></label>
          <label className="sh-name-filter">Tên học sinh<input type="search" maxLength={100} value={draft.name??''} onChange={event=>edit({name:event.target.value})} placeholder="Nhập tên học sinh" autoComplete="off"/></label>
          <label>Từ ngày<input type="date" required value={draft.from_date} onChange={event=>edit({from_date:event.target.value})}/></label>
          <label>Đến ngày<input type="date" required value={draft.to_date} onChange={event=>edit({to_date:event.target.value})}/></label>
          <button className="sh-search" type="submit">{busy?'Đang tìm…':'Tìm kiếm'}</button>
        </div>
      </fieldset>
      <p className="sh-note">Xem tối đa 31 ngày mỗi lần.</p>
    </form>
    {selected&&<div className="sh-detail-heading">
      <div><h3>Lịch sử · {selected.name}</h3><small>Hồ sơ {selected.student_id}</small></div>
      <button type="button" onClick={back}>Quay lại kết quả</button>
    </div>}
    <div className="sh-result-head">
      <div>
        <h3 id="sh-roster-heading">{selected?'Các buổi của học sinh':'Danh sách học sinh'}</h3>
        {visible&&<p>
          {historyDate(view.query.from_date)} – {historyDate(view.query.to_date)} · {view.query.class_id
            ?options.find(item=>item.class_id===view.query.class_id)?.class_name||view.query.class_id
            :'Tất cả lớp được phép xem'}
          {view.query.name&&` · ${view.query.name}`}
        </p>}
      </div>
      {visible&&<span className="sh-result-count" role="status">{visible.total.toLocaleString('vi-VN')} dòng</span>}
    </div>
    {visible?.score_snapshot==='current_official_best'&&<p className="sh-note">Điểm chính thức có thể gồm lượt nộp sau buổi đang xem. Xem giờ nộp ở từng bài.</p>}
    {visible&&kind==='exam'&&<p className="sh-note">Điểm bài kiểm tra chỉ hiển thị sau giờ đóng bài.</p>}
    {form.owner===owner&&message&&<p className="sh-message" role="status">{message}</p>}
    {busy&&<p className="sh-loading" role="status">Đang tải dữ liệu…</p>}
    {visible&&visible.rows.length>0
      ?<div className="sh-table-wrap" aria-busy={busy}>
        <table className="sh-table" role="table" aria-labelledby="sh-roster-heading">
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader" className="sh-col-student">Học sinh</th>
              <th scope="col" role="columnheader" className="sh-col-date">{perSession?'Buổi học':'Ngày giao'}</th>
              <th scope="col" role="columnheader" className="sh-col-attendance">Điểm danh</th>
              <th scope="col" role="columnheader">
                {historyWorkLabel(kind)}
                <small>{historyScoreBasis(visible.score_basis,view.query.mode,kind)}</small>
              </th>
              {showExamShortcut&&<th scope="col" role="columnheader" className="sh-col-exam">Kết quả thi</th>}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {visible.rows.map(row=>{
              const name=historyStudentName(row);
              const day=historyDate(row.lesson_date);
              const historical=row.enrollment_status==='former'||row.enrollment_status==='transferred';
              const sameName=(studentIdsByName.get(studentMatchKey(row))?.size??0)>1;
              const profileSuffix=sameName?` · Hồ sơ …${row.student_id.slice(-8)}`:'';
              const recordLabel=`${name} · ${row.class_name} · ${day}${profileSuffix}`;
              return <tr role="row" key={historyRowKey(row)}>
                <th scope="row" role="rowheader" className="sh-roster-student">
                  <strong>{name}</strong>
                  <span>{row.class_name||HISTORY_NO_DATA}</span>
                  {historical&&<small className="sh-enrollment">{historyEnrollment(row.enrollment_status)}</small>}
                  {sameName&&<small title={row.student_id}>Hồ sơ …{row.student_id.slice(-8)}</small>}
                  {!selected&&<button type="button" className="sh-student-history" disabled={busy} onClick={()=>detail(row)}
                    aria-label={`Xem lịch sử của ${name} · ${row.class_name} · hồ sơ ${row.student_id}`}>Xem lịch sử</button>}
                </th>
                <td role="cell" className="sh-roster-date">
                  <span className="sh-mobile-label">{perSession?'Buổi học':'Ngày giao'}</span>
                  <strong>{day}</strong>
                  {row.start_time&&<span>{row.start_time.slice(0,5)}</span>}
                </td>
                <td role="cell" className="sh-roster-attendance">
                  <span className="sh-mobile-label">Điểm danh</span>
                  <Attendance row={row} showClocks={perSession}/>
                </td>
                <td role="cell" className="sh-roster-work">
                  <div className="sh-mobile-label">{historyWorkLabel(kind)}
                    <small>{historyScoreBasis(visible.score_basis,view.query.mode,kind)}</small>
                  </div>
                  <StudentWorkList items={row.homework} kind={kind} busy={busy} recordLabel={recordLabel}
                    onOpen={loadStudentWork?item=>setWork({owner,row,item}):undefined}/>
                </td>
                {showExamShortcut&&<td role="cell" className="sh-roster-exam">
                  <button type="button" disabled={busy} onClick={()=>setWork({owner,row})} aria-haspopup="dialog"
                    aria-label={`Xem kết quả thi của ${recordLabel}`}>Xem kết quả thi</button>
                </td>}
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      :!busy&&<div className="sh-empty">Chưa có dữ liệu phù hợp với bộ lọc.</div>}

    {visible&&(visible.page>1||hasNext)&&<nav className="sh-pagination" aria-label="Phân trang lịch sử"><button type="button" disabled={busy||visible.page<=1} onClick={()=>void request({...view.query,page:visible.page-1})}>Trang trước</button><span>Trang {visible.page}/{totalPages}</span><button type="button" disabled={busy||!hasNext} onClick={()=>void request({...view.query,page:visible.page+1})}>Trang sau</button></nav>}
    {active&&loadStudentWork&&work?.owner===owner&&<Suspense fallback={<p role="status">Đang mở kết quả…</p>}>
      <StaffStudentWorkDialog row={work.row} initialItem={work.item} mode={view.query.mode} loadPage={loadPage}
        loadWork={loadStudentWork} onClose={closeWork}/>
    </Suspense>}
  </section>;
}
