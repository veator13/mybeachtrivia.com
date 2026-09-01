// Shared slide model — one place that turns a published/draft show doc
// ({ show, blocks:[{block, slides:[…]}] }) into a flat list of normalized slide
// objects that BeachTriviaSlidePaint.paintSlide() can render.
//
// Was copy-pasted as `flattenSlides` in host-feud / host-mixed / host-themed-
// trivia / live-console (all near-identical). See SLIDE-RENDER-PLAN.md.
//
//   window.BeachTriviaSlideModel = {
//     DISPLAY_BLOCK_TYPES,
//     flattenShow(showDoc, { defaultTheme } = {}) -> slide[],
//     isTitleSlide(slide) -> bool,
//     slideRevealApplicable(slide) -> bool,   // can the host "Reveal" button do anything here
//   }
(function (global) {
  "use strict";

  // Block types that are display-only (no question / answer mechanic).
  var DISPLAY_BLOCK_TYPES = ["intro-slide", "info-slide", "round-start", "category-slide"];

  function isTitleSlide(slide) {
    if (!slide) return false;
    var kind = String(slide.kind || "").toLowerCase();
    var stateLabel = String(slide.stateLabel || "").toLowerCase();
    return kind === "title" || stateLabel.indexOf("title slide") !== -1;
  }

  function slideRevealApplicable(slide) {
    if (!slide) return false;
    if (isTitleSlide(slide)) return false;
    var blockType = slide.blockType || slide.kind || "";
    if (DISPLAY_BLOCK_TYPES.indexOf(blockType) !== -1) return false;
    if (String(slide.questionType || "").toLowerCase() === "display") return false;
    if (slide.alwaysReveal) return false;
    return true;
  }

  function num(v, fallback) {
    return typeof v === "number" && isFinite(v) ? v : fallback;
  }

  /**
   * @param {object} data      a publishedShows / showDrafts doc
   * @param {object} [opts]
   * @param {string} [opts.defaultTheme]  theme label when a slide/block has none
   * @returns {Array<object>}  normalized slides
   */
  function flattenShow(data, opts) {
    opts = opts || {};
    var defaultTheme = opts.defaultTheme || "Standard Trivia";
    var blocks = data && Array.isArray(data.blocks) ? data.blocks : [];
    var showTitle = (data && data.show && data.show.title) || "";
    var showDate = (data && data.show && data.show.dateLabel) || "";
    var out = [];

    blocks.forEach(function (entry) {
      var block = entry && entry.block;
      if (!block) return;
      var roundBadge = block.roundName || block.label || "";
      var blockSlides = Array.isArray(block.slides) ? block.slides : [];

      blockSlides.forEach(function (s) {
        // The writer emits a back-to-back live + reveal pair for the same
        // question (same prompt). Hosts advance with Prev/Next and use the
        // Reveal button, so collapse a `.reveal` that immediately follows its
        // matching `.live`. A standalone reveal pass (no preceding matching
        // live) is kept.
        var sk = String(s.stateKey || "");
        if (/\.reveal$/i.test(sk)) {
          var liveKey = sk.replace(/\.reveal$/i, ".live");
          if (out.length && String(out[out.length - 1].stateKey || "") === liveKey) {
            return;
          }
        }

        var isTitle = s.kind === "title" || s.type === "title" || block.type === "title";

        out.push({
          stateKey: s.stateKey || "",
          stateLabel: s.stateLabel || (isTitle ? "Title Slide" : ""),
          kind: s.kind || s.type || (block.type === "title" ? "title" : "question"),
          blockType: block.type || "",
          questionType: s.questionType || block.questionType || "multiple-choice",

          roundBadge: s.title || roundBadge,
          category:
            s.categoryName || s.category || block.categoryName ||
            (isTitle ? showDate : ""),
          question:
            s.prompt || s.question ||
            (isTitle ? showTitle : ""),
          questionAlign: s.questionAlign || block.questionAlign || "left",
          questionFontScale: num(s.questionFontScale, num(block.questionFontScale, 1.0)),

          options: Array.isArray(s.options) ? s.options.filter(Boolean) : [],
          matchingPairs: Array.isArray(s.matchingPairs) ? s.matchingPairs : [],
          orderingItems: Array.isArray(s.orderingItems) ? s.orderingItems : [],
          feudAnswers:
            Array.isArray(s.feudAnswers) ? s.feudAnswers :
            (Array.isArray(block.feudAnswers) ? block.feudAnswers : []),

          answer: s.answer || "",
          notes: s.notes || "",
          theme: s.themeStyle || block.themeStyle || defaultTheme,
          alwaysReveal: !!(
            s.answerVisibleByDefault ||
            s.kind === "summary" ||
            s.kind === "answers-summary"
          ),
        });
      });
    });

    return out;
  }

  global.BeachTriviaSlideModel = {
    DISPLAY_BLOCK_TYPES: DISPLAY_BLOCK_TYPES,
    flattenShow: flattenShow,
    isTitleSlide: isTitleSlide,
    slideRevealApplicable: slideRevealApplicable,
  };
})(typeof window !== "undefined" ? window : this);
