/**
 * pdfExport.js
 * Builds a question-only (no answers) printable paper into #print-root,
 * shared by both "Print Mock" (window.print) and "Download Mock for
 * Offline Practice" (html2pdf). Never includes correctAnswer.
 */
(function (global) {
  'use strict';

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function groupByPart(questions) {
    var groups = { A: [], B: [], C: [] };
    questions.forEach(function (q) {
      if (groups[q.part]) groups[q.part].push(q);
    });
    ['A', 'B', 'C'].forEach(function (p) {
      groups[p].sort(function (a, b) { return a.number - b.number; });
    });
    return groups;
  }

  function buildPrintablePaper(title, questions) {
    var root = global.document.getElementById('print-root');
    if (!root) return null;

    var groups = groupByPart(questions);
    var partLabels = { A: 'Part A', B: 'Part B', C: 'Part C' };

    var html = '<div class="print-paper">';
    html += '<div class="print-paper__title">' + escapeHtml(title) + '</div>';
    html += '<div class="print-paper__subtitle">Question Paper — Offline Practice Copy</div>';
    html += '<div class="print-paper__meta">' + questions.length + ' questions &middot; Answers not included</div>';

    ['A', 'B', 'C'].forEach(function (p) {
      if (!groups[p].length) return;
      html += '<div class="print-part-title">' + partLabels[p] + '</div>';
      groups[p].forEach(function (q) {
        html += '<div class="print-q">';
        html += '<span class="print-q__num">Q' + q.number + '.</span>';
        html += '<span class="print-q__text">' + escapeHtml(q.question) + '</span>';
        if (q.type) html += '<span class="print-q__type">[' + q.type + ']</span>';
        html += '<div class="print-q__options">';
        (q.options || []).forEach(function (o) {
          html += '<div class="print-q__option">(' + o.label + ') ' + escapeHtml(o.text) + '</div>';
        });
        html += '</div></div>';
      });
    });

    html += '</div>';
    root.innerHTML = html;
    if (global.MathRender) global.MathRender.render(root);
    return root;
  }

  function withFontsReady(cb) {
    if (global.document.fonts && global.document.fonts.ready) {
      global.document.fonts.ready.then(cb).catch(cb);
    } else {
      setTimeout(cb, 50);
    }
  }

  function printMock(title, questions) {
    buildPrintablePaper(title, questions);
    withFontsReady(function () {
      setTimeout(function () { global.window.print(); }, 60);
    });
  }

  function downloadPdf(title, questions, onDone) {
    var el = buildPrintablePaper(title, questions);
    if (!el) { if (onDone) onDone(false, 'Could not build the question paper.'); return; }

    if (typeof global.html2pdf !== 'function') {
      if (onDone) onDone(false, 'The PDF library did not load (check your internet connection). Use "Print Mock" instead, then choose "Save as PDF" in the print dialog.');
      return;
    }

    withFontsReady(function () {
      setTimeout(function () {
        var filename = (title || 'mock').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'mock';
        var opts = {
          margin: [12, 10, 14, 10],
          filename: filename + '-question-paper.pdf',
          image: { type: 'jpeg', quality: 0.96 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] }
        };
        global.html2pdf().set(opts).from(el).save()
          .then(function () { if (onDone) onDone(true); })
          .catch(function (err) {
            console.error('PDF generation failed', err);
            if (onDone) onDone(false, 'PDF generation failed. Try "Print Mock" and save as PDF from the print dialog instead.');
          });
      }, 80);
    });
  }

  global.PdfExport = {
    buildPrintablePaper: buildPrintablePaper,
    printMock: printMock,
    downloadPdf: downloadPdf
  };
})(typeof window !== 'undefined' ? window : this);
