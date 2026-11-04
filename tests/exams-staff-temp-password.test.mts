import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
const db=new PGlite();let checks=0;
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema mtm_hw_private;
 create table auth.users(id uuid primary key,encrypted_password text,updated_at timestamptz);
 create table public.mtm_staff(user_id uuid primary key references auth.users(id),short_name text unique,active boolean default true,must_change_password boolean default false);
 create function mtm_hw_private.staff_password_changed() returns trigger language plpgsql as $$begin update public.mtm_staff set must_change_password=false where user_id=new.id;return new;end$$;
 create trigger mtm_staff_password_changed after update of encrypted_password on auth.users for each row execute function mtm_hw_private.staff_password_changed();
 create schema fixture_crypto;
 create function fixture_crypto.gen_salt(text,int) returns text language sql volatile as $$select gen_random_uuid()::text$$;
 create function fixture_crypto.crypt(text,text) returns text language sql as $$select encode(sha256(convert_to($1||$2,'UTF8')),'hex')$$;`);
 const production=readFileSync(process.env.MTM_ROOT+'/supabase/migrations-pending/202611040105_staff_temp_password.sql','utf8');
 // PGlite lacks usable bcrypt. Replace ONLY extension discovery in this fixture;
 // production keeps pgcrypto. No fixture hash is used outside this in-memory DB.
 const sql=production.replace("select n.nspname into crypto_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'","select 'fixture_crypto' into crypto_schema");
 assert.notEqual(sql,production);await db.exec(sql);await db.exec(sql);checks++;
 const names=['thaythanh','thaytai','thayhieu','thayhoang','thaygiang','hang','vietanh','dung'];
 for(const name of [...names,'quanly']){const uid=crypto.randomUUID();await db.query('insert into auth.users(id,encrypted_password) values($1,$2)',[uid,'old-fixture']);await db.query('insert into public.mtm_staff(user_id,short_name) values($1,$2)',[uid,name]);}
 const call=(role:string,name:any,p:any)=>db.transaction(async tx=>{await tx.exec('set local role '+role);return tx.query('select mtm_hw_private.staff_set_temp_password($1,$2) result',[name,p]);});
 for(const name of names){assert.deepEqual((await call('service_role',name,'synthetic-fixture-password')).rows[0].result,{short_name:name,must_change_password:true});checks++;}
 assert.equal((await db.query('select count(*) n from public.mtm_staff where must_change_password')).rows[0].n,8);checks++;
 for(const role of ['anon','authenticated']){await assert.rejects(()=>call(role,'thaythanh','synthetic-fixture-password'),/permission denied/);checks++;}
 // Even schema USAGE must not allow calling the function.
 await db.exec('grant usage on schema mtm_hw_private to anon,authenticated');
 for(const role of ['anon','authenticated']){await assert.rejects(()=>call(role,'thaythanh','synthetic-fixture-password'),/permission denied/);checks++;}
 for(const name of ['quanly','unknown',null]){await assert.rejects(()=>call('service_role',name,'synthetic-fixture-password'),/TEMP_PASSWORD_TARGET_DENIED/);checks++;}
 for(const password of [null,'short','x'.repeat(73),'ế'.repeat(25)]){await assert.rejects(()=>call('service_role','thaythanh',password),/TEMP_PASSWORD_INVALID/);checks++;}
 await db.query("update public.mtm_staff set active=false where short_name='dung'");await assert.rejects(()=>call('service_role','dung','synthetic-fixture-password'),/TEMP_PASSWORD_TARGET_DENIED/);checks++;
 assert.equal((await db.query('select count(*) n from mtm_hw_private.staff_temp_password_audit')).rows[0].n,8);checks++;
 assert.equal((await db.query("select encrypted_password from auth.users join public.mtm_staff on id=user_id where short_name='quanly'")).rows[0].encrypted_password,'old-fixture');checks++;
 // Audit failure rolls back the hash and flag in the same transaction.
 await db.exec("create function mtm_hw_private.fail_audit() returns trigger language plpgsql as $$begin raise exception 'FIXTURE_AUDIT_FAIL';end$$;create trigger fail_audit before insert on mtm_hw_private.staff_temp_password_audit for each row execute function mtm_hw_private.fail_audit();");
 const before=JSON.stringify((await db.query("select encrypted_password,must_change_password from auth.users join public.mtm_staff on id=user_id where short_name='thaythanh'")).rows);
 await assert.rejects(()=>call('service_role','thaythanh','synthetic-fixture-password-2'),/FIXTURE_AUDIT_FAIL/);
 assert.equal(JSON.stringify((await db.query("select encrypted_password,must_change_password from auth.users join public.mtm_staff on id=user_id where short_name='thaythanh'")).rows),before);checks++;
 for(const code of ['40001','P0001']){
  let calls=0;const repo=new SupabaseHomeworkRepository({rpc:async()=>{calls++;return {data:null,error:{code,message:'PAPER_CHOICE_LOCKED'}};}},async()=>null);
  await assert.rejects(()=>repo.call('fixture','select','fixture-de-1'),(e:any)=>e.status===409&&e.message==='Đã chọn đề, không đổi được');assert.equal(calls,1);checks++;
 }
 const other=new SupabaseHomeworkRepository({rpc:async()=>({data:null,error:{code:'P0001',message:'PRIVATE_OTHER_ERROR'}})},async()=>null);
 await assert.rejects(()=>other.call('fixture','state'),(e:any)=>e.status===503&&!e.message.includes('PRIVATE'));checks++;
 console.log(`${checks} ca tuyến mật khẩu tạm và khóa đề đạt; fixture only, bcrypt không được mô phỏng là kiểm live.`);
}finally{await db.close();}
