import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {normalizeName,normalizePhone} from './roster';
import {createDraft,submitDraft,validateDraft,type Answers} from '../../src/native/exams/store';
import {resultFor} from '../../src/native/exams/result';
import {validatePracticeExam,type PracticeExam} from '../../src/native/exams/data';
import type {HomeworkState,HomeworkReceipt,LessonMaterial} from '../../src/native/homework/btvn-contract';
import type {HomeworkRepository,StudentWork} from './repository';
import {receiptScores} from './repository';
import {MTM_SCORING_VERSION} from '../../src/native/exams/mtm-scoring';
import {mtmPracticeGradingReadiness} from '../../src/native/exams/mtm-assessment';
import {lessonOpensAt} from './opening-policy';
import {concealMonthlySolutions} from './monthly-policy';
import {homeworkLessonCard} from './lesson-card';
import {requiresManualHomeworkGrade} from '../../src/native/homework/grading-policy';

export class HomeworkError extends Error {constructor(public status:number,message:string){super(message);}}
export const GATE_ERROR='Không thể vào bài. Hãy kiểm tra thông tin hoặc thử lại sau.';
const freezeExam=<T,>(value:T):T=>{if(value&&typeof value==='object'){Object.values(value).forEach(freezeExam);Object.freeze(value);}return value;};
const lockedExam=(exam:PracticeExam)=>exam.rubricVersion===MTM_SCORING_VERSION?freezeExam(structuredClone(exam)):exam;
const norm=(value:string)=>value.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi-VN');
const digest=(value:string)=>createHash('sha256').update(value).digest();
/** Trước giờ đóng chỉ xác nhận đã nộp. Không gửi chi tiết điểm hay dữ liệu
 * dẫn xuất có thể suy ra điểm; kho vẫn giữ nguyên biên nhận đầy đủ. */
const receiptWithoutScore=({attemptId,attemptNumber,submittedAt,elapsedSeconds,late,timedOut}:HomeworkReceipt):HomeworkReceipt=>
  ({attemptId,attemptNumber,submittedAt,elapsedSeconds,late,timedOut,score:null});
