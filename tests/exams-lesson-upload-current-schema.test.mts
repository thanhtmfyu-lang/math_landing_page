import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
const {db,applied}=await baselineDatabase();
let checks=0;
try{
 assert(applied.includes('202611020001_btvn_answer_correction.sql'));checks++;
 assert(!applied.includes('202611020101_cong_up_btvn_gv.sql'));checks++;
 await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));checks++;
 await db.exec(`create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;`);
 const sql=readFileSync('supabase/migrations-pending/202611020101_cong_up_btvn_gv.sql','utf8');
 await db.exec(sql);checks++;
 await db.exec(sql);checks++;
 assert.equal((await db.query('select count(*) n from public.mtm_staff')).rows[0].n,0);checks++;
 assert.equal((await db.query("select public from storage.buckets where id='mtm-lesson-private'")).rows[0].public,false);checks++;
 // Current production reader/report functions still compile with the new
 // wrappers/triggers. This checks the complete current chain, including #148.
 await db.exec('select mtm_test100.refresh_reports()');checks++;
 const owner='11111111-1111-4111-8111-111111111111';
 await db.query('insert into auth.users values($1)',[owner]);
 await db.query("insert into public.mtm_staff(user_id,short_name,display_name,role,teacher_key) values($1,'fixture','Nhân sự thử','admin','thaythanh')",[owner]);
 await db.transaction(async tx=>{
  await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
  const result=(await tx.query("select public.mtm_lesson_upload_api('{\"action\":\"dashboard\"}') data")).rows[0].data;
  assert.equal(result.staff.user_id,owner);assert.deepEqual(result.uploads,[]);assert.deepEqual(result.sessions,[]);checks++;
  await assert.rejects(()=>tx.exec("select * from mtm_hw_private.lesson_publish_capability"));checks++;
 });
 await db.transaction(async tx=>{await tx.exec('set local role service_role');await tx.exec("select set_config('request.jwt.claim.role','service_role',true)");const result=(await tx.query("select public.mtm_lesson_upload_api('{\"action\":\"worker_claim\",\"worker_id\":\"fixture\"}') data")).rows[0].data;assert.equal(result.job,null);checks++;});
}finally{await db.close();}
console.log(`${checks} ca schema hiện hành đầy đủ + is_test100 + migration cổng GV chạy lại: đạt; không mạng, không dữ liệu thật.`);
