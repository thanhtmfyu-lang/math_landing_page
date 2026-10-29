// src/native/exams/mtm-scoring.ts
var MTM_SCORING_VERSION = "MTM-EQUAL-QUESTION-10-20261016-v1";
var record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var text = (v) => typeof v === "string" && !!v.trim();
var own = (v, key) => Object.hasOwn(v, key);
var TYPES = ["TN", "DS", "TLN", "UNKNOWN"];
var lockedAttempts = /* @__PURE__ */ new WeakSet();
var DS_WEIGHTS = [[0n, 1n], [1n, 10n], [1n, 4n], [1n, 2n], [1n, 1n]];
var issue = (code, message, questionId) => questionId === void 0 ? { code, message } : { code, message, questionId };
function copyJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return Array.from(value, (x) => x === void 0 ? null : copyJson(x));
  if (record(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return Object.fromEntries(Object.entries(value).filter(([, x]) => x !== void 0).map(([key, x]) => [key, copyJson(x)]));
  }
  throw new TypeError("\u0110\u1EA7u v\xE0o ph\u1EA3i l\xE0 d\u1EEF li\u1EC7u JSON h\u1EEFu h\u1EA1n, kh\xF4ng ch\u1EE9a h\xE0m ho\u1EB7c \u0111\u1ED1i t\u01B0\u1EE3ng \u0111\u1EB7c bi\u1EC7t.");
}
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (record(value)) return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
function gcd(a, b) {
  a = a < 0n ? -a : a;
  while (b) [a, b] = [b, a % b];
  return a;
}
function mtmFraction(n, d = 1n) {
  if (d === 0n) throw new RangeError("M\u1EABu s\u1ED1 ph\u1EA3i kh\xE1c 0.");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return Object.freeze({ numerator: String(n / g), denominator: String(d / g) });
}
var ZERO = mtmFraction(0n);
var TEN = mtmFraction(10n);
var add = (a, b) => mtmFraction(
  BigInt(a.numerator) * BigInt(b.denominator) + BigInt(b.numerator) * BigInt(a.denominator),
  BigInt(a.denominator) * BigInt(b.denominator)
);
var multiply = (a, n, d = 1n) => mtmFraction(BigInt(a.numerator) * n, BigInt(a.denominator) * d);
function roundMtmTotal(value) {
  const n = BigInt(value.numerator), d = BigInt(value.denominator);
  if (d <= 0n) throw new RangeError("M\u1EABu s\u1ED1 ph\u1EA3i d\u01B0\u01A1ng.");
  const absolute = n < 0n ? -n : n;
  const cents = (absolute * 200n + d) / (2n * d);
  return (n < 0n && cents ? "-" : "") + String(cents / 100n) + "." + String(cents % 100n).padStart(2, "0");
}
function decimal(value) {
  if (value.length > 1024 || !/^[+-]?\d+(?:[.,]\d+)?$/.test(value)) return null;
  const [whole, part = ""] = value.replace(/^[+-]/, "").replace(",", ".").split(".");
  return mtmFraction(BigInt(whole + part) * (value.startsWith("-") ? -1n : 1n), 10n ** BigInt(part.length));
}
function normalizeMtmShort(value, rule) {
  if (typeof value !== "string" || value.length > 1024) return null;
  let raw = value.trim();
  if (rule.whitespace === "collapse") raw = raw.replace(/\s+/gu, " ");
  if (rule.unit !== void 0) {
    if (!raw.endsWith(rule.unit)) return null;
    const unitStart = raw.length - rule.unit.length;
    if (unitStart > 0 && !/\s/u.test(raw[unitStart - 1])) return null;
    raw = raw.slice(0, -rule.unit.length).trim();
  }
  if (!raw) return null;
  if (rule.decimalPlaces !== void 0) {
    const places = rule.decimalPlaces;
    if (!(places === 0 ? /^[+-]?\d+$/ : new RegExp("^[+-]?\\d+[.,]\\d{" + places + "}$")).test(raw)) return null;
  }
  if (rule.mode === "exact") return raw;
  let number;
  if (rule.mode === "rational" && /^[+-]?\d+\/[+-]?\d+$/.test(raw)) {
    const [n, d] = raw.split("/").map(BigInt);
    number = d === 0n ? null : mtmFraction(n, d);
  } else number = decimal(raw);
  return number === null ? null : number.numerator + "/" + number.denominator;
}
function labelledLines(prompt, alphabet) {
  const matches = [...prompt.matchAll(new RegExp("(?:^|\\n)\\s*([" + alphabet + "])[).:]\\s+([^\\n]+)", "g"))];
  return { values: matches.map((m) => m[2]), validLabels: matches.map((m) => m[1]).join("") === alphabet.slice(0, matches.length) };
}
function contentType(q) {
  const contents = [q.prompt, q.text].filter((value) => typeof value === "string");
  const parsedChoices = contents.map((value) => labelledLines(value, "ABCDEFGHIJKLMNOPQRSTUVWXYZ"));
  const parsedStatements = contents.map((value) => labelledLines(value, "abcdefghijklmnopqrstuvwxyz"));
  const inlineChoices = parsedChoices.find((part) => part.values.length) ?? { values: [], validLabels: true };
  const inlineStatements = parsedStatements.find((part) => part.values.length) ?? { values: [], validLabels: true };
  const choices2 = Array.isArray(q.choices) ? q.choices : inlineChoices.values;
  const statements = Array.isArray(q.statements) ? q.statements : inlineStatements.values;
  const tn = own(q, "choices") || inlineChoices.values.length > 0;
  const ds = own(q, "statements") || inlineStatements.values.length > 0;
  const tln = own(q, "shortRule") || q.responseFormat === "short" || contents.some((value) => /(?:^|[^\p{L}\p{N}_])(?:trả lời ngắn|điền (?:đáp án|kết quả))(?![\p{L}\p{N}_])/iu.test(value));
  const candidates = [tn ? "TN" : "", ds ? "DS" : "", tln ? "TLN" : ""].filter(Boolean);
  const conflict = parsedChoices.some((part) => !part.validLabels || part.values.length > 0 && part.values.length !== choices2.length) || parsedStatements.some((part) => !part.validLabels || part.values.length > 0 && part.values.length !== statements.length);
  return {
    type: candidates.length === 1 ? candidates[0] : "UNKNOWN",
    conflict,
    choices: choices2,
    statements
  };
}
var ruleDescriptions = {
  TN: "M\u1ED9t \u0111\xE1p \xE1n kh\u1EDBp kh\xF3a: p; sai, tr\u1ED1ng ho\u1EB7c nhi\u1EC1u l\u1EF1a ch\u1ECDn: 0.",
  DS: "k l\xE0 s\u1ED1 \xFD kh\u1EDBp kh\xF3a; h\u1EC7 s\u1ED1 k=0..4: 0; 1/10; 1/4; 1/2; 1. \xDD tr\u1ED1ng kh\xF4ng kh\u1EDBp.",
  TLN: "Kh\u1EDBp danh s\xE1ch theo shortRule \u0111\xE3 x\xE1c minh: p; sai ho\u1EB7c tr\u1ED1ng: 0. Kh\xF4ng dung sai t\u1EF1 \u0111\u1EB7t.",
  UNKNOWN: "Ch\u01B0a x\xE1c \u0111\u1ECBnh \u0111\u01B0\u1EE3c lo\u1EA1i c\xE2u t\u1EEB c\u1EA5u tr\xFAc v\xE0 n\u1ED9i dung; c\u1EA7n ki\u1EC3m."
};
function compile(source) {
  for (const key of ["examId", "examVersion", "answerKeyVersion", "sourceRef"]) {
    if (!text(source[key])) throw new TypeError("Thi\u1EBFu \u0111\u1ECBnh danh b\u1EAFt bu\u1ED9c: " + key);
  }
  if (!Array.isArray(source.questions)) throw new TypeError("questions ph\u1EA3i l\xE0 danh s\xE1ch c\xE2u l\u1EDBn.");
  if (source.rubricVersion !== void 0 && source.rubricVersion !== MTM_SCORING_VERSION)
    throw new TypeError("Kh\xF4ng h\u1ED7 tr\u1EE3 phi\xEAn b\u1EA3n thang ch\u1EA5m n\xE0y.");
  const versions = {
    examId: source.examId,
    examVersion: source.examVersion,
    answerKeyVersion: source.answerKeyVersion,
    rubricVersion: MTM_SCORING_VERSION
  };
  const issues = [];
  if (source.sourceComplete !== true) issues.push(issue("SOURCE_INCOMPLETE", "Ch\u01B0a x\xE1c minh \u0111\u1EE7 trang v\xE0 \u0111\u1EE7 c\xE2u ngu\u1ED3n."));
  if (source.answerKeyVerified !== true) issues.push(issue("KEY_UNVERIFIED", "Kh\xF3a \u0111\xE1p \xE1n ch\u01B0a \u0111\u01B0\u1EE3c x\xE1c minh."));
  if (source.issues !== void 0) {
    if (!Array.isArray(source.issues) || !source.issues.every(text)) issues.push(issue("INVALID_ISSUES", "Danh s\xE1ch l\u1ED7i ngu\u1ED3n kh\xF4ng h\u1EE3p l\u1EC7."));
    else source.issues.forEach((reason) => issues.push(issue("SOURCE_REVIEW", reason)));
  }
  const N = source.questions.length, p = N ? mtmFraction(10n, BigInt(N)) : null;
  if (!N) issues.push(issue("EMPTY_EXAM", "\u0110\u1EC1 r\u1ED7ng, ch\u01B0a c\xF3 c\xE2u \u0111\u1EC3 ph\xE2n b\u1ED5 \u0111i\u1EC3m."));
  const counts = { TN: 0, DS: 0, TLN: 0, UNKNOWN: 0 };
  const questions = Array.from(source.questions, (raw, index) => {
    const id = "mtm:" + encodeURIComponent(versions.examId) + ":" + encodeURIComponent(versions.examVersion) + ":" + (index + 1);
    const q = record(raw) ? raw : {};
    const found = contentType(q), errors = [];
    const fail = (code, message) => errors.push(issue(code, message, id));
    counts[found.type]++;
    if (found.type === "UNKNOWN") fail("AMBIGUOUS_TYPE", "N\u1ED9i dung/c\u1EA5u tr\xFAc thi\u1EBFu b\u1EB1ng ch\u1EE9ng ho\u1EB7c ch\u1EE9a nhi\u1EC1u lo\u1EA1i c\xE2u m\xE2u thu\u1EABn.");
    if (found.conflict || q.sourceStructureConflict === true) fail("SOURCE_STRUCTURE_CONFLICT", "N\u1ED9i dung, s\u1ED1 \xFD/ph\u01B0\u01A1ng \xE1n ho\u1EB7c th\u1EE9 t\u1EF1 nh\xE3n kh\xF4ng kh\u1EDBp d\u1EEF li\u1EC7u c\xE2u.");
    const hinted = { mc: "TN", tf: "DS", short: "TLN", TN: "TN", DS: "DS", TLN: "TLN" }[String(q.kind)];
    if (q.kind !== void 0 && (hinted === void 0 || hinted !== found.type))
      fail("TYPE_CONFLICT", "Nh\xE3n lo\u1EA1i c\xE2u kh\xF4ng kh\u1EDBp c\u1EA5u tr\xFAc nh\u1EADn di\u1EC7n, c\u1EA7n ki\u1EC3m ngu\u1ED3n.");
    const content = q.sourceContent;
    const hasSourceContent = record(content) && Array.isArray(content.questions) && content.questions.length > 0 && Array.from(content.questions).every((segment) => record(segment) && (text(segment.path) || text(segment.text)));
    if (!text(q.prompt) && !text(q.text) && !hasSourceContent)
      fail("CONTENT_MISSING", "Thi\u1EBFu n\u1ED9i dung c\xE2u ho\u1EB7c tham chi\u1EBFu c\xE1c m\u1EA3nh n\u1ED9i dung ngu\u1ED3n.");
    if (q.answerConflict === true) fail("KEY_CONFLICT", "\u0110\xE1p \xE1n \u0111\u01B0\u1EE3c \u0111\xE1nh d\u1EA5u m\xE2u thu\u1EABn.");
    if (q.answerVerified === false || source.answerKeyVerified !== true)
      fail("KEY_UNVERIFIED", "\u0110\xE1p \xE1n c\xE2u ch\u01B0a \u0111\u01B0\u1EE3c x\xE1c minh.");
    if (q.issues !== void 0) {
      if (!Array.isArray(q.issues) || !q.issues.every(text)) fail("INVALID_ISSUES", "Danh s\xE1ch l\u1ED7i c\xE2u kh\xF4ng h\u1EE3p l\u1EC7.");
      else q.issues.forEach((reason) => fail("QUESTION_REVIEW", reason));
    }
    if (found.type === "TN") {
      if (own(q, "choices") && !Array.isArray(q.choices) || found.choices.length < 2 || found.choices.length > 26 || !Array.from(found.choices).every(text) || new Set(found.choices).size !== found.choices.length)
        fail("TN_CHOICES", "TN c\u1EA7n c\xE1c ph\u01B0\u01A1ng \xE1n ph\xE2n bi\u1EC7t, kh\xF4ng r\u1ED7ng, t\u1EEB 2 \u0111\u1EBFn 26 ph\u01B0\u01A1ng \xE1n.");
      if (typeof q.answer !== "string" || !/^[A-Z]$/.test(q.answer) || q.answer.charCodeAt(0) - 65 >= found.choices.length)
        fail("TN_KEY", "Thi\u1EBFu ho\u1EB7c sai kh\xF3a m\u1ED9t \u0111\xE1p \xE1n TN.");
      if (own(q, "acceptedAnswers")) fail("KEY_CONFLICT", "TN ch\u1EE9a th\xEAm kh\xF3a tr\u1EA3 l\u1EDDi ng\u1EAFn.");
    } else if (found.type === "DS") {
      if (own(q, "statements") && !Array.isArray(q.statements) || found.statements.length !== 4 || !Array.from(found.statements).every(text))
        fail("DS_STATEMENTS", "DS ph\u1EA3i c\xF3 \u0111\xFAng b\u1ED1n \xFD a, b, c, d c\xF3 n\u1ED9i dung.");
      if (!Array.isArray(q.answer) || q.answer.length !== 4 || !Array.from(q.answer).every((v) => typeof v === "boolean"))
        fail("DS_KEY", "DS c\u1EA7n \u0111\xFAng b\u1ED1n \u0111\xE1p \xE1n boolean \u0111\xE3 x\xE1c minh.");
      if (own(q, "acceptedAnswers")) fail("KEY_CONFLICT", "DS ch\u1EE9a th\xEAm kh\xF3a tr\u1EA3 l\u1EDDi ng\u1EAFn.");
    } else if (found.type === "TLN") {
      const r = q.shortRule;
      if (!record(r) || Object.keys(r).some((key) => !["verified", "evidence", "mode", "whitespace", "unit", "decimalPlaces"].includes(key)) || r.verified !== true || !text(r.evidence) || !["exact", "decimal", "rational"].includes(String(r.mode)) || r.whitespace !== void 0 && !["trim", "collapse"].includes(String(r.whitespace)) || r.unit !== void 0 && (!text(r.unit) || r.unit !== r.unit.trim()) || r.decimalPlaces !== void 0 && (r.mode !== "decimal" || !Number.isSafeInteger(r.decimalPlaces) || r.decimalPlaces < 0 || r.decimalPlaces > 100)) {
        fail("TLN_RULE", "Thi\u1EBFu quy t\u1EAFc ch\u1EA5p nh\u1EADn TLN \u0111\xE3 x\xE1c minh ho\u1EB7c quy t\u1EAFc \u0111\u1ECBnh d\u1EA1ng kh\xF4ng h\u1EE3p l\u1EC7.");
      } else if (!Array.isArray(q.acceptedAnswers) || !q.acceptedAnswers.length || !Array.from(q.acceptedAnswers).every((a) => text(a) && normalizeMtmShort(a, r) !== null)) {
        fail("TLN_KEY", "Thi\u1EBFu \u0111\xE1p \xE1n TLN ho\u1EB7c \u0111\xE1p \xE1n vi ph\u1EA1m quy t\u1EAFc \u0111\u01A1n v\u1ECB/\u0111\u1ECBnh d\u1EA1ng \u0111\xE3 ch\u1ED1t.");
      }
      if (own(q, "answer")) fail("KEY_CONFLICT", "TLN c\xF3 kh\xF3a answer ri\xEAng ngo\xE0i acceptedAnswers, c\u1EA7n \u0111\u1ED1i chi\u1EBFu.");
    }
    return {
      id,
      type: found.type,
      source: raw,
      sourceRef: text(q.sourceRef) ? q.sourceRef : source.sourceRef,
      maxScore: p,
      rule: ruleDescriptions[found.type],
      issues: errors,
      choices: found.choices,
      statements: found.statements
    };
  });
  return freeze({
    versions,
    source,
    counts,
    N,
    structure: N && !counts.UNKNOWN ? TYPES.filter((t) => t !== "UNKNOWN" && counts[t]).join("+") : null,
    allocationProvisional: source.sourceComplete !== true || counts.UNKNOWN > 0,
    pointsPerQuestion: p,
    maxTotal: N ? TEN : ZERO,
    sections: TYPES.filter((type) => counts[type]).map((type) => ({ type, count: counts[type], maxScore: multiply(p, BigInt(counts[type])) })),
    questions,
    dsTable: p ? DS_WEIGHTS.map(([n, d]) => multiply(p, n, d)) : [],
    issues
  });
}
var MtmScoringCatalog = class {
  exams = /* @__PURE__ */ new Map();
  keys = /* @__PURE__ */ new Map();
  prepare(input) {
    const source = copyJson(input);
    if (!record(source)) throw new TypeError("\u0110\u1EC1 ph\u1EA3i l\xE0 \u0111\u1ED1i t\u01B0\u1EE3ng JSON.");
    const snapshot = compile(source);
    const examKey = JSON.stringify([snapshot.versions.examId, snapshot.versions.examVersion]);
    const answerKey = JSON.stringify([snapshot.versions.examId, snapshot.versions.answerKeyVersion]);
    const answerFields = /* @__PURE__ */ new Set(["answer", "acceptedAnswers", "shortRule", "answerVerified", "answerConflict"]);
    const examContent = Object.fromEntries(Object.entries(source).filter(([k]) => !["answerKeyVersion", "answerKeyVerified", "rubricVersion", "questions"].includes(k)));
    examContent.questions = source.questions.map((q) => record(q) ? Object.fromEntries(Object.entries(q).filter(([k]) => !answerFields.has(k))) : q);
    const keyContent = {
      answerKeyVerified: source.answerKeyVerified ?? null,
      questions: source.questions.map((q) => record(q) ? Object.fromEntries(Object.entries(q).filter(([k]) => answerFields.has(k))) : null)
    };
    const examLock = canonical(examContent), keyLock = canonical(keyContent);
    if (this.exams.has(examKey) && this.exams.get(examKey) !== examLock)
      throw new Error("N\u1ED9i dung ho\u1EB7c s\u1ED1 c\xE2u \u0111\xE3 \u0111\u1ED5i, ph\u1EA3i t\u1EA1o examVersion m\u1EDBi.");
    if (this.keys.has(answerKey) && this.keys.get(answerKey) !== keyLock)
      throw new Error("\u0110\xE1p \xE1n ho\u1EB7c quy t\u1EAFc ch\u1EA5p nh\u1EADn \u0111\xE3 \u0111\u1ED5i, ph\u1EA3i t\u1EA1o answerKeyVersion m\u1EDBi.");
    this.exams.set(examKey, examLock);
    this.keys.set(answerKey, keyLock);
    return snapshot;
  }
};
function lockMtmAttempt(exam, attemptId) {
  if (!text(attemptId)) throw new TypeError("Thi\u1EBFu m\xE3 l\u01B0\u1EE3t l\xE0m b\xE0i.");
  const locked = new MtmScoringCatalog().prepare(exam.source);
  if (canonical(copyJson(locked)) !== canonical(copyJson(exam))) throw new Error("Snapshot \u0111\u1EC1 kh\xF4ng nh\u1EA5t qu\xE1n.");
  const attempt = freeze({ attemptId, exam: locked });
  lockedAttempts.add(attempt);
  return attempt;
}
function scoreMtmAttempt(attempt, answers) {
  if (!lockedAttempts.has(attempt)) throw new TypeError("C\u1EA7n kh\xF3a ho\u1EB7c kh\xF4i ph\u1EE5c l\u01B0\u1EE3t h\u1EE3p l\u1EC7 tr\u01B0\u1EDBc khi ch\u1EA5m.");
  const exam = attempt.exam;
  const pending = [...exam.issues];
  let submitted = {};
  const invalidSubmission = !record(answers);
  if (invalidSubmission) pending.push(issue("SUBMISSION_FORMAT", "B\xE0i l\xE0m ph\u1EA3i l\xE0 b\u1EA3ng \u0111\xE1p \xE1n theo ID c\xE2u."));
  else submitted = answers;
  const known = new Set(exam.questions.map((q) => q.id));
  for (const id of Object.keys(submitted)) if (!known.has(id)) pending.push(issue("UNKNOWN_RESPONSE", "B\xE0i l\xE0m c\xF3 ID kh\xF4ng thu\u1ED9c phi\xEAn b\u1EA3n \u0111\u1EC1 \u0111\xE3 kh\xF3a.", id));
  const rows = exam.questions.map((q) => {
    const errors = [...q.issues];
    const fail = (code, message) => errors.push(issue(code, message, q.id));
    if (invalidSubmission) fail("SUBMISSION_FORMAT", "Ch\u01B0a \u0111\u1ECDc \u0111\u01B0\u1EE3c b\u1EA3ng b\xE0i l\xE0m, kh\xF4ng th\u1EC3 coi c\xE2u n\xE0y l\xE0 sai ho\u1EB7c b\u1ECF tr\u1ED1ng.");
    const answer = own(submitted, q.id) ? submitted[q.id] : void 0;
    const blank = answer === void 0 || answer === null || typeof answer === "string" && !answer.trim();
    let earned = ZERO, correctCount = null;
    if (!errors.length && !blank) {
      const source = q.source;
      if (q.type === "TN") {
        const choice = Array.isArray(answer) && answer.length === 1 ? answer[0] : answer;
        earned = typeof choice === "string" && choice === source.answer ? q.maxScore : ZERO;
      } else if (q.type === "DS") {
        if (!Array.isArray(answer) || answer.length > 4 || !Array.from(answer).every((x) => x === null || x === void 0 || typeof x === "boolean"))
          fail("DS_RESPONSE", "B\xE0i l\xE0m DS ph\u1EA3i c\xF3 t\u1ED1i \u0111a b\u1ED1n gi\xE1 tr\u1ECB boolean ho\u1EB7c \xFD b\u1ECF tr\u1ED1ng.");
        else {
          const key = source.answer;
          correctCount = Array.from({ length: 4 }, (_, i) => typeof answer[i] === "boolean" && answer[i] === key[i]).filter(Boolean).length;
          earned = exam.dsTable[correctCount];
        }
      } else if (q.type === "TLN") {
        if (typeof answer !== "string") fail("TLN_RESPONSE", "B\xE0i l\xE0m TLN ph\u1EA3i l\xE0 v\u0103n b\u1EA3n.");
        else {
          const rule = source.shortRule;
          const normalized = normalizeMtmShort(answer, rule);
          earned = normalized !== null && source.acceptedAnswers.some((a) => normalizeMtmShort(a, rule) === normalized) ? q.maxScore : ZERO;
        }
      }
    } else if (!errors.length && q.type === "DS") correctCount = 0;
    pending.push(...errors);
    return {
      id: q.id,
      type: q.type,
      status: errors.length ? "ungradable" : "graded",
      earned: errors.length ? null : earned,
      maxScore: q.maxScore,
      correctCount,
      issues: errors
    };
  });
  const rawTotal = rows.reduce((sum, row) => add(sum, row.earned ?? ZERO), ZERO);
  return freeze({
    attemptId: attempt.attemptId,
    versions: exam.versions,
    rows,
    rawTotal,
    displayTotal: roundMtmTotal(rawTotal),
    officialTotal: pending.length ? null : rawTotal,
    officialDisplayTotal: pending.length ? null : roundMtmTotal(rawTotal),
    pending,
    sections: exam.sections.map((s) => ({
      type: s.type,
      maxScore: s.maxScore,
      rawTotal: rows.filter((r) => r.type === s.type).reduce((sum, row) => add(sum, row.earned ?? ZERO), ZERO)
    }))
  });
}

