import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {applySupabaseQuery} from '../scripts/apply-supabase-query.mjs';

const sent: any[] = [];
const fixture = {projectRef: 'a'.repeat(20), token: 'fixture-only', sql: 'select private_setup();'};
for (const status of [200, 400, 500]) {
  const result = await applySupabaseQuery(fixture, async (_url: any, init: any) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({pin: 'fixture-pin-must-not-leak', message: 'fixture-provider-detail'}), {status});
  });
  assert.deepEqual(result, {ok: status === 200, status});
  assert.doesNotMatch(JSON.stringify(result), /pin|provider-detail/);
}
assert.deepEqual(await applySupabaseQuery(fixture, async () => {throw Error('fixture-sensitive-transport-error');}), {ok: false, status: null});
assert.deepEqual(sent[0], {query: fixture.sql});
const workflow = readFileSync(join(process.env.MTM_ROOT!, '.github/workflows/ap-supabase.yml'), 'utf8');
assert.match(workflow, /node scripts\/apply-supabase-query\.mjs/);
assert.doesNotMatch(workflow, /jq -r '\.message|tail -5 \/tmp\/deploy\.log/);
console.log('SQL response bodies and transport errors cannot enter public workflow logs.');
