export type Registration={studentName:string;phone:string;grade:string;message:string;notes?:string;groupSize?:string;groupInterest?:boolean;trial?:boolean;leadSource?:string};
export function normalizeRegistration(value:Registration){
 const data=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,typeof v==='string'?v.trim():v])) as Registration;
 if(!data.studentName||!data.phone||!data.grade||!data.message)throw new Error('Vui lòng điền tên, số điện thoại, lớp và hình thức học.');
 if(!/^[+\d\s().-]+$/.test(data.phone))throw new Error('Số điện thoại chỉ gồm số và dấu phân cách thông thường.');
 data.phone=data.phone.replace(/[\s().-]/g,'').replace(/^\+84/,'0');
 if(!/^0[35789]\d{8}$/.test(data.phone))throw new Error('Nhập số di động Việt Nam 10 chữ số, bắt đầu bằng 0 hoặc +84.');
 if(!['10','11','12','dgnl','hsa','tsa','thcs'].includes(data.grade)||!['truc-tiep','online'].includes(data.message))throw new Error('Chọn lớp và hình thức học trong danh sách.');
 if((data.notes||'').length>1500)throw new Error('Lời nhắn tối đa 1.500 ký tự.');
 if(data.groupSize&&!/^(?:[2-9]|[1-9][0-9])$/.test(data.groupSize))throw new Error('Số bạn trong nhóm từ 2 đến 99, tính cả bạn; để trống nếu chưa rõ.');
 if(data.studentName.length>200)throw new Error('Họ tên tối đa 200 ký tự.');
 return data;
}
export function createRegistrationGate(){
 let pending=false;
 return async(value:Registration,send:(data:Registration)=>Promise<unknown>)=>{
  if(pending)return false;
  const data=normalizeRegistration(value);pending=true;
  try{await send(data);return true}finally{pending=false}
 };
}

export function emailRegistration(data:Registration){const mode=data.message==='online'?'Online':'Trực tiếp';return {...data,study_mode:mode,notes:data.notes||'',group_size:data.groupSize||'',group_interest:!!data.groupInterest,trial:data.trial?'Có':'',lead_source:data.leadSource||'',message:[mode,data.trial?'Muốn học thử / kiểm tra đầu vào':'',data.groupSize?'Nhóm: '+data.groupSize+' bạn (tính cả người đăng ký)':data.groupInterest?'Quan tâm đăng ký nhóm · chưa chốt số bạn':'',data.notes?'Lời nhắn: '+data.notes:'',data.leadSource?'— '+data.leadSource:''].filter(Boolean).join('\n')}}
