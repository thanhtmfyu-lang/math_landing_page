import assert from 'node:assert/strict';
import { isBtvnBotCatalog, btvnBotCatalog } from '../supabase/functions/mtm-diem-danh/btvn-bot-catalog';

// Chỉ dùng dữ liệu giả và fetch mock; không gọi mạng hoặc đọc dữ liệu học sinh.
const db = {url: 'https://qa.invalid', key: 'qa-key'};
const p = {action: 'btvn_bot_catalog'};
const catalog = {
  ok: true,
  read_only: true,
  checked_at: '2026-10-30T08:00:00Z',
  source: 'qa-fixture',
  window_from: '2026-10-29T00:00:00Z',
  window_to: '2026-10-31T00:00:00Z',
  lessons: [{
    lesson_code: 'QA-LESSON-001',
    class_name: 'QA-CLASS',
    lesson_date: '2026-10-30',
    title: 'Bài học giả lập',
    opens_at: '2026-10-30T07:00:00Z',
    expected_due_at: '2026-10-30T14:00:00Z',
    closes_at: '2026-10-30T15:00:00Z',
    updated_at: '2026-10-30T06:00:00Z',
  }],
};
const raw = JSON.stringify(catalog, null, 2);
const calls: {url: string; init: RequestInit}[] = [];
const ok = (async (url: RequestInfo | URL, init?: RequestInit) => {
  calls.push({url: String(url), init: init!});
  return new Response(raw);
}) as typeof fetch;

assert.equal(isBtvnBotCatalog(p), true);
const r = await btvnBotCatalog(p, db, ok);
assert.equal(r.status, 200);
assert.equal(r.headers.get('Content-Type'), 'application/json; charset=utf-8');
const returned = await r.text();
assert.equal(returned, raw, 'giữ nguyên JSON từ RPC');
assert.deepEqual(JSON.parse(returned), catalog);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, 'https://qa.invalid/rest/v1/rpc/mtm_btvn_bot_catalog');
assert.equal(calls[0].init.method, 'POST');
assert.deepEqual(JSON.parse(String(calls[0].init.body)), {p});
const headers = new Headers(calls[0].init.headers);
assert.equal(headers.get('apikey'), db.key);
assert.equal(headers.get('Authorization'), `Bearer ${db.key}`);
assert.equal(headers.get('Content-Type'), 'application/json');

for (const other of [null, undefined, 'btvn_bot_catalog', 1, [], {}, {action: 'find'}, {action: 'link_buoi_hoc'}, {action: 'BTVN_BOT_CATALOG'}]) {
  assert.equal(isBtvnBotCatalog(other), false);
}

for (const status of [400, 404, 500, 503]) {
  const error = JSON.stringify({message: 'qa-rpc-error', status});
  const down = await btvnBotCatalog(p, db, (async () => new Response(error, {status})) as typeof fetch);
  assert.equal(down.status, 502);
  assert.equal(await down.text(), error, 'giữ nguyên JSON lỗi từ RPC');
}
console.log(JSON.stringify({suite: 'DD-BTVN-BOT-CATALOG', total: 3, passed: 3, failed: 0}));
