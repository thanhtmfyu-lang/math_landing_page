import {AVATARS,PHOTO_MAX_CHARS,validPhoto,validSchool,type AvatarId} from './avatar-http';

/** Phép chiếu công khai dùng chung cho top 10 và hạng của em.
 * Chỉ các trường được duyệt đi ra API; không chuyển mã hoặc điện thoại từ RPC. */
export function publicRankRow(r:any,maxRank=Number.MAX_SAFE_INTEGER){
 if(!r||!Number.isSafeInteger(r.rank)||r.rank<1||r.rank>maxRank||!validSchool(r.fullName)||!r.fullName.trim()||typeof r.className!=='string'||r.className.length>100||!validSchool(r.className)||typeof r.score!=='number'||!Number.isFinite(r.score)||r.score<0||r.score>10||!Number.isSafeInteger(r.submitted)||!Number.isSafeInteger(r.total)||r.total<1||r.submitted<0||r.submitted>r.total)throw Error('Invalid rank row');
 if(r.school!==undefined&&r.school!==null&&!validSchool(r.school))throw Error('Invalid rank school');
 if(r.avatar!==undefined&&r.avatar!==null&&!AVATARS.includes(r.avatar as AvatarId))throw Error('Invalid rank avatar');
 if(r.photo!==undefined&&r.photo!==null&&typeof r.photo!=='string')throw Error('Invalid rank photo');
 if(r.photo_hidden!==undefined&&typeof r.photo_hidden!=='boolean')throw Error('Invalid moderation flag');
 // Ảnh cũ từng cho phép lớn hơn 40k không làm hỏng toàn bảng. Chỉ bỏ ảnh đó;
 // ảnh nhỏ vẫn phải qua đúng bộ kiểm JPEG 192x192 dùng khi lưu hồ sơ.
 const photo=typeof r.photo==='string'&&r.photo.length<=PHOTO_MAX_CHARS?r.photo:null;
 if(photo!==null&&!validPhoto(photo))throw Error('Invalid rank photo');
 const school=typeof r.school==='string'?r.school.normalize('NFC').trim().replace(/\s+/g,' '):'';
 if(r.schoolClass!==undefined&&r.schoolClass!==null&&(!validSchool(r.schoolClass)||r.schoolClass.length>40))throw Error('Invalid rank school class');
 const schoolClass=typeof r.schoolClass==='string'?r.schoolClass.normalize('NFC').trim().replace(/\s+/g,' '):'';
 return {rank:r.rank,fullName:r.fullName,className:r.className,school:school&&!['chưa cập nhật','chua cap nhat'].includes(school.toLocaleLowerCase('vi'))?school:null,...(schoolClass?{schoolClass}:{}),...(typeof r.seconds==='number'&&Number.isFinite(r.seconds)&&r.seconds>=0&&r.seconds<=10_000_000?{seconds:Math.round(r.seconds)}:{}),avatar:r.avatar??null,photo:r.photo_hidden?null:photo||null,score:r.score,submitted:r.submitted,total:r.total};
}
// Phép chiếu ẩn danh được giữ cho nơi chưa có quyền công khai danh tính.
export function anonymousRankRow(r:any,maxRank=10){
 const {rank,className,score,submitted,total}=publicRankRow(r,maxRank);
 return {rank,className,score,submitted,total};
}
export function validRankFilter(cohort:unknown,kind:unknown,cls:unknown){return typeof cohort==='string'&&['2K9','2K10','2K11','2K12','2K13','2K14'].includes(cohort)&&typeof kind==='string'&&['btvn-tuan','btvn-thang','kiem-tra-thang'].includes(kind)&&(cls===undefined||cls===null||typeof cls==='string'&&cls.length<=100&&cls.startsWith(cohort+' '));}

/** 18/10 Đấu trường: cả 3 khối một lượt. Ánh xạ từng trường; lớp chỉ có nhãn, số em, điểm TB, điểm cao nhất, tên em dẫn đầu. */
export function publicArena(data:any){
 if(!data||!['btvn-tuan','btvn-thang','kiem-tra-thang'].includes(data.kind)||!Array.isArray(data.cohorts)||data.cohorts.length>6)throw Error('Invalid arena');
 const num=(v:unknown,max:number)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max)throw Error('Invalid arena number');return v;};
 return {kind:data.kind as string,cohorts:data.cohorts.map((c:any)=>{
  if(!c||!['2K9','2K10','2K11','2K12','2K13','2K14'].includes(c.cohort)||!Array.isArray(c.top)||c.top.length>10||!Array.isArray(c.classes)||c.classes.length>30)throw Error('Invalid arena cohort');
  return {cohort:c.cohort as string,ranked:num(c.ranked,5000),perfect:num(c.perfect,5000),top:c.top.map((r:any)=>publicRankRow(r,10)),
   classes:c.classes.map((k:any)=>{if(!validSchool(k?.className)||!k.className.startsWith(c.cohort+' ')||!validSchool(k.leader))throw Error('Invalid arena class');if(!Array.isArray(k.top)||k.top.length>10)throw Error('Invalid arena class top');
    return {className:k.className as string,students:num(k.students,5000),avg:num(k.avg,10),best:num(k.best,10),leader:k.leader as string,
     top:k.top.map((r:any)=>({...publicRankRow(r,10),cohortRank:num(r.cohortRank,5000)}))};})};
 })};
}
