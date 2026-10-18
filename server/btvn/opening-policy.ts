import type {LessonMaterial} from '../../src/native/homework/btvn-contract';

/** Lớp xuất phát sớm cùng khoá (8+, 9+, nhóm "2K10 Thứ 3, 6") học chung bài, mỗi buổi chọn ca nào cũng được (anh Thành chốt 18/10). */
const XPS=/^(2K\d{1,2}) (8\+|9\+|Thứ 3, 6)$/;

function ownOpensAt(material:LessonMaterial,className:string):number {
  const explicit=material.classOpensAt?.[className];
  if(explicit!==undefined){const parsed=Date.parse(explicit);return Number.isFinite(parsed)?parsed:Infinity;}
  const date=material.classDates?.[className]??material.date;
  const parsed=Date.parse(date+'T21:30:00+07:00');return Number.isFinite(parsed)?parsed:Infinity;
}

/** Bản cũ chưa có lịch được khóa đến 21:30 ngày học, theo giờ Việt Nam.
 * Bài giao cho nhiều lớp XPS cùng khoá mở cho tất cả từ giờ mở sớm nhất trong các lớp đó. */
export function lessonOpensAt(material:LessonMaterial,className:string):number {
  if(material.kind==='kiem-tra-thang')return material.opensAt??Infinity;
  let opens=ownOpensAt(material,className);
  const cohort=XPS.exec(className)?.[1];
  if(cohort){
    const labels=new Set([...Object.keys(material.classDates??{}),...Object.keys(material.classOpensAt??{})]);
    for(const label of labels)if(label!==className&&XPS.exec(label)?.[1]===cohort)opens=Math.min(opens,ownOpensAt(material,label));
  }
  return opens;
}
export function visibleLesson<T extends LessonMaterial>(material:T,className:string,now:number):T & {opensAt:number;locked:boolean} {
  const opensAt=lessonOpensAt(material,className),locked=now<opensAt;
  const result={...material,date:material.classDates?.[className]??material.date,opensAt,locked};
  return locked?{...result,materialUrl:null,handoutUrl:null,homeworkUrl:null,homeworkUrls:[]}:result;
}
