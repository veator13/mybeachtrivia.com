// player-app.js — Last Laugh player client
import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getFirestore,
  doc, collection,
  getDoc, setDoc, onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getDatabase, ref as rtdbRef, set as rtdbSet, onDisconnect
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
  authDomain: "mybeachtrivia.com",
  projectId: "beach-trivia-website",
  storageBucket: "beach-trivia-website.appspot.com",
  messagingSenderId: "459479368322",
  appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
  measurementId: "G-24MQRKKDNY"
};

// ─── Firebase init ────────────────────────────────────────────────
let _db, _auth, _rtdb;
(function boot() {
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  _db   = getFirestore(app);
  _auth = getAuth(app);
  _rtdb = getDatabase(app);
})();

// ─── Constants ────────────────────────────────────────────────────
const RADIUS = 52;
const CIRC   = 2 * Math.PI * RADIUS;
const SESSION_KEY_NAME = 'fa_teamName';
const SESSION_KEY_UID  = 'fa_uid';
const PREVOTE_DURATION = 5; // seconds

// ─── State ────────────────────────────────────────────────────────
const playerState = {
  gameId:       null,
  uid:          null,
  teamName:     sessionStorage.getItem(SESSION_KEY_NAME) || '',
  phase:        'lobby',
  prompt:       '',
  timerEnd:     null,
  timerSeconds: 60,
  timerRemaining: 0,
  submissions:  [],   // from Firestore subcollection
  myVotes:      [],   // [submissionId, submissionId, submissionId]
  hasSubmitted: false,
  prevoteCount: PREVOTE_DURATION,
};

// ─── DOM refs ─────────────────────────────────────────────────────
const screens = {
  error:      document.getElementById('screen-error'),
  join:       document.getElementById('screen-join'),
  lobby:      document.getElementById('screen-lobby'),
  submission: document.getElementById('screen-submission'),
  prevote:    document.getElementById('screen-prevote'),
  voting:     document.getElementById('screen-voting'),
  results:    document.getElementById('screen-results'),
  ended:      document.getElementById('screen-ended'),
};

const el = {
  // Join
  joinTeamInput: document.getElementById('join-team-input'),
  joinBtn:       document.getElementById('join-btn'),
  joinError:     document.getElementById('join-error'),

  // Prompt displays
  subPrompt:   document.getElementById('sub-prompt'),
  votePrompt:  document.getElementById('vote-prompt'),

  // Timer rings
  subTimer:    document.getElementById('sub-timer'),
  subRing:     document.getElementById('sub-ring-progress'),
  voteTimer:   document.getElementById('vote-timer'),
  voteRing:    document.getElementById('vote-ring-progress'),
  prevoteCount:document.getElementById('prevote-count'),

  // Answer submission
  answerInput:    document.getElementById('answer-input'),
  answerCount:    document.getElementById('answer-count'),
  submitAnswerBtn:document.getElementById('submit-answer-btn'),

  // Vote list
  voteList: document.getElementById('vote-list'),

  // Warning banner (penalty)
  voteWarning: document.getElementById('vote-warning'),

  // Results
  resultsPrompt: document.getElementById('results-prompt'),
  resultsList:   document.getElementById('results-list'),

  // Change team modal
  changeTeamBtn:  document.getElementById('change-team-btn'),
  seeHostModal:   document.getElementById('see-host-modal'),

  // Team name display
  teamNameDisplay: document.getElementById('team-name-display'),
};

// ─── Ring helpers ─────────────────────────────────────────────────
function initRing(ringEl) {
  if (!ringEl) return;
  ringEl.style.strokeDasharray = `${CIRC}`;
  ringEl.style.strokeDashoffset = '0';
}

function updateRing(ringEl, remaining, total) {
  if (!ringEl) return;
  const pct    = remaining / Math.max(total, 1);
  const offset = CIRC * (1 - pct);
  ringEl.style.strokeDashoffset = `${offset}`;
}

// ─── Screen switching ─────────────────────────────────────────────
function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    if (el) el.classList.toggle('fa-hidden', key !== name);
  });
}