// src/native/exams/mtm-assessment.ts
var record2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var text2 = (v) => typeof v === "string" && !!v.trim();
var sha = (v) => typeof v === "string" && /^[a-fA-F0-9]{64}$/.test(v);
function isMtmQuestionPoints(value, count) {
  if (!record2(value) || !Number.isSafeInteger(count) || count < 1) return false;
  const n = value.numerator, d = value.denominator;
  return typeof n === "string" && typeof d === "string" && /^[1-9]\d{0,30}$/.test(n) && /^[1-9]\d{0,30}$/.test(d) && BigInt(n) * BigInt(count) === 10n * BigInt(d);
}
var fractionMillipoints = (value) => Number(value.numerator) / Number(value.denominator) * 1e3;
function validateMtmEqualAssessment(input) {
  const errors = [];
  if (!record2(input)) return { valid: false, errors: ["exam: object required"] };
  if (input.rubricVersion !== MTM_SCORING_VERSION) errors.push("exam: explicit MTM rubric required");
  if (input.responseMode !== void 0) errors.push("exam: question-only transport cannot be scored");
  if (!text2(input.id) || !text2(input.sourceRef) || !sha(input.sourceHash) || !sha(input.versionHash)) errors.push("exam: source and locked exam version required");
  if (!text2(input.answerKeyVersion) || input.answerKeyVersion.length > 160) errors.push("exam: answerKeyVersion required");
  if (input.answerKeyVerified !== true || input.rubricVerified !== true) errors.push("exam: verified answer key and rubric required");
  if (input.sourceComplete !== void 0 && typeof input.sourceComplete !== "boolean") errors.push("exam: invalid sourceComplete");
  if (input.issues !== void 0 && (!Array.isArray(input.issues) || !Array.from(input.issues).every(text2))) errors.push("exam: invalid source issues");
  if (!Array.isArray(input.questions) || !input.questions.length) return { valid: false, errors: [...errors, "exam: complete questions required"] };
  const count = input.questions.length;
  if (input.questionCount !== count || !Number.isSafeInteger(input.questionCount)) errors.push("exam: questionCount mismatch");
  const ids = /* @__PURE__ */ new Set();
  for (const [index, q] of input.questions.entries()) {
    const prefix = "question " + (index + 1) + ": ";
    if (!record2(q)) {
      errors.push(prefix + "object required");
      continue;
    }
    if (!text2(q.id) || q.id !== q.id.trim() || ids.has(q.id)) errors.push(prefix + "unique unpadded id required");
    else ids.add(q.id);
    if (!text2(q.sourceRef)) errors.push(prefix + "sourceRef required");
    if (!isMtmQuestionPoints(q.maxPoints, count)) errors.push(prefix + "maxPoints must equal exact 10/N");
    if (q.maxMillipoints !== 1e4 / count) errors.push(prefix + "maxMillipoints must be derived 10000/N");
    if (!["mc", "tf", "short"].includes(q.kind)) errors.push(prefix + "MTM supports mc/tf/short only");
    if (q.kind === "mc" && (!Array.isArray(q.choices) || q.choices.length !== 4 || !Array.from(q.choices).every(text2) || new Set(q.choices).size !== 4)) errors.push(prefix + "four distinct choices required");
    if (q.kind === "short" && !["numeric", "rational", "exact"].includes(q.mode)) errors.push(prefix + "explicit short mode required");
  }
  return { valid: errors.length === 0, errors };
}
function sourceStructureConflict(q) {
  const alphabet = q.kind === "mc" ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : q.kind === "tf" ? "abcdefghijklmnopqrstuvwxyz" : null;
  if (alphabet === null) return false;
  const structure = q.kind === "mc" ? q.choices : q.statements;
  const expected = Array.isArray(structure) ? structure.length : 4;
  const normalized = (value) => value.trim().replace(/\s+/gu, " ");
  return [q.prompt, q.text].some((content) => {
    if (typeof content !== "string") return false;
    const parts = [...content.matchAll(new RegExp("(?:^|[\\n;:])[\\t ]*([" + alphabet + "])[).:][\\t ]*", "g"))];
    if (!parts.length) return false;
    return parts.length !== expected || parts.map((part) => part[1]).join("") !== alphabet.slice(0, parts.length) || Array.isArray(structure) && parts.some((part, index) => {
      const body = content.slice(part.index + part[0].length, parts[index + 1]?.index ?? content.length);
      return typeof structure[index] !== "string" || normalized(body) !== normalized(structure[index]);
    });
  });
}
function verifiedQuestionSource(exam, q) {
  const pdf = exam.sourcePdf;
  if (record2(pdf) && pdf.verified === true && sha(pdf.sha256) && typeof pdf.url === "string" && Number.isSafeInteger(pdf.bytes) && pdf.bytes >= 8 && pdf.bytes <= 15 * 1024 * 1024 && Number.isSafeInteger(pdf.totalPages) && pdf.totalPages >= 1 && pdf.totalPages <= 200 && Array.isArray(pdf.questionPages) && pdf.questionPages.length > 0 && new Set(pdf.questionPages).size === pdf.questionPages.length && Array.from(pdf.questionPages).every((page) => Number.isSafeInteger(page) && page >= 1 && page <= pdf.totalPages)) {
    const urlValid = pdf.sha256 === String(pdf.sha256).toLowerCase() && [`/exam-assets/${pdf.sha256}.pdf`, `/qa-exam-assets/${pdf.sha256}.pdf`].includes(pdf.url);
    if (urlValid && Number.isSafeInteger(q.sourcePdfPage) && pdf.questionPages.includes(q.sourcePdfPage)) return true;
  }
  const content = q.sourceContent;
  return record2(content) && Array.isArray(content.questions) && content.questions.length > 0 && content.questions.length <= 12 && content.questions.every((segment) => record2(segment) && typeof segment.path === "string" && segment.path.length <= 300 && /^[a-zA-Z0-9][a-zA-Z0-9_/-]*\.png$/.test(segment.path) && !segment.path.includes("//") && !segment.path.split("/").includes("..") && sha(segment.sha256) && Number.isSafeInteger(segment.sourcePage) && (segment.sourcePage >= 1 || segment.mtmAuthored === true && segment.sourcePage === 0) && Number.isSafeInteger(segment.width) && segment.width >= 1 && segment.width <= 2e4 && Number.isSafeInteger(segment.height) && segment.height >= 1 && segment.height <= 3e4) && new Set(content.questions.map((segment) => segment.path)).size === content.questions.length;
}
function scoringQuestion(exam, q) {
  const issues = q.issues === void 0 ? [] : Array.isArray(q.issues) ? [...q.issues] : ["Danh s\xE1ch l\u1ED7i ngu\u1ED3n c\u1EE7a c\xE2u kh\xF4ng h\u1EE3p l\u1EC7."];
  const hasSource = verifiedQuestionSource(exam, q);
  if (!text2(q.prompt) && !text2(q.text) && !hasSource) issues.push("Thi\u1EBFu n\u1ED9i dung c\xE2u ho\u1EB7c ngu\u1ED3n tr\xECnh b\xE0y \u0111\xE3 ki\u1EC3m.");
  const adapted = {
    ...q,
    practiceQuestion: q,
    prompt: "N\u1ED9i dung theo PracticeExam \u0111\xE3 kh\xF3a.",
    text: void 0,
    sourceStructureConflict: sourceStructureConflict(q)
  };
  if (q.kind === "tf" && !Object.hasOwn(q, "statements")) adapted.statements = hasSource ? ["a", "b", "c", "d"].map((label) => String(q.sourceRef) + " | \xFD " + label) : [];
  if (q.kind === "short") {
    adapted.responseFormat = "short";
    const rule = q.shortRule;
    if (record2(rule) && rule.mode !== { numeric: "decimal", rational: "rational", exact: "exact" }[String(q.mode)])
      issues.push("Ch\u1EBF \u0111\u1ED9 nh\u1EADp TLN kh\xF4ng kh\u1EDBp quy t\u1EAFc ch\u1EA5p nh\u1EADn \u0111\xE3 kh\xF3a.");
  }
  if (issues.length) adapted.issues = issues;
  return adapted;
}
function mtmPracticeGradingReadiness(input) {
  try {
    const gate = validateMtmEqualAssessment(input);
    if (!gate.valid) return gate;
    const scored = scoreMtmEqualAssessment(input, {}, "grading-readiness");
    if (!scored.ok) return { valid: false, errors: scored.errors };
    const mtm = scored.mtm;
    if (!mtm || mtm.officialTotal === null || mtm.pending.length) return { valid: false, errors: mtm?.pending.length ? mtm.pending.map((error) => "MTM_GRADING_NOT_READY: " + error.code + (error.questionId ? " (" + error.questionId + ")" : "")) : ["MTM_GRADING_NOT_READY: missing official total"] };
    return { valid: true, errors: [] };
  } catch {
    return { valid: false, errors: ["MTM_GRADING_NOT_READY: invalid locked source"] };
  }
}
function scoreMtmEqualAssessment(input, submitted, attemptId = "assessment") {
  const gate = validateMtmEqualAssessment(input);
  if (!gate.valid) return { ok: false, errors: gate.errors };
  if (!record2(submitted)) return { ok: false, errors: ["answers: object required"] };
  const exam = input;
  const known = new Set(exam.questions.map((q) => q.id));
  const unknown = Object.keys(submitted).filter((id) => !known.has(id));
  if (unknown.length) return { ok: false, errors: unknown.map((id) => "answers: unknown question " + id) };
  const snapshot = new MtmScoringCatalog().prepare({
    ...exam,
    examId: exam.id,
    examVersion: exam.versionHash,
    questions: exam.questions.map((q) => scoringQuestion(exam, q))
  });
  const ids = new Map(snapshot.questions.map((q, i) => [q.id, exam.questions[i].id]));
  const answers = Object.fromEntries(snapshot.questions.filter((_, i) => Object.hasOwn(submitted, exam.questions[i].id)).map((q) => [q.id, submitted[ids.get(q.id)]]));
  const scored = scoreMtmAttempt(lockMtmAttempt(snapshot, attemptId), answers);
  const remap = (issue2) => issue2.questionId ? { ...issue2, questionId: ids.get(issue2.questionId) ?? issue2.questionId } : issue2;
  const mtm = { ...scored, pending: scored.pending.map(remap), rows: scored.rows.map((row) => ({ ...row, id: ids.get(row.id), issues: row.issues.map(remap) })) };
  const rows = mtm.rows.map((row) => ({ id: row.id, earnedMillipoints: row.earned === null ? null : fractionMillipoints(row.earned), maxMillipoints: 1e4 / exam.questions.length }));
  return {
    ok: true,
    mtm,
    earnedMillipoints: fractionMillipoints(mtm.rawTotal),
    maxMillipoints: 1e4,
    finalMillipoints: mtm.officialDisplayTotal === null ? null : Number(mtm.officialDisplayTotal.replace(".", "")) * 10,
    manualPending: [...new Set(mtm.pending.map((p) => p.questionId ?? "exam"))],
    rows
  };
}

