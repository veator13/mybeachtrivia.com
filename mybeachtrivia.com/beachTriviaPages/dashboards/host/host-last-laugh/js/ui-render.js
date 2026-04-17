import { dom } from "./dom.js";
import { state, questionsInCurrentRound, isAtRoundEnd, isHalftimePoint, isFinalPoint, isLastQuestion } from "./state.js";
import { updateRing, isWarningTime } from "./timers.js";

// ─── Phase → which button groups are visible ──────────────────────
//
// data-phase-group="prompt"    → Random / Theme / Custom / Start Round
// data-phase-group="submission"→ End Answers Early, +10 Sec
// data-phase-group="review"    → Confirm Answers
// data-phase-group="prevote"   → Open Voting
// data-phase-group="voting"    → End Voting Early, +10 Sec
// data-phase-group="results"   → Reveal Results, Show Scoreboard
// data-phase-group="leaderboard"→ Next Round

const PHASE_GROUPS = {
  'lobby':       ['prompt'],
  'submission':  ['submission'],
  'review':      ['review'],
  'pre-vote':    ['prevote'],
  'voting':      ['voting'],
  'results':     ['results'],
  'leaderboard': ['leaderboard'],
  'ended':       [],
};

export function renderHeader() {
  if (dom.eventTitle) dom.eventTitle.textContent = state.eventName || 'Last Laugh';
  if (dom.phaseBadge) dom.phaseBadge.textContent = state.phase;

  // Badge: "R2 Q7/10" when multi-round, or "Q7 / 10" for single round
  const qInRound = questionsInCurrentRound();
  if (dom.roundBadge) {
    if (state.totalRounds > 1) {
      dom.roundBadge.textContent = `R${state.currentRound} Q${state.questionNumber}/${qInRound}`;
    } else {
      dom.roundBadge.textContent = `Q${state.questionNumber} / ${qInRound}`;
    }
  }

  if (dom.currentPrompt && !dom.customPromptModal?.open) {
    dom.currentPrompt.textContent = state.currentPrompt || '(no prompt selected)';
  }
}

export function renderPhaseButtons() {
  const visibleGroups = PHASE_GROUPS[state.phase] ?? [];

  // Show/hide all data-phase-group elements
  document.querySelectorAll('[data-phase-group]').forEach(el => {
    const group = el.dataset.phaseGroup;
    el.classList.toggle('fa-hidden', !visibleGroups.includes(group));
  });

  // Phase badge colour
  if (dom.phaseBadge) {
    dom.phaseBadge.className = 'fa-phase-badge fa-phase--' + state.phase.replace('-', '');
  }

  // Update "Next Question / Next Round" button label
  if (dom.nextRoundBtn) {
    if (isLastQuestion()) {
      dom.nextRoundBtn.textContent = 'End Game →';
    } else if (isAtRoundEnd()) {
      dom.nextRoundBtn.textContent = 'Next Round →';
    } else {
      dom.nextRoundBtn.textContent = 'Next Question →';
    }
  }

  // Highlight wager buttons when at halftime/final boundary
  const atHalftime = isHalftimePoint();
  const atFinal    = isFinalPoint();

  dom.startHalftimeBtn?.classList.toggle('fa-btn--primary', atHalftime);
  dom.startHalftimeBtn?.classList.toggle('fa-wager-active', atHalftime);
  dom.startFinalBtn?.classList.toggle('fa-btn--primary', atFinal);
  dom.startFinalBtn?.classList.toggle('fa-wager-active', atFinal);
}

export function renderSubmissions() {
  if (!dom.submissionList) return;
  if (dom.submissionCount) {
    dom.submissionCount.textContent = `${state.submissions.length} answer${state.submissions.length !== 1 ? 's' : ''}`;
  }

  dom.submissionList.innerHTML = state.submissions.map(item => `
    <article
      class="fa-submission-item${item.flagged ? ' fa-submission-item--flagged' : ''}"
      data-submission-id="${item.id}"
      data-flagged="${item.flagged}"
    >
      <div class="fa-submission-item__top">
        <strong>${escapeHtml(item.teamName || 'Unknown team')}</strong>
        <div class="fa-submission-actions">
          ${item.flagged
            ? '<span class="fa-flag fa-flag--warn">Flagged</span>'
            : ''}
          <button class="fa-btn fa-btn--xs fa-flag-btn" type="button">
            ${item.flagged ? 'Unflag' : 'Flag'}
          </button>
          <button class="fa-btn fa-btn--xs fa-btn--danger fa-remove-btn" type="button">Remove</button>
        </div>
      </div>
      <div class="fa-submission-text">${escapeHtml(item.text)}</div>
    </article>
  `).join('');
}

export function renderLeaderboard() {
  if (!dom.leaderboardList) return;
  if (dom.teamCount) {
    dom.teamCount.textContent = `${state.teams.length} team${state.teams.length !== 1 ? 's' : ''}`;
  }

  const sorted = [...state.teams].sort((a, b) => (b.score || 0) - (a.score || 0));

  dom.leaderboardList.innerHTML = sorted.map((team, i) => `
    <article class="fa-team-item">
      <div class="fa-team-item__top">
        <strong>${i + 1}. ${escapeHtml(team.name)}</strong>
        <span class="fa-team-score">${team.score ?? 0} pts</span>
      </div>
    </article>
  `).join('');
}

export function renderResults() {
  if (state.phase !== 'results' || !state.results) return;

  // Show results in the submission panel during results phase
  if (!dom.submissionList) return;
  if (dom.submissionCount) dom.submissionCount.textContent = 'Results';

  dom.submissionList.innerHTML = state.results.map((item, i) => `
    <article class="fa-submission-item fa-submission-item--result">
      <div class="fa-submission-item__top">
        <strong>#${i + 1} — ${escapeHtml(item.teamName || 'Unknown')}</strong>
        <span class="fa-team-score">${item.points} pt${item.points !== 1 ? 's' : ''}</span>
      </div>
      <div class="fa-submission-text">${escapeHtml(item.text)}</div>
    </article>
  `).join('');
}

export function renderTimer() {
  if (!dom.timerNumber) return;
  dom.timerNumber.textContent = String(state.timerRemaining);

  updateRing(dom.ringProgress, state.timerRemaining, state.timerSeconds);

  const warning = isWarningTime(state.timerRemaining) && state.timerRemaining > 0;
  document.querySelector('.fa-ring')?.classList.toggle('is-warning', warning);
  document.querySelector('.fa-host-page')?.classList.toggle('is-warning-phase', warning);
}

export function renderAll() {
  renderHeader();
  renderPhaseButtons();
  renderTimer();

  if (state.phase === 'results' && state.results) {
    renderResults();
  } else {
    renderSubmissions();
  }

  renderLeaderboard();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