// ─── Boot ─────────────────────────────────────────────────────────
async function boot() {
  initRing(el.subRing);
  initRing(el.voteRing);
  bindEvents();

  // Get gameId from URL
  const params = new URLSearchParams(location.search);
  playerState.gameId = params.get('gameId');
  if (!playerState.gameId) {
    showErrorScreen('No game code found. Please scan the QR code or use the link from your host.');
    return;
  }

  // Validate game exists
  try {
    const snap = await getDoc(doc(_db, 'last-laugh', playerState.gameId));
    if (!snap.exists()) {
      showErrorScreen('Game not found. Check your game code and try again.');
      return;
    }
  } catch (e) {
    showErrorScreen('Could not connect to game: ' + e.message);
    return;
  }

  // If team name already set, sign in directly
  if (playerState.teamName) {
    await signIn();
  } else {
    showScreen('join');
  }
}

function showErrorScreen(msg) {
  if (el.joinError) el.joinError.textContent = msg;
  showScreen('error');
}

// ─── Sign in ──────────────────────────────────────────────────────
async function signIn() {
  try {
    const cred = await signInAnonymously(_auth);
    playerState.uid = cred.user.uid;
    sessionStorage.setItem(SESSION_KEY_UID, playerState.uid);

    // Register with Firestore teams subcollection
    await setDoc(
      doc(_db, 'last-laugh', playerState.gameId, 'teams', playerState.uid),
      {
        name:     playerState.teamName,
        score:    0,
        joinedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // RTDB presence
    const presRef = rtdbRef(_rtdb, `last-laugh/${playerState.gameId}/players/${playerState.uid}`);
    await rtdbSet(presRef, { teamName: playerState.teamName, joinedAt: Date.now(), lastActive: Date.now() });
    onDisconnect(presRef).remove();
    setInterval(() => {
      import('https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js')
        .then(({ ref, set }) => set(rtdbRef(_rtdb, `last-laugh/${playerState.gameId}/players/${playerState.uid}/lastActive`), Date.now()))
        .catch(() => {});
    }, 30_000);

    // Update team name display
    if (el.teamNameDisplay) el.teamNameDisplay.textContent = playerState.teamName;

    // Start listening to game state
    listenToGame();
    listenToSubmissions();
  } catch (err) {
    console.error('[player-app] signIn error', err);
    showErrorScreen('Could not join game: ' + err.message);
  }
}

// ─── Game state listener ──────────────────────────────────────────
let timerInterval = null;
let prevoteInterval = null;

function listenToGame() {
  onSnapshot(doc(_db, 'last-laugh', playerState.gameId), snap => {
    if (!snap.exists()) return;
    const data = snap.data();

    const prevPhase = playerState.phase;
    playerState.phase   = data.phase   ?? 'lobby';
    playerState.prompt  = data.prompt  ?? '';
    playerState.timerSeconds = data.timerSeconds ?? 60;

    if (data.timerEnd) {
      const end = data.timerEnd?.toDate ? data.timerEnd.toDate() : new Date(data.timerEnd);
      playerState.timerEnd = end;
      playerState.timerRemaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    } else {
      playerState.timerEnd = null;
      playerState.timerRemaining = 0;
    }

    // Reset submission state when new round starts
    if (prevPhase === 'lobby' && playerState.phase === 'submission') {
      playerState.hasSubmitted = false;
      playerState.myVotes = [];
      if (el.answerInput) el.answerInput.value = '';
      if (el.submitAnswerBtn) {
        el.submitAnswerBtn.textContent = 'Submit Answer';
        el.submitAnswerBtn.disabled = false;
      }
    }

    applyPhase(data);
  });
}

function listenToSubmissions() {
  onSnapshot(
    collection(_db, 'last-laugh', playerState.gameId, 'submissions'),
    snap => {
      playerState.submissions = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => !s.flagged && s.id !== playerState.uid); // exclude own + flagged
      renderVoteList();
    }
  );
}

// ─── Phase logic ──────────────────────────────────────────────────
function applyPhase(data) {
  stopTimers();

  switch (playerState.phase) {
    case 'lobby':
      showScreen('lobby');
      break;

    case 'submission':
      if (el.subPrompt) el.subPrompt.textContent = playerState.prompt;
      showScreen('submission');
      startLocalTimer('sub');
      break;

    case 'review':
      // Host is reviewing — stay on submission screen but disable input
      if (el.answerInput) el.answerInput.disabled = true;
      if (el.submitAnswerBtn) el.submitAnswerBtn.disabled = true;
      showScreen('submission');
      break;

    case 'pre-vote':
      startPrevoteCountdown();
      showScreen('prevote');
      break;

    case 'voting':
      if (el.votePrompt) el.votePrompt.textContent = playerState.prompt;
      renderVoteList();
      showScreen('voting');
      startLocalTimer('vote');
      break;

    case 'results':
      renderResults(data.results ?? []);
      showScreen('results');
      break;

    case 'leaderboard':
      showScreen('results'); // reuse results screen showing "See leaderboard on main display"
      break;

    case 'ended':
      showScreen('ended');
      break;
  }
}

// ─── Timers ───────────────────────────────────────────────────────
function stopTimers() {
  if (timerInterval)   { clearInterval(timerInterval);   timerInterval = null; }
  if (prevoteInterval) { clearInterval(prevoteInterval); prevoteInterval = null; }
}

function startLocalTimer(type) {
  const timerEl = type === 'sub' ? el.subTimer  : el.voteTimer;
  const ringEl  = type === 'sub' ? el.subRing   : el.voteRing;

  timerInterval = setInterval(() => {
    if (!playerState.timerEnd) return;
    playerState.timerRemaining = Math.max(0, Math.ceil((playerState.timerEnd - Date.now()) / 1000));

    if (timerEl) timerEl.textContent = String(playerState.timerRemaining);
    updateRing(ringEl, playerState.timerRemaining, playerState.timerSeconds);

    const warn = playerState.timerRemaining <= 5 && playerState.timerRemaining > 0;
    document.body.classList.toggle('is-warning', warn);

    if (playerState.timerRemaining <= 0) stopTimers();
  }, 500);
}

function startPrevoteCountdown() {
  playerState.prevoteCount = PREVOTE_DURATION;
  if (el.prevoteCount) el.prevoteCount.textContent = PREVOTE_DURATION;

  prevoteInterval = setInterval(() => {
    playerState.prevoteCount = Math.max(0, playerState.prevoteCount - 1);
    if (el.prevoteCount) el.prevoteCount.textContent = playerState.prevoteCount;
    if (playerState.prevoteCount <= 0) {
      clearInterval(prevoteInterval);
      prevoteInterval = null;
    }
  }, 1000);
}

// ─── Vote list rendering ──────────────────────────────────────────
function renderVoteList() {
  if (!el.voteList) return;

  const subs = playerState.submissions;
  const votes = playerState.myVotes;

  // Shuffle once per snapshot (stable within a render pass via stored order)
  el.voteList.innerHTML = subs.map(answer => {
    const placement = votes.indexOf(answer.id);
    const badge = placement >= 0 ? `<strong>#${placement + 1}</strong>` : '';
    const selected = placement >= 0 ? ' fa-vote-item--selected' : '';

    return `
      <button class="fa-vote-item${selected}" data-id="${answer.id}" type="button">
        <div class="fa-vote-item-row">
          <span>${escapeHtml(answer.text)}</span>
          <span class="fa-vote-badge">${badge}</span>
        </div>
      </button>
    `;
  }).join('');

  el.voteList.querySelectorAll('[data-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const idx = playerState.myVotes.indexOf(id);
      if (idx >= 0) {
        playerState.myVotes.splice(idx, 1);
      } else if (playerState.myVotes.length < 3) {
        playerState.myVotes.push(id);
      }
      renderVoteList();
      updateVoteSubmitState();
    });
  });

  updateVoteSubmitState();
}

function updateVoteSubmitState() {
  const count = playerState.myVotes.length;
  const submitBtn = document.getElementById('submit-votes-btn');
  if (submitBtn) {
    submitBtn.textContent = count === 3
      ? 'Submit Votes'
      : `Select ${3 - count} more…`;
    submitBtn.disabled = false;
  }
  if (el.voteWarning) {
    el.voteWarning.classList.toggle('fa-hidden', count === 3);
  }
}

// ─── Results rendering ────────────────────────────────────────────
function renderResults(results) {
  if (el.resultsPrompt) el.resultsPrompt.textContent = playerState.prompt;
  if (!el.resultsList) return;

  if (!results || results.length === 0) {
    el.resultsList.innerHTML = '<p>Waiting for results…</p>';
    return;
  }

  el.resultsList.innerHTML = results.map((item, i) => `
    <article class="fa-result-item">
      <div class="fa-result-rank">#${i + 1}</div>
      <div class="fa-result-body">
        <div class="fa-result-text">${escapeHtml(item.text)}</div>
        <div class="fa-result-meta">${escapeHtml(item.teamName)} · ${item.points} pt${item.points !== 1 ? 's' : ''}</div>
      </div>
    </article>
  `).join('');
}

// ─── Event bindings ────────────────────────────────────────────────
function bindEvents() {
  // Join screen
  el.joinBtn?.addEventListener('click', async () => {
    const name = el.joinTeamInput?.value?.trim();
    if (!name) {
      if (el.joinError) el.joinError.textContent = 'Please enter your team name.';
      return;
    }
    if (el.joinError) el.joinError.textContent = '';
    playerState.teamName = name;
    sessionStorage.setItem(SESSION_KEY_NAME, name);
    if (el.teamNameDisplay) el.teamNameDisplay.textContent = name;
    showScreen('lobby');
    await signIn();
  });

  el.joinTeamInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') el.joinBtn?.click();
  });

  // Answer input character counter
  el.answerInput?.addEventListener('input', () => {
    const len = el.answerInput.value.length;
    if (el.answerCount) {
      el.answerCount.textContent = `${len} / 120`;
      el.answerCount.style.color = len >= 120 ? '#ef4444' : len >= 100 ? '#f6b73c' : '';
    }
  });

  // Submit answer
  el.submitAnswerBtn?.addEventListener('click', async () => {
    const text = el.answerInput?.value?.trim();
    if (!text) return;
    if (!playerState.uid || !playerState.gameId) return;

    el.submitAnswerBtn.disabled = true;
    el.submitAnswerBtn.textContent = 'Submitting…';

    try {
      // Use uid as doc id so re-submit overwrites previous answer
      await setDoc(
        doc(_db, 'last-laugh', playerState.gameId, 'submissions', playerState.uid),
        {
          uid:      playerState.uid,
          teamName: playerState.teamName,
          text,
          flagged:  false,
          createdAt: serverTimestamp(),
        }
      );
      playerState.hasSubmitted = true;
      el.submitAnswerBtn.textContent = '✓ Submitted — tap to edit';
      el.submitAnswerBtn.disabled = false;
    } catch (err) {
      console.error('[player-app] submit error', err);
      el.submitAnswerBtn.textContent = 'Error — try again';
      el.submitAnswerBtn.disabled = false;
    }
  });

  // Submit votes
  document.getElementById('submit-votes-btn')?.addEventListener('click', async () => {
    if (!playerState.uid || !playerState.gameId) return;
    const ranked = [...playerState.myVotes];
    const btn = document.getElementById('submit-votes-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      await setDoc(
        doc(_db, 'last-laugh', playerState.gameId, 'votes', playerState.uid),
        { ranked, updatedAt: serverTimestamp() }
      );
      if (btn) btn.textContent = '✓ Votes saved — tap to change';
      if (btn) btn.disabled = false;
    } catch (err) {
      console.error('[player-app] vote error', err);
      if (btn) { btn.textContent = 'Error — try again'; btn.disabled = false; }
    }
  });

  // Change team modal
  el.changeTeamBtn?.addEventListener('click', () => {
    el.seeHostModal?.showModal();
  });
}

// ─── Util ─────────────────────────────────────────────────────────
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ─── Start ────────────────────────────────────────────────────────
boot();