// src/native/exams/assessment.ts
var record3 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var text3 = (v) => typeof v === "string" && v.trim().length > 0;
var units = (v) => Number.isSafeInteger(v) && v >= 0 && v <= 1e4;
var choices = ["A", "B", "C", "D"];
function canonicalNumeric(value) {
  const raw = value.trim();
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(raw)) return null;
  const sign = raw.startsWith("-") ? "-" : "";
  const [whole, fraction = ""] = raw.replace(/^[+-]/, "").replace(",", ".").split(".");
  const integer = whole.replace(/^0+(?=\d)/, "");
  const decimal2 = fraction.replace(/0+$/, "");
  return (integer === "0" && !decimal2 ? "" : sign) + integer + (decimal2 ? "." + decimal2 : "");
}
function canonicalRational(value) {
  const raw = value.trim();
  if (raw.length > 100) return null;
  let n, d;
  if (/^[+-]?\d+\/[+-]?\d+$/.test(raw)) {
    const pair = raw.split("/");
    n = BigInt(pair[0]);
    d = BigInt(pair[1]);
    if (d === 0n) return null;
  } else {
    const decimal2 = canonicalNumeric(raw);
    if (decimal2 === null) return null;
    const [whole, frac = ""] = decimal2.split(".");
    n = BigInt(whole + frac);
    d = 10n ** BigInt(frac.length);
  }
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  let a = n < 0n ? -n : n, b = d;
  while (b) {
    const r = a % b;
    a = b;
    b = r;
  }
  return `${n / a}/${d / a}`;
}
var normalizedShort = (mode, value) => mode === "numeric" ? canonicalNumeric(value) : mode === "rational" ? canonicalRational(value) : value.trim();
function validateAssessment(input) {
  if (record3(input) && input.rubricVersion === MTM_SCORING_VERSION) return validateMtmEqualAssessment(input);
  const errors = [];
  if (!record3(input)) return { valid: false, errors: ["exam: object required"] };
  if (!text3(input.id)) errors.push("exam: id required");
  if (!text3(input.sourceRef)) errors.push("exam: sourceRef required");
  if (typeof input.sourceHash !== "string" || !/^[a-fA-F0-9]{64}$/.test(input.sourceHash)) errors.push("exam: SHA256 required");
  if (input.answerKeyVerified !== true) errors.push("exam: verified answer key required");
  if (input.rubricVerified !== true) errors.push("exam: verified rubric required");
  if (!Array.isArray(input.questions) || !input.questions.length) return { valid: false, errors: [...errors, "exam: complete questions required"] };
  if (!Number.isSafeInteger(input.questionCount) || input.questionCount !== input.questions.length) errors.push("exam: verified source questionCount must match imported questions");
  const ids = /* @__PURE__ */ new Set();
  let total = 0;
  Array.from(input.questions).forEach((q, index) => {
    const prefix = "question " + (index + 1) + ": ";
    if (!record3(q)) {
      errors.push(prefix + "object required");
      return;
    }
    if (!text3(q.id) || q.id !== q.id.trim()) errors.push(prefix + "nonblank unpadded id required");
    else if (ids.has(q.id)) errors.push(prefix + "duplicate id");
    else ids.add(q.id);
    if (!text3(q.sourceRef)) errors.push(prefix + "sourceRef required");
    if (!units(q.maxMillipoints) || q.maxMillipoints === 0 && q.kind !== "self") errors.push(prefix + "positive integer millipoints required");
    else total += q.maxMillipoints;
    switch (q.kind) {
      case "mc":
        if (!Array.isArray(q.choices) || q.choices.length !== 4 || !Array.from(q.choices).every(text3) || new Set(q.choices).size !== 4) errors.push(prefix + "four distinct choices required");
        if (!choices.includes(q.answer)) errors.push(prefix + "A-D answer required");
        break;
      case "tf": {
        if (!Array.isArray(q.answer) || q.answer.length !== 4 || !Array.from(q.answer).every((x) => typeof x === "boolean")) errors.push(prefix + "four boolean key entries required");
        const schedule = q.pointsByCorrectCount;
        if (!Array.isArray(schedule) || schedule.length !== 5 || !Array.from(schedule).every(units) || schedule[0] !== 0 || schedule[4] !== q.maxMillipoints || schedule.some((n, i) => i > 0 && n < schedule[i - 1])) errors.push(prefix + "explicit monotonic 0..max schedule of five integers required");
        break;
      }
      case "short": {
        if (!["numeric", "rational", "exact"].includes(q.mode)) errors.push(prefix + "explicit short answer mode required");
        if (!Array.isArray(q.acceptedAnswers) || !q.acceptedAnswers.length || !Array.from(q.acceptedAnswers).every(text3)) errors.push(prefix + "nonblank accepted answers required");
        else {
          const normalized = q.acceptedAnswers.map((s) => normalizedShort(q.mode, s));
          if (normalized.includes(null) || new Set(normalized).size !== normalized.length) errors.push(prefix + "malformed or duplicate accepted answers");
        }
        break;
      }
      case "self":
        if (input.rubricVersion !== "MTM-BTVN-10-v1" || q.maxMillipoints !== 0 || "answer" in q || "acceptedAnswers" in q) errors.push(prefix + "self only allowed in BTVN without a key or points");
        break;
      case "essay":
        break;
      default:
        errors.push(prefix + "unsupported question kind");
    }
  });
  if (input.rubricVersion === "MTM-BTVN-10-v1" ? total <= 0 : total !== 1e4) errors.push(input.rubricVersion === "MTM-BTVN-10-v1" ? "exam: BTVN needs positive scored total" : "exam: total must equal 10000 millipoints");
  return { valid: !errors.length, errors };
}

