/**
 * parser.js
 * Deterministic, dependency-free parser that converts the user's pasted
 * question text into structured question objects. No AI, no rewriting —
 * this module only recognises structure (PART headers, "Qn.", "(A)" etc.)
 * and never touches the wording or math inside a question or option.
 *
 * Works in the browser (attaches to window.MockParser) and in Node
 * (module.exports) so the same file can be unit-tested with `node`.
 */
(function (global) {
  'use strict';

  var REQUIRED_COUNTS = { A: 15, B: 25, C: 20 };
  var TOTAL_REQUIRED = 60;

  var PART_HEADER_RE = /^PART\s*([ABC])\s*$/i;
  var QUESTION_START_RE = /^Q\s*\.?\s*(\d+)\s*[\.\):]\s*(.*)$/i;
  var OPTION_RE = /^\(([A-Da-d])\)\s*(.*)$/;
  var TYPE_RE = /^TYPE\s*:\s*(MCQ|MSQ)\s*$/i;
  var ANSWER_RE = /^(?:CORRECT\s*ANSWER|ANSWER|ANS)\s*:\s*([A-Da-d](?:\s*,\s*[A-Da-d])*)\s*$/i;

  /**
   * Parse raw pasted text into { questions, errors, warnings }.
   * `errors` block "Create Mock". `warnings` do not (they can be fixed
   * later in the Preview editor, e.g. a missing TYPE or answer key).
   */
  function parseInput(rawText) {
    var errors = [];
    var warnings = [];
    var questions = [];

    if (!rawText || !rawText.trim()) {
      errors.push('No text was pasted. Paste your questions into the text box first.');
      return { questions: questions, errors: errors, warnings: warnings };
    }

    var text = String(rawText).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var lines = text.split('\n');

    var currentPart = null;
    var current = null;
    var nextId = 1;

    function finalize(q) {
      q.question = q.question.replace(/\n{3,}/g, '\n\n').trim();
      q.options = q.options.map(function (o) {
        return { label: o.label, text: o.text.replace(/\n{3,}/g, '\n\n').trim() };
      });
      return q;
    }

    function pushCurrent() {
      if (current) {
        questions.push(finalize(current));
        current = null;
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var rawLine = lines[i];
      var trimmed = rawLine.trim();
      var lineNo = i + 1;

      if (trimmed === '') {
        // Blank line: preserve as paragraph break inside whatever we're
        // currently collecting (question text or the last option), since
        // multi-line LaTeX blocks (\[ ... \]) rely on line breaks.
        if (current) {
          if (current.options.length > 0 && !current._afterAnswerBlock) {
            var lastOpt = current.options[current.options.length - 1];
            lastOpt.text += '\n';
          } else if (!current._afterAnswerBlock) {
            current.question += '\n';
          }
        }
        continue;
      }

      var partMatch = trimmed.match(PART_HEADER_RE);
      if (partMatch) {
        pushCurrent();
        currentPart = partMatch[1].toUpperCase();
        continue;
      }

      var qMatch = trimmed.match(QUESTION_START_RE);
      if (qMatch) {
        pushCurrent();
        var num = parseInt(qMatch[1], 10);
        current = {
          id: 'q_' + nextId++,
          part: currentPart,
          number: num,
          type: null,
          question: qMatch[2] || '',
          options: [],
          correctAnswer: [],
          sourceLine: lineNo,
          _afterAnswerBlock: false
        };
        continue;
      }

      if (!current) {
        // Stray text before any "Qn." was seen (e.g. a title line, or
        // instructions the user pasted by mistake). Ignore it rather
        // than guessing — it is not part of any question.
        continue;
      }

      var optMatch = trimmed.match(OPTION_RE);
      if (optMatch) {
        current.options.push({ label: optMatch[1].toUpperCase(), text: optMatch[2] || '' });
        current._afterAnswerBlock = false;
        continue;
      }

      var typeMatch = trimmed.match(TYPE_RE);
      if (typeMatch) {
        current.type = typeMatch[1].toUpperCase();
        current._afterAnswerBlock = true;
        continue;
      }

      var answerMatch = trimmed.match(ANSWER_RE);
      if (answerMatch) {
        current.correctAnswer = answerMatch[1]
          .split(',')
          .map(function (s) { return s.trim().toUpperCase(); })
          .filter(Boolean);
        current._afterAnswerBlock = true;
        continue;
      }

      // Continuation line: belongs to the last option if options have
      // already started, otherwise it's still part of the question stem.
      // (Skipped once TYPE/ANSWER have been seen for this question, since
      // stray trailing text at that point is not question content.)
      if (!current._afterAnswerBlock) {
        if (current.options.length > 0) {
          var lastOption = current.options[current.options.length - 1];
          lastOption.text += (lastOption.text ? '\n' : '') + rawLine;
        } else {
          current.question += (current.question ? '\n' : '') + rawLine;
        }
      }
    }
    pushCurrent();

    // Per-question structural checks
    var seenNumbers = {};
    var dupeNumbers = {};
    questions.forEach(function (q) {
      if (seenNumbers[q.number]) {
        dupeNumbers[q.number] = true;
      }
      seenNumbers[q.number] = true;
    });

    questions.forEach(function (q) {
      var loc = 'Q' + q.number;
      if (dupeNumbers[q.number]) {
        errors.push(loc + ': Duplicate question number (used more than once).');
      }
      if (!q.part) {
        errors.push(loc + ': No PART (A/B/C) header found before this question.');
      }
      if (q.options.length === 0) {
        errors.push(loc + ': No options detected.');
      } else if (q.options.length !== 4) {
        errors.push(loc + ': Expected four options but found ' + q.options.length + '.');
      }
      if (!q.type) {
        warnings.push(loc + ': TYPE is missing. Set MCQ or MSQ in the preview editor.');
      }
      if (q.type === 'MCQ' && q.correctAnswer.length > 1) {
        errors.push(loc + ': TYPE is MCQ but more than one correct answer was given.');
      }
      if (!q.correctAnswer.length) {
        warnings.push(loc + ': No correct answer set yet. Add it in the preview editor.');
      }
      var optionLabels = q.options.map(function (o) { return o.label; });
      q.correctAnswer.forEach(function (a) {
        if (optionLabels.indexOf(a) === -1) {
          errors.push(loc + ': Correct answer "' + a + '" does not match any option present.');
        }
      });
    });

    // Part-count checks
    ['A', 'B', 'C'].forEach(function (p) {
      var count = questions.filter(function (q) { return q.part === p; }).length;
      if (count !== REQUIRED_COUNTS[p]) {
        errors.push('Part ' + p + ': ' + count + ' / ' + REQUIRED_COUNTS[p] + ' questions detected.');
      }
    });

    if (questions.length !== TOTAL_REQUIRED) {
      errors.push('Only ' + questions.length + ' question' + (questions.length === 1 ? '' : 's') +
        ' detected. ' + TOTAL_REQUIRED + ' questions are required.');
    }

    return { questions: questions, errors: errors, warnings: warnings };
  }

  /**
   * Re-validate an already-parsed (and possibly hand-edited) question
   * list. Used by the Preview screen every time the user edits, deletes,
   * reorders or adds a question, and before "Start Mock" is enabled.
   */
  function validateQuestions(questions) {
    var errors = [];
    var warnings = [];

    var seenNumbers = {};
    var dupeNumbers = {};
    questions.forEach(function (q) {
      if (seenNumbers[q.number]) dupeNumbers[q.number] = true;
      seenNumbers[q.number] = true;
    });

    questions.forEach(function (q) {
      var loc = 'Q' + q.number;
      if (dupeNumbers[q.number]) errors.push(loc + ': Duplicate question number.');
      if (!q.part) errors.push(loc + ': Part not set.');
      if (!q.options || q.options.length !== 4) {
        errors.push(loc + ': Needs exactly four options (found ' + (q.options ? q.options.length : 0) + ').');
      }
      if (!q.type) errors.push(loc + ': Question type (MCQ/MSQ) not set.');
      if (!q.question || !q.question.trim()) errors.push(loc + ': Question text is empty.');
      if (q.options) {
        q.options.forEach(function (o) {
          if (!o.text || !o.text.trim()) errors.push(loc + ': Option (' + o.label + ') is empty.');
        });
      }
      if (!q.correctAnswer || !q.correctAnswer.length) {
        warnings.push(loc + ': Correct answer not set.');
      } else if (q.type === 'MCQ' && q.correctAnswer.length > 1) {
        errors.push(loc + ': MCQ must have exactly one correct answer.');
      }
    });

    ['A', 'B', 'C'].forEach(function (p) {
      var count = questions.filter(function (q) { return q.part === p; }).length;
      if (count !== REQUIRED_COUNTS[p]) {
        errors.push('Part ' + p + ': ' + count + ' / ' + REQUIRED_COUNTS[p] + ' questions.');
      }
    });

    if (questions.length !== TOTAL_REQUIRED) {
      errors.push('Total: ' + questions.length + ' / ' + TOTAL_REQUIRED + ' questions.');
    }

    return { errors: errors, warnings: warnings, ready: errors.length === 0 };
  }

  function partCounts(questions) {
    var counts = { A: 0, B: 0, C: 0 };
    questions.forEach(function (q) {
      if (counts.hasOwnProperty(q.part)) counts[q.part]++;
    });
    return counts;
  }

  var MockParser = {
    parseInput: parseInput,
    validateQuestions: validateQuestions,
    partCounts: partCounts,
    REQUIRED_COUNTS: REQUIRED_COUNTS,
    TOTAL_REQUIRED: TOTAL_REQUIRED
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MockParser;
  } else {
    global.MockParser = MockParser;
  }
})(typeof window !== 'undefined' ? window : this);
