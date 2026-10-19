import { requestRegistration } from './registration-context';
import { Button } from "./ui/button";
import { Gift, Users } from "lucide-react";
import { ScrollReveal } from "./ScrollReveal";
import React from "react";
import "../migration/site-polish.css";

export function PromotionsSection() {
  return <section id="promotions" className="py-14 bg-blue-50" aria-labelledby="promotions-heading">
    <div className="container mx-auto px-4 max-w-6xl">
      <ScrollReveal><header className="text-center mb-10">
        <Gift className="mx-auto mb-3 text-yellow-600" size={32} aria-hidden="true"/>
        <p className="font-semibold text-blue-900 mb-3">Rủ bạn cùng học, thêm vui mỗi buổi</p>
        <h2 id="promotions-heading" className="text-3xl md:text-4xl font-bold text-blue-900 mb-3">Ưu đãi nhóm cho tất cả các lớp</h2>
        <p className="text-gray-700 max-w-3xl mx-auto">Cấp 2, cấp 3, HSA · học online hay trực tiếp đều có ưu đãi khi đăng ký theo nhóm. Áp dụng trong tháng học đầu tiên, sau khi MTM xác nhận thông tin nhóm.</p>
      </header></ScrollReveal>
      <div className="grid md:grid-cols-3 gap-6">
        {[{group:"Nhóm 2 bạn",discount:"10%"},{group:"Nhóm 3–5 bạn",discount:"15%"},{group:"Nhóm từ 6 bạn",discount:"25%"}].map(({group,discount})=><article key={group} className="mtm-promo-card"><Users className="mx-auto mb-3 text-blue-900" size={28} aria-hidden="true"/><h3 className="text-xl font-bold text-blue-900">{group}</h3><p className="mtm-promo-value">Giảm {discount}</p><p className="text-gray-600">Học phí tháng học đầu tiên.</p></article>)}
      </div>
      <div className="mtm-promo-box">
        <p>Chương trình tiếp tục áp dụng cho nhóm đăng ký từ tháng 10/2026 trở đi. Các tháng tiếp theo trở về mức học phí của khóa đã đăng ký.</p>
        <p>Khi để lại thông tin, bạn ghi thêm số bạn trong nhóm và lớp muốn học để MTM tư vấn đúng mức học phí nhé.</p>
        <Button className="mtm-promo-cta" onClick={()=>{requestRegistration({group:true});document.getElementById("register")?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})}}>Mình muốn đăng ký cùng bạn</Button>
      </div>
    </div>
  </section>;
}
