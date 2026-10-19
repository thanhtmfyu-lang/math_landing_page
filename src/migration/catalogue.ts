import snapshot from './catalog.json';
export type Lesson={title:string;subtitle:string;slug:string;duration:string;isFree:boolean};
export type Chapter={id:string;title:string;lessons:Lesson[]};
export type Course={id:string;slug:string;title:string;grade:number;sourcePrice:number;overview:string;sections:Chapter[];sourceUrl:string;sourceImage:string;image:string};
export const courses:Course[]=snapshot.courses;
export const SOURCE_ORIGIN='https://elearning-fe-eight.vercel.app';
export const PORTAL_ORIGIN='https://mtm-vao-ca.thanh-tm-fyu.chatgpt.site';
export const normal=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').replace(/[đĐ]/g,'d').toLowerCase().trim();
export const step=(c:Course)=>Number(c.title.match(/Step\s*(\d+)/i)?.[1]||5);
// Tạm bỏ TSA (ĐGTD) khỏi tên hiển thị cho tới khi MTM tuyển sinh TSA.
export const displayCourseTitle=(c:Course)=>step(c)>4?'Đọc vị đề ĐGNL HSA':c.title;
export const lessonCount=(c:Course)=>c.sections.reduce((sum,s)=>sum+s.lessons.length,0);
export const findCourse=(slug:string)=>courses.find(c=>c.slug===slug);
export function filterCourses(grade:number|string,query:string,order='roadmap'){
 const q=normal(query);return courses.filter(c=>(grade==='all'||(grade==='hsa'?step(c)>4:c.grade===Number(grade)&&step(c)<=4))&&(!q||normal(c.title+' '+c.sections.map(s=>s.title).join(' ')).includes(q))).sort((a,b)=>order==='name'?a.title.localeCompare(b.title,'vi'):a.grade-b.grade||step(a)-step(b));
}
export function courseSummary(c:Course){const n=step(c);if(n===1)return 'Củng cố các chủ đề nền tảng, hiểu điều kiện và trình bày lời giải rõ ràng.';if(n===2)return 'Luyện vận dụng kiến thức qua các dạng bài và phương pháp phân tích.';if(n===3)return 'Phát triển lập luận và kiểm tra lời giải qua những bài toán nhiều bước.';if(n===4)return 'Hệ thống kiến thức và luyện đề theo lộ trình được trung tâm xác nhận.';return 'Phần Toán và xử lý số liệu của bài thi HSA: chuyên đề trọng tâm, đề 75 phút và chữa lỗi theo ca thi.';}
export function lessonUrl(c:Course,l:Lesson){return SOURCE_ORIGIN+'/bai-hoc/'+encodeURIComponent(l.slug)+'?courseSlug='+encodeURIComponent(c.slug);}
export function consultationUrl(c:Course){return '/?lop='+(step(c)>4?'hsa':c.grade)+'&quan-tam='+encodeURIComponent(displayCourseTitle(c))+'#register';}
export const catalogueCaptured=snapshot.captured_at;