// src/native/exams/mtm-profile.ts
var MTM_PROFILE = Object.freeze({ id: "MTM-12MC-4TF-6SHORT-v1", questionCount: 22, mc: 12, tf: 4, short: 6 });
function validateMtmAssessment(input) {
  const general = validateAssessment(input);
  if (!general.valid) return general;
  const exam = input, errors = [];
  if (exam.questionCount !== 22) errors.push("MTM profile: exactly22 source questions required (12MC + 4TF + 6short)");
  if (exam.questions.some((q) => q.kind === "essay")) errors.push("MTM profile: essays are excluded; do not convert them automatically");
  if (exam.questions.length === 22) exam.questions.forEach((q, i) => {
    const expected = i < 12 ? "mc" : i < 16 ? "tf" : "short";
    if (q.kind !== expected) errors.push("MTM profile: question " + (i + 1) + " must be " + expected + " in source section order");
  });
  return { valid: !errors.length, errors };
}

// src/native/exams/flexible-profile.ts
var FLEX_RUBRIC = "MTM-FLEX-10-v1";
function validatePracticeProfile(input) {
  const e = input;
  const equalQuestion = e?.rubricVersion === MTM_SCORING_VERSION;
  if (!equalQuestion && e?.rubricVersion !== FLEX_RUBRIC && e?.rubricVersion !== "MTM-BTVN-10-v1") return validateMtmAssessment(input);
  const gate = validateAssessment(input);
  if (!gate.valid) return gate;
  const errors = [];
  if (!equalQuestion && !e.id.startsWith("mtm-custom-") && !e.id.startsWith("mtm-preview-") && !e.id.startsWith("mtm-practice-") && !e.id.startsWith("mtm-hsa-")) errors.push("Flexible profile requires a custom edition");
  if (equalQuestion && e.sections === void 0) return gate;
  if (!Array.isArray(e.sections) || !e.sections.length || !equalQuestion && e.sections.length > 12) return { valid: false, errors: [...errors, "Sections required"] };
  let offset = 0;
  for (const section of e.sections) {
    if (!section || typeof section.label !== "string" || !section.label.trim() || section.label.length > 100 || !(e.rubricVersion === "MTM-BTVN-10-v1" ? ["mc", "tf", "short", "self"] : ["mc", "tf", "short", "mixed"]).includes(section.kind) || !Number.isSafeInteger(section.count) || section.count < 1 || !equalQuestion && section.count > 300) {
      errors.push("Invalid section");
      continue;
    }
    if (e.questions.slice(offset, offset + section.count).length !== section.count || e.questions.slice(offset, offset + section.count).some((q) => section.kind === "mixed" ? !["mc", "tf", "short"].includes(q.kind) : q.kind !== section.kind)) errors.push("Section/question mismatch");
    offset += section.count;
  }
  if (offset !== e.questions.length || !equalQuestion && offset > 300) errors.push("Complete section counts required");
  return { valid: !errors.length, errors };
}

