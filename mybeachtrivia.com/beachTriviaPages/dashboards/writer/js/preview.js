// mybeachtrivia.com/beachTriviaPages/dashboards/writer/js/preview.js
// Writer preview renderer
// Phase 1:
// - render preview directly from question-form data
// - support live / reveal preview states
// - update question/category/options/answer/notes
// - expose simple public API for app.js

(function () {
  "use strict";

  const PREVIEW = {
    init,
    renderFromFormData,
    renderBlock,
    renderTitleSlide,
    setMode,
    nextMode,
    prevMode,
    getMode,
    showMessage,
    clearMessage,
    ensurePreviewSlideSkeleton,
    renderThumbnailStage,
    feudRevealNext,
    feudHidePrev,
    resetFeudReveal,
  };

  window.WriterPreview = PREVIEW;

  const MODES = ["live", "reveal"];
  let currentModeIndex = 0;
  let dom = null;
  let _basePreviewPx = null; // cached default font size from CSS clamp, used to anchor scaling
  let _lastFormData = null;  // cached so mode changes can trigger a full re-render
  let _lastRenderedQuestionType = "";
  let _feudRevealCount = 0;  // # of filled answers revealed, lowest points first

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  /** Bind preview DOM from a `.preview-stage` root (main preview or filmstrip thumb). */
  function collectDomFromPreviewStage(stageEl) {
    if (!stageEl) return null;
    return {
      previewStage: stageEl,
      previewQuestion: stageEl.querySelector(".slide-question"),
      previewCategory: stageEl.querySelector(".slide-category"),
      previewOptions: stageEl.querySelector(".slide-options"),
      previewAnswerWrap: stageEl.querySelector(".slide-answer-preview"),
      previewAnswerValue: stageEl.querySelector(".slide-answer-preview .value"),
      previewAnswerLabel: stageEl.querySelector(".slide-answer-preview .label"),
      previewNotes: stageEl.querySelector(".slide-notes"),
      previewRoundBadge: stageEl.querySelector(".slide-badge"),
      previewStateMeta: stageEl.querySelector(".slide-meta-stack"),
      previewPrevBtn: null,
      previewNextBtn: null,
      previewRevealBtn: null,
      previewMedia: stageEl.querySelector(".slide-media-area"),
      previewHelperCard: null,
    };
  }

  /** Minimal slide markup matching `writer.html` — used for filmstrip thumbs. */
  function ensurePreviewSlideSkeleton(stageEl) {
    if (!stageEl || stageEl.querySelector(".slide-middle")) return;
    stageEl.innerHTML = [
      '<div class="slide-top">',
      '  <span class="slide-badge"></span>',
      '  <div class="slide-meta-stack"></div>',
      "</div>",
      '<div class="slide-middle">',
      '  <div class="slide-category"></div>',
      '  <div class="slide-question"></div>',
      '  <div class="slide-media-area" style="display:none"></div>',
      '  <div class="slide-options"></div>',
      '  <div class="slide-answer-preview" style="display:none">',
      '    <div class="label">Answer</div>',
      '    <div class="value"></div>',
      "  </div>",
      "</div>",
      '<div class="slide-bottom">',
      '  <div class="slide-notes"></div>',
      "</div>",
    ].join("");
  }

  /**
   * Paint a detached `.preview-stage` using the same pipeline as the main preview.
   * @param {HTMLElement} previewStageEl
   * @param {{ type: string, formData?: object }} payload  `type`: "title" | "block"
   */
  function renderThumbnailStage(previewStageEl, payload) {
    if (!previewStageEl || !payload) return;
    ensurePreviewSlideSkeleton(previewStageEl);
    var savedDom = dom;
    dom = collectDomFromPreviewStage(previewStageEl);
    if (!dom || !dom.previewStage) {
      dom = savedDom;
      return;
    }
    try {
      if (payload.type === "title") {
        renderTitleSlide();
      } else if (payload.type === "block" && payload.formData) {
        renderFromFormData(payload.formData, {
          skipLastFormCache: true,
          forceMode: "live",
          skipToolbar: true,
        });
      }
    } finally {
      dom = savedDom;
    }
  }

  function init() {
    var mainStage = document.querySelector(".preview-area .preview-stage");
    dom = collectDomFromPreviewStage(mainStage);
    if (dom) {
      dom.previewPrevBtn = findPreviewButton("Prev");
      dom.previewNextBtn = findPreviewButton("Next");
      dom.previewRevealBtn = findPreviewButton("Reveal Answer");
      dom.previewHelperCard = $(".helper-card p");
    }

    bindEvents();
    updateRevealVisibility();
    updateToolbarState();

    document.addEventListener("writer:question-form-change", function (e) {
      if (e && e.detail && e.detail.data) {
        var reason = String((e.detail && e.detail.reason) || "");
        // "set-form-data" fires during slide navigation (setFormData call) and
        // "init" fires on form boot — in both cases navigateToSlide calls
        // renderFromFormData explicitly afterwards with the correct data,
        // so we must not let the form's DOM-read data override it.
        if (reason === "set-form-data" || reason === "init") return;
        renderFromFormData(e.detail.data);
      }
    });
  }

  function bindEvents() {
    if (!dom) return;

    if (dom.previewPrevBtn) {
      dom.previewPrevBtn.addEventListener("click", function () {
        prevMode();
      });
    }

    if (dom.previewNextBtn) {
      dom.previewNextBtn.addEventListener("click", function () {
        nextMode();
      });
    }

    if (dom.previewRevealBtn) {
      dom.previewRevealBtn.addEventListener("click", function () {
        setMode(getMode() === "reveal" ? "live" : "reveal");
      });
    }
  }

  function findPreviewButton(labelText) {
    const buttons = Array.from(document.querySelectorAll(".preview-header-actions .btn"));
    return buttons.find(function (btn) {
      return String(btn.textContent || "").trim().toLowerCase() === String(labelText || "").trim().toLowerCase();
    }) || null;
  }

  /** Always resolve from the stage so cached dom refs never leave an old label (e.g. after deploy cache). */
  function getAnswerPreviewParts() {
    if (!dom || !dom.previewStage) return { wrap: null, label: null, value: null };
    var wrap = dom.previewAnswerWrap;
    if (!wrap || !dom.previewStage.contains(wrap)) {
      wrap = dom.previewStage.querySelector(".slide-answer-preview");
    }
    if (!wrap) return { wrap: null, label: null, value: null };
    return {
      wrap: wrap,
      label: wrap.querySelector(".label"),
      value: wrap.querySelector(".value"),
    };
  }

  function getMode() {
    return MODES[currentModeIndex] || "live";
  }

  function setMode(mode) {
    const normalized = String(mode || "").trim().toLowerCase();
    const idx = MODES.indexOf(normalized);
    currentModeIndex = idx === -1 ? 0 : idx;
    if (_lastFormData) {
      renderFromFormData(_lastFormData);
    } else {
      updateRevealVisibility();
      updateToolbarState();
    }
    emitModeChange();
  }

  function nextMode() {
    currentModeIndex = (currentModeIndex + 1) % MODES.length;
    if (_lastFormData) {
      renderFromFormData(_lastFormData);
    } else {
      updateRevealVisibility();
      updateToolbarState();
    }
    emitModeChange();
  }

  function prevMode() {
    currentModeIndex = currentModeIndex - 1;
    if (currentModeIndex < 0) currentModeIndex = MODES.length - 1;
    if (_lastFormData) {
      renderFromFormData(_lastFormData);
    } else {
      updateRevealVisibility();
      updateToolbarState();
    }
    emitModeChange();
  }

  function emitModeChange() {
    document.dispatchEvent(new CustomEvent("writer:preview-mode-change", {
      detail: {
        mode: getMode(),
      },
    }));
  }

  // ─── Title Slide ───────────────────────────────────────────────

  function renderTitleSlide() {
    if (!dom || !dom.previewStage) return;

    // Clear any block-type styling left from a previous slide
    dom.previewStage.removeAttribute("data-block-type");

    var overlay = dom.previewStage.querySelector(".slide-title-overlay");
    if (!overlay) {
      overlay = _buildTitleOverlay();
      dom.previewStage.appendChild(overlay);
    }
    overlay.style.display = "flex";
  }

  function _buildTitleOverlay() {
    var overlay = document.createElement("div");
    overlay.className = "slide-title-overlay";

    var inner = document.createElement("div");
    inner.className = "title-slide-inner";

    // Eyebrow row: line — text — line
    var eyebrowRow = document.createElement("div");
    eyebrowRow.className = "title-slide-eyebrow-row";
    var lineL = document.createElement("div");
    lineL.className = "title-slide-eyebrow-line";
    var eyebrow = document.createElement("div");
    eyebrow.className = "title-slide-eyebrow";
    eyebrow.textContent = "Beach Trivia Presents";
    var lineR = document.createElement("div");
    lineR.className = "title-slide-eyebrow-line";
    eyebrowRow.appendChild(lineL);
    eyebrowRow.appendChild(eyebrow);
    eyebrowRow.appendChild(lineR);

    // Heading
    var heading = document.createElement("div");
    heading.className = "title-slide-heading";
    heading.textContent = "Trivia Night";

    // Center row: QR — Logo — QR
    var centerRow = document.createElement("div");
    centerRow.className = "title-slide-center-row";

    var logoWrap = document.createElement("div");
    logoWrap.className = "title-slide-logo";
    var logoImg = document.createElement("img");
    logoImg.src = "assets/images/BTlogo-Round-Border.png";
    logoImg.alt = "Beach Trivia";
    logoWrap.appendChild(logoImg);

    centerRow.appendChild(_buildQRCard("assets/images/qr-virginia.jpg", "Virginia"));
    centerRow.appendChild(logoWrap);
    centerRow.appendChild(_buildQRCard("assets/images/qr-new-york.jpg", "New York"));

    inner.appendChild(eyebrowRow);
    inner.appendChild(heading);
    inner.appendChild(centerRow);
    overlay.appendChild(inner);

    return overlay;
  }

  function _buildQRCard(src, label) {
    var card = document.createElement("div");
    card.className = "title-slide-qr-card";

    var img = document.createElement("img");
    img.src = src;
    img.alt = label + " QR Code";

    var lbl = document.createElement("div");
    lbl.className = "title-slide-qr-label";
    lbl.textContent = label;

    var hint = document.createElement("div");
    hint.className = "title-slide-qr-hint";
    hint.textContent = "Scan to play";

    card.appendChild(img);
    card.appendChild(lbl);
    card.appendChild(hint);
    return card;
  }

  function _hideTitleOverlay() {
    if (!dom || !dom.previewStage) return;
    var overlay = dom.previewStage.querySelector(".slide-title-overlay");
    if (overlay) overlay.style.display = "none";
  }

  // ───────────────────────────────────────────────────────────────

  // Block types that are display-only and never need a reveal interaction.
  const DISPLAY_BLOCK_TYPES = ["intro-slide", "info-slide", "round-start", "category-slide"];

  function renderFromFormData(formData, renderOpts) {
    renderOpts = renderOpts || {};
    _hideTitleOverlay();
    if (formData && !renderOpts.skipLastFormCache) {
      _lastFormData = formData;
    }
    const data = normalizeFormData(formData || _lastFormData);
    const mode =
      renderOpts.forceMode != null
        ? String(renderOpts.forceMode).toLowerCase()
        : getMode();

    // Force "display" for non-question slide types regardless of stored questionType.
    const isDisplayBlock = DISPLAY_BLOCK_TYPES.indexOf(data.block.type) !== -1
      || String(data.block.questionType || "").trim().toLowerCase() === "display";
    const effectiveType = isDisplayBlock ? "display" : String(data.block.questionType || "").trim().toLowerCase();
    _lastRenderedQuestionType = effectiveType;

    // Stamp block type so CSS can apply block-specific layouts (e.g. round-start facelift)
    if (dom && dom.previewStage) {
      dom.previewStage.setAttribute("data-block-type", data.block.type || "");
    }

    renderRoundBadge(data.block.roundName || "Round");
    renderCategory(data.block.categoryName || "Category");
    renderQuestion(
      data.block.questionText || "Your question will appear here.",
      data.block.questionAlign,
      data.block.questionFontScale
    );
    renderOptions(
      effectiveType,
      data.block.options || [],
      data.block.matchingPairs || [],
      data.block.orderingItems || [],
      mode,
      data.block.answerText || "",
      data.block.feudAnswers || []
    );
    renderAnswer(data.block.answerText || "", effectiveType);
    renderNotes(data.block.questionNotes || "");
    renderMeta(mode, data);
    applyThemeClass(data.block.themeStyle || "Standard Trivia");

    // Answer-review slides: full recap is in question text.
    var isAnsSummary = String(data.block.type || "").toLowerCase() === "answers-summary";
    if (dom && dom.previewQuestion) {
      dom.previewQuestion.removeAttribute("data-font-mode");
      if (isAnsSummary) {
        dom.previewQuestion.style.whiteSpace = "pre-wrap";
        dom.previewQuestion.style.fontSize = "";
        dom.previewQuestion.style.lineHeight = "";
        dom.previewQuestion.setAttribute("data-font-mode", "summary");
      } else if (isDisplayBlock) {
        dom.previewQuestion.style.whiteSpace = "";
        dom.previewQuestion.style.fontSize = "";
        dom.previewQuestion.style.lineHeight = "";
        dom.previewQuestion.setAttribute("data-font-mode", "display");
      } else {
        dom.previewQuestion.style.whiteSpace = "";
        dom.previewQuestion.style.fontSize = "";
        dom.previewQuestion.style.lineHeight = "";
      }
    }

    // Hide the category label on display slides — the badge + title already identify
    // the slide, and the category text overlaps the badge in compact previews.
    if (dom && dom.previewCategory) {
      dom.previewCategory.style.display = isDisplayBlock ? "none" : "";
    }

    renderMedia(effectiveType, data.block.imageUrl, data.block.audioUrl);
    enforceInfoSlideTopClearance(data.block.type);
    syncAnswerPreviewToMode(mode);
    if (!renderOpts.skipToolbar) {
      syncRevealToolbarToMode(getMode());
    }

    if (isAnsSummary && dom) {
      var ansParts = getAnswerPreviewParts();
      if (ansParts.wrap) ansParts.wrap.style.display = "none";
    }
  }

  function renderMedia(questionType, imageUrl, audioUrl) {
    if (!dom || !dom.previewMedia) return;
    var el = dom.previewMedia;
    el.innerHTML = "";
    el.style.display = "none";

    if (questionType === "image-question" && imageUrl) {
      var img = document.createElement("img");
      img.src = String(imageUrl);
      img.className = "slide-media-img";
      img.alt = "Question image";
      img.onerror = function () { el.style.display = "none"; };
      el.appendChild(img);
      el.style.display = "";
    } else if (questionType === "audio-question" && audioUrl) {
      var audioEl = document.createElement("div");
      audioEl.className = "slide-media-audio";
      audioEl.innerHTML =
        '<span class="slide-media-audio-icon">&#9654;</span>' +
        '<span class="slide-media-audio-label">' + String(audioUrl).replace(/^https?:\/\//, "") + '</span>';
      el.appendChild(audioEl);
      el.style.display = "";
    }
  }

  function renderBlock(block) {
    if (!block || !Array.isArray(block.slides) || !block.slides.length) {
      showMessage("No slides available for preview.");
      return;
    }

    clearMessage();

    const mode = getMode();
    const preferredSlide = block.slides.find(function (slide) {
      return String(slide.audienceMode || "").toLowerCase() === mode;
    }) || block.slides[0];

    // Slides with revealable:false are display-only — treat as "display" type
    // regardless of what questionType the block was saved with.
    const isNonRevealable = preferredSlide.revealable === false;
    const effectiveType = isNonRevealable
      ? "display"
      : String(preferredSlide.questionType || block.questionType || "multiple-choice").trim().toLowerCase();

    _lastRenderedQuestionType = effectiveType;

    renderRoundBadge(preferredSlide.title || block.roundName || "Round");
    renderCategory(preferredSlide.categoryName || block.categoryName || "Category");
    renderQuestion(
      preferredSlide.prompt || "Your question will appear here.",
      preferredSlide.questionAlign || block.questionAlign || "left",
      typeof preferredSlide.questionFontScale === "number"
        ? preferredSlide.questionFontScale
        : (typeof block.questionFontScale === "number" ? block.questionFontScale : 1.6)
    );
    renderOptions(
      effectiveType,
      preferredSlide.options || [],
      preferredSlide.matchingPairs || [],
      preferredSlide.orderingItems || [],
      mode,
      preferredSlide.answer || "",
      (Array.isArray(preferredSlide.feudAnswers) && preferredSlide.feudAnswers.length
        ? preferredSlide.feudAnswers
        : (block.feudAnswers || []))
    );
    renderAnswer(preferredSlide.answer || "", effectiveType);
    renderNotes(preferredSlide.notes || block.notes || "");
    renderMeta(mode, {
      block: {
        questionType: effectiveType,
        themeStyle: preferredSlide.themeStyle || block.themeStyle || "Standard Trivia",
        fontSizeMode: preferredSlide.fontSizeMode || block.fontSizeMode || "Auto Fit",
      },
      stateKey: preferredSlide.stateKey || "",
      stateLabel: preferredSlide.stateLabel || "",
    });
    applyThemeClass(preferredSlide.themeStyle || block.themeStyle || "Standard Trivia");
    enforceInfoSlideTopClearance(block.type || preferredSlide.blockType || "");
    updateRevealVisibility();
  }

  function enforceInfoSlideTopClearance(blockType) {
    if (!dom || !dom.previewStage || !dom.previewQuestion) return;
    dom.previewQuestion.style.marginTop = "";
    if (String(blockType || "").toLowerCase() !== "info-slide") return;

    var topRow = dom.previewStage.querySelector(".slide-top");
    if (!topRow) return;

    var topRect = topRow.getBoundingClientRect();
    var qRect = dom.previewQuestion.getBoundingClientRect();
    var minGap = Math.max(12, Math.round((dom.previewStage.clientWidth || 0) * 0.012));
    var overlapPx = (topRect.bottom + minGap) - qRect.top;
    if (overlapPx > 0) {
      dom.previewQuestion.style.marginTop = overlapPx.toFixed(2) + "px";
    }
  }

  function renderRoundBadge(text) {
    if (dom && dom.previewRoundBadge) {
      dom.previewRoundBadge.textContent = text || "Round";
    }
  }

  function renderCategory(text) {
    if (dom && dom.previewCategory) {
      dom.previewCategory.textContent = text || "Category";
    }
  }

  function renderQuestion(text, align, fontScale) {
    if (!dom || !dom.previewQuestion) return;

    var el = dom.previewQuestion;

    el.innerHTML = sanitizeHtml(text || "Your question will appear here.");
    el.style.textAlign = align === "center" ? "center" : align === "right" ? "right" : "";

    // Always clear the inline style so the CSS clamp can resolve first.
    el.style.fontSize = "";
    if (typeof fontScale === "number" && fontScale !== 1.0) {
      // Use the cached base px so scaling always anchors to the default CSS size,
      // avoiding stale getComputedStyle reads within the same JS frame.
      if (!_basePreviewPx) {
        _basePreviewPx = parseFloat(window.getComputedStyle(el).fontSize) || 38;
      }
      el.style.fontSize = String(_basePreviewPx * fontScale) + "px";
    } else {
      // At default scale, refresh the cached base from the live CSS clamp value.
      _basePreviewPx = parseFloat(window.getComputedStyle(el).fontSize) || 38;
    }
    el.style.transform = "";
    el.style.transformOrigin = "";
  }

  function sanitizeHtml(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = html;

    var unsafe = tmp.querySelectorAll("script, style, iframe, object, embed");
    unsafe.forEach(function (el) {
      el.remove();
    });

    var all = tmp.querySelectorAll("*");
    all.forEach(function (el) {
      Array.from(el.attributes).forEach(function (attr) {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      });
    });

    return tmp.innerHTML;
  }

  var FEUD_BOARD_SLOTS = 8;

  function getFeudSlots8(feudAnswers) {
    var raw = Array.isArray(feudAnswers) ? feudAnswers : [];
    var slots = [];
    for (var s = 0; s < FEUD_BOARD_SLOTS; s++) {
      var o = raw[s];
      slots.push(o && typeof o === "object" ? o : { text: "" });
    }
    return slots;
  }

  function getFeudFilledRevealOrder(slots8) {
    var order = [];
    for (var i = 0; i < slots8.length; i++) {
      if (String((slots8[i] && slots8[i].text) != null ? slots8[i].text : "").trim()) {
        order.push(i);
      }
    }
    order.sort(function (a, b) {
      return b - a;
    });
    return order;
  }

  function renderFeudAnswerGrid(feudAnswers, fullReveal, flipOpts) {
    flipOpts = flipOpts || {};
    if (!dom || !dom.previewOptions) return;
    dom.previewOptions.innerHTML = "";
    dom.previewOptions.className = "slide-options slide-options-feud";
    dom.previewOptions.style.gridTemplateRows = "repeat(4, minmax(0, auto))";

    var slots8 = getFeudSlots8(feudAnswers);
    var order = getFeudFilledRevealOrder(slots8);
    var nFilled = order.length;
    if (_feudRevealCount > nFilled) {
      _feudRevealCount = nFilled;
    }
    var k = fullReveal ? nFilled : Math.max(0, Math.min(_feudRevealCount, nFilled));

    for (var i = 0; i < FEUD_BOARD_SLOTS; i++) {
      var a = slots8[i] || { text: "" };
      var hasText = String(a.text != null ? a.text : "").trim().length > 0;
      var posInOrder = order.indexOf(i);
      var isRevealed = hasText && (fullReveal || (posInOrder >= 0 && posInOrder < k));

      var row = document.createElement("div");
      row.className = "slide-feud-row";
      var deferFlip =
        isRevealed &&
        !fullReveal &&
        flipOpts.deferRevealIndex === i;
      if (isRevealed && !deferFlip) row.className += " revealed";
      if (!hasText) row.className += " slide-feud-row--vacant";

      if (!hasText) {
        var rankV = document.createElement("span");
        rankV.className = "slide-feud-row-rank";
        rankV.textContent = String(i + 1);
        var sil = document.createElement("span");
        sil.className = "slide-feud-row-silhouette";
        sil.setAttribute("aria-hidden", "true");
        var ptsV = document.createElement("span");
        ptsV.className = "slide-feud-row-pts";
        ptsV.textContent = "";
        row.appendChild(rankV);
        row.appendChild(sil);
        row.appendChild(ptsV);
        dom.previewOptions.appendChild(row);
        continue;
      }

      var trimAns = String(a.text != null ? a.text : "").trim();
      var ptsStr = String(8 - i) + " pts";
      row.className += " slide-feud-row--card";
      row.setAttribute("data-feud-idx", String(i));

      var flipper = document.createElement("div");
      flipper.className = "slide-feud-row-flipper";
      var inner = document.createElement("div");
      inner.className = "slide-feud-row-flip-inner";
      function makeRowFace(isBack) {
        var face = document.createElement("div");
        face.className = "slide-feud-row-face" + (isBack ? " slide-feud-row-face--back" : " slide-feud-row-face--front");
        var r = document.createElement("span");
        r.className = "slide-feud-row-rank";
        r.textContent = String(i + 1);
        var mid = document.createElement("span");
        if (isBack) {
          mid.className = "slide-feud-row-text" + (trimAns ? "" : " slide-feud-row-empty");
          mid.textContent = trimAns || "—";
        } else {
          mid.className = "slide-feud-rank-bubble";
          mid.textContent = String(i + 1);
          mid.setAttribute("aria-label", "Concealed answer, rank " + String(i + 1));
        }
        var p = document.createElement("span");
        p.className = "slide-feud-row-pts";
        if (isBack) {
          p.textContent = ptsStr;
        } else {
          p.setAttribute("aria-hidden", "true");
        }
        face.appendChild(r);
        face.appendChild(mid);
        face.appendChild(p);
        return face;
      }
      inner.appendChild(makeRowFace(false));
      inner.appendChild(makeRowFace(true));
      flipper.appendChild(inner);
      row.appendChild(flipper);
      dom.previewOptions.appendChild(row);
      if (deferFlip) {
        (function (el) {
          if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            el.classList.add("revealed");
            return;
          }
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              el.classList.add("revealed");
            });
          });
        })(row);
      }
    }
  }

  function feudRevealNext() {
    if (!_lastFormData) return;
    var b = (_lastFormData && _lastFormData.block) || {};
    var answers = Array.isArray(b.feudAnswers) ? b.feudAnswers : [];
    var nFilled = getFeudFilledRevealOrder(getFeudSlots8(answers)).length;
    if (_feudRevealCount < nFilled) {
      _feudRevealCount++;
      var order = getFeudFilledRevealOrder(getFeudSlots8(answers));
      var flipIdx = order[_feudRevealCount - 1];
      renderFeudAnswerGrid(answers, false, { deferRevealIndex: flipIdx });
      _syncFeudRevealButtons();
    }
  }

  function feudHidePrev() {
    if (_feudRevealCount <= 0) return;
    var b = (_lastFormData && _lastFormData.block) || {};
    var answers = Array.isArray(b.feudAnswers) ? b.feudAnswers : [];
    var order = getFeudFilledRevealOrder(getFeudSlots8(answers));
    var hideIdx = order[_feudRevealCount - 1];
    var host = dom && dom.previewOptions;
    var row = host && host.querySelector
      ? host.querySelector('.slide-feud-row--card[data-feud-idx="' + hideIdx + '"]')
      : null;
    if (!row || !row.classList.contains("revealed")) {
      _feudRevealCount--;
      renderFeudAnswerGrid(answers, false);
      _syncFeudRevealButtons();
      return;
    }
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      row.classList.remove("revealed");
      _feudRevealCount--;
      renderFeudAnswerGrid(answers, false);
      _syncFeudRevealButtons();
      return;
    }
    var inner = row.querySelector(".slide-feud-row-flip-inner");
    var finished = false;
    var hideTid = null;
    function applyHideSync() {
      if (finished) return;
      finished = true;
      if (hideTid != null) {
        clearTimeout(hideTid);
        hideTid = null;
      }
      _feudRevealCount--;
      renderFeudAnswerGrid(answers, false);
      _syncFeudRevealButtons();
    }
    if (inner) {
      var onEnd = function (e) {
        if (e && e.propertyName && e.propertyName.indexOf("transform") === -1) {
          return;
        }
        inner.removeEventListener("transitionend", onEnd);
        if (hideTid != null) {
          clearTimeout(hideTid);
          hideTid = null;
        }
        applyHideSync();
      };
      inner.addEventListener("transitionend", onEnd);
      hideTid = setTimeout(applyHideSync, 800);
    }
    row.classList.remove("revealed");
    if (!inner) {
      applyHideSync();
    }
  }

  function resetFeudReveal() {
    _feudRevealCount = 0;
  }

  function _syncFeudRevealButtons() {
    var b = _lastFormData && _lastFormData.block;
    var answers = b && Array.isArray(b.feudAnswers) ? b.feudAnswers : [];
    var nFilled = getFeudFilledRevealOrder(getFeudSlots8(answers)).length;
    var nextBtn = document.getElementById("feud-reveal-next-btn");
    var prevBtn = document.getElementById("feud-hide-prev-btn");
    if (nextBtn) nextBtn.disabled = nFilled === 0 || _feudRevealCount >= nFilled;
    if (prevBtn) prevBtn.disabled = _feudRevealCount <= 0;
  }

  function renderOptions(questionType, options, matchingPairs, orderingItems, mode, answerText, feudAnswers) {
    if (!dom || !dom.previewOptions) return;

    const normalizedType = String(questionType || "").trim().toLowerCase();
    const isReveal = String(mode || "").toLowerCase() === "reveal";
    dom.previewOptions.innerHTML = "";
    dom.previewOptions.classList.remove("slide-options-matching");
    dom.previewOptions.classList.remove("slide-options-display");
    dom.previewOptions.classList.remove("slide-options--dense");
    dom.previewOptions.classList.remove("slide-options-feud");

    if (normalizedType === "multiple-choice") {
      const normalizedOptions = Array.isArray(options) ? options.filter(Boolean) : [];
      if (!normalizedOptions.length) {
        dom.previewOptions.style.display = "none";
        return;
      }
      dom.previewOptions.style.display = "";
      dom.previewOptions.classList.toggle("slide-options--dense", normalizedOptions.length >= 5);
      normalizedOptions.forEach(function (option, index) {
        const row = document.createElement("div");
        const isCorrect = isReveal && option === answerText;
        row.className = "slide-option" + (isReveal ? (isCorrect ? " correct" : " incorrect") : "");

        const key = document.createElement("span");
        key.className = "slide-option-key";
        key.textContent = String.fromCharCode(65 + index);

        const text = document.createElement("span");
        text.textContent = option;

        if (isCorrect) {
          const tick = document.createElement("span");
          tick.className = "slide-option-tick";
          tick.textContent = "\u2713";
          row.appendChild(key);
          row.appendChild(text);
          row.appendChild(tick);
        } else {
          row.appendChild(key);
          row.appendChild(text);
        }
        dom.previewOptions.appendChild(row);
      });

    } else if (normalizedType === "matching") {
      const pairs = Array.isArray(matchingPairs)
        ? matchingPairs.filter(function (p) { return p.left || p.right; })
        : [];
      if (!pairs.length) {
        dom.previewOptions.style.display = "none";
        return;
      }
      dom.previewOptions.style.display = "";
      dom.previewOptions.classList.add("slide-options-matching");

      pairs.forEach(function (pair) {
        const row = document.createElement("div");
        row.className = "slide-option slide-option-pair";

        const left = document.createElement("span");
        left.className = "slide-option-pair-left";
        left.textContent = pair.left || "";

        const arrow = document.createElement("span");
        arrow.className = "slide-option-pair-arrow";
        arrow.textContent = "→";

        const right = document.createElement("span");
        right.className = "slide-option-pair-right";
        right.textContent = pair.right || "";

        row.appendChild(left);
        row.appendChild(arrow);
        row.appendChild(right);
        dom.previewOptions.appendChild(row);
      });

    } else if (normalizedType === "ordering") {
      const items = Array.isArray(orderingItems) ? orderingItems.filter(Boolean) : [];
      if (!items.length) {
        dom.previewOptions.style.display = "none";
        return;
      }
      dom.previewOptions.style.display = "";
      // Shuffle a copy so the preview shows scrambled order (correct order stays in the form)
      // Re-shuffle until the result is guaranteed to differ from the original order
      var shuffled;
      var attempts = 0;
      do {
        shuffled = items.slice();
        for (var i = shuffled.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
        }
        attempts++;
      } while (
        attempts < 10 &&
        shuffled.every(function (v, idx) { return v === items[idx]; })
      );
      shuffled.forEach(function (item, index) {
        const row = document.createElement("div");
        row.className = "slide-option";

        const key = document.createElement("span");
        key.className = "slide-option-key";
        key.textContent = String(index + 1);

        const text = document.createElement("span");
        text.textContent = item;

        row.appendChild(key);
        row.appendChild(text);
        dom.previewOptions.appendChild(row);
      });

    } else if (normalizedType === "feud-question") {
      var feudArr = Array.isArray(feudAnswers) ? feudAnswers : [];
      var filledOrder = getFeudFilledRevealOrder(getFeudSlots8(feudArr));
      if (_feudRevealCount > filledOrder.length) {
        _feudRevealCount = filledOrder.length;
      }
      dom.previewOptions.style.display = "";
      renderFeudAnswerGrid(feudArr, isReveal);
      _syncFeudRevealButtons();
      return;

    } else if (normalizedType === "display") {
      const text = String(answerText || "").trim();
      if (!text) {
        dom.previewOptions.style.display = "none";
        return;
      }
      dom.previewOptions.style.display = "";
      dom.previewOptions.classList.add("slide-options-display");
      const body = document.createElement("div");
      body.className = "slide-display-content";

      function stripLeadingBullet(line) {
        const c = line.charAt(0);
        if (c === "\u2022" || c === "\u2023" || c === "•" || c === "*") {
          return line.substring(1).trim();
        }
        return line;
      }

      function appendBulletRow(target, line, scoringClass) {
        const item = document.createElement("div");
        const lineText = stripLeadingBullet(line);
        item.className = "slide-rules-item" + (scoringClass ? " " + scoringClass : "");
        const c0 = line.charAt(0);
        const hasBullet = c0 === "\u2022" || c0 === "\u2023" || c0 === "•" || c0 === "*";
        if (hasBullet) {
          const bullet = document.createElement("span");
          bullet.className = "slide-rules-bullet";
          bullet.textContent = "\u2022";
          const span = document.createElement("span");
          span.className = "slide-rules-text";
          span.textContent = lineText;
          item.appendChild(bullet);
          item.appendChild(span);
        } else {
          item.textContent = line;
        }
        target.appendChild(item);
      }

      const lines = text.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
      if (lines.length > 1) {
        const bodyLines = [];
        const scoringLines = [];
        lines.forEach(function (line) {
          const plain = stripLeadingBullet(line);
          if (/^\s*Scoring\s*:/i.test(plain)) {
            scoringLines.push(line);
          } else {
            bodyLines.push(line);
          }
        });

        const grid = document.createElement("div");
        grid.className = "slide-rules-grid";
        bodyLines.forEach(function (line) {
          appendBulletRow(grid, line, "");
        });
        if (bodyLines.length) {
          body.appendChild(grid);
        }

        if (scoringLines.length) {
          const footer = document.createElement("div");
          footer.className = "slide-rules-scoring";
          scoringLines.forEach(function (line) {
            appendBulletRow(footer, line, "slide-rules-item--scoring");
          });
          body.appendChild(footer);
        }
      } else {
        body.textContent = text;
      }

      dom.previewOptions.appendChild(body);
    } else {
      dom.previewOptions.style.display = "none";
    }
  }

  function renderAnswer(text, questionType) {
    if (!dom) return;
    var parts = getAnswerPreviewParts();
    if (!parts.value) return;
    if (parts.label) parts.label.textContent = "Answer";
    parts.value.textContent = text || "Answer";
    // For MC and display/info slides, answer panel should stay hidden.
    var isMC = String(questionType || "").trim().toLowerCase() === "multiple-choice";
    var isDisplay = String(questionType || "").trim().toLowerCase() === "display";
    if (parts.wrap) {
      parts.wrap.setAttribute("data-hide-for-mc", isMC ? "true" : "false");
      parts.wrap.setAttribute("data-hide-always", isDisplay ? "true" : "false");
    }
  }

  function renderNotes(text) {
    if (!dom || !dom.previewNotes) return;
    // Host notes are for the form only — keep them off the slide preview UI.
    dom.previewNotes.textContent = "";
    dom.previewNotes.style.display = "none";
  }

  function renderMeta(mode, data) {
    if (!dom || !dom.previewStateMeta) return;

    const stateLabel = data && data.stateLabel
      ? data.stateLabel
      : (mode === "reveal" ? "Reveal Mode" : "Live Question");

    const themeStyle = data && data.block && data.block.themeStyle
      ? data.block.themeStyle
      : "Standard Trivia";

    dom.previewStateMeta.innerHTML = "";

    const stateEl = document.createElement("span");
    stateEl.textContent = "Slide State: " + stateLabel;

    const themeEl = document.createElement("span");
    themeEl.textContent = "Theme: " + themeStyle;

    dom.previewStateMeta.appendChild(stateEl);
    dom.previewStateMeta.appendChild(themeEl);
  }

  function syncAnswerPreviewToMode(mode) {
    if (!dom) return;
    var parts = getAnswerPreviewParts();
    if (!parts.wrap) return;

    const m = String(mode || "live").toLowerCase();
    const hideForMC = parts.wrap.getAttribute("data-hide-for-mc") === "true";
    const hideAlways = parts.wrap.getAttribute("data-hide-always") === "true";

    if (m === "reveal" && !hideForMC && !hideAlways) {
      parts.wrap.style.display = "";
      if (parts.label) parts.label.textContent = "Answer";
    } else {
      parts.wrap.style.display = "none";
    }
  }

  function syncRevealToolbarToMode(mode) {
    if (!dom) return;
    const m = String(mode || "live").toLowerCase();
    var isDisplay = _lastRenderedQuestionType === "display";
    var isFeud    = _lastRenderedQuestionType === "feud-question";

    var feudNextBtn = document.getElementById("feud-reveal-next-btn");
    var feudPrevBtn = document.getElementById("feud-hide-prev-btn");

    // Feud mode: show feud controls, hide the generic Reveal Answer button
    if (isFeud) {
      if (dom.previewRevealBtn) dom.previewRevealBtn.style.display = "none";
      if (feudNextBtn) feudNextBtn.style.display = "";
      if (feudPrevBtn) feudPrevBtn.style.display = "";
      // Sync disabled state based on current reveal count
      _syncFeudRevealButtons();
      return;
    }

    // Non-feud: hide feud controls
    if (feudNextBtn) feudNextBtn.style.display = "none";
    if (feudPrevBtn) feudPrevBtn.style.display = "none";

    if (!dom.previewRevealBtn) return;
    dom.previewRevealBtn.style.display = isDisplay ? "none" : "";
    if (isDisplay) return;
    dom.previewRevealBtn.disabled = false;
    dom.previewRevealBtn.style.opacity = "";
    dom.previewRevealBtn.style.cursor = "";
    if (m === "reveal") {
      dom.previewRevealBtn.textContent = "\u2190 Back to Question";
      dom.previewRevealBtn.classList.remove("btn-primary");
      dom.previewRevealBtn.classList.add("btn-secondary");
    } else {
      dom.previewRevealBtn.textContent = "Reveal Answer";
      dom.previewRevealBtn.classList.remove("btn-secondary");
      dom.previewRevealBtn.classList.add("btn-primary");
    }
  }

  function updateRevealVisibility() {
    if (!dom) return;
    var mode = getMode();
    syncAnswerPreviewToMode(mode);
    syncRevealToolbarToMode(mode);
  }

  function updateToolbarState() {
    if (!dom) return;

    if (dom.previewPrevBtn) {
      dom.previewPrevBtn.setAttribute("aria-label", "Preview previous mode");
    }

    if (dom.previewNextBtn) {
      dom.previewNextBtn.setAttribute("aria-label", "Preview next mode");
    }

    if (dom.previewRevealBtn) {
      dom.previewRevealBtn.setAttribute("aria-label", "Switch preview to reveal mode");
    }
  }

  function applyThemeClass(themeStyle) {
    if (!dom || !dom.previewStage) return;

    dom.previewStage.classList.remove(
      "theme-standard-trivia",
      "theme-visual-art-reveal",
      "theme-picture-round",
      "theme-fast-answer",
      "theme-final-question"
    );

    const cls = "theme-" + slugify(themeStyle || "standard-trivia");
    dom.previewStage.classList.add(cls);
  }

  function showMessage(message) {
    if (!dom || !dom.previewQuestion) return;
    dom.previewQuestion.textContent = message || "Nothing selected.";
  }

  function clearMessage() {
    if (!dom || !dom.previewHelperCard) return;
    // no-op for now; reserved for later helper updates
  }

  function normalizeFormData(formData) {
    const source = formData || {};
    const show = source.show || {};
    const block = source.block || {};

    return {
      show: {
        title: stringOr(show.title, ""),
        dateLabel: stringOr(show.dateLabel, ""),
        status: stringOr(show.status, "draft"),
        showType: stringOr(show.showType, "classic-trivia"),
      },
      block: {
        type: stringOr(block.type, "single-question"),
        questionType: stringOr(block.questionType, "multiple-choice"),
        roundName: stringOr(block.roundName, "Round 1"),
        categoryName: stringOr(block.categoryName, ""),
        questionText: stringOr(block.questionText, ""),
        answerText: stringOr(block.answerText, ""),
        questionNotes: stringOr(block.questionNotes, ""),
        options: normalizeOptions(block.options),
        matchingPairs: Array.isArray(block.matchingPairs) ? block.matchingPairs : [],
        orderingItems: Array.isArray(block.orderingItems) ? block.orderingItems : [],
        feudAnswers: Array.isArray(block.feudAnswers) ? block.feudAnswers : [],
        imageUrl: stringOr(block.imageUrl, ""),
        audioUrl: stringOr(block.audioUrl, ""),
        themeStyle: stringOr(block.themeStyle, "Standard Trivia"),
        fontSizeMode: stringOr(block.fontSizeMode, "Auto Fit"),
        questionAlign: stringOr(block.questionAlign, "left"),
        questionFontScale: typeof block.questionFontScale === "number" ? block.questionFontScale : 1.0,
      },
    };
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

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "standard-trivia";
  }

  function stringOr(value, fallback) {
    return value == null ? fallback : String(value);
  }
})();