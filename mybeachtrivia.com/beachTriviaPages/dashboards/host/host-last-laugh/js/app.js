import { state, questionsInCurrentRound, isAtRoundEnd } from "./state.js";
import { dom } from "./dom.js";
import { setRing } from "./timers.js";
import { renderAll } from "./ui-render.js";
import {
  createGame, loadGame,
  watchGame, watchSubmissions, watchTeams,
  startRound, endSubmissions, openPreVote, openVoting,
  endVoting, tallyAndSaveResults, showLeaderboard, endEvent, nextRound,
  extendTimer, flagSubmission, removeSubmission,
  updatePrompt, getRandomPrompt, buildDisplayLink, updateGameConfig
} from "./firebase-data.js";

let timerInterval = null;
const unsubscribers = [];

// ─── Boot ─────────────────────────────────────────────────────────

async function boot() {
  setRing(dom.ringProgress);
  bindEvents();
  bindConfigEvents();

  try {
    const gameId = await resolveGameId();
    state.gameId = gameId;

    // Update static display fields
    if (dom.gameCodeEl) dom.gameCodeEl.textContent = gameId;

    // Start real-time listeners
    unsubscribers.push(
      watchGame(gameId, onGameUpdate),
      watchSubmissions(gameId, onSubmissionsUpdate),
      watchTeams(gameId, onTeamsUpdate)
    );
  } catch (err) {
    console.error('[app.js] boot failed:', err);
    alert('Could not load game: ' + err.message);
  }
}

// Get or create a gameId from the URL
async function resolveGameId() {
  const params = new URLSearchParams(location.search);
  let gameId = params.get('gameId');
  if (gameId) {
    try {
      await loadGame(gameId);
      return gameId;
    } catch (e) {
      // Stale or wrong-collection gameId — fall through and create a fresh game
      console.warn('[app.js] gameId not found, creating new game:', e.message);
    }
  }
  // No gameId (or stale one) — auto-create a new game
  gameId = await createGame('Last Laugh');
  history.replaceState(null, '', `?gameId=${encodeURIComponent(gameId)}`);
  return gameId;
}

// ─── Firebase snapshot handlers ────────────────────────────────────

function onGameUpdate(data) {
  state.eventName                = data.eventName  ?? state.eventName;
  state.phase                    = data.phase      ?? 'lobby';
  state.currentPrompt            = data.prompt     ?? '';
  state.currentRound             = data.roundNumber ?? 1;
  state.questionNumber           = data.questionNumber ?? 1;
  state.totalRounds              = data.totalRounds ?? 4;
  state.defaultQuestionsPerRound = data.defaultQuestionsPerRound ?? 10;
  state.roundConfig              = data.roundConfig ?? [];
  state.timerSeconds             = data.timerSeconds ?? 60;
  state.results                  = data.results    ?? null;

  // Compute remaining time from server timerEnd
  if (data.timerEnd) {
    const end = data.timerEnd?.toDate ? data.timerEnd.toDate() : new Date(data.timerEnd);
    state.timerEnd = end;
    state.timerRemaining = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 1000));
  } else {
    state.timerEnd = null;
    state.timerRemaining = 0;
  }

  // Start or stop local countdown based on phase
  if (['submission', 'voting'].includes(state.phase) && state.timerEnd) {
    startLocalCountdown();
  } else {
    stopLocalCountdown();
  }

  // Sync config UI with current state
  syncConfigUI();

  renderAll();
}

function onSubmissionsUpdate(items) {
  state.submissions = items;
  renderAll();
}

function onTeamsUpdate(items) {
  state.teams = items;
  renderAll();
}

// ─── Local countdown (drives the ring + timer display) ─────────────

function startLocalCountdown() {
  stopLocalCountdown();
  timerInterval = window.setInterval(() => {
    if (state.isPaused || !state.timerEnd) return;
    state.timerRemaining = Math.max(0, Math.ceil((state.timerEnd.getTime() - Date.now()) / 1000));
    renderAll();
    if (state.timerRemaining <= 0) stopLocalCountdown();
  }, 500);
}

function stopLocalCountdown() {
  if (timerInterval) { window.clearInterval(timerInterval); timerInterval = null; }
}

// ─── Event bindings ────────────────────────────────────────────────

function bindEvents() {
  // Copy display link
  dom.copyDisplayLinkBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(buildDisplayLink(state.gameId));
      dom.copyDisplayLinkBtn.textContent = 'Copied!';
      setTimeout(() => { dom.copyDisplayLinkBtn.textContent = 'Copy Display Link'; }, 1400);
    } catch (e) { console.error('clipboard error', e); }
  });

  // ── Prompt buttons ──────────────────────────────────────────────

  dom.randomPromptBtn?.addEventListener('click', async () => {
    const prompt = getRandomPrompt();
    state.currentPrompt = prompt;
    if (dom.currentPrompt) dom.currentPrompt.textContent = prompt;
    if (state.gameId) await updatePrompt(state.gameId, prompt).catch(console.error);
  });

  dom.customPromptBtn?.addEventListener('click', () => {
    dom.customPromptModal?.showModal();
  });

  dom.customPromptSave?.addEventListener('click', async () => {
    const val = dom.customPromptInput?.value?.trim();
    if (!val) return;
    state.currentPrompt = val;
    if (dom.currentPrompt) dom.currentPrompt.textContent = val;
    if (state.gameId) await updatePrompt(state.gameId, val).catch(console.error);
    dom.customPromptModal?.close();
  });

  dom.customPromptClose?.addEventListener('click', () => {
    dom.customPromptModal?.close();
  });

  dom.themePackBtn?.addEventListener('click', () => {
    // Placeholder — pick a themed random prompt
    const themes = [
      "Name a terrible spin-off of a popular TV show.",
      "What would a fast food restaurant name their Wi-Fi?",
      "A bad name for a beach bar.",
      "The worst bumper sticker for a minivan.",
      "A rejected beach-themed cocktail name."
    ];
    const prompt = themes[Math.floor(Math.random() * themes.length)];
    state.currentPrompt = prompt;
    if (dom.currentPrompt) dom.currentPrompt.textContent = prompt;
    if (state.gameId) updatePrompt(state.gameId, prompt).catch(console.error);
  });

  // ── Round flow buttons ──────────────────────────────────────────

  dom.startRoundBtn?.addEventListener('click', async () => {
    const prompt = state.currentPrompt || getRandomPrompt();
    await startRound(state.gameId, prompt, state.timerSeconds || 60).catch(err => {
      console.error('startRound error', err);
      alert('Error starting round: ' + err.message);
    });
  });

  dom.endSubmissionsBtn?.addEventListener('click', async () => {
    await endSubmissions(state.gameId).catch(console.error);
  });

  dom.extend10Btn?.addEventListener('click', async () => {
    await extendTimer(state.gameId, 10).catch(console.error);
  });

  dom.confirmAnswersBtn?.addEventListener('click', async () => {
    await openPreVote(state.gameId).catch(console.error);
  });

  dom.openVotingBtn?.addEventListener('click', async () => {
    await openVoting(state.gameId, 20).catch(console.error);
  });

  dom.endVotingBtn?.addEventListener('click', async () => {
    // Tally votes and advance to results
    await tallyAndSaveResults(state.gameId).catch(console.error);
  });

  dom.revealResultsBtn?.addEventListener('click', async () => {
    // Already in results — just a no-op or re-render
    renderAll();
  });

  dom.showScoreboardBtn?.addEventListener('click', async () => {
    await showLeaderboard(state.gameId).catch(console.error);
  });

  dom.nextRoundBtn?.addEventListener('click', async () => {
    await nextRound(state.gameId).catch(console.error);
  });

  // ── Pause ───────────────────────────────────────────────────────

  dom.pauseRoundBtn?.addEventListener('click', () => {
    state.isPaused = !state.isPaused;
    dom.pauseRoundBtn.textContent = state.isPaused ? 'Resume Round' : 'Pause Round';
  });

  // ── End event ───────────────────────────────────────────────────

  dom.endEventBtn?.addEventListener('click', () => {
    dom.confirmModal?.showModal();
  });

  dom.confirmModal?.addEventListener('close', async () => {
    if (dom.confirmModal.returnValue === 'confirm') {
      stopLocalCountdown();
      await endEvent(state.gameId).catch(console.error);
    }
  });

  // ── Wager round ─────────────────────────────────────────────────

  dom.startHalftimeBtn?.addEventListener('click', async () => {
    const prompt = "HALFTIME WAGER — What's the most embarrassing thing you've Googled?";
    state.currentPrompt = prompt;
    if (dom.currentPrompt) dom.currentPrompt.textContent = prompt;
    if (state.gameId) await updatePrompt(state.gameId, prompt).catch(console.error);
  });

  dom.startFinalBtn?.addEventListener('click', async () => {
    const prompt = "FINAL WAGER — Complete this sentence: 'I once told my boss that...'";
    state.currentPrompt = prompt;
    if (dom.currentPrompt) dom.currentPrompt.textContent = prompt;
    if (state.gameId) await updatePrompt(state.gameId, prompt).catch(console.error);
  });

  dom.showWagersBtn?.addEventListener('click', () => {
    // Show wagers panel — handled in ui-render
    alert('Wager reveal feature coming soon.');
  });

  // ── Submission flag/remove (delegated on submission list) ────────

  dom.submissionList?.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-submission-id]');
    if (!item) return;

    if (e.target.matches('.fa-flag-btn')) {
      const id = item.dataset.submissionId;
      const currentlyFlagged = item.dataset.flagged === 'true';
      await flagSubmission(state.gameId, id, !currentlyFlagged).catch(console.error);
    }

    if (e.target.matches('.fa-remove-btn')) {
      const id = item.dataset.submissionId;
      if (confirm('Remove this submission?')) {
        await removeSubmission(state.gameId, id).catch(console.error);
      }
    }
  });
}

// ─── Game Config bindings ──────────────────────────────────────────

function buildRoundConfig(numRounds, defaultQPR) {
  return Array.from({ length: numRounds }, () => ({
    questionsPerRound: defaultQPR,
    halftimeAfter: false,
    finalAfter: false,
  }));
}