// src/native/exams/data.ts
var GRADES = [10, 11, 12];
var PERIODS = ["GK1", "CK1", "GK2", "CK2"];
var isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var boundedText = (value, max = 500) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
var isSha256 = (value) => typeof value === "string" && /^[a-fA-F0-9]{64}$/.test(value);
function isHttpsUrl(value) {
  if (typeof value !== "string" || value.length > 4096 || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}
function validPdfUrl(value, sha256) {
  if (typeof value !== "string" || !isSha256(sha256)) return false;
  if (value.startsWith("/")) return sha256 === sha256.toLowerCase() && (value === `/exam-assets/${sha256}.pdf` || value === `/qa-exam-assets/${sha256}.pdf`);
  return isHttpsUrl(value);
}
function validSourcePdf(value) {
  if (!isRecord(value) || value.verified !== true || !validPdfUrl(value.url, value.sha256) || !Number.isSafeInteger(value.bytes) || value.bytes < 8 || value.bytes > 15 * 1024 * 1024 || !Number.isSafeInteger(value.totalPages) || value.totalPages < 1 || value.totalPages > 200) return false;
  return Array.isArray(value.questionPages) && value.questionPages.length > 0 && new Set(value.questionPages).size === value.questionPages.length && Array.from(value.questionPages).every((p) => Number.isSafeInteger(p) && p >= 1 && p <= value.totalPages);
}
function validSourceSegments(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return false;
  return value.every((segment) => isRecord(segment) && typeof segment.path === "string" && segment.path.length <= 300 && /^[a-zA-Z0-9][a-zA-Z0-9_/-]*\.png$/.test(segment.path) && !segment.path.includes("//") && !segment.path.split("/").includes("..") && isSha256(segment.sha256) && Number.isSafeInteger(segment.sourcePage) && (segment.sourcePage >= 1 || segment.mtmAuthored === true && segment.sourcePage === 0) && Number.isSafeInteger(segment.width) && segment.width >= 1 && segment.width <= 2e4 && Number.isSafeInteger(segment.height) && segment.height >= 1 && segment.height <= 3e4) && new Set(value.map((segment) => segment.path)).size === value.length;
}
function validatePracticeExam(input) {
  const gate = validatePracticeProfile(input);
  if (!gate.valid || !isRecord(input)) return gate;
  if (input.responseMode !== void 0) return { valid: false, errors: ["Question-only transport is not a complete scoring exam"] };
  return validatePracticePresentation(input, false);
}
function validEqualQuestionSchedule(value, milli) {
  const expected = [0, milli / 10, milli / 4, milli / 2, milli];
  return Array.isArray(value) && value.length === 5 && Array.from(value).every((v, i) => typeof v === "number" && Number.isFinite(v) && Math.abs(v - expected[i]) <= Math.max(1, expected[i]) * Number.EPSILON * 4);
}
function validatePracticePresentation(input, questionOnly) {
  const errors = [];
  const equalQuestion = input.rubricVersion === MTM_SCORING_VERSION;
  if (!boundedText(input.id, 120) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(input.id) || input.id === "history") errors.push("Invalid or reserved route id");
  if (!GRADES.includes(input.grade) || !PERIODS.includes(input.period)) errors.push("Invalid grade or period");
  if (!boundedText(input.title, 300)) errors.push("Missing title");
  if (!Number.isSafeInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 1440) errors.push("Invalid duration");
  if (!isSha256(input.versionHash) || !boundedText(input.rubricVersion, 120)) errors.push("Invalid exam/rubric version");
  if (!(input.serverGraded === true && !("sourceUrl" in input) || isHttpsUrl(input.sourceUrl)) || input.publicationVerified !== true || input.questionDisplayVerified !== true) errors.push("Publication/question display not verified");
  const material = input.sourceMaterial;
  if (!isRecord(material) || !["title", "publisher", "version", "locator"].every((key) => boundedText(material[key], 1e3))) errors.push("Incomplete source material");
  if (input.answerVerificationNote !== void 0 && !boundedText(input.answerVerificationNote, 2e3)) errors.push("Invalid answer verification note");
  if (input.preAttemptNotice !== void 0 && !boundedText(input.preAttemptNotice, 2e3)) errors.push("Invalid pre-attempt notice");
  if (input.sourcePdf !== void 0 && !validSourcePdf(input.sourcePdf)) errors.push("PDF question-page asset not verified");
  if (input.sourceInstructions !== void 0 && !validSourceSegments(input.sourceInstructions)) errors.push("Invalid question instructions");
  if (questionOnly ? "solutionInstructions" in input : input.solutionInstructions !== void 0 && !validSourceSegments(input.solutionInstructions)) errors.push("Invalid solution instructions");
  if (input.mtmDocuments !== void 0) {
    const files = input.mtmDocuments;
    if (!isRecord(files) || !isRecord(files.questions) || !validPdfUrl(files.questions.url, files.questions.sha256) || (questionOnly ? "solutions" in files : !isRecord(files.solutions) || !validPdfUrl(files.solutions.url, files.solutions.sha256) || files.questions.sha256 === files.solutions.sha256)) errors.push("Invalid separate MTM documents");
  }
  for (const q of input.questions) {
    if (!boundedText(q.id, 120) || ["__proto__", "constructor", "prototype"].includes(q.id)) errors.push("Unsafe question id");
    if (!boundedText(q.prompt ?? q.text ?? q.sourceRef, 2e4)) errors.push("Missing question text or source locator");
    if (q.prompt !== void 0 && !boundedText(q.prompt, 2e4)) errors.push("Invalid prompt");
    if (q.text !== void 0 && !boundedText(q.text, 2e4)) errors.push("Invalid text");
    if (q.convertedFrom !== void 0 && (input.rubricVersion !== "MTM-BTVN-10-v1" && input.rubricVersion !== MTM_SCORING_VERSION || q.kind !== "short" || q.convertedFrom !== "essay")) errors.push("Invalid essay conversion");
    if (!questionOnly && q.kind === "self" && !boundedText(q.solution, 2e4) && !q.sourceContent?.solutions?.length) errors.push("Self question requires a solution");
    if (q.solution !== void 0 && !boundedText(q.solution, 2e4)) errors.push("Invalid solution");
    if (q.correctionNote !== void 0 && !boundedText(q.correctionNote, 2e3)) errors.push("Invalid correction note");
    if (q.sourceContent !== void 0) {
      if (!isRecord(q.sourceContent) || !validSourceSegments(q.sourceContent.questions) || (questionOnly ? "solutions" in q.sourceContent : !validSourceSegments(q.sourceContent.solutions))) errors.push("Invalid complete source fragments");
      else if (!questionOnly && q.sourceContent.solutions.some((segment) => q.sourceContent.questions.some((question) => question.path === segment.path || question.sha256.toLowerCase() === segment.sha256.toLowerCase()))) errors.push("Question and solution fragments must be separate");
    }
    if (!questionOnly && q.kind === "short" && (!equalQuestion || Array.isArray(q.acceptedAnswers)) && !q.acceptedAnswers.every((answer) => boundedText(answer, 500))) errors.push("Short answer exceeds input limit");
    if (equalQuestion && q.kind === "tf" && !validEqualQuestionSchedule(q.pointsByCorrectCount, 1e4 / input.questions.length)) errors.push("Invalid MTM true/false compatibility schedule");
    if (q.statements !== void 0 && (q.kind !== "tf" || !Array.isArray(q.statements) || !equalQuestion && q.statements.length !== 4 || !Array.from(q.statements).every((s) => boundedText(s, 1e4)))) errors.push("Invalid statement texts");
    if (input.sourcePdf === void 0 && q.sourceContent === void 0 && (!boundedText(q.prompt ?? q.text, 2e4) || q.kind === "tf" && !q.statements)) errors.push("Question content is missing; a source locator is insufficient");
  }
  return { valid: errors.length === 0, errors };
}

// server/btvn/class-rules.json
var class_rules_default = {
  timezone: "Asia/Ho_Chi_Minh",
  notes: [
    "C\u1EB7p T4-T5 m\u1EDF sau T4; 2K10 Th\u1EE9 3, 6 h\u1EA1n c\xF9ng th\u1EE9 tu\u1EA7n sau theo hai gi\u1EA3 \u0111\u1ECBnh trong thi\u1EBFt k\u1EBF \u0111\u1EE3t 24.",
    "Anh Th\xE0nh 28/10 22:44: b\xE0i giao \u1EDF ca th\u1EE9 X c\u1EE7a l\u1EDBp/th\u1EA7y n\xE0o th\xEC h\u1EA1n l\xE0 ca th\u1EE9 X tu\u1EA7n sau c\u1EE7a ch\xEDnh l\u1EDBp/th\u1EA7y \u0111\xF3 (2K9 9+/8+ b\u1ECF h\u1EA1n theo c\u1EB7p bu\u1ED5i; 2K9 XPT T3\u2192T3, T5\u2192T5)."
  ],
  classes: {
    "2K9 9+": {
      open: {
        type: "paired",
        sourceLabel: "2K9 9+",
        days: {
          "1": 1,
          "2": 1,
          "3": 3,
          "4": 3,
          "5": 5,
          "6": 5
        }
      },
      due: {
        type: "map",
        days: {
          "1": {
            weekday: 1,
            weeks: 1
          },
          "2": {
            weekday: 1,
            weeks: 1
          },
          "3": {
            weekday: 3,
            weeks: 1
          },
          "4": {
            weekday: 3,
            weeks: 1
          },
          "5": {
            weekday: 5,
            weeks: 1
          },
          "6": {
            weekday: 5,
            weeks: 1
          }
        }
      }
    },
    "2K14": {
      open: {
        type: "after_session"
      },
      due: {
        type: "same_weekday_next_week"
      }
    },
    "2K10 XPT": {
      open: {
        type: "after_session"
      },
      due: {
        type: "same_weekday_next_week"
      }
    },
    "2K9 XPT": {
      open: {
        type: "after_session"
      },
      due: {
        type: "map",
        days: {
          "1": {
            weekday: 1,
            weeks: 1
          },
          "2": {
            weekday: 2,
            weeks: 1
          },
          "4": {
            weekday: 4,
            weeks: 1
          }
        }
      }
    },
    "2K9 8+": {
      open: {
        type: "paired",
        sourceLabel: "2K9 9+",
        days: {
          "1": 1,
          "2": 1,
          "3": 3,
          "4": 3,
          "5": 5,
          "6": 5
        }
      },
      due: {
        type: "map",
        days: {
          "1": {
            weekday: 2,
            weeks: 1
          },
          "2": {
            weekday: 2,
            weeks: 1
          },
          "3": {
            weekday: 4,
            weeks: 1
          },
          "4": {
            weekday: 4,
            weeks: 1
          },
          "5": {
            weekday: 6,
            weeks: 1
          },
          "6": {
            weekday: 6,
            weeks: 1
          }
        }
      }
    },
    "2K10 9+": {
      open: {
        type: "paired",
        sourceLabel: "2K10 9+",
        days: {
          "7": 5
        }
      },
      due: {
        type: "slot_by_attendance"
      }
    },
    "2K13": {
      open: {
        type: "after_session"
      },
      due: {
        type: "same_weekday_next_week"
      }
    },
    "2K11 8+": {
      open: {
        type: "after_session"
      },
      due: {
        type: "same_weekday_next_week"
      }
    },
    "2K11 XPT": {
      open: {
        type: "after_session"
      },
      due: {
        type: "same_weekday_next_week"
      }
    },
    "HSA.2": {
      open: {
        type: "after_session"
      },
      due: {
        type: "next_session"
      }
    },
    "2K12": {
      open: {
        type: "after_session"
      },
      due: {
        type: "same_weekday_next_week"
      }
    },
    "2K15": {
      open: {
        type: "after_session"
      },
      due: {
        type: "same_weekday_next_week"
      }
    },
    "2K11 9+": {
      open: {
        type: "after_session"
      },
      due: {
        type: "same_weekday_next_week"
      }
    },
    "2K10 8+": {
      open: {
        type: "after_session"
      },
      due: {
        type: "same_weekday_next_week"
      }
    },
    TSA: {
      open: {
        type: "after_session"
      },
      due: {
        type: "same_weekday_next_week"
      }
    },
    HSA: {
      open: {
        type: "after_session"
      },
      due: {
        type: "next_session"
      }
    },
    "2K9 HSA (TH\u1EE8 5)": {
      open: {
        type: "after_session"
      },
      due: {
        type: "next_session"
      }
    },
    "2K10 Th\u1EE9 3, 6": {
      open: {
        type: "after_session"
      },
      due: {
        type: "same_weekday_next_week"
      }
    },
    "2K9 HSA (CN)": {
      open: {
        type: "after_session"
      },
      due: {
        type: "next_session"
      }
    }
  }
};

// server/schedule/lich-lop.snapshot.json
var lich_lop_snapshot_default = {
  source: "Lich_lop",
  snapshotDate: "2026-10-20",
  notes: [
    "TSA retained from legacy BTVN fallback, not verified in the Lich_lop snapshot."
  ],
  rows: [
    {
      id: "2K9 XPS 9+|T2|17:30|19:30",
      lop: "2K9 XPS 9+",
      thu: "T2",
      bat: "17:30",
      ket: "19:30"
    },
    {
      id: "2K9 XPS 9+|T4|17:30|19:30",
      lop: "2K9 XPS 9+",
      thu: "T4",
      bat: "17:30",
      ket: "19:30"
    },
    {
      id: "2K9 XPS 9+|T6|17:30|19:30",
      lop: "2K9 XPS 9+",
      thu: "T6",
      bat: "17:30",
      ket: "19:30"
    },
    {
      id: "2K9 XPS 8+|T3|17:30|19:30",
      lop: "2K9 XPS 8+",
      thu: "T3",
      bat: "17:30",
      ket: "19:30"
    },
    {
      id: "2K9 XPS 8+|T5|17:30|19:30",
      lop: "2K9 XPS 8+",
      thu: "T5",
      bat: "17:30",
      ket: "19:30"
    },
    {
      id: "2K9 XPS 8+|T7|17:30|19:30",
      lop: "2K9 XPS 8+",
      thu: "T7",
      bat: "17:30",
      ket: "19:30"
    },
    {
      id: "2K9 XPT|T2|19:30|21:30",
      lop: "2K9 XPT",
      thu: "T2",
      bat: "19:30",
      ket: "21:30"
    },
    {
      id: "2K9 XPT|T3|19:30|21:30",
      lop: "2K9 XPT",
      thu: "T3",
      bat: "19:30",
      ket: "21:30"
    },
    {
      id: "2K9 XPT|T5|19:30|21:30",
      lop: "2K9 XPT",
      thu: "T5",
      bat: "19:30",
      ket: "21:30"
    },
    {
      id: "2K10 XPS 9+|T3|19:30|21:30",
      lop: "2K10 XPS 9+",
      thu: "T3",
      bat: "19:30",
      ket: "21:30"
    },
    {
      id: "2K10 XPS 9+|CN|08:00|10:00",
      lop: "2K10 XPS 9+",
      thu: "CN",
      bat: "08:00",
      ket: "10:00"
    },
    {
      id: "2K10 XPS 8+|T6|19:30|21:30",
      lop: "2K10 XPS 8+",
      thu: "T6",
      bat: "19:30",
      ket: "21:30"
    },
    {
      id: "2K10 XPS 8+|CN|10:00|12:00",
      lop: "2K10 XPS 8+",
      thu: "CN",
      bat: "10:00",
      ket: "12:00"
    },
    {
      id: "2K10 XPT|T2|19:30|21:30",
      lop: "2K10 XPT",
      thu: "T2",
      bat: "19:30",
      ket: "21:30"
    },
    {
      id: "2K10 XPT|T7|15:30|17:30",
      lop: "2K10 XPT",
      thu: "T7",
      bat: "15:30",
      ket: "17:30"
    },
    {
      id: "2K11 XPS 9+|T5|19:30|21:30",
      lop: "2K11 XPS 9+",
      thu: "T5",
      bat: "19:30",
      ket: "21:30"
    },
    {
      id: "2K11 XPS 9+|CN|13:30|15:30",
      lop: "2K11 XPS 9+",
      thu: "CN",
      bat: "13:30",
      ket: "15:30"
    },
    {
      id: "2K11 XPS 8+|T4|19:30|21:30",
      lop: "2K11 XPS 8+",
      thu: "T4",
      bat: "19:30",
      ket: "21:30"
    },
    {
      id: "2K11 XPS 8+|CN|15:30|17:30",
      lop: "2K11 XPS 8+",
      thu: "CN",
      bat: "15:30",
      ket: "17:30"
    },
    {
      id: "2K11 XPT|T4|19:30|21:30",
      lop: "2K11 XPT",
      thu: "T4",
      bat: "19:30",
      ket: "21:30"
    },
    {
      id: "2K11 XPT|T7|13:30|15:30",
      lop: "2K11 XPT",
      thu: "T7",
      bat: "13:30",
      ket: "15:30"
    },
    {
      id: "2K12|T5|18:00|20:00",
      lop: "2K12",
      thu: "T5",
      bat: "18:00",
      ket: "20:00"
    },
    {
      id: "2K12|CN|15:00|17:00",
      lop: "2K12",
      thu: "CN",
      bat: "15:00",
      ket: "17:00"
    },
    {
      id: "2K13|T3|20:00|22:00",
      lop: "2K13",
      thu: "T3",
      bat: "20:00",
      ket: "22:00"
    },
    {
      id: "2K13|T6|20:00|22:00",
      lop: "2K13",
      thu: "T6",
      bat: "20:00",
      ket: "22:00"
    },
    {
      id: "2K14|T2|18:00|20:00",
      lop: "2K14",
      thu: "T2",
      bat: "18:00",
      ket: "20:00"
    },
    {
      id: "2K14|T5|09:00|11:00",
      lop: "2K14",
      thu: "T5",
      bat: "09:00",
      ket: "11:00"
    },
    {
      id: "2K15|T5|18:00|20:00",
      lop: "2K15",
      thu: "T5",
      bat: "18:00",
      ket: "20:00"
    },
    {
      id: "2K15|CN|14:00|16:00",
      lop: "2K15",
      thu: "CN",
      bat: "14:00",
      ket: "16:00"
    },
    {
      id: "HSA.2|T5|14:30|17:30",
      lop: "HSA.2",
      thu: "T5",
      bat: "14:30",
      ket: "17:30"
    },
    {
      id: "HSA|CN|17:00|20:00",
      lop: "HSA",
      thu: "CN",
      bat: "17:00",
      ket: "20:00"
    },
    {
      id: "TSA|CN|14:00|17:00",
      lop: "TSA",
      thu: "CN",
      bat: "14:00",
      ket: "17:00",
      legacyOnly: true
    }
  ]
};

// server/schedule/lich-lop.ts
var SCHEDULE_SNAPSHOT = lich_lop_snapshot_default.rows;
var SCHEDULE_SNAPSHOT_DATE = lich_lop_snapshot_default.snapshotDate;
var DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
var aliases = { "2K9 HSA (TH\u1EE8 5)": "HSA.2", "2K9 HSA (CN)": "HSA" };
var scheduleClass = (name) => aliases[name.trim()] ?? name.trim().replace(/\s+XPS(?=\s+[89]\+)/, "");
function classSlots(rows, label, attendanceAlternatives = false) {
  const name = scheduleClass(label);
  const selected = rows.filter((row) => {
    const other = scheduleClass(row.lop);
    if (other === name) return true;
    if (attendanceAlternatives && name === "2K10 9+" && other === "2K10 8+" && row.thu === "T6") return true;
    if (name === "2K10 Th\u1EE9 3, 6") return other === "2K10 9+" && row.thu === "T3" || other === "2K10 8+" && row.thu === "T6";
    return false;
  });
  const unique = new Map(selected.map((row) => {
    const slot2 = { weekday: DAYS.indexOf(row.thu) + 1, start: row.bat, end: row.ket };
    return [JSON.stringify(slot2), slot2];
  }));
  return [...unique.values()].filter((s) => s.weekday > 0).sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
}
var hhmm = (raw) => {
  const m = /^(\d{1,2})[:h](\d{2})/.exec(raw.trim());
  return m && +m[1] < 24 && +m[2] < 60 ? m[1].padStart(2, "0") + ":" + m[2] : null;
};
var day = (raw) => {
  const v = raw.trim().toLowerCase();
  if (/^(cn|chủ nhật|chu nhat)$/.test(v)) return "CN";
  const m = /^(?:thứ|thu|t)\s*([2-7])$/.exec(v);
  return m ? "T" + m[1] : null;
};
function csv(raw) {
  const result = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quoted) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && raw[i + 1] === "\n") i++;
      row.push(cell);
      result.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) return [];
  if (cell || row.length) {
    row.push(cell);
    result.push(row);
  }
  return result;
}
function parseScheduleCsv(raw) {
  const rows = csv(raw.replace(/^\uFEFF/, "")), header = (rows.shift() ?? []).map((v) => v.trim().toLowerCase());
  const cols = ["l\u1EDBp", "th\u1EE9", "b\u1EAFt \u0111\u1EA7u", "k\u1EBFt th\xFAc"].map((v) => header.indexOf(v));
  if (cols.some((v) => v < 0)) return [];
  const found = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const [name, t, b, k] = cols.map((i) => row[i] ?? ""), lop = name.trim().replace(/\s+/g, " "), thu = day(t), bat = hhmm(b), ket = hhmm(k);
    if (!lop || lop.length > 30 || lop.includes("|") || !thu || !bat || !ket || bat >= ket) continue;
    const id = [lop, thu, bat, ket].join("|");
    found.set(id, { id, lop, thu, bat, ket });
  }
  return [...found.values()];
}
function scheduleEnvironment() {
  const runtime = globalThis;
  return { MTM_LICH_LOP_CSV: typeof process !== "undefined" ? process.env.MTM_LICH_LOP_CSV : runtime.Deno?.env.get("MTM_LICH_LOP_CSV") };
}
var cache = null;
async function loadSchedule(env, transport = fetch, now = Date.now()) {
  const raw = env.MTM_LICH_LOP_CSV;
  const fallback = () => ({ rows: SCHEDULE_SNAPSHOT, source: "snapshot", snapshotDate: SCHEDULE_SNAPSHOT_DATE });
  if (!raw) return fallback();
  let url;
  try {
    url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || url.username || url.password) return fallback();
  } catch {
    return fallback();
  }
  if (cache?.url === url.href && now - cache.at < 6e5) return { rows: cache.rows, source: "Lich_lop" };
  try {
    const response = await transport(url.href, { signal: AbortSignal.timeout(4e3) });
    if (!response.ok) throw Error();
    const rows = parseScheduleCsv(await response.text());
    if (rows.length < 5) throw Error();
    cache = { url: url.href, at: now, rows };
    return { rows, source: "Lich_lop" };
  } catch {
    return cache?.url === url.href ? { rows: cache.rows, source: "Lich_lop-cache" } : fallback();
  }
}

