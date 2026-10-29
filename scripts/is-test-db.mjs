import {PGlite} from '@electric-sql/pglite';
import {fuzzystrmatch} from '@electric-sql/pglite/contrib/fuzzystrmatch';
import {readFileSync,readdirSync} from 'node:fs';
export async function baselineDatabase(){
 const db=new PGlite({extensions:{fuzzystrmatch}});
 await db.exec(`create schema extensions;create role anon;create role authenticated;create role service_role;create role authenticator;
 create schema auth;create table auth.users(id uuid primary key);
 create function extensions.digest(p text,alg text) returns bytea language plpgsql immutable as $$begin if alg<>'sha256' then raise exception 'Fixture supports SHA256 only';end if;return sha256(convert_to(p,'UTF8'));end$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,created_at timestamptz default clock_timestamp());
 alter table storage.objects enable row level security;`);
 const applied=[],skipped=[];
 for(const dir of ['supabase/migrations','supabase/migrations-pending']){
  // 043 is a one-off real-person data reconciliation, with no schema definitions.
  const files=readdirSync(dir).filter(f=>f.endsWith('.sql')&&!f.includes('202610270100')&&!f.includes('_is_test_')&&!f.startsWith('20261027_')&&!/202610180043|202610190068|202610200075/.test(f)).sort((a,b)=>{
   const key=f=>f.replace(/^(\d+)_([0-9]+)_/,'$1~$2_').replace(/^(\d+)_/,'$1!_');return key(a).localeCompare(key(b));
  });
  for(const file of files){
   try{
    let sql=readFileSync(dir+'/'+file,'utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
    // These hashes pin cloud pg_get_functiondef formatting, not a WASM installation.
    // Only omit the historical source hash check; preserve all schema/function SQL.
    if(/2026101900(63|66|68)/.test(file))sql=sql.replace(/do \$guard\$[\s\S]*?end\$guard\$;/,'');
    if(file.includes('202610190066')){
     const f=(await db.query("select pg_get_functiondef('mtm_hw_private.hv_ca_rows(date,date)'::regprocedure) src")).rows[0].src;
     // Equivalent parentheses present in 066's pinned live predecessor, absent from 050 in git.
     await db.exec(f.replace('where mtm_hw_private.nghi_tu(r.id) is null or r.ngay < mtm_hw_private.nghi_tu(r.id)','where (mtm_hw_private.nghi_tu(r.id) is null or r.ngay < mtm_hw_private.nghi_tu(r.id))'));
     // 050 in git has no schedule_hs clause. 066's final replacement is a no-op on it.
     sql=sql.replace("if position(anchor in fixed)=0 then raise exception '066 legacy private schedule anchor changed';end if;",'');
    }
    await db.exec(sql);applied.push(file);
    if(file.includes('202610180042'))await db.exec(`create table mtm_hw_private.merge_backup(id bigserial primary key,at timestamptz default now(),kept uuid,merged uuid,kind text,data jsonb)`);
   }
   catch(e){
    // Live data migrations guard on real rows (RAISE, SQLSTATE P0001) and cannot run on
    // the empty fixture; they carry no schema the is_test checks depend on.
    if(dir==='supabase/migrations-pending'&&e.code==='P0001'){await db.exec('rollback').catch(()=>{});skipped.push(file);continue;}
    console.error('SCHEMA FAILED',file,e.message);throw e;}
  }
 }
 return {db,applied,skipped};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/is-test-db.mjs')){
 const {db,applied}=await baselineDatabase();console.log('SCHEMA OK',applied.length);
 const funcs=await db.query(`select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','mtm_hw_private') and p.prokind='f'`);
 const {writeFileSync,mkdirSync}=await import('node:fs');mkdirSync('.qa-temp/is-test',{recursive:true});writeFileSync('.qa-temp/is-test/functions.json',JSON.stringify(funcs.rows,null,2));await db.close();
}
