export const ENROLLMENT_STATUSES=['HOC_THU','DA_HOC_THU','CHINH_THUC','KHONG_HOC'] as const;
export type EnrollmentStatus=typeof ENROLLMENT_STATUSES[number];
export const ENROLLMENT_LABELS:Record<EnrollmentStatus,string>={HOC_THU:'Học thử',DA_HOC_THU:'Đã học thử',CHINH_THUC:'Chính thức',KHONG_HOC:'Không học'};
export type EnrollmentRecord={enrollmentStatus:EnrollmentStatus|null;enrollmentVersion:number};
export function isEnrollmentStatus(value:unknown):value is EnrollmentStatus{return ENROLLMENT_STATUSES.some(status=>status===value);}
/** Ghép đúng tập hồ sơ quản trị, không suy trạng thái khi thiếu phản hồi. */
export function withEnrollmentStatuses<T extends {id:string}>(students:T[],value:unknown):(T&EnrollmentRecord)[]{
 const items=(value as {items?:unknown})?.items;
 if(!Array.isArray(items)||items.length!==students.length)throw Error('Chưa tải đủ trạng thái học sinh.');
 const ids=new Set(students.map(student=>student.id)),records=new Map<string,EnrollmentRecord>();
 for(const row of items){
  if(!row||typeof row!=='object'||!ids.has(row.studentId)||records.has(row.studentId)
   ||row.enrollmentStatus!==null&&!isEnrollmentStatus(row.enrollmentStatus)
   ||!Number.isSafeInteger(row.enrollmentVersion)||row.enrollmentVersion<0)throw Error('Trạng thái học sinh không hợp lệ.');
  records.set(row.studentId,{enrollmentStatus:row.enrollmentStatus,enrollmentVersion:row.enrollmentVersion});
 }
 return students.map(student=>({...student,...records.get(student.id)!}));
}
/** RPC nhãn chưa triển khai/lỗi không chặn chức năng quản trị cũ. Không cho sửa nhãn chưa tải. */
export async function loadEnrollmentStatuses<T extends {id:string}>(students:T[],read:()=>Promise<unknown>):Promise<{students:(T&Partial<EnrollmentRecord>)[];notice:string}>{
 try{return {students:withEnrollmentStatuses(students,await read()),notice:''};}
 catch{return {students,notice:'Chưa tải được trạng thái học sinh. Các chức năng khác vẫn dùng được. Bấm tải lại trạng thái sau khi kiểm kết nối hoặc cập nhật hệ thống.'};}
}