// server/btvn/class-rules.ts
function rulesFromSchedule(rows) {
  return { ...class_rules_default, classes: Object.fromEntries(Object.entries(class_rules_default.classes).map(([label, policy]) => [label, { ...policy, sessions: classSlots(rows, label, true) }])) };
}
var classRules = rulesFromSchedule(SCHEDULE_SNAPSHOT);
async function loadClassRules(env, transport = fetch, now = Date.now()) {
  return rulesFromSchedule((await loadSchedule(env, transport, now)).rows);
}
function lessonDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + "T00:00:00Z")) || (/* @__PURE__ */ new Date(value + "T00:00:00Z")).toISOString().slice(0, 10) !== value) throw Error("INVALID_CLASS_DATE");
  return /* @__PURE__ */ new Date(value + "T00:00:00Z");
}
var weekday = (d) => d.getUTCDay() || 7;
var shift = (d, n) => new Date(d.getTime() + n * 864e5);
var iso = (d, time) => d.toISOString().slice(0, 10) + "T" + time + ":00+07:00";
var slot = (r, day2) => r.sessions.filter((s) => s.weekday === day2).sort((a, b) => a.start.localeCompare(b.start)).at(-1);
function opensAt(label, lessonDate, ruleSet = classRules) {
  const rules = ruleSet.classes;
  const d = lessonDay(lessonDate), w = weekday(d), r = rules[label];
  if (!r) return iso(d, "21:30");
  const sourceDay = r.open.days?.[String(w)] ?? w, source = rules[r.open.sourceLabel ?? label];
  return iso(shift(d, sourceDay - w), slot(source, sourceDay)?.end ?? "21:30");
}

