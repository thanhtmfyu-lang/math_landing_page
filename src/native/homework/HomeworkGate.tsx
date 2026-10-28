import type {GateInput} from './btvn-contract';
import {useEffect,useRef,useState} from 'react';
import {Link} from '../../migration/navigation';
import {ZALO_ASSISTANT_URL} from '../../components/mtm-contact';

type Identity = {fullName:string;phone:string;className:string};
/** 18/10 mã PIN 6 số. Thông báo này đồng thời là tín hiệu chế độ "tạo PIN lần đầu" (không thêm state mới vào trang). */
export const PIN_SETUP_NOTICE='Lần đầu vào bằng họ tên: em tạo mã PIN 6 số riêng để bảo vệ bài và điểm, rồi bấm Vào bài.';
export const PIN_REQUIRED_NOTICE='Tài khoản đã có mã PIN. Em nhập mã PIN 6 số để vào bài.';
const digits=(v:FormDataEntryValue|null)=>typeof v==='string'?v.replace(/\D/g,''):'';
function invalidFieldMessage(field:HTMLInputElement|HTMLSelectElement){
  if(field.name.startsWith('btvn-'))return field.validity.customError?field.validationMessage:'Mã PIN phải gồm đúng 6 chữ số từ 0 đến 9.';
  if(field instanceof HTMLSelectElement)return 'Em chọn lớp đang học trước khi vào bài.';
  if(field.type==='tel')return 'Em nhập số điện thoại đã đăng ký với lớp.';
  return field.type==='password'?'Em nhập mã học sinh do MTM cấp riêng cho em.':'Em nhập họ tên học sinh hoặc phụ huynh đã đăng ký với MTM.';
}
/** Đọc ô PIN (không điều khiển) khi gửi form; sự kiện giả trong kiểm thử không có form thì giữ nguyên. */
function withPin(event:{currentTarget?:unknown},identity:Identity,setup:boolean):GateInput|null{
  const form=event.currentTarget;
  if(typeof HTMLFormElement==='undefined'||!(form instanceof HTMLFormElement))return {...identity};
  const data=new FormData(form),pin=digits(data.get('btvn-pin')),newPin=digits(data.get('btvn-new-pin')),again=digits(data.get('btvn-new-pin-2'));
  if(setup){
    const second=form.elements.namedItem('btvn-new-pin-2');
    if(second instanceof HTMLInputElement){second.setCustomValidity(newPin===again?'':'Hai lần nhập mã PIN chưa giống nhau.');if(!form.reportValidity())return null;}
    return /^[0-9]{6}$/.test(newPin)?{...identity,newPin}:null;
  }
  return /^[0-9]{6}$/.test(pin)?{...identity,pin}:{...identity};
}
const pinField=(name:string,label:string,autoComplete:string,required:boolean,help?:string)=><label key={name}>{label}<input name={name} type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete={autoComplete} required={required}/>{help&&<small>{help}</small>}</label>;
type Props = {
  studentCode:string; identity:Identity; busy:boolean;
  classNames?:string[]; classesLoading?:boolean; classesError?:boolean; onReloadClasses?:()=>void;
  onCode:(value:string)=>void; onIdentity:(value:Identity)=>void;
  onLogin:(input:GateInput,remember?:boolean)=>void;
  pinMode?:'enter'|'setup';
  notice?:string;
};

