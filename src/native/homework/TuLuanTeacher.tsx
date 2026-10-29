import {useEffect,useRef,useState} from 'react';
import {adminRequest,requireAdmin} from '../admin/backend';
import {maDeLabel,thiThangPart} from './thi-thang-codes';
import './tu-luan.css';
export type TeacherEssay={id:string;studentId:string;fullName:string;className:string;lessonCode:string;attemptId:string;pageNumber:number;receivedAt:string;path:string;url?:string};
export async function loadTeacherEssays(expectedOwner:string,lesson:string):Promise<TeacherEssay[]>{
 const {user,client}=await adminRequest(expectedOwner);
 const {data,error}=await client.rpc('mtm_tu_luan_teacher_real100',{p_lesson:lesson||null});
 if(error||!Array.isArray(data?.items))throw Error('Chưa tải được ảnh tự luận. Kiểm quyền GV/QL và migration nhận ảnh.');
 const rows=data.items as TeacherEssay[],paths=rows.map(row=>row.path);
 const urls=new Map<string,string>();
 for(let start=0;start<paths.length;start+=100){
  const signed=await client.storage.from('mtm-tu-luan').createSignedUrls(paths.slice(start,start+100),300);
  if(signed.error||!signed.data||signed.data.some(row=>row.error||!row.signedUrl))throw Error('Chưa mở được ảnh riêng tư. Bấm Tải lại ảnh để thử lại.');
  for(const row of signed.data)if(row.path&&row.signedUrl)urls.set(row.path,row.signedUrl);
 }
 if((await requireAdmin()).id!==user.id)throw Error('Tài khoản đã thay đổi. Mở lại trang chấm.');
 return rows.map(row=>({...row,url:urls.get(row.path)??undefined}));
}
export default function TuLuanTeacher({owner,load=loadTeacherEssays}:{owner:string;load?:(owner:string,lesson:string)=>Promise<TeacherEssay[]>}){
 const [lesson,setLesson]=useState(''),[rows,setRows]=useState<TeacherEssay[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const generation=useRef(0);
 useEffect(()=>{generation.current++;setRows([]);setMessage('');return()=>{generation.current++;};},[owner]);
 const refresh=async()=>{
  if(!/^[a-z0-9-]{1,160}$/.test(lesson.trim())){setMessage('Nhập mã bài cần chấm để tải đúng ca thi.');return;}
  const run=++generation.current;setBusy(true);setMessage('');setRows([]);
  try{const result=await load(owner,lesson.trim());if(run===generation.current){setRows(result);setMessage(result.length?'Ảnh chỉ hiện cho GV/QL có quyền. Link ảnh hết hạn sau 5 phút; tải lại khi cần.':'Chưa có ảnh được xác nhận cho mã bài này.');}}
  catch(error){if(run===generation.current)setMessage(error instanceof Error?error.message:'Chưa tải được ảnh.');}
  finally{if(run===generation.current)setBusy(false);}
 };
 const groups=new Map<string,TeacherEssay[]>();for(const row of rows){const key=row.studentId+':'+row.lessonCode;groups.set(key,[...(groups.get(key)??[]),row]);}
 return <section className="hw-panel tu-luan-gallery" aria-label="Chấm ảnh tự luận"><h2>Chấm ảnh tự luận</h2>
  <p>Đối chiếu học sinh, lớp và mã đề trước khi chấm. Ảnh nộp lại được giữ cùng lịch sử trang; ảnh trùng không tạo thêm trang. Mục này chỉ xem bài, không tự công bố điểm.</p>
  <label>Mã bài cần chấm<input value={lesson} maxLength={160} onChange={event=>setLesson(event.target.value)}/></label><button type="button" disabled={busy} onClick={()=>void refresh()}>{busy?'Đang tải ảnh…':'Tải lại ảnh tự luận'}</button>
  <p role="status">{message}</p>
  {[...groups.entries()].map(([key,images])=>{const first=images[0],part=thiThangPart(first.lessonCode);return <article key={key}><h3>{first.fullName} · {first.className} · {part?maDeLabel(part.ma):first.lessonCode}</h3><p className="tu-luan-code">{first.lessonCode}</p>{images.sort((a,b)=>a.pageNumber-b.pageNumber).map(image=><figure key={image.id}><figcaption>Trang {image.pageNumber} · Nhận {new Date(image.receivedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</figcaption>{image.url&&<a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={`Bài tự luận ${first.fullName}, ${first.lessonCode}, trang ${image.pageNumber}`} loading="lazy" onError={()=>setMessage('Một link ảnh đã hết hạn hoặc tải lỗi. Bấm Tải lại ảnh tự luận. Ảnh gốc vẫn được giữ.')}/><span>Mở ảnh trang {image.pageNumber}</span></a>}</figure>)}</article>;})}
 </section>;
}
