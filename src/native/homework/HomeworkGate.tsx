import type {GateInput} from './btvn-contract';
import {Link} from '../../migration/navigation';
import {ZALO_ASSISTANT_URL} from '../../components/mtm-contact';

type Identity = {fullName:string;phone:string;className:string};
type Props = {
  studentCode:string; identity:Identity; busy:boolean;
  classNames?:string[]; classesLoading?:boolean; classesError?:boolean; onReloadClasses?:()=>void;
  onCode:(value:string)=>void; onIdentity:(value:Identity)=>void;
  onLogin:(input:GateInput)=>void;
};

/** Hai form độc lập: trình duyệt chỉ kiểm các ô của thẻ đang gửi. */
export default function HomeworkGate({studentCode,identity,busy,classNames=[],classesLoading=false,classesError=false,onReloadClasses,onCode,onIdentity,onLogin}:Props){
  return <><section className="btvn-entry-help mig-panel" aria-labelledby="btvn-entry-title">
    <h2 id="btvn-entry-title">Vào BTVN của lớp đang học</h2>
    <p>Chọn một cách bên dưới. Chưa có mã thì dùng họ tên, số điện thoại đã đăng ký và lớp.</p>
    <p><Link href="/huong-dan">Hướng dẫn học sinh</Link> · <Link href="/huong-dan?cho=phu-huynh">Hướng dẫn phụ huynh</Link> · <a href={ZALO_ASSISTANT_URL} target="_blank" rel="noopener noreferrer">Nhắn Zalo trợ lý lớp</a></p>
    <details><summary>Mã học sinh lấy ở đâu?</summary><p>Mã do MTM cấp cho học sinh khi cần. Nếu chưa có hoặc quên mã, dùng cách Không có mã; cần hỗ trợ thì nhắn Zalo trợ lý lớp. Không gửi mã vào nhóm công khai.</p></details>
    <details><summary>Gặp lỗi khi mở bài từ Zalo?</summary><p>Mở menu của Zalo, chọn mở bằng trình duyệt nếu có, rồi dùng Chrome hoặc Safari. Nếu không thấy lựa chọn, tự mở trình duyệt và nhập minhthanhmath.vn/btvn. Không gửi mã hoặc thông tin đăng nhập cho người khác.</p></details>
  </section><div className="btvn-gates" aria-label="Vào bài của lớp">
    <form className="btvn-gate mig-panel" aria-labelledby="btvn-code-title" onSubmit={event=>{event.preventDefault();if(!busy)onLogin({studentCode});}}>
      <h2 id="btvn-code-title">Có mã</h2>
      <label>Mã học sinh<input type="password" autoComplete="off" maxLength={160} required aria-describedby="btvn-code-help" value={studentCode} onChange={event=>onCode(event.target.value)}/></label>
      <p id="btvn-code-help">Nhập mã học sinh do MTM cấp riêng cho em.</p>
      <button type="submit" className="ep-primary" disabled={busy}>{busy?'Đang kiểm tra…':'Vào bài'}</button>
    </form>
    <form className="btvn-gate mig-panel" aria-labelledby="btvn-identity-title" onSubmit={event=>{event.preventDefault();if(!busy&&!classesLoading&&classNames.includes(identity.className))onLogin({...identity});}}>
      <h2 id="btvn-identity-title">Không có mã</h2>
      <p>Dùng họ tên học sinh hoặc phụ huynh và số điện thoại đã đăng ký với lớp. Gia đình có nhiều con cùng lớp nên nhập tên học sinh để đối chiếu đúng bài.</p>
      {([['fullName','Họ tên học sinh hoặc phụ huynh'],['phone','Số điện thoại (học sinh hoặc phụ huynh)']] as const).map(([key,label])=><label key={key}>{label}<input type={key==='phone'?'tel':'text'} autoComplete="off" maxLength={160} required value={identity[key]} onChange={event=>onIdentity({...identity,[key]:event.target.value})}/></label>)}
      <label>Lớp đang học<select required disabled={busy||classesLoading||!classNames.length} value={identity.className} onChange={event=>onIdentity({...identity,className:event.target.value})}><option value="">{classesLoading?'Đang tải lớp…':'Chọn lớp đang học'}</option>{[...classNames].sort((a,b)=>a.localeCompare(b,"vi",{numeric:true})).map(name=><option key={name} value={name}>{name}</option>)}</select></label>
      {classesError&&<p role="status">Chưa tải được danh sách lớp. <button type="button" disabled={busy||classesLoading} onClick={onReloadClasses}>Thử tải lại</button></p>}
      {!classesLoading&&!classesError&&!classNames.length&&<p role="status">Chưa có lớp để chọn. Em liên hệ MTM.</p>}
      <button type="submit" className="ep-primary" disabled={busy||classesLoading||!classNames.length}>{busy?'Đang kiểm tra…':'Vào bài'}</button>
    </form>
  </div></>;
}
