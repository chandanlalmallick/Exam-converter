/**
 * scoring.js
 * Pure functions for marking a mock attempt. No DOM access, so this can
 * be unit tested directly in Node as well as used in the browser.
 */
(function (global) {
  'use strict';

  var MARKING = {
    A: { correct: 2, incorrect: -0.5 },
    B: { correct: 3, incorrect: -0.75 },
    C: { correct: 4.75, incorrect: 0 }
  };
  var MAX_TOTAL = 200; // 15*2 + 25*3 + 20*4.75

  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    var sa = a.slice().sort();
    var sb = b.slice().sort();
    for (var i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
    return true;
  }

  /**
   * @param questions array of {id, part, number, type, correctAnswer}
   * @param answers   map of questionId -> array of selected option labels
   * @param timeUsedSeconds seconds actually used (for display only)
   */
  function scoreAttempt(questions, answers, timeUsedSeconds) {
    var parts = { A: emptyPart(), B: emptyPart(), C: emptyPart() };

    questions.forEach(function (q) {
      var selected = (answers && answers[q.id]) || [];
      var bucket = parts[q.part];
      if (!bucket) return; // defensive: ignore anything with no valid part
      bucket.total++;

      if (!selected.length) {
        bucket.unattempted++;
        return;
      }

      var isCorrect = sameSet(selected, q.correctAnswer || []);
      if (isCorrect) {
        bucket.correct++;
        bucket.marks += MARKING[q.part].correct;
      } else {
        bucket.wrong++;
        bucket.marks += MARKING[q.part].incorrect;
      }
    });

    var overall = { correct: 0, wrong: 0, unattempted: 0, total: 0, marks: 0 };
    ['A', 'B', 'C'].forEach(function (p) {
      overall.correct += parts[p].correct;
      overall.wrong += parts[p].wrong;
      overall.unattempted += parts[p].unattempted;
      overall.total += parts[p].total;
      overall.marks += parts[p].marks;
    });
    overall.marks = round2(overall.marks);
    ['A', 'B', 'C'].forEach(function (p) { parts[p].marks = round2(parts[p].marks); });

    var attempted = overall.correct + overall.wrong;
    var accuracy = attempted > 0 ? round2((overall.correct / attempted) * 100) : 0;

    return {
      parts: parts,
      overall: overall,
      accuracy: accuracy,
      maxMarks: MAX_TOTAL,
      timeUsedSeconds: timeUsedSeconds || 0
    };
  }

  function emptyPart() {
    return { total: 0, correct: 0, wrong: 0, unattempted: 0, marks: 0 };
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  var Scoring = { scoreAttempt: scoreAttempt, MARKING: MARKING, MAX_TOTAL: MAX_TOTAL };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Scoring;
  } else {
    global.Scoring = Scoring;
  }
})(typeof window !== 'undefined' ? window : this);
