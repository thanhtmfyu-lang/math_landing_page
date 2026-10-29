import {useEffect,useRef,useState} from 'react';
import {Link} from '../../migration/navigation';
import {SEO} from '../../components/SEO';
import {adminRequest,requireAdmin} from '../admin/backend';
import './homework.css';
import '../admin/admin.css';
import './truoc-ca.css';
/** Một dòng từ mtm_truoc_ca_admin: một em trong một ca, kèm một bài tới hạn ở ca (hoặc không có bài). */
export type TruocCaRow={ca:string;gio:string;hocSinh:string;lopGoc:string;nguon:string;bai:string|null;diem:number|null;soLan:number};
export type TruocCaData={day:string;generatedAt:string;rows:TruocCaRow[]};
export type TruocCaStatus='Chưa làm'|'Dưới 7'|'Đạt'|'Chưa có bài';
export type TruocCaStudent={hocSinh:string;lopGoc:string;nguon:string;items:{bai:string;diem:number|null;soLan:number}[];status:TruocCaStatus};
export type TruocCaSession={ca:string;gio:string;students:TruocCaStudent[];canLam:number};
/** Luật J39: chưa nộp bài tới hạn hoặc điểm dưới 7 thì làm lại đạt từ 7 mới vào lớp. */
export function studentStatus(items:TruocCaStudent['items']):TruocCaStatus{
 if(!items.length)return 'Chưa có bài';
 if(items.some(x=>x.soLan===0||x.diem===null))return 'Chưa làm';
 return items.some(x=>(x.diem as number)<7)?'Dưới 7':'Đạt';
}
export function groupTruocCa(rows:TruocCaRow[]):TruocCaSession[]{
 const sessions=new Map<string,{ca:string;gio:string;students:Map<string,TruocCaStudent>}>();
 for(const row of rows){
  const key=row.gio+'|'+row.ca;
  if(!sessions.has(key))sessions.set(key,{ca:row.ca,gio:row.gio,students:new Map()});
  const students=sessions.get(key)!.students;
  if(!students.has(row.hocSinh))students.set(row.hocSinh,{hocSinh:row.hocSinh,lopGoc:row.lopGoc,nguon:row.nguon,items:[],status:'Chưa có bài'});
  if(row.bai)students.get(row.hocSinh)!.items.push({bai:row.bai,diem:row.diem,soLan:row.soLan});
 }
 return [...sessions.values()].map(s=>{const students=[...s.students.values()].map(x=>({...x,status:studentStatus(x.items)}));
  return {ca:s.ca,gio:s.gio,students,canLam:students.filter(x=>x.status==='Chưa làm'||x.status==='Dưới 7').length};});
}
export const diemText=(item:{diem:number|null;soLan:number})=>item.soLan===0||item.diem===null?'Chưa làm':item.diem.toLocaleString('vi-VN',{maximumFractionDigits:2});
export function vnToday(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(now);}
export async function loadTruocCa(expectedOwner:string,day:string):Promise<TruocCaData>{
 const {user,client}=await adminRequest(expectedOwner);
 const {data,error}=await client.rpc('mtm_truoc_ca_admin',{p_day:day});
 if(error||!data||!Array.isArray(data.rows))throw Error('Chưa tải được bảng trước ca. Kiểm quyền GV/QL rồi bấm Tải lại.');
 if((await requireAdmin()).id!==user.id)throw Error('Tài khoản đã thay đổi. Tải lại trang.');
 return data as TruocCaData;
}
export function TruocCaTables({sessions}:{sessions:TruocCaSession[]}){
 if(!sessions.length)return <p role="status">Ngày này chưa có ca nào trong thời khoá biểu.</p>;
 return <>{sessions.map(s=><section key={s.gio+s.ca} className="hw-panel tc-session" aria-label={'Ca '+s.gio+' lớp '+s.ca}>
  <h2>{s.ca} · {s.gio}</h2>
  <p className={s.canLam?'tc-warn':'tc-ok'}>{s.canLam?`${s.canLam}/${s.students.length} em cần làm lại BTVN đạt từ 7 trước khi vào lớp.`:`Cả ${s.students.length} em đã đạt BTVN tới hạn (hoặc ca chưa có bài tới hạn).`}</p>
  <div className="hw-table"><table><thead><tr><th>Học sinh</th><th>BTVN tới hạn</th><th>Điểm</th><th>Cần làm</th></tr></thead><tbody>
   {s.students.map(st=><tr key={st.hocSinh} className={'tc-'+(st.status==='Đạt'?'dat':st.status==='Chưa có bài'?'none':'can')}>
    <td>{st.hocSinh}{st.lopGoc!==s.ca&&<small>Lớp gốc {st.lopGoc}{st.nguon&&st.nguon!=='Lớp gốc'?' · '+st.nguon:''}</small>}</td>
    <td>{st.items.length?st.items.map(x=><span key={x.bai} className="tc-line">{x.bai}</span>):'Chưa có bài'}</td>
    <td>{st.items.length?st.items.map(x=><span key={x.bai} className="tc-line">{diemText(x)}</span>):''}</td>
    <td><strong>{st.status==='Chưa làm'||st.status==='Dưới 7'?'Làm lại đạt từ 7':st.status==='Đạt'?'Đạt':''}</strong></td>
   </tr>)}
  </tbody></table></div>
 </section>)}</>;
}
export default function AdminTruocCa({load=loadTruocCa}:{load?:typeof loadTruocCa}){
 const [owner,setOwner]=useState<string|null>(null),[day,setDay]=useState(vnToday()),[data,setData]=useState<TruocCaData|null>(null),[message,setMessage]=useState('Đang kiểm quyền quản trị…'),[busy,setBusy]=useState(false);
 const generation=useRef(0);
 const refresh=async(id:string,d:string)=>{const run=++generation.current;setBusy(true);setMessage('');
  try{const out=await load(id,d);if(run===generation.current){setData(out);setMessage('Cập nhật lúc '+out.generatedAt+'.');}}
  catch(e){if(run===generation.current){setData(null);setMessage(e instanceof Error?e.message:'Chưa tải được bảng trước ca.');}}
  finally{if(run===generation.current)setBusy(false);}};
 useEffect(()=>{let active=true;requireAdmin().then(u=>{if(!active)return;setOwner(u.id);void refresh(u.id,day);}).catch(e=>{if(active)setMessage(e instanceof Error?e.message:'Cần đăng nhập quản trị.');});return()=>{active=false;generation.current++;};},[]);
 return <div className="hw-root ma-root"><SEO title="Báo điểm trước ca | Minh Thành Math" description="BTVN tới hạn của từng ca cho GV, QL" robots="noindex,nofollow"/>
  <h1>Báo điểm BTVN trước ca</h1>
  <p>Mỗi ca chỉ gồm các em đang học đăng ký đúng ca đó. BTVN tới hạn tính theo luật giao thứ nào nộp đúng thứ đó tuần sau; điểm đọc thẳng từ bài nộp trên web. Em chưa làm hoặc dưới 7 làm lại đạt từ 7 mới vào lớp.</p>
  <div className="hw-actions"><Link href="/quan-tri/btvn">Quản trị BTVN</Link><Link href="/quan-tri/de-thi">Đăng nhập quản trị</Link></div>
  {owner&&<form className="tc-pick" onSubmit={e=>{e.preventDefault();void refresh(owner,day);}}><label>Ngày<input type="date" value={day} onChange={e=>setDay(e.target.value)}/></label><button className="hw-primary" disabled={busy||!day}>{busy?'Đang tải…':'Tải lại'}</button></form>}
  <p role="status" className="hw-message">{message}</p>
  {data&&<TruocCaTables sessions={groupTruocCa(data.rows)}/>}
 </div>;
}
