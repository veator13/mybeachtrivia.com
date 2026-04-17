// display-app.js — Last Laugh big-screen display (Firebase-connected)
import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getFirestore,
  doc, collection,
  onSnapshot,
  query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
  authDomain: "mybeachtrivia.com",
  projectId: "beach-trivia-website",
  storageBucket: "beach-trivia-website.appspot.com",
  messagingSenderId: "459479368322",
  appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
  measurementId: "G-24MQRKKDNY"
};

let _db;
(function boot() {
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  _db = getFirestore(app);
})();

// ─── DOM refs ─────────────────────────────────────────────────────
const displayPhase      = document.getElementById('display-phase');
const displayPrompt     = document.getElementById('display-prompt');
const displayAnswerList = document.getElementById('display-answer-list');
const displayStatus     = document.getElementById('display-status');
const displayTitle      = document.getElementById('display-title');

// ─── State ────────────────────────────────────────────────────────
let currentPhase = '';
let currentPrompt = '';
let submissions = [];

// ─── Boot ─────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const gameId = params.get('gameId');

if (!gameId) {
  if (displayPhase) displayPhase.textContent = 'No game ID in URL';
} else {
  listenToGame();
  listenToSubmissions();
}

// ─── Listeners ────────────────────────────────────────────────────
function listenToGame() {
  onSnapshot(doc(_db, 'last-laugh', gameId), snap => {
    if (!snap.exists()) {
      if (displayPhase) displayPhase.textContent = 'Game not found';
      return;
    }
    const data = snap.data();
    currentPhase  = data.phase  ?? 'lobby';
    currentPrompt = data.prompt ?? '';

    if (displayPhase)  displayPhase.textContent  = phaseLabel(currentPhase);
    if (displayPrompt) displayPrompt.textContent = currentPrompt || '—';
    if (displayTitle)  displayTitle.textContent  = data.eventName ?? 'Last Laugh';

    render(data);
  });
}

function listenToSubmissions() {
  const q = query(
    collection(_db, 'last-laugh', gameId, 'submissions'),
    orderBy('createdAt', 'asc')
  );
  onSnapshot(q, snap => {
    submissions = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => !s.flagged);
    renderSubmissions();
  });
}

// ─── Render ───────────────────────────────────────────────────────
function render(data) {
  switch (currentPhase) {
    case 'lobby':
      showStatus('Waiting for host to start…');
      clearAnswerList();
      break;

    case 'submission':
      showStatus(`📝  Submissions open — ${submissions.length} answer${submissions.length !== 1 ? 's' : ''} in`);
      renderSubmissions();
      break;

    case 'review':
      showStatus('Host is reviewing submissions…');
      renderSubmissions();
      break;

    case 'pre-vote':
      showStatus('Get ready to vote!');
      renderSubmissions();
      break;

    case 'voting':
      showStatus('🗳️  Voting in progress…');
      renderSubmissions();
      break;

    case 'results':
      showStatus('🏆  Results!');
      renderResults(data.results ?? []);
      break;

    case 'leaderboard':
      showStatus('📊  Leaderboard');
      renderResults(data.results ?? []);
      break;

    case 'ended':
      showStatus('Thanks for playing! 🎉');
      clearAnswerList();
      break;
  }
}

function renderSubmissions() {
  if (!displayAnswerList) return;
  if (currentPhase === 'results' || currentPhase === 'leaderboard') return;

  if (submissions.length === 0) {
    displayAnswerList.innerHTML = '<p class="fa-display-empty">No answers yet…</p>';
    return;
  }

  displayAnswerList.innerHTML = submissions.map((item, i) => `
    <article class="fa-display-item" style="animation-delay:${i * 60}ms;">
      <span>${escapeHtml(item.text)}</span>
      <span class="fa-display-team">${escapeHtml(item.teamName ?? '')}</span>
    </article>
  `).join('');
}

function renderResults(results) {
  if (!displayAnswerList) return;
  if (!results || results.length === 0) {
    displayAnswerList.innerHTML = '<p class="fa-display-empty">Calculating results…</p>';
    return;
  }

  displayAnswerList.innerHTML = results.map((item, i) => `
    <article class="fa-display-item fa-display-item--result" style="animation-delay:${i * 120}ms;">
      <div class="fa-display-rank">#${i + 1}</div>
      <div class="fa-display-body">
        <strong>${escapeHtml(item.text)}</strong>
        <span class="fa-display-team">${escapeHtml(item.teamName ?? '')} · ${item.points} pt${item.points !== 1 ? 's' : ''}</span>
      </div>
    </article>
  `).join('');
}

function showStatus(msg) {
  if (displayStatus) displayStatus.textContent = msg;
}

function clearAnswerList() {
  if (displayAnswerList) displayAnswerList.innerHTML = '';
}

function phaseLabel(phase) {
  const labels = {
    lobby:       'Lobby',
    submission:  'Submissions Open',
    review:      'Host Review',
    'pre-vote':  'Pre-Vote',
    voting:      'Voting',
    results:     'Results',
    leaderboard: 'Leaderboard',
    ended:       'Game Over',
  };
  return labels[phase] ?? phase;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
