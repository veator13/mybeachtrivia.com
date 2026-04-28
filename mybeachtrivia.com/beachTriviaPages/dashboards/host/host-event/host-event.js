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

  const gameFrameView = document.getElementById('game-frame-view');
  const contentGrid = document.querySelector('.content-grid');
  const gameIframe = document.getElementById('game-iframe');
  const gameLabel = document.getElementById('game-label');
  const backToMenu = document.getElementById('back-to-menu');
  const pageStage = document.querySelector('.page-stage');

  function openGame(url, label) {
    gameIframe.src = url + '?t=' + Date.now();
    if (gameLabel) gameLabel.textContent = label;
    if (contentGrid) contentGrid.style.display = 'none';
    if (gameFrameView) gameFrameView.style.display = 'block';
    if (pageStage) pageStage.classList.add('game-open');
  }

  function closeGame() {
    if (gameFrameView) gameFrameView.style.display = 'none';
    if (contentGrid) contentGrid.style.display = 'grid';
    if (pageStage) pageStage.classList.remove('game-open');
    gameIframe.src = '';
  }

  function wireEvents() {
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        window.location.href = '/login.html';
      });
    }

    if (backToMenu) {
      backToMenu.addEventListener('click', closeGame);
    }

    document.addEventListener('click', function (e) {
      var tile = e.target.closest('[data-game-url]');
      if (!tile) return;
      openGame(tile.dataset.gameUrl, tile.dataset.gameName || '');
    });
  }

  wireEvents();

  document.addEventListener('DOMContentLoaded', function () {
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