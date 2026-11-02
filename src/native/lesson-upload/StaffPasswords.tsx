import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link} from '../../migration/navigation';
import {backend} from '../admin/backend';
import {acceptPasswordRecovery,changeStaffPassword,passwordProfile,requestStaffReset,staffRoster,type StaffPasswordProfile} from './password';
import './lesson-upload.css';

export function StaffPasswordForm({owner,onDone}:{owner:string;onDone:()=>void}){
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');const active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 async function submit(event:FormEvent){event.preventDefault();if(busy)return;if(password!==confirm){setMessage('Hai lần nhập mật khẩu chưa khớp.');return;}setBusy(true);setMessage('');
  try{await changeStaffPassword(owner,password);if(active.current){setPassword('');setConfirm('');onDone();}}catch(error){if(active.current)setMessage(error instanceof Error?error.message:'Chưa đổi được mật khẩu.');}finally{if(active.current)setBusy(false);}
 }
 return <section className="lu-panel lu-login"><h2>Đổi mật khẩu để tiếp tục</h2><p>Tự đặt mật khẩu riêng. Chưa đổi xong thì tài khoản chưa được vào cổng.</p><form onSubmit={event=>void submit(event)}><label>Mật khẩu mới<input autoComplete="new-password" type="password" minLength={12} required value={password} onChange={event=>setPassword(event.target.value)}/></label><label>Nhập lại mật khẩu mới<input autoComplete="new-password" type="password" minLength={12} required value={confirm} onChange={event=>setConfirm(event.target.value)}/></label><button className="lu-primary" disabled={busy}>{busy?'Đang đổi mật khẩu…':'Lưu mật khẩu mới'}</button></form>{message&&<p role="alert">{message}</p>}<button type="button" disabled={busy} onClick={()=>void backend()?.auth.signOut({scope:'local'})}>Đăng xuất</button></section>;
}

export function StaffResetPanel({owner}:{owner:string}){
 const [roster,setRoster]=useState<StaffPasswordProfile[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');const active=useRef(true);
 useEffect(()=>{active.current=true;void staffRoster(owner).then(rows=>{if(active.current)setRoster(rows);}).catch(error=>{if(active.current)setMessage(error.message);});return()=>{active.current=false;};},[owner]);
 async function reset(target:string){if(busy)return;setBusy(true);setMessage('');try{const result=await requestStaffReset(owner,target);if(active.current){setMessage(result);setRoster(await staffRoster(owner));}}catch(error){if(active.current)setMessage(error instanceof Error?error.message:'Chưa gửi được email.');}finally{if(active.current)setBusy(false);}}
 return <section className="lu-panel"><h2>Tài khoản nhân sự</h2><p>Gửi email đặt lại đến địa chỉ đã xác minh trong hồ sơ nhân sự. Mật khẩu do chính người nhận tự đặt.</p><div className="lu-table-scroll"><table><thead><tr><th>Nhân sự</th><th>Trạng thái</th><th>Khôi phục</th></tr></thead><tbody>{roster.map(staff=><tr key={staff.user_id}><th scope="row">{staff.display_name}<small> · {staff.short_name}</small></th><td>{staff.must_change_password?'Cần đổi mật khẩu':'Đã đặt mật khẩu'}</td><td><button type="button" disabled={busy} onClick={()=>void reset(staff.user_id)}>Đặt lại mật khẩu</button>{!staff.recovery_ready&&<small> Chưa xác minh email hồ sơ</small>}</td></tr>)}</tbody></table></div>{message&&<p role="status">{message}</p>}</section>;
}

export default function StaffPasswords({recovery=false}:{recovery?:boolean}){
 const [owner,setOwner]=useState<string|null>(null),[profile,setProfile]=useState<StaffPasswordProfile|null>(null),[message,setMessage]=useState('Đang kiểm tra tài khoản…'),[done,setDone]=useState(false);const ownerRef=useRef<string|null>(null);
 useEffect(()=>{let active=true;const b=backend();let subscription:{unsubscribe:()=>void}|undefined;
  async function load(){try{const id=recovery?await acceptPasswordRecovery():(await b?.auth.getUser())?.data.user?.id;if(!id)throw Error('Đăng nhập tài khoản quản lý trước khi mở trang này.');const value=await passwordProfile(id);if(active){ownerRef.current=id;setOwner(id);setProfile(value);setMessage('');}}catch(error){if(active){ownerRef.current=null;setOwner(null);setProfile(null);setMessage(error instanceof Error?error.message:'Chưa xác minh được tài khoản.');}}}
  if(b)subscription=b.auth.onAuthStateChange((_event,session)=>{if(active&&ownerRef.current&&session?.user.id!==ownerRef.current){ownerRef.current=null;setOwner(null);setProfile(null);setDone(false);setMessage('Tài khoản đã thay đổi. Mở lại trang sau khi đăng nhập.');}}).data.subscription;
  void load();return()=>{active=false;subscription?.unsubscribe();};
 },[recovery]);
 const manager=profile&&['ql','admin'].includes(profile.role);
 return <div className="lu-root"><header className="lu-header"><div><p className="lu-eyebrow">MINH THÀNH MATH · NHÂN SỰ</p><h1>{recovery?'Đặt lại mật khẩu':'Quản trị nhân sự'}</h1></div><Link href="/quan-tri/len-bai">Cổng lên bài →</Link></header>{message&&<section className="lu-panel" role="status">{message}<p><Link href="/quan-tri/len-bai">Đăng nhập tại cổng lên bài</Link></p></section>}{done?<section className="lu-panel"><h2>Đã đổi mật khẩu</h2><Link href="/quan-tri/len-bai">Mở cổng lên bài</Link></section>:owner&&profile&&(recovery||profile.must_change_password)?<StaffPasswordForm key={owner} owner={owner} onDone={()=>setDone(true)}/>:owner&&manager?<StaffResetPanel key={owner} owner={owner}/>:profile?<section className="lu-panel">Cần tài khoản quản lý để quản trị nhân sự.</section>:null}</div>;
}