// server/btvn/class-schedule.ts
function classOpeningTimes(material, rules, strict = false) {
  const result = {};
  for (const name of material.classNames) {
    const date2 = material.classDates?.[name] ?? material.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date2) || !Number.isFinite(Date.parse(date2 + "T00:00:00Z")) || (/* @__PURE__ */ new Date(date2 + "T00:00:00Z")).toISOString().slice(0, 10) !== date2) throw Error("INVALID_CLASS_DATE");
    if (strict && rules && !rules.classes[name]?.sessions.length) throw Error("CLASS_SCHEDULE_UNAVAILABLE");
    if (strict && rules) {
      const rule = rules.classes[name], day2 = (/* @__PURE__ */ new Date(date2 + "T00:00:00Z")).getUTCDay() || 7;
      const source = rules.classes[rule.open.sourceLabel ?? name], openingDay = rule.open.days?.[String(day2)] ?? day2;
      if (!source?.sessions.some((slot2) => slot2.weekday === openingDay)) throw Error("CLASS_SCHEDULE_UNAVAILABLE");
    }
    result[name] = opensAt(name, date2, rules);
  }
  return result;
}

// server/btvn/publish-attendance.ts
var record4 = (v) => v && typeof v === "object" && !Array.isArray(v);
var text4 = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
var validAttendanceLabel = (v) => typeof v === "string" && /^2K\d{1,2}(?: (?:[89]\+|XPT|Thứ [2-7], [2-7]|HSA \((?:CN|THỨ 5)\)))?$/.test(v);
var ensure = (v) => {
  if (!v) throw Error("INVALID_ATTENDANCE");
};
var date = (v) => text4(v, 40) && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) && (/* @__PURE__ */ new Date(v.slice(0, 10) + "T00:00:00Z")).toISOString().slice(0, 10) === v.slice(0, 10);
function attendanceRpc(body, rules = classRules) {
  if (!["sync_attendance", "sync_due", "support_report"].includes(body.action)) return null;
  if (body.action === "support_report") {
    ensure(Object.keys(body).every((k) => ["action", "since"].includes(k)) && date(body.since));
    return { name: "support_report", payload: { p_since: body.since } };
  }
  ensure(Object.keys(body).every((k) => ["action", "apply", body.action === "sync_due" ? "sessions" : "rows"].includes(k)));
  ensure(body.apply === void 0 || typeof body.apply === "boolean");
  if (body.action === "sync_attendance") {
    ensure(Array.isArray(body.rows) && body.rows.length > 0 && body.rows.length <= 1e4);
    for (const r of body.rows) ensure(record4(r) && Object.keys(r).every((k) => ["label", "fullName", "phone", "source", "school"].includes(k)) && validAttendanceLabel(r.label) && text4(r.fullName, 160) && typeof r.phone === "string" && /^0\d{9}$/.test(r.phone) && (r.source === void 0 || text4(r.source, 200)) && (r.school === void 0 || typeof r.school === "string" && r.school.length <= 160 && !/[\u0000-\u001f\u007f-\u009f]/.test(r.school)));
    return { name: "sync_attendance", payload: { p_payload: { rows: body.rows }, p_apply: body.apply ?? false } };
  }
  ensure(Array.isArray(body.sessions) && body.sessions.length <= 2e3);
  let count = 0;
  const ids = /* @__PURE__ */ new Set();
  for (const s of body.sessions) {
    ensure(record4(s) && Object.keys(s).every((k) => ["classKey", "label", "startsAt", "sourceIdentity", "attendees", "cancelled", "replacesAt"].includes(k)) && validAttendanceLabel(s.label) && text4(s.classKey, 100) && date(s.startsAt) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$/.test(s.startsAt) && text4(s.sourceIdentity, 300) && !ids.has(s.sourceIdentity) && Array.isArray(s.attendees) && s.attendees.length <= 1e3);
    ids.add(s.sourceIdentity);
    ensure(s.cancelled === void 0 || typeof s.cancelled === "boolean");
    ensure(s.replacesAt === void 0 || date(s.replacesAt) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$/.test(s.replacesAt) && s.replacesAt !== s.startsAt && s.cancelled !== true);
    count += s.attendees.length;
    ensure(count <= 2e4);
    for (const a of s.attendees) ensure(record4(a) && Object.keys(a).every((k) => ["name", "phone", "status"].includes(k)) && text4(a.name, 160) && typeof a.phone === "string" && /^0\d{9}$/.test(a.phone) && typeof a.status === "string" && ["", "C", "M", "L", "K", "ON", "P", "PH P"].includes(a.status));
  }
  return { name: "sync_due", payload: { p_payload: { sessions: body.sessions, classRules: rules }, p_apply: body.apply ?? false } };
}

// server/btvn/class-config.ts
function publicClassNames(names) {
  if (!Array.isArray(names) || names.length > 200 || names.some((name) => typeof name !== "string" || !name.trim() || name.length > 100)) throw Error("C\u1EA5u h\xECnh l\u1EDBp ch\u01B0a h\u1EE3p l\u1EC7");
  return [...new Set(names.map((name) => name.trim()))].sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
}

// server/btvn/test-scope.ts
var isTestRow = (row) => row?.is_test === true || row?.isTest === true || row?.studentIsTest === true || row?.lessonIsTest === true;

// server/btvn/publish-scorebook.ts
function scorebookRpc(body) {
  if (body.action === "opening_materials") {
    if (Object.keys(body).some((k) => !["action", "lesson_key"].includes(k)) || body.lesson_key !== void 0 && (typeof body.lesson_key !== "string" || !/^[a-z0-9-]{1,160}$/.test(body.lesson_key))) throw Error("INVALID_OPENING_READ");
    return { name: "opening_materials", payload: { p_code: body.lesson_key ?? null } };
  }
  if (body.action === "classes") {
    if (Object.keys(body).some((k) => k !== "action")) throw Error("INVALID_CLASSES");
    return { name: "classes", payload: {} };
  }
  if (body.action !== "scorebook") return null;
  const from = body.from === void 0 ? "2026-10-01" : body.from;
  if (Object.keys(body).some((k) => !["action", "from"].includes(k)) || typeof from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(from) || from < "2026-10-01" || !Number.isFinite(Date.parse(from)) || new Date(from).toISOString().slice(0, 10) !== from) throw Error("INVALID_SCOREBOOK");
  return { name: "scorebook", payload: { p_from: from, p_apply: false } };
}
function scorebookResult(action, result) {
  if (action === "opening_materials") {
    if (!Array.isArray(result) || result.length > 2e4) throw Error("INVALID_OPENING_RESULT");
    return result.filter((r) => !isTestRow(r)).map((r) => ({ lessonCode: r.lessonCode, date: r.date, classNames: r.classNames, classDates: r.classDates }));
  }
  if (action === "classes") return { classNames: publicClassNames(result) };
  if (!Array.isArray(result)) throw Error("INVALID_SCOREBOOK_RESULT");
  return result.filter((r) => !isTestRow(r)).map((r) => ({
    studentId: r.studentId,
    fullName: r.fullName,
    className: r.className,
    lessonCode: r.lessonCode,
    title: r.title,
    date: r.date,
    dueAt: r.dueAt,
    expectedDueAt: r.expectedDueAt,
    sourceIdentity: r.sourceIdentity,
    attempts: (Array.isArray(r.attempts) ? r.attempts : []).slice(0, 50).map((x) => ({ startedAt: typeof x?.startedAt === "number" ? x.startedAt : null, submittedAt: typeof x?.submittedAt === "number" ? x.submittedAt : null })),
    receipts: r.receipts.map((s) => ({ score: s.score, submittedAt: s.submittedAt, late: s.late }))
  }));
}

