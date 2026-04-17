export const dom = {
  body: document.body,

  // Header
  eventTitle:   document.getElementById("event-title"),
  phaseBadge:   document.getElementById("phase-badge"),
  roundBadge:   document.getElementById("round-badge"),
  currentPrompt: document.getElementById("current-prompt"),
  gameCodeEl:   document.getElementById("game-code"),

  // Submissions panel
  submissionCount: document.getElementById("submission-count"),
  submissionList:  document.getElementById("submission-list"),

  // Leaderboard panel
  leaderboardList: document.getElementById("leaderboard-list"),
  teamCount:       document.getElementById("team-count"),

  // Timer ring
  timerNumber:  document.getElementById("host-timer-number"),
  ringProgress: document.getElementById("host-ring-progress"),

  // Header action buttons
  copyDisplayLinkBtn: document.getElementById("copy-display-link-btn"),
  pauseRoundBtn:      document.getElementById("pause-round-btn"),
  endEventBtn:        document.getElementById("end-event-btn"),

  // Prompt control buttons
  randomPromptBtn:  document.getElementById("random-prompt-btn"),
  themePackBtn:     document.getElementById("theme-pack-btn"),
  customPromptBtn:  document.getElementById("custom-prompt-btn"),

  // Round flow buttons
  startRoundBtn:      document.getElementById("start-round-btn"),
  endSubmissionsBtn:  document.getElementById("end-submissions-btn"),
  extend10Btn:        document.getElementById("extend-10-btn"),
  confirmAnswersBtn:  document.getElementById("confirm-answers-btn"),
  openVotingBtn:      document.getElementById("open-voting-btn"),
  endVotingBtn:       document.getElementById("end-voting-btn"),
  extend10BtnVote:    document.getElementById("extend-10-btn-vote"),
  revealResultsBtn:   document.getElementById("reveal-results-btn"),
  showScoreboardBtn:  document.getElementById("show-scoreboard-btn"),
  nextRoundBtn:       document.getElementById("next-round-btn"),

  // Wager buttons
  startHalftimeBtn: document.getElementById("start-halftime-btn"),
  startFinalBtn:    document.getElementById("start-final-btn"),
  showWagersBtn:    document.getElementById("show-wagers-btn"),

  // Game config inputs
  standardGameBtn:       document.getElementById("standard-game-btn"),
  cfgNumRounds:          document.getElementById("cfg-num-rounds"),
  cfgQuestionsPerRound:  document.getElementById("cfg-questions-per-round"),
  cfgRoundDetails:       document.getElementById("cfg-round-details"),
  applyConfigBtn:        document.getElementById("apply-config-btn"),

  // Modals
  confirmModal:      document.getElementById("host-confirm-modal"),
  customPromptModal: document.getElementById("custom-prompt-modal"),
  customPromptInput: document.getElementById("custom-prompt-input"),
  customPromptSave:  document.getElementById("custom-prompt-save"),
  customPromptClose: document.getElementById("custom-prompt-close"),
  newGameModal:      document.getElementById("new-game-modal"),
  newGameInput:      document.getElementById("new-game-input"),
  newGameBtn:        document.getElementById("new-game-btn"),
};
