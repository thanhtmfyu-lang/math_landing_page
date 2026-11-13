import {useEffect,useRef,useState,type FormEvent} from 'react';
import {HISTORY_NO_DATA,cleanHistoryQuery,defaultHistoryQuery,historyAttendance,historyAttendanceSource,historyDate,historyDateTime,historyEnrollment,historyRowKey,historyScore,historyScoreBasis,historyStudentName,validateHistoryPage,validateHistoryQuery,type StaffHistoryClass,type StaffHistoryPage,type StaffHistoryQuery,type StaffHistoryRow} from './staff-history';
import './staff-history.css';
export type {StaffHistoryPage,StaffHistoryQuery} from './staff-history';

type View={owner:string;data:StaffHistoryPage|null;query:StaffHistoryQuery};
export type StaffHistoryProps={owner:string;classes?:StaffHistoryClass[];loadPage:(query:StaffHistoryQuery)=>Promise<StaffHistoryPage>;initialData?:StaffHistoryPage};
function initialPage(data:StaffHistoryPage|undefined){try{return data?validateHistoryPage(data):null;}catch{return null;}}
function Homework({row}:{row:StaffHistoryRow}){
  if(!row.homework.length)return <span className="sh-no-data">{HISTORY_NO_DATA}</span>;
  return <ul className="sh-homework-list">{row.homework.map((item,index)=><li key={`${item.assignment_id}|${index}`}><div><b>{item.title||'BTVN'}</b>{item.lesson_date&&<small>Ngày giao: {historyDate(item.lesson_date)}</small>}<small>{item.status==='submitted'?'Đã nộp':item.status==='pending'?'Đang chờ kết quả':item.status==='not_submitted'?'Chưa nộp':HISTORY_NO_DATA}</small>{(item.submitted_at||item.status==='submitted')&&<small>Thời điểm nộp: {historyDateTime(item.submitted_at)}</small>}</div><strong className={item.score===null?'sh-no-data':''}>{historyScore(item.score)}</strong></li>)}</ul>;
}