// server/btvn/publish-handler.ts
var hash = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer))).map((x) => x.toString(16).padStart(2, "0")).join("");
var canonical2 = (value) => JSON.stringify(value);
function expectedSlots(exam) {
  return exam.questions.flatMap((q) => q.kind === "tf" ? q.answer.map((expected, i) => ({ question_id: q.id, slot: "abcd"[i], expected })) : [{ question_id: q.id, slot: "answer", expected: q.kind === "self" ? "self" : q.kind === "short" ? q.acceptedAnswers : q.answer }]);
}
function ensure2(value, message) {
  if (!value) throw Error(message);
}
function references(exam) {
  const refs = [];
  for (const q of exam.questions) for (const s of [...q.sourceContent?.questions ?? [], ...q.sourceContent?.solutions ?? []]) refs.push(s);
  refs.push(...exam.sourceInstructions ?? [], ...exam.solutionInstructions ?? []);
  for (const pdf of [exam.sourcePdf, exam.mtmDocuments?.questions, exam.mtmDocuments?.solutions]) if (pdf) {
    ensure2(pdf.url.startsWith("/exam-assets/"), "PDF_MUST_BE_PRIVATE");
    refs.push({ path: pdf.url.slice(1), sha256: pdf.sha256 });
  }
  return refs;
}
function createBtvnPublishHandler(port, secret, options = {}) {
  return async (request) => {
    const respond = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
    if (request.method !== "POST") return respond(405, { error_code: "POST_REQUIRED" });
    const supplied = request.headers.get("X-MTM-Publish-Secret") ?? "";
    if (!secret || secret.length < 32 || supplied.length > 1024) return respond(401, { error_code: "UNAUTHORIZED" });
    const a = await hash(new TextEncoder().encode(secret)), b = await hash(new TextEncoder().encode(supplied));
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    if (diff) return respond(401, { error_code: "UNAUTHORIZED" });
    try {
      const text5 = await request.text();
      ensure2(text5.length <= 48 * 1024 * 1024, "PAYLOAD_TOO_LARGE");
      const body = JSON.parse(text5);
      ensure2(body && typeof body === "object" && !Array.isArray(body), "INVALID_PAYLOAD");
      const read = scorebookRpc(body);
      if (read) return respond(200, scorebookResult(read.name, await port.rpc(read.name, read.payload)));
      const scheduleEnv = options.scheduleEnv ?? scheduleEnvironment();
      const rules = ["sync_due", "publish", "update_material"].includes(body.action) ? await loadClassRules(scheduleEnv, options.scheduleTransport) : classRules;
      const attendance = attendanceRpc(body, rules);
      if (attendance) {
        ensure2(new TextEncoder().encode(text5).length <= 10 * 1024 * 1024, "PAYLOAD_TOO_LARGE");
        return respond(200, await port.rpc(attendance.name, attendance.payload));
      }
      ensure2(["lookup", "publish", "error", "update_material"].includes(body.action) && /^[a-z0-9-]{1,160}$/.test(body.lesson_key), "INVALID_ACTION");
      const previous = await port.rpc("lookup", { lesson_key: body.lesson_key });
      if (body.action === "lookup") return respond(200, previous);
      if (body.action === "update_material") {
        ensure2(previous.status === "da_dang", "LESSON_NOT_PUBLISHED");
        ensure2(Object.keys(body).every((k) => ["action", "lesson_key", "material"].includes(k)), "INVALID_UPDATE");
        const patch = body.material;
        ensure2(patch && typeof patch === "object" && !Array.isArray(patch) && Object.keys(patch).length > 0, "INVALID_UPDATE");
        const allowed = ["videoId", "videoUrl", "materialUrl", "handoutUrl", "homeworkNote", "title", "titleSource", "classOpensAt"];
        ensure2(Object.keys(patch).every((k) => allowed.includes(k)), "INVALID_UPDATE");
        for (const [key, value] of Object.entries(patch)) {
          if (key === "titleSource") ensure2(value === "sheet" || value === "auto", "INVALID_TITLE_SOURCE");
          else if (key === "videoId") ensure2(value === null || typeof value === "string" && /^[a-zA-Z0-9_-]{11}$/.test(value), "INVALID_VIDEO");
          else if (["videoUrl", "materialUrl", "handoutUrl"].includes(key)) {
            if (value !== null) {
              ensure2(typeof value === "string" && value.length <= 4096, "INVALID_MATERIAL_LINK");
              const url = new URL(value);
              ensure2(url.protocol === "https:" && !url.username && !url.password, "INVALID_MATERIAL_LINK");
            }
          } else if (key === "classOpensAt") {
            ensure2(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0 && Object.entries(value).every(([name, date2]) => name.length > 0 && name.length <= 100 && typeof date2 === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(date2) && Number.isFinite(Date.parse(date2)) && (/* @__PURE__ */ new Date(date2.slice(0, 10) + "T00:00:00Z")).toISOString().slice(0, 10) === date2.slice(0, 10)), "INVALID_CLASS_OPENING");
          } else ensure2(typeof value === "string" && value.length <= 300 && (key !== "title" || value.trim().length > 0), "INVALID_MATERIAL");
        }
        return respond(200, await port.rpc("update_material", { lesson_key: body.lesson_key, material: patch }));
      }
      if (previous.status === "da_dang") return respond(200, { status: "already_published" });
      ensure2(/^[a-f0-9]{64}$/.test(body.source_version ?? ""), "INVALID_VERSION");
      const kind = body.kind ?? "btvn";
      ensure2(["btvn", "kiem-tra-thang"].includes(kind), "INVALID_KIND");
      if (kind === "kiem-tra-thang") ensure2(typeof body.opensAt === "string" && typeof body.closesAt === "string" && /([zZ]|[+-]\d{2}:\d{2})$/.test(body.opensAt) && /([zZ]|[+-]\d{2}:\d{2})$/.test(body.closesAt) && Number.isFinite(Date.parse(body.opensAt)) && Date.parse(body.opensAt) >= Date.parse("2026-10-15T00:00:00+07:00") && Date.parse(body.closesAt) > Date.parse(body.opensAt), "INVALID_MONTHLY_WINDOW");
      const m = body.material;
      ensure2(m?.homeworkScope === void 0 || typeof m.homeworkScope === "string" && m.homeworkScope.length > 0 && m.homeworkScope.length <= 300, "INVALID_HOMEWORK_SCOPE");
      ensure2(m?.homeworkScopeSource === void 0 || ["sheet", "auto", "whole_file"].includes(m.homeworkScopeSource), "INVALID_HOMEWORK_SCOPE_SOURCE");
      ensure2(m?.homeworkScope === void 0 === (m?.homeworkScopeSource === void 0), "INVALID_HOMEWORK_SCOPE");
      ensure2(m?.titleSource === void 0 || m.titleSource === "sheet" || m.titleSource === "auto", "INVALID_TITLE_SOURCE");
      ensure2(m?.lessonCode === body.lesson_key && Array.isArray(m.classNames) && m.classNames.length > 0 && m.classNames.length <= 50 && new Set(m.classNames).size === m.classNames.length && m.classNames.every((x) => typeof x === "string" && x.length > 0 && x.length <= 100), "INVALID_MATERIAL");
      ensure2(/^\d{4}-\d{2}-\d{2}$/.test(m.date) && new Date(m.date).toISOString().slice(0, 10) === m.date && typeof m.title === "string" && m.title.length > 0 && m.title.length <= 300, "INVALID_MATERIAL");
      const link = (v) => {
        if (v === null || v === void 0 || v === "") return null;
        ensure2(typeof v === "string" && v.length <= 4096, "INVALID_MATERIAL_LINK");
        const u = new URL(v);
        ensure2(u.protocol === "https:" && !u.username && !u.password, "INVALID_MATERIAL_LINK");
        return u.href;
      };
      const classDates = m.classDates ?? {};
      ensure2(classDates && typeof classDates === "object" && !Array.isArray(classDates) && Object.entries(classDates).every(([name, date2]) => m.classNames.includes(name) && typeof date2 === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date2) && new Date(date2).toISOString().slice(0, 10) === date2), "INVALID_CLASS_DATES");
      const material = { lessonCode: m.lessonCode, classNames: m.classNames, date: m.date, title: m.title, titleSource: m.titleSource ?? "sheet", homeworkScope: m.homeworkScope, homeworkScopeSource: m.homeworkScopeSource, classDates, classOpensAt: classOpeningTimes({ ...m, classDates }, rules, !!scheduleEnv.MTM_LICH_LOP_CSV), videoId: m.videoId ?? null, materialUrl: link(m.materialUrl), handoutUrl: link(m.handoutUrl), homeworkUrl: null, videoUrl: link(m.videoUrl), homeworkNote: typeof m.homeworkNote === "string" ? m.homeworkNote.slice(0, 300) : void 0 };
      ensure2(material.videoId === null || /^[a-zA-Z0-9_-]{11}$/.test(material.videoId), "INVALID_VIDEO");
      if (body.action === "error") {
        ensure2(/^[A-Z0-9_]{1,80}$/.test(body.error_code ?? ""), "INVALID_ERROR");
        const reason = typeof body.reason === "string" && body.reason.length <= 1e3 && !/(https?:|@|bearer|sk-|secret|token|password|otp)/i.test(body.reason) ? body.reason.replace(/[\x00-\x1f]/g, " ") : "Kh\xF4ng \u0111\u1EA1t b\u1ED9 ki\u1EC3m; xem receipt ri\xEAng c\u1EE7a worker.";
        return respond(200, await port.rpc("error", { lesson_key: body.lesson_key, source_version: body.source_version, material, error_code: body.error_code, reason }));
      }
      const exam = body.exam;
      ensure2(validatePracticeExam(exam).valid && exam.durationMinutes === 120, "VALIDATOR_FAILED");
      if (exam.rubricVersion === MTM_SCORING_VERSION) ensure2(mtmPracticeGradingReadiness(exam).valid, "MTM_GRADING_NOT_READY");
      const proof = body.verification;
      ensure2(proof?.validator === true && proof.independent === true && /^[a-f0-9]{64}$/.test(proof.receipt_hash ?? "") && typeof proof.provider === "string" && proof.provider.trim().length > 0 && typeof proof.model === "string" && proof.model.trim().length > 0, "REVIEW_REQUIRED");
      const slots = expectedSlots(exam);
      ensure2(Array.isArray(proof.slots) && proof.slots.length === slots.length, "REVIEW_COVERAGE");
      ensure2(typeof proof.extractor_provider === "string" && proof.extractor_provider !== proof.provider, "INDEPENDENT_PROVIDER_REQUIRED");
      for (const slot2 of slots) {
        const matches = proof.slots.filter((x) => x.question_id === slot2.question_id && x.slot === slot2.slot), q = exam.questions.find((q2) => q2.id === slot2.question_id);
        ensure2(matches.length === 1 && canonical2(matches[0].expected) === canonical2(slot2.expected), "REVIEW_MISMATCH");
        if (q.convertedFrom === "essay" || q.kind === "self" || exam.rubricVersion === "MTM-BTVN-10-v1" && q.kind === "short") ensure2(matches[0].conversion_verified === true, "CONVERSION_REVIEW_REQUIRED");
        const actual = matches[0].actual;
        if (q.kind === "short" && exam.rubricVersion === MTM_SCORING_VERSION) {
          ensure2(typeof actual === "string", "REVIEW_MISMATCH");
          const normalized = normalizeMtmShort(actual, q.shortRule);
          ensure2(normalized !== null && q.acceptedAnswers.some((expected) => normalizeMtmShort(expected, q.shortRule) === normalized), "REVIEW_MISMATCH");
        } else ensure2(q.kind === "short" ? typeof actual === "string" && normalizedShort(q.mode, actual) !== null && q.acceptedAnswers.some((a2) => normalizedShort(q.mode, a2) === normalizedShort(q.mode, actual)) : canonical2(actual) === canonical2(slot2.expected), "REVIEW_MISMATCH");
      }
      ensure2(Array.isArray(body.assets) && body.assets.length > 0 && body.assets.length <= 500, "INVALID_ASSETS");
      const assets = body.assets, paths = /* @__PURE__ */ new Set();
      let bytesTotal = 0;
      const decoded = await Promise.all(assets.map(async (asset) => {
        ensure2(typeof asset.path === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_/-]*\.(png|pdf)$/.test(asset.path) && !asset.path.split("/").includes("..") && !asset.path.includes("//") && !paths.has(asset.path), "INVALID_PATH");
        paths.add(asset.path);
        ensure2(/^[a-f0-9]{64}$/.test(asset.sha256) && ["application/pdf", "image/png"].includes(asset.content_type) && asset.path.endsWith(asset.content_type === "image/png" ? ".png" : ".pdf"), "INVALID_ASSET");
        ensure2(typeof asset.data_base64 === "string" && /^[A-Za-z0-9+/]*={0,2}$/.test(asset.data_base64) && asset.data_base64.length <= 21 * 1024 * 1024, "INVALID_BASE64");
        const raw = atob(asset.data_base64), bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
        bytesTotal += bytes.length;
        ensure2(bytes.length >= 8 && bytes.length <= 15 * 1024 * 1024 && bytesTotal <= 32 * 1024 * 1024 && await hash(bytes) === asset.sha256, "ASSET_HASH_MISMATCH");
        ensure2(asset.content_type === "image/png" ? bytes.slice(0, 8).every((x, i) => x === [137, 80, 78, 71, 13, 10, 26, 10][i]) : new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-", "INVALID_FILE_SIGNATURE");
        return { asset, bytes, storage_path: `btvn/${body.lesson_key}/${body.source_version}/${asset.path}` };
      }));
      for (const ref of references(exam)) ensure2(assets.some((a2) => a2.path === ref.path && a2.sha256 === ref.sha256), "ASSET_REFERENCE_MISSING");
      for (const item of decoded) await port.upload(item.storage_path, item.bytes, item.asset.content_type, item.asset.sha256);
      const metadata = decoded.map(({ asset, bytes, storage_path }) => ({ path: asset.path, sha256: asset.sha256, content_type: asset.content_type, bytes: bytes.length, storage_path }));
      return respond(200, await port.rpc("publish", { kind, opensAt: body.opensAt, closesAt: body.closesAt, lesson_key: body.lesson_key, source_version: body.source_version, material, exam, assets: metadata, verification: proof }));
    } catch (e) {
      const code = e instanceof Error && /^[A-Z][A-Z0-9_]{2,59}$/.test(e.message) ? e.message : "UNCLASSIFIED";
      console.warn("[btvn-publish] rejected", code);
      return new Response(JSON.stringify({ error_code: "PUBLISH_REJECTED" }), { status: 422, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-MTM-Reject-Code": code } });
    }
  };
}
export {
  createBtvnPublishHandler,
  expectedSlots
};
