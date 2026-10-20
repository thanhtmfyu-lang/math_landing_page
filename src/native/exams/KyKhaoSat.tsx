import {useState,type FormEvent} from 'react';
import R106PageIntro from '../../migration/R106PageIntro';
import {postLead} from '../../components/lead-client';
import {emailRegistration} from '../../components/registration-submit';
import {describeLeadSource,storedLeadSource} from '../../components/lead-source';
import {KS,KS_LOP,chuanZalo,ksRegistration,soBaoDanh,type KsDangKy} from './ky-khao-sat';
import './hsa-mock.css';
import './entrance-test.css';
import './ky-khao-sat.css';

const KEY='mtm:ky-khao-sat:v1';
type DaDangKy={sbd:string;hoTen:string;lop:string};
const doc=():DaDangKy|null=>{try{return JSON.parse(localStorage.getItem(KEY)??'null');}catch{return null;}};
const ghi=(v:DaDangKy)=>{try{localStorage.setItem(KEY,JSON.stringify(v));}catch{/* bỏ qua */}};

/** /ky-khao-sat: đăng ký Kỳ khảo sát MTM cuối kỳ I (05–06/12/2026), miễn phí, mở cho cả học sinh ngoài trung tâm. */
export default function KyKhaoSat(){
 const [f,setF]=useState<KsDangKy>({hoTen:'',lop:'',truong:'',zaloPh:'',dongY:false});
 const [xong,setXong]=useState<DaDangKy|null>(doc);
 const [loi,setLoi]=useState('');const [dangGui,setDangGui]=useState(false);
 const set=<K extends keyof KsDangKy>(k:K,v:KsDangKy[K])=>{setF(x=>({...x,[k]:v}));setLoi('');};
 const gui=async(e:FormEvent)=>{e.preventDefault();if(dangGui)return;setLoi('');
  try{
   if(!f.lop)throw new Error('Em chọn lớp nhé.');
   const sbd=await soBaoDanh(chuanZalo(f.zaloPh),f.hoTen,f.lop);
   const data=ksRegistration(f,sbd,describeLeadSource(storedLeadSource()));
   setDangGui(true);
   if(await postLead('dang-ky',data)!=='saved'){
    if(!import.meta.env.VITE_SERVICE_KEY||!import.meta.env.VITE_TEMPLATE_KEY||!import.meta.env.VITE_PUBLIC_KEY)throw new Error('Chưa gửi được đăng ký. Em nhắn Zalo 0967 365 413 giúp thầy nhé.');
    const emailjs=(await import('@emailjs/browser')).default;
    await emailjs.send(import.meta.env.VITE_SERVICE_KEY,import.meta.env.VITE_TEMPLATE_KEY,{...emailRegistration(data),study_mode:'Kỳ khảo sát (online)',time:new Date().toLocaleString('vi-VN',{timeZone:'Asia/Saigon'})},import.meta.env.VITE_PUBLIC_KEY);
   }
   const v={sbd,hoTen:f.hoTen.trim(),lop:f.lop};ghi(v);setXong(v);
  }catch(err){setLoi(err instanceof Error?err.message:'Chưa gửi được đăng ký. Em thử lại nhé.');}
  finally{setDangGui(false);}
 };
 return <div className="hsa-page ep-root ks-page">
  <R106PageIntro className="hsa-intro" eyebrow="MINH THÀNH MATH · MIỄN PHÍ" title="Kỳ khảo sát Toán MTM cuối kỳ I" description={<><p>Kỳ thi riêng của Minh Thành Math cho học sinh lớp 10, 11, 12, trong và ngoài trung tâm. Đề MTM tự soạn đúng tiến độ học kỳ I (bộ Kết nối tri thức), mức trường chuyên và trọng điểm, cấu trúc như đề tốt nghiệp THPT.</p></>}>
   <ul className="hsa-facts"><li><strong>05–06/12</strong><span>Thứ Bảy, Chủ nhật</span></li><li><strong>{KS.phut}</strong><span>phút, nộp 1 lần</span></li><li><strong>0đ</strong><span>miễn phí</span></li></ul>
  </R106PageIntro>
  <div className="ks-layout">
   <section className="hsa-card ks-info" aria-labelledby="ks-info-title">
    <h2 id="ks-info-title">Thể lệ</h2>
    <dl className="ks-rules">
     <div><dt>Thời gian</dt><dd>Mở từ 08:00 thứ Bảy 05/12 đến 21:00 Chủ nhật 06/12/2026. Em chọn lúc rảnh, làm liền {KS.phut} phút, nộp 1 lần.</dd></div>
     <div><dt>Hình thức</dt><dd>Làm trên minhthanhmath.vn bằng máy tính hoặc điện thoại, vào phòng thi bằng số báo danh.</dd></div>
     <div><dt>Đề</dt><dd>3 đề riêng cho lớp 10, 11, 12: 12 câu trắc nghiệm, 4 câu đúng sai, 6 câu trả lời ngắn, chấm tự động.</dd></div>
     <div><dt>Kết quả</dt><dd>Bảng xếp hạng theo khối công bố lúc {KS.xepHang}. Mỗi em nhận báo cáo 1 trang gửi Zalo phụ huynh: điểm, vị trí trong khối, 3 dạng mất điểm, việc cần làm trong 4 tuần.</dd></div>
     <div><dt>Vinh danh</dt><dd>Thủ khoa mỗi khối nhận bút khắc tên, sổ MTM và giấy chứng nhận; hạng 2–5 mỗi khối nhận sổ MTM và giấy chứng nhận.</dd></div>
    </dl>
   </section>
   {xong?<section className="hsa-card ks-done" aria-live="polite">
    <p className="dv-kicker">Đăng ký thành công</p>
    <h2>{xong.hoTen} · lớp {xong.lop}</h2>
    <p className="ks-sbd"><span>Số báo danh</span><strong>{xong.sbd}</strong></p>
    <p>Em chụp lại số báo danh này. Thầy sẽ nhắn Zalo phụ huynh trước ngày thi kèm đường vào phòng thi. Ngày 05–06/12 em vào minhthanhmath.vn, nhập số báo danh để làm bài.</p>
    <div className="hsa-actions"><button type="button" className="hsa-ghost" onClick={()=>{setXong(null);setF({hoTen:'',lop:'',truong:'',zaloPh:'',dongY:false});}}>Đăng ký thêm một bạn</button></div>
   </section>:<form className="hsa-card ks-form" onSubmit={gui} noValidate aria-labelledby="ks-form-title">
    <h2 id="ks-form-title">Đăng ký dự thi</h2>
    <label className="hsa-field"><span>Họ và tên học sinh *</span><input value={f.hoTen} onChange={e=>set('hoTen',e.target.value)} maxLength={80} autoComplete="name" required/></label>
    <fieldset className="hsa-field hsa-grades"><legend>Lớp *</legend><div>{KS_LOP.map(l=><label key={l} className={'hsa-grade'+(f.lop===l?' is-on':'')}><input type="radio" name="ks-lop" value={l} checked={f.lop===l} onChange={()=>set('lop',l)}/>Lớp {l}</label>)}</div></fieldset>
    <label className="hsa-field"><span>Trường đang học *</span><input value={f.truong} onChange={e=>set('truong',e.target.value)} maxLength={120} placeholder="Ví dụ: THPT Kim Liên" required/></label>
    <label className="hsa-field"><span>Số Zalo của phụ huynh *</span><input value={f.zaloPh} onChange={e=>set('zaloPh',e.target.value)} inputMode="tel" autoComplete="tel" maxLength={20} required aria-describedby="ks-zalo-help"/><small id="ks-zalo-help">Để nhận số báo danh, đường vào phòng thi và báo cáo 1 trang. MTM không gọi điện mời chào.</small></label>
    <label className="hsa-consent"><input type="checkbox" checked={f.dongY} onChange={e=>set('dongY',e.target.checked)} required/><span>Em và phụ huynh đồng ý: bảng xếp hạng hiện số báo danh, tên rút gọn và điểm (không hiện trường, số điện thoại); MTM chỉ dùng số Zalo để gửi thông tin kỳ khảo sát và kết quả.</span></label>
    {loi&&<p className="hsa-error" role="alert">{loi}</p>}
    <div className="hsa-actions"><button type="submit" className="hsa-primary" disabled={dangGui}>{dangGui?'Đang gửi…':'Đăng ký và nhận số báo danh'}</button></div>
   </form>}
  </div>
 </div>;
}
