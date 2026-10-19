import {generatePracticeBank} from './generate-practice-bank.mjs';
generatePracticeBank();
// Chạy bộ test hồi quy Luyện tập/Thi thử: đóng gói từng file test bằng esbuild
// ra thư mục tạm của hệ điều hành rồi chạy bằng node. Không cần cài thêm gói,
// chạy được trên Windows (npm test). Không đọc/ghi dữ liệu học sinh.
// Dùng: node scripts/run-tests.mjs [đường-dẫn-test ...]
import {build} from 'esbuild';
import {mkdirSync,mkdtempSync, readdirSync, rmSync} from 'node:fs';
import {join, basename, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const files = args.length
  ? args.map(f => join(root, f))
  : readdirSync(join(root, 'tests')).filter(f => /^(?:exams-|sync-).*\.test\.mts$/.test(f)).sort().map(f => join(root, 'tests', f));
if (!files.length) { console.error('Không tìm thấy file test nào.'); process.exit(1); }

// Giữ artifact trên T và cho module external tìm node_modules đúng repo.
mkdirSync(join(root,'.qa-temp'),{recursive:true});
const out = mkdtempSync(join(root,'.qa-temp','mtm-tests-'));
let failed = 0;
try {
  await build({
    entryPoints: files, bundle: true, platform: 'node', format: 'esm', target: 'node20',
    outdir: out, outExtension: {'.js': '.mjs'}, loader: {'.json': 'json'}, logLevel: 'error',
    // Mã nguồn web có thể import thư viện trình duyệt; test chỉ dùng phần lõi thuần.
    packages: 'external',
  });
  for (const file of files) {
    const name = basename(file).replace(/\.m?ts$/, '.mjs');
    const started = Date.now();
    const run = spawnSync(process.execPath, [join(out, name)], {stdio: 'inherit', env: {...process.env, MTM_ROOT: root}});
    const ok = run.status === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'ĐẠT ' : 'LỖI '} ${relative(root, file)} (${Date.now() - started} ms)`);
  }
} finally {
  rmSync(out, {recursive: true, force: true});
}
console.log(failed ? `${failed}/${files.length} file test lỗi.` : `${files.length}/${files.length} file test đạt.`);
process.exit(failed ? 1 : 0);