type Session={code:string; expires:number;lessonCode?:string};
type Limit={count:number; until:number};
export class HomeworkService {
  private sessions=new Map<string,Session>();
  private limits=new Map<string,Limit>();
  private maxAttemptsFor(token:string){return this.monthly(token)?1:5;}
  private monthly(token:string){const m=this.materials.find(l=>l.lessonCode===this.selected(token));return m?.kind==='kiem-tra-thang'?m:undefined;}
  constructor(readonly repo:HomeworkRepository,readonly exam:PracticeExam,readonly dueAt:number,
    readonly classKey='lop-test-12',readonly lessonCode='buoi-mau-01',private clock=Date.now,readonly materials:LessonMaterial[]=[],readonly lessonExams:Record<string,PracticeExam>={}){
    const valid=validatePracticeExam(exam);if(!valid.valid)throw new Error(valid.errors.join('; '));
    if(exam.durationMinutes!==120)throw new Error('BTVN cần 120 phút/lượt');
    for(const item of Object.values(lessonExams))if(!validatePracticeExam(item).valid||item.durationMinutes!==120)throw new Error('Gói đề buổi học chưa hợp lệ');
    // Giữ riêng bản đề/khóa đã nhận. Sửa dữ liệu biên tập ngoài service không
    // được thay nội dung của lượt đang mở hoặc tính lại biên nhận đã lưu.
    this.exam=lockedExam(exam);
    this.lessonExams=Object.fromEntries(Object.entries(lessonExams).map(([code,item])=>[code,lockedExam(item)]));
  }
  login(gate:unknown,ip:string):string {
    const now=this.clock();
    for(const [key,value] of this.limits)if(value.until<=now)this.limits.delete(key);
    for(const [key,value] of this.sessions)if(value.expires<=now)this.sessions.delete(key);
    const candidate=gate as Record<string,string>;
    const fields=candidate&&typeof candidate==='object'&&!Array.isArray(candidate)?Object.keys(candidate).filter(k=>k!=='pin'&&k!=='newPin'):[];
    const byCode=fields.length===1&&fields[0]==='studentCode';
    const byIdentity=fields.length===3&&['fullName','phone','className'].every(k=>fields.includes(k));
    const valid=(byCode||byIdentity)&&fields.every(k=>typeof candidate[k]==='string'&&candidate[k].trim().length>0&&candidate[k].length<=160);
    const buckets=[digest('ip:'+ip).toString('hex')];
    if(valid)buckets.push(digest(byCode?'code:'+candidate.studentCode.trim().toLowerCase():'name-class:'+normalizeName(candidate.fullName)+':'+norm(candidate.className)).toString('hex'));
    if(buckets.some(key=>(this.limits.get(key)?.count??0)>=5)||this.limits.size>=10000||this.sessions.size>=10000)throw new HomeworkError(429,GATE_ERROR);
    const phone=valid&&byIdentity?normalizePhone(candidate.phone):'';
    const matches=valid?this.repo.all().filter(({student:s})=>byCode?
      timingSafeEqual(digest(s.studentCode.toLowerCase()),digest(candidate.studentCode.trim().toLowerCase())):
      !!phone&&normalizeName(s.fullName)===normalizeName(candidate.fullName)&&norm(s.className)===norm(candidate.className)&&[s.phone,s.parentPhone??''].some(p=>normalizePhone(p)===phone)):[];
    const student=matches.length===1?matches[0].student:undefined;
    if(!student){for(const bucket of buckets){const limit=this.limits.get(bucket);this.limits.set(bucket,{count:(limit?.count??0)+1,until:limit?.until??now+15*60000});}throw new HomeworkError(401,GATE_ERROR);}
    // Giữ counter đến hết cửa sổ kể cả đã đăng nhập đúng; tránh dùng tài khoản đúng để reset chống dò.
    const allowed=this.materials.filter(l=>l.classNames.includes(student.className)&&(l.lessonCode===this.lessonCode||this.lessonExams[l.lessonCode])).sort((a,b)=>b.date.localeCompare(a.date));
    if(this.materials.length&&!allowed.length)throw new HomeworkError(401,GATE_ERROR);
    const token=randomBytes(32).toString('hex');this.sessions.set(digest(token).toString('hex'),{code:student.studentCode,expires:now+4*3600000,lessonCode:allowed[0]?.lessonCode});return token;
  }
  logout(token:string){this.sessions.delete(digest(token).toString('hex'));}
  public studentIdentity(token:string){return this.work(token).student.studentCode;}
  private work(token:string):StudentWork {
    const session=this.sessions.get(digest(token).toString('hex'));
    if(!session||session.expires<=this.clock())throw new HomeworkError(401,GATE_ERROR);
    const work=this.repo.get(session.code);if(!work)throw new HomeworkError(401,GATE_ERROR);return work;
  }
  private selected(token:string){return this.sessions.get(digest(token).toString('hex'))?.lessonCode??this.lessonCode;}
  private opening(token:string){const work=this.work(token),material=this.materials.find(l=>l.lessonCode===this.selected(token));return material?lessonOpensAt(material,work.student.className):0;}
  private assertOpen(token:string){if(this.clock()<this.opening(token))throw new HomeworkError(409,'Bài chưa mở. BTVN chỉ mở làm sau buổi học.');}
  private examFor(token:string){return this.selected(token)===this.lessonCode?this.exam:this.lessonExams[this.selected(token)];}
  private gradingReadiness(token:string){
    const exam=this.examFor(token);
    return exam.rubricVersion===MTM_SCORING_VERSION?mtmPracticeGradingReadiness(exam):{valid:true,errors:[]};
  }
  private assertReadyToStart(token:string){
    const ready=this.gradingReadiness(token);
    if(!ready.valid)throw new HomeworkError(409,'Gói đề MTM chưa sẵn sàng chấm: '+ready.errors.join('; '));
  }
  private lessonWork(token:string){const work=this.work(token),code=this.selected(token);if(code===this.lessonCode)return work;
    const entry=work.lessons?.[code]??{drafts:[],receipts:[]};return {...work,drafts:entry.drafts,receipts:entry.receipts,student:{...work.student,nextActualClassAt:entry.nextActualClassAt}};
  }
  private putLesson(token:string,entry:StudentWork){if(this.selected(token)===this.lessonCode){this.repo.put(entry);return;}
    const work=this.work(token);work.lessons={...work.lessons,[this.selected(token)]:{drafts:entry.drafts,receipts:entry.receipts,nextActualClassAt:entry.student.nextActualClassAt}};this.repo.put(work);
  }
  select(token:string,code:string){const work=this.work(token);const material=this.materials.find(l=>l.lessonCode===code&&l.classNames.includes(work.student.className));
    if(!material||!(code===this.lessonCode||this.lessonExams[code]))throw new HomeworkError(404,'BTVN buổi này đang chờ chuẩn bị.');
    this.sessions.get(digest(token).toString('hex'))!.lessonCode=code;return this.state(token);
  }
  state(token:string):HomeworkState {
    const now=this.clock(),root=this.work(token),work=this.lessonWork(token),scores=receiptScores(work.receipts);
    const lessons=this.materials.filter(l=>l.classNames.includes(root.student.className)).sort((a,b)=>b.date.localeCompare(a.date)).map(l=>{
      const entry=l.lessonCode===this.lessonCode?{...root,nextActualClassAt:root.student.nextActualClassAt}:root.lessons?.[l.lessonCode];
      const receipts=entry?.receipts??[],scores=receiptScores(receipts),best=scores.length?Math.max(...scores):null;
      const receipt=receipts.filter(r=>r.score===best).at(-1);
      const lessonExam=l.lessonCode===this.lessonCode?this.exam:this.lessonExams[l.lessonCode];
      return homeworkLessonCard(l,root.student.className,now,{pendingGrading:receipts.length>0&&!!lessonExam&&requiresManualHomeworkGrade(lessonExam,l),dueAt:entry?.nextActualClassAt??null,bestScore:best,late:receipt?.late??null,submittedAt:receipt?.submittedAt??null,available:l.lessonCode===this.lessonCode||!!this.lessonExams[l.lessonCode]});
    });
    const opensAt=this.opening(token),monthly=this.monthly(token),draft=work.drafts.at(-1)??null;
    const hidden=!!monthly&&now<(monthly.closesAt??Infinity);
    if(now<opensAt)return {serverNow:now,exam:null,opensAt,canStart:false,solutionsAvailable:false,fullName:work.student.fullName,className:work.student.className,lessonCode:this.selected(token),dueAt:work.student.nextActualClassAt??null,maxAttempts:this.maxAttemptsFor(token),attemptsUsed:0,draft:null,receipts:[],bestScore:null,demo:true,lessons};
    const graded=!!draft&&draft.submittedAt!==null&&work.receipts.some(r=>r.attemptId===draft.attemptId);
    const solutionsAvailable=graded&&(!monthly||now>=(monthly.closesAt??Infinity));
    return {serverNow:now,exam:solutionsAvailable?this.examFor(token):concealMonthlySolutions(this.examFor(token)),opensAt,canStart:!monthly||now<(monthly.closesAt??Infinity),solutionsAvailable,...(monthly?{kind:'kiem-tra-thang' as const,closesAt:monthly.closesAt}:{}),fullName:work.student.fullName,className:work.student.className,lessonCode:this.selected(token),dueAt:work.student.nextActualClassAt??null,maxAttempts:this.maxAttemptsFor(token),
      attemptsUsed:work.drafts.length,draft,receipts:hidden?work.receipts.map(receiptWithoutScore):work.receipts.map(receipt=>requiresManualHomeworkGrade(this.examFor(token),this.materials.find(l=>l.lessonCode===this.selected(token)))?{...receipt,gradingPending:true}:receipt),bestScore:hidden?null:scores.length?Math.max(...scores):null,demo:true,lessons};
  }
  /** Chỉ phía vận hành gọi sau khi xác minh ca thực học, không mở API học sinh. */
  reconcileActualClass(studentCode:string,startsAt:number,lessonCode=this.lessonCode){
    if(!Number.isFinite(startsAt)||startsAt<=0)throw new Error('Giờ ca không hợp lệ');
    const work=this.repo.get(studentCode);if(!work)throw new Error('Không có mã nội bộ');
    if(lessonCode!==this.lessonCode){const entry=work.lessons?.[lessonCode];if(!entry)throw new Error('Chưa có lượt của buổi');entry.nextActualClassAt=startsAt;entry.receipts=entry.receipts.map(r=>({...r,late:r.submittedAt>=startsAt}));this.repo.put(work);return;}
    work.student.nextActualClassAt=startsAt;work.receipts=work.receipts.map(r=>({...r,late:r.submittedAt>=startsAt}));this.repo.put(work);
  }
  start(token:string){
    this.assertOpen(token);
    let work=this.lessonWork(token);const previous=work.drafts.at(-1),now=this.clock();
    if(previous?.submittedAt===null){
      if(now<Math.min(previous.deadline,this.monthly(token)?.closesAt??Infinity))return this.state(token);
      const submitted=this.submit(token,previous.attemptId,previous.answers);
      // Phải trả bản nộp để adapter commit lượt cũ, kể cả khi chưa được mở lượt kế tiếp.
      if(this.monthly(token)||work.drafts.length>=this.maxAttemptsFor(token)||!this.gradingReadiness(token).valid)return submitted;
      work=this.lessonWork(token);
    }
    const monthly=this.monthly(token);if(monthly&&(now<monthly.opensAt!||now>=monthly.closesAt!))throw new HomeworkError(409,'Bài kiểm tra chưa mở hoặc đã đóng.');
    if(work.drafts.length>=this.maxAttemptsFor(token))throw new HomeworkError(409,'Đã dùng hết lượt làm bài.');
    // Chỉ chặn lượt mới. Lượt đã mở vẫn phải tải lại, lưu và nộp được bằng khóa hiện có.
    this.assertReadyToStart(token);
    const made=createDraft(this.examFor(token),randomBytes(16).toString('hex'),now);if(!made.ok)throw new Error(made.message);
    work.drafts.push(made.value);this.putLesson(token,work);return this.state(token);
  }
  save(token:string,id:string,answers:Answers){
    this.assertOpen(token);
    const work=this.lessonWork(token),draft=work.drafts.at(-1),now=this.clock();
    if(!draft||draft.attemptId!==id)throw new HomeworkError(409,'Lượt làm không hợp lệ.');
    if(draft.submittedAt!==null)return this.state(token);
    if(now>=Math.min(draft.deadline,this.monthly(token)?.closesAt??Infinity))return this.submit(token,id,draft.answers);
    const checked=validateDraft({...draft,answers,updatedAt:Math.max(now,draft.updatedAt),revision:draft.revision+1},this.examFor(token));
    if(!checked.ok)throw new HomeworkError(400,'Bài làm không đúng định dạng.');
    work.drafts[work.drafts.length-1]=checked.value;this.putLesson(token,work);return this.state(token);
  }
  submit(token:string,id:string,answers:Answers){
    this.assertOpen(token);
    const work=this.lessonWork(token),draft=work.drafts.at(-1),now=this.clock(),exam=this.examFor(token);
    if(!draft||draft.attemptId!==id)throw new HomeworkError(409,'Lượt làm không hợp lệ.');
    if(draft.submittedAt!==null)return this.state(token);
    const timedOut=now>=Math.min(draft.deadline,this.monthly(token)?.closesAt??Infinity);
    const checked=validateDraft({...draft,answers:timedOut?draft.answers:answers,updatedAt:Math.max(now,draft.updatedAt),revision:draft.revision+1},exam);
    if(!checked.ok)throw new HomeworkError(400,'Bài làm không đúng định dạng.');
    const submitted=submitDraft(exam,checked.value,now);if(!submitted.ok)throw new Error(submitted.message);
    const result=resultFor(exam,submitted.value);if(!result?.score.ok)throw new Error('Không chấm được');
    work.drafts[work.drafts.length-1]=submitted.value;
    // Bản nộp và biên nhận dùng cùng mốc server đã chuẩn hóa, kể cả khi đồng hồ lùi sau lần lưu trước.
    const mtm=result.mtm;
    work.receipts.push({attemptId:id,attemptNumber:work.drafts.length,submittedAt:submitted.value.submittedAt!,elapsedSeconds:Math.min(exam.durationMinutes*60,Math.floor((Math.min(now,this.monthly(token)?.closesAt??Infinity)-draft.startedAt)/1000)),score:mtm?(mtm.officialDisplayTotal===null?null:Number(mtm.officialDisplayTotal)):result.score.earnedMillipoints/1000,...(mtm?{rubricVersion:MTM_SCORING_VERSION,mtm}:{}),late:work.student.nextActualClassAt===undefined?null:now>=work.student.nextActualClassAt,timedOut});
    this.putLesson(token,work);return this.state(token);
  }
}
