const assert = require('assert');
const Scoring = require('../js/scoring.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok - ' + name); }
  catch (e) { fail++; console.log('  FAIL - ' + name + '\n    ' + e.message); }
}

function makeQuestion(id, part, number, type, correctAnswer) {
  return { id: id, part: part, number: number, type: type, correctAnswer: correctAnswer };
}

console.log('== Marking scheme constants ==');
test('max total is 200', () => {
  assert.strictEqual(Scoring.MAX_TOTAL, 200);
});
test('15*A + 25*B + 20*C == 200', () => {
  const total = 15 * Scoring.MARKING.A.correct + 25 * Scoring.MARKING.B.correct + 20 * Scoring.MARKING.C.correct;
  assert.strictEqual(total, 200);
});

console.log('\n== scoreAttempt ==');
test('all correct across all three parts scores the full 200', () => {
  const qs = [];
  for (let i = 1; i <= 15; i++) qs.push(makeQuestion('a' + i, 'A', i, 'MCQ', ['A']));
  for (let i = 1; i <= 25; i++) qs.push(makeQuestion('b' + i, 'B', i, 'MCQ', ['A']));
  for (let i = 1; i <= 20; i++) qs.push(makeQuestion('c' + i, 'C', i, 'MCQ', ['A']));
  const answers = {};
  qs.forEach(q => { answers[q.id] = ['A']; });
  const result = Scoring.scoreAttempt(qs, answers, 100);
  assert.strictEqual(result.overall.marks, 200);
  assert.strictEqual(result.overall.correct, 60);
  assert.strictEqual(result.overall.wrong, 0);
});

test('Part A: one correct, one wrong, one unattempted', () => {
  const qs = [
    makeQuestion('q1', 'A', 1, 'MCQ', ['A']),
    makeQuestion('q2', 'A', 2, 'MCQ', ['B']),
    makeQuestion('q3', 'A', 3, 'MCQ', ['C'])
  ];
  const answers = { q1: ['A'], q2: ['D'] }; // q3 unattempted
  const r = Scoring.scoreAttempt(qs, answers, 0);
  assert.strictEqual(r.parts.A.correct, 1);
  assert.strictEqual(r.parts.A.wrong, 1);
  assert.strictEqual(r.parts.A.unattempted, 1);
  assert.strictEqual(r.parts.A.marks, 2 - 0.5); // +2 -0.5
});

test('Part B negative marking is -0.75', () => {
  const qs = [makeQuestion('q1', 'B', 16, 'MCQ', ['A'])];
  const r = Scoring.scoreAttempt(qs, { q1: ['B'] }, 0);
  assert.strictEqual(r.parts.B.marks, -0.75);
});

test('Part C has zero negative marking', () => {
  const qs = [makeQuestion('q1', 'C', 41, 'MCQ', ['A'])];
  const r = Scoring.scoreAttempt(qs, { q1: ['B'] }, 0);
  assert.strictEqual(r.parts.C.marks, 0);
  assert.strictEqual(r.parts.C.wrong, 1);
});

test('MSQ: exact match of correct set required for credit', () => {
  const qs = [makeQuestion('q1', 'A', 10, 'MSQ', ['A', 'C'])];
  const rFull = Scoring.scoreAttempt(qs, { q1: ['A', 'C'] }, 0);
  assert.strictEqual(rFull.parts.A.correct, 1);
  const rPartial = Scoring.scoreAttempt(qs, { q1: ['A'] }, 0);
  assert.strictEqual(rPartial.parts.A.wrong, 1, 'partial MSQ selection should count as wrong, not correct');
});

test('unattempted MSQ (empty selection) does not get penalised', () => {
  const qs = [makeQuestion('q1', 'B', 20, 'MSQ', ['A', 'C'])];
  const r = Scoring.scoreAttempt(qs, { q1: [] }, 0);
  assert.strictEqual(r.parts.B.unattempted, 1);
  assert.strictEqual(r.parts.B.marks, 0);
});

test('accuracy is correct/(correct+wrong) * 100, ignoring unattempted', () => {
  const qs = [
    makeQuestion('q1', 'A', 1, 'MCQ', ['A']),
    makeQuestion('q2', 'A', 2, 'MCQ', ['A']),
    makeQuestion('q3', 'A', 3, 'MCQ', ['A'])
  ];
  const r = Scoring.scoreAttempt(qs, { q1: ['A'], q2: ['B'] }, 0); // q3 unattempted
  assert.strictEqual(r.accuracy, 50);
});

test('order of selected options does not matter for MSQ matching', () => {
  const qs = [makeQuestion('q1', 'C', 50, 'MSQ', ['A', 'B', 'D'])];
  const r = Scoring.scoreAttempt(qs, { q1: ['D', 'A', 'B'] }, 0);
  assert.strictEqual(r.parts.C.correct, 1);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
