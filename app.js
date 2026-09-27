/**
 * app.js
 * Top-level orchestrator: owns the in-memory State object, wires up every
 * button in the dashboard, and renders the Preview editor. parser.js /
 * scoring.js / storage.js / exam.js / pdfExport.js do the actual work;
 * this file is glue + DOM rendering for everything outside the exam.
 */
(function () {
  'use strict';

  var DEFAULT_TITLE = 'CSIR-NET Mathematical Sciences Mock Test';

  var State = {
    title: DEFAULT_TITLE,
    questions: [],      // working list shown in Preview (post-parse, editable)
    parseErrors: [],
    parseWarnings: [],
    mock: null,         // finalized { title, questions } once "Create Mock" is clicked
    lastResults: null,  // Scoring result after a submitted attempt
    editingQuestionId: null
  };

  var EXAMPLE_TEXT = [
    'PART A',
    '',
    'Q1. Evaluate',
    '\\[',
    '\\lim_{x\\to0}\\frac{\\sin x}{x}.',
    '\\]',
    '',
    '(A) 0',
    '(B) 1',
    '(C) \\(\\infty\\)',
    '(D) Does not exist',
    '',
    'TYPE: MCQ',
    'Correct Answer: B',
    '',
    'Q2. Which of the following sets are subsets of \\(\\mathbb{R}\\)?',
    '',
    '(A) \\(\\mathbb{Q}\\)',
    '(B) \\(\\mathbb{Z}\\)',
    '(C) \\(\\mathbb{C}\\)',
    '(D) \\(\\mathbb{N}\\)',
    '',
    'TYPE: MSQ',
    'Correct Answer: A,B,D',
    '',
    '(... continue Part A up to Q15 ...)',
    '',
    'PART B',
    '',
    'Q16. Let',
    '\\[',
    'A =',
    '\\begin{pmatrix}',
    '1 & 2\\\\',
    '3 & 4',
    '\\end{pmatrix}.',
    '\\]',
    'Then \\(\\det(A)\\) equals',
    '',
    '(A) -2',
    '(B) 2',
    '(C) 10',
    '(D) 0',
    '',
    'TYPE: MCQ',
    'Correct Answer: A',
    '',
    '(... continue Part B up to Q40 ...)',
    '',
    'PART C',
    '',
    'Q41. Let \\(T:V\\to V\\) be a linear operator on a finite dimensional space. Which statements are true?',
    '',
    '(A) \\(T\\) has an eigenvalue if \\(V\\) is over \\(\\mathbb{C}\\)',
    '(B) \\(\\ker T\\) is always trivial',
    '(C) \\(\\operatorname{rank}(T)+\\operatorname{nullity}(T)=\\dim V\\)',
    '(D) \\(T\\) is always invertible',
    '',
    'TYPE: MSQ',
    'Correct Answer: A,C',
    '',
    '(... continue Part C up to Q60 ...)'
  ].join('\n');

  /* ---------------- Toasts ---------------- */

  function showToast(message, type, duration) {
    var region = document.getElementById('toast-region');
    if (!region) return;
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = message;
    region.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, duration || 3200);
  }
  window.showToast = showToast;

  /* ---------------- Navigation ---------------- */

  var PANELS = ['create', 'input', 'preview', 'exam', 'results', 'pdf'];

  function panelEnabled(name) {
    switch (name) {
      case 'create': return true;
      case 'input': return true;
      case 'preview': return State.questions.length > 0;
      case 'exam': return !!State.mock;
      case 'results': return !!State.lastResults;
      case 'pdf': return !!State.mock;
      default: return false;
    }
  }

  function refreshNav() {
    PANELS.forEach(function (name) {
      var btn = document.querySelector('.app-nav__item[data-nav="' + name + '"]');
      if (!btn) return;
      btn.disabled = !panelEnabled(name);
    });
  }

  function showPanel(name) {
    if (!panelEnabled(name)) {
      showToast('Complete the previous step first.', 'warn');
      return;
    }
    PANELS.forEach(function (p) {
      var el = document.getElementById('panel-' + p);
      if (el) el.hidden = (p !== name);
    });
    document.querySelectorAll('.app-nav__item').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-nav') === name);
    });
    if (name === 'preview') renderPreview();
    if (name === 'exam') renderExamStartScreen();
    if (name === 'results') renderResults();
    if (name === 'pdf') renderPdfPanel();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  /* ---------------- Draft autosave (Question Input panel) ---------------- */

  var draftSaveTimer = null;
  function scheduleDraftAutosave() {
    if (draftSaveTimer) clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(function () {
      var text = document.getElementById('question-textarea').value;
      var title = document.getElementById('mock-title-input').value || DEFAULT_TITLE;
      window.MockStorage.saveDraft(title, text);
      setDraftStatus('Draft autosaved ' + new Date().toLocaleTimeString());
    }, 700);
  }

  function setDraftStatus(msg) {
    var el = document.getElementById('draft-status');
    if (el) el.textContent = msg;
  }

  /* ---------------- Preview / validation rendering ---------------- */

  function renumber() {
    var groups = {
      A: State.questions.filter(function (q) { return q.part === 'A'; }),
      B: State.questions.filter(function (q) { return q.part === 'B'; }),
      C: State.questions.filter(function (q) { return q.part === 'C'; }),
      other: State.questions.filter(function (q) { return q.part !== 'A' && q.part !== 'B' && q.part !== 'C'; })
    };
    var n = 1;
    groups.A.forEach(function (q) { q.number = n++; });
    groups.B.forEach(function (q) { q.number = n++; });
    groups.C.forEach(function (q) { q.number = n++; });
    groups.other.forEach(function (q) { q.number = n++; });
  }

  function renderPreview() {
    var validation = window.MockParser.validateQuestions(State.questions);
    var counts = window.MockParser.partCounts(State.questions);
    var req = window.MockParser.REQUIRED_COUNTS;

    var dash = document.getElementById('validation-dashboard');
    var statusOk = validation.ready;
    var html = '<div class="status-banner ' + (statusOk ? 'is-ready' : 'is-blocked') + '">' +
      (statusOk ? '\u2713 Ready to create mock' : '\u26A0 Fix errors before continuing') + '</div>';
    html += statCard('Questions', State.questions.length + ' / ' + window.MockParser.TOTAL_REQUIRED, State.questions.length === window.MockParser.TOTAL_REQUIRED);
    html += statCard('Part A', counts.A + ' / ' + req.A, counts.A === req.A);
    html += statCard('Part B', counts.B + ' / ' + req.B, counts.B === req.B);
    html += statCard('Part C', counts.C + ' / ' + req.C, counts.C === req.C);
    dash.innerHTML = html;

    var issues = document.getElementById('issue-list');
    var ihtml = '';
    validation.errors.forEach(function (e) { ihtml += '<div class="issue-list__item is-error">' + escapeHtml(e) + '</div>'; });
    validation.warnings.forEach(function (w) { ihtml += '<div class="issue-list__item is-warning">' + escapeHtml(w) + '</div>'; });
    issues.innerHTML = ihtml;

    document.getElementById('preview-count').textContent = State.questions.length + ' question(s) loaded';
    document.getElementById('btn-create-mock').disabled = !statusOk;

    renderQuestionList();
  }

  function statCard(label, value, ok) {
    return '<div class="stat-card ' + (ok ? 'is-ok' : 'is-bad') + '">' +
      '<div class="stat-card__label">' + escapeHtml(label) + '</div>' +
      '<div class="stat-card__value">' + escapeHtml(value) + '</div></div>';
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function partBadgeClass(part) {
    if (part === 'A') return 'q-badge--part-a';
    if (part === 'B') return 'q-badge--part-b';
    if (part === 'C') return 'q-badge--part-c';
    return 'q-badge--missing';
  }

  function renderQuestionList() {
    var container = document.getElementById('question-list');
    var ordered = State.questions.slice().sort(function (a, b) { return (a.number || 0) - (b.number || 0); });
    var html = '';
    ordered.forEach(function (q) {
      html += renderQuestionCard(q);
    });
    container.innerHTML = html;
    if (window.MathRender) window.MathRender.render(container);
  }

  function renderQuestionCard(q) {
    var editing = State.editingQuestionId === q.id;
    var partLabel = q.part ? ('Part ' + q.part) : 'No part';
    var typeLabel = q.type || 'Type not set';

    var html = '<div class="q-card" data-qid="' + q.id + '">';
    html += '<div class="q-card__head">';
    html += '<span class="q-badge">Q' + q.number + '</span>';
    html += '<span class="q-badge ' + partBadgeClass(q.part) + '">' + partLabel + '</span>';
    html += '<span class="q-badge ' + (q.type ? 'q-badge--type' : 'q-badge--missing') + '">' + typeLabel + '</span>';
    html += '<span class="q-card__spacer"></span>';
    html += '<div class="q-card__tools">';
    html += '<button class="btn btn--sm btn--ghost" data-action="' + (editing ? 'save' : 'edit') + '" data-qid="' + q.id + '">' + (editing ? 'Save' : 'Edit') + '</button>';
    if (editing) html += '<button class="btn btn--sm btn--text" data-action="cancel-edit" data-qid="' + q.id + '">Cancel</button>';
    html += '<button class="btn btn--sm btn--ghost" data-action="move-up" data-qid="' + q.id + '">\u2191 Up</button>';
    html += '<button class="btn btn--sm btn--ghost" data-action="move-down" data-qid="' + q.id + '">\u2193 Down</button>';
    html += '<button class="btn btn--sm btn--ghost btn--danger" data-action="delete" data-qid="' + q.id + '">Delete</button>';
    html += '</div></div>';

    if (editing) {
      html += '<textarea class="question-textarea" style="min-height:110px" data-field="question" data-qid="' + q.id + '">' + escapeHtml(q.question) + '</textarea>';
      html += '<div class="q-options">';
      (q.options.length ? q.options : placeholderOptions()).forEach(function (o) {
        html += '<div class="q-option-row"><span class="q-option-row__label">(' + o.label + ')</span>' +
          '<textarea class="q-option-row__text field__input" style="min-height:44px" data-field="option" data-label="' + o.label + '" data-qid="' + q.id + '">' + escapeHtml(o.text) + '</textarea></div>';
      });
      html += '</div>';
    } else {
      html += '<div class="q-card__body-text">' + escapeHtml(q.question || '(empty — click Edit to add question text)') + '</div>';
      html += '<div class="q-options">';
      (q.options.length ? q.options : placeholderOptions()).forEach(function (o) {
        html += '<div class="q-option-row"><span class="q-option-row__label">(' + o.label + ')</span>' +
          '<span class="q-option-row__text">' + escapeHtml(o.text || '(empty)') + '</span></div>';
      });
      html += '</div>';
    }

    html += '<div class="q-card__meta-row">';
    html += '<label>Part <select data-field="part" data-qid="' + q.id + '">' +
      ['A', 'B', 'C'].map(function (p) { return '<option value="' + p + '"' + (q.part === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') +
      '</select></label>';
    html += '<label>Type <select data-field="type" data-qid="' + q.id + '">' +
      '<option value=""' + (!q.type ? ' selected' : '') + '>&mdash;</option>' +
      '<option value="MCQ"' + (q.type === 'MCQ' ? ' selected' : '') + '>MCQ</option>' +
      '<option value="MSQ"' + (q.type === 'MSQ' ? ' selected' : '') + '>MSQ</option>' +
      '</select></label>';
    html += '<label>Correct Answer <input class="q-card__answer-input" type="text" data-field="answer" data-qid="' + q.id + '" value="' + escapeHtml(q.correctAnswer.join(',')) + '" placeholder="e.g. B or A,C"></label>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  function placeholderOptions() {
    return ['A', 'B', 'C', 'D'].map(function (l) { return { label: l, text: '' }; });
  }

  function findQuestion(qid) {
    return State.questions.find(function (q) { return q.id === qid; });
  }

  /* Event delegation for the whole preview question list */
  function wireQuestionListDelegation() {
    var container = document.getElementById('question-list');

    container.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      var qid = btn.getAttribute('data-qid');

      if (action === 'edit') {
        State.editingQuestionId = qid;
        renderQuestionList();
      } else if (action === 'cancel-edit') {
        State.editingQuestionId = null;
        renderQuestionList();
      } else if (action === 'save') {
        commitEdit(qid);
        State.editingQuestionId = null;
        renderPreview();
      } else if (action === 'delete') {
        if (window.confirm('Delete Q' + findQuestion(qid).number + '? This cannot be undone.')) {
          State.questions = State.questions.filter(function (q) { return q.id !== qid; });
          renumber();
          renderPreview();
          showToast('Question deleted.', 'success');
        }
      } else if (action === 'move-up') {
        moveWithinPart(qid, -1);
        renderPreview();
      } else if (action === 'move-down') {
        moveWithinPart(qid, 1);
        renderPreview();
      }
    });

    container.addEventListener('change', function (e) {
      var field = e.target.getAttribute('data-field');
      if (!field) return;
      var qid = e.target.getAttribute('data-qid');
      var q = findQuestion(qid);
      if (!q) return;

      if (field === 'part') {
        q.part = e.target.value;
        renumber();
        renderPreview();
      } else if (field === 'type') {
        q.type = e.target.value || null;
        if (q.type === 'MCQ' && q.correctAnswer.length > 1) {
          q.correctAnswer = q.correctAnswer.slice(0, 1);
          showToast('MCQ allows only one correct answer — trimmed to the first.', 'warn');
        }
        renderPreview();
      } else if (field === 'answer') {
        var vals = e.target.value.split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean);
        q.correctAnswer = vals;
        renderPreview();
      }
    });
  }

  function commitEdit(qid) {
    var q = findQuestion(qid);
    if (!q) return;
    var container = document.getElementById('question-list');
    var qTextArea = container.querySelector('textarea[data-field="question"][data-qid="' + qid + '"]');
    if (qTextArea) q.question = qTextArea.value;
    var optionAreas = container.querySelectorAll('textarea[data-field="option"][data-qid="' + qid + '"]');
    if (!q.options.length) q.options = placeholderOptions();
    optionAreas.forEach(function (ta) {
      var label = ta.getAttribute('data-label');
      var opt = q.options.find(function (o) { return o.label === label; });
      if (opt) opt.text = ta.value;
    });
  }

  function moveWithinPart(qid, direction) {
    var q = findQuestion(qid);
    if (!q || !q.part) { showToast('Set a Part for this question before reordering.', 'warn'); return; }
    var partItems = State.questions.filter(function (x) { return x.part === q.part; });
    var idx = partItems.indexOf(q);
    var swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= partItems.length) return;
    var other = partItems[swapIdx];
    var mainIdxQ = State.questions.indexOf(q);
    var mainIdxOther = State.questions.indexOf(other);
    State.questions[mainIdxQ] = other;
    State.questions[mainIdxOther] = q;
    renumber();
  }

  function addQuestion() {
    var id = 'new_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    var q = { id: id, part: 'A', type: null, question: '', options: placeholderOptions(), correctAnswer: [] };
    State.questions.push(q);
    renumber();
    State.editingQuestionId = id;
    renderPreview();
    showToast('Blank question added — fill it in below.', 'success');
    setTimeout(function () {
      var card = document.querySelector('.q-card[data-qid="' + id + '"]');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }

  /* ---------------- Create Mock (finalize) ---------------- */

  function createMock() {
    var validation = window.MockParser.validateQuestions(State.questions);
    if (!validation.ready) {
      showToast('Fix the flagged errors before creating the mock.', 'error');
      return;
    }
    State.mock = {
      title: State.title,
      questions: JSON.parse(JSON.stringify(State.questions))
    };
    State.lastResults = null;
    window.MockStorage.saveMock(State.mock.title, State.mock.questions);
    window.MockStorage.clearAttempt();
    refreshNav();
    showToast('Mock created — ' + State.mock.questions.length + ' questions ready.', 'success');
    showPanel('exam');
  }

  /* ---------------- Exam wiring ---------------- */

  function renderExamStartScreen() {
    document.getElementById('exam-start-card').hidden = false;
    document.getElementById('exam-root').hidden = true;
    document.getElementById('exam-mock-title').textContent = State.mock ? State.mock.title : 'Ready to begin';

    var resumable = State.mock ? window.Exam.hasResumableAttempt(State.mock) : null;
    var note = document.getElementById('resume-note');
    var startBtn = document.getElementById('btn-start-mock');
    if (resumable) {
      note.hidden = false;
      note.innerHTML = 'An in-progress attempt was found from your last session. Click below to resume it, or ' +
        '<a href="#" id="link-discard-attempt">discard it and start fresh</a>.';
      startBtn.textContent = 'Resume Mock';
      startBtn.onclick = function () { launchExam(resumable); };
      var discardLink = document.getElementById('link-discard-attempt');
      if (discardLink) {
        discardLink.addEventListener('click', function (e) {
          e.preventDefault();
          window.MockStorage.clearAttempt();
          renderExamStartScreen();
        });
      }
    } else {
      note.hidden = true;
      startBtn.textContent = 'Start Mock';
      startBtn.onclick = function () { launchExam(null); };
    }
  }

  function launchExam(resumableAttempt) {
    if (!State.mock) return;
    var appShell = document.getElementById('app-shell');
    var examRoot = document.getElementById('exam-root');
    appShell.hidden = true;
    examRoot.hidden = false;

    window.Exam.init(examRoot, State.mock, {
      onSubmit: function (results, meta) {
        State.lastResults = results;
        appShell.hidden = false;
        examRoot.hidden = true;
        refreshNav();
        showPanel('results');
        showToast(meta.isAutoSubmit ? 'Time is up — your mock was submitted automatically.' : 'Mock submitted.', 'success', 4500);
      }
    });

    if (resumableAttempt) {
      window.Exam.resume(resumableAttempt);
    } else {
      window.Exam.startFresh();
    }
  }

  /* ---------------- Results ---------------- */

  function renderResults() {
    var r = State.lastResults;
    var root = document.getElementById('results-root');
    if (!r) { root.innerHTML = ''; return; }

    var totalSecs = r.timeUsedSeconds;
    var hrs = Math.floor(totalSecs / 3600);
    var mins = Math.floor((totalSecs % 3600) / 60);
    var secs = totalSecs % 60;
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    var timeUsedLabel = (hrs > 0 ? hrs + ':' : '') + (hrs > 0 ? pad2(mins) : mins) + ':' + pad2(secs);

    var html = '<div class="results-hero">';
    html += '<h2>Your Score</h2>';
    html += '<div class="results-hero__score">' + r.overall.marks + '</div>';
    html += '<div class="results-hero__max">out of ' + r.maxMarks + '</div>';
    html += '</div>';

    html += '<div class="results-grid">';
    ['A', 'B', 'C'].forEach(function (p) {
      var part = r.parts[p];
      html += '<div class="results-part-card"><h4>Part ' + p + '</h4><table>' +
        rowHtml('Marks', part.marks) +
        rowHtml('Correct', part.correct) +
        rowHtml('Wrong', part.wrong) +
        rowHtml('Unattempted', part.unattempted) +
        '</table></div>';
    });
    html += '</div>';

    html += '<div class="results-overall">';
    html += overallRow('Correct', r.overall.correct);
    html += overallRow('Wrong', r.overall.wrong);
    html += overallRow('Unattempted', r.overall.unattempted);
    html += overallRow('Accuracy', r.accuracy + '%');
    html += overallRow('Time Used', timeUsedLabel);
    html += '</div>';

    html += '<div class="panel__actions">';
    html += '<button class="btn btn--ghost" id="btn-results-to-pdf" type="button">Go to Offline PDF</button>';
    html += '<button class="btn btn--primary" id="btn-results-restart" type="button">Back to Dashboard</button>';
    html += '</div>';

    root.innerHTML = html;
    document.getElementById('btn-results-to-pdf').addEventListener('click', function () { showPanel('pdf'); });
    document.getElementById('btn-results-restart').addEventListener('click', function () { showPanel('create'); });
  }

  function rowHtml(label, value) {
    return '<tr><td>' + escapeHtml(label) + '</td><td>' + escapeHtml(String(value)) + '</td></tr>';
  }
  function overallRow(label, value) {
    return '<div class="results-overall__row"><span>' + escapeHtml(label) + '</span><span>' + escapeHtml(String(value)) + '</span></div>';
  }

  /* ---------------- PDF / Print panel ---------------- */

  function renderPdfPanel() {
    document.getElementById('pdf-status').textContent = '';
  }

  function wirePdfButtons() {
    document.getElementById('btn-download-pdf').addEventListener('click', function () {
      if (!State.mock) return;
      var statusEl = document.getElementById('pdf-status');
      statusEl.textContent = 'Preparing PDF\u2026';
      window.PdfExport.downloadPdf(State.mock.title, State.mock.questions, function (ok, msg) {
        statusEl.textContent = ok ? 'PDF downloaded.' : (msg || 'PDF generation failed.');
        if (!ok) showToast(msg || 'PDF generation failed.', 'error', 5000);
      });
    });
    document.getElementById('btn-print-mock').addEventListener('click', function () {
      if (!State.mock) return;
      window.PdfExport.printMock(State.mock.title, State.mock.questions);
    });
  }

  /* ---------------- Import / Export ---------------- */

  function exportMock() {
    if (!State.questions.length) { showToast('Nothing to export yet.', 'warn'); return; }
    var json = window.MockStorage.exportMockAsJson(State.title, State.questions);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (State.title || 'mock').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Mock exported as JSON.', 'success');
  }

  function importMock(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var result = window.MockStorage.parseImportedJson(String(reader.result));
      if (!result.ok) {
        showToast(result.error, 'error', 5000);
        return;
      }
      State.title = result.title;
      State.questions = result.questions.map(function (q, i) {
        return Object.assign({
          id: q.id || ('imp_' + i + '_' + Date.now()),
          part: q.part || null,
          number: q.number || (i + 1),
          type: q.type || null,
          question: q.question || '',
          options: Array.isArray(q.options) ? q.options : [],
          correctAnswer: Array.isArray(q.correctAnswer) ? q.correctAnswer : []
        }, {});
      });
      document.getElementById('mock-title-input').value = State.title;
      showToast('Mock imported: ' + State.questions.length + ' question(s).', 'success');
      showPanel('preview');
    };
    reader.onerror = function () {
      showToast('Could not read that file.', 'error');
    };
    reader.readAsText(file);
  }

  /* ---------------- Init ---------------- */

  function init() {
    // Nav
    document.querySelectorAll('.app-nav__item').forEach(function (btn) {
      btn.addEventListener('click', function () { showPanel(btn.getAttribute('data-nav')); });
    });

    // Create panel
    document.getElementById('mock-title-input').addEventListener('input', function (e) {
      State.title = e.target.value || DEFAULT_TITLE;
      scheduleDraftAutosave();
    });
    document.getElementById('btn-go-to-input').addEventListener('click', function () { showPanel('input'); });

    // Input panel
    var textarea = document.getElementById('question-textarea');
    textarea.addEventListener('input', scheduleDraftAutosave);
    document.getElementById('btn-back-to-create').addEventListener('click', function () { showPanel('create'); });
    document.getElementById('btn-load-example').addEventListener('click', function () {
      textarea.value = EXAMPLE_TEXT;
      scheduleDraftAutosave();
      showToast('Example format loaded. Replace the "(... continue ...)" placeholders with your real questions.', 'success', 5000);
    });
    document.getElementById('btn-save-draft').addEventListener('click', function () {
      window.MockStorage.saveDraft(State.title, textarea.value);
      setDraftStatus('Draft saved ' + new Date().toLocaleTimeString());
      showToast('Draft saved.', 'success');
    });
    document.getElementById('btn-load-draft').addEventListener('click', function () {
      var d = window.MockStorage.loadDraft();
      if (!d) { showToast('No saved draft found.', 'warn'); return; }
      textarea.value = d.rawText || '';
      State.title = d.title || DEFAULT_TITLE;
      document.getElementById('mock-title-input').value = State.title;
      showToast('Draft loaded.', 'success');
    });
    document.getElementById('btn-clear-draft').addEventListener('click', function () {
      if (!window.confirm('Clear your saved draft? This cannot be undone.')) return;
      window.MockStorage.clearDraft();
      setDraftStatus('Draft cleared.');
      showToast('Draft cleared.', 'success');
    });
    document.getElementById('btn-parse').addEventListener('click', function () {
      var result = window.MockParser.parseInput(textarea.value);
      State.questions = result.questions;
      State.parseErrors = result.errors;
      State.parseWarnings = result.warnings;
      State.editingQuestionId = null;
      window.MockStorage.saveDraft(State.title, textarea.value);
      refreshNav();
      showPanel('preview');
      if (result.errors.length) {
        showToast(result.errors.length + ' issue(s) found — see the list below.', 'warn', 4500);
      } else {
        showToast('Parsed successfully. Review the preview below.', 'success');
      }
    });

    // Preview panel
    wireQuestionListDelegation();
    document.getElementById('btn-add-question').addEventListener('click', addQuestion);
    document.getElementById('btn-back-to-input').addEventListener('click', function () { showPanel('input'); });
    document.getElementById('btn-create-mock').addEventListener('click', createMock);
    document.getElementById('btn-export-json').addEventListener('click', exportMock);
    document.getElementById('import-json-input').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (file) importMock(file);
      e.target.value = '';
    });

    // PDF panel
    wirePdfButtons();

    // Restore any previously saved mock/draft
    restoreFromStorage();
    refreshNav();
    showPanel('create');
  }

  function restoreFromStorage() {
    var savedMock = window.MockStorage.loadMock();
    if (savedMock && Array.isArray(savedMock.questions) && savedMock.questions.length) {
      State.mock = { title: savedMock.title, questions: savedMock.questions };
      State.title = savedMock.title;
      State.questions = JSON.parse(JSON.stringify(savedMock.questions));
      document.getElementById('mock-title-input').value = State.title;
      showToast('Restored your previously created mock.', 'success', 4000);
    } else {
      var draft = window.MockStorage.loadDraft();
      if (draft && draft.rawText) {
        document.getElementById('question-textarea').value = draft.rawText;
        State.title = draft.title || DEFAULT_TITLE;
        document.getElementById('mock-title-input').value = State.title;
        setDraftStatus('Restored draft from ' + new Date(draft.savedAt).toLocaleString());
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
