import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {build} from 'vite';
import {publicExamCatalog, publicExamCatalogPlugin, assertPublicExamCatalog, MTM_PUBLIC_SOURCE} from '../scripts/public-exam-catalog.mjs';
import {suite} from './exams-harness.mts';

const {test, finish} = suite('PUBLIC-CATALOG-');
const root = process.env.MTM_ROOT ?? process.cwd();
const raw = JSON.parse(readFileSync(join(root, 'src/native/exams/catalog.json'), 'utf8'));
const before = JSON.stringify(raw);
const sanitized = publicExamCatalog(raw);
test('Giữ toàn bộ câu hỏi và phiên bản nhưng loại mọi khóa, lời giải và URL nguồn', () => {
  assert.equal(sanitized.length, raw.length);
  sanitized.forEach((exam, i) => {
    assert.equal(exam.id, raw[i].id);
    assert.equal(exam.versionHash, raw[i].versionHash);
    assert.equal(exam.questions.length, raw[i].questions.length);
    assert.equal(exam.responseMode, 'questions-only');
    assert.equal(exam.serverGraded, true);
    assert.equal(exam.sourceRef, MTM_PUBLIC_SOURCE);
    assert.equal(exam.sourceMaterial.publisher, MTM_PUBLIC_SOURCE);
    assert.deepEqual(exam.sourcePdf, raw[i].sourcePdf);
    assertPublicExamCatalog(exam);
  });
  assert.equal(JSON.stringify(raw), before, 'Không sửa dữ liệu nguồn để làm test đạt.');
});

test('Không sao chép trường lạ và loại nội dung riêng ở mọi phần lồng nhau', () => {
  const input = structuredClone(raw[0]);
  input.secretMetadata = 'PRIVATE_UNKNOWN_METADATA';
  input.sourceInstructions = [{path:'questions.png', sha256:'a'.repeat(64), sourcePage:1, width:100, height:100, solution:'PRIVATE_SEGMENT_KEY'}];
  input.solutionInstructions = [{path:'PRIVATE_SOLUTION.png'}];
  input.mtmDocuments = {questions:{url:'/question.pdf',sha256:'a'.repeat(64)},solutions:{url:'/PRIVATE_SOLUTION.pdf',sha256:'b'.repeat(64)}};
  input.questions[0].solutionBlocks = [{type:'text',text:'PRIVATE_BLOCK'}];
  input.questions[0].sourceContent = {questions:input.sourceInstructions,solutions:input.solutionInstructions};
  input.questions[0].sourceRef = 'https://example.invalid/PRIVATE_SOURCE.pdf';
  input.questions[0].unknownNested = {answer:'PRIVATE_NESTED_KEY'};
  const publicExam = publicExamCatalog([input])[0];
  const json = JSON.stringify(publicExam);
  assert.doesNotMatch(json, /PRIVATE_|example\.invalid/);
  assert.equal(publicExam.questions[0].sourceRef, 'Câu 1');
  assert.deepEqual(publicExam.mtmDocuments, {questions:input.mtmDocuments.questions});
  assertPublicExamCatalog(publicExam);
});

test('Gate công khai từ chối khóa kể cả khi bị thêm sâu trong JSON', () => {
  assert.throws(() => assertPublicExamCatalog({questions:[{sourceContent:{questions:[{acceptedAnswers:['C']}]}}]}), /acceptedAnswers/);
});

// Build the exact source JSON imports through Vite, independently of UI/runtime
// fixtures. This catches an absent resolver and a leaked lazy detailed bank.
const plugin = publicExamCatalogPlugin({root});
const result = await build({configFile:false, root, logLevel:'silent', plugins:[plugin], build:{write:false, minify:false, rollupOptions:{input:join(root,'src/native/exams/catalog.json'), preserveEntrySignatures:'strict',output:{format:'es'}}}});
const outputs = Array.isArray(result) ? result.flatMap(r=>r.output) : 'output' in result ? result.output : [];
const js = outputs.filter(item=>item.type==='chunk').map(item=>item.code).join('\n');
test('Vite build thực chỉ chứa catalog câu hỏi, không đóng gói catalog nguồn', () => {
  assert.match(js, /questions-only/);
  assert.match(js, /serverGraded/);
  assert.doesNotMatch(js, /acceptedAnswers|sourceUrl|solutionBlocks|solutionInstructions/);
  for (const exam of raw) {
    assert.ok(!js.includes(exam.sourceUrl), 'Không xuất URL nguồn của đề.');
    for (const q of exam.questions) if (q.solution?.length > 15) assert.ok(!js.includes(JSON.stringify(q.solution).slice(1,-1)), 'Không xuất lời giải nguồn.');
  }
  assert.ok(!outputs.some(item=>item.type==='chunk'&&Object.keys(item.modules).some(id=>id.replaceAll('\\','/').endsWith('/src/native/exams/catalog.json'))));
});

const detailed = await build({configFile:false,root,logLevel:'silent',plugins:[publicExamCatalogPlugin({root})],build:{write:false,minify:false,rollupOptions:{input:join(root,'src/native/exams/detailed-solutions.json'),preserveEntrySignatures:'strict',output:{format:'es'}}}});
const detailedOutputs = Array.isArray(detailed) ? detailed.flatMap(r=>r.output) : 'output' in detailed ? detailed.output : [];
test('Lazy module lời giải được thay bằng mảng rỗng trước khi xuất trình duyệt', () => {
  const text = detailedOutputs.filter(item=>item.type==='chunk').map(item=>item.code).join('\n');
  assert.doesNotMatch(text, /examId|versionHash|blocks|answer/);
  assert.match(text, /\[\]/);
});

for (const query of ['raw','url']) {
  let rejected = false;
  const entry = '\0mtm-public-catalog-bypass-test';
  try {
    await build({configFile:false,root,logLevel:'silent',plugins:[publicExamCatalogPlugin({root}),{
      name:'mtm-public-catalog-bypass-test',
      resolveId(id){return id===entry?id:null;},
      load(id){return id===entry?`import data from ${JSON.stringify(join(root,'src/native/exams/catalog.json').replaceAll('\\','/')+'?'+query)}; export default data;`:null;},
    }],build:{write:false,rollupOptions:{input:entry,preserveEntrySignatures:'strict',output:{format:'es'}}}});
  } catch (error) { rejected = /raw hoặc URL/.test(String(error)); }
  test(`Chặn nhập catalog nguồn bằng ?${query}`, () => assert.equal(rejected, true));
}

test('Cấu hình phát hành sử dụng plugin bảo vệ catalog', () => {
  const config = readFileSync(join(root,'vite.config.ts'),'utf8');
  assert.match(config, /plugins:\s*\[publicExamCatalogPlugin\(\)/);
});
finish({catalogCount: sanitized.length, browserCatalogQuestionOnly:true});
