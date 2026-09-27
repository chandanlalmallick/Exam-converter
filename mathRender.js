/**
 * mathRender.js
 * Thin, defensive wrapper around KaTeX's auto-render extension. Every
 * place in the app that shows question/option text calls MathRender.render(el)
 * afterwards. If the KaTeX CDN failed to load (offline, blocked, etc.) we
 * degrade to showing the raw LaTeX source rather than throwing — the
 * question text itself is never lost.
 */
(function (global) {
  'use strict';

  var warned = false;

  function available() {
    return typeof global.renderMathInElement === 'function' && typeof global.katex !== 'undefined';
  }

  function render(el) {
    if (!el) return;
    if (!available()) {
      if (!warned) {
        warned = true;
        if (typeof global.showToast === 'function') {
          global.showToast('Math rendering library did not load (check your internet connection). Showing raw LaTeX text instead.', 'warn', 6000);
        }
        var banner = global.document.getElementById('katex-fallback-banner');
        if (!banner) {
          banner = global.document.createElement('div');
          banner.id = 'katex-fallback-banner';
          banner.className = 'katex-fallback-banner';
          banner.textContent = 'Math rendering (KaTeX) could not load, so equations are shown as raw LaTeX below.';
          var main = global.document.querySelector('.app-main');
          if (main) main.insertBefore(banner, main.firstChild);
        }
      }
      return;
    }
    try {
      global.renderMathInElement(el, {
        delimiters: [
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false },
          { left: '$$', right: '$$', display: true }
        ],
        throwOnError: false
      });
    } catch (e) {
      console.warn('KaTeX render failed for an element', e);
    }
  }

  global.MathRender = { render: render, available: available };
})(typeof window !== 'undefined' ? window : this);
