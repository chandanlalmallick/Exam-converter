// Generates a synthetic but structurally realistic 60-question CSIR-NET
// style paper (15 / 25 / 20) to exercise the parser, including LaTeX,
// multi-line matrices, MCQ and MSQ questions, so we can test parsing
// without needing real exam content.
const fs = require('fs');
const path = require('path');

function mcqBlock(num, stem, opts, correctIdx) {
  const letters = ['A', 'B', 'C', 'D'];
  let s = `Q${num}. ${stem}\n\n`;
  opts.forEach((o, i) => { s += `(${letters[i]}) ${o}\n`; });
  s += `\nTYPE: MCQ\nCorrect Answer: ${letters[correctIdx]}\n\n`;
  return s;
}

function msqBlock(num, stem, opts, correctIdxs) {
  const letters = ['A', 'B', 'C', 'D'];
  let s = `Q${num}. ${stem}\n\n`;
  opts.forEach((o, i) => { s += `(${letters[i]}) ${o}\n`; });
  s += `\nTYPE: MSQ\nCorrect Answer: ${correctIdxs.map(i => letters[i]).join(',')}\n\n`;
  return s;
}

let out = '';
let n = 1;

out += 'PART A\n\n';
for (let i = 0; i < 15; i++) {
  if (i === 4) {
    out += mcqBlock(n++,
      `Evaluate\n\\[\n\\lim_{x\\to0}\\frac{\\sin x}{x}.\n\\]`,
      ['0', '1', '\\infty', 'Does not exist'], 1);
  } else if (i === 9) {
    out += msqBlock(n++,
      `Which of the following sets are subsets of \\(\\mathbb{R}\\)?`,
      ['\\(\\mathbb{Q}\\)', '\\(\\mathbb{Z}\\)', '\\(\\mathbb{C}\\)', '\\(\\mathbb{N}\\)'],
      [0, 1, 3]);
  } else {
    out += mcqBlock(n++, `Sample Part A question number ${n} about basic analysis.`,
      ['Option one', 'Option two', 'Option three', 'Option four'], i % 4);
  }
}

out += '\nPART B\n\n';
for (let i = 0; i < 25; i++) {
  if (i === 0) {
    out += mcqBlock(n++,
      `Let\n\\[\nA =\n\\begin{pmatrix}\n1 & 2\\\\\n3 & 4\n\\end{pmatrix}.\n\\]\nThen \\(\\det(A)\\) equals`,
      ['-2', '2', '10', '0'], 0);
  } else if (i === 12) {
    out += msqBlock(n++,
      `Let \\(T:V\\to V\\) be a linear operator. Which statements are true?`,
      ['\\(T\\) has an eigenvalue if \\(V\\) is finite dimensional over \\(\\mathbb{C}\\)',
        '\\(\\ker T\\) is always trivial',
        '\\(\\operatorname{rank}(T)+\\operatorname{nullity}(T)=\\dim V\\)',
        '\\(T\\) is always invertible'],
      [0, 2]);
  } else {
    out += mcqBlock(n++, `Sample Part B question number ${n} about linear algebra / topology.`,
      ['Option one', 'Option two', 'Option three', 'Option four'], i % 4);
  }
}

out += '\nPART C\n\n';
for (let i = 0; i < 20; i++) {
  if (i === 3) {
    out += msqBlock(n++,
      `For the integral \\(\\displaystyle\\int_0^1 x^2\\,dx\\), which statements hold?`,
      ['The value equals \\(\\tfrac{1}{3}\\)', 'The integrand is continuous on \\([0,1]\\)',
        'The value is negative', 'The value is greater than 1'],
      [0, 1]);
  } else {
    out += mcqBlock(n++, `Sample Part C question number ${n} about abstract algebra.`,
      ['Option one', 'Option two', 'Option three', 'Option four'], i % 4);
  }
}

fs.writeFileSync(path.join(__dirname, 'test-input-valid.txt'), out.trim() + '\n');
console.log('Wrote test-input-valid.txt with', n - 1, 'questions');
