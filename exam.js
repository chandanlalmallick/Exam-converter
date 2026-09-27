/**
 * exam.js
 * Renders and drives the live timed exam inside #exam-root. Talks to
 * Scoring (marking) and MockStorage (attempt persistence) but owns no
 * DOM outside #exam-root.
 */
(function (global) {
  'use strict';

  var DURATION_MS = 180 * 60 * 1000; // 03:00:00

  var root = null;         // #exam-root element, set on init
  var mock = null;         // { title, questions }
  var attempt = null;      // live attempt state
  var timerHandle = null;
  var onSubmitCallback = null;
  var currentPartFilter = 'A';
  var paletteOpen = false;

  function byId(qid) {
    return mock.questions.find(function (q) { return q.id === qid; });
  }

  function formatTime(ms) {
    if (ms < 0) ms = 0;
    var totalSeconds = Math.floor(ms / 1000);
    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds % 3600) / 60);
    var s = totalSeconds % 60;
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  function persist() {
    global.MockStorage.saveAttempt({
      mockTitle: mock.title,
      answers: attempt.answers,
      marked: attempt.marked,
      currentId: attempt.currentId,
      startedAt: attempt.startedAt,
      endAt: attempt.endAt,
      submitted: attempt.submitted
    });
  }

  function questionState(q) {
    var hasAnswer = (attempt.answers[q.id] || []).length > 0;
    var isMarked = !!attempt.marked[q.id];
    if (hasAnswer && isMarked) return 'answered-marked';
    if (hasAnswer) return 'answered';
    if (isMarked) return 'marked';
    return 'unattempted';
  }

  function partQuestions(part) {
    return mock.questions.filter(function (q) { return q.part === part; })
      .sort(function (a, b) { return a.number - b.number; });
  }

  /* ---------------- Public API ---------------- */

  function init(rootEl, mockData, callbacks) {
    root = rootEl;
    mock = mockData;
    onSubmitCallback = (callbacks && callbacks.onSubmit) || function () {};
  }

  function hasResumableAttempt(mockData) {
    var saved = global.MockStorage.loadAttempt();
    if (!saved || saved.submitted) return null;
    if (saved.mockTitle !== mockData.title) return null;
    if (Date.now() >= saved.endAt) return null; // expired — treat as not resumable
    return saved;
  }

  function startFresh() {
    var now = Date.now();
    attempt = {
      answers: {},
      marked: {},
      currentId: mock.questions[0].id,
      startedAt: now,
      endAt: now + DURATION_MS,
      submitted: false
    };
    currentPartFilter = mock.questions[0].part;
    persist();
    renderShell();
    startTimer();
  }

  function resume(saved) {
    attempt = {
      answers: saved.answers || {},
      marked: saved.marked || {},
      currentId: saved.currentId || mock.questions[0].id,
      startedAt: saved.startedAt,
      endAt: saved.endAt,
      submitted: false
    };
    var cur = byId(attempt.currentId) || mock.questions[0];
    currentPartFilter = cur.part;
    renderShell();
    startTimer();
  }

  function startTimer() {
    stopTimer();
    tick();
    timerHandle = global.setInterval(tick, 1000);
  }

  function stopTimer() {
    if (timerHandle) { global.clearInterval(timerHandle); timerHandle = null; }
  }

  function tick() {
    var remaining = attempt.endAt - Date.now();
    var timerEl = global.document.getElementById('exam-timer');
    if (timerEl) {
      timerEl.textContent = formatTime(remaining);
      timerEl.classList.toggle('is-low', remaining <= 5 * 60 * 1000);
    }
    if (remaining <= 0) {
      submit(true);
    }
  }

  /* ---------------- Rendering ---------------- */

  function renderShell() {
    var partCounts = { A: partQuestions('A').length, B: partQuestions('B').length, C: partQuestions('C').length };

    var html = '<div class="exam-shell">';
    html += '<div class="exam-topbar">';
    html += '<div class="exam-topbar__title">' + escapeHtml(mock.title) + '</div>';
    html += '<div class="exam-timer" id="exam-timer">03:00:00</div>';
    html += '<button class="btn btn--primary btn--sm" id="btn-submit-mock" type="button">Submit Mock</button>';
    html += '</div>';

    html += '<div class="exam-part-tabs">';
    ['A', 'B', 'C'].forEach(function (p) {
      html += '<button class="exam-part-tab' + (p === currentPartFilter ? ' is-active' : '') +
        '" data-part-tab="' + p + '" type="button">Part ' + p + ' <span class="exam-part-progress-inline">(' + partCounts[p] + ')</span></button>';
    });
    html += '</div>';

    html += '<div class="exam-body">';
    html += '<div class="exam-question-area" id="exam-question-area"></div>';
    html += '<button class="btn btn--primary exam-palette-toggle" id="btn-toggle-palette" type="button">Questions</button>';
    html += '<div class="exam-palette" id="exam-palette"></div>';
    html += '</div>';
    html += '</div>';

    root.innerHTML = html;

    global.document.getElementById('btn-submit-mock').addEventListener('click', function () {
      confirmSubmit();
    });
    root.querySelector('.exam-part-tabs').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-part-tab]');
      if (!btn) return;
      currentPartFilter = btn.getAttribute('data-part-tab');
      var firstOfPart = partQuestions(currentPartFilter)[0];
      if (firstOfPart) attempt.currentId = firstOfPart.id;
      root.querySelectorAll('.exam-part-tab').forEach(function (t) { t.classList.remove('is-active'); });
      btn.classList.add('is-active');
      renderQuestion();
      renderPalette();
      persist();
    });
    global.document.getElementById('btn-toggle-palette').addEventListener('click', function () {
      paletteOpen = !paletteOpen;
      global.document.getElementById('exam-palette').classList.toggle('is-open', paletteOpen);
    });

    renderQuestion();
    renderPalette();
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderQuestion() {
    var q = byId(attempt.currentId);
    if (!q) return;
    var area = global.document.getElementById('exam-question-area');
    var selected = attempt.answers[q.id] || [];
    var isMarked = !!attempt.marked[q.id];
    var inputType = q.type === 'MSQ' ? 'checkbox' : 'radio';

    var html = '<h3>Part ' + q.part + ' &middot; Question ' + q.number + ' of 60 &middot; ' + q.type + '</h3>';
    html += '<div class="exam-q-text" id="exam-q-text">' + escapeHtml(q.question) + '</div>';
    html += '<div class="exam-options" id="exam-options">';
    q.options.forEach(function (opt) {
      var isSel = selected.indexOf(opt.label) !== -1;
      html += '<label class="exam-option' + (isSel ? ' is-selected' : '') + '" data-option-label="' + opt.label + '">';
      html += '<input type="' + inputType + '" name="opt-' + q.id + '" value="' + opt.label + '"' + (isSel ? ' checked' : '') + '>';
      html += '<span class="exam-option__text"><strong>(' + opt.label + ')</strong> ' + escapeHtml(opt.text) + '</span>';
      html += '</label>';
    });
    html += '</div>';

    html += '<div class="exam-controls">';
    html += '<button class="btn btn--ghost" id="btn-prev" type="button">&larr; Previous</button>';
    html += '<button class="btn btn--ghost" id="btn-next" type="button">Next &rarr;</button>';
    html += '<button class="btn btn--ghost" id="btn-mark" type="button">' + (isMarked ? 'Unmark' : 'Mark for Review') + '</button>';
    html += '<button class="btn btn--ghost btn--danger" id="btn-clear" type="button">Clear Response</button>';
    html += '</div>';

    area.innerHTML = html;
    if (global.MathRender) global.MathRender.render(area);

    area.querySelectorAll('.exam-option input').forEach(function (input) {
      input.addEventListener('change', function () { onOptionChange(q, input); });
    });
    global.document.getElementById('btn-prev').addEventListener('click', function () { navigate(-1); });
    global.document.getElementById('btn-next').addEventListener('click', function () { navigate(1); });
    global.document.getElementById('btn-mark').addEventListener('click', function () {
      attempt.marked[q.id] = !attempt.marked[q.id];
      persist();
      renderQuestion();
      renderPalette();
    });
    global.document.getElementById('btn-clear').addEventListener('click', function () {
      attempt.answers[q.id] = [];
      persist();
      renderQuestion();
      renderPalette();
    });
  }

  function onOptionChange(q, input) {
    var label = input.value;
    if (q.type === 'MSQ') {
      var cur = attempt.answers[q.id] ? attempt.answers[q.id].slice() : [];
      var idx = cur.indexOf(label);
      if (input.checked && idx === -1) cur.push(label);
      if (!input.checked && idx !== -1) cur.splice(idx, 1);
      attempt.answers[q.id] = cur;
    } else {
      attempt.answers[q.id] = [label];
    }
    persist();
    // Update selected styling without a full re-render so focus/scroll is stable.
    var area = global.document.getElementById('exam-options');
    area.querySelectorAll('.exam-option').forEach(function (row) {
      var lbl = row.getAttribute('data-option-label');
      row.classList.toggle('is-selected', (attempt.answers[q.id] || []).indexOf(lbl) !== -1);
    });
    renderPalette();
  }

  function navigate(dir) {
    var list = partQuestions(currentPartFilter);
    var idx = list.findIndex(function (q) { return q.id === attempt.currentId; });
    var newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= list.length) return; // stay within current part
    attempt.currentId = list[newIdx].id;
    persist();
    renderQuestion();
    renderPalette();
  }

  function jumpTo(qid) {
    var q = byId(qid);
    if (!q) return;
    currentPartFilter = q.part;
    attempt.currentId = qid;
    root.querySelectorAll('.exam-part-tab').forEach(function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-part-tab') === currentPartFilter);
    });
    renderQuestion();
    renderPalette();
    persist();
    paletteOpen = false;
    var pal = global.document.getElementById('exam-palette');
    if (pal) pal.classList.remove('is-open');
  }

  function renderPalette() {
    var pal = global.document.getElementById('exam-palette');
    if (!pal) return;
    var list = partQuestions(currentPartFilter);
    var html = '<h4>Part ' + currentPartFilter + ' questions</h4><div class="palette-grid">';
    list.forEach(function (q) {
      var state = questionState(q);
      var isCurrent = q.id === attempt.currentId;
      html += '<button class="palette-btn st-' + state + (isCurrent ? ' is-current' : '') +
        '" data-jump="' + q.id + '" type="button" title="Question ' + q.number + '">' + q.number + '</button>';
    });
    html += '</div>';
    html += '<div class="palette-legend">';
    html += legendRow('st-unattempted', 'Unattempted');
    html += legendRow('st-answered', 'Answered');
    html += legendRow('st-marked', 'Marked for review');
    html += legendRow('st-answered-marked', 'Answered + marked');
    html += '</div>';

    var counts = { unattempted: 0, answered: 0, marked: 0, 'answered-marked': 0 };
    mock.questions.forEach(function (q) { counts[questionState(q)]++; });
    html += '<div class="exam-part-progress">Overall: ' + counts.answered + counts['answered-marked'] +
      ' answered &middot; ' + (counts.unattempted + counts.marked) + ' remaining</div>';

    pal.innerHTML = html;
    pal.querySelectorAll('[data-jump]').forEach(function (btn) {
      btn.addEventListener('click', function () { jumpTo(btn.getAttribute('data-jump')); });
    });
  }

  function legendRow(cls, label) {
    return '<div class="palette-legend__item"><span class="palette-legend__swatch ' + cls + '"></span>' + label + '</div>';
  }

  function confirmSubmit() {
    var unanswered = mock.questions.length - Object.keys(attempt.answers).filter(function (id) {
      return (attempt.answers[id] || []).length > 0;
    }).length;
    var msg = 'Submit the mock now?';
    if (unanswered > 0) msg = unanswered + ' question(s) are still unattempted. ' + msg;
    if (global.confirm(msg)) submit(false);
  }

  function submit(isAutoSubmit) {
    if (attempt.submitted) return;
    attempt.submitted = true;
    stopTimer();
    var timeUsedSeconds = isAutoSubmit
      ? Math.round(DURATION_MS / 1000)
      : Math.round((Date.now() - attempt.startedAt) / 1000);
    var results = global.Scoring.scoreAttempt(mock.questions, attempt.answers, timeUsedSeconds);
    global.MockStorage.clearAttempt();
    onSubmitCallback(results, { isAutoSubmit: !!isAutoSubmit });
  }

  global.Exam = {
    init: init,
    hasResumableAttempt: hasResumableAttempt,
    startFresh: startFresh,
    resume: resume
  };
})(typeof window !== 'undefined' ? window : this);
