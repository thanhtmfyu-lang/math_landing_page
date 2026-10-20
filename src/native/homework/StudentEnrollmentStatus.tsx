import {ENROLLMENT_STATUSES,ENROLLMENT_LABELS,isEnrollmentStatus,type EnrollmentRecord,type EnrollmentStatus} from './enrollment-status';
import './enrollment-status.css';
export function StudentEnrollmentStatus({student,busy,onChange}:{student:{id:string;profile:{fullName:string}}&Partial<EnrollmentRecord>;busy:boolean;onChange:(status:EnrollmentStatus)=>void}){
 const ready=(student.enrollmentStatus===null||isEnrollmentStatus(student.enrollmentStatus))&&Number.isSafeInteger(student.enrollmentVersion)&&student.enrollmentVersion!>=0;
 return <label className="hw-enrollment-status">Trạng thái học của {student.profile.fullName}
  <select disabled={busy||!ready} value={student.enrollmentStatus??''} onChange={event=>{const status=event.target.value;if(!busy&&ready&&isEnrollmentStatus(status)&&status!==student.enrollmentStatus)onChange(status);}}>
   <option value="" disabled>{ready?'Chưa phân loại':'Chưa tải trạng thái'}</option>
   {ENROLLMENT_STATUSES.map(status=><option key={status} value={status}>{ENROLLMENT_LABELS[status]}</option>)}
  </select>
 </label>;
}
