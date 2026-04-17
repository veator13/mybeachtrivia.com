(function () {
  'use strict';

  const loading = document.getElementById('auth-loading');
  const error = document.getElementById('error-container');
  const errorText = document.getElementById('error-text');
  const pageShell = document.getElementById('page-shell');
  const backBtn = document.getElementById('back-to-login');

  function showPage() {
    if (loading) loading.style.display = 'none';
    if (error) error.style.display = 'none';
    if (pageShell) pageShell.style.display = 'block';
  }

  function showError(message) {
    if (loading) loading.style.display = 'none';
    if (pageShell) pageShell.style.display = 'none';
    if (errorText) {
      errorText.textContent = message || 'An error occurred. Please try again.';
    }
    if (error) error.style.display = 'flex';
  }

  function waitForFirebaseApp(timeoutMs) {
    return new Promise(function (resolve, reject) {
      const start = Date.now();

      function check() {
        try {
          if (
            typeof firebase !== 'undefined' &&
            Array.isArray(firebase.apps) &&
            firebase.apps.length > 0
          ) {
            resolve(firebase.app());
            return;
          }
        } catch (_) {}

        if (Date.now() - start >= timeoutMs) {
          reject(new Error('Firebase app initialization timed out.'));
          return;
        }

        setTimeout(check, 50);
      }

      check();
    });
  }

  function wireEvents() {
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        window.location.href = '/login.html';
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireEvents();

    waitForFirebaseApp(5000)
      .then(function () {
        setTimeout(showPage, 300);
      })
      .catch(function (err) {
        console.error('[host-event] bootstrap error:', err);
        showError('Unable to load the Host Event page. Please try again.');
      });
  });
})();