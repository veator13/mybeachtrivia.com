// state.js — Last Laugh host in-memory state
// Firebase is the source of truth; this mirrors the current snapshot.
export const state = {
  gameId: null,
  eventName: "",

  // lobby | submission | review | pre-vote | voting | results | leaderboard | ended
  phase: "lobby",

  currentRound: 1,           // which round (1-based)
  questionNumber: 1,         // question within current round (1-based)
  totalRounds: 4,            // number of rounds

  defaultQuestionsPerRound: 10,
  // Per-round config: [{ questionsPerRound, halftimeAfter, finalAfter }, ...]
  roundConfig: [],

  currentPrompt: "",

  // Derived from timerEnd Firestore field (a JS Date)
  timerEnd: null,
  timerSeconds: 60,
  timerRemaining: 0,

  isPaused: false,

  submissions: [],   // { id, teamName, text, flagged }
  teams: [],         // { id, name, score }
  results: null,     // null | [{ id, text, teamName, points }]
};

// ─── Computed helpers ─────────────────────────────────────────────

export function questionsInCurrentRound() {
  const cfg = state.roundConfig[state.currentRound - 1];
  return cfg?.questionsPerRound ?? state.defaultQuestionsPerRound ?? 10;
}

export function isAtRoundEnd() {
  return state.questionNumber >= questionsInCurrentRound();
}

export function isHalftimePoint() {
  if (state.phase !== 'leaderboard') return false;
  const cfg = state.roundConfig[state.currentRound - 1];
  return !!cfg?.halftimeAfter && isAtRoundEnd();
}

export function isFinalPoint() {
  if (state.phase !== 'leaderboard') return false;
  const cfg = state.roundConfig[state.currentRound - 1];
  return !!cfg?.finalAfter && isAtRoundEnd();
}

export function isLastQuestion() {
  return isAtRoundEnd() && state.currentRound >= state.totalRounds;
}
