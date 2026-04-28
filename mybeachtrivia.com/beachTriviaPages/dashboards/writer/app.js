// writer/app.js
// Boot script for Writer Slideshow Generator
// Phase 1: Auth, module orchestration, tab switching, UI wiring
// Phase 2: Firestore draft storage
// Phase 3: Show publishing + host console integration

(function () {
  "use strict";

  console.log("[writer] app booting");

  // ─── DOM helpers ──────────────────────────────────────────────

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  // ─── Firebase wait ─────────────────────────────────────────────

  function waitForFirebase(cb, attempts) {
    var n = attempts || 0;
    if (window.firebase && window.firebase.auth && window.firebase.firestore) {
      cb();
      return;
    }
    if (n > 40) {
      showShellError("Firebase failed to load.");
      return;
    }
    setTimeout(function () { waitForFirebase(cb, n + 1); }, 100);
  }

  // ─── Shell visibility ──────────────────────────────────────────

  function showShellError(msg) {
    var authLoading = $("#auth-loading");
    var writerShell = $("#writer-shell");
    var writerTopbar = $("#writer-topbar");
    var errorContainer = $("#error-container");
    var errorText = $("#error-text");

    if (authLoading) authLoading.style.display = "none";
    if (writerShell) writerShell.style.display = "none";
    if (writerTopbar) writerTopbar.style.display = "none";
    if (errorContainer) errorContainer.style.display = "flex";
    if (errorText) errorText.textContent = msg || "Access denied.";
  }

  function revealShell() {
    var authLoading = $("#auth-loading");
    var writerShell = $("#writer-shell");
    var writerTopbar = $("#writer-topbar");
    var errorContainer = $("#error-container");

    if (authLoading) authLoading.style.display = "none";
    if (errorContainer) errorContainer.style.display = "none";
    if (writerTopbar) writerTopbar.style.display = "grid";
    if (writerShell) writerShell.style.display = "grid";
  }

  // ─── Auth + role check ─────────────────────────────────────────

  function normalizeRoles(emp) {
    var arr = Array.isArray(emp && emp.roles) ? emp.roles : [];
    var single = emp && emp.role ? [emp.role] : [];
    return arr.concat(single)
      .filter(Boolean)
      .map(function (r) { return String(r).toLowerCase().trim(); });
  }

  function checkAuth() {
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) {
        window.location.assign("/login.html");
        return;
      }

      firebase.firestore().collection("employees").doc(user.uid).get()
        .then(function (snap) {
          if (!snap.exists) {
            showShellError("No employee record found.");
            return;
          }

          var emp = snap.data() || {};

          if (emp.active === false) {
            showShellError("Your account is not active.");
            return;
          }

          var roles = normalizeRoles(emp);
          var hasAccess = roles.indexOf("writer") !== -1 || roles.indexOf("admin") !== -1;

          if (!hasAccess) {
            showShellError("You do not have access to this page.");
            return;
          }

          revealShell();
          populateAuthorField(emp, user);
          initApp();
        })
        .catch(function (err) {
          console.error("[writer] auth check failed:", err);
          showShellError("Could not verify access.");
        });
    });
  }

  // ─── Author field ──────────────────────────────────────────────

  function populateAuthorField(emp, user) {
    var field = $("#show-author");
    if (!field) return;

    var name = "";

    if (emp.firstName && emp.lastName) {
      name = emp.firstName.trim() + " " + emp.lastName.trim();
    } else if (emp.firstName) {
      name = emp.firstName.trim();
    } else if (emp.displayName) {
      name = emp.displayName.trim();
    } else if (user && user.displayName) {
      name = user.displayName.trim();
    } else if (user && user.email) {
      name = user.email;
    }

    field.value = name;
  }

  // ─── Tab switching ─────────────────────────────────────────────

  // Programmatically activate a tab by its data-tab value.
  function switchToTab(tabName) {
    var tabBtns  = Array.from(document.querySelectorAll(".tab-btn"));
    var tabPanes = Array.from(document.querySelectorAll(".tab-pane"));
    tabBtns.forEach(function (b) {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    tabPanes.forEach(function (p) { p.classList.remove("active"); });
    var btn  = document.querySelector('.tab-btn[data-tab="' + tabName + '"]');
    var pane = document.getElementById("tab-" + tabName);
    if (btn)  { btn.classList.add("active"); btn.setAttribute("aria-selected", "true"); }
    if (pane) { pane.classList.add("active"); }
  }

  function initTabs() {
    var tabBtns = Array.from(document.querySelectorAll(".tab-btn"));
    var tabPanes = Array.from(document.querySelectorAll(".tab-pane"));

    tabBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = btn.getAttribute("data-tab");

        tabBtns.forEach(function (b) {
          b.classList.remove("active");
          b.setAttribute("aria-selected", "false");
        });
        tabPanes.forEach(function (p) { p.classList.remove("active"); });

        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");

        var pane = document.getElementById("tab-" + target);
        if (pane) pane.classList.add("active");
      });
    });
  }

  // ─── Show info bar ─────────────────────────────────────────────

  function updateShowInfoBar(data) {
    var show = (data && data.show) || {};
    var titleEl = $("#ri-show-title");
    var dateEl = $("#ri-show-date");
    var statusEl = $("#ri-show-status");

    if (titleEl) titleEl.textContent = show.title || "Untitled Show";
    if (dateEl) dateEl.textContent = show.dateLabel || "No date set";
    if (statusEl) statusEl.textContent = show.status || "draft";
  }

  // ─── Module event bridge ───────────────────────────────────────

  function bindModuleEvents() {
    document.addEventListener("writer:question-form-change", function (e) {
      if (!e || !e.detail || !e.detail.data) return;
      var reason = String((e.detail && e.detail.reason) || "");
      // setFormData (slide navigation / sync) and init must NOT re-render the Questions
      // tab: rebuild destroys focused inputs and makes fields untypeable.
      var skipTemplateBuilderRefresh =
        reason === "set-form-data" || reason === "init";

      updateShowInfoBar(e.detail.data);
      if (!suppressFormBridge) {
        syncCurrentEntryFromForm(e.detail.data);
        // Only advance on real edits — not programmatic setFormData (navigation,
        // filmstrip, restore), or the classic template would chain-advance through
        // every already-complete question when landing on a slide.
        var skipAutoAdvance =
          reason === "set-form-data" || reason === "init";
        if (!skipAutoAdvance) {
          maybeAutoAdvanceTemplate(e.detail.data);
        }
      }
      if (!templateBuilderSyncing && !skipTemplateBuilderRefresh) {
        renderTemplateBuilderList();
      }
      markDirty();
    });
  }

  // Block types whose content is managed by the template builder or preset data,
  // not by the question form.  The question form lacks fields for their special
  // properties (e.g. answerText for rules, auto-populated categories) so syncing
  // from it would silently corrupt the entry.
  var FORM_UNEDITABLE_BLOCK_TYPES = [
    "intro-slide", "info-slide", "round-start",
    "category-slide", "answers-summary", "closing-slide",
    "feud-round-intro", "feud-turn-in", "feud-closing",
  ];

  function syncCurrentEntryFromForm(formData) {
    var item = getCurrentFlatItem();
    if (!item || !item.blockEntry || !item.blockEntry.formData) return;
    if (isTitleFlatItem(item)) return;

    var entry = item.blockEntry;
    var currentBlockType = String((entry.block && entry.block.type) || "").toLowerCase();

    // Display-only / template-managed blocks must never be overwritten by the
    // question form — the form cannot represent their full data.
    if (FORM_UNEDITABLE_BLOCK_TYPES.indexOf(currentBlockType) !== -1) return;
    var updated = safeClone(formData || {});
    updated.show = safeClone((formData && formData.show) || {});

    entry.formData = updated;

    if (
      currentBlockType === "single-question" ||
      currentBlockType === "standard-round" ||
      currentBlockType === "halftime" ||
      currentBlockType === "final-question" ||
      currentBlockType === "category-of-the-day" ||
      currentBlockType === "category-slide" ||
      currentBlockType === "intro-slide" ||
      currentBlockType === "closing-slide" ||
      currentBlockType === "feud-single-question" ||
      currentBlockType === "feud-halftime" ||
      currentBlockType === "feud-final"
    ) {
      entry.block = WriterBlockBuilder.createBlockByType(currentBlockType, updated);
      rebuildFlatSlides();
      preserveCurrentSelection(entry);
      renderFilmstrip();
      updateStatCounters();
    } else {
      patchInfoBlockFromForm(entry, updated);
      renderFilmstrip();
    }
  }

  function patchInfoBlockFromForm(entry, formData) {
    if (!entry || !entry.block) return;
    var blockData = (formData && formData.block) || {};
    entry.block.roundName = blockData.roundName || entry.block.roundName || "";
    entry.block.categoryName = blockData.categoryName || entry.block.categoryName || "";
    entry.block.questionType = blockData.questionType || entry.block.questionType || "display";
    entry.block.themeStyle = blockData.themeStyle || entry.block.themeStyle || "Standard Trivia";
    entry.block.fontSizeMode = blockData.fontSizeMode || entry.block.fontSizeMode || "Auto Fit";
    entry.block.notes = blockData.questionNotes || entry.block.notes || "";
    if (Array.isArray(entry.block.slides) && entry.block.slides[0]) {
      entry.block.slides[0].title = blockData.roundName || entry.block.slides[0].title || "";
      entry.block.slides[0].categoryName = blockData.categoryName || entry.block.slides[0].categoryName || "";
      entry.block.slides[0].prompt = blockData.questionText || entry.block.slides[0].prompt || "";
      entry.block.slides[0].answer = blockData.answerText || entry.block.slides[0].answer || "";
      entry.block.slides[0].notes = blockData.questionNotes || entry.block.slides[0].notes || "";
      entry.block.slides[0].themeStyle = blockData.themeStyle || entry.block.slides[0].themeStyle || "Standard Trivia";
      entry.block.slides[0].fontSizeMode = blockData.fontSizeMode || entry.block.slides[0].fontSizeMode || "Auto Fit";
    }
  }

  function preserveCurrentSelection(entryRef) {
    for (var i = 0; i < showState.flatSlides.length; i++) {
      if (showState.flatSlides[i].blockEntry === entryRef) {
        showState.currentIdx = i;
        return;
      }
    }
    if (showState.flatSlides.length) showState.currentIdx = 0;
  }

  function getCurrentFlatItem() {
    if (showState.currentIdx < 0 || showState.currentIdx >= showState.flatSlides.length) return null;
    return showState.flatSlides[showState.currentIdx];
  }

  function isTitleFlatItem(item) {
    if (!item || !item.slide) return false;
    return String(item.slide.type || "").toLowerCase() === "title";
  }

  function maybeAutoAdvanceTemplate(formData) {
    if (!templateWorkflow.active) return;
    var item = getCurrentFlatItem();
    if (!item || !item.blockEntry || !item.blockEntry.block) return;

    var block = item.blockEntry.block;
    var blockType = String(block.type || "").toLowerCase();

    if (templateWorkflow.type === "feud-show") {
      if (blockType !== "feud-single-question") return;
      var fb = (formData && formData.block) || {};
      var feudReady = stripHtml(String(fb.questionText || "")).trim() &&
        Array.isArray(fb.feudAnswers) && fb.feudAnswers.length >= 3 &&
        fb.feudAnswers.some(function (a) { return String(a.text || "").trim(); });
      if (!feudReady) return;
      if (templateWorkflow.advancedBlockIds[block.id]) return;
      templateWorkflow.advancedBlockIds[block.id] = true;
      var nextIdx = findNextEditableBlockFirstSlideIndex(showState.currentIdx);
      if (nextIdx !== -1) {
        setTimeout(function () { navigateToSlide(nextIdx); }, 120);
      }
      return;
    }

    if (templateWorkflow.type !== "classic-trivia") return;
    if (blockType !== "single-question") return;

    var b = (formData && formData.block) || {};
    var ready = String(b.categoryName || "").trim() &&
      stripHtml(String(b.questionText || "")).trim() &&
      String(b.answerText || "").trim();
    if (!ready) return;
    if (templateWorkflow.advancedBlockIds[block.id]) return;
    templateWorkflow.advancedBlockIds[block.id] = true;

    var nextIdx = findNextEditableBlockFirstSlideIndex(showState.currentIdx);
    if (nextIdx !== -1) {
      setTimeout(function () {
        navigateToSlide(nextIdx);
      }, 120);
    }
  }

  function findNextEditableBlockFirstSlideIndex(fromIdx) {
    var src = showState.flatSlides[fromIdx];
    if (!src) return -1;
    var currentBlockIdx = src.blockIdx;
    for (var i = fromIdx + 1; i < showState.flatSlides.length; i++) {
      var item = showState.flatSlides[i];
      if (!item || item.blockIdx === currentBlockIdx) continue;
      if (isTitleFlatItem(item)) continue;
      // Skip uneditable structural blocks
      var bt = String((item.blockEntry && item.blockEntry.block && item.blockEntry.block.type) || "").toLowerCase();
      if (FORM_UNEDITABLE_BLOCK_TYPES.indexOf(bt) !== -1) continue;
      if (item.slideIdx !== 0) continue;
      return i;
    }
    return -1;
  }

  function stripHtml(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = String(html || "");
    return tmp.textContent || tmp.innerText || "";
  }

  // ─── Show serialization ────────────────────────────────────────

  // Builds the full show payload for Firestore — show metadata + all assembled
  // blocks. This is what gets written on Save Draft and Publish.
  function serializeShowForSave() {
    var user = firebase.auth().currentUser;
    var formData = window.WriterQuestionForm ? WriterQuestionForm.getFormData() : {};
    var showMeta = formData.show || {};

    return {
      show: showMeta,
      blocks: showState.blocks.map(function (entry) {
        return { block: entry.block, formData: entry.formData };
      }),
      writerUi: {
        templateWorkflowActive: !!templateWorkflow.active,
        templateWorkflowType: String(templateWorkflow.type || ""),
      },
      authorUid: user ? user.uid : null,
      status: showMeta.status || "draft",
      lastTouchedAt: firebase.firestore.FieldValue.serverTimestamp(),
      expiresAfterDays: 90,
    };
  }

  // Updates the autosave pill text in the topbar.
  // States: "saving" | "saved" | "error" | "ready"
  function updateAutosavePill(state) {
    var pill = document.querySelector(".autosave-pill");
    if (!pill) return;
    var dot = '<span class="autosave-dot" aria-hidden="true"></span> ';
    if (state === "saving") {
      pill.innerHTML = dot + "Saving\u2026";
    } else if (state === "saved") {
      pill.innerHTML = dot + "Draft saved";
      setTimeout(function () { updateAutosavePill("ready"); }, 3000);
    } else if (state === "error") {
      pill.innerHTML = dot + "Save failed";
    } else {
      pill.innerHTML = dot + "Draft autosave ready";
    }
  }

  // ─── Dirty-state tracking ──────────────────────────────────────

  // Call whenever the show is modified after the last save/publish.
  function markDirty() {
    if (!appReady || isDirty) return;
    isDirty = true;
    var banner = $("#unsaved-banner");
    var bannerText = $("#unsaved-banner-text");
    if (!banner) return;
    if (activePublishedId) {
      var pubMsg =
        "This show has unpublished changes — click Publish Show to update.";
      bannerText.textContent = "Unpublished";
      banner.setAttribute("title", pubMsg);
      banner.setAttribute("aria-label", pubMsg);
    } else {
      var draftMsg =
        "You have unsaved changes — click Save Draft to save your progress.";
      bannerText.textContent = "Unsaved";
      banner.setAttribute("title", draftMsg);
      banner.setAttribute("aria-label", draftMsg);
    }
    banner.classList.remove("hidden");
  }

  // Call after a successful save or publish to clear the banner.
  function markClean() {
    isDirty = false;
    var banner = $("#unsaved-banner");
    if (banner) {
      banner.classList.add("hidden");
      banner.removeAttribute("title");
      banner.removeAttribute("aria-label");
    }
  }

  // ─── Topbar buttons ────────────────────────────────────────────

  function bindTopbarButtons() {
    var btnSaveDraft = $("#btn-save-draft");
    var btnValidate = $("#btn-preview-publish");
    var btnPublish = $("#btn-publish");
    var btnBack = $("#back-to-login");

    if (btnBack) {
      btnBack.addEventListener("click", function () {
        window.location.assign("/login.html");
      });
    }

    if (btnSaveDraft) {
      btnSaveDraft.addEventListener("click", function () {
        if (!window.WriterQuestionForm) return;

        var db = firebase.firestore();
        var data = serializeShowForSave();

        btnSaveDraft.disabled = true;
        updateAutosavePill("saving");

        var savePromise;
        if (activeDraftId) {
          // Update the existing draft doc
          savePromise = db.collection("showDrafts").doc(activeDraftId).set(data);
        } else {
          // First save — auto-generate a new doc ID and store it for this session
          var newRef = db.collection("showDrafts").doc();
          activeDraftId = newRef.id;
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          savePromise = newRef.set(data);
        }

        savePromise
          .then(function () {
            console.log("[writer] draft saved:", activeDraftId);
            updateAutosavePill("saved");
            markClean();
            btnSaveDraft.disabled = false;
          })
          .catch(function (err) {
            console.error("[writer] draft save failed:", err);
            updateAutosavePill("error");
            btnSaveDraft.disabled = false;
          });
      });
    }

    if (btnValidate) {
      btnValidate.addEventListener("click", function () {
        if (!window.WriterQuestionForm) return;
        var result = WriterQuestionForm.validateForPublish();
        console.log("[writer] validate result", result);
        if (!result.valid) {
          alert("Not ready to publish:\n\n" + result.messages.join("\n"));
        } else {
          alert("Draft looks good — ready to publish.");
        }
      });
    }

    if (btnPublish) {
      btnPublish.addEventListener("click", function () {
        if (!window.WriterQuestionForm) return;

        var result = WriterQuestionForm.validateForPublish();
        if (!result.valid) {
          alert("Cannot publish:\n\n" + result.messages.join("\n"));
          return;
        }

        var db = firebase.firestore();
        var data = serializeShowForSave();

        // Override fields for a published show
        data.status = "published";
        data.publishedAt = firebase.firestore.FieldValue.serverTimestamp();
        delete data.expiresAfterDays; // published shows don't expire

        btnPublish.disabled = true;

        // If this show was already published, update it in-place rather than
        // creating a duplicate entry in publishedShows.
        var publishRef = activePublishedId
          ? db.collection("publishedShows").doc(activePublishedId)
          : db.collection("publishedShows").doc();

        publishRef.set(data)
          .then(function () {
            activePublishedId = publishRef.id;
            console.log("[writer] show published:", activePublishedId);
            // Remove the draft if one exists — it has been promoted
            if (activeDraftId) {
              return db.collection("showDrafts").doc(activeDraftId).delete()
                .then(function () {
                  console.log("[writer] draft removed after publish");
                  activeDraftId = null;
                });
            }
          })
          .then(function () {
            markClean();
            btnPublish.disabled = false;
            alert("Show published successfully!");
          })
          .catch(function (err) {
            console.error("[writer] publish failed:", err);
            btnPublish.disabled = false;
            alert("Publish failed. Please try again.");
          });
      });
    }
  }

  // ─── In-memory show state ──────────────────────────────────────

  // Tracks the Firestore doc ID of the active draft, once first saved.
  // Null until the user saves for the first time in this session.
  var activeDraftId = null;

  // Tracks the Firestore doc ID of a published show that has been opened
  // or just published. Publish will update this doc in-place rather than
  // creating a new one.
  var activePublishedId = null;

  // True once all initial setup is complete. Prevents dirty-tracking from
  // firing during the boot sequence (default title slide insert, form init).
  var appReady = false;

  // Whether the current show has unsaved changes since the last save/publish.
  var isDirty = false;

  // Tracks the source block index while a drag-and-drop reorder is in progress.
  var dragSrcBlockIdx = null;

  var showState = {
    blocks: [],      // array of { block, formData }
    flatSlides: [],  // flat list of { blockEntry, slide, blockIdx, slideIdx }
    currentIdx: -1,
  };
  var suppressFormBridge = false;
  var templateWorkflow = {
    active: false,
    type: "",
    advancedBlockIds: {},
  };
  var templateBuilderSyncing = false;

  function rebuildFlatSlides() {
    showState.flatSlides = [];
    syncClassicAnswersSummaryBlocks();
    showState.blocks.forEach(function (entry, blockIdx) {
      entry.block.slides.forEach(function (slide, slideIdx) {
        showState.flatSlides.push({
          blockEntry: entry,
          slide: slide,
          blockIdx: blockIdx,
          slideIdx: slideIdx,
        });
      });
    });
  }

  /**
   * Classic template: each answers-summary block should list the five preceding
   * single-question entries for the same round (for host / cast / exports).
   * Also mirrors a readable summary into formData so Writer preview + Question Details stay in sync.
   */
  function syncClassicAnswersSummaryBlocks() {
    var blocks = showState.blocks;
    if (!Array.isArray(blocks) || !blocks.length) return;

    for (var i = 0; i < blocks.length; i++) {
      var entry = blocks[i];
      var blk = entry && entry.block;
      if (!blk || !Array.isArray(blk.slides) || !blk.slides.length) continue;

      var slide0 = blk.slides[0];
      var blkType = String(blk.type || "").toLowerCase();
      var layout = String(slide0.layout || "").toLowerCase();
      var kind = String(slide0.kind || "").toLowerCase();
      var isSummary =
        blkType === "answers-summary" ||
        layout === "answers-summary" ||
        kind === "answers-summary";
      if (!isSummary) continue;

      var roundName = String(blk.roundName || "");
      var collected = [];
      for (var j = i - 1; j >= 0 && collected.length < 5; j--) {
        var prev = blocks[j];
        var pb = prev && prev.block;
        if (!pb) continue;
        if (String(pb.type || "").toLowerCase() !== "single-question") break;
        var prevRn = "";
        if (prev.formData && prev.formData.block) {
          prevRn = String(prev.formData.block.roundName || pb.roundName || "");
        } else {
          prevRn = String(pb.roundName || "");
        }
        if (prevRn !== roundName) break;
        collected.push(prev);
      }
      collected.reverse();

      var answers = collected.map(function (qEnt, idx) {
        var fb = (qEnt.formData && qEnt.formData.block) || {};
        return {
          questionNumber: idx + 1,
          categoryName: String(fb.categoryName || ""),
          questionText: String(fb.questionText || ""),
          answer: String(fb.answerText || ""),
        };
      });

      slide0.answers = answers;

      var lines = answers.map(function (a, ix) {
        var num = ix + 1;
        var cat = (a.categoryName || "").trim();
        var ans = (a.answer || "").trim();
        var head = cat ? "Q" + num + " (" + cat + ")" : "Q" + num;
        return head + ": " + (ans || "(no answer yet)");
      });
      var summaryBody = lines.length
        ? lines.join("\n")
        : "Answers will appear here as you fill in this round’s questions.";

      slide0.prompt = summaryBody;

      if (entry.formData && entry.formData.block) {
        entry.formData.block.questionText = summaryBody;
      }
    }
  }

  function navigateToSlide(idx) {
    if (showState.flatSlides.length === 0) return;
    idx = Math.max(0, Math.min(idx, showState.flatSlides.length - 1));
    showState.currentIdx = idx;

    if (window.WriterPreview && typeof WriterPreview.resetFeudReveal === "function") {
      WriterPreview.resetFeudReveal();
    }

    var item = showState.flatSlides[idx];
    var slideType = (item.slide.type || "").toLowerCase();
    var slideKind  = (item.slide.kind  || "").toLowerCase();

    if (slideType === "title") {
      if (window.WriterPreview) {
        WriterPreview.renderTitleSlide();
      }
    } else {
      var mode = (item.slide.audienceMode || "live").toLowerCase();
      if (window.WriterQuestionForm && item.blockEntry && item.blockEntry.formData) {
        suppressFormBridge = true;
        WriterQuestionForm.setFormData(item.blockEntry.formData);
        suppressFormBridge = false;
      }
      if (window.WriterPreview) {
        // Feud intro slides (halftime/final intro): render as display-type using a
        // synthetic formData so the question text shows without feud controls.
        if (slideKind === "feud-halftime-intro" || slideKind === "feud-final-intro") {
          var introFd = safeClone(item.blockEntry.formData || {});
          introFd.block = introFd.block || {};
          introFd.block.questionType = "display";
          introFd.block.answerText = item.slide.prompt || introFd.block.questionText || "";
          WriterPreview.setMode("live");
          WriterPreview.renderFromFormData(introFd);
        } else {
          WriterPreview.setMode(mode);
          WriterPreview.renderFromFormData(item.blockEntry.formData);
        }
      }
    }

    updateShowNav();
    highlightFilmstripThumb(idx);
    syncTemplateBuilderListToCurrentSlide(idx);
  }

  function updateShowNav() {
    var total = showState.flatSlides.length;
    var current = showState.currentIdx;

    var indicator = $("#show-nav-indicator");
    var prevBtn = $("#show-nav-prev");
    var nextBtn = $("#show-nav-next");

    if (indicator) {
      indicator.textContent = total > 0
        ? "Slide " + (current + 1) + " of " + total
        : "No slides added yet";
    }
    if (prevBtn) prevBtn.disabled = current <= 0;
    if (nextBtn) nextBtn.disabled = current >= total - 1;
  }

  // Navigate to the first flat-slide of the adjacent block (skipping reveal slides).
  function navigateByBlock(dir) {
    var slides = showState.flatSlides;
    if (!slides.length) return;
    var currentBlockIdx = slides[showState.currentIdx]
      ? slides[showState.currentIdx].blockIdx
      : 0;
    var targetBlockIdx = currentBlockIdx + dir;
    for (var i = 0; i < slides.length; i++) {
      if (slides[i].blockIdx === targetBlockIdx && slides[i].slideIdx === 0) {
        navigateToSlide(i);
        return;
      }
    }
  }

  function bindFilmstripKeys() {
    var strip = $("#slide-filmstrip");
    if (!strip) return;

    strip.addEventListener("keydown", function (e) {
      // Only handle arrow keys; ignore if focus is inside a real input/button
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateByBlock(1);
        var active = strip.querySelector(".filmstrip-thumb.active");
        if (active) active.focus({ preventScroll: true });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateByBlock(-1);
        var active2 = strip.querySelector(".filmstrip-thumb.active");
        if (active2) active2.focus({ preventScroll: true });
      }
    });
  }

  // Auto-reveal answer in the preview when the writer focuses the answer field,
  // and return to question view when they leave it.
  function bindAnswerReveal() {
    var answerEl = $("#answer-text");
    if (!answerEl || !window.WriterPreview) return;

    answerEl.addEventListener("focus", function () {
      // Only reveal if the current slide is a question block (not a display slide)
      var item = getCurrentFlatItem();
      if (!item || isTitleFlatItem(item)) return;
      var t = String((item.blockEntry && item.blockEntry.block && item.blockEntry.block.type) || "").toLowerCase();
      if (FORM_UNEDITABLE_BLOCK_TYPES.indexOf(t) !== -1) return;
      WriterPreview.setMode("reveal");
    });

    answerEl.addEventListener("blur", function () {
      if (!window.WriterPreview) return;
      WriterPreview.setMode("live");
    });
  }

  // ─── Firebase Storage media upload ─────────────────────────────

  function doMediaUpload(file, urlInput, statusEl, zoneEl) {
    if (!file || !urlInput) return;

    var user = firebase && firebase.auth && firebase.auth().currentUser;
    if (!user) {
      alert("You must be logged in to upload files.");
      return;
    }

    if (!firebase.storage) {
      alert("Firebase Storage is not available. Please refresh the page.");
      return;
    }

    var ext = file.name.split(".").pop().toLowerCase();
    var safeName = Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    var path = "writer-media/" + user.uid + "/" + safeName;
    var storageRef = firebase.storage().ref(path);
    var uploadTask = storageRef.put(file);

    if (zoneEl) zoneEl.classList.add("media-dropzone--uploading");
    if (statusEl) {
      statusEl.style.display = "";
      statusEl.textContent = "Uploading…";
      statusEl.className = "media-upload-status media-upload-status--progress";
    }

    uploadTask.on(
      "state_changed",
      function (snapshot) {
        var pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (statusEl) statusEl.textContent = "Uploading… " + pct + "%";
      },
      function (err) {
        if (zoneEl) zoneEl.classList.remove("media-dropzone--uploading");
        if (statusEl) {
          statusEl.textContent = "Upload failed: " + (err.message || err);
          statusEl.className = "media-upload-status media-upload-status--error";
        }
      },
      function () {
        uploadTask.snapshot.ref.getDownloadURL().then(function (url) {
          if (zoneEl) zoneEl.classList.remove("media-dropzone--uploading");
          urlInput.value = url;
          urlInput.dispatchEvent(new Event("input", { bubbles: true }));
          if (statusEl) {
            statusEl.textContent = "✓ " + file.name + " uploaded";
            statusEl.className = "media-upload-status media-upload-status--done";
          }
          // Show a thumbnail preview inside the zone if it's an image
          if (zoneEl && file.type.startsWith("image/")) {
            var img = zoneEl.querySelector(".media-dropzone-thumb");
            if (!img) {
              img = document.createElement("img");
              img.className = "media-dropzone-thumb";
              zoneEl.appendChild(img);
            }
            img.src = url;
          }
        });
      }
    );
  }

  function bindMediaUploads() {
    // ── click / keyboard on the dropzone triggers file picker ──
    document.addEventListener("click", function (e) {
      var zone = e.target.closest(".media-dropzone");
      if (!zone) return;
      var fileInput = zone.querySelector(".media-file-input");
      if (fileInput) fileInput.click();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var zone = e.target.closest(".media-dropzone");
      if (!zone) return;
      e.preventDefault();
      var fileInput = zone.querySelector(".media-file-input");
      if (fileInput) fileInput.click();
    });

    // ── drag-and-drop ──
    document.addEventListener("dragover", function (e) {
      var zone = e.target.closest(".media-dropzone");
      if (!zone) return;
      e.preventDefault();
      zone.classList.add("media-dropzone--over");
    });

    document.addEventListener("dragleave", function (e) {
      var zone = e.target.closest(".media-dropzone");
      if (!zone) return;
      // Only remove if leaving the zone itself (not a child element)
      if (!zone.contains(e.relatedTarget)) {
        zone.classList.remove("media-dropzone--over");
      }
    });

    document.addEventListener("drop", function (e) {
      var zone = e.target.closest(".media-dropzone");
      if (!zone) return;
      e.preventDefault();
      zone.classList.remove("media-dropzone--over");

      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;

      var wrap = zone.closest(".answer-type-panel, .template-media-upload-wrap");
      var urlInput = wrap && wrap.querySelector("input[type='url']");
      var statusEl = wrap && wrap.querySelector(".media-upload-status");
      doMediaUpload(file, urlInput, statusEl, zone);
    });

    // ── file input change (after picker selection) ──
    document.addEventListener("change", function (e) {
      var fileInput = e.target;
      if (!fileInput || !fileInput.classList.contains("media-file-input")) return;

      var file = fileInput.files && fileInput.files[0];
      if (!file) return;

      var zone = fileInput.closest(".media-dropzone");
      var wrap = fileInput.closest(".answer-type-panel, .template-media-upload-wrap");
      var urlInput = wrap && wrap.querySelector("input[type='url']");
      var statusEl = wrap && wrap.querySelector(".media-upload-status");
      doMediaUpload(file, urlInput, statusEl, zone);

      fileInput.value = ""; // reset so same file can be re-selected
    });
  }

  function bindShowNav() {
    var prevBtn = $("#show-nav-prev");
    var nextBtn = $("#show-nav-next");

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        navigateToSlide(showState.currentIdx - 1);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        navigateToSlide(showState.currentIdx + 1);
      });
    }
  }

  // ─── Add slide (+ button) ──────────────────────────────────────

  var SLIDE_TYPES = [
    { value: "short-response",  label: "Short Response"      },
    { value: "multiple-choice", label: "Multiple Choice"     },
    { value: "matching",        label: "Matching"            },
    { value: "ordering",        label: "Ordering"            },
    { value: "image-question",  label: "Image Question"      },
    { value: "audio-question",  label: "Audio / Media Prompt"},
    { value: "feud-question",   label: "Feud Survey Question"},
  ];

  function addNewSlide(questionType) {
    if (!window.WriterBlockBuilder || !window.WriterQuestionForm) return;

    var showMeta = WriterQuestionForm.getFormData().show;
    var isFeud = questionType === "feud-question";
    var blockType = isFeud ? "feud-single-question" : "single-question";
    var formData = {
      show: showMeta,
      block: {
        type: blockType,
        questionType: questionType,
        roundName: "Round 1",
        categoryName: "",
        questionText: "",
        answerText: "",
        questionNotes: "",
        optionCount: 4,
        options: ["", "", "", ""],
        correctOptionIndex: null,
        matchingPairs: [],
        orderingItems: [],
        feudAnswers: isFeud ? [{ text: "", points: 8 }, { text: "", points: 7 }, { text: "", points: 6 }] : [],
        themeStyle: "Standard Trivia",
        fontSizeMode: "Auto Fit",
        questionAlign: "left",
        questionFontScale: 1.0,
      },
    };

    var block = WriterBlockBuilder.createBlockByType(blockType, formData);
    showState.blocks.push({ block: block, formData: formData });
    rebuildFlatSlides();

    var newFirstIdx = showState.flatSlides.length - block.slides.length;
    navigateToSlide(newFirstIdx);

    WriterQuestionForm.setFormData(formData);
    renderFilmstrip();
    updateStatCounters();
    markDirty();

    // Take the user straight to the editing form
    switchToTab("question-details");
  }

  function showTypePickerPopover(anchorEl) {
    // Toggle: clicking the + button again closes the popover
    var existing = document.getElementById("slide-type-popover");
    if (existing) { existing.remove(); return; }

    var popover = document.createElement("div");
    popover.id = "slide-type-popover";
    popover.className = "slide-type-popover";

    SLIDE_TYPES.forEach(function (t) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "slide-type-option";
      item.textContent = t.label;
      item.addEventListener("click", function (e) {
        e.stopPropagation();
        popover.remove();
        addNewSlide(t.value);
      });
      popover.appendChild(item);
    });

    document.body.appendChild(popover);

    // Position below anchor, flip up if it would overflow viewport
    var rect = anchorEl.getBoundingClientRect();
    var below = rect.bottom + 6;
    var popH  = SLIDE_TYPES.length * 38 + 8; // approximate height
    if (below + popH > window.innerHeight) {
      popover.style.top = (rect.top - popH - 6) + "px";
    } else {
      popover.style.top = below + "px";
    }
    popover.style.left = rect.left + "px";

    // Close on any outside click
    function onOutside(e) {
      if (!popover.contains(e.target) && e.target !== anchorEl) {
        popover.remove();
        document.removeEventListener("click", onOutside, true);
      }
    }
    setTimeout(function () {
      document.addEventListener("click", onOutside, true);
    }, 0);
  }

  // ─── Slide filmstrip ───────────────────────────────────────────

  function renderFilmstrip() {
    var strip = $("#slide-filmstrip");
    if (!strip) return;

    if (showState.blocks.length === 0) {
      strip.innerHTML = '<div class="filmstrip-empty">No slides yet — add questions to build your show.</div>';
      // Still show the plus button when empty
      var addBtnEmpty = document.createElement("button");
      addBtnEmpty.type = "button";
      addBtnEmpty.className = "filmstrip-add-btn";
      addBtnEmpty.title = "Add slide";
      addBtnEmpty.innerHTML = "<span>+</span>";
      addBtnEmpty.addEventListener("click", function (e) {
        showTypePickerPopover(addBtnEmpty);
      });
      strip.appendChild(addBtnEmpty);
      return;
    }

    strip.innerHTML = "";

    // One thumb per block (not per flat slide).
    // Track the first flat-slide index for each block so clicking navigates there.
    var flatOffset = 0;
    showState.blocks.forEach(function (entry, blockIdx) {
      var block = entry.block;
      var blockType = (block.type || "").toLowerCase();
      var firstFlatIdx = flatOffset;
      flatOffset += block.slides.length;

      var thumb = document.createElement("div");
      thumb.className = "filmstrip-thumb";
      thumb.setAttribute("draggable", "true");
      thumb.setAttribute("tabindex", "0");
      thumb.setAttribute("data-block-idx", String(blockIdx));
      thumb.setAttribute("data-first-flat-idx", String(firstFlatIdx));

      // ── Delete button (shown on hover via CSS) ──
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "thumb-delete-btn";
      delBtn.title = "Delete slide";
      delBtn.innerHTML = "&#x2715;";
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        showState.blocks.splice(blockIdx, 1);
        rebuildFlatSlides();
        // Navigate to the last valid slide if current index is now out of bounds
        if (showState.blocks.length === 0) {
          showState.currentIdx = 0;
        } else if (showState.currentIdx >= showState.flatSlides.length) {
          showState.currentIdx = showState.flatSlides.length - 1;
        }
        renderFilmstrip();
        updateStatCounters();
        markDirty();
        if (showState.flatSlides.length > 0) {
          navigateToSlide(showState.currentIdx);
        }
      });

      var stage = document.createElement("div");
      stage.className = "filmstrip-thumb-stage";
      stage.appendChild(_buildThumbPreview(entry, blockType));

      var labelRow = document.createElement("div");
      labelRow.className = "filmstrip-thumb-label";

      var num = document.createElement("span");
      num.className = "filmstrip-thumb-num";
      num.textContent = String(blockIdx + 1);

      var modeLabel = document.createElement("span");
      modeLabel.className = "filmstrip-thumb-mode";
      modeLabel.textContent = blockType === "title" ? "title"
        : (block.questionType || "q").replace(/-/g, " ");

      labelRow.appendChild(num);
      labelRow.appendChild(modeLabel);
      thumb.appendChild(delBtn);
      thumb.appendChild(stage);
      thumb.appendChild(labelRow);

      // ── Navigate on click (ignore if clicking delete) ──
      thumb.addEventListener("click", function () {
        navigateToSlide(firstFlatIdx);
        // Form + preview are updated inside navigateToSlide (with suppressFormBridge).
        // Do not call setFormData again here — it would dispatch without suppress and
        // trigger maybeAutoAdvanceTemplate for complete questions (endless advance).
        thumb.focus({ preventScroll: true });
      });

      // ── Drag-and-drop reordering ──
      thumb.addEventListener("dragstart", function (e) {
        dragSrcBlockIdx = blockIdx;
        thumb.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(blockIdx));
      });
      thumb.addEventListener("dragend", function () {
        thumb.classList.remove("dragging");
        // Clean up any lingering drag-over highlights
        strip.querySelectorAll(".filmstrip-thumb").forEach(function (t) {
          t.classList.remove("drag-over");
        });
      });
      thumb.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        thumb.classList.add("drag-over");
      });
      thumb.addEventListener("dragleave", function () {
        thumb.classList.remove("drag-over");
      });
      thumb.addEventListener("drop", function (e) {
        e.preventDefault();
        thumb.classList.remove("drag-over");
        if (dragSrcBlockIdx === null || dragSrcBlockIdx === blockIdx) return;
        var src = dragSrcBlockIdx;
        var tgt = blockIdx;
        var moved = showState.blocks.splice(src, 1)[0];
        // Adjust target index after removal
        if (src < tgt) tgt--;
        showState.blocks.splice(tgt, 0, moved);
        dragSrcBlockIdx = null;
        rebuildFlatSlides();
        renderFilmstrip();
        updateStatCounters();
        markDirty();
      });

      strip.appendChild(thumb);
    });

    // ── Plus button after all thumbs ──
    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "filmstrip-add-btn";
    addBtn.title = "Add slide";
    addBtn.innerHTML = "<span>+</span>";
    addBtn.addEventListener("click", function (e) {
      showTypePickerPopover(addBtn);
    });
    strip.appendChild(addBtn);

    highlightFilmstripThumb(showState.currentIdx);
    syncFilmstripCanvasVars();
  }

  /** Deep-clone formData for filmstrip paint (never mutate stored draft). */
  function safeJsonClone(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      return null;
    }
  }

  /**
   * Merge compiled `entry.block` / live slide into formData so thumbnails match the
   * main preview even when the sidebar form was never focused on that block.
   */
  function mergeFormDataForFilmstripThumb(entry) {
    var merged;
    if (entry && entry.formData) {
      merged = safeJsonClone(entry.formData);
    }
    if (!merged) {
      merged = {
        show: { title: "", dateLabel: "", status: "draft" },
        block: {},
      };
    }
    merged.show = merged.show || {};
    merged.block = merged.block || {};
    var mb = merged.block;
    var b = (entry && entry.block) || {};
    var slides = b.slides || [];
    var sLive =
      slides.find(function (sl) {
        return String(sl.audienceMode || "").toLowerCase() === "live";
      }) || slides[0] || {};

    function isBlank(v) {
      return v == null || !String(v).trim();
    }

    if (isBlank(mb.type) && b.type) mb.type = b.type;
    if (isBlank(mb.questionType) && b.questionType) mb.questionType = b.questionType;

    if (isBlank(mb.roundName)) {
      mb.roundName = b.roundName || sLive.title || mb.roundName || "Round";
    }
    if (isBlank(mb.categoryName)) {
      mb.categoryName = sLive.categoryName || b.categoryName || "";
    }
    if (isBlank(mb.questionText)) {
      mb.questionText = b.questionText || sLive.prompt || b.title || "";
    }
    if (isBlank(mb.answerText)) {
      mb.answerText = b.answerText || sLive.answer || b.body || "";
    }
    if (isBlank(mb.questionNotes)) {
      mb.questionNotes = b.questionNotes || sLive.notes || b.notes || "";
    }
    if (isBlank(mb.imageUrl)) mb.imageUrl = sLive.imageUrl || b.imageUrl || "";
    if (isBlank(mb.audioUrl)) mb.audioUrl = sLive.audioUrl || b.audioUrl || "";

    if (sLive.themeStyle && isBlank(mb.themeStyle)) mb.themeStyle = sLive.themeStyle;
    if (sLive.fontSizeMode && isBlank(mb.fontSizeMode)) mb.fontSizeMode = sLive.fontSizeMode;

    if (mb.questionAlign == null && sLive.questionAlign) mb.questionAlign = sLive.questionAlign;
    if (typeof mb.questionFontScale !== "number" && typeof sLive.questionFontScale === "number") {
      mb.questionFontScale = sLive.questionFontScale;
    }
    if (typeof mb.questionFontScale !== "number" && typeof b.questionFontScale === "number") {
      mb.questionFontScale = b.questionFontScale;
    }

    var qLower = String(mb.questionType || "").toLowerCase();
    if (qLower === "multiple-choice") {
      var arr = Array.isArray(mb.options) ? mb.options : [];
      var hasOpts = arr.some(function (x) {
        return String(x || "").trim();
      });
      if (!hasOpts && sLive.options && typeof sLive.options === "object") {
        var o = sLive.options;
        mb.options = ["A", "B", "C", "D", "E", "F"].map(function (L) {
          return o[L] || "";
        });
      }
    }

    if ((!mb.matchingPairs || !mb.matchingPairs.length) && Array.isArray(sLive.matchingPairs) && sLive.matchingPairs.length) {
      mb.matchingPairs = sLive.matchingPairs.slice();
    }
    if ((!mb.orderingItems || !mb.orderingItems.length) && Array.isArray(sLive.orderingItems) && sLive.orderingItems.length) {
      mb.orderingItems = sLive.orderingItems.slice();
    }
    if ((!mb.feudAnswers || !mb.feudAnswers.length) && Array.isArray(sLive.feudAnswers) && sLive.feudAnswers.length) {
      mb.feudAnswers = sLive.feudAnswers.slice();
    }

    return merged;
  }

  /**
   * Filmstrip tile = same DOM + WriterPreview pipeline as the large slide, scaled in CSS.
   */
  function _buildThumbPreview(entry, blockType) {
    var inner = document.createElement("div");
    inner.className = "filmstrip-preview-inner";

    var stage = document.createElement("div");
    stage.className = "preview-stage thumb-preview-stage";
    stage.setAttribute("aria-hidden", "true");
    inner.appendChild(stage);

    if (!window.WriterPreview || typeof WriterPreview.renderThumbnailStage !== "function") {
      return inner;
    }

    if (blockType === "title") {
      WriterPreview.renderThumbnailStage(stage, { type: "title" });
    } else {
      var fd = mergeFormDataForFilmstripThumb(entry);
      fd.block = fd.block || {};
      if (entry && entry.block && entry.block.type) {
        fd.block.type = entry.block.type;
      }
      WriterPreview.renderThumbnailStage(stage, { type: "block", formData: fd });
    }
    return inner;
  }

  /** Which show block (index in `showState.blocks`) contains this flat slide index. */
  function blockIndexForFlatIdx(flatIdx) {
    if (!showState.blocks || !showState.blocks.length) return -1;
    var offset = 0;
    for (var i = 0; i < showState.blocks.length; i++) {
      var entry = showState.blocks[i];
      var len = (entry && entry.block && entry.block.slides) ? entry.block.slides.length : 0;
      if (flatIdx >= offset && flatIdx < offset + len) {
        return i;
      }
      offset += len;
    }
    return -1;
  }

  /**
   * When a template (classic / feud) is active, keep the left Questions list aligned
   * with the current slide: scroll the matching card into view and mark it current.
   */
  function syncTemplateBuilderListToCurrentSlide(flatIdx) {
    if (!templateWorkflow.active) return;
    if (templateWorkflow.type !== "classic-trivia" && templateWorkflow.type !== "feud-show") return;
    var bIdx = blockIndexForFlatIdx(flatIdx);
    if (bIdx < 0) return;
    var entry = showState.blocks[bIdx];
    if (!entry || !entry.block || !entry.block.id) return;
    var blockId = String(entry.block.id);
    var list = $("#template-builder-list");
    if (!list) return;
    var cards = list.querySelectorAll(".template-builder-card");
    var found = null;
    for (var c = 0; c < cards.length; c++) {
      if (String(cards[c].getAttribute("data-block-id") || "") === blockId) {
        found = cards[c];
        break;
      }
    }
    for (var d = 0; d < cards.length; d++) {
      cards[d].classList.toggle("template-builder-card--current", cards[d] === found);
    }
    if (found) {
      try {
        found.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (err) {
        try { found.scrollIntoView(true); } catch (e2) {}
      }
    }
  }

  function highlightFilmstripThumb(flatIdx) {
    var strip = $("#slide-filmstrip");
    if (!strip) return;

    var activeBlockIdx = blockIndexForFlatIdx(flatIdx);

    Array.from(strip.querySelectorAll(".filmstrip-thumb")).forEach(function (thumb) {
      var bIdx = parseInt(thumb.getAttribute("data-block-idx"), 10);
      thumb.classList.toggle("active", bIdx === activeBlockIdx);
    });

    var active = strip.querySelector(".filmstrip-thumb.active");
    if (active) active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  function updateStatCounters() {
    var blocksEl = $("#stat-blocks");
    var questionsEl = $("#stat-questions");

    if (blocksEl) blocksEl.textContent = String(showState.blocks.length);
    if (questionsEl) {
      var total = showState.blocks.reduce(function (sum, entry) {
        return sum + (Number(entry.block.questionCount) || 0);
      }, 0);
      questionsEl.textContent = String(total);
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ─── Draft action buttons ──────────────────────────────────────

  function bindDraftButtons() {
    var btnSaveBlock = $("#btn-save-block");
    var btnAddToShow = $("#btn-add-to-show");
    var btnDuplicate = $("#btn-duplicate-block");
    var btnClearForm = $("#btn-clear-form");

    if (btnSaveBlock) {
      btnSaveBlock.addEventListener("click", function () {
        if (!window.WriterQuestionForm || !window.WriterBlockBuilder) return;
        var formData = WriterQuestionForm.getFormData();
        var block = WriterBlockBuilder.createBlockFromFormData(formData);
        console.log("[writer] block saved", block);
      });
    }

    if (btnAddToShow) {
      btnAddToShow.addEventListener("click", function () {
        if (!window.WriterQuestionForm || !window.WriterBlockBuilder) return;
        var formData = WriterQuestionForm.getFormData();
        var block = WriterBlockBuilder.createBlockFromFormData(formData);

        showState.blocks.push({ block: block, formData: formData });
        rebuildFlatSlides();

        // Navigate to the first slide of the newly added block
        var newBlockFirstIdx = showState.flatSlides.length - block.slides.length;
        navigateToSlide(newBlockFirstIdx);

        renderFilmstrip();
        updateStatCounters();
        markDirty();
        console.log("[writer] block added to show", block);
      });
    }

    if (btnDuplicate) {
      btnDuplicate.addEventListener("click", function () {
        if (!window.WriterQuestionForm || !window.WriterBlockBuilder) return;
        var formData = WriterQuestionForm.getFormData();
        var block = WriterBlockBuilder.createBlockFromFormData(formData);
        var copy = WriterBlockBuilder.duplicateBlock(block);
        console.log("[writer] block duplicated", copy);
      });
    }

    if (btnClearForm) {
      btnClearForm.addEventListener("click", function () {
        if (!window.WriterQuestionForm) return;
        WriterQuestionForm.resetForm();
      });
    }
  }

  // ─── Title slide button ────────────────────────────────────────

  function bindTitleSlideButton() {
    var btn = $("#btn-insert-title-slide");
    if (!btn) return;

    btn.addEventListener("click", function () {
      // If a title block already exists, just navigate to it
      var existingIdx = -1;
      for (var i = 0; i < showState.flatSlides.length; i++) {
        if ((showState.flatSlides[i].slide.type || "") === "title") {
          existingIdx = i;
          break;
        }
      }
      if (existingIdx !== -1) {
        navigateToSlide(existingIdx);
        return;
      }

      var titleBlock = {
        id: "title-slide-" + Date.now(),
        type: "title",
        label: "Title Slide",
        slides: [{ type: "title", audienceMode: "live" }],
        questionCount: 0,
        questionType: "title",
      };

      // Prepend so it's always first
      showState.blocks.unshift({ block: titleBlock, formData: null });
      rebuildFlatSlides();
      navigateToSlide(0);
      renderFilmstrip();
      updateStatCounters();
      markDirty();
      console.log("[writer] title slide inserted");
    });
  }

  // ─── Template buttons ──────────────────────────────────────────

  function bindTemplateButtons() {
    document.querySelectorAll("[data-template]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var templateType = btn.getAttribute("data-template");
        console.log("[writer] template selected:", templateType);
        applyTemplate(templateType);
      });
    });
  }

  function applyTemplate(templateType) {
    if (!window.WriterQuestionForm || !window.WriterBlockBuilder) return;

    var normalized = String(templateType || "").trim().toLowerCase();
    var formData = WriterQuestionForm.getFormData();
    var templateEntries = [];

    if (normalized === "classic-trivia" || normalized === "classic-show") {
      templateEntries = buildClassicTriviaTemplateEntries(formData);
      templateWorkflow.active = true;
      templateWorkflow.type = "classic-trivia";
      templateWorkflow.advancedBlockIds = {};
      setTemplateBuilderTabVisible(true);
    } else if (normalized === "feud-show") {
      templateEntries = buildFeudShowTemplateEntries(formData);
      templateWorkflow.active = true;
      templateWorkflow.type = "feud-show";
      templateWorkflow.advancedBlockIds = {};
      setTemplateBuilderTabVisible(true);
      // Update the show-type toggle to Feud
      document.querySelectorAll(".show-type-btn").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-show-type") === "feud");
      });
      var hiddenShowType = $("#show-type");
      if (hiddenShowType) hiddenShowType.value = "feud";
    } else {
      var fallbackBlock = WriterBlockBuilder.createBlockByType(normalized, formData);
      templateEntries = [{ block: fallbackBlock, formData: formData }];
      templateWorkflow.active = false;
      templateWorkflow.type = "";
      templateWorkflow.advancedBlockIds = {};
      setTemplateBuilderTabVisible(false);
    }

    if (!templateEntries.length) return;

    showState.blocks = templateEntries;
    rebuildFlatSlides();
    renderFilmstrip();
    updateStatCounters();
    markDirty();

    // Start on the title slide — filmstrip, preview, and currentIdx all in sync.
    // The user navigates to a question (via filmstrip, template-builder list, or
    // Prev/Next) when they're ready to start filling in content.
    navigateToSlide(0);
    renderTemplateBuilderList();
    switchToTab(templateWorkflow.active ? "template-builder" : "question-details");
  }

  function setTemplateBuilderTabVisible(isVisible) {
    var btn = $("#tab-btn-template-builder");
    if (!btn) return;
    if (isVisible) {
      btn.classList.remove("hidden");
      btn.removeAttribute("hidden");
      btn.setAttribute("aria-hidden", "false");
      try {
        btn.scrollIntoView({ inline: "end", block: "nearest", behavior: "smooth" });
      } catch (_) {
        try { btn.scrollIntoView(true); } catch (__) {}
      }
    } else {
      btn.classList.add("hidden");
      btn.setAttribute("hidden", "hidden");
      btn.setAttribute("aria-hidden", "true");
    }
    if (isVisible) return;

    var pane = $("#tab-template-builder");
    if (pane) pane.classList.remove("active");
    if (btn.classList.contains("active")) {
      switchToTab("templates");
    }
  }

  // ─── Questions tab: ↑/↓ move between category / question / answer (and feud
  //     survey-answer) fields. In textareas, arrows move visual lines first; only
  //     from first/last line do they move to the adjacent field.

  var templateBuilderArrowNavBound = false;

  function getTemplateBuilderNavFieldsOrdered() {
    var wrap = $("#template-builder-list");
    if (!wrap) return [];
    var out = [];
    var cards = wrap.querySelectorAll(".template-builder-card");
    for (var c = 0; c < cards.length; c++) {
      var card = cards[c];
      var sel = card.querySelector('[data-template-field="questionType"]');
      var cat = card.querySelector('[data-template-field="categoryName"]');
      var q = card.querySelector('[data-template-field="questionText"]');
      var a = card.querySelector('[data-template-field="answerText"]');
      if (sel) out.push(sel);
      if (cat) out.push(cat);
      if (q) out.push(q);
      // Feud show: ranked survey-answer inputs live between question and classic answer
      var feudInps = card.querySelectorAll('[data-template-field="feudAnswer"]');
      for (var fi = 0; fi < feudInps.length; fi++) {
        out.push(feudInps[fi]);
      }
      if (a) out.push(a);
    }
    return out;
  }

  function getTextareaLogicalLineIndex(textarea) {
    var v = String(textarea.value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    var pos = Math.min(Math.max(0, textarea.selectionStart), v.length);
    var lineIndex = 0;
    for (var i = 0; i < pos; i++) {
      if (v.charAt(i) === "\n") lineIndex++;
    }
    var lineCount = v.length ? v.split("\n").length : 1;
    var lastLineIndex = Math.max(0, lineCount - 1);
    return {
      lineIndex: lineIndex,
      lineCount: lineCount,
      lastLineIndex: lastLineIndex,
      caretRow: lineIndex,
      endRow: lastLineIndex,
      caretTop: null,
      endTop: null,
      lh: null,
    };
  }

  /**
   * Visual (wrapped) line index for textarea — handles soft-wrapped lines with no \n.
   * Uses a mirror div with matching width / font / padding so wrapping matches the field.
   */
  function getTextareaVisualLineInfo(textarea) {
    if (!textarea || textarea.tagName !== "TEXTAREA") {
      return { lineIndex: 0, lineCount: 1, lastLineIndex: 0, caretRow: 0, endRow: 0 };
    }
    var value = String(textarea.value || "");
    var pos = Math.min(Math.max(0, textarea.selectionStart), value.length);
    if (textarea.clientWidth <= 0) {
      return getTextareaLogicalLineIndex(textarea);
    }

    var style = window.getComputedStyle(textarea);
    var mirror = document.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    mirror.style.position = "absolute";
    mirror.style.left = "-99999px";
    mirror.style.top = "0";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.overflowWrap = style.overflowWrap || "break-word";
    mirror.style.wordBreak = style.wordBreak || "normal";
    mirror.style.overflow = "hidden";
    mirror.style.boxSizing = style.boxSizing || "border-box";
    // Use rendered outer width so wrap points match the real textarea.
    // clientWidth can under-measure with border/scrollbar and create a fake extra line.
    mirror.style.width = (textarea.offsetWidth || textarea.clientWidth) + "px";
    mirror.style.font = style.font;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontWeight = style.fontWeight;
    mirror.style.fontStyle = style.fontStyle;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.padding = style.padding;
    mirror.style.border = style.border;
    mirror.style.tabSize = style.tabSize || "8";

    function lineHeightPx() {
      var lh = style.lineHeight;
      if (!lh || lh === "normal") {
        var fs = parseFloat(style.fontSize) || 16;
        return fs * 1.2;
      }
      var n = parseFloat(lh);
      return isNaN(n) ? (parseFloat(style.fontSize) || 16) * 1.2 : n;
    }

    var lh = lineHeightPx();

    document.body.appendChild(mirror);

    try {
      mirror.textContent = "";
      if (!value.length) {
        document.body.removeChild(mirror);
        return {
          lineIndex: 0,
          lineCount: 1,
          lastLineIndex: 0,
          caretRow: 0,
          endRow: 0,
          caretTop: 0,
          endTop: 0,
          lh: lh,
        };
      }

      function visualRowFromTop(topPx, lineH) {
        if (!lineH || lineH <= 0) return 0;
        /* Bias so caret/end on same visual line share one row (avoids “wrong row” from subpixels). */
        return Math.max(0, Math.floor((topPx + lineH * 0.22) / lineH));
      }

      /* Row where the last character sits (avoid phantom wrap after end-of-text). */
      var endLead = value.slice(0, Math.max(0, value.length - 1));
      var endChar = value.charAt(Math.max(0, value.length - 1)) || "\u200b";
      if (endLead) mirror.appendChild(document.createTextNode(endLead));
      var endSpan = document.createElement("span");
      endSpan.textContent = endChar;
      mirror.appendChild(endSpan);
      var endTop = endSpan.offsetTop;
      var endRow = visualRowFromTop(endTop, lh);

      mirror.textContent = "";
      var before = value.slice(0, pos);
      var after = value.slice(pos);
      if (before) mirror.appendChild(document.createTextNode(before));
      var span = document.createElement("span");
      // When caret is at end, anchor to the last actual character row.
      if (!after.length && value.length) {
        span.textContent = value.charAt(value.length - 1);
      } else {
        span.textContent = after.length ? after.charAt(0) : "\u200b";
      }
      mirror.appendChild(span);

      var caretTop = span.offsetTop;
      var caretRow = visualRowFromTop(caretTop, lh);
      var lastLineIndex = endRow;
      var lineIndex = caretRow;
      var lineCount = Math.max(1, endRow + 1, caretRow + 1);

      document.body.removeChild(mirror);
      return {
        lineIndex: lineIndex,
        lineCount: lineCount,
        lastLineIndex: lastLineIndex,
        caretRow: caretRow,
        endRow: endRow,
        caretTop: caretTop,
        endTop: endTop,
        lh: lh,
      };
    } catch (err) {
      try {
        if (mirror.parentNode) mirror.parentNode.removeChild(mirror);
      } catch (e2) {}
      return getTextareaLogicalLineIndex(textarea);
    }
  }

  function focusTemplateBuilderNavField(el, caretAtEnd) {
    if (!el) return;
    el.focus();
    if (el.tagName === "SELECT") return;
    try {
      var len = String(el.value || "").length;
      if (caretAtEnd) el.setSelectionRange(len, len);
      else el.setSelectionRange(0, 0);
    } catch (_) {}
  }

  function onTemplateBuilderArrowNavKeydown(e) {
    if (!templateWorkflow.active) return;
    if (templateWorkflow.type !== "classic-trivia" && templateWorkflow.type !== "feud-show") return;
    var key = e.key;
    if (key !== "ArrowDown" && key !== "ArrowUp") return;
    if (e.defaultPrevented) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.shiftKey) return;
    if (e.isComposing) return;

    var t = e.target;
    if (!t || !t.getAttribute) return;
    var fieldName = t.getAttribute("data-template-field");
    if (
      fieldName !== "questionType" &&
      fieldName !== "categoryName" &&
      fieldName !== "questionText" &&
      fieldName !== "answerText" &&
      fieldName !== "feudAnswer"
    ) {
      return;
    }
    if (t.tagName === "SELECT") {
      /* continue — arrows move focus (not option list) */
    } else if (t.tagName === "INPUT" && t.type === "text") {
      /* ok */
    } else if (t.tagName === "TEXTAREA") {
      /* ok */
    } else {
      return;
    }

    if (t.tagName === "TEXTAREA") {
      var info = getTextareaVisualLineInfo(t);
      var cr = typeof info.caretRow === "number" ? info.caretRow : info.lineIndex;
      var er = typeof info.endRow === "number" ? info.endRow : info.lastLineIndex;
      var ct = info.caretTop;
      var et = info.endTop;
      var lh = info.lh;

      if (key === "ArrowDown") {
        /* Last row = same band as end-of-text (mid-line OK) OR caretRow >= endRow. Prevents
           caretRow < endRow when caret/end share a wrapped line but offsetTop differs. */
        var onLastVisualRow = false;
        if (typeof ct === "number" && typeof et === "number" && typeof lh === "number" && lh > 0) {
          onLastVisualRow = cr >= er || Math.abs(ct - et) < lh * 0.92;
        } else {
          onLastVisualRow = cr >= er;
        }
        if (!onLastVisualRow) return;
        e.preventDefault();
      } else if (key === "ArrowUp") {
        if (cr > 0) return;
        e.preventDefault();
      }
    }

    var fields = getTemplateBuilderNavFieldsOrdered();
    var idx = fields.indexOf(t);
    if (idx === -1) return;
    var nextIdx = key === "ArrowDown" ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= fields.length) return;

    if (!e.defaultPrevented) e.preventDefault();
    var nextEl = fields[nextIdx];
    // Moving down → start of next field; moving up → end of previous field
    focusTemplateBuilderNavField(nextEl, key === "ArrowUp");
  }

  function bindTemplateBuilderArrowNav() {
    var wrap = $("#template-builder-list");
    if (!wrap || templateBuilderArrowNavBound) return;
    templateBuilderArrowNavBound = true;
    wrap.addEventListener("keydown", onTemplateBuilderArrowNavKeydown, true);
  }

  function renderTemplateBuilderList() {
    var wrap = $("#template-builder-list");
    if (!wrap) return;

    if (!templateWorkflow.active) {
      wrap.innerHTML = '<div class="filmstrip-empty">Choose a template to start building.</div>';
      return;
    }

    if (templateWorkflow.type === "feud-show") {
      renderFeudTemplateBuilderList(wrap);
      syncTemplateBuilderListToCurrentSlide(showState.currentIdx);
      return;
    }

    if (templateWorkflow.type !== "classic-trivia") {
      wrap.innerHTML = '<div class="filmstrip-empty">Choose a template to start building.</div>';
      return;
    }

    var questionEntries = showState.blocks.filter(function (entry) {
      return String((entry && entry.block && entry.block.type) || "").toLowerCase() === "single-question";
    });
    if (!questionEntries.length) {
      wrap.innerHTML = '<div class="filmstrip-empty">No question slides found for this template.</div>';
      return;
    }

    wrap.innerHTML = "";
    questionEntries.forEach(function (entry, idx) {
      var b = (entry.formData && entry.formData.block) || {};
      var n = idx + 1;
      var phCategory = "Category " + n;
      var phQuestion = "Question " + n;
      var phAnswer = "Answer " + n;
      var qType = b.questionType || "short-response";
      var isMC = qType === "multiple-choice";
      var correctIdx = typeof b.correctOptionIndex === "number" ? b.correctOptionIndex : null;

      var card = document.createElement("article");
      card.className = "template-builder-card";
      card.setAttribute("data-block-id", entry.block.id);
      card.innerHTML =
        '<div class="template-builder-head">' +
          '<strong>' + escapeHtml(entry.block.label || ("Question " + String(idx + 1))) + '</strong>' +
          '<span class="subtle-chip">' + escapeHtml(b.roundName || "Round") + '</span>' +
        '</div>' +
        '<div class="template-builder-grid">' +
          '<div class="field">' +
            '<label>Question Type</label>' +
            '<select data-template-field="questionType">' + buildQuestionTypeOptions(b.questionType) + '</select>' +
          '</div>' +
          '<div class="field">' +
            '<label>Question Category</label>' +
            '<input type="text" data-template-field="categoryName" ' +
              'placeholder="' + escapeHtml(phCategory) + '" ' +
              'value="' + escapeHtml(b.categoryName || "") + '" />' +
          '</div>' +
          '<div class="field">' +
            '<label>Question</label>' +
            '<textarea data-template-field="questionText" placeholder="' + escapeHtml(phQuestion) + '">' +
            escapeHtml(b.questionText || "") +
            '</textarea>' +
          '</div>' +
          '<div class="field template-image-url-field template-media-upload-wrap"' + (qType !== "image-question" ? ' style="display:none;"' : '') + '>' +
            '<div class="media-dropzone" role="button" tabindex="0" aria-label="Upload image" data-accept="image/*">' +
              '<span class="media-dropzone-icon">🖼</span>' +
              '<strong>Drop image here or click to upload</strong>' +
              '<span class="media-dropzone-sub">JPG, PNG, GIF, WEBP</span>' +
              '<input type="file" class="media-file-input" accept="image/*" style="display:none;">' +
            '</div>' +
            '<div class="media-upload-status" style="display:none;"></div>' +
            '<div class="media-url-alt">' +
              '<span class="media-url-alt-label">or paste a URL</span>' +
              '<input type="url" class="template-media-url" data-media-field="imageUrl" placeholder="https://example.com/image.jpg" value="' + escapeHtml(b.imageUrl || "") + '">' +
            '</div>' +
          '</div>' +
          '<div class="field template-audio-url-field template-media-upload-wrap"' + (qType !== "audio-question" ? ' style="display:none;"' : '') + '>' +
            '<div class="media-dropzone" role="button" tabindex="0" aria-label="Upload audio" data-accept="audio/*">' +
              '<span class="media-dropzone-icon">🔊</span>' +
              '<strong>Drop audio here or click to upload</strong>' +
              '<span class="media-dropzone-sub">MP3, WAV, OGG</span>' +
              '<input type="file" class="media-file-input" accept="audio/*" style="display:none;">' +
            '</div>' +
            '<div class="media-upload-status" style="display:none;"></div>' +
            '<div class="media-url-alt">' +
              '<span class="media-url-alt-label">or paste a URL</span>' +
              '<input type="url" class="template-media-url" data-media-field="audioUrl" placeholder="https://example.com/audio.mp3" value="' + escapeHtml(b.audioUrl || "") + '">' +
            '</div>' +
          '</div>' +
          '<div class="field template-answer-field"' + (isMC || qType === "matching" || qType === "ordering" ? ' style="display:none;"' : '') + '>' +
            '<label>Answer</label>' +
            '<textarea data-template-field="answerText" placeholder="' + escapeHtml(phAnswer) + '">' +
            escapeHtml(b.answerText || "") +
            '</textarea>' +
          '</div>' +
          '<div class="field template-mc-field"' + (qType !== "multiple-choice" ? ' style="display:none;"' : '') + '>' +
            '<label>Answer Options</label>' +
            buildTemplateMCOptions(b.options || [], correctIdx) +
          '</div>' +
          '<div class="field template-matching-field"' + (qType !== "matching" ? ' style="display:none;"' : '') + '>' +
            '<label>Matching Pairs</label>' +
            buildTemplateMatchingPairs(b.matchingPairs || []) +
          '</div>' +
          '<div class="field template-ordering-field"' + (qType !== "ordering" ? ' style="display:none;"' : '') + '>' +
            '<label>Ordering Items</label>' +
            buildTemplateOrderingItems(b.orderingItems || []) +
          '</div>' +
        '</div>';

      bindTemplateBuilderCardEvents(card, entry);
      wrap.appendChild(card);
    });
    syncTemplateBuilderListToCurrentSlide(showState.currentIdx);
  }

  function buildQuestionTypeOptions(selectedValue) {
    var types = [
      { value: "short-response", label: "Short Response" },
      { value: "multiple-choice", label: "Multiple Choice" },
      { value: "matching", label: "Matching" },
      { value: "ordering", label: "Ordering" },
      { value: "image-question", label: "Image Question" },
      { value: "audio-question", label: "Audio / Media Prompt" },
      { value: "feud-question", label: "Feud Survey Question" },
    ];
    return types.map(function (t) {
      var selected = String(selectedValue || "") === t.value ? " selected" : "";
      return '<option value="' + t.value + '"' + selected + '>' + t.label + '</option>';
    }).join("");
  }

  function buildTemplateMCOptions(options, correctIdx) {
    var letters = ["A", "B", "C", "D", "E", "F"];
    var opts = Array.isArray(options) ? options.slice() : [];
    while (opts.length < 4) opts.push("");
    var rows = opts.map(function (opt, i) {
      var letter = letters[i] || String(i + 1);
      var isCorrect = correctIdx !== null && i === correctIdx;
      return '<div class="template-option-row' + (isCorrect ? " is-correct" : "") + '" data-option-idx="' + i + '">' +
        '<button type="button" class="template-option-btn' + (isCorrect ? " selected" : "") + '" title="Mark ' + letter + ' as correct answer">' +
          letter +
        '</button>' +
        '<input type="text" class="template-option-input" placeholder="Option ' + letter + '" value="' + escapeHtml(opt) + '">' +
      '</div>';
    }).join("");
    return '<div class="template-option-rows">' + rows + '</div>' +
      '<p class="template-mc-hint">Click a letter to mark the correct answer.</p>';
  }

  function buildTemplateMatchingPairs(pairs) {
    var rows = (Array.isArray(pairs) && pairs.length >= 2 ? pairs : [{ left: "", right: "" }, { left: "", right: "" }]);
    var rowsHtml = rows.map(function (pair) {
      return '<div class="template-pair-row">' +
        '<input type="text" class="template-pair-left" placeholder="Left item" value="' + escapeHtml(pair.left || "") + '">' +
        '<span class="template-pair-arrow">→</span>' +
        '<input type="text" class="template-pair-right" placeholder="Right item" value="' + escapeHtml(pair.right || "") + '">' +
        '<button type="button" class="template-row-remove" title="Remove pair">×</button>' +
      '</div>';
    }).join("");
    return '<div class="template-pair-rows">' + rowsHtml + '</div>' +
      '<button type="button" class="template-add-btn template-add-pair-btn">+ Add Pair</button>';
  }

  function buildTemplateOrderingItems(items) {
    var opts = (Array.isArray(items) && items.length >= 2 ? items : ["", "", ""]);
    var rowsHtml = opts.map(function (item, i) {
      return '<div class="template-order-row">' +
        '<span class="template-order-num">' + (i + 1) + '</span>' +
        '<input type="text" class="template-order-input" placeholder="Item ' + (i + 1) + '" value="' + escapeHtml(item || "") + '">' +
        '<button type="button" class="template-row-remove" title="Remove item">×</button>' +
      '</div>';
    }).join("");
    return '<div class="template-order-rows">' + rowsHtml + '</div>' +
      '<button type="button" class="template-add-btn template-add-order-btn">+ Add Item</button>';
  }

  function addTemplatePairRow(card) {
    var container = card.querySelector(".template-pair-rows");
    if (!container) return;
    var div = document.createElement("div");
    div.className = "template-pair-row";
    div.innerHTML =
      '<input type="text" class="template-pair-left" placeholder="Left item" value="">' +
      '<span class="template-pair-arrow">→</span>' +
      '<input type="text" class="template-pair-right" placeholder="Right item" value="">' +
      '<button type="button" class="template-row-remove" title="Remove pair">\u00d7</button>';
    container.appendChild(div);
  }

  function addTemplateOrderRow(card) {
    var container = card.querySelector(".template-order-rows");
    if (!container) return;
    var num = container.children.length + 1;
    var div = document.createElement("div");
    div.className = "template-order-row";
    div.innerHTML =
      '<span class="template-order-num">' + num + '</span>' +
      '<input type="text" class="template-order-input" placeholder="Item ' + num + '" value="">' +
      '<button type="button" class="template-row-remove" title="Remove item">\u00d7</button>';
    container.appendChild(div);
  }

  function updateTemplateOrderNums(card) {
    Array.from(card.querySelectorAll(".template-order-row")).forEach(function (row, i) {
      var num = row.querySelector(".template-order-num");
      if (num) num.textContent = String(i + 1);
    });
  }

  function syncTemplateCardType(card, qType) {
    var isMC       = qType === "multiple-choice";
    var isMatching = qType === "matching";
    var isOrdering = qType === "ordering";
    var isImageQ   = qType === "image-question";
    var isAudioQ   = qType === "audio-question";
    var isSimple   = !isMC && !isMatching && !isOrdering; // short-response, image-question, audio-question all show answer textarea

    var answerField   = card.querySelector(".template-answer-field");
    var mcField       = card.querySelector(".template-mc-field");
    var matchingField = card.querySelector(".template-matching-field");
    var orderingField = card.querySelector(".template-ordering-field");
    var imageField    = card.querySelector(".template-image-url-field");
    var audioField    = card.querySelector(".template-audio-url-field");

    if (answerField)   answerField.style.display   = isSimple   ? "" : "none";
    if (mcField)       mcField.style.display       = isMC       ? "" : "none";
    if (matchingField) matchingField.style.display = isMatching ? "" : "none";
    if (orderingField) orderingField.style.display = isOrdering ? "" : "none";
    if (imageField)    imageField.style.display    = isImageQ   ? "" : "none";
    if (audioField)    audioField.style.display    = isAudioQ   ? "" : "none";
  }

  function bindTemplateBuilderCardEvents(card, entry) {
    if (!card || !entry) return;

    // Standard data-template-field inputs
    var fields = Array.from(card.querySelectorAll("[data-template-field]"));
    fields.forEach(function (el) {
      var evtName = el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(evtName, function () {
        if (el.getAttribute("data-template-field") === "questionType") {
          syncTemplateCardType(card, el.value);
        }
        updateTemplateBuilderEntry(entry, card);
      });
      el.addEventListener("focus", function () {
        focusTemplateBuilderEntry(entry);
      });
    });

    // Delegated input — MC options, matching pairs, ordering items
    card.addEventListener("input", function (e) {
      var t = e.target;
      if (!t) return;
      if (t.classList.contains("template-option-input") ||
          t.classList.contains("template-pair-left") ||
          t.classList.contains("template-pair-right") ||
          t.classList.contains("template-order-input") ||
          t.classList.contains("template-media-url")) {
        updateTemplateBuilderEntry(entry, card);
      }
    });

    // Delegated focus — navigate preview to this slide
    card.addEventListener("focus", function (e) {
      var t = e.target;
      if (!t) return;
      if (t.classList.contains("template-option-input") ||
          t.classList.contains("template-pair-left") ||
          t.classList.contains("template-pair-right") ||
          t.classList.contains("template-order-input")) {
        focusTemplateBuilderEntry(entry);
      }
    }, true);

    // Delegated click — MC correct toggle, add/remove rows
    card.addEventListener("click", function (e) {
      // MC correct-answer toggle
      var mcBtn = e.target.closest(".template-option-btn");
      if (mcBtn) {
        var mcRow = mcBtn.closest(".template-option-row");
        if (mcRow) {
          card.querySelectorAll(".template-option-row").forEach(function (r) { r.classList.remove("is-correct"); });
          card.querySelectorAll(".template-option-btn").forEach(function (b) { b.classList.remove("selected"); });
          mcRow.classList.add("is-correct");
          mcBtn.classList.add("selected");
          updateTemplateBuilderEntry(entry, card);
        }
        return;
      }

      // Generic remove button (matching pairs + ordering items share .template-row-remove)
      var removeBtn = e.target.closest(".template-row-remove");
      if (removeBtn) {
        var removeRow = removeBtn.parentElement;
        if (removeRow && removeRow.parentElement && removeRow.parentElement.children.length > 1) {
          removeRow.remove();
          updateTemplateOrderNums(card); // no-op if no order rows
          updateTemplateBuilderEntry(entry, card);
        }
        return;
      }

      // Add matching pair
      if (e.target.classList.contains("template-add-pair-btn")) {
        addTemplatePairRow(card);
        updateTemplateBuilderEntry(entry, card);
        return;
      }

      // Add ordering item
      if (e.target.classList.contains("template-add-order-btn")) {
        addTemplateOrderRow(card);
        updateTemplateBuilderEntry(entry, card);
        return;
      }
    });
  }

  function updateTemplateBuilderEntry(entry, card) {
    if (!entry || !entry.formData || !card || !window.WriterBlockBuilder) return;

    var blockData = safeClone(entry.formData.block || {});
    var readField = function (name, fallback) {
      var el = card.querySelector('[data-template-field="' + name + '"]');
      if (!el) return fallback || "";
      return String(el.value || "");
    };

    blockData.questionType = readField("questionType", blockData.questionType || "short-response");
    blockData.categoryName = readField("categoryName", blockData.categoryName || "");
    blockData.questionText = readField("questionText", blockData.questionText || "");

    if (blockData.questionType === "multiple-choice") {
      var optInputs = Array.from(card.querySelectorAll(".template-option-input"));
      blockData.options = optInputs.map(function (el) { return String(el.value || "").trim(); });
      var correctRow = card.querySelector(".template-option-row.is-correct");
      var correctIdx = correctRow ? parseInt(correctRow.getAttribute("data-option-idx"), 10) : null;
      blockData.correctOptionIndex = (correctIdx !== null && !isNaN(correctIdx)) ? correctIdx : null;
      blockData.answerText = blockData.correctOptionIndex !== null
        ? (blockData.options[blockData.correctOptionIndex] || "") : "";

    } else if (blockData.questionType === "matching") {
      blockData.matchingPairs = Array.from(card.querySelectorAll(".template-pair-row")).map(function (row) {
        return {
          left:  String((row.querySelector(".template-pair-left")  || {}).value || "").trim(),
          right: String((row.querySelector(".template-pair-right") || {}).value || "").trim(),
        };
      });
      blockData.answerText = "";

    } else if (blockData.questionType === "ordering") {
      blockData.orderingItems = Array.from(card.querySelectorAll(".template-order-input"))
        .map(function (el) { return String(el.value || "").trim(); });
      blockData.answerText = "";

    } else {
      // short-response, image-question, audio-question — simple answer textarea
      blockData.answerText = readField("answerText", blockData.answerText || "");
      // Read media URLs if present
      var imageInput = card.querySelector('.template-media-url[data-media-field="imageUrl"]');
      var audioInput = card.querySelector('.template-media-url[data-media-field="audioUrl"]');
      blockData.imageUrl = imageInput ? String(imageInput.value || "").trim() : (blockData.imageUrl || "");
      blockData.audioUrl = audioInput ? String(audioInput.value || "").trim() : (blockData.audioUrl || "");
    }

    entry.formData.block = blockData;
    entry.block = WriterBlockBuilder.createBlockByType("single-question", entry.formData);

    templateBuilderSyncing = true;
    rebuildFlatSlides();
    renderFilmstrip();
    updateStatCounters();
    focusTemplateBuilderEntry(entry);
    templateBuilderSyncing = false;
    markDirty();
  }

  function focusTemplateBuilderEntry(entry) {
    var idx = findFirstFlatIndexForBlock(entry && entry.block ? entry.block.id : "");
    if (idx === -1) return;
    navigateToSlide(idx);
  }

  function findFirstFlatIndexForBlock(blockId) {
    var id = String(blockId || "");
    if (!id) return -1;
    for (var i = 0; i < showState.flatSlides.length; i++) {
      var curEntry = showState.flatSlides[i] && showState.flatSlides[i].blockEntry;
      var curId = curEntry && curEntry.block ? String(curEntry.block.id || "") : "";
      if (curId === id) return i;
    }
    return -1;
  }

  // ─── Feud template builder ─────────────────────────────────────

  function renderFeudTemplateBuilderList(wrap) {
    var feudEntries = showState.blocks.filter(function (entry) {
      var t = String((entry && entry.block && entry.block.type) || "").toLowerCase();
      return t === "feud-single-question" || t === "feud-halftime" || t === "feud-final";
    });
    if (!feudEntries.length) {
      wrap.innerHTML = '<div class="filmstrip-empty">No feud question slides found for this template.</div>';
      return;
    }
    wrap.innerHTML = "";
    feudEntries.forEach(function (entry, idx) {
      var b = (entry.formData && entry.formData.block) || {};
      var blockType = String((entry.block && entry.block.type) || "").toLowerCase();
      var label = entry.block.label || ("Feud Question " + String(idx + 1));
      var feudAnswers = Array.isArray(b.feudAnswers) ? b.feudAnswers : [];
      while (feudAnswers.length < 3) feudAnswers.push({ text: "", points: 8 - feudAnswers.length });

      var answerRowsHtml = feudAnswers.slice(0, 8).map(function (a, i) {
        return '<div class="feud-tb-answer-row" data-answer-idx="' + i + '">' +
          '<span class="feud-tb-rank">' + String(i + 1) + '</span>' +
          '<input type="text" class="feud-tb-answer-input" data-template-field="feudAnswer" placeholder="Survey answer ' + String(i + 1) + '" value="' + escapeHtml(a.text || "") + '">' +
          '<span class="feud-tb-pts">' + String(8 - i) + ' pts</span>' +
          (feudAnswers.length > 3 ? '<button type="button" class="feud-tb-remove-btn" title="Remove">×</button>' : '') +
        '</div>';
      }).join("");

      var canAdd = feudAnswers.length < 8;
      var card = document.createElement("article");
      card.className = "template-builder-card";
      card.setAttribute("data-block-id", entry.block.id);
      card.innerHTML =
        '<div class="template-builder-head">' +
          '<strong>' + escapeHtml(label) + '</strong>' +
          '<span class="subtle-chip feud-chip">' + escapeHtml(blockType === "feud-halftime" ? "Halftime" : blockType === "feud-final" ? "Final" : b.roundName || "Feud") + '</span>' +
        '</div>' +
        '<div class="template-builder-grid">' +
          '<div class="field">' +
            '<label>Question</label>' +
            '<textarea data-template-field="questionText" placeholder="Survey question">' +
            escapeHtml(b.questionText || "") +
            '</textarea>' +
          '</div>' +
          '<div class="field">' +
            '<label>Survey Answers <span class="answer-type-hint-inline">ranked best → last</span></label>' +
            '<div class="feud-tb-answers-list">' + answerRowsHtml + '</div>' +
            (canAdd ? '<button type="button" class="template-add-btn feud-tb-add-btn">+ Add Response</button>' : '') +
          '</div>' +
        '</div>';

      bindFeudTemplateBuilderCardEvents(card, entry);
      wrap.appendChild(card);
    });
  }

  function bindFeudTemplateBuilderCardEvents(card, entry) {
    if (!card || !entry) return;

    var qTextEl = card.querySelector('[data-template-field="questionText"]');
    if (qTextEl) {
      qTextEl.addEventListener("input", function () {
        updateFeudTemplateBuilderEntry(entry, card);
      });
      qTextEl.addEventListener("focus", function () {
        focusTemplateBuilderEntry(entry);
      });
    }

    card.addEventListener("input", function (e) {
      if (e.target.classList.contains("feud-tb-answer-input")) {
        updateFeudTemplateBuilderEntry(entry, card);
      }
    });

    card.addEventListener("focus", function (e) {
      if (e.target.classList.contains("feud-tb-answer-input") ||
          e.target.getAttribute("data-template-field") === "questionText") {
        focusTemplateBuilderEntry(entry);
      }
    }, true);

    card.addEventListener("click", function (e) {
      // Remove answer row
      var removeBtn = e.target.closest(".feud-tb-remove-btn");
      if (removeBtn) {
        var list = card.querySelector(".feud-tb-answers-list");
        var rows = list ? list.querySelectorAll(".feud-tb-answer-row") : [];
        if (rows.length > 3) {
          var row = removeBtn.closest(".feud-tb-answer-row");
          if (row) {
            row.remove();
            updateFeudTbRanks(card);
            updateFeudTemplateBuilderEntry(entry, card);
          }
        }
        return;
      }
      // Add answer row
      if (e.target.classList.contains("feud-tb-add-btn")) {
        var list2 = card.querySelector(".feud-tb-answers-list");
        if (!list2) return;
        var currentRows = list2.querySelectorAll(".feud-tb-answer-row");
        if (currentRows.length >= 8) return;
        var newIdx = currentRows.length;
        var newRow = document.createElement("div");
        newRow.className = "feud-tb-answer-row";
        newRow.setAttribute("data-answer-idx", String(newIdx));
        newRow.innerHTML =
          '<span class="feud-tb-rank">' + String(newIdx + 1) + '</span>' +
          '<input type="text" class="feud-tb-answer-input" data-template-field="feudAnswer" placeholder="Survey answer ' + String(newIdx + 1) + '" value="">' +
          '<span class="feud-tb-pts">' + String(8 - newIdx) + ' pts</span>' +
          '<button type="button" class="feud-tb-remove-btn" title="Remove">×</button>';
        list2.appendChild(newRow);
        // Update all remove button visibility and add-btn
        updateFeudTbRanks(card);
        // Show/hide add btn
        var addBtn = card.querySelector(".feud-tb-add-btn");
        if (addBtn && list2.querySelectorAll(".feud-tb-answer-row").length >= 8) {
          addBtn.style.display = "none";
        }
        updateFeudTemplateBuilderEntry(entry, card);
      }
    });
  }

  function updateFeudTbRanks(card) {
    var list = card.querySelector(".feud-tb-answers-list");
    if (!list) return;
    var rows = Array.from(list.querySelectorAll(".feud-tb-answer-row"));
    rows.forEach(function (row, i) {
      var rankEl = row.querySelector(".feud-tb-rank");
      var ptsEl  = row.querySelector(".feud-tb-pts");
      var input  = row.querySelector(".feud-tb-answer-input");
      if (rankEl) rankEl.textContent = String(i + 1);
      if (ptsEl)  ptsEl.textContent  = String(8 - i) + " pts";
      if (input)  input.placeholder  = "Survey answer " + String(i + 1);
      // Show remove button only when above minimum
      var removeBtn = row.querySelector(".feud-tb-remove-btn");
      if (removeBtn) removeBtn.style.display = rows.length > 3 ? "" : "none";
    });
    var addBtn = card.querySelector(".feud-tb-add-btn");
    if (addBtn) addBtn.style.display = rows.length >= 8 ? "none" : "";
  }

  function updateFeudTemplateBuilderEntry(entry, card) {
    if (!entry || !entry.formData || !card || !window.WriterBlockBuilder) return;
    var blockData = safeClone(entry.formData.block || {});

    var qTextEl = card.querySelector('[data-template-field="questionText"]');
    if (qTextEl) blockData.questionText = String(qTextEl.value || "");

    var answerInputs = Array.from(card.querySelectorAll(".feud-tb-answer-input"));
    blockData.feudAnswers = answerInputs.map(function (inp, i) {
      return { text: String(inp.value || "").trim(), points: 8 - i };
    });

    entry.formData.block = blockData;
    entry.block = WriterBlockBuilder.createBlockByType(entry.block.type, entry.formData);

    templateBuilderSyncing = true;
    rebuildFlatSlides();
    renderFilmstrip();
    updateStatCounters();
    focusTemplateBuilderEntry(entry);
    templateBuilderSyncing = false;
    markDirty();
  }

  function makeFeudQuestionEntry(config) {
    var feudAnswers = Array.isArray(config.feudAnswers) ? config.feudAnswers : [
      { text: "", points: 8 },
      { text: "", points: 7 },
      { text: "", points: 6 },
    ];
    var blockType = config.blockType || "feud-single-question";
    var formData = {
      show: safeClone(config.show || {}),
      block: {
        type: blockType,
        questionType: "feud-question",
        roundName: config.roundName || "Feud",
        categoryName: config.categoryName || "",
        questionText: "",
        answerText: "",
        questionNotes: "Feud Question " + String(config.questionNumber || 1),
        optionCount: 0,
        options: [],
        correctOptionIndex: null,
        matchingPairs: [],
        orderingItems: [],
        feudAnswers: feudAnswers,
        themeStyle: config.themeStyle || "Standard Trivia",
        fontSizeMode: config.fontSizeMode || "Auto Fit",
        questionAlign: "left",
        questionFontScale: 1.0,
      },
    };
    var block = WriterBlockBuilder.createBlockByType(blockType, formData);
    block.label = (config.roundName || "Feud") + " • Question " + String(config.questionNumber || 1);
    return { block: block, formData: formData };
  }

  function buildFeudShowTemplateEntries(baseData) {
    var source = baseData || {};
    var showMeta = safeClone((source && source.show) || {});
    var themeStyle = ((source.block || {}).themeStyle) || "Standard Trivia";
    var fontSizeMode = ((source.block || {}).fontSizeMode) || "Auto Fit";

    var entries = [];
    entries.push(makeTitleSlideEntry());

    entries.push(makeInfoSlideEntry({
      show: showMeta,
      label: "Beach Feud Rules",
      blockType: "intro-slide",
      roundName: "Rules",
      categoryName: "How to Play",
      questionType: "display",
      questionText: "Beach Feud Rules",
      answerText:
        "• Each team faces off on a survey question.\n" +
        "• Top answer = 8 pts, descending by rank.\n" +
        "• Answers are revealed one at a time.\n" +
        "• 4 rounds, 5 questions per round.\n" +
        "• Halftime question after Round 2.\n" +
        "• Final question to close the show.\n" +
        "• Good luck and have fun!",
      notes: "Beach Feud house rules slide.",
      themeStyle: themeStyle,
      fontSizeMode: fontSizeMode,
      stateKey: "feud.rules",
      stateLabel: "Feud Rules",
      layout: "intro-rules",
      audienceMode: "live",
    }));

    var rounds = ["Round One", "Round Two", "Round Three", "Round Four"];
    rounds.forEach(function (roundName, rIdx) {
      var roundSlug = slugify(roundName);

      entries.push(makeInfoSlideEntry({
        show: showMeta,
        label: roundName + " Start",
        blockType: "round-start",
        roundName: roundName,
        categoryName: "Get Ready",
        questionType: "display",
        questionText: roundName,
        answerText: "Get ready!",
        notes: "Announce round start.",
        themeStyle: themeStyle,
        fontSizeMode: fontSizeMode,
        stateKey: roundSlug + ".start",
        stateLabel: roundName + " Start",
        layout: "round-start",
        audienceMode: "live",
      }));

      for (var q = 1; q <= 5; q++) {
        entries.push(makeFeudQuestionEntry({
          show: showMeta,
          roundName: roundName,
          questionNumber: q,
          blockType: "feud-single-question",
          themeStyle: themeStyle,
          fontSizeMode: fontSizeMode,
        }));
      }

      // Halftime after Round Two
      if (rIdx === 1) {
        entries.push(makeFeudQuestionEntry({
          show: showMeta,
          roundName: "Halftime",
          questionNumber: 1,
          blockType: "feud-halftime",
          themeStyle: themeStyle,
          fontSizeMode: fontSizeMode,
        }));
      }
    });

    entries.push(makeFeudQuestionEntry({
      show: showMeta,
      roundName: "Final Question",
      questionNumber: 1,
      blockType: "feud-final",
      themeStyle: "Final Question",
      fontSizeMode: fontSizeMode,
    }));

    entries.push(makeInfoSlideEntry({
      show: showMeta,
      label: "Closing Slide",
      blockType: "closing-slide",
      roundName: "Closing",
      categoryName: "See You Next Time",
      questionType: "display",
      questionText: "Thanks for Playing Beach Feud!",
      answerText: "Thanks for playing tonight.",
      notes: "Closing slide.",
      themeStyle: themeStyle,
      fontSizeMode: fontSizeMode,
      stateKey: "closing.thank-you",
      stateLabel: "Closing",
      layout: "closing",
      audienceMode: "live",
    }));

    return entries;
  }

  function buildClassicTriviaTemplateEntries(baseData) {
    var source = baseData || {};
    var showMeta = safeClone((source && source.show) || {});
    var themeStyle = ((source.block || {}).themeStyle) || "Standard Trivia";
    var fontSizeMode = ((source.block || {}).fontSizeMode) || "Auto Fit";
    var questionType = ((source.block || {}).questionType) || "short-response";

    var entries = [];
    entries.push(makeTitleSlideEntry());
    entries.push(makeInfoSlideEntry({
      show: showMeta,
      label: "Game Rules",
      blockType: "intro-slide",
      roundName: "Rules",
      categoryName: "How to Play",
      questionType: "display",
      questionText: "Rules of the Game",
      answerText:
        "• Grab a packet and pen before we begin.\n" +
        "• 4 rounds total, 5 questions per round.\n" +
        "• Categories are announced at the start of each round.\n" +
        "• About 1 minute per question.\n" +
        "• Hold your answer slip until the end of the round.\n" +
        "• After all 5 questions, questions are repeated once.\n" +
        "• You get 1.5 minutes to turn in your slip.\n" +
        "• Put your team name on every slip.\n" +
        "• No cell phones (bathroom use still counts as cheating).\n" +
        "• No shouting out answers.\n" +
        "• Scoring: Round 1 = 1 pt, Round 2 = 2 pts, Round 3 = 3 pts, Round 4 = 4 pts.\n" +
        "• Ask the host anytime if you need help.\n" +
        "• Good luck and have fun!",
      notes: "Default how-to-play script for host rules slide.",
      themeStyle: themeStyle,
      fontSizeMode: fontSizeMode,
      stateKey: "rules.how-to-play",
      stateLabel: "Rules of the Game",
      layout: "intro-rules",
      audienceMode: "live",
    }));

    entries.push(makeInfoSlideEntry({
      show: showMeta,
      label: "Round One Start",
      blockType: "round-start",
      roundName: "Round One",
      categoryName: "Get Ready",
      questionType: "display",
      questionText: "Round One",
      answerText: "Get ready!",
      notes: "Announce pacing and answer slip timing.",
      themeStyle: themeStyle,
      fontSizeMode: fontSizeMode,
      stateKey: "round-one.start",
      stateLabel: "Round One Start",
      layout: "round-start",
      audienceMode: "live",
    }));

    entries.push(makeInfoSlideEntry({
      show: showMeta,
      label: "Round One Categories",
      blockType: "category-slide",
      roundName: "Round One",
      categoryName: "Round One Categories",
      questionType: "display",
      questionText: "Round One Categories",
      answerText: "Categories auto-fill as Round One questions are generated.",
      notes: "This slide pulls categories from generated questions.",
      themeStyle: themeStyle,
      fontSizeMode: fontSizeMode,
      stateKey: "round-one.categories",
      stateLabel: "Round One Categories",
      layout: "categories",
      audienceMode: "live",
    }));

    for (var r1q = 1; r1q <= 5; r1q++) {
      entries.push(makeClassicQuestionEntry({
        show: showMeta,
        roundName: "Round One",
        categoryName: "",
        questionNumber: r1q,
        questionType: questionType,
        themeStyle: themeStyle,
        fontSizeMode: fontSizeMode,
      }));
    }

    entries.push(makeInfoSlideEntry({
      show: showMeta,
      label: "Round One Answers",
      blockType: "answers-summary",
      roundName: "Round One",
      categoryName: "Answer Review",
      questionType: questionType,
      questionText: "Round One Answers",
      answerText: "Answers populate as Round One questions are completed.",
      notes: "Use this slide to recap and score Round One.",
      themeStyle: themeStyle,
      fontSizeMode: fontSizeMode,
      stateKey: "round-one.answers",
      stateLabel: "Round One Answers",
      layout: "answers-summary",
      audienceMode: "live",
    }));

    entries.push(makeInfoSlideEntry({
      show: showMeta,
      label: "Round Two Start",
      blockType: "round-start",
      roundName: "Round Two",
      categoryName: "Get Ready",
      questionType: "display",
      questionText: "Round Two",
      answerText: "Get ready!",
      notes: "Reset teams and timing guidance before Round Two.",
      themeStyle: themeStyle,
      fontSizeMode: fontSizeMode,
      stateKey: "round-two.start",
      stateLabel: "Round Two Start",
      layout: "round-start",
      audienceMode: "live",
    }));

    entries.push(makeInfoSlideEntry({
      show: showMeta,
      label: "Round Two Categories",
      blockType: "category-slide",
      roundName: "Round Two",
      categoryName: "Round Two Categories",
      questionType: "display",
      questionText: "Round Two Categories",
      answerText: "Categories auto-fill as Round Two questions are generated.",
      notes: "This slide pulls categories from generated questions.",
      themeStyle: themeStyle,
      fontSizeMode: fontSizeMode,
      stateKey: "round-two.categories",
      stateLabel: "Round Two Categories",
      layout: "categories",
      audienceMode: "live",
    }));

    for (var r2q = 1; r2q <= 5; r2q++) {
      entries.push(makeClassicQuestionEntry({
        show: showMeta,
        roundName: "Round Two",
        categoryName: "",
        questionNumber: r2q,
        questionType: questionType,
        themeStyle: themeStyle,
        fontSizeMode: fontSizeMode,
      }));
    }

    entries.push(makeInfoSlideEntry({
      show: showMeta,
      label: "Round Two Answers",
      blockType: "answers-summary",
      roundName: "Round Two",
      categoryName: "Answer Review",
      questionType: questionType,
      questionText: "Round Two Answers",
      answerText: "Answers populate as Round Two questions are completed.",
      notes: "Use this slide to recap and score Round Two.",
      themeStyle: themeStyle,
      fontSizeMode: fontSizeMode,
      stateKey: "round-two.answers",
      stateLabel: "Round Two Answers",
      layout: "answers-summary",
      audienceMode: "live",
    }));

    entries.push(makeInfoSlideEntry({
      show: showMeta,
      label: "Round Three Start",
      blockType: "round-start",
      roundName: "Round Three",
      categoryName: "Get Ready",
      questionType: "display",
      questionText: "Round Three",
      answerText: "Get ready!",
      notes: "Reset teams and timing guidance before Round Three.",
      themeStyle: themeStyle,
      fontSizeMode: fontSizeMode,
      stateKey: "round-three.start",
      stateLabel: "Round Three Start",
      layout: "round-start",
      audienceMode: "live",
    }));

    entries.push(makeInfoSlideEntry({
      show: showMeta,
      label: "Round Three Categories",
      blockType: "category-slide",
      roundName: "Round Three",
      categoryName: "Round Three Categories",
      questionType: "display",
      questionText: "Round Three Categories",
      answerText: "Categories auto-fill as Round Three questions are generated.",
      notes: "This slide pulls categories from generated questions.",
      themeStyle: themeStyle,
      fontSizeMode: fontSizeMode,
      stateKey: "round-three.categories",
      stateLabel: "Round Three Categories",
      layout: "categories",
      audienceMode: "live",
    }));

    for (var r3q = 1; r3q <= 5; r3q++) {
      entries.push(makeClassicQuestionEntry({
        show: showMeta,
        roundName: "Round Three",
        categoryName: "",
        questionNumber: r3q,
        questionType: questionType,
        themeStyle: themeStyle,
        fontSizeMode: fontSizeMode,
      }));
    }

    entries.push(makeInfoSlideEntry({
      show: showMeta,
      label: "Round Three Answers",
      blockType: "answers-summary",
      roundName: "Round Three",
      categoryName: "Answer Review",
      questionType: questionType,
      questionText: "Round Three Answers",
      answerText: "Answers populate as Round Three questions are completed.",
      notes: "Use this slide to recap and score Round Three.",
      themeStyle: themeStyle,
      fontSizeMode: fontSizeMode,
      stateKey: "round-three.answers",
      stateLabel: "Round Three Answers",
      layout: "answers-summary",
      audienceMode: "live",
    }));

    entries.push(makeInfoSlideEntry({
      show: showMeta,
      label: "Round Four Start",
      blockType: "round-start",
      roundName: "Round Four",
      categoryName: "Get Ready",
      questionType: "display",
      questionText: "Round Four",
      answerText: "Get ready!",
      notes: "Final round pacing before Round Four.",
      themeStyle: themeStyle,
      fontSizeMode: fontSizeMode,
      stateKey: "round-four.start",
      stateLabel: "Round Four Start",
      layout: "round-start",
      audienceMode: "live",
    }));

    entries.push(makeInfoSlideEntry({
      show: showMeta,
      label: "Round Four Categories",
      blockType: "category-slide",
      roundName: "Round Four",
      categoryName: "Round Four Categories",
      questionType: "display",
      questionText: "Round Four Categories",
      answerText: "Categories auto-fill as Round Four questions are generated.",
      notes: "This slide pulls categories from generated questions.",
      themeStyle: themeStyle,
      fontSizeMode: fontSizeMode,
      stateKey: "round-four.categories",
      stateLabel: "Round Four Categories",
      layout: "categories",
      audienceMode: "live",
    }));

    for (var r4q = 1; r4q <= 5; r4q++) {
      entries.push(makeClassicQuestionEntry({
        show: showMeta,
        roundName: "Round Four",
        categoryName: "",
        questionNumber: r4q,
        questionType: questionType,
        themeStyle: themeStyle,
        fontSizeMode: fontSizeMode,
      }));
    }

    entries.push(makeInfoSlideEntry({
      show: showMeta,
      label: "Round Four Answers",
      blockType: "answers-summary",
      roundName: "Round Four",
      categoryName: "Answer Review",
      questionType: questionType,
      questionText: "Round Four Answers",
      answerText: "Answers populate as Round Four questions are completed.",
      notes: "Use this slide to recap and score Round Four.",
      themeStyle: themeStyle,
      fontSizeMode: fontSizeMode,
      stateKey: "round-four.answers",
      stateLabel: "Round Four Answers",
      layout: "answers-summary",
      audienceMode: "live",
    }));

    return entries;
  }

  function makeTitleSlideEntry() {
    return {
      block: {
        id: "title-slide-" + Date.now(),
        type: "title",
        label: "Title Slide",
        slides: [{ type: "title", audienceMode: "live" }],
        questionCount: 0,
        questionType: "title",
      },
      formData: null,
    };
  }

  function makeClassicQuestionEntry(config) {
    var formData = {
      show: safeClone(config.show || {}),
      block: {
        type: "single-question",
        questionType: config.questionType || "short-response",
        roundName: config.roundName || "Round",
        categoryName: config.categoryName || "",
        questionText: "",
        answerText: "",
        questionNotes: "Question " + String(config.questionNumber || 1),
        optionCount: 4,
        options: ["", "", "", ""],
        correctOptionIndex: null,
        matchingPairs: [],
        orderingItems: [],
        themeStyle: config.themeStyle || "Standard Trivia",
        fontSizeMode: config.fontSizeMode || "Auto Fit",
        questionAlign: "left",
        questionFontScale: 1.0,
      },
    };
    var block = WriterBlockBuilder.createBlockByType("single-question", formData);
    block.label = (config.roundName || "Round") + " • Question " + String(config.questionNumber || 1);
    return { block: block, formData: formData };
  }

  function makeInfoSlideEntry(config) {
    var roundSlug = slugify(config.roundName || "round");
    var stateTail = slugify(config.stateLabel || "slide");
    var stateKey = config.stateKey || (roundSlug + "." + stateTail);

    var block = {
      id: makeId("blk"),
      type: config.blockType || "info-slide",
      label: config.label || "Info Slide",
      roundName: config.roundName || "",
      categoryName: config.categoryName || "",
      questionType: config.questionType || "display",
      themeStyle: config.themeStyle || "Standard Trivia",
      fontSizeMode: config.fontSizeMode || "Auto Fit",
      questionCount: 0,
      notes: config.notes || "",
      slides: [{
        id: makeId("sld"),
        kind: config.blockType || "info-slide",
        stateKey: stateKey,
        stateLabel: config.stateLabel || config.label || "Info Slide",
        audienceMode: config.audienceMode || "live",
        title: config.roundName || "",
        categoryName: config.categoryName || "",
        prompt: config.questionText || "",
        answer: config.answerText || "",
        notes: config.notes || "",
        layout: config.layout || "intro",
        revealable: false,
      }],
      summary: {
        publishReady: false,
        reusable: true,
        templateEligible: true,
      },
    };

    return {
      block: block,
      formData: {
        show: safeClone(config.show || {}),
        block: {
          type: config.blockType || "info-slide",
          questionType: config.questionType || "display",
          roundName: config.roundName || "",
          categoryName: config.categoryName || "",
          questionText: config.questionText || "",
          answerText: config.answerText || "",
          questionNotes: config.notes || "",
          optionCount: 0,
          options: [],
          correctOptionIndex: null,
          matchingPairs: [],
          orderingItems: [],
          themeStyle: config.themeStyle || "Standard Trivia",
          fontSizeMode: config.fontSizeMode || "Auto Fit",
          questionAlign: "center",
          questionFontScale: 1.2,
        },
      },
    };
  }

  function makeId(prefix) {
    return [
      prefix || "id",
      Date.now().toString(36),
      Math.random().toString(36).slice(2, 8),
    ].join("_");
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item";
  }

  function safeClone(value) {
    try {
      return JSON.parse(JSON.stringify(value || {}));
    } catch (_) {
      return {};
    }
  }

  // ─── Default title slide ───────────────────────────────────────

  function insertDefaultTitleSlide() {
    var titleBlock = {
      id: "title-slide-default",
      type: "title",
      label: "Title Slide",
      slides: [{ type: "title", audienceMode: "live" }],
      questionCount: 0,
      questionType: "title",
    };
    showState.blocks = [{ block: titleBlock, formData: null }];
    templateWorkflow.active = false;
    templateWorkflow.type = "";
    templateWorkflow.advancedBlockIds = {};
    setTemplateBuilderTabVisible(false);
    rebuildFlatSlides();
    navigateToSlide(0);
    renderFilmstrip();
    updateStatCounters();
  }

  function detectClassicTriviaFromBlocks(blocks) {
    if (!Array.isArray(blocks) || blocks.length < 12) return false;
    var hasTitle = false;
    var singleQ = 0;
    blocks.forEach(function (entry) {
      var t = entry && entry.block ? String(entry.block.type || "").toLowerCase() : "";
      if (t === "title") hasTitle = true;
      if (t === "single-question") singleQ += 1;
    });
    return hasTitle && singleQ >= 10;
  }

  function detectFeudShowFromBlocks(blocks) {
    if (!Array.isArray(blocks) || blocks.length < 5) return false;
    var feudQ = 0;
    blocks.forEach(function (entry) {
      var t = entry && entry.block ? String(entry.block.type || "").toLowerCase() : "";
      if (t === "feud-single-question" || t === "feud-halftime" || t === "feud-final") feudQ++;
    });
    return feudQ >= 3;
  }

  function applyRestoredWriterUi(data) {
    var wf = (data && data.writerUi) || {};
    var wfType = String(wf.templateWorkflowType || "");

    if (!!wf.templateWorkflowActive && wfType === "feud-show" || detectFeudShowFromBlocks(showState.blocks)) {
      templateWorkflow.active = true;
      templateWorkflow.type = "feud-show";
      templateWorkflow.advancedBlockIds = {};
      setTemplateBuilderTabVisible(true);
      renderTemplateBuilderList();
      document.querySelectorAll(".show-type-btn").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-show-type") === "feud");
      });
      var hiddenShowType = $("#show-type");
      if (hiddenShowType) hiddenShowType.value = "feud";
      return;
    }

    var active = !!wf.templateWorkflowActive && wfType === "classic-trivia";
    if (!active && detectClassicTriviaFromBlocks(showState.blocks)) {
      active = true;
    }
    if (active) {
      templateWorkflow.active = true;
      templateWorkflow.type = "classic-trivia";
      templateWorkflow.advancedBlockIds = {};
      setTemplateBuilderTabVisible(true);
      renderTemplateBuilderList();
    } else {
      templateWorkflow.active = false;
      templateWorkflow.type = "";
      templateWorkflow.advancedBlockIds = {};
      setTemplateBuilderTabVisible(false);
    }
  }

  // ─── Multi-date picker ─────────────────────────────────────────

  function bindDatePicker() {
    var today     = new Date();
    var viewYear  = today.getFullYear();
    var viewMonth = today.getMonth();       // 0-indexed

    var selectedDates = [];                 // "YYYY-MM-DD" strings

    var trigger     = $("#date-picker-trigger");
    var dropdown    = $("#date-picker-dropdown");
    var display     = $("#date-picker-display");
    var grid        = $("#dp-grid");
    var monthLabel  = $("#dp-month-label");
    var prevBtn     = $("#dp-nav-prev");
    var nextBtn     = $("#dp-nav-next");
    var clearBtn    = $("#dp-clear");
    var doneBtn     = $("#dp-done");
    var hiddenInput = $("#show-date");

    if (!trigger || !dropdown) return;

    var MONTHS = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December",
    ];

    function toKey(y, m, d) {
      return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    }

    // Formats sorted date keys into a human-readable label.
    // Same-month dates are grouped: "March 14 & 15, 2026"
    // Cross-month dates are joined with " / ": "March 14 / April 5, 2026"
    function formatLabel(dates) {
      if (!dates.length) return "";

      var parsed = dates
        .map(function (k) {
          var p = k.split("-");
          return { y: parseInt(p[0]), m: parseInt(p[1]) - 1, d: parseInt(p[2]) };
        })
        .sort(function (a, b) { return new Date(a.y, a.m, a.d) - new Date(b.y, b.m, b.d); });

      var groups = [], groupMap = {};
      parsed.forEach(function (p) {
        var key = p.m + "-" + p.y;
        if (!groupMap[key]) {
          groupMap[key] = { m: p.m, y: p.y, days: [] };
          groups.push(groupMap[key]);
        }
        groupMap[key].days.push(p.d);
      });

      return groups.map(function (g) {
        var days = g.days.sort(function (a, b) { return a - b; });
        var dayStr = days.length === 1
          ? String(days[0])
          : days.slice(0, -1).join(", ") + " & " + days[days.length - 1];
        return MONTHS[g.m] + " " + dayStr + ", " + g.y;
      }).join(" / ");
    }

    // Writes current selection to the hidden input and updates the trigger label.
    function commit() {
      var label = formatLabel(selectedDates);
      if (hiddenInput) {
        hiddenInput.value = label;
        hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (display) {
        if (label) {
          display.textContent = label;
          display.classList.remove("dp-placeholder");
        } else {
          display.textContent = "Select date(s)";
          display.classList.add("dp-placeholder");
        }
      }
    }

    function renderGrid() {
      if (!grid || !monthLabel) return;

      monthLabel.textContent = MONTHS[viewMonth] + " " + viewYear;

      var firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
      var daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
      var daysInPrev   = new Date(viewYear, viewMonth, 0).getDate();
      var todayKey     = toKey(today.getFullYear(), today.getMonth(), today.getDate());

      grid.innerHTML = "";

      // Padding days from previous month (disabled)
      for (var i = 0; i < firstWeekday; i++) {
        var pad = document.createElement("button");
        pad.type = "button";
        pad.className = "dp-day other-month";
        pad.textContent = daysInPrev - firstWeekday + 1 + i;
        pad.disabled = true;
        grid.appendChild(pad);
      }

      // Days of the current month
      for (var day = 1; day <= daysInMonth; day++) {
        var key = toKey(viewYear, viewMonth, day);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dp-day";
        btn.textContent = day;
        btn.setAttribute("data-key", key);
        if (key === todayKey) btn.classList.add("today");
        if (selectedDates.indexOf(key) !== -1) btn.classList.add("selected");

        btn.addEventListener("click", function () {
          var k   = this.getAttribute("data-key");
          var idx = selectedDates.indexOf(k);
          if (idx === -1) {
            selectedDates.push(k);
            this.classList.add("selected");
          } else {
            selectedDates.splice(idx, 1);
            this.classList.remove("selected");
          }
          commit();
        });

        grid.appendChild(btn);
      }

      // Trailing padding days (disabled)
      var filled   = firstWeekday + daysInMonth;
      var trailing = filled % 7 === 0 ? 0 : 7 - (filled % 7);
      for (var t = 1; t <= trailing; t++) {
        var trail = document.createElement("button");
        trail.type = "button";
        trail.className = "dp-day other-month";
        trail.textContent = t;
        trail.disabled = true;
        grid.appendChild(trail);
      }
    }

    function openDropdown() {
      dropdown.classList.remove("hidden");
      trigger.setAttribute("aria-expanded", "true");
      renderGrid();
    }

    function closeDropdown() {
      dropdown.classList.add("hidden");
      trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", function () {
      dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown();
    });

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        viewMonth--;
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        renderGrid();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        viewMonth++;
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        renderGrid();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        selectedDates = [];
        commit();
        renderGrid();
      });
    }

    if (doneBtn) {
      doneBtn.addEventListener("click", closeDropdown);
    }

    // Close on click outside the picker wrap
    document.addEventListener("click", function (e) {
      var wrap = $("#date-picker-wrap");
      if (wrap && !wrap.contains(e.target)) closeDropdown();
    });

    // When setFormData() restores a show, question-form.js dispatches
    // "writer:date-set" on the hidden input so we can sync the trigger display.
    // The calendar selection is cleared — the label is a formatted string we
    // can't reliably reverse-parse back to individual keys.
    if (hiddenInput) {
      hiddenInput.addEventListener("writer:date-set", function () {
        selectedDates = [];
        var val = hiddenInput.value || "";
        if (display) {
          if (val) {
            display.textContent = val;
            display.classList.remove("dp-placeholder");
          } else {
            display.textContent = "Select date(s)";
            display.classList.add("dp-placeholder");
          }
        }
      });
    }
  }

  // ─── Restore show from Firestore data ─────────────────────────

  // Loads a saved show (draft or published) back into the editor.
  // type: "draft" | "published"
  function restoreShow(data, id, type) {
    var blocks = Array.isArray(data.blocks) ? data.blocks : [];

    showState.blocks = blocks;
    rebuildFlatSlides();
    navigateToSlide(0);
    renderFilmstrip();
    updateStatCounters();

    // Restore show metadata + the first block's form data into the form
    var firstFormData = blocks.length && blocks[0].formData ? blocks[0].formData : {};
    if (window.WriterQuestionForm) {
      WriterQuestionForm.setFormData({
        show: data.show || {},
        block: firstFormData.block || {},
      });
    }

    if (type === "published") {
      activePublishedId = id;
      activeDraftId = null;
    } else {
      activeDraftId = id;
      activePublishedId = null;
    }

    applyRestoredWriterUi(data);

    markClean();
    console.log("[writer] show restored:", id, type);
  }

  // ─── Open Show modal ───────────────────────────────────────────

  function formatTimestamp(ts) {
    if (!ts) return "Unknown date";
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function renderPickerList(containerId, items, type) {
    var container = $("#" + containerId);
    if (!container) return;

    if (!items.length) {
      container.innerHTML = '<p class="picker-empty">No ' + (type === "draft" ? "saved drafts" : "published shows") + ' found.</p>';
      return;
    }

    container.innerHTML = "";
    items.forEach(function (item) {
      var title = (item.data.show && item.data.show.title) || "Untitled Show";
      var dateLabel = (item.data.show && item.data.show.dateLabel) || "";
      var touched = formatTimestamp(item.data.lastTouchedAt);
      var badge = type === "draft" ? "draft" : "published";
      var badgeLabel = type === "draft" ? "Draft" : "Published";

      var el = document.createElement("div");
      el.className = "picker-item";
      el.innerHTML =
        '<div class="picker-item-info">' +
          '<div class="picker-item-title">' + escapeHtml(title) + '</div>' +
          '<div class="picker-item-meta">' + escapeHtml(dateLabel) + (dateLabel ? " &bull; " : "") + "Last saved " + escapeHtml(touched) + '</div>' +
        '</div>' +
        '<span class="picker-item-badge ' + badge + '">' + badgeLabel + '</span>';

      el.addEventListener("click", function () {
        restoreShow(item.data, item.id, type);
        $("#open-show-modal").classList.add("hidden");
      });

      container.appendChild(el);
    });
  }

  function loadOpenShowLists() {
    var user = firebase.auth().currentUser;
    if (!user) return;

    var db = firebase.firestore();

    // Drafts
    var draftsContainer = $("#open-show-drafts-list");
    if (draftsContainer) draftsContainer.innerHTML = '<p class="picker-empty">Loading\u2026</p>';

    db.collection("showDrafts")
      .where("authorUid", "==", user.uid)
      .orderBy("lastTouchedAt", "desc")
      .limit(30)
      .get()
      .then(function (snap) {
        var items = snap.docs.map(function (doc) { return { id: doc.id, data: doc.data() }; });
        renderPickerList("open-show-drafts-list", items, "draft");
      })
      .catch(function (err) {
        console.error("[writer] failed to load drafts:", err);
        if (draftsContainer) draftsContainer.innerHTML = '<p class="picker-empty">Could not load drafts.</p>';
      });

    // Published shows
    var publishedContainer = $("#open-show-published-list");
    if (publishedContainer) publishedContainer.innerHTML = '<p class="picker-empty">Loading\u2026</p>';

    db.collection("publishedShows")
      .where("authorUid", "==", user.uid)
      .orderBy("lastTouchedAt", "desc")
      .limit(30)
      .get()
      .then(function (snap) {
        var items = snap.docs.map(function (doc) { return { id: doc.id, data: doc.data() }; });
        renderPickerList("open-show-published-list", items, "published");
      })
      .catch(function (err) {
        console.error("[writer] failed to load published shows:", err);
        if (publishedContainer) publishedContainer.innerHTML = '<p class="picker-empty">Could not load published shows.</p>';
      });
  }

  function bindOpenShowModal() {
    var modal = $("#open-show-modal");
    var btnOpen = $("#btn-open-show");
    var btnClose = $("#btn-close-open-modal");

    if (btnOpen) {
      btnOpen.addEventListener("click", function () {
        if (!modal) return;
        modal.classList.remove("hidden");
        loadOpenShowLists();
      });
    }

    if (btnClose) {
      btnClose.addEventListener("click", function () {
        if (modal) modal.classList.add("hidden");
      });
    }

    // Close on overlay click (but not card click)
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) modal.classList.add("hidden");
      });
    }

    // Tab switching inside the modal
    document.querySelectorAll(".modal-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".modal-tab").forEach(function (t) { t.classList.remove("active"); });
        document.querySelectorAll(".modal-tab-pane").forEach(function (p) { p.classList.remove("active"); });
        tab.classList.add("active");
        var pane = document.getElementById("modal-tab-" + tab.getAttribute("data-modal-tab"));
        if (pane) pane.classList.add("active");
      });
    });
  }

  var _filmstripCanvasRo = null;

  /**
   * Push main preview stage dimensions onto #slide-filmstrip so .filmstrip-preview-inner
   * matches the large Slide Preview box (fixes vertical flex mismatch when scaled).
   * Exposed on window for DevTools: syncFilmstripCanvasVars()
   */
  function syncFilmstripCanvasVars() {
    var mainStage = document.querySelector(".preview-stage-wrap .preview-stage");
    var strip = document.getElementById("slide-filmstrip");
    if (!mainStage || !strip) return false;
    var w = mainStage.offsetWidth;
    var h = mainStage.offsetHeight;
    if (!w || w < 80) return false;
    strip.style.setProperty("--filmstrip-preview-canvas-w", w + "px");
    if (h && h > 20) {
      strip.style.setProperty("--filmstrip-preview-canvas-h", h + "px");
    }
    return true;
  }

  /**
   * Filmstrip thumbnails: same DOM as Slide Preview, scaled. Retries if #slide-filmstrip
   * is missing when init runs (shell order / late paint).
   */
  function bindFilmstripCanvasSync() {
    var mainStage = document.querySelector(".preview-stage-wrap .preview-stage");

    function sync() {
      syncFilmstripCanvasVars();
    }

    function tryBindStrip(retriesLeft) {
      var strip = document.getElementById("slide-filmstrip");
      if (!mainStage) return;
      if (!strip) {
        if (retriesLeft > 0) {
          setTimeout(function () {
            tryBindStrip(retriesLeft - 1);
          }, 50);
        }
        return;
      }
      sync();
      requestAnimationFrame(function () {
        requestAnimationFrame(sync);
      });
      if (typeof ResizeObserver !== "undefined") {
        if (_filmstripCanvasRo) {
          _filmstripCanvasRo.disconnect();
        }
        _filmstripCanvasRo = new ResizeObserver(function () {
          sync();
        });
        _filmstripCanvasRo.observe(mainStage);
      } else {
        window.addEventListener("resize", sync);
      }
    }

    tryBindStrip(40);

    window.syncFilmstripCanvasVars = syncFilmstripCanvasVars;
  }

  // ─── Show type toggle ──────────────────────────────────────────

  function bindShowTypeToggle() {
    document.querySelectorAll(".show-type-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var type = btn.getAttribute("data-show-type");
        document.querySelectorAll(".show-type-btn").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
        var hiddenInput = $("#show-type");
        if (hiddenInput) {
          hiddenInput.value = type || "classic-trivia";
          hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        markDirty();
      });
    });
  }

  // ─── Feud reveal controls ──────────────────────────────────────

  function bindFeudRevealControls() {
    var nextBtn = $("#feud-reveal-next-btn");
    var prevBtn = $("#feud-hide-prev-btn");

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        if (window.WriterPreview && typeof WriterPreview.feudRevealNext === "function") {
          WriterPreview.feudRevealNext();
        }
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (window.WriterPreview && typeof WriterPreview.feudHidePrev === "function") {
          WriterPreview.feudHidePrev();
        }
      });
    }
  }

  // ─── Module init ───────────────────────────────────────────────

  function initApp() {
    if (window.WriterQuestionForm) WriterQuestionForm.init();
    if (window.WriterBlockBuilder) WriterBlockBuilder.init();
    if (window.WriterPreview) WriterPreview.init();

    bindFilmstripCanvasSync();

    initTabs();
    bindModuleEvents();
    bindTopbarButtons();
    bindDraftButtons();
    bindTitleSlideButton();
    bindShowNav();
    bindFilmstripKeys();
    bindAnswerReveal();
    bindMediaUploads();
    bindTemplateButtons();
    bindDatePicker();
    bindOpenShowModal();
    bindTemplateBuilderArrowNav();
    bindFeudRevealControls();
    bindShowTypeToggle();

    // Auto-insert the title slide as the first block on every session load
    insertDefaultTitleSlide();

    // Mark app as ready — dirty tracking is now active
    appReady = true;

    console.log("[writer] app initialized");
  }

  // ─── Boot ──────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    waitForFirebase(checkAuth);
  });

})();