// mybeachtrivia.com/beachTriviaPages/dashboards/host/live-console/app.js
// Live slideshow console app
// Phase 1:
// - auth/access verification
// - session code generation + viewer URL sync
// - live/preview state stepping
// - reveal modal flow
// - placeholder local-only console behavior
//
// Phase 2:
// - Firestore-backed liveSessions sync
// - published show loading
// - shared viewer updates for cast-game

(function () {
    "use strict";
  
    const APP = {
      init,
    };
  
    window.HostLiveConsoleApp = APP;
  
    const state = {
      session: {
        showId: "march-basquiat-show",
        sessionCode: "BT-4827",
        sessionName: "Keagan's • Thursday 7PM",
        viewerUrl: "",
        started: false,
        saved: false,
      },
      playback: {
        liveIndex: 2,
        previewIndex: 3,
        revealShown: false,
      },
      auth: {
        user: null,
        employee: null,
      },
      deck: {
        title: "March 2026 Trivia",
        theme: "Standard Trivia",
        slides: [
          {
            stateKey: "round1.categories",
            stateLabel: "Round 1 Categories",
            roundBadge: "Round 1",
            category: "Round Categories",
            question: "Classic Artists • World Capitals • Famous Films • 90s Music • Strange History",
            options: [],
            answer: "",
            notes: "Opening categories slide for Round 1.",
            answerVisibleByDefault: false,
            modeChip: "Categories",
            kind: "categories",
          },
          {
            stateKey: "round1.q1.live",
            stateLabel: "Round 1 Question 1 Live",
            roundBadge: "Round 1",
            category: "Classic Artists",
            question: "Which artist helped define the visual style shown on the screen?",
            options: ["Andy Warhol", "Jean-Michel Basquiat", "Keith Haring", "Roy Lichtenstein"],
            answer: "Jean-Michel Basquiat",
            notes: "Question 1 live state.",
            answerVisibleByDefault: false,
            modeChip: "Reveal Hidden",
            kind: "question",
          },
          {
            stateKey: "round1.q2.live",
            stateLabel: "Round 1 Question 2 Live",
            roundBadge: "Round 1",
            category: "Classic Artists",
            question: "Which artist is known for the painting style shown on the screen?",
            options: ["Andy Warhol", "Jean-Michel Basquiat", "Keith Haring", "Roy Lichtenstein"],
            answer: "Jean-Michel Basquiat",
            notes: "Audience screen is currently on the live question state.",
            answerVisibleByDefault: false,
            modeChip: "Reveal Hidden",
            kind: "question",
          },
          {
            stateKey: "round1.q3.live",
            stateLabel: "Round 1 Question 3 Live",
            roundBadge: "Round 1",
            category: "Classic Artists",
            question: "Which artist was closely associated with New York neo-expressionism?",
            options: ["Jean-Michel Basquiat", "Jackson Pollock", "Edward Hopper", "Grant Wood"],
            answer: "Jean-Michel Basquiat",
            notes: "Host preview can look ahead without affecting the casted audience screens.",
            answerVisibleByDefault: true,
            modeChip: "Preview Only",
            kind: "question",
          },
          {
            stateKey: "round1.q4.live",
            stateLabel: "Round 1 Question 4 Live",
            roundBadge: "Round 1",
            category: "Classic Artists",
            question: "Which of these artists often combined text, symbols, and raw street-art energy?",
            options: ["Keith Haring", "Jean-Michel Basquiat", "Pablo Picasso", "Salvador Dalí"],
            answer: "Jean-Michel Basquiat",
            notes: "Question 4 live state.",
            answerVisibleByDefault: false,
            modeChip: "Reveal Hidden",
            kind: "question",
          },
          {
            stateKey: "round1.q5.live",
            stateLabel: "Round 1 Question 5 Live",
            roundBadge: "Round 1",
            category: "Classic Artists",
            question: "Which artist rose to fame after first gaining attention in the New York graffiti scene?",
            options: ["Jean-Michel Basquiat", "Banksy", "David Hockney", "Joan Miró"],
            answer: "Jean-Michel Basquiat",
            notes: "Question 5 live state.",
            answerVisibleByDefault: false,
            modeChip: "Reveal Hidden",
            kind: "question",
          },
          {
            stateKey: "round1.turn-in",
            stateLabel: "Round 1 Turn In Slips",
            roundBadge: "Round 1",
            category: "Turn In Your Slips",
            question: "Please turn in your answer slips for Round 1.",
            options: [],
            answer: "",
            notes: "Pacing slide before the repeated answer-reveal pass.",
            answerVisibleByDefault: false,
            modeChip: "Turn-In",
            kind: "turn-in",
          },
          {
            stateKey: "round1.q1.reveal",
            stateLabel: "Round 1 Question 1 Reveal",
            roundBadge: "Round 1",
            category: "Classic Artists",
            question: "Which artist helped define the visual style shown on the screen?",
            options: ["Andy Warhol", "Jean-Michel Basquiat", "Keith Haring", "Roy Lichtenstein"],
            answer: "Jean-Michel Basquiat",
            notes: "Answer pass for Question 1.",
            answerVisibleByDefault: false,
            modeChip: "Answer Pass",
            kind: "reveal",
          },
          {
            stateKey: "round1.q2.reveal",
            stateLabel: "Round 1 Question 2 Reveal",
            roundBadge: "Round 1",
            category: "Classic Artists",
            question: "Which artist is known for the painting style shown on the screen?",
            options: ["Andy Warhol", "Jean-Michel Basquiat", "Keith Haring", "Roy Lichtenstein"],
            answer: "Jean-Michel Basquiat",
            notes: "Answer pass for Question 2.",
            answerVisibleByDefault: false,
            modeChip: "Answer Pass",
            kind: "reveal",
          },
          {
            stateKey: "round1.q3.reveal",
            stateLabel: "Round 1 Question 3 Reveal",
            roundBadge: "Round 1",
            category: "Classic Artists",
            question: "Which artist was closely associated with New York neo-expressionism?",
            options: ["Jean-Michel Basquiat", "Jackson Pollock", "Edward Hopper", "Grant Wood"],
            answer: "Jean-Michel Basquiat",
            notes: "Answer pass for Question 3.",
            answerVisibleByDefault: false,
            modeChip: "Answer Pass",
            kind: "reveal",
          },
          {
            stateKey: "round1.q4.reveal",
            stateLabel: "Round 1 Question 4 Reveal",
            roundBadge: "Round 1",
            category: "Classic Artists",
            question: "Which of these artists often combined text, symbols, and raw street-art energy?",
            options: ["Keith Haring", "Jean-Michel Basquiat", "Pablo Picasso", "Salvador Dalí"],
            answer: "Jean-Michel Basquiat",
            notes: "Answer pass for Question 4.",
            answerVisibleByDefault: false,
            modeChip: "Answer Pass",
            kind: "reveal",
          },
          {
            stateKey: "round1.q5.reveal",
            stateLabel: "Round 1 Question 5 Reveal",
            roundBadge: "Round 1",
            category: "Classic Artists",
            question: "Which artist rose to fame after first gaining attention in the New York graffiti scene?",
            options: ["Jean-Michel Basquiat", "Banksy", "David Hockney", "Joan Miró"],
            answer: "Jean-Michel Basquiat",
            notes: "Answer pass for Question 5.",
            answerVisibleByDefault: false,
            modeChip: "Answer Pass",
            kind: "reveal",
          },
          {
            stateKey: "round1.answers-summary",
            stateLabel: "Round 1 Answers Summary",
            roundBadge: "Round 1",
            category: "All Round 1 Answers",
            question: "1) Basquiat  •  2) Basquiat  •  3) Basquiat  •  4) Basquiat  •  5) Basquiat",
            options: [],
            answer: "Jean-Michel Basquiat",
            notes: "Summary slide shown after the repeated reveal pass.",
            answerVisibleByDefault: true,
            modeChip: "Summary",
            kind: "summary",
          },
        ],
      },
      dom: {},
    };
  
    function $(selector, root) {
      return (root || document).querySelector(selector);
    }
  
    function init() {
      cacheDom();
      bindCoreUi();
      updateViewerUrl();
      renderAll();
      verifyAccessAndShowPage();
    }
  
    function cacheDom() {
      state.dom = {
        authLoading: $("#auth-loading"),
        errorContainer: $("#error-container"),
        errorText: $("#error-text"),
        backToLoginBtn: $("#back-to-login"),
        consoleTopbar: $("#console-topbar"),
        consoleShell: $("#console-shell"),
  
        sessionShowSelect: $("#session-show-select"),
        sessionCode: $("#session-code"),
        sessionName: $("#session-name"),
        viewerUrl: $("#viewer-url"),
  
        btnGenerateCode: $("#btn-generate-code"),
        btnCopyViewerUrl: $("#btn-copy-viewer-url"),
        btnCopyUrlInline: $("#btn-copy-url-inline"),
        btnSaveSession: $("#btn-save-session"),
        btnStartSession: $("#btn-start-session"),
  
        btnPrevLive: $("#btn-prev-live"),
        btnNextLive: $("#btn-next-live"),
        btnPrevPreview: $("#btn-prev-preview"),
        btnNextPreview: $("#btn-next-preview"),
        btnOpenRevealModal: $("#btn-open-reveal-modal"),
        btnHideAnswer: $("#btn-hide-answer"),
  
        revealModal: $("#reveal-modal"),
        btnCloseRevealModal: $("#btn-close-reveal-modal"),
        btnConfirmReveal: $("#btn-confirm-reveal"),
        modalAnswerValue: $("#modal-answer-value"),
  
        currentLiveState: $("#current-live-state"),
        currentPreviewState: $("#current-preview-state"),
        currentShowTitle: $("#current-show-title"),
        currentRevealState: $("#current-reveal-state"),
        liveStatusChip: $("#live-status-chip"),
  
        liveStateChip: $("#live-state-chip"),
        previewStateChip: $("#preview-state-chip"),
        stateList: $("#state-list"),
  
        liveRoundBadge: $("#live-round-badge"),
        liveStateLabel: $("#live-state-label"),
        liveThemeLabel: $("#live-theme-label"),
        liveCategory: $("#live-category"),
        liveQuestion: $("#live-question"),
        liveOptions: $("#live-options"),
        liveAnswer: $("#live-answer"),
        liveNotes: $("#live-notes"),
        liveModeChip: $("#live-mode-chip"),
  
        previewRoundBadge: $("#preview-round-badge"),
        previewStateLabel: $("#preview-state-label"),
        previewThemeLabel: $("#preview-theme-label"),
        previewCategory: $("#preview-category"),
        previewQuestion: $("#preview-question"),
        previewOptions: $("#preview-options"),
        previewAnswer: $("#preview-answer"),
        previewNotes: $("#preview-notes"),
        previewModeChip: $("#preview-mode-chip"),
      };
    }
  
    function bindCoreUi() {
      const d = state.dom;
  
      d.backToLoginBtn?.addEventListener("click", function () {
        window.location.assign("/login.html");
      });
  
      d.sessionCode?.addEventListener("input", function () {
        state.session.sessionCode = String(d.sessionCode.value || "").trim();
        updateViewerUrl();
      });
  
      d.sessionName?.addEventListener("input", function () {
        state.session.sessionName = String(d.sessionName.value || "").trim();
      });
  
      d.sessionShowSelect?.addEventListener("change", function () {
        state.session.showId = String(d.sessionShowSelect.value || "").trim();
        state.session.saved = false;
        renderSessionStatus();
      });
  
      d.btnGenerateCode?.addEventListener("click", function () {
        state.session.sessionCode = randomCode();
        if (d.sessionCode) d.sessionCode.value = state.session.sessionCode;
        updateViewerUrl();
        flashStatus("Code Updated");
      });
  
      d.btnCopyViewerUrl?.addEventListener("click", function () {
        copyText(state.session.viewerUrl);
        flashStatus("Viewer URL Copied");
      });
  
      d.btnCopyUrlInline?.addEventListener("click", function () {
        copyText(state.session.viewerUrl);
        flashStatus("Viewer URL Copied");
      });
  
      d.btnSaveSession?.addEventListener("click", function () {
        saveSession();
      });
  
      d.btnStartSession?.addEventListener("click", function () {
        startSession();
      });
  
      d.btnPrevLive?.addEventListener("click", function () {
        stepLive(-1);
      });
  
      d.btnNextLive?.addEventListener("click", function () {
        stepLive(1);
      });
  
      d.btnPrevPreview?.addEventListener("click", function () {
        stepPreview(-1);
      });
  
      d.btnNextPreview?.addEventListener("click", function () {
        stepPreview(1);
      });
  
      d.btnOpenRevealModal?.addEventListener("click", function () {
        openRevealModal();
      });
  
      d.btnHideAnswer?.addEventListener("click", function () {
        state.playback.revealShown = false;
        renderAll();
      });
  
      d.btnCloseRevealModal?.addEventListener("click", function () {
        closeRevealModal();
      });
  
      d.btnConfirmReveal?.addEventListener("click", function () {
        state.playback.revealShown = true;
        closeRevealModal();
        renderAll();
        flashStatus("Answer Revealed");
      });
  
      d.revealModal?.addEventListener("click", function (event) {
        if (event.target === d.revealModal) {
          closeRevealModal();
        }
      });
  
      document.addEventListener("keydown", function (event) {
        if (state.dom.consoleShell?.style.display !== "grid") return;
  
        if (event.key === "Escape") {
          closeRevealModal();
          return;
        }
  
        if (event.target && /input|textarea|select/i.test(event.target.tagName)) return;
  
        if (event.key === "ArrowRight") {
          event.preventDefault();
          stepLive(1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          stepLive(-1);
        }
      });
    }
  
    function verifyAccessAndShowPage() {
      waitForFirebase(function () {
        firebase.auth().onAuthStateChanged(function (user) {
          if (!user) {
            window.location.assign("/login.html");
            return;
          }
  
          state.auth.user = user;
  
          firebase.firestore().collection("employees").doc(user.uid).get()
            .then(function (snap) {
              if (!snap.exists) {
                showError("No employee record found.");
                return;
              }
  
              const emp = snap.data() || {};
              state.auth.employee = emp;
  
              if (emp.active === false) {
                showError("Your account is not active.");
                return;
              }
  
              const roles = normalizeRoles(emp);
              const hasAccess =
                roles.indexOf("host") !== -1 ||
                roles.indexOf("admin") !== -1 ||
                roles.indexOf("writer") !== -1;
  
              if (!hasAccess) {
                showError("You do not have access to this page.");
                return;
              }
  
              showConsole();
            })
            .catch(function (err) {
              console.error("[host-live-console] access verification failed:", err);
              showError("Could not verify access.");
            });
        });
      });
    }
  
    function waitForFirebase(cb, attempts) {
      const n = attempts || 0;
      if (window.firebase && window.firebase.auth && window.firebase.firestore) {
        cb();
        return;
      }
      if (n > 40) {
        showError("Firebase failed to load.");
        return;
      }
      setTimeout(function () {
        waitForFirebase(cb, n + 1);
      }, 100);
    }
  
    function normalizeRoles(emp) {
      const arr = Array.isArray(emp && emp.roles) ? emp.roles : [];
      const single = emp && emp.role ? [emp.role] : [];
      return arr.concat(single)
        .filter(Boolean)
        .map(function (role) {
          return String(role).toLowerCase().trim();
        });
    }
  
    function showConsole() {
      state.dom.authLoading && (state.dom.authLoading.style.display = "none");
      state.dom.errorContainer && (state.dom.errorContainer.style.display = "none");
      state.dom.consoleTopbar && (state.dom.consoleTopbar.style.display = "block");
      state.dom.consoleShell && (state.dom.consoleShell.style.display = "grid");
      renderAll();
    }
  
    function showError(msg) {
      if (state.dom.authLoading) state.dom.authLoading.style.display = "none";
      if (state.dom.consoleTopbar) state.dom.consoleTopbar.style.display = "none";
      if (state.dom.consoleShell) state.dom.consoleShell.style.display = "none";
      if (state.dom.errorContainer) state.dom.errorContainer.style.display = "flex";
      if (state.dom.errorText) state.dom.errorText.textContent = msg || "Access denied.";
    }
  
    function updateViewerUrl() {
      const code = String(state.session.sessionCode || "").trim() || "BT-0000";
      const base = window.location.origin || "https://mybeachtrivia.com";
      state.session.viewerUrl = base + "/cast-game/?code=" + encodeURIComponent(code);
  
      if (state.dom.viewerUrl) {
        state.dom.viewerUrl.value = state.session.viewerUrl;
      }
    }
  
    function randomCode() {
      return "BT-" + Math.floor(1000 + Math.random() * 9000);
    }
  
    function copyText(value) {
      const text = String(value || "");
      if (!text) return;
  
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () {});
        return;
      }
  
      const temp = document.createElement("textarea");
      temp.value = text;
      document.body.appendChild(temp);
      temp.select();
      try {
        document.execCommand("copy");
      } catch (err) {
        console.warn("[host-live-console] copy failed:", err);
      }
      document.body.removeChild(temp);
    }
  
    function saveSession() {
      state.session.saved = true;
      renderSessionStatus();
      flashStatus("Session Saved");
      console.log("[host-live-console] save session placeholder", {
        session: state.session,
        playback: state.playback,
      });
    }
  
    function startSession() {
      state.session.started = true;
      state.session.saved = true;
      renderSessionStatus();
      flashStatus("Live Session Started");
      console.log("[host-live-console] start session placeholder", {
        session: state.session,
        playback: state.playback,
      });
    }
  
    function stepLive(delta) {
      const next = clamp(
        state.playback.liveIndex + delta,
        0,
        state.deck.slides.length - 1
      );
  
      state.playback.liveIndex = next;
  
      if (state.playback.previewIndex < state.playback.liveIndex) {
        state.playback.previewIndex = clamp(
          state.playback.liveIndex + 1,
          0,
          state.deck.slides.length - 1
        );
      }
  
      state.playback.revealShown = false;
      renderAll();
    }
  
    function stepPreview(delta) {
      state.playback.previewIndex = clamp(
        state.playback.previewIndex + delta,
        0,
        state.deck.slides.length - 1
      );
      renderAll();
    }
  
    function openRevealModal() {
      const slide = getLiveSlide();
      if (state.dom.modalAnswerValue) {
        state.dom.modalAnswerValue.textContent = slide.answer || "No answer available.";
      }
      if (state.dom.revealModal) {
        state.dom.revealModal.classList.add("open");
        state.dom.revealModal.setAttribute("aria-hidden", "false");
      }
    }
  
    function closeRevealModal() {
      if (state.dom.revealModal) {
        state.dom.revealModal.classList.remove("open");
        state.dom.revealModal.setAttribute("aria-hidden", "true");
      }
    }
  
    function renderAll() {
      renderSessionStatus();
      renderStats();
      renderStateList();
      renderLiveViewport();
      renderPreviewViewport();
    }
  
    function renderSessionStatus() {
      const chip = state.dom.liveStatusChip;
      if (!chip) return;
  
      if (state.session.started) {
        chip.textContent = "Live Session Active";
        chip.className = "chip live";
      } else if (state.session.saved) {
        chip.textContent = "Session Saved";
        chip.className = "chip preview";
      } else {
        chip.textContent = "Session Ready";
        chip.className = "chip live";
      }
    }
  
    function renderStats() {
      const liveSlide = getLiveSlide();
      const previewSlide = getPreviewSlide();
  
      if (state.dom.currentLiveState) {
        state.dom.currentLiveState.textContent = liveSlide.stateKey;
      }
      if (state.dom.currentPreviewState) {
        state.dom.currentPreviewState.textContent = previewSlide.stateKey;
      }
      if (state.dom.currentShowTitle) {
        state.dom.currentShowTitle.textContent = state.deck.title;
      }
      if (state.dom.currentRevealState) {
        state.dom.currentRevealState.textContent = state.playback.revealShown ? "On" : "Off";
      }
      if (state.dom.liveStateChip) {
        state.dom.liveStateChip.textContent = liveSlide.stateKey;
      }
      if (state.dom.previewStateChip) {
        state.dom.previewStateChip.textContent = previewSlide.stateKey;
      }
    }
  
    function renderStateList() {
      const root = state.dom.stateList;
      if (!root) return;
  
      const items = Array.from(root.querySelectorAll(".state-item"));
      items.forEach(function (item, idx) {
        item.classList.remove("active");
        const chip = item.querySelector(".chip");
        if (chip) chip.className = "chip";
  
        if (idx === state.playback.liveIndex) {
          item.classList.add("active");
          if (chip) {
            chip.className = "chip live";
            chip.textContent = "Live";
          }
        } else if (idx === state.playback.previewIndex) {
          if (chip) {
            chip.className = "chip preview";
            chip.textContent = "Preview";
          }
        } else if (chip && !/answer pass/i.test(chip.textContent || "")) {
          chip.textContent = "Queued";
        }
      });
    }
  
    function renderLiveViewport() {
      const slide = getLiveSlide();
      const showAnswer = slide.kind === "summary" || state.playback.revealShown;
  
      setText(state.dom.liveRoundBadge, slide.roundBadge);
      setText(state.dom.liveStateLabel, slide.stateLabel);
      setText(state.dom.liveThemeLabel, "Theme: " + state.deck.theme);
      setText(state.dom.liveCategory, slide.category);
      setText(state.dom.liveQuestion, slide.question);
      setText(state.dom.liveNotes, slide.notes || "");
      setText(state.dom.liveModeChip, showAnswer ? "Reveal Visible" : (slide.modeChip || "Reveal Hidden"));
  
      renderOptions(state.dom.liveOptions, slide.options);
  
      if (state.dom.liveAnswer) {
        const value = state.dom.liveAnswer.querySelector(".value");
        if (value) value.textContent = slide.answer || "";
        state.dom.liveAnswer.classList.toggle("visible", !!showAnswer && !!slide.answer);
      }
    }
  
    function renderPreviewViewport() {
      const slide = getPreviewSlide();
  
      setText(state.dom.previewRoundBadge, slide.roundBadge);
      setText(state.dom.previewStateLabel, slide.stateLabel);
      setText(state.dom.previewThemeLabel, "Theme: " + state.deck.theme);
      setText(state.dom.previewCategory, slide.category);
      setText(state.dom.previewQuestion, slide.question);
      setText(state.dom.previewNotes, slide.notes || "");
      setText(state.dom.previewModeChip, "Preview Only");
  
      renderOptions(state.dom.previewOptions, slide.options);
  
      if (state.dom.previewAnswer) {
        const value = state.dom.previewAnswer.querySelector(".value");
        if (value) value.textContent = slide.answer || "";
        state.dom.previewAnswer.classList.toggle("visible", !!slide.answer);
      }
    }
  
    function renderOptions(container, options) {
      if (!container) return;
      container.innerHTML = "";
  
      const normalized = Array.isArray(options) ? options.filter(Boolean) : [];
      if (!normalized.length) {
        container.style.display = "none";
        return;
      }
  
      container.style.display = "";
      normalized.forEach(function (option, index) {
        const row = document.createElement("div");
        row.className = "slide-option";
  
        const key = document.createElement("span");
        key.className = "slide-option-key";
        key.textContent = String.fromCharCode(65 + index);
  
        const text = document.createElement("span");
        text.textContent = option;
  
        row.appendChild(key);
        row.appendChild(text);
        container.appendChild(row);
      });
    }
  
    function getLiveSlide() {
      return state.deck.slides[state.playback.liveIndex] || state.deck.slides[0];
    }
  
    function getPreviewSlide() {
      return state.deck.slides[state.playback.previewIndex] || state.deck.slides[0];
    }
  
    function setText(el, value) {
      if (el) el.textContent = value == null ? "" : String(value);
    }
  
    function flashStatus(text) {
      const chip = state.dom.liveStatusChip;
      if (!chip) return;
  
      const originalText = chip.textContent;
      const originalClass = chip.className;
  
      chip.textContent = text;
      chip.className = "chip preview";
  
      setTimeout(function () {
        chip.textContent = originalText;
        chip.className = originalClass;
      }, 1400);
    }
  
    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }
  
    document.addEventListener("DOMContentLoaded", init);
  })();