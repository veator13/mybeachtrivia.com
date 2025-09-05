/**
 * play-music-bingo/js/script.js
 * Player presence + heartbeat (Firestore primary, RTDB optional).
 * Requires Firebase compat scripts already loaded on the page:
 *  - firebase-app-compat.js
 *  - firebase-firestore-compat.js
 *  - firebase-database-compat.js  (optional for RTDB)
 */

(function () {
    // ---- Tunables ----
    const HEARTBEAT_MS = 30_000;
    const ACTIVE_WINDOW_MS = 65_000;
  
    // ---- Small utils ----
    const STORAGE = {
      playerId: 'btmb:playerId',
      displayName: 'btmb:displayName',
    };
  
    const $ = (s) => document.querySelector(s);
    const qp = (k) => new URLSearchParams(location.search).get(k);
  
    function getOrCreatePlayerId() {
      let id = localStorage.getItem(STORAGE.playerId);
      if (!id) {
        id = 'p_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
        localStorage.setItem(STORAGE.playerId, id);
      }
      return id;
    }
  
    function getDisplayName() {
      const input = $('#player-name');
      let name = (input && input.value.trim()) || localStorage.getItem(STORAGE.displayName);
      if (!name) {
        name = 'Player ' + Math.floor(100 + Math.random() * 900);
        localStorage.setItem(STORAGE.displayName, name);
      }
      if (input && !input.value) input.value = name;
      return name;
    }
  
    // ---- Firebase handles (compat only) ----
    function ensureFirebase() {
      if (!window.firebase) throw new Error('Firebase compat not found on page.');
      if (!firebase.firestore) throw new Error('Firebase Firestore compat not loaded.');
    }
    function fs() { return firebase.firestore(); }
    function rtdb() {
      if (!firebase.database) throw new Error('Firebase RTDB compat not loaded.');
      return firebase.database();
    }
  
    // ---- Presence state ----
    let hbTimer = null;
    let state = { gameId: null, playerId: null, displayName: null };
  
    async function joinGame(gameId) {
      ensureFirebase();
      if (!gameId) throw new Error('joinGame: missing gameId');
  
      state.gameId = gameId;
      state.playerId = getOrCreatePlayerId();
      state.displayName = getDisplayName();
  
      const playerDoc = fs()
        .collection('games').doc(gameId)
        .collection('players').doc(state.playerId);
  
      console.log('[player] joining', { gameId, playerId: state.playerId });
  
      // Firestore: upsert presence
      await playerDoc.set({
        name: state.displayName,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
        activeWindowMs: ACTIVE_WINDOW_MS,
        userAgent: navigator.userAgent || '',
      }, { merge: true });
  
      // Optional RTDB mirror (best-effort)
      try {
        rtdb().ref(`games/${gameId}/players/${state.playerId}`).update({
          name: state.displayName,
          lastActive: firebase.database.ServerValue.TIMESTAMP,
          ua: navigator.userAgent || '',
        });
      } catch (e) {
        console.debug('[player] RTDB mirror skipped:', e?.message || e);
      }
  
      startHeartbeat();
      setStatus('Joined game ✔︎');
    }
  
    function startHeartbeat() {
      stopHeartbeat();
      tickHeartbeat().catch((e) => console.warn('[heartbeat] first tick failed:', e));
      hbTimer = setInterval(() => {
        tickHeartbeat().catch((e) => console.warn('[heartbeat] tick failed:', e));
      }, HEARTBEAT_MS);
    }
  
    function stopHeartbeat() {
      if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    }
  
    async function tickHeartbeat() {
      if (!state.gameId || !state.playerId) return;
  
      // RTDB (optional)
      try {
        rtdb()
          .ref(`games/${state.gameId}/players/${state.playerId}/lastActive`)
          .set(firebase.database.ServerValue.TIMESTAMP);
      } catch (_) {}
  
      // Firestore (authoritative)
      await fs()
        .collection('games').doc(state.gameId)
        .collection('players').doc(state.playerId)
        .set({ lastActive: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  
      pulseDot();
    }
  
    async function markLeft() {
      if (!state.gameId || !state.playerId) return;
      stopHeartbeat();
  
      try {
        await fs()
          .collection('games').doc(state.gameId)
          .collection('players').doc(state.playerId)
          .set({
            lastActive: firebase.firestore.FieldValue.serverTimestamp(),
            leftAt: firebase.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
      } catch (_) {}
  
      try {
        rtdb()
          .ref(`games/${state.gameId}/players/${state.playerId}/lastActive`)
          .set(firebase.database.ServerValue.TIMESTAMP);
      } catch (_) {}
    }
  
    // ---- Tiny UI helpers ----
    function setStatus(msg) {
      const el = $('#connection-status');
      if (el) el.textContent = msg;
    }
    function pulseDot() {
      const dot = $('#online-dot');
      if (!dot) return;
      dot.classList.remove('opacity-50');
      dot.classList.add('opacity-100');
      setTimeout(() => {
        dot.classList.add('opacity-50');
        dot.classList.remove('opacity-100');
      }, 400);
    }
  
    // ---- Boot ----
    async function boot() {
      try {
        const gameId = qp('gameId') || (document.body?.dataset?.gameId || '').trim();
        if (!gameId) {
          setStatus('No game specified.');
          console.error('Missing gameId. Provide ?gameId=XXXX or data-game-id on <body>.');
          return;
        }
  
        const joinBtn = $('#join-game-btn');
        if (joinBtn) {
          joinBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const input = $('#player-name');
            if (input && input.value.trim()) {
              localStorage.setItem(STORAGE.displayName, input.value.trim());
            }
            try { await joinGame(gameId); } catch (err) {
              console.error('joinGame failed:', err);
              setStatus('Join failed.');
            }
          });
        } else {
          await joinGame(gameId);
        }
  
        window.addEventListener('beforeunload', markLeft);
        window.addEventListener('pagehide', markLeft);
      } catch (err) {
        console.error('Player boot failed:', err);
        setStatus('Connection error.');
      }
    }
  
    // Expose minimal API (optional)
    window.BingoPlayer = {
      joinGame,
      tickHeartbeat,
      markLeft,
      get playerId() { return state.playerId; },
      get gameId() { return state.gameId; },
    };
  
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  })();
  