// Chỉ chạy trên máy chủ quản trị. Đọc biến môi trường runtime, không đọc .env trong kho.
// node scripts/issue-semester-codes.mjs <10|11|12> <YYYY-MM-DD> [số-mã]
// Mỗi mã chỉ in một lần để đưa đi in sách; không chuyển stdout vào kho công khai/log CI.
import {createHash,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const [grade,expiry,count='1']=process.argv.slice(2);
if(!['10','11','12'].includes(grade)||!/^\d{4}-\d{2}-\d{2}$/.test(expiry||'')||!/^([1-9]|[1-9]\d|100)$/.test(count)||!Number.isFinite(Date.parse(expiry))||Date.parse(expiry)<=Date.now())throw Error('Chọn khối 10/11/12, hạn dùng tương lai YYYY-MM-DD, số mã 1–100.');
const {SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key}=process.env;
if(!url||!key||new URL(url).protocol!=='https:')throw Error('Thiếu cấu hình quản trị HTTPS.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
for(let i=0;i<Number(count);i++){
 const raw=randomBytes(20).toString('hex').toUpperCase();
 const hash=createHash('sha256').update('mtm-hk1-book:'+raw).digest('hex');
 const {data,error}=await db.rpc('mtm_hk1_issue_code',{p_hash:hash,p_grade:grade,p_expires:expiry+'T00:00:00+07:00'});
 if(error||data!==true)throw Error('Chưa cấp được mã; dừng lô, không ghi lỗi chứa dữ liệu riêng.');
 console.log(raw.match(/.{5}/g).join('-'));
}
