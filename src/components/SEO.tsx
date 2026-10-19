import { Helmet } from "react-helmet-async";

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  url?: string;
  type?: string;
  robots?: string;
}

export function SEO({
  title = "Minh Thành Math - Toán THCS, THPT và HSA",
  description = "Học Toán THCS, THPT và HSA tại Minh Thành Math, 82 Chùa Láng, Hà Nội. Tư vấn lớp học và truy cập cổng học tập.",
  keywords = "dạy toán cấp 3, trung tâm toán THPT, luyện thi THPT Quốc gia, học toán lớp 10, học toán lớp 11, học toán lớp 12, gia sư toán, Minh Thành Math, toán Hà Nội",
  ogImage = "https://minhthanhmath.vn/mtm-original-logo.png",
  url = "https://minhthanhmath.vn",
  type = "website",
  robots = "noindex, follow"
}: SEOProps) {
  const siteTitle = title.includes("Minh Thành Math") ? title : `${title} | Minh Thành Math`;

  return (
    <Helmet defer={false}>
      {/* Primary Meta Tags */}
      <title>{siteTitle}</title>
      <meta name="title" content={siteTitle} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="author" content="Minh Thành Math" />
      <meta name="robots" content={robots} />
      <meta name="language" content="Vietnamese" />
      <meta name="revisit-after" content="7 days" />
      <link rel="canonical" href={url} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={siteTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content="Minh Thành Math" />
      <meta property="og:locale" content="vi_VN" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={siteTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* Additional SEO */}
      <meta name="geo.region" content="VN-HN" />
      <meta name="geo.placename" content="Ha Noi" />

      {/* Mobile Optimization */}
      <meta name="theme-color" content="#213269" />
    </Helmet>
  );
}