export default function StaffHistory({owner,classes=[],loadPage,initialData}:StaffHistoryProps){
  const defaultQuery=()=>defaultHistoryQuery(),firstOwner=useRef(owner),loader=useRef(loadPage),activeOwner=useRef(owner),generation=useRef(0),mounted=useRef(true);
  loader.current=loadPage;activeOwner.current=owner;
  const [form,setForm]=useState({owner,query:defaultQuery()}),[view,setView]=useState<View>(()=>({owner,data:initialPage(initialData),query:defaultQuery()}));
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[focus,setFocus]=useState<{owner:string;student_id:string;name:string}|null>(null);
  const returnView=useRef<View|null>(null);
  const visible=view.owner===owner?view.data:null,draft=form.owner===owner?form.query:defaultQuery(),selected=focus?.owner===owner?focus:null;
  const options=[...new Map([...classes,...(visible?.classes??[])].map(item=>[item.class_id,item])).values()];
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);

  async function request(query:StaffHistoryQuery,clear=false){
    const error=validateHistoryQuery(query);if(error){setMessage(error);return;}
    const captured=cleanHistoryQuery(query),requestOwner=owner,token=++generation.current;
    if(clear)setView({owner:requestOwner,data:null,query:captured});setBusy(true);setMessage('');
    try{
      const result=validateHistoryPage(await loader.current(captured));
      if(!mounted.current||activeOwner.current!==requestOwner||generation.current!==token)return;
      setView({owner:requestOwner,data:result,query:captured});
      setMessage(result.total?`Tìm thấy ${result.total.toLocaleString('vi-VN')} dòng lịch sử.`:'Chưa có dữ liệu phù hợp với khoảng ngày và bộ lọc này.');
    }catch{
      if(mounted.current&&activeOwner.current===requestOwner&&generation.current===token)setMessage('Chưa tải được lịch sử. Kiểm tra kết nối và quyền truy cập, rồi thử lại.'+(!clear&&view.owner===requestOwner&&view.data?' Kết quả bên dưới là lần tra trước.':''));
    }finally{if(mounted.current&&activeOwner.current===requestOwner&&generation.current===token)setBusy(false);}
  }
  useEffect(()=>{
    generation.current++;setBusy(false);setMessage('');setFocus(null);returnView.current=null;
    const query=defaultQuery();setForm({owner,query});
    if(owner){if(firstOwner.current!==owner)setView({owner,data:null,query});void request(query);}
    else setView({owner,data:null,query});
    return()=>{generation.current++;};
  },[owner]);
  function edit(patch:Partial<StaffHistoryQuery>){setForm({owner,query:{...draft,...patch,page:1,student_id:undefined}});}
  function search(event:FormEvent){event.preventDefault();const query={...draft,page:1,student_id:undefined};const error=validateHistoryQuery(query);if(error){setMessage(error);return;}setFocus(null);returnView.current=null;void request(query);}
  function detail(row:StaffHistoryRow){returnView.current=view;setFocus({owner,student_id:row.student_id,name:historyStudentName(row)});void request({...view.query,student_id:row.student_id,name:undefined,page:1},true);}
  function back(){generation.current++;setBusy(false);setMessage('');setFocus(null);const previous=returnView.current;if(previous?.owner===owner){setView(previous);setForm({owner,query:previous.query});}returnView.current=null;}
  const totalPages=visible?Math.max(1,Math.ceil(visible.total/visible.page_size)):1;
  const hasNext=visible?(visible.has_more??visible.page*visible.page_size<visible.total):false;
  if(!owner)return <section className="sh-root"><h2>Điểm &amp; điểm danh</h2><p role="status">Đăng nhập tài khoản được cấp quyền để tra cứu.</p></section>;
  return <section className="sh-root" aria-labelledby="sh-heading">
    <header className="sh-header"><div><h2 id="sh-heading">Điểm &amp; điểm danh</h2><p>Tra cứu các buổi và bài cũ theo lớp hoặc tên học sinh.</p></div></header>
    <form className="sh-filter-form" onSubmit={search}><fieldset disabled={busy}><div className="sh-filters">
      <label>Xem theo<select value={draft.mode} onChange={event=>edit({mode:event.target.value as StaffHistoryQuery['mode']})}><option value="session">Theo buổi học</option><option value="assignment">Theo ngày giao BTVN</option></select></label>
      <label>Lớp<select value={draft.class_id??''} onChange={event=>edit({class_id:event.target.value})}><option value="">Tất cả lớp được phép xem</option>{options.map(item=><option key={item.class_id} value={item.class_id}>{item.class_name}</option>)}</select></label>
      <label className="sh-name-filter">Tên học sinh<input type="search" maxLength={100} value={draft.name??''} onChange={event=>edit({name:event.target.value})} placeholder="Nhập một phần hoặc đầy đủ họ tên" autoComplete="off"/></label>
      <label>Từ ngày<input type="date" required value={draft.from_date} onChange={event=>edit({from_date:event.target.value})}/></label>
      <label>Đến ngày<input type="date" required value={draft.to_date} onChange={event=>edit({to_date:event.target.value})}/></label>
      <button className="sh-search" type="submit">{busy?'Đang tìm…':'Tìm kiếm'}</button>
    </div></fieldset><p className="sh-note">Xem tối đa 31 ngày mỗi lần. Đổi khoảng ngày để tra các tháng trước.</p></form>
    {selected&&<div className="sh-detail-heading"><div><h3>Lịch sử · {selected.name}</h3><small>Hồ sơ {selected.student_id} · giữ nguyên cách xem và khoảng ngày đã chọn</small></div><button type="button" onClick={back}>Quay lại kết quả</button></div>}
    <div className="sh-result-head"><div><p>{visible?`${historyDate(view.query.from_date)} – ${historyDate(view.query.to_date)} · ${historyScoreBasis(visible.score_basis,view.query.mode)}`:'Kết quả tra cứu'}</p>{visible&&<small>{view.query.class_id?options.find(item=>item.class_id===view.query.class_id)?.class_name||view.query.class_id:'Các lớp được phép xem'}{view.query.name?` · Tìm tên: ${view.query.name}`:''}</small>}</div><span>{visible?.total??0} dòng</span></div>
    {visible?.score_snapshot==='current_official_best'&&<p className="sh-note">Điểm là kết quả chính thức hiện đang lưu của bài, có thể gồm lượt nộp sau buổi được xem. Đối chiếu thời điểm nộp ở từng bài.</p>}
    {form.owner===owner&&message&&<p className="sh-message" role="status">{message}</p>}{busy&&<p className="sh-loading" role="status">Đang tải dữ liệu…</p>}
    {visible&&visible.rows.length>0?<div className="sh-table-wrap" aria-busy={busy}><table className="sh-table"><caption>Mỗi dòng là một học sinh trong một buổi hoặc một ngày giao bài. Điểm trống và điểm danh trống là {HISTORY_NO_DATA.toLowerCase()}.</caption><thead><tr><th scope="col">Học sinh · lớp</th><th scope="col">Ngày</th><th scope="col">Điểm danh</th><th scope="col">{historyScoreBasis(visible.score_basis,view.query.mode)}</th></tr></thead><tbody>{visible.rows.map(row=><tr key={historyRowKey(row)}>
      <td data-label="Học sinh · lớp"><strong>{historyStudentName(row)}</strong><span>{row.class_name||HISTORY_NO_DATA}</span><small className="sh-enrollment">{historyEnrollment(row.enrollment_status)}</small><small className="sh-student-id">Hồ sơ {row.student_id}</small>{!selected&&<button type="button" disabled={busy} onClick={()=>detail(row)} aria-label={`Xem lịch sử của ${historyStudentName(row)} · ${row.class_name} · hồ sơ ${row.student_id}`}>Xem lịch sử</button>}</td>
      <td data-label="Ngày"><strong>{historyDate(row.lesson_date)}</strong>{row.start_time&&<small>{row.start_time.slice(0,5)}</small>}</td>
      <td data-label="Điểm danh"><span className={row.attendance_status?'sh-attendance':'sh-no-data'}>{historyAttendance(row.attendance_status)}</span>{historyAttendanceSource(row.attendance_source)&&<small>Nguồn: {historyAttendanceSource(row.attendance_source)}</small>}</td>
      <td data-label="BTVN"><Homework row={row}/></td>
    </tr>)}</tbody></table></div>:!busy&&<div className="sh-empty">{HISTORY_NO_DATA} trong phạm vi đang xem.</div>}
    {visible&&visible.total>0&&<nav className="sh-pagination" aria-label="Phân trang lịch sử"><button type="button" disabled={busy||visible.page<=1} onClick={()=>void request({...view.query,page:visible.page-1})}>Trang trước</button><span>Trang {visible.page}/{totalPages}</span><button type="button" disabled={busy||!hasNext} onClick={()=>void request({...view.query,page:visible.page+1})}>Trang sau</button></nav>}
    <p className="sh-history-note">Nhãn nghỉ hoặc chuyển lớp được giữ cùng hồ sơ lịch sử; không dùng các dòng cũ để xác nhận tình trạng học hiện tại.</p>
  </section>;
}
