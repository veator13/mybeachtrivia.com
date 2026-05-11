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
  const scoresheetBtn = document.getElementById('scoresheet-btn');
  const scoresheetModal = document.getElementById('scoresheet-modal');
  const scoresheetModalIframe = document.getElementById('scoresheet-modal-iframe');
  const scoresheetModalClose = document.getElementById('scoresheet-modal-close');
  const scoresheetModalBackdrop = document.getElementById('scoresheet-modal-backdrop');
  const shareScoresBtn = document.getElementById('share-scores-btn');

  const SCORESHEET_URL = '/beachTriviaPages/dashboards/host/scoresheet/';

  const SCORESHEET_GAMES = new Set([
    'Classic Trivia',
    'Beach Feud',
    'Themed Trivia',
    'Mixed Events',
  ]);

  let scoresheetLoaded = false;
  let _sessionCode = null;
  let _sharing = false;
  let _pendingShare = false;

  // ── Scoresheet modal ───────────────────────────────────────────────────────

  function openScoresheet() {
    if (!scoresheetLoaded) {
      scoresheetModalIframe.src = SCORESHEET_URL;
      scoresheetLoaded = true;
    }
    scoresheetModal.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeScoresheet() {
    scoresheetModal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function openGame(url, label) {
    gameIframe.src = url + '?t=' + Date.now();
    if (gameLabel) gameLabel.textContent = label;
    if (contentGrid) contentGrid.style.display = 'none';
    if (gameFrameView) gameFrameView.style.display = 'block';
    if (pageStage) pageStage.classList.add('game-open');
    if (scoresheetBtn) scoresheetBtn.hidden = !SCORESHEET_GAMES.has(label);
    _sessionCode = null;
    _sharing = false;
    updateShareBtn();
  }

  function closeGame() {
    if (_sharing) stopSharingScores();
    closeScoresheet();
    if (gameFrameView) gameFrameView.style.display = 'none';
    if (contentGrid) contentGrid.style.display = 'grid';
    if (pageStage) pageStage.classList.remove('game-open');
    if (scoresheetBtn) scoresheetBtn.hidden = true;
    gameIframe.src = '';
    scoresheetLoaded = false;
    if (scoresheetModalIframe) scoresheetModalIframe.src = '';
    _sessionCode = null;
    _sharing = false;
    updateShareBtn();
  }

  // ── Share Scores ───────────────────────────────────────────────────────────

  function updateShareBtn() {
    if (!shareScoresBtn) return;
    if (_sharing) {
      shareScoresBtn.textContent = '⏹ Stop Sharing';
      shareScoresBtn.classList.add('sharing');
    } else {
      shareScoresBtn.textContent = '📺 Share Scores';
      shareScoresBtn.classList.remove('sharing');
    }
  }

  function requestSessionCode() {
    if (gameIframe && gameIframe.contentWindow) {
      gameIframe.contentWindow.postMessage({ type: 'BT_REQUEST_SESSION_CODE' }, '*');
    }
  }

  function requestStandings() {
    if (scoresheetModalIframe && scoresheetModalIframe.contentWindow) {
      scoresheetModalIframe.contentWindow.postMessage({ type: 'BT_REQUEST_STANDINGS' }, '*');
    }
  }

  function writeToFirestore(castMode, scoreboard) {
    if (!_sessionCode) return;
    try {
      const update = {
        castMode: castMode,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      if (scoreboard) update.scoreboard = scoreboard;
      firebase.firestore()
        .collection('liveSessions')
        .doc(_sessionCode)
        .set(update, { merge: true })
        .catch(function (err) {
          console.error('[host-event] share scores write failed:', err);
        });
    } catch (err) {
      console.error('[host-event] share scores:', err);
    }
  }

  function handleShareScores() {
    if (_sharing) {
      stopSharingScores();
      return;
    }
    _pendingShare = true;
    requestSessionCode();
    // If we already have the code, also request standings right away
    if (_sessionCode) {
      requestStandings();
    }
  }

  function stopSharingScores() {
    _sharing = false;
    updateShareBtn();
    writeToFirestore('slide', null);
  }

  // Listen for postMessage replies from the game iframe and scoresheet iframe
  window.addEventListener('message', function (e) {
    if (!e.data) return;

    if (e.data.type === 'BT_SESSION_CODE') {
      _sessionCode = e.data.code || null;
      if (_pendingShare && _sessionCode) {
        requestStandings();
      }
    }

    if (e.data.type === 'BT_STANDINGS_DATA') {
      _pendingShare = false;
      _sharing = true;
      updateShareBtn();
      writeToFirestore('scoresheet', e.data.standings || []);
    }
  });

  // ── Wire events ────────────────────────────────────────────────────────────

  function wireEvents() {
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        window.location.href = '/login.html';
      });
    }

    if (backToMenu) {
      backToMenu.addEventListener('click', closeGame);
    }

    if (scoresheetBtn) {
      scoresheetBtn.addEventListener('click', openScoresheet);
    }

    if (scoresheetModalClose) {
      scoresheetModalClose.addEventListener('click', closeScoresheet);
    }

    if (scoresheetModalBackdrop) {
      scoresheetModalBackdrop.addEventListener('click', closeScoresheet);
    }

    if (shareScoresBtn) {
      shareScoresBtn.addEventListener('click', handleShareScores);
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && scoresheetModal && !scoresheetModal.hidden) {
        closeScoresheet();
      }
    });

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
