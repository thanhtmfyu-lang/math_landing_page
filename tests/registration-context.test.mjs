import assert from 'node:assert/strict';
import {applyRegistrationContext} from '../src/components/registration-context.ts';
import {normalizeRegistration,emailRegistration,createRegistrationGate} from '../src/components/registration-submit.ts';
const blank={grade:'',notes:''};assert.equal(applyRegistrationContext(blank,{grade:'tsa'}).grade,'tsa');
assert.deepEqual(applyRegistrationContext({grade:'hsa',notes:'Đã nhập'},{grade:'tsa',interest:'Toán 10 & 11'}),{grade:'hsa',notes:'Đã nhập'});
assert.equal(applyRegistrationContext(blank,{interest:'Toán 10 & 11'}).grade,'');assert(applyRegistrationContext(blank,{interest:'Toán 10 & 11'}).notes.includes('10 hoặc 11'));
const form={studentName:'Synthetic',phone:'0912345678',grade:'tsa',message:'online',notes:'Hỏi lịch chiều',groupSize:'3'};
let sent;await createRegistrationGate()(form,async data=>{sent=emailRegistration(data)});
assert(sent.message.includes('Hỏi lịch chiều'));assert(sent.message.includes('3 bạn'));assert.equal(sent.study_mode,'Online');assert.equal(sent.group_size,'3');
assert.throws(()=>normalizeRegistration({...form,groupSize:'1'}));assert.throws(()=>normalizeRegistration({...form,groupSize:'2.5'}));assert.throws(()=>normalizeRegistration({...form,notes:'x'.repeat(1501)}));
assert.equal(normalizeRegistration({...form,notes:'',groupSize:''}).groupSize,'');
console.log('PASS CTA prefill, preserve existing choices/notes, combined course ambiguity, optional group/notes validation, actual send-adapter message retains new fields. No HTTP/email.');

const pendingGroup=emailRegistration(normalizeRegistration({...form,groupSize:'',groupInterest:true}));assert.equal(pendingGroup.group_interest,true);assert(pendingGroup.message.includes('Quan tâm đăng ký nhóm · chưa chốt số bạn'));assert.equal(pendingGroup.group_size,'');const individual=emailRegistration(normalizeRegistration({...form,groupSize:'',groupInterest:false}));assert(!individual.message.includes('Quan tâm đăng ký nhóm'));
assert.equal(applyRegistrationContext({grade:'',notes:'',message:''},{grade:'12',interest:'Học online qua Zoom (Toán 12 / HSA)',mode:'online'}).message,'online');assert.equal(applyRegistrationContext({grade:'',notes:'',message:'truc-tiep'},{mode:'online'}).message,'truc-tiep');assert(!('message' in applyRegistrationContext(blank,{grade:'12'})));assert.equal(applyRegistrationContext({grade:'',notes:'',message:''},{mode:'zoom'}).message,'');
console.log('PASS online CTA presets hình thức học without overwriting a chosen mode');
