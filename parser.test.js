const assert = require('assert');
const fs = require('fs');
const path = require('path');
const MockParser = require('../js/parser.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('  ok - ' + name);
  } catch (e) {
    fail++;
    console.log('  FAIL - ' + name);
    console.log('    ' + e.message);
  }
}

console.log('== Valid 60-question paper ==');
const validText = fs.readFileSync(path.join(__dirname, 'test-input-valid.txt'), 'utf8');
const validResult = MockParser.parseInput(validText);

test('parses exactly 60 questions', () => {
  assert.strictEqual(validResult.questions.length, 60);
});
test('no blocking errors on valid paper', () => {
  assert.deepStrictEqual(validResult.errors, []);
});
test('part counts are 15/25/20', () => {
  const counts = MockParser.partCounts(validResult.questions);
  assert.deepStrictEqual(counts, { A: 15, B: 25, C: 20 });
});
test('question numbers run 1..60 with no gaps or dupes', () => {
  const nums = validResult.questions.map(q => q.number).sort((a, b) => a - b);
  for (let i = 0; i < 60; i++) assert.strictEqual(nums[i], i + 1, 'at index ' + i);
});
test('every question has 4 options and a type', () => {
  validResult.questions.forEach(q => {
    assert.strictEqual(q.options.length, 4, 'Q' + q.number);
    assert.ok(q.type === 'MCQ' || q.type === 'MSQ', 'Q' + q.number + ' type=' + q.type);
  });
});
test('every question has a correct answer consistent with its type', () => {
  validResult.questions.forEach(q => {
    assert.ok(q.correctAnswer.length >= 1, 'Q' + q.number + ' missing answer');
    if (q.type === 'MCQ') assert.strictEqual(q.correctAnswer.length, 1, 'Q' + q.number);
  });
});
test('LaTeX matrix block in Q16 survives parsing untouched', () => {
  const q16 = validResult.questions.find(q => q.number === 16);
  assert.ok(q16.question.indexOf('\\begin{pmatrix}') !== -1, 'matrix begin missing');
  assert.ok(q16.question.indexOf('\\end{pmatrix}') !== -1, 'matrix end missing');
  assert.ok(q16.question.indexOf('1 & 2') !== -1);
  assert.ok(q16.question.indexOf('3 & 4') !== -1);
});
test('MSQ question keeps multiple correct answers', () => {
  const msq = validResult.questions.find(q => q.type === 'MSQ' && q.part === 'A');
  assert.ok(msq, 'no MSQ found in part A');
  assert.ok(msq.correctAnswer.length > 1);
});
test('inline LaTeX like \\(\\mathbb{R}\\) is preserved verbatim in option text', () => {
  const q = validResult.questions.find(q => q.options.some(o => o.text.indexOf('\\mathbb{Q}') !== -1));
  assert.ok(q, 'expected question with \\mathbb{Q} option not found');
});

console.log('\n== Error cases ==');

test('missing questions (59 instead of 60) is reported', () => {
  const truncated = validText.split('\n').slice(0, -20).join('\n'); // chop off the tail
  const r = MockParser.parseInput(truncated);
  const hasCountError = r.errors.some(e => /questions are required/.test(e));
  assert.ok(hasCountError, 'expected a total-count error, got: ' + JSON.stringify(r.errors));
});

test('missing option is reported with question number', () => {
  const broken = 'PART A\n\nQ1. Sample question.\n\n(A) One\n(B) Two\n(C) Three\n\nTYPE: MCQ\nCorrect Answer: A\n';
  const r = MockParser.parseInput(broken);
  const q1 = r.errors.find(e => /^Q1: Expected four options/.test(e));
  assert.ok(q1, 'expected Q1 option-count error, got: ' + JSON.stringify(r.errors));
});

test('duplicate question numbers are reported', () => {
  const dup = 'PART A\n\nQ1. First.\n\n(A) a\n(B) b\n(C) c\n(D) d\n\nTYPE: MCQ\nCorrect Answer: A\n\n' +
              'Q1. Duplicate.\n\n(A) a\n(B) b\n(C) c\n(D) d\n\nTYPE: MCQ\nCorrect Answer: B\n';
  const r = MockParser.parseInput(dup);
  assert.ok(r.errors.some(e => /Duplicate question number/.test(e)), JSON.stringify(r.errors));
});

test('missing TYPE is a warning, not a blocking error', () => {
  const noType = 'PART A\n\nQ1. First.\n\n(A) a\n(B) b\n(C) c\n(D) d\n\nCorrect Answer: A\n';
  const r = MockParser.parseInput(noType);
  assert.ok(r.warnings.some(e => /TYPE is missing/.test(e)), JSON.stringify(r.warnings));
  assert.ok(!r.errors.some(e => /TYPE/.test(e)), 'TYPE should not be a blocking error');
});

test('question outside any PART header is flagged', () => {
  const noPart = 'Q1. Orphan question.\n\n(A) a\n(B) b\n(C) c\n(D) d\n\nTYPE: MCQ\nCorrect Answer: A\n';
  const r = MockParser.parseInput(noPart);
  assert.ok(r.errors.some(e => /No PART/.test(e)), JSON.stringify(r.errors));
});

test('MCQ with two correct answers is a blocking error', () => {
  const bad = 'PART A\n\nQ1. First.\n\n(A) a\n(B) b\n(C) c\n(D) d\n\nTYPE: MCQ\nCorrect Answer: A,B\n';
  const r = MockParser.parseInput(bad);
  assert.ok(r.errors.some(e => /more than one correct answer/.test(e)), JSON.stringify(r.errors));
});

test('empty input is rejected', () => {
  const r = MockParser.parseInput('   \n  ');
  assert.ok(r.errors.length > 0);
  assert.strictEqual(r.questions.length, 0);
});

console.log('\n== validateQuestions() on an edited (post-preview) list ==');
test('validateQuestions reports ready:true for the valid parsed set', () => {
  const v = MockParser.validateQuestions(validResult.questions);
  assert.strictEqual(v.ready, true, JSON.stringify(v.errors));
});
test('validateQuestions catches a part re-labelled by the user into overflow', () => {
  const edited = JSON.parse(JSON.stringify(validResult.questions));
  edited[20].part = 'A'; // steal one Part B question into Part A
  const v = MockParser.validateQuestions(edited);
  assert.strictEqual(v.ready, false);
  assert.ok(v.errors.some(e => /Part A/.test(e)));
  assert.ok(v.errors.some(e => /Part B/.test(e)));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