function readConfigFromUI() {
  const numRounds = parseInt(dom.cfgNumRounds?.value, 10) || 4;
  const defaultQPR = parseInt(dom.cfgQuestionsPerRound?.value, 10) || 10;

  const rows = dom.cfgRoundDetails?.querySelectorAll('[data-round-row]') ?? [];
  const roundConfig = Array.from(rows).map(row => ({
    questionsPerRound: parseInt(row.querySelector('.fa-cfg-q')?.value, 10) || defaultQPR,
    halftimeAfter: row.querySelector('.fa-halftime-check')?.checked ?? false,
    finalAfter:    row.querySelector('.fa-final-check')?.checked ?? false,
  }));

  return { numRounds, defaultQuestionsPerRound: defaultQPR, roundConfig };
}

function renderRoundDetailRows(numRounds, defaultQPR, existingConfig) {
  if (!dom.cfgRoundDetails) return;

  dom.cfgRoundDetails.innerHTML = Array.from({ length: numRounds }, (_, i) => {
    const cfg = existingConfig?.[i] || {};
    const qpr = cfg.questionsPerRound ?? defaultQPR;
    const halftime = cfg.halftimeAfter ? 'checked' : '';
    const final_ = cfg.finalAfter ? 'checked' : '';
    return `
      <div class="fa-round-row" data-round-row="${i + 1}">
        <span class="fa-round-row-label">Round ${i + 1}</span>
        <input type="number" class="fa-cfg-input fa-cfg-q" value="${qpr}" min="1" max="50" title="Questions in Round ${i + 1}">
        <label class="fa-wager-toggle" title="Show Halftime Wager after this round">
          <input type="checkbox" class="fa-halftime-check" ${halftime}> Half
        </label>
        <label class="fa-wager-toggle" title="Show Final Wager after this round">
          <input type="checkbox" class="fa-final-check" ${final_}> Final
        </label>
      </div>
    `;
  }).join('');
}

function syncConfigUI() {
  // Populate config inputs from current state (runs after each Firestore update)
  if (dom.cfgNumRounds && document.activeElement !== dom.cfgNumRounds) {
    dom.cfgNumRounds.value = state.totalRounds;
  }
  if (dom.cfgQuestionsPerRound && document.activeElement !== dom.cfgQuestionsPerRound) {
    dom.cfgQuestionsPerRound.value = state.defaultQuestionsPerRound;
  }

  // Only re-render round rows if no row input is focused
  const rowFocused = dom.cfgRoundDetails?.contains(document.activeElement);
  if (!rowFocused) {
    renderRoundDetailRows(state.totalRounds, state.defaultQuestionsPerRound, state.roundConfig);
  }
}

function bindConfigEvents() {
  // Standard Game preset
  dom.standardGameBtn?.addEventListener('click', () => {
    const numRounds = 4;
    const defaultQPR = 10;
    if (dom.cfgNumRounds) dom.cfgNumRounds.value = numRounds;
    if (dom.cfgQuestionsPerRound) dom.cfgQuestionsPerRound.value = defaultQPR;

    const config = buildRoundConfig(numRounds, defaultQPR);
    config[1].halftimeAfter = true;   // after Round 2
    config[3].finalAfter    = true;   // after Round 4

    renderRoundDetailRows(numRounds, defaultQPR, config);
  });

  // Re-render round rows when numRounds changes
  dom.cfgNumRounds?.addEventListener('input', () => {
    const numRounds = parseInt(dom.cfgNumRounds.value, 10) || 1;
    const defaultQPR = parseInt(dom.cfgQuestionsPerRound?.value, 10) || 10;
    const existing = readConfigFromUI().roundConfig;
    renderRoundDetailRows(numRounds, defaultQPR, existing);
  });

  // Update all round rows when default QPR changes (only rows not manually overridden)
  dom.cfgQuestionsPerRound?.addEventListener('input', () => {
    const defaultQPR = parseInt(dom.cfgQuestionsPerRound.value, 10) || 10;
    dom.cfgRoundDetails?.querySelectorAll('.fa-cfg-q').forEach(input => {
      input.value = defaultQPR;
    });
  });

  // Apply config to Firestore
  dom.applyConfigBtn?.addEventListener('click', async () => {
    if (!state.gameId) return;
    const { numRounds, defaultQuestionsPerRound, roundConfig } = readConfigFromUI();
    dom.applyConfigBtn.textContent = 'Applying…';
    dom.applyConfigBtn.disabled = true;
    try {
      await updateGameConfig(state.gameId, { numRounds, defaultQuestionsPerRound, roundConfig });
      dom.applyConfigBtn.textContent = 'Applied!';
      setTimeout(() => {
        dom.applyConfigBtn.textContent = 'Apply Config';
        dom.applyConfigBtn.disabled = false;
      }, 1400);
    } catch (err) {
      console.error('updateGameConfig error', err);
      dom.applyConfigBtn.textContent = 'Error — retry';
      dom.applyConfigBtn.disabled = false;
    }
  });
}

boot();
