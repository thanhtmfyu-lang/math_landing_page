// Chỉ tạo SQL QA; không đọc credentials hoặc kết nối DB.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const target=resolve(process.argv[2]??'.qa-temp/web-sync063/rollback.sql');
const migration=readFileSync('supabase/migrations-pending/202610190063_web_sync_guards.sql','utf8').replace(/^begin;$/m,'').replace(/^commit;$/m,'');
const qa=readFileSync('tests/web-sync-063-rollback.sql','utf8');
mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,'BEGIN;\nSET LOCAL statement_timeout=\'60s\';\n'+migration+'\n'+qa+'\nROLLBACK;\n');
console.log(target);
