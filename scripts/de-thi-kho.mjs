// Đáp án đề thi thử HSA và đề giữa kỳ I (20/10/2026). Kho mã công khai nên đáp án, lời giải, tệp đề gốc và phần seed
// trong migration đã áp KHÔNG nằm trong kho nữa: bản gốc giữ ở thư mục riêng của dự án (MTM_DE_THI_DIR, mặc định
// /mnt/project-files/lo-trinh-web/dap-an-goc, cùng đường dẫn con như trong kho). Trang web chấm trên máy chủ
// (mtm_exam_private.exam_keys đã seed bằng 069/070/072), nên bản chạy thật không cần các tệp này.
// Tệp trong kho bị gỡ: key.json và tệp đề gốc xóa hẳn (.gitignore); migration giữ khung, phần seed thay bằng dòng STUB.
// Lịch sử git trước 20/10 vẫn còn bản rõ; không viết lại lịch sử.
//   node scripts/de-thi-kho.mjs restore   chép bản gốc về đúng chỗ trong kho (để chạy bộ chuyển đề); migration không ghi đè.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const STUB='-- ĐÃ GỠ ĐÁP ÁN KHỎI KHO CÔNG KHAI';
export const FILES=[
 'src/native/exams/hsa-papers/mtm-hsa-thi-thu-01.key.json',
 'src/native/exams/hsa-papers/mtm-hsa-thi-thu-02.key.json',
 'src/native/exams/de-giua-ky/mtm-gk1-toan-10-01.key.json',
 'src/native/exams/de-giua-ky/mtm-gk1-toan-11-01.key.json',
 'src/native/exams/de-giua-ky/mtm-gk1-toan-12-01.key.json',
 'tools/hsa-papers/de-thi-thu-hsa-01.json',
 'tools/hsa-papers/de-thi-thu-hsa-02.json',
 'tools/de-giua-ky-1/de-giua-ky-1-toan-10-mtm-01.json',
 'tools/de-giua-ky-1/de-giua-ky-1-toan-11-mtm-01.json',
 'tools/de-giua-ky-1/de-giua-ky-1-toan-12-mtm-01.json',
 'src/native/exams/de-giua-ky/mtm-gk1-toan-10-02.key.json',
 'src/native/exams/de-giua-ky/mtm-gk1-toan-11-02.key.json',
 'src/native/exams/de-giua-ky/mtm-gk1-toan-12-02.key.json',
 'src/native/exams/de-giua-ky/mtm-gk1-toan-10-03.key.json',
 'src/native/exams/de-giua-ky/mtm-gk1-toan-11-03.key.json',
 'src/native/exams/de-giua-ky/mtm-gk1-toan-12-03.key.json',
 'tools/de-giua-ky-1/de-giua-ky-1-toan-10-mtm-02.json',
 'tools/de-giua-ky-1/de-giua-ky-1-toan-11-mtm-02.json',
 'tools/de-giua-ky-1/de-giua-ky-1-toan-12-mtm-02.json',
 'tools/de-giua-ky-1/de-giua-ky-1-toan-10-mtm-03.json',
 'tools/de-giua-ky-1/de-giua-ky-1-toan-11-mtm-03.json',
 'tools/de-giua-ky-1/de-giua-ky-1-toan-12-mtm-03.json',
 'supabase/migrations-pending/202610190069_thi_thu_hsa_xep_hang.sql',
 'supabase/migrations-pending/202610190070_thi_thu_hsa_de_02.sql',
 'supabase/migrations-pending/202610190072_de_giua_ky_1.sql',
 'supabase/migrations-pending/202610200078_de_giua_ky_1_ma_02_03.sql',
 'supabase/migrations-pending/202610200092_hsa_dien_phan_so.sql',
];
export const privateDir=(env=process.env)=>env.MTM_DE_THI_DIR||'/mnt/project-files/lo-trinh-web/dap-an-goc';
/** Đọc một tệp đáp án: bản rõ trong máy nếu có, không thì bản gốc ở thư mục riêng; không có thì null (test chỉ chạy phần công khai). */
export function readSecret(root,path,env=process.env){
 for(const p of [join(root,path),join(privateDir(env),path)]){
  if(!existsSync(p))continue;const t=readFileSync(p,'utf8');if(!t.startsWith(STUB))return t;
 }
 return null;
}

if(process.argv[1]&&/de-thi-kho\.mjs$/.test(process.argv[1])&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 if(process.argv[2]!=='restore')throw Error('Dùng: restore');
 let n=0;for(const f of FILES){if(f.startsWith('supabase/'))continue;const t=readSecret(root,f);if(t==null)throw Error('Thiếu bản gốc: '+f);mkdirSync(dirname(join(root,f)),{recursive:true});writeFileSync(join(root,f),t);n++;}
 console.log('Đã chép',n,'tệp đề/đáp án về kho (đã .gitignore).');
}
