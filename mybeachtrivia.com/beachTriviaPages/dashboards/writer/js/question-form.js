// mybeachtrivia.com/beachTriviaPages/dashboards/writer/js/question-form.js
// Writer question form helpers

(function () {
  "use strict";

  const QUESTION_FORM = {
    init,
    getFormData,
    setFormData,
    resetForm,
    validateForDraft,
    validateForPublish,
    syncQuestionTypeUI,
    syncOptionCountToRows,
  };

  window.WriterQuestionForm = QUESTION_FORM;

  const DEFAULTS = {
    blockType: "single-question",
    questionType: "short-response",
    roundName: "",
    categoryName: "",
    questionText: "",
    answerText: "",
    questionNotes: "",
    optionCount: 4,
    options: ["", "", "", ""],
    correctOptionIndex: null,
    matchingPairs: [],
    orderingItems: [],
    feudAnswers: [],
    imageUrl: "",
    audioUrl: "",
    themeStyle: "Standard Trivia",
    fontSizeMode: "Auto Fit",
  };

  const FEUD_MAX_ANSWERS = 8;
  const FEUD_MIN_ANSWERS = 3;

  let dom = null;

  // Formatting state
  let questionAlign = "left";
  let questionFontScaleIdx = 3;
  const FONT_STEPS = [0.55, 0.7, 0.85, 1.0, 1.2, 1.45, 1.75];

  // Which MC option index is marked correct (null = none selected)
  let correctOptionIndex = null;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  // ─── Init ──────────────────────────────────────────────────────

  function init() {
    dom = {
      blockType: $("#block-type"),
      questionType: $("#question-type"),
      roundName: $("#round-name"),
      categoryName: $("#category-name"),
      questionText: $("#question-text"),
      answerText: $("#answer-text"),
      questionNotes: $("#question-notes"),
      optionCount: $("#option-count"),
      optionList: $("#option-list"),
      addOptionBtn: $("#add-option-btn"),
      answerTypeMC: $("#answer-type-mc"),
      answerTypeShort: $("#answer-type-short"),
      answerTypeMatching: $("#answer-type-matching"),
      answerTypeOrdering: $("#answer-type-ordering"),
      answerTypeFeud: $("#answer-type-feud"),
      matchingPairsList: $("#matching-pairs-list"),
      orderingItemsList: $("#ordering-items-list"),
      feudAnswersList: $("#feud-answers-list"),
      addPairBtn: $("#add-pair-btn"),
      addOrderingItemBtn: $("#add-ordering-item-btn"),
      addFeudAnswerBtn: $("#add-feud-answer-btn"),
      answerTypeImageUrl: $("#answer-type-image-url"),
      answerTypeAudioUrl: $("#answer-type-audio-url"),
      questionImageUrl: $("#question-image-url"),
      questionAudioUrl: $("#question-audio-url"),
      themeStyle: $("#theme-style"),
      fontSizeMode: $("#font-size-mode"),
      showTitle: $("#show-title"),
      showDate: $("#show-date"),
      showStatus: $("#show-status"),
      showType: $("#show-type"),
      saveBlockButtons: $$('[data-writer-action="save-block"], .inline-actions .btn'),
      toolbarButtons: $$('.toolbar [data-format]'),
    };

    bindEvents();
    syncQuestionTypeUI();
    syncOptionCountToRows();
    initMatchingPairs();
    initOrderingItems();
    initFeudAnswers();
    applyAlignToEditor();
    applyFontScaleToEditor();
    updateToolbarActiveStates();
    emitChange("init");
  }

  // ─── Event binding ─────────────────────────────────────────────

  function bindEvents() {
    if (!dom) return;

    if (dom.questionType) {
      dom.questionType.addEventListener("change", function () {
        syncQuestionTypeUI();
        emitChange("question-type-change");
      });
    }

    if (dom.optionCount) {
      dom.optionCount.addEventListener("change", function () {
        syncOptionCountToRows();
        emitChange("option-count-change");
      });
    }

    if (dom.addOptionBtn) {
      dom.addOptionBtn.addEventListener("click", function () {
        addOptionRow("");
        syncOptionCountSelectToRowLength();
        updateOptionLetters();
        emitChange("option-added");
      });
    }

    if (dom.optionList) {
      dom.optionList.addEventListener("click", onOptionListClick);
      dom.optionList.addEventListener("input", function () {
        emitChange("option-input");
      });
    }

    if (dom.addPairBtn) {
      dom.addPairBtn.addEventListener("click", function () {
        addMatchingPairRow("", "");
        emitChange("pair-added");
      });
    }

    if (dom.addOrderingItemBtn) {
      dom.addOrderingItemBtn.addEventListener("click", function () {
        addOrderingItemRow("");
        emitChange("ordering-item-added");
      });
    }

    if (dom.addFeudAnswerBtn) {
      dom.addFeudAnswerBtn.addEventListener("click", function () {
        var rows = getFeudAnswerRows();
        if (rows.length >= FEUD_MAX_ANSWERS) return;
        addFeudAnswerRow("");
        updateFeudAnswerBadges();
        emitChange("feud-answer-added");
      });
    }

    if (dom.feudAnswersList) {
      dom.feudAnswersList.addEventListener("click", onFeudAnswerListClick);
      dom.feudAnswersList.addEventListener("input", function () {
        emitChange("feud-answer-input");
      });
    }

    [
      dom.blockType,
      dom.roundName,
      dom.categoryName,
      dom.questionText,
      dom.answerText,
      dom.questionNotes,
      dom.questionImageUrl,
      dom.questionAudioUrl,
      dom.themeStyle,
      dom.fontSizeMode,
      dom.showTitle,
      dom.showDate,
      dom.showStatus,
      dom.showType,
    ].forEach(function (el) {
      if (!el) return;
      el.addEventListener("input", function () {
        emitChange("form-input");
      });
      el.addEventListener("change", function () {
        emitChange("form-change");
      });
    });

    bindFormattingToolbar();
  }

  function bindFormattingToolbar() {
    if (!dom || !dom.toolbarButtons) return;
    dom.toolbarButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        handleFormat(btn.getAttribute("data-format"));
      });
    });
  }

  // ─── Formatting toolbar ────────────────────────────────────────

  function handleFormat(fmt) {
    if (fmt === "bold") {
      applyExecCommand("bold");
    } else if (fmt === "italic") {
      applyExecCommand("italic");
    } else if (fmt === "underline") {
      applyExecCommand("underline");
    } else if (fmt === "align-left") {
      questionAlign = "left";
      applyAlignToEditor();
      updateToolbarActiveStates();
    } else if (fmt === "align-center") {
      questionAlign = "center";
      applyAlignToEditor();
      updateToolbarActiveStates();
    } else if (fmt === "align-right") {
      questionAlign = "right";
      applyAlignToEditor();
      updateToolbarActiveStates();
    } else if (fmt === "font-decrease") {
      if (questionFontScaleIdx > 0) questionFontScaleIdx--;
      applyFontScaleToEditor();
    } else if (fmt === "font-increase") {
      if (questionFontScaleIdx < FONT_STEPS.length - 1) questionFontScaleIdx++;
      applyFontScaleToEditor();
    }
    emitChange("formatting");
  }

  function applyExecCommand(cmd) {
    if (dom && dom.questionText) dom.questionText.focus();
    document.execCommand(cmd, false, null);
  }

  function applyAlignToEditor() {
    if (!dom || !dom.questionText) return;
    dom.questionText.style.textAlign = questionAlign === "center" ? "center" : questionAlign === "right" ? "right" : "";
  }

  function applyFontScaleToEditor() {
    if (!dom || !dom.questionText) return;
    var scale = FONT_STEPS[questionFontScaleIdx] || 1.0;
    dom.questionText.style.fontSize = String(scale) + "em";
  }

  function updateToolbarActiveStates() {
    if (!dom || !dom.toolbarButtons) return;
    dom.toolbarButtons.forEach(function (btn) {
      var fmt = btn.getAttribute("data-format");
      if (fmt === "align-left") {
        btn.classList.toggle("active", questionAlign === "left");
      } else if (fmt === "align-center") {
        btn.classList.toggle("active", questionAlign === "center");
      } else if (fmt === "align-right") {
        btn.classList.toggle("active", questionAlign === "right");
      }
    });
  }

  // ─── Question type UI ──────────────────────────────────────────

  function syncQuestionTypeUI() {
    var type = getQuestionType();
    var isMC       = type === "multiple-choice";
    var isShort    = type === "short-response" || type === "image-question" || type === "audio-question";
    var isMatching = type === "matching";
    var isOrdering = type === "ordering";
    var isFeud     = type === "feud-question";

    if (dom.answerTypeMC)       dom.answerTypeMC.style.display       = isMC       ? "" : "none";
    if (dom.answerTypeShort)    dom.answerTypeShort.style.display    = isShort    ? "" : "none";
    if (dom.answerTypeMatching) dom.answerTypeMatching.style.display = isMatching ? "" : "none";
    if (dom.answerTypeOrdering) dom.answerTypeOrdering.style.display = isOrdering ? "" : "none";
    if (dom.answerTypeFeud)     dom.answerTypeFeud.style.display     = isFeud     ? "" : "none";
    if (dom.answerTypeImageUrl) dom.answerTypeImageUrl.style.display = (type === "image-question") ? "" : "none";
    if (dom.answerTypeAudioUrl) dom.answerTypeAudioUrl.style.display = (type === "audio-question") ? "" : "none";

    if (isFeud && dom.addFeudAnswerBtn) {
      dom.addFeudAnswerBtn.disabled = getFeudAnswerRows().length >= FEUD_MAX_ANSWERS;
    }
  }

  // ─── Multiple choice options ───────────────────────────────────

  function onOptionListClick(event) {
    // Correct-answer toggle
    var correctBtn = event.target.closest(".correct-option-btn");
    if (correctBtn) {
      var row = correctBtn.closest(".option-row");
      if (row) setCorrectOption(row);
      return;
    }

    // Remove button
    var removeBtn = event.target.closest(".remove-option");
    if (!removeBtn || !dom || !dom.optionList) return;

    var rows = getOptionRows();
    if (rows.length <= 2) {
      emitValidation("At least 2 answer options are required for multiple choice.", "warning");
      return;
    }

    var row = removeBtn.closest(".option-row");
    if (row) {
      var removedIdx = getOptionRows().indexOf(row);
      row.remove();
      if (correctOptionIndex === removedIdx) {
        correctOptionIndex = null;
      } else if (correctOptionIndex !== null && removedIdx < correctOptionIndex) {
        correctOptionIndex--;
      }
      syncOptionCountSelectToRowLength();
      updateOptionLetters();
      emitChange("option-removed");
    }
  }

  function setCorrectOption(targetRow) {
    if (!dom || !dom.optionList) return;
    getOptionRows().forEach(function (row, idx) {
      var btn = row.querySelector(".correct-option-btn");
      var isCorrect = row === targetRow;
      if (btn) btn.classList.toggle("selected", isCorrect);
      row.classList.toggle("is-correct", isCorrect);
      if (isCorrect) correctOptionIndex = idx;
    });
    emitChange("correct-option-change");
  }

  function restoreCorrectOptionUI() {
    if (!dom || !dom.optionList) return;
    getOptionRows().forEach(function (row, idx) {
      var btn = row.querySelector(".correct-option-btn");
      var isCorrect = idx === correctOptionIndex;
      if (btn) btn.classList.toggle("selected", isCorrect);
      row.classList.toggle("is-correct", isCorrect);
    });
  }

  function getOptionRows() {
    if (!dom || !dom.optionList) return [];
    return $$(".option-row", dom.optionList);
  }

  function getOptionInputs() {
    return getOptionRows()
      .map(function (row) {
        return row.querySelector('input[type="text"]');
      })
      .filter(Boolean);
  }

  function syncOptionCountToRows() {
    if (!dom || !dom.optionCount || !dom.optionList) return;

    let target = parseInt(dom.optionCount.value, 10);
    if (!Number.isFinite(target)) target = DEFAULTS.optionCount;
    target = Math.max(2, Math.min(10, target));

    while (getOptionRows().length < target) {
      addOptionRow("");
    }
    while (getOptionRows().length > target) {
      const last = dom.optionList.lastElementChild;
      if (!last) break;
      last.remove();
    }
    updateOptionLetters();
  }

  function syncOptionCountSelectToRowLength() {
    if (!dom || !dom.optionCount) return;
    const count = getOptionRows().length;
    ensureOptionCountOptionExists(count);
    dom.optionCount.value = String(count);
  }

  function ensureOptionCountOptionExists(count) {
    if (!dom || !dom.optionCount) return;
    const exists = Array.from(dom.optionCount.options).some(function (opt) {
      return parseInt(opt.value, 10) === count;
    });
    if (!exists) {
      const option = document.createElement("option");
      option.value = String(count);
      option.textContent = String(count);
      dom.optionCount.appendChild(option);
    }
  }

  function addOptionRow(value) {
    if (!dom || !dom.optionList) return null;

    const row = document.createElement("div");
    row.className = "option-row";

    const correctBtn = document.createElement("button");
    correctBtn.type = "button";
    correctBtn.className = "correct-option-btn";
    correctBtn.title = "Mark as correct answer";
    correctBtn.textContent = "✓";

    const bubble = document.createElement("span");
    bubble.className = "option-index";
    bubble.textContent = "?";

    const input = document.createElement("input");
    input.type = "text";
    input.value = value || "";
    input.placeholder = "Enter answer option";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-option";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", "Remove option");

    row.appendChild(correctBtn);
    row.appendChild(bubble);
    row.appendChild(input);
    row.appendChild(removeBtn);

    dom.optionList.appendChild(row);
    return row;
  }

  function updateOptionLetters() {
    getOptionRows().forEach(function (row, idx) {
      const letter = String.fromCharCode(65 + idx);
      const bubble = row.querySelector(".option-index");
      const input = row.querySelector('input[type="text"]');
      const removeBtn = row.querySelector(".remove-option");
      const correctBtn = row.querySelector(".correct-option-btn");

      if (bubble) bubble.textContent = letter;
      if (input) input.setAttribute("aria-label", "Answer option " + letter);
      if (removeBtn) removeBtn.setAttribute("aria-label", "Remove option " + letter);
      if (correctBtn) correctBtn.setAttribute("aria-label", "Mark option " + letter + " as correct");
    });
  }

  function setOptions(options) {
    if (!dom || !dom.optionList || !dom.optionCount) return;

    dom.optionList.innerHTML = "";
    const normalized = Array.isArray(options) && options.length
      ? options.slice(0, 10)
      : DEFAULTS.options.slice();

    ensureOptionCountOptionExists(normalized.length);
    dom.optionCount.value = String(Math.max(2, normalized.length));

    normalized.forEach(function (value) {
      addOptionRow(value);
    });

    while (getOptionRows().length < 2) {
      addOptionRow("");
    }

    updateOptionLetters();
  }

  // ─── Matching pairs ────────────────────────────────────────────

  function initMatchingPairs() {
    if (!dom || !dom.matchingPairsList || dom.matchingPairsList.children.length > 0) return;
    addMatchingPairRow("", "");
    addMatchingPairRow("", "");
  }

  function addMatchingPairRow(left, right) {
    if (!dom || !dom.matchingPairsList) return null;

    const row = document.createElement("div");
    row.className = "matching-pair-row";

    const leftInput = document.createElement("input");
    leftInput.type = "text";
    leftInput.placeholder = "Left item";
    leftInput.value = left || "";
    leftInput.addEventListener("input", function () { emitChange("matching-input"); });

    const arrow = document.createElement("span");
    arrow.className = "pair-arrow";
    arrow.textContent = "→";

    const rightInput = document.createElement("input");
    rightInput.type = "text";
    rightInput.placeholder = "Right item";
    rightInput.value = right || "";
    rightInput.addEventListener("input", function () { emitChange("matching-input"); });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-pair";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", "Remove pair");
    removeBtn.addEventListener("click", function () {
      row.remove();
      emitChange("pair-removed");
    });

    row.appendChild(leftInput);
    row.appendChild(arrow);
    row.appendChild(rightInput);
    row.appendChild(removeBtn);

    dom.matchingPairsList.appendChild(row);
    return row;
  }

  function serializeMatchingPairs() {
    if (!dom || !dom.matchingPairsList) return [];
    return Array.from(dom.matchingPairsList.querySelectorAll(".matching-pair-row"))
      .map(function (row) {
        const inputs = row.querySelectorAll("input");
        return {
          left: String((inputs[0] && inputs[0].value) || "").trim(),
          right: String((inputs[1] && inputs[1].value) || "").trim(),
        };
      })
      .filter(function (pair) { return pair.left || pair.right; });
  }

  // ─── Ordering items ────────────────────────────────────────────

  function initOrderingItems() {
    if (!dom || !dom.orderingItemsList || dom.orderingItemsList.children.length > 0) return;
    addOrderingItemRow("");
    addOrderingItemRow("");
    addOrderingItemRow("");
  }

  function addOrderingItemRow(value) {
    if (!dom || !dom.orderingItemsList) return null;

    const row = document.createElement("div");
    row.className = "ordering-item-row";

    const num = document.createElement("span");
    num.className = "ordering-item-num";
    num.textContent = String(dom.orderingItemsList.children.length + 1);

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Item in correct order";
    input.value = value || "";
    input.addEventListener("input", function () { emitChange("ordering-input"); });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-ordering-item";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", "Remove item");
    removeBtn.addEventListener("click", function () {
      row.remove();
      updateOrderingItemNumbers();
      emitChange("ordering-item-removed");
    });

    row.appendChild(num);
    row.appendChild(input);
    row.appendChild(removeBtn);

    dom.orderingItemsList.appendChild(row);
    return row;
  }

  function updateOrderingItemNumbers() {
    if (!dom || !dom.orderingItemsList) return;
    Array.from(dom.orderingItemsList.querySelectorAll(".ordering-item-row")).forEach(function (row, idx) {
      const num = row.querySelector(".ordering-item-num");
      if (num) num.textContent = String(idx + 1);
    });
  }

  function serializeOrderingItems() {
    if (!dom || !dom.orderingItemsList) return [];
    return Array.from(dom.orderingItemsList.querySelectorAll(".ordering-item-row input"))
      .map(function (input) { return String(input.value || "").trim(); })
      .filter(function (v) { return v.length > 0; });
  }

  // ─── Feud answers ──────────────────────────────────────────────

  function initFeudAnswers() {
    if (!dom || !dom.feudAnswersList || dom.feudAnswersList.children.length > 0) return;
    addFeudAnswerRow("");
    addFeudAnswerRow("");
    addFeudAnswerRow("");
  }

  function addFeudAnswerRow(text) {
    if (!dom || !dom.feudAnswersList) return null;
    var rows = getFeudAnswerRows();
    if (rows.length >= FEUD_MAX_ANSWERS) return null;

    var rank = rows.length; // 0-indexed, so points = 8 - rank
    var pts  = 8 - rank;

    var row = document.createElement("div");
    row.className = "feud-answer-row";

    var rankSpan = document.createElement("span");
    rankSpan.className = "feud-answer-rank";
    rankSpan.textContent = String(rank + 1);

    var input = document.createElement("input");
    input.type = "text";
    input.value = text || "";
    input.placeholder = "Survey answer " + String(rank + 1);
    input.className = "feud-answer-input";

    var ptsBadge = document.createElement("span");
    ptsBadge.className = "feud-answer-pts";
    ptsBadge.textContent = String(pts) + " pts";

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-feud-answer";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", "Remove answer");

    row.appendChild(rankSpan);
    row.appendChild(input);
    row.appendChild(ptsBadge);
    row.appendChild(removeBtn);

    dom.feudAnswersList.appendChild(row);
    updateFeudAnswerBadges();
    if (dom.addFeudAnswerBtn) {
      dom.addFeudAnswerBtn.disabled = getFeudAnswerRows().length >= FEUD_MAX_ANSWERS;
    }
    return row;
  }

  function getFeudAnswerRows() {
    if (!dom || !dom.feudAnswersList) return [];
    return Array.from(dom.feudAnswersList.querySelectorAll(".feud-answer-row"));
  }

  function updateFeudAnswerBadges() {
    getFeudAnswerRows().forEach(function (row, i) {
      var rankEl = row.querySelector(".feud-answer-rank");
      var ptsEl  = row.querySelector(".feud-answer-pts");
      var input  = row.querySelector(".feud-answer-input");
      if (rankEl) rankEl.textContent = String(i + 1);
      if (ptsEl)  ptsEl.textContent  = String(8 - i) + " pts";
      if (input)  input.placeholder  = "Survey answer " + String(i + 1);
    });
  }

  function onFeudAnswerListClick(event) {
    var removeBtn = event.target.closest(".remove-feud-answer");
    if (!removeBtn || !dom || !dom.feudAnswersList) return;
    var rows = getFeudAnswerRows();
    if (rows.length <= FEUD_MIN_ANSWERS) return;
    var row = removeBtn.closest(".feud-answer-row");
    if (row) {
      row.remove();
      updateFeudAnswerBadges();
      if (dom.addFeudAnswerBtn) {
        dom.addFeudAnswerBtn.disabled = getFeudAnswerRows().length >= FEUD_MAX_ANSWERS;
      }
      emitChange("feud-answer-removed");
    }
  }

  function serializeFeudAnswers() {
    return getFeudAnswerRows().map(function (row, i) {
      var input = row.querySelector(".feud-answer-input");
      return {
        text:   String((input && input.value) || "").trim(),
        points: 8 - i,
      };
    });
  }

  // ─── Answer text helper ────────────────────────────────────────

  function getAnswerText() {
    var type = getQuestionType();
    if (type === "multiple-choice") {
      if (correctOptionIndex !== null) {
        var inputs = getOptionInputs();
        var correct = inputs[correctOptionIndex];
        return correct ? String(correct.value || "").trim() : "";
      }
      return "";
    }
    if (dom && dom.answerText) {
      return getValue(dom.answerText, "");
    }
    return "";
  }

  // ─── Serialization ─────────────────────────────────────────────

  function serializeOptions() {
    return getOptionInputs().map(function (input) {
      return String(input.value || "").trim();
    });
  }

  function getFormData() {
    const options = serializeOptions();

    return {
      show: {
        title: getValue(dom && dom.showTitle, ""),
        dateLabel: getValue(dom && dom.showDate, ""),
        status: getValue(dom && dom.showStatus, "draft"),
        showType: getValue(dom && dom.showType, "classic-trivia"),
      },
      block: {
        type: getValue(dom && dom.blockType, DEFAULTS.blockType),
        questionType: getValue(dom && dom.questionType, DEFAULTS.questionType),
        roundName: getValue(dom && dom.roundName, DEFAULTS.roundName),
        categoryName: getValue(dom && dom.categoryName, DEFAULTS.categoryName),
        questionText: getValue(dom && dom.questionText, DEFAULTS.questionText),
        answerText: getAnswerText(),
        questionNotes: getValue(dom && dom.questionNotes, DEFAULTS.questionNotes),
        optionCount: options.length,
        options: options,
        correctOptionIndex: correctOptionIndex,
        matchingPairs: serializeMatchingPairs(),
        orderingItems: serializeOrderingItems(),
        feudAnswers: serializeFeudAnswers(),
        imageUrl: getValue(dom && dom.questionImageUrl, DEFAULTS.imageUrl),
        audioUrl: getValue(dom && dom.questionAudioUrl, DEFAULTS.audioUrl),
        themeStyle: getValue(dom && dom.themeStyle, DEFAULTS.themeStyle),
        fontSizeMode: getValue(dom && dom.fontSizeMode, DEFAULTS.fontSizeMode),
        questionAlign: questionAlign,
        questionFontScale: FONT_STEPS[questionFontScaleIdx],
      },
    };
  }

  function setFormData(data) {
    const show = (data && data.show) || {};
    const block = (data && data.block) || {};

    setValue(dom && dom.showTitle, show.title, DEFAULTS.showTitle);
    setValue(dom && dom.showDate, show.dateLabel, DEFAULTS.showDate);
    // Notify the date picker in app.js to sync its display from the restored value
    if (dom && dom.showDate) {
      dom.showDate.dispatchEvent(new Event("writer:date-set", { bubbles: false }));
    }
    setValue(dom && dom.showStatus, show.status, "draft");
    setValue(dom && dom.showType, show.showType, "classic-trivia");
    // Sync show-type toggle buttons
    if (dom && dom.showType) {
      var st = dom.showType.value || "classic-trivia";
      document.querySelectorAll(".show-type-btn").forEach(function (btn) {
        btn.classList.toggle("active", btn.getAttribute("data-show-type") === st);
      });
    }

    setValue(dom && dom.blockType, block.type, DEFAULTS.blockType);
    setValue(dom && dom.questionType, block.questionType, DEFAULTS.questionType);
    setValue(dom && dom.roundName, block.roundName, DEFAULTS.roundName);
    setValue(dom && dom.categoryName, block.categoryName, DEFAULTS.categoryName);
    setValue(dom && dom.questionText, block.questionText, DEFAULTS.questionText);
    setValue(dom && dom.answerText, block.answerText, DEFAULTS.answerText);
    setValue(dom && dom.questionNotes, block.questionNotes, DEFAULTS.questionNotes);
    setValue(dom && dom.questionImageUrl, block.imageUrl, DEFAULTS.imageUrl);
    setValue(dom && dom.questionAudioUrl, block.audioUrl, DEFAULTS.audioUrl);
    setValue(dom && dom.themeStyle, block.themeStyle, DEFAULTS.themeStyle);
    setValue(dom && dom.fontSizeMode, block.fontSizeMode, DEFAULTS.fontSizeMode);

    questionAlign = block.questionAlign === "center" ? "center" : block.questionAlign === "right" ? "right" : "left";

    var savedScale = typeof block.questionFontScale === "number" ? block.questionFontScale : 1.0;
    var closestIdx = 3;
    var closestDiff = Infinity;
    FONT_STEPS.forEach(function (step, idx) {
      var diff = Math.abs(step - savedScale);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIdx = idx;
      }
    });
    questionFontScaleIdx = closestIdx;

    correctOptionIndex = typeof block.correctOptionIndex === "number" ? block.correctOptionIndex : null;

    applyAlignToEditor();
    applyFontScaleToEditor();
    updateToolbarActiveStates();

    setOptions(Array.isArray(block.options) ? block.options : DEFAULTS.options);
    restoreCorrectOptionUI();

    // Restore matching pairs
    if (dom && dom.matchingPairsList) {
      dom.matchingPairsList.innerHTML = "";
      var pairs = Array.isArray(block.matchingPairs) && block.matchingPairs.length
        ? block.matchingPairs
        : [{ left: "", right: "" }, { left: "", right: "" }];
      pairs.forEach(function (pair) { addMatchingPairRow(pair.left || "", pair.right || ""); });
    }

    // Restore ordering items
    if (dom && dom.orderingItemsList) {
      dom.orderingItemsList.innerHTML = "";
      var items = Array.isArray(block.orderingItems) && block.orderingItems.length
        ? block.orderingItems
        : ["", "", ""];
      items.forEach(function (item) { addOrderingItemRow(item || ""); });
    }

    // Restore feud answers
    if (dom && dom.feudAnswersList) {
      dom.feudAnswersList.innerHTML = "";
      var feudItems = Array.isArray(block.feudAnswers) && block.feudAnswers.length
        ? block.feudAnswers
        : [{ text: "" }, { text: "" }, { text: "" }];
      feudItems.slice(0, FEUD_MAX_ANSWERS).forEach(function (a) {
        addFeudAnswerRow(a ? (a.text || "") : "");
      });
      while (getFeudAnswerRows().length < FEUD_MIN_ANSWERS) {
        addFeudAnswerRow("");
      }
      updateFeudAnswerBadges();
    }

    syncQuestionTypeUI();
    emitChange("set-form-data");
  }

  function resetForm() {
    correctOptionIndex = null;
    setFormData({
      show: {
        title: getValue(dom && dom.showTitle, ""),
        dateLabel: getValue(dom && dom.showDate, ""),
        status: getValue(dom && dom.showStatus, "draft"),
        showType: getValue(dom && dom.showType, "classic-trivia"),
      },
      block: {
        type: DEFAULTS.blockType,
        questionType: DEFAULTS.questionType,
        roundName: "Round 1",
        categoryName: "",
        questionText: "",
        answerText: "",
        questionNotes: "",
        options: DEFAULTS.options.slice(),
        correctOptionIndex: null,
        matchingPairs: [],
        orderingItems: [],
        feudAnswers: [],
        themeStyle: DEFAULTS.themeStyle,
        fontSizeMode: DEFAULTS.fontSizeMode,
        questionAlign: "left",
        questionFontScale: 1.0,
      },
    });
    emitChange("reset-form");
  }

  // ─── Validation ────────────────────────────────────────────────

  function validateForDraft() {
    const data = getFormData();
    const messages = [];

    if (!data.show.title.trim()) messages.push("Show title is still empty.");
    if (!data.block.type.trim()) messages.push("Block type is missing.");
    if (!data.block.questionType.trim()) messages.push("Question type is missing.");

    return { valid: true, messages: messages, severity: "info" };
  }

  function validateForPublish() {
    const data = getFormData();
    const errors = [];

    if (!data.show.title.trim()) errors.push("Show title is required.");
    if (!data.show.dateLabel.trim()) errors.push("Show date / label is required.");
    if (!data.block.type.trim()) errors.push("Block type is required.");
    if (!data.block.questionType.trim()) errors.push("Question type is required.");
    if (!data.block.roundName.trim()) errors.push("Round / section name is required.");
    if (!data.block.categoryName.trim()) errors.push("Category is required.");
    if (!getPlainText(dom && dom.questionText).trim()) errors.push("Question text is required.");

    var type = data.block.questionType;
    if (type === "multiple-choice") {
      if (data.block.options.length < 2) errors.push("Multiple choice questions need at least 2 options.");
      data.block.options.forEach(function (option, idx) {
        if (!String(option || "").trim()) {
          errors.push("Multiple choice option " + String.fromCharCode(65 + idx) + " is empty.");
        }
      });
      if (data.block.correctOptionIndex === null) errors.push("Please mark the correct answer option.");
    } else if (type === "matching") {
      if (data.block.matchingPairs.length < 2) errors.push("Matching questions need at least 2 pairs.");
    } else if (type === "ordering") {
      if (data.block.orderingItems.length < 2) errors.push("Ordering questions need at least 2 items.");
    } else {
      if (!data.block.answerText.trim()) errors.push("Answer text is required.");
    }

    return {
      valid: errors.length === 0,
      messages: errors,
      severity: errors.length ? "error" : "success",
    };
  }

  // ─── DOM helpers ───────────────────────────────────────────────

  function getQuestionType() {
    return (dom && dom.questionType && dom.questionType.value) || DEFAULTS.questionType;
  }

  function getValue(el, fallback) {
    if (!el) return fallback;
    if (typeof el.value === "string") return el.value;
    if (el.isContentEditable) return el.innerHTML || "";
    return fallback;
  }

  function getPlainText(el) {
    if (!el) return "";
    if (el.isContentEditable) return el.textContent || "";
    return typeof el.value === "string" ? el.value : "";
  }

  function setValue(el, value, fallback) {
    if (!el) return;
    var v = value != null ? String(value) : (fallback != null ? String(fallback) : "");
    if (typeof el.value === "string") {
      el.value = v;
    } else if (el.isContentEditable) {
      el.innerHTML = v;
    }
  }

  // ─── Events ────────────────────────────────────────────────────

  function emitChange(reason) {
    const detail = {
      reason: reason || "change",
      data: getFormData(),
    };
    document.dispatchEvent(new CustomEvent("writer:question-form-change", { detail: detail }));
  }

  function emitValidation(message, severity) {
    document.dispatchEvent(new CustomEvent("writer:question-form-message", {
      detail: { message: message, severity: severity || "info" },
    }));
  }

})();
