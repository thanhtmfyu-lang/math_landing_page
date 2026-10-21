import assert from 'node:assert/strict';
import {withEnrollmentStatuses,loadEnrollmentStatuses,ENROLLMENT_STATUSES,ENROLLMENT_LABELS} from '../src/native/homework/enrollment-status';
import {load,all,text,React} from './daily19-ui-harness.mts';
const {StudentEnrollmentStatus}=load('src/native/homework/StudentEnrollmentStatus.tsx');
const students=[{id:'fixture',profile:{fullName:'Học sinh mẫu'}}];
const receipt={items:[{studentId:'fixture',enrollmentStatus:null,enrollmentVersion:0}]};
assert.deepEqual(withEnrollmentStatuses(students,receipt),[{...students[0],enrollmentStatus:null,enrollmentVersion:0}]);
assert.deepEqual(withEnrollmentStatuses([],{items:[]}),[]);
for(const read of [async()=>{throw Error('RPC chưa triển khai');},async()=>({items:[]})]){
 const unavailable=await loadEnrollmentStatuses(students,read);
 assert.deepEqual(unavailable.students,students);assert.match(unavailable.notice,/Chưa tải được/);
 assert.equal(selectUnavailable(unavailable.students[0]).props.disabled,true);
}
assert.equal((await loadEnrollmentStatuses(students,async()=>receipt)).notice,'');
function selectUnavailable(student:any){return all(StudentEnrollmentStatus({student,busy:false,onChange:()=>{throw Error('must stay disabled');}}),n=>n.type==='select')[0];}
for(const invalid of [null,{items:[]},{items:[{...receipt.items[0],studentId:'other'}]},{items:[...receipt.items,...receipt.items]},
 {items:[{...receipt.items[0],enrollmentStatus:'NHAP_HOC'}]},{items:[{...receipt.items[0],enrollmentVersion:-1}]},
 {items:[{...receipt.items[0],enrollmentVersion:1.5}]},{items:[{studentId:'fixture',enrollmentVersion:0}]}])assert.throws(()=>withEnrollmentStatuses(students,invalid));
const calls:string[]=[];
const props={student:{...students[0],enrollmentStatus:null,enrollmentVersion:0},busy:false,onChange:(status:string)=>calls.push(status)};
const select=(p:any)=>all(StudentEnrollmentStatus(p),n=>n.type==='select')[0];
assert.match(text(StudentEnrollmentStatus(props)),/Chưa phân loại/);
for(const status of ENROLLMENT_STATUSES){assert.ok(text(StudentEnrollmentStatus(props)).includes(ENROLLMENT_LABELS[status]));select(props).props.onChange({target:{value:status}});}
assert.deepEqual(calls,ENROLLMENT_STATUSES);
for(const p of [{...props,busy:true},{...props,student:students[0]},{...props,student:{...props.student,enrollmentVersion:-1}}]){
 assert.equal(select(p).props.disabled,true);select(p).props.onChange({target:{value:'HOC_THU'}});
}
select({...props,student:{...props.student,enrollmentStatus:'HOC_THU'}}).props.onChange({target:{value:'HOC_THU'}});
select(props).props.onChange({target:{value:'unknown'}});assert.equal(calls.length,4);
const {renderToStaticMarkup}=await import('react-dom/server');
const html=renderToStaticMarkup(React.createElement(StudentEnrollmentStatus,props));
assert.doesNotMatch(html,/fixture|phone|pin|token|PRIVATE/);
assert.match(html,/<label[^>]*>Trạng thái học của Học sinh mẫu<select/);
console.log('Đạt NM8: bốn nhãn, hồ sơ chưa phân loại, chặn phản hồi thiếu/sai/trùng, khóa khi bận và tương tác chọn trạng thái.');

const {withPhotoStatuses}=load('src/native/homework/AdminHomework.tsx');
const joined=withPhotoStatuses(withEnrollmentStatuses(students,receipt),{items:[{studentId:'fixture',photoHidden:false}]});
assert.equal(joined[0].enrollmentStatus,null);assert.equal(joined[0].enrollmentVersion,0);assert.equal(joined[0].photoHidden,false);
assert.equal(selectUnavailable(joined[0]).props.disabled,false,'Ghép trạng thái ảnh vẫn giữ trạng thái học');
