/**
 * storage.js
 * Thin wrapper around localStorage. All keys are namespaced so this app
 * never collides with anything else on the same GitHub Pages origin.
 * Every call is wrapped in try/catch — private browsing / disabled
 * storage must never crash the app, just silently no-op.
 */
(function (global) {
  'use strict';

  var KEYS = {
    DRAFT: 'csirnet_mc_draft_v1',
    MOCK: 'csirnet_mc_mock_v1',
    ATTEMPT: 'csirnet_mc_attempt_v1'
  };

  function safeGet(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('Storage read failed for', key, e);
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage write failed for', key, e);
      return false;
    }
  }

  function safeRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      console.warn('Storage remove failed for', key, e);
    }
  }

  var Storage = {
    saveDraft: function (title, rawText) {
      return safeSet(KEYS.DRAFT, { title: title, rawText: rawText, savedAt: Date.now() });
    },
    loadDraft: function () {
      return safeGet(KEYS.DRAFT);
    },
    clearDraft: function () {
      safeRemove(KEYS.DRAFT);
    },

    saveMock: function (title, questions) {
      return safeSet(KEYS.MOCK, { title: title, questions: questions, savedAt: Date.now() });
    },
    loadMock: function () {
      return safeGet(KEYS.MOCK);
    },
    clearMock: function () {
      safeRemove(KEYS.MOCK);
    },

    saveAttempt: function (attempt) {
      return safeSet(KEYS.ATTEMPT, attempt);
    },
    loadAttempt: function () {
      return safeGet(KEYS.ATTEMPT);
    },
    clearAttempt: function () {
      safeRemove(KEYS.ATTEMPT);
    },

    exportMockAsJson: function (title, questions) {
      return JSON.stringify({
        format: 'csirnet-mock-converter',
        version: 1,
        title: title,
        exportedAt: new Date().toISOString(),
        questions: questions
      }, null, 2);
    },

    /**
     * Parses an imported JSON string. Returns { ok, title, questions, error }.
     */
    parseImportedJson: function (text) {
      var data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return { ok: false, error: 'That file is not valid JSON.' };
      }
      if (!data || !Array.isArray(data.questions)) {
        return { ok: false, error: 'This JSON file does not contain a "questions" array in the expected format.' };
      }
      return { ok: true, title: data.title || 'Imported Mock', questions: data.questions };
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
  } else {
    global.MockStorage = Storage;
  }
})(typeof window !== 'undefined' ? window : this);
