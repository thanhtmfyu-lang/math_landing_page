import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner@2.0.3";
import { ScrollReveal } from "./ScrollReveal";
import emailjs from "@emailjs/browser";
import './registration-submit.css';
import { ZALO_ASSISTANT_URL } from './mtm-contact';

import { createRegistrationGate, emailRegistration } from './registration-submit';

import { applyRegistrationContext, registrationContextEvent } from './registration-context';
import { describeLeadSource, storedLeadSource } from './lead-source';

export function RegisterSection() {
  const [formData, setFormData] = useState({
    studentName: "",
    phone: "",
    grade: "",
    message: "", notes:"", groupSize:"",
  });

  const [groupInterest,setGroupInterest]=useState(false);
  const [trial,setTrial]=useState(true);
  useEffect(()=>{const receive=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.group)setGroupInterest(true);setFormData(prior=>applyRegistrationContext(prior,detail));};window.addEventListener(registrationContextEvent,receive);return()=>window.removeEventListener(registrationContextEvent,receive)},[]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError,setSubmitError]=useState('');
  const successRef=useRef<HTMLParagraphElement>(null);
  const errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(isSubmitted)successRef.current?.focus();else if(submitError)errorRef.current?.focus();},[isSubmitted,submitError]);

  const [isPending,setIsPending]=useState(false);
  const gate=useRef(createRegistrationGate()); const submitting=useRef(false);
  const handleSubmit=async(e:React.FormEvent)=>{
    e.preventDefault();if(isSubmitted||submitting.current)return;submitting.current=true;setSubmitError('');
    try{
      const sent=await gate.current({...formData,groupInterest,trial,leadSource:describeLeadSource(storedLeadSource())},async(data)=>{
        if(!import.meta.env.VITE_SERVICE_KEY||!import.meta.env.VITE_TEMPLATE_KEY||!import.meta.env.VITE_PUBLIC_KEY)throw new Error('Form chưa sẵn sàng. Vui lòng liên hệ trung tâm qua kênh tư vấn.');
        setIsPending(true);
        await emailjs.send(import.meta.env.VITE_SERVICE_KEY,import.meta.env.VITE_TEMPLATE_KEY,{...emailRegistration(data),time:new Date().toLocaleString('vi-VN',{timeZone:'Asia/Saigon'})},import.meta.env.VITE_PUBLIC_KEY);
      });
      if(sent){toast.success('Đã gửi yêu cầu tư vấn. Trung tâm sẽ liên hệ để xác nhận.');setIsSubmitted(true);setFormData({studentName:'',phone:'',grade:'',message:'',notes:'',groupSize:''});}
    }catch(error){const message=error instanceof Error?error.message:'Chưa xác nhận gửi được. Kiểm tra thông tin trước khi thử lại.';setSubmitError(message);toast.error(message);}
    finally{submitting.current=false;setIsPending(false);}
  };
  return (
    <section
      id="register"
      className="py-14 bg-white relative overflow-hidden"
    >
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-blue-600 mb-8 uppercase">
              Đăng ký học thử, tư vấn
            </h2>

            <p id="data-notice" className="mtm-register-lead">Để lại thông tin, MTM gọi lại để tư vấn lộ trình và hẹn lịch cho em. Kiểm tra đầu vào miễn phí; học thử buổi đầu, không học tiếp thì không tính phí. Không muốn điền? <a href={ZALO_ASSISTANT_URL}>Nhắn Zalo 0967 365 413</a>.</p><form aria-describedby="data-notice" onSubmit={handleSubmit} className="space-y-6"><fieldset disabled={isPending || isSubmitted} className="space-y-6">
              {/* Họ tên */}
              <div className="space-y-2">
                <Label htmlFor="student-name">Họ và tên học sinh *</Label>
                <Input id="student-name" autoComplete="name" maxLength={200} required
                  value={formData.studentName}
                  onChange={(e) =>
                    setFormData({ ...formData, studentName: e.target.value })
                  }
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone">Số điện thoại liên hệ *</Label>
                <Input
                  id="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={25} aria-describedby="phone-hint" required
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                />
                <p id="phone-hint" className="text-sm text-gray-600">Số di động của phụ huynh hoặc học sinh để trung tâm liên hệ. Có thể nhập dạng 09… hoặc +84…</p>
              </div>

              {/* Grade */}
              <div className="space-y-2">
                <Label htmlFor="grade">Lớp học *</Label>
                <Select
                  value={formData.grade}
                  onValueChange={(value) =>
                    setFormData({ ...formData, grade: value })
                  }
                >
                  <SelectTrigger id="grade" aria-required="true">
                    <SelectValue placeholder="Chọn lớp học" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">Lớp 10</SelectItem>
                    <SelectItem value="11">Lớp 11</SelectItem>
                    <SelectItem value="12">Lớp 12</SelectItem>
                    <SelectItem value="hsa">HSA · đánh giá năng lực</SelectItem>
                    <SelectItem value="thcs">THCS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Message */}
              <div className="space-y-2">
                <Label htmlFor="study-mode">Hình thức học *</Label>
                <Select
                  value={formData.message}
                  onValueChange={(value) =>
                    setFormData({ ...formData, message: value })
                  }
                >
                  <SelectTrigger id="study-mode" aria-required="true">
                    <SelectValue placeholder="Chọn hình thức" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="truc-tiep">
                      LỚP HỌC TOÁN TRỰC TIẾP
                    </SelectItem>
                    <SelectItem value="online">
                      LỚP HỌC TOÁN ONLINE
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2"><Label htmlFor="consult-notes">Bạn muốn MTM tư vấn thêm điều gì? (không bắt buộc)</Label><textarea id="consult-notes" maxLength={1500} rows={3} className="w-full rounded-lg border border-gray-300 p-3" value={formData.notes} onChange={e=>setFormData({...formData,notes:e.target.value})} placeholder="Ví dụ: lịch học phù hợp, phần kiến thức muốn củng cố…" /></div>
              <label className="flex items-center gap-3"><input type="checkbox" checked={trial} onChange={e=>setTrial(e.target.checked)}/>Mình muốn học thử, kiểm tra đầu vào</label>
              <label className="flex items-center gap-3"><input type="checkbox" checked={groupInterest} onChange={e=>{setGroupInterest(e.target.checked);if(!e.target.checked)setFormData({...formData,groupSize:''})}}/>Mình muốn tìm hiểu đăng ký cùng bạn</label>
              {groupInterest&&<div className="space-y-2"><Label htmlFor="group-size">Số bạn trong nhóm (không bắt buộc)</Label><Input id="group-size" type="number" min={2} max={99} step={1} value={formData.groupSize} onChange={e=>setFormData({...formData,groupSize:e.target.value})}/><p className="text-sm text-gray-600">Tính cả bạn; có thể để trống nếu nhóm chưa chốt.</p></div>}
              <Button
                type="submit"
                disabled={isSubmitted || isPending}
                className="mtm-registration-submit"
                aria-busy={isPending}
                style={{minHeight:48,padding:"12px 24px",backgroundColor:"#213269",color:"#ffcf24",fontWeight:700,border:"2px solid #213269",borderRadius:12,whiteSpace:"normal"}}
              >
                {isPending ? "Đang gửi yêu cầu…" : isSubmitted ? "Đã gửi yêu cầu" : "Gửi yêu cầu tư vấn"}
              </Button>

              {isSubmitted && (
                <p ref={successRef} tabIndex={-1} role="status" aria-live="polite" className="text-sm mtm-registration-feedback" style={{color:"#166534"}}>
                  Yêu cầu tư vấn đã được gửi; lịch học và đăng ký cần trung tâm xác nhận.
                </p>
              )}
            </fieldset></form><details className="mtm-data-notice mtm-data-after"><summary>Thông tin đăng ký được dùng thế nào?</summary><p>Bạn cũng có thể tự gửi email tới <a href="mailto:quanlytoanminhthanhmath@gmail.com">quanlytoanminhthanhmath@gmail.com</a>.</p><p>Tên học sinh, số điện thoại, lớp, hình thức học và thông tin tư vấn tùy chọn bạn nhập được gửi qua dịch vụ EmailJS để trung tâm tiếp nhận yêu cầu tư vấn. Chỉ cung cấp thông tin cần thiết; không gửi mật khẩu hoặc hồ sơ nhạy cảm. Việc gửi yêu cầu không tự đăng ký lớp, tạo tài khoản hay đồng ý nhận quảng cáo.</p><p>Cần hỏi về việc sử dụng hoặc chỉnh sửa thông tin đã gửi? <a href={ZALO_ASSISTANT_URL}>Nhắn Zalo 0967 365 413</a>. Nếu không muốn dùng biểu mẫu, bạn có thể nhắn Zalo trực tiếp.</p></details>
            {submitError&&<div ref={errorRef} tabIndex={-1} role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 mtm-registration-feedback"><p>{submitError}</p><p>Thông tin vẫn được giữ trong biểu mẫu. Bạn có thể <a href={ZALO_ASSISTANT_URL} className="underline font-semibold">nhắn Zalo 0967 365 413</a> để được tư vấn. Nếu chưa rõ yêu cầu đã tới trung tâm hay chưa, hãy nhắn Zalo kiểm tra trước khi gửi lại.</p></div>}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