/** Hai form độc lập: trình duyệt chỉ kiểm các ô của thẻ đang gửi. */
export default function HomeworkGate({studentCode,identity,busy,classNames=[],classesLoading=false,classesError=false,onReloadClasses,onCode,onIdentity,onLogin,pinMode,notice=''}:Props){
  const [codeError,setCodeError]=useState(''),[identityError,setIdentityError]=useState('');
  const [submittedWithCode,setSubmittedWithCode]=useState(false);
  // 28/10: mặc định nhớ 30 ngày để HS không phải nhập lại mỗi buổi; máy dùng chung thì bỏ chọn.
  const [remember,setRemember]=useState(true);
  const rememberField=<label className="btvn-remember"><input type="checkbox" checked={remember} onChange={event=>setRemember(event.target.checked)}/><span>Nhớ đăng nhập 30 ngày trên máy này<small>Bỏ chọn nếu dùng máy chung hoặc máy của người khác.</small></span></label>;
  const codeFeedback=useRef<HTMLParagraphElement>(null),identityFeedback=useRef<HTMLParagraphElement>(null);
  const codeNotice=codeError||(submittedWithCode?notice:''),identityNotice=identityError||(!submittedWithCode?notice:'');
  useEffect(()=>{if(notice)(submittedWithCode?codeFeedback:identityFeedback).current?.scrollIntoView({block:'nearest'});},[notice,submittedWithCode]);
  return <><section className="btvn-entry-help mig-panel" aria-labelledby="btvn-entry-title">
    <h2 id="btvn-entry-title">Vào BTVN của lớp đang học</h2>
    <p>Chọn một cách bên dưới. Chưa có mã thì dùng họ tên, số điện thoại đã đăng ký và lớp.</p>
    <p><Link href="/huong-dan">Hướng dẫn học sinh</Link> · <Link href="/huong-dan?cho=phu-huynh">Hướng dẫn phụ huynh</Link> · <a href={ZALO_ASSISTANT_URL} target="_blank" rel="noopener noreferrer">Nhắn Zalo trợ lý lớp</a></p>
    <details><summary>Mã học sinh lấy ở đâu?</summary><p>Mã do MTM cấp cho học sinh khi cần. Nếu chưa có hoặc quên mã, dùng cách Không có mã; cần hỗ trợ thì nhắn Zalo trợ lý lớp. Không gửi mã vào nhóm công khai.</p></details>
    <details><summary>Gặp lỗi khi mở bài từ Zalo?</summary><p>Mở menu của Zalo, chọn mở bằng trình duyệt nếu có, rồi dùng Chrome hoặc Safari. Nếu không thấy lựa chọn, tự mở trình duyệt và nhập minhthanhmath.vn/btvn. Không gửi mã hoặc thông tin đăng nhập cho người khác.</p></details>
  </section><div className="btvn-gates" aria-label="Vào bài của lớp">
    <form className="btvn-gate mig-panel" aria-labelledby="btvn-code-title" onInvalid={event=>{setSubmittedWithCode(true);const field=event.target;if(field instanceof HTMLInputElement)setCodeError(previous=>previous||invalidFieldMessage(field));}} onInput={()=>setCodeError('')} onSubmit={event=>{event.preventDefault();if(!busy){setSubmittedWithCode(true);onLogin({studentCode},remember);}}}>
      <h2 id="btvn-code-title">Có mã</h2>
      <label>Mã học sinh<input type="password" autoComplete="off" maxLength={160} required aria-describedby="btvn-code-help" value={studentCode} onChange={event=>onCode(event.target.value)}/></label>
      <p id="btvn-code-help">Nhập mã học sinh do MTM cấp riêng cho em.</p>
      {codeNotice&&<p ref={codeFeedback} role="alert">{codeNotice}</p>}
      {rememberField}
      <button type="submit" className="ep-primary" disabled={busy}>{busy?'Đang kiểm tra…':'Vào bài'}</button>
    </form>
    <form className="btvn-gate mig-panel" aria-labelledby="btvn-identity-title" onInvalid={event=>{setSubmittedWithCode(false);const field=event.target;if(field instanceof HTMLInputElement||field instanceof HTMLSelectElement)setIdentityError(previous=>previous||invalidFieldMessage(field));}} onInput={event=>{setIdentityError('');const confirm=event.currentTarget.elements.namedItem('btvn-new-pin-2');if(confirm instanceof HTMLInputElement)confirm.setCustomValidity('');}} onSubmit={event=>{event.preventDefault();if(!busy&&!classesLoading&&classNames.includes(identity.className)){const input=pinMode?withPin(event,identity,pinMode==='setup'):{...identity};if(input){setSubmittedWithCode(false);onLogin(input,remember);}}}}>
      <h2 id="btvn-identity-title">Không có mã</h2>
      <p>Dùng họ tên học sinh hoặc phụ huynh và số điện thoại đã đăng ký với lớp. Gia đình có nhiều con cùng lớp nên nhập tên học sinh để đối chiếu đúng bài.</p>
      {([['fullName','Họ tên học sinh hoặc phụ huynh'],['phone','Số điện thoại (học sinh hoặc phụ huynh)']] as const).map(([key,label])=><label key={key}>{label}<input type={key==='phone'?'tel':'text'} autoComplete="off" maxLength={160} required value={identity[key]} onChange={event=>onIdentity({...identity,[key]:event.target.value})}/></label>)}
      <label>Lớp đang học<select required disabled={busy||classesLoading||!classNames.length} value={identity.className} onChange={event=>onIdentity({...identity,className:event.target.value})}><option value="">{classesLoading?'Đang tải lớp…':'Chọn lớp đang học'}</option>{[...classNames].sort((a,b)=>a.localeCompare(b,"vi",{numeric:true})).map(name=><option key={name} value={name}>{name}</option>)}</select></label>
      {pinMode==='setup'&&<div className="btvn-pin-setup" role="group" aria-label="Tạo mã PIN">
        <p><b>Tạo mã PIN 6 số</b> để bảo vệ bài và điểm của em. Lần sau vào bằng họ tên cần nhập PIN này. Không dùng ngày sinh, 123456 hay 6 số giống nhau; không cho người khác biết.</p>
        {pinField('btvn-new-pin','Mã PIN mới (6 số)','new-password',true)}
        {pinField('btvn-new-pin-2','Nhập lại mã PIN','new-password',true)}
      </div>}
      {pinMode==='enter'&&pinField('btvn-pin','Mã PIN (6 số)','current-password',false,'Lần đầu: gõ 6 số em muốn đặt làm PIN rồi bấm Vào bài, lần sau nhập lại đúng số này. Quên PIN: nhắn Zalo trợ lý lớp.')}
      {classesError&&<p role="status">Chưa tải được danh sách lớp. <button type="button" disabled={busy||classesLoading} onClick={onReloadClasses}>Thử tải lại</button></p>}
      {!classesLoading&&!classesError&&!classNames.length&&<p role="status">Chưa có lớp để chọn. Em liên hệ MTM.</p>}
      {identityNotice&&<p ref={identityFeedback} role="alert">{identityNotice}</p>}
      {rememberField}
      <button type="submit" className="ep-primary" disabled={busy||classesLoading||!classNames.length}>{busy?'Đang kiểm tra…':'Vào bài'}</button>
    </form>
  </div></>;
}
