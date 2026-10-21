import {readFile, realpath} from 'node:fs/promises';
import {resolve, dirname, basename} from 'node:path';
import {fileURLToPath} from 'node:url';

/** Never log the query, response body, provider message, or thrown error. A
 * successful SQL statement may return a PIN; errors may echo its arguments. */
export async function applySupabaseQuery({projectRef, token, sql}, transport = fetch) {
  if (!/^[a-z0-9]{20}$/.test(projectRef ?? '') || !token || typeof sql !== 'string' || !sql.trim()) return {ok: false, status: null};
  try {
    const response = await transport(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({query: sql}), signal: AbortSignal.timeout(60000),
    });
    // Drain without decoding or persisting potentially secret result values.
    await response.body?.cancel();
    return {ok: response.ok, status: response.status};
  } catch {return {ok: false, status: null};}
}

if (process.argv[1] && basename(process.argv[1]) === 'apply-supabase-query.mjs' && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result = {ok: false, status: null};
  try {
    const name = process.argv[2];
    if (!/^[0-9A-Za-z_.-]+\.sql$/.test(name ?? '')) throw Error();
    const base = await realpath(resolve('supabase/migrations-pending'));
    const file = await realpath(resolve(base, name));
    if (dirname(file) !== base || basename(file) !== name) throw Error();
    result = await applySupabaseQuery({projectRef: process.env.PROJECT_REF, token: process.env.SUPABASE_ACCESS_TOKEN, sql: await readFile(file, 'utf8')});
  } catch {/* Do not print even local filesystem errors from this secret-bearing job. */}
  console.log(result.ok ? 'SQL đạt.' : `SQL lỗi${result.status ? ` (HTTP ${result.status})` : ''}. Kết quả riêng không được ghi log.`);
  process.exitCode = result.ok ? 0 : 1;
}
