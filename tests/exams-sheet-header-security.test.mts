import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSheetHandler } from '../supabase/functions/mtm-btvn-sheet/handler';

const config = { databaseUrl: 'https://database.invalid', serviceKey: 'test-service', scriptToken: 'test-script-secret', ownerEmail: 'owner@example.invalid' };
let calls: Array<{ url: string; init?: RequestInit }> = [];
const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(input), init });
  return Response.json(String(input).includes('feedback_since') ? [] : 'Học sinh,Lớp\n"Dữ liệu thử","Lớp thử"');
};
const handler = createSheetHandler(config, fakeFetch as typeof fetch);
const req = (suffix: string, headers: Record<string, string> = {}) => new Request('https://edge.invalid/' + suffix, { headers });
for (const request of [req('?tab=diem'), req('?tab=diem&t=test-old-url-secret'), req('?tab=diem', { 'x-mtm-sheet-token': 'test-old-url-secret' }), req('?tab=diem&t=test-script-secret', { 'x-mtm-sheet-token': config.scriptToken })]) {
  assert.equal((await handler(request)).status, 403);
}
assert.equal(calls.length, 0, 'Yêu cầu không có header đúng không được gọi kho dữ liệu');
const response = await handler(req('?tab=hocsinh', { 'x-mtm-sheet-token': config.scriptToken }));
assert.equal(response.status, 200);
assert.equal(response.headers.get('cache-control'), 'no-store');
assert.match(await response.text(), /Dữ liệu thử/);
assert.equal(calls.length, 1);
assert.match(calls[0].url, /mtm_btvn_sheet_csv6$/);
assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { p_tab: 'hocsinh' });
assert.equal((await handler(req('?tab=not-a-tab', { 'x-mtm-sheet-token': config.scriptToken }))).status, 400);
assert.equal(calls.length, 1);
assert.equal((await createSheetHandler({ ...config, scriptToken: '' }, fakeFetch as typeof fetch)(req('?tab=diem', { 'x-mtm-sheet-token': config.scriptToken }))).status, 403);
assert.equal((await handler(new Request('https://edge.invalid/?tab=diem', { method: 'DELETE', headers: { 'x-mtm-sheet-token': config.scriptToken } }))).status, 405);
assert.equal((await createSheetHandler({ ...config, serviceKey: '' }, fakeFetch as typeof fetch)(req('?tab=diem', { 'x-mtm-sheet-token': config.scriptToken }))).status, 503);
const feedback = new Request('https://edge.invalid/', { method: 'POST', headers: { 'x-mtm-sheet-token': config.scriptToken }, body: JSON.stringify({ op: 'feedback', after: 0 }) });
assert.equal((await handler(feedback)).status, 200);
assert.match(calls.at(-1)!.url, /mtm_btvn_feedback_since$/);
const googleIdentity = createSheetHandler(config, (async (input: string | URL | Request) => String(input).includes('tokeninfo')
  ? Response.json({ iss: 'https://accounts.google.com', email_verified: 'true', email: config.ownerEmail, exp: Math.floor(Date.now() / 1000) + 300 })
  : Response.json([])) as typeof fetch);
assert.equal((await googleIdentity(new Request('https://edge.invalid/', { method: 'POST', headers: { Authorization: 'Bearer ' + 'x'.repeat(120) }, body: JSON.stringify({ op: 'feedback', after: 0 }) }))).status, 200);
assert.equal((await googleIdentity(new Request('https://edge.invalid/?tab=diem', { headers: { Authorization: 'Bearer ' + 'x'.repeat(120) } }))).status, 403, 'GET CSV chỉ nhận Script Properties header');
const badIdentity = createSheetHandler(config, (async () => { throw new Error('network unavailable'); }) as typeof fetch);
assert.equal((await badIdentity(new Request('https://edge.invalid/', { method: 'POST', headers: { Authorization: 'Bearer ' + 'x'.repeat(120) }, body: '{}' }))).status, 403);
assert.equal((await handler(new Request('https://edge.invalid/', { method: 'POST', headers: { 'x-mtm-sheet-token': config.scriptToken }, body: JSON.stringify({ op: 'feedback', after: -1 }) }))).status, 400);

const root = process.env.MTM_ROOT || process.cwd();
const script = readFileSync(join(root, 'supabase/functions/mtm-btvn-sheet/apps-script-csv.gs.txt'), 'utf8');
const logs: string[] = [];
const formulas: Array<{ row: number; col: number; formula: string }> = [];
const appCalls: Array<{ url: string; options: any }> = [];
const matrix = [['=IMPORTDATA("https://egljwujhgdapaxyrjskj.supabase.co/functions/v1/mtm-btvn-sheet?tab=diem&t=test-old-url-secret")', '=MTM_SHEET_CSV("hocsinh";1)', '=SUM(1;2)']];
const sheet = { getDataRange: () => ({ getFormulas: () => matrix }), getName: () => 'Tab thử', getRange: (row: number, col: number) => ({ getA1Notation: () => ['A1', 'B1', 'C1'][col - 1], setFormula: (formula: string) => formulas.push({ row, col, formula }) }) };
const context: any = {
  console: { log: (message: string) => logs.push(message) }, Date, encodeURIComponent,
  PropertiesService: { getScriptProperties: () => ({ getProperty: (key: string) => key === 'MTM_SHEET_SCRIPT_TOKEN' ? config.scriptToken : null }) },
  UrlFetchApp: { fetch: (url: string, options: any) => { appCalls.push({ url, options }); return { getResponseCode: () => 200, getContentText: () => 'Test,CSV' }; } },
  Utilities: { parseCsv: () => [['Test', 'CSV']] }, SpreadsheetApp: { getActive: () => ({ getSheets: () => [sheet] }) },
};
runInNewContext(script, context);
assert.equal(context.MTM_SHEET_CSV('diem', 1)[0][0], 'Test');
assert.equal(appCalls[0].url, 'https://egljwujhgdapaxyrjskj.supabase.co/functions/v1/mtm-btvn-sheet?tab=diem');
assert.equal(appCalls[0].options.headers['x-mtm-sheet-token'], config.scriptToken);
assert.equal(appCalls[0].options.followRedirects, false);
assert.throws(() => context.MTM_SHEET_CSV('unlisted', 1), /Tab không hợp lệ/);
assert.equal(appCalls.length, 1);
context.mtm_kiem_ke_csv();
assert.deepEqual(JSON.parse(logs[0]), [{ sheet: 'Tab thử', cell: 'A1', tab: 'diem', formula: '=MTM_SHEET_CSV("diem";1)' }]);
assert.ok(!logs[0].includes('test-old-url-secret'));
assert.ok(!logs[0].includes(config.scriptToken));
context.mtm_lam_moi_csv();
assert.equal(formulas.length, 1);
assert.equal(formulas[0].col, 2);
assert.match(formulas[0].formula, /^=MTM_SHEET_CSV\("hocsinh";\d+\)$/);
const migration = readFileSync(join(root, 'supabase/migrations-pending/202610180061_sheet_csv_guardian_minimum.sql'), 'utf8');
assert.ok(!migration.includes('mtm_hw_private.guardians'));
assert.ok(!migration.includes('Phụ huynh (Zalo)'));
assert.match(migration, /revoke all on function public\.mtm_btvn_sheet_csv6\(text\) from public,anon,authenticated/);
console.log('H3: header bắt buộc, URL cũ bị chặn, POST phản hồi giữ hoạt động, Script Properties và kiểm kê công thức không lộ mã.');
