import probabilityTests from '../../src/native/chapters/probability-tests.json';
import {scorePracticeAssessment} from '../../src/native/exams/flexible-profile';

/** 29/10/2026 (anh Thành): 2K9 XPS bắt buộc làm 22 đề ôn 3 chương xác suất, hạn hết CN 08/11, tính như điểm danh.
 * Đề luyện chấm trên trình duyệt; HS đã đăng nhập thì gửi bài đã nộp về đây, máy chủ chấm lại theo khóa trong kho
 * rồi ghi lượt theo phiên BTVN. Không nhận mã HS, tên hay điểm từ trình duyệt. */
type Db={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:any;error:null|{code?:string}}>};
type Exam={id:string;versionHash:string;questions:{id:string}[]};
const exams=new Map((probabilityTests as unknown as {exam:Exam}[]).map(p=>[p.exam.id,p.exam]));
export const ON_CHUONG_EXAM_IDS:readonly string[]=[...exams.keys()];
const sessionFrom=(cookie:string)=>cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('mtm_btvn_demo='))?.slice(14)??'';
const invalid={status:400,body:{message:'Bài nộp không hợp lệ. Em tải lại trang rồi thử lại.'}};
const login={status:200,body:{status:'login'}};

export function createOnChuongHandler(db:Db){return async(body:Record<string,unknown>,cookie:string)=>{
 const action=body.action,session=sessionFrom(cookie);
 if(action==='on-chuong-cua-em'){
  if(Object.keys(body).some(k=>k!=='action'))return invalid;
  if(!/^[0-9a-f]{64}$/.test(session))return login;
  const {data,error}=await db.rpc('mtm_on_chuong_cua_em',{p_session:session});
  return error||!data?{status:503,body:{message:'Chưa đọc được bài đã ghi nhận.'}}:{status:200,body:data};
 }
 if(action!=='on-chuong-ghi')return invalid;
 if(Object.keys(body).some(k=>!['action','examId','examVersionHash','attemptId','answers'].includes(k)))return invalid;
 const exam=typeof body.examId==='string'?exams.get(body.examId):undefined;
 if(!exam||typeof body.attemptId!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(body.attemptId)||body.answers===null||typeof body.answers!=='object'||Array.isArray(body.answers))return invalid;
 if(body.examVersionHash!==exam.versionHash)return {status:409,body:{message:'Đề đã được cập nhật. Em làm lại bản mới để được ghi nhận.'}};
 if(JSON.stringify(body.answers).length>20000||Object.keys(body.answers).some(k=>!exam.questions.some(q=>q.id===k)))return invalid;
 if(!/^[0-9a-f]{64}$/.test(session))return login;
 const score=scorePracticeAssessment(exam,body.answers);
 if(!score.ok)return invalid;
 const {data,error}=await db.rpc('mtm_on_chuong_ghi',{p_session:session,p_exam:exam.id,p_attempt:body.attemptId,p_score:score.earnedMillipoints});
 if(error)return error.code==='22023'?invalid:{status:503,body:{message:'Chưa ghi nhận được bài. Máy sẽ thử lại khi em mở lại trang.'}};
 return data?{status:200,body:data}:{status:503,body:{message:'Chưa ghi nhận được bài.'}};
};}
