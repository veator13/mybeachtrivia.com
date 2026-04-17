// mybeachtrivia.com/cast-game/app.js
// Cast game viewer app
// Phase 1:
// - join by session code
// - read session state from Firestore
// - render synced audience slide
// - fallback to local demo rendering if Firestore session is missing
//
// Expected future Firestore shape:
// liveSessions/{sessionId} {
//   sessionCode: "BT-4827",
//   currentStateKey: "round1.q2.live",
//   revealShown: false,
//   currentSlide: { ...optional normalized slide payload... },
//   showTitle: "March 2026 Trivia",
//   theme: "Standard Trivia",
//   updatedAt: <timestamp>
// }

(function () {
    "use strict";
  
    const APP = {
      init,
    };
  
    window.CastGameApp = APP;
  
    const state = {
      sessionCode: "",
      unsubscribeSession: null,
      connected: false,
      dom: {},
      fallbackSlides: {
        "round1.categories": {
          roundBadge: "Round 1",
          stateLabel: "Round 1 Categories",
          theme: "Standard Trivia",
          category: "Round Categories",
          question: "Classic Artists • World Capitals • Famous Films • 90s Music • Strange History",
          options: [],
          answer: "",
          notes: "Connected viewer screens should mirror the host's live session state.",
          reveal: false,
          modeChip: "Categories",
        },
        "round1.q1.live": {
          roundBadge: "Round 1",
          stateLabel: "Live Question",
          theme: "Standard Trivia",
          category: "Classic Artists",
          question: "Which artist helped define the visual style shown on the screen?",
          options: ["Andy Warhol", "Jean-Michel Basquiat", "Keith Haring", "Roy Lichtenstein"],
          answer: "Jean-Michel Basquiat",
          notes: "Waiting for the host to advance the live session.",
          reveal: false,
          modeChip: "Reveal Hidden",
        },
        "round1.q2.live": {
          roundBadge: "Round 1",
          stateLabel: "Live Question",
          theme: "Standard Trivia",
          category: "Classic Artists",
          question: "Which artist is known for the painting style shown on the screen?",
          options: ["Andy Warhol", "Jean-Michel Basquiat", "Keith Haring", "Roy Lichtenstein"],
          answer: "Jean-Michel Basquiat",
          notes: "Connected viewer screens should mirror the host's live session state.",
          reveal: false,
          modeChip: "Reveal Hidden",
        },
        "round1.q3.live": {
          roundBadge: "Round 1",
          stateLabel: "Live Question",
          theme: "Standard Trivia",
          category: "Classic Artists",
          question: "Which artist was closely associated with New York neo-expressionism?",
          options: ["Jean-Michel Basquiat", "Jackson Pollock", "Edward Hopper", "Grant Wood"],
          answer: "Jean-Michel Basquiat",
          notes: "The casted screen should update immediately when the host advances.",
          reveal: false,
          modeChip: "Reveal Hidden",
        },
        "round1.turn-in": {
          roundBadge: "Round 1",
          stateLabel: "Turn In Slips",
          theme: "Standard Trivia",
          category: "Turn In Your Slips",
          question: "Please turn in your answer slips for Round 1.",
          options: [],
          answer: "",
          notes: "Pacing slide before the answer reveal pass.",
          reveal: false,
          modeChip: "Turn-In",
        },
        "round1.q1.reveal": {
          roundBadge: "Round 1",
          stateLabel: "Answer Reveal",
          theme: "Standard Trivia",
          category: "Classic Artists",
          question: "Which artist helped define the visual style shown on the screen?",
          options: ["Andy Warhol", "Jean-Michel Basquiat", "Keith Haring", "Roy Lichtenstein"],
          answer: "Jean-Michel Basquiat",
          notes: "Answer reveal state pushed from the host console.",
          reveal: true,
          modeChip: "Reveal Visible",
        },
        "round1.q2.reveal": {
          roundBadge: "Round 1",
          stateLabel: "Answer Reveal",
          theme: "Standard Trivia",
          category: "Classic Artists",
          question: "Which artist is known for the painting style shown on the screen?",
          options: ["Andy Warhol", "Jean-Michel Basquiat", "Keith Haring", "Roy Lichtenstein"],
          answer: "Jean-Michel Basquiat",
          notes: "Answer reveal state pushed from the host console.",
          reveal: true,
          modeChip: "Reveal Visible",
        },
        "round1.answers-summary": {
          roundBadge: "Round 1",
          stateLabel: "Answers Summary",
          theme: "Standard Trivia",
          category: "All Round 1 Answers",
          question: "1) Basquiat  •  2) Basquiat  •  3) Basquiat  •  4) Basquiat  •  5) Basquiat",
          options: [],
          answer: "Jean-Michel Basquiat",
          notes: "Summary slide shown after the repeated reveal pass.",
          reveal: true,
          modeChip: "Summary",
        },
      },
    };
  
    function $(selector, root) {
      return (root || document).querySelector(selector);
    }
  
    function init() {
      cacheDom();
      bindUi();
      bootstrapFromUrl();
    }
  
    function cacheDom() {
      state.dom = {
        loadingScreen: $("#loading-screen"),
        errorScreen: $("#error-screen"),
        errorText: $("#error-text"),
        joinOverlay: $("#join-overlay"),
        viewerShell: $("#viewer-shell"),
  
        sessionCodeInput: $("#session-code-input"),
        joinSessionBtn: $("#join-session-btn"),
        reloadCodeBtn: $("#reload-code-btn"),
  
        roundBadge: $("#round-badge"),
        stateLabel: $("#state-label"),
        themeLabel: $("#theme-label"),
        sessionLabel: $("#session-label"),
        slideCategory: $("#slide-category"),
        slideQuestion: $("#slide-question"),
        slideOptions: $("#slide-options"),
        slideAnswer: $("#slide-answer"),
        slideAnswerValue: $("#slide-answer-value"),
        viewerNotes: $("#viewer-notes"),
        modeChip: $("#mode-chip"),
  
        statusFloating: $("#status-floating"),
        statusFloatingText: $("#status-floating-text"),
      };
    }
  
    function bindUi() {
      const d = state.dom;
  
      d.joinSessionBtn?.addEventListener("click", function () {
        const code = (d.sessionCodeInput?.value || "").trim();
        if (!code) {
          d.sessionCodeInput?.focus();
          return;
        }
        joinSession(code);
      });
  
      d.reloadCodeBtn?.addEventListener("click", function () {
        const urlCode = getUrlCode();
        if (d.sessionCodeInput) d.sessionCodeInput.value = urlCode;
      });
  
      d.sessionCodeInput?.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          d.joinSessionBtn?.click();
        }
      });
    }
  
    function bootstrapFromUrl() {
      const urlCode = getUrlCode();
      if (state.dom.sessionCodeInput) {
        state.dom.sessionCodeInput.value = urlCode;
      }
  
      if (urlCode) {
        joinSession(urlCode);
      } else {
        showJoin();
      }
    }
  
    function getUrlCode() {
      try {
        const params = new URLSearchParams(window.location.search);
        return String(params.get("code") || "").trim().toUpperCase();
      } catch (err) {
        console.warn("[cast-game] failed reading URL code:", err);
        return "";
      }
    }
  
    function setStatus(text) {
      if (state.dom.statusFloatingText) {
        state.dom.statusFloatingText.textContent = text || "Connected";
      }
    }
  
    function showLoading() {
      if (state.dom.loadingScreen) state.dom.loadingScreen.style.display = "flex";
      if (state.dom.errorScreen) state.dom.errorScreen.style.display = "none";
      if (state.dom.joinOverlay) state.dom.joinOverlay.style.display = "none";
      if (state.dom.viewerShell) state.dom.viewerShell.style.display = "none";
      if (state.dom.statusFloating) state.dom.statusFloating.style.display = "none";
    }
  
    function showJoin() {
      if (state.dom.loadingScreen) state.dom.loadingScreen.style.display = "none";
      if (state.dom.errorScreen) state.dom.errorScreen.style.display = "none";
      if (state.dom.joinOverlay) state.dom.joinOverlay.style.display = "flex";
      if (state.dom.viewerShell) state.dom.viewerShell.style.display = "none";
      if (state.dom.statusFloating) state.dom.statusFloating.style.display = "none";
    }
  
    function showViewer() {
      if (state.dom.loadingScreen) state.dom.loadingScreen.style.display = "none";
      if (state.dom.errorScreen) state.dom.errorScreen.style.display = "none";
      if (state.dom.joinOverlay) state.dom.joinOverlay.style.display = "none";
      if (state.dom.viewerShell) state.dom.viewerShell.style.display = "block";
      if (state.dom.statusFloating) state.dom.statusFloating.style.display = "inline-flex";
    }
  
    function showError(message) {
      if (state.dom.loadingScreen) state.dom.loadingScreen.style.display = "none";
      if (state.dom.joinOverlay) state.dom.joinOverlay.style.display = "none";
      if (state.dom.viewerShell) state.dom.viewerShell.style.display = "none";
      if (state.dom.statusFloating) state.dom.statusFloating.style.display = "none";
      if (state.dom.errorText) {
        state.dom.errorText.textContent = message || "Unable to load viewer.";
      }
      if (state.dom.errorScreen) state.dom.errorScreen.style.display = "flex";
    }
  
    function waitForFirebase(cb, attempts) {
      const n = attempts || 0;
      if (window.firebase && window.firebase.firestore) {
        cb();
        return;
      }
      if (n > 40) {
        showError("Firebase failed to load for the cast viewer.");
        return;
      }
      setTimeout(function () {
        waitForFirebase(cb, n + 1);
      }, 100);
    }
  
    function joinSession(code) {
      state.sessionCode = String(code || "").trim().toUpperCase();
      if (!state.sessionCode) {
        showJoin();
        return;
      }
  
      if (state.dom.sessionCodeInput) {
        state.dom.sessionCodeInput.value = state.sessionCode;
      }
  
      showLoading();
      setStatus("Connecting...");
  
      cleanupSubscription();
  
      waitForFirebase(function () {
        const db = firebase.firestore();
  
        state.unsubscribeSession = db.collection("liveSessions")
          .where("sessionCode", "==", state.sessionCode)
          .limit(1)
          .onSnapshot(function (snapshot) {
            showViewer();
  
            if (!snapshot.empty) {
              const doc = snapshot.docs[0];
              const data = doc.data() || {};
              state.connected = true;
              renderFromSessionDoc(data);
              setStatus("Connected");
              return;
            }
  
            state.connected = false;
            renderFromSessionDoc({
              currentStateKey: "round1.q2.live",
              revealShown: false,
            });
            setStatus("Demo Mode • Waiting for Firestore session");
          }, function (err) {
            console.error("[cast-game] session subscription failed:", err);
            state.connected = false;
            showViewer();
            renderFromSessionDoc({
              currentStateKey: "round1.q2.live",
              revealShown: false,
            });
            setStatus("Demo Mode");
          });
      });
    }
  
    function cleanupSubscription() {
      if (typeof state.unsubscribeSession === "function") {
        try {
          state.unsubscribeSession();
        } catch (err) {
          console.warn("[cast-game] unsubscribe failed:", err);
        }
      }
      state.unsubscribeSession = null;
    }
  
    function renderFromSessionDoc(docData) {
      const currentStateKey = String(docData && docData.currentStateKey || "round1.q2.live");
      const revealShown = !!(docData && docData.revealShown);
      const currentSlide = docData && docData.currentSlide ? docData.currentSlide : null;
      const showTitle = String(docData && docData.showTitle || "");
      const theme = String(docData && docData.theme || "");
  
      let slideData = null;
  
      if (currentSlide && typeof currentSlide === "object") {
        slideData = normalizeIncomingSlide(currentSlide, currentStateKey, revealShown, theme);
      } else {
        slideData = getFallbackSlideForState(currentStateKey, revealShown);
        if (theme) slideData.theme = theme;
      }
  
      renderSlide(slideData, showTitle);
    }
  
    function normalizeIncomingSlide(slide, stateKey, revealShown, theme) {
      return {
        roundBadge: stringOr(slide.roundBadge || slide.title, "Round"),
        stateLabel: stringOr(slide.stateLabel || stateKey, "Live Question"),
        theme: stringOr(theme || slide.themeStyle, "Standard Trivia"),
        category: stringOr(slide.categoryName || slide.category, "Category"),
        question: stringOr(slide.prompt || slide.question, "Waiting for live slide..."),
        options: normalizeOptions(slide.options),
        answer: stringOr(slide.answer, ""),
        notes: stringOr(slide.notes, ""),
        reveal: revealShown || !!slide.answerVisibleByDefault || String(slide.audienceMode || "").toLowerCase() === "reveal",
        modeChip: revealShown ? "Reveal Visible" : inferModeChip(slide),
      };
    }
  
    function getFallbackSlideForState(stateKey, revealShown) {
      const key = String(stateKey || "").trim();
  
      if (revealShown && state.fallbackSlides[key + ".reveal"]) {
        return clone(state.fallbackSlides[key + ".reveal"]);
      }
  
      if (state.fallbackSlides[key]) {
        const slide = clone(state.fallbackSlides[key]);
        if (revealShown && slide.answer) {
          slide.reveal = true;
          slide.modeChip = "Reveal Visible";
          if (slide.stateLabel === "Live Question") {
            slide.stateLabel = "Answer Reveal";
          }
        }
        return slide;
      }
  
      return {
        roundBadge: "Trivia Night",
        stateLabel: key || "Waiting for slide",
        theme: "Standard Trivia",
        category: "Beach Trivia",
        question: "Waiting for the host to start or sync this session.",
        options: [],
        answer: "",
        notes: "This viewer will update when the live session state changes.",
        reveal: false,
        modeChip: "Waiting",
      };
    }
  
    function renderSlide(slide, showTitle) {
      if (!slide) return;
  
      setText(state.dom.roundBadge, slide.roundBadge || "Round");
      setText(state.dom.stateLabel, slide.stateLabel || "Live Question");
      setText(state.dom.themeLabel, "Theme: " + (slide.theme || "Standard Trivia"));
      setText(
        state.dom.sessionLabel,
        showTitle
          ? "Session: " + state.sessionCode + " • " + showTitle
          : "Session: " + state.sessionCode
      );
      setText(state.dom.slideCategory, slide.category || "Category");
      setText(state.dom.slideQuestion, slide.question || "Waiting for live slide...");
      setText(state.dom.viewerNotes, slide.notes || "");
      setText(state.dom.modeChip, slide.modeChip || "Reveal Hidden");
      setText(state.dom.slideAnswerValue, slide.answer || "");
  
      renderOptions(slide.options);
  
      if (state.dom.slideAnswer) {
        state.dom.slideAnswer.classList.toggle("visible", !!slide.reveal && !!slide.answer);
      }
    }
  
    function renderOptions(options) {
      const container = state.dom.slideOptions;
      if (!container) return;
  
      container.innerHTML = "";
  
      const normalized = normalizeOptions(options);
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
  
    function inferModeChip(slide) {
      const kind = String(slide.kind || "").toLowerCase();
      const audienceMode = String(slide.audienceMode || "").toLowerCase();
  
      if (kind === "summary") return "Summary";
      if (kind === "turn-in") return "Turn-In";
      if (kind === "categories" || kind === "round-categories") return "Categories";
      if (audienceMode === "reveal") return "Reveal Visible";
      return "Reveal Hidden";
    }
  
    function normalizeOptions(options) {
      if (!Array.isArray(options)) return [];
      return options
        .map(function (item) {
          return String(item || "").trim();
        })
        .filter(function (item) {
          return item.length > 0;
        });
    }
  
    function setText(el, value) {
      if (el) el.textContent = value == null ? "" : String(value);
    }
  
    function stringOr(value, fallback) {
      return value == null ? fallback : String(value);
    }
  
    function clone(value) {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (err) {
        return {};
      }
    }
  
    window.addEventListener("beforeunload", cleanupSubscription);
    document.addEventListener("DOMContentLoaded", init);
  })();