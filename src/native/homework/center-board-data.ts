// Bảng tin trung tâm (19/10/2026): hiện đầu Góc học tập sau khi học sinh, phụ huynh đăng nhập.
// Hai nguồn: bài cố định trong mã (ngày lễ, ảnh trung tâm đã công khai) và bài máy chủ trả về
// từ ảnh nhóm Zalo đã qua bước duyệt (/api/bang-tin). Lịch "Sắp tới" lấy từ lịch phòng Nội bộ & Sự kiện.
export type BoardKind='ngay-le'|'su-kien'|'tai-lop'|'thong-bao';
export type BoardPhoto={url:string;alt:string;width?:number;height?:number;thumb?:string;poster?:string;video?:boolean};
export type BoardPost={id:string;kind:BoardKind;title:string;date:string;summary:string;photos:BoardPhoto[];place?:string;visibleFrom?:string;pinned?:boolean};
export type BoardEvent={date:string;title:string;note:string};

export const kindLabels:Record<BoardKind,string>={'ngay-le':'Ngày lễ','su-kien':'Sự kiện','tai-lop':'Ảnh tại lớp','thong-bao':'Thông báo'};

const moments=[
 ['Ảnh nhóm MTM cùng sách và bàn học',1400,933],
 ['Hai người mặc áo MTM chụp ảnh cùng nhau',933,1400],
 ['Ảnh nhóm năm người mặc áo MTM cùng cười',1400,933],
 ['Hai người bên sách và máy tính trong bộ ảnh MTM',1400,933],
 ['Ảnh nhóm quay lưng với biểu trưng MTM trên áo',1400,933],
 ['Ảnh nhóm đội ngũ MTM',1400,933],
] as const;

export const staticPosts:BoardPost[]=[
 {id:'2026-10-20-phu-nu-viet-nam',kind:'ngay-le',title:'Chúc mừng ngày Phụ nữ Việt Nam 20/10',date:'2026-10-20',visibleFrom:'2026-10-19T20:00:00+07:00',place:'Cả trung tâm',
  summary:'MTM gửi lời chúc tới các bạn nữ, các mẹ, cô giáo và các chị trợ giảng: luôn vui, khỏe và tự tin như lúc giải xong một bài Toán khó. Ảnh các lớp chúc mừng có ở bài "Mừng 20/10 sớm ở MTM".',
  photos:[{url:'/bang-tin/2026-10-20-phu-nu-viet-nam.webp',alt:'Thiệp MTM chúc mừng ngày Phụ nữ Việt Nam 20/10',width:1200,height:900}]},
 {id:'khoanh-khac-mtm',kind:'tai-lop',title:'Khoảnh khắc ở MTM',date:'2026-10-19',place:'18 ngách 23 ngõ 82 Chùa Láng',
  summary:'Những buổi học, những nụ cười và chung một màu áo MTM. Bấm vào ảnh để xem từng khoảnh khắc.',
  photos:moments.map(([alt,width,height],i)=>({url:`/gallery/mtm-moment-${i+1}.webp`,alt,width,height}))},
];

// Rút từ /mnt/project-files/cong-ty-ai/LICH_SU_KIEN_NAM_HOC_2026_2027.md (phần dành cho học sinh, phụ huynh).
export const boardEvents:BoardEvent[]=[
 {date:'2026-10-20',title:'Ngày Phụ nữ Việt Nam',note:'Lời chúc các bạn nữ, các mẹ'},
 {date:'2026-10-31',title:'Halloween ở lớp',note:'Mini game Toán, trang trí nhẹ'},
 {date:'2026-11-15',title:'Thi thử HSA miễn phí',note:'Giấy khen điện tử top 10'},
 {date:'2026-11-20',title:'Ngày Nhà giáo Việt Nam',note:'Tri ân thầy cô, giao lưu ở lớp'},
 {date:'2026-12-24',title:'Giáng sinh',note:'Mini game, quà nhỏ cho bạn chăm'},
 {date:'2027-01-01',title:'Tết Dương lịch',note:'Nhìn lại một năm học cùng MTM'},
 {date:'2027-02-06',title:'Tết Nguyên đán',note:'Lịch nghỉ, học bù báo trước'},
 {date:'2027-03-08',title:'Quốc tế Phụ nữ',note:'Lời chúc các bạn nữ'},
 {date:'2027-06-01',title:'Quốc tế Thiếu nhi',note:'Quà nhỏ cho lớp 6–9'},
 {date:'2027-06-11',title:'Thi tốt nghiệp THPT',note:'Cả trung tâm tiếp sức 2K9'},
];

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const vnDay=(now:number)=>new Date(now+7*3600_000).toISOString().slice(0,10);
const dayNumber=(date:string)=>Date.parse(date+'T00:00:00Z')/86400_000;

/** Bài đang hiện: đã tới giờ hiện, có ít nhất một ảnh; bài ghim đứng đầu rồi mới nhất trước. */
export function visiblePosts(posts:BoardPost[],now:number){
 if(!Number.isFinite(now))return [];
 const seen=new Set<string>();
 const today=dayNumber(vnDay(now)),top=(p:BoardPost)=>p.pinned&&today-dayNumber(p.date)<=3?1:0;
 return posts.filter(p=>{if(seen.has(p.id)||!p.photos.length||!DATE.test(p.date))return false;seen.add(p.id);return !p.visibleFrom||Date.parse(p.visibleFrom)<=now;})
  .sort((a,b)=>top(b)-top(a)||b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
}
/** Sự kiện từ hôm nay (giờ Việt Nam) trở đi, kèm số ngày còn lại. */
export function upcomingEvents(events:BoardEvent[],now:number,limit=3){
 if(!Number.isFinite(now))return [];
 const today=dayNumber(vnDay(now));
 return events.map(e=>({...e,daysLeft:dayNumber(e.date)-today})).filter(e=>e.daysLeft>=0).sort((a,b)=>a.daysLeft-b.daysLeft).slice(0,limit);
}
export const dayLabel=(date:string)=>date.slice(8,10)+'/'+date.slice(5,7);
export const countdownLabel=(days:number)=>days===0?'Hôm nay':days===1?'Ngày mai':'Còn '+days+' ngày';

/** Chỉ nhận bài máy chủ đúng khuôn; ảnh phải là đường dẫn ký sẵn https hoặc ảnh tĩnh của web. */
export function parseServerPost(value:unknown):BoardPost|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const x=value as Record<string,unknown>;
 if(typeof x.id!=='string'||!/^[a-z0-9-]{1,80}$/.test(x.id)||!(typeof x.kind==='string'&&x.kind in kindLabels)||typeof x.title!=='string'||!x.title.trim()||x.title.length>120
  ||typeof x.date!=='string'||!DATE.test(x.date)||typeof x.summary!=='string'||x.summary.length>1500||!Array.isArray(x.photos)||x.photos.length>60)return null;
 const photos:BoardPhoto[]=[];
 const ok=(u:unknown):u is string=>typeof u==='string'&&(u.startsWith('https://')||/^\/bang-tin\/[a-z0-9-]+\.(webp|jpg|png)$/.test(u)||/^\/api\/bang-tin-anh\?f=[a-z0-9-]+&e=\d{10}&s=[A-Za-z0-9_-]{20,60}$/.test(u));
 for(const p of x.photos){
  if(!p||typeof p!=='object')return null;const y=p as Record<string,unknown>;
  if(!ok(y.url)||typeof y.alt!=='string'||y.alt.length>200||(y.thumb!==undefined&&!ok(y.thumb))||(y.poster!==undefined&&!ok(y.poster)))return null;
  photos.push({url:y.url,alt:y.alt||'Ảnh tại MTM',width:Number.isInteger(y.width)?y.width as number:undefined,height:Number.isInteger(y.height)?y.height as number:undefined,
   thumb:y.thumb as string|undefined,poster:y.poster as string|undefined,video:y.video===true});
 }
 return {id:x.id,kind:x.kind as BoardKind,title:x.title.trim(),date:x.date,summary:x.summary,photos,place:typeof x.place==='string'&&x.place.length<=120?x.place:undefined,pinned:x.pinned===true};
}
