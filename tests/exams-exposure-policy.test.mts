import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHsaRankApi} from '../server/hsa/api';
import {isExposedExam} from '../server/exam-security/exposure';

const root = process.env.MTM_ROOT!;
const policy = JSON.parse(readFileSync(join(root, 'server/exam-security/exposed-exams.json'), 'utf8'));
assert.equal(new Set(policy.practiceOnly).size, policy.practiceOnly.length);
assert.ok(policy.practiceOnly.length >= 11);
assert.equal(isExposedExam('mtm-hsa-thi-thu-01'), true);
assert.equal(isExposedExam('new-private-fixture'), false);
let called = false;
const api = createHsaRankApi(() => ({MTM_HSA_RANK_ENABLED: '1'}), async () => {called = true; throw Error('must not reach database');});
async function invoke(req: any) {
  let status = 0, body: any;
  await api(req, {setHeader() {}, status(n: number) {status = n; return {json(v: any) {body = v;}};}});
  return {status, body};
}
const get = await invoke({method: 'GET', query: {de: 'mtm-hsa-thi-thu-01'}});
assert.equal(get.status, 200);
assert.equal(get.body.practiceOnly, true);
assert.deepEqual(get.body.rows, []);
assert.equal(called, false);
const post = await invoke({method: 'POST', headers: {origin: 'https://minhthanhmath.vn', host: 'minhthanhmath.vn'}, body: {
  de: 'mtm-hsa-thi-thu-01', attemptId: '0f8fad5b-d9cb-469f-a165-70867728950e', attemptToken: 'a'.repeat(64), name: 'Test User', grade: '12', device: 'b'.repeat(32),
}});
assert.equal(post.status, 200);
assert.equal(post.body.practiceOnly, true);
assert.equal(post.body.status, 'closed');
assert.equal(called, false);
const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
assert.equal(config.git.deploymentEnabled['codex/web-v13-*'], false);
console.log('Exposure policy: GET/POST fail closed before RPC; private exams unaffected.');
