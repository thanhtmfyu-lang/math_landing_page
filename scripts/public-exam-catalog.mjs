import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

export const MTM_PUBLIC_SOURCE = 'MTM sưu tầm và biên soạn';
const catalogId = '\0mtm:public-exam-catalog';
const solutionsId = '\0mtm:private-detailed-solutions';
const normalize = value => value.replaceAll('\\', '/');
const copy = value => JSON.parse(JSON.stringify(value));
const pick = (value, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => [key, copy(value[key])]));
const segmentFields = ['path', 'sha256', 'sourcePage', 'width', 'height', 'mtmAuthored', 'privateUnavailable'];
const segments = value => Array.isArray(value) ? value.map(item => pick(item, segmentFields)) : undefined;
const questionFields = ['id', 'kind', 'maxMillipoints', 'maxPoints', 'prompt', 'text', 'choices', 'statements', 'pointsByCorrectCount', 'mode', 'sourcePdfPage', 'convertedFrom'];
const examFields = ['id', 'grade', 'period', 'title', 'durationMinutes', 'sourceHash', 'questionCount', 'answerKeyVerified', 'rubricVerified', 'rubricVersion', 'publicationVerified', 'questionDisplayVerified', 'versionHash', 'answerKeyVersion', 'sourceComplete', 'sections', 'preAttemptNotice'];
const privateKeys = new Set(['answer', 'acceptedAnswers', 'solution', 'solutions', 'solutionBlocks', 'solutionInstructions', 'solutionPdf', 'solution_path', 'sourceUrl', 'shortRule']);

/** Input is a private, versioned source fixture. Only explicit question fields
 * enter browser code. A new source field is private until admitted here. */
export function publicExamCatalog(catalog) {
  if (!Array.isArray(catalog)) throw Error('Danh mục thi thử phải là một mảng.');
  return catalog.map(exam => {
    const out = {...pick(exam, examFields), responseMode: 'questions-only', serverGraded: true, sourceRef: MTM_PUBLIC_SOURCE};
    out.sourceMaterial = {title: MTM_PUBLIC_SOURCE, publisher: MTM_PUBLIC_SOURCE, version: `MTM ${String(exam.versionHash).slice(0, 12)}`, locator: `${exam.questionCount} câu`};
    if (exam.sourcePdf) out.sourcePdf = pick(exam.sourcePdf, ['url', 'verified', 'sha256', 'bytes', 'totalPages', 'questionPages']);
    if (exam.sourceInstructions) out.sourceInstructions = segments(exam.sourceInstructions);
    if (exam.mtmDocuments?.questions) out.mtmDocuments = {questions: pick(exam.mtmDocuments.questions, ['url', 'sha256'])};
    out.questions = exam.questions.map((question, index) => {
      const q = pick(question, questionFields);
      const locator = typeof question.sourceRef === 'string' ? question.sourceRef.replace(/https?:\/\/\S+/gi, '').trim() : '';
      q.sourceRef = locator || `Câu ${index + 1}`;
      if (question.sourceContent?.questions) q.sourceContent = {questions: segments(question.sourceContent.questions)};
      // Public input format is independent of the private short-answer rule.
      if (question.shortFormat) q.shortFormat = pick(question.shortFormat, ['mode', 'whitespace', 'unit', 'decimalPlaces']);
      return q;
    });
    assertPublicExamCatalog(out);
    return out;
  });
}

export function assertPublicExamCatalog(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (privateKeys.has(key)) throw Error(`Danh mục công khai chứa trường riêng: ${key}`);
    assertPublicExamCatalog(child);
  }
}

/** Resolve the two exact private JSON modules to virtual modules before Vite's
 * JSON and asset handling. Node regression tests continue using source fixtures;
 * both dev and production browser modules receive this question-only catalog. */
export function publicExamCatalogPlugin({root = process.cwd()} = {}) {
  const paths = new Map([
    [normalize(resolve(root, 'src/native/exams/catalog.json')), catalogId],
    [normalize(resolve(root, 'src/native/exams/detailed-solutions.json')), solutionsId],
  ]);
  return {
    name: 'mtm-public-exam-catalog',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (source === catalogId || source === solutionsId) return source;
      const requested = source.split('?')[0];
      if (!/(?:^|\/)(?:catalog|detailed-solutions)\.json$/.test(normalize(requested))) return null;
      const resolved = await this.resolve(source, importer, {skipSelf: true});
      if (!resolved) return null;
      const id = paths.get(normalize(resolved.id.split('?')[0]));
      if (!id) return null;
      if (source.includes('?') || resolved.id.includes('?')) throw Error('Không được xuất dữ liệu nguồn thi thử dưới dạng raw hoặc URL.');
      return id;
    },
    load(id) {
      if (id === solutionsId) return 'export default [];';
      if (id !== catalogId) return null;
      const source = JSON.parse(readFileSync(resolve(root, 'src/native/exams/catalog.json'), 'utf8'));
      return `export default ${JSON.stringify(publicExamCatalog(source))};`;
    },
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk' && Object.keys(item.modules).some(id => paths.has(normalize(id.split('?')[0])))) {
          this.error('Gói trình duyệt còn nhập dữ liệu đáp án thi thử nguồn.');
        }
      }
    },
  };
}
