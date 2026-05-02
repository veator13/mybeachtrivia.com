// Emergency offline backup: published show → .pptx (browser, PptxGenJS).
// Expects global PptxGenJS from pptxgen.bundle.js.

(function (global) {
  "use strict";

  // ── Utilities ────────────────────────────────────────────────────────────────

  function normalizeOptionsRaw(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
    if (typeof raw === "object") {
      return ["A", "B", "C", "D", "E", "F", "G", "H"]
        .map(function (L) {
          var v = raw[L];
          return v ? L + ") " + String(v).trim() : "";
        })
        .filter(Boolean);
    }
    return [];
  }

  /**
   * Same rules as host consoles: drop duplicate *.reveal after matching *.live;
   * include feudAnswers for Feud / mixed shows.
   */
  function flattenSlidesForExport(data) {
    var blocks = Array.isArray(data.blocks) ? data.blocks : [];
    var slides = [];
    blocks.forEach(function (entry) {
      var block = entry && entry.block;
      if (!block) return;
      var roundBadge = block.roundName || block.label || "";
      (Array.isArray(block.slides) ? block.slides : []).forEach(function (s) {
        var sk = String(s.stateKey || "");
        if (/\.reveal$/i.test(sk)) {
          var liveKey = sk.replace(/\.reveal$/i, ".live");
          if (slides.length) {
            var prevKey = String(slides[slides.length - 1].stateKey || "");
            if (prevKey === liveKey) return;
          }
        }
        var isTitle = s.kind === "title" || s.type === "title" || block.type === "title";
        var showTitle = (data.show && data.show.title) || "";
        var showDate = (data.show && data.show.dateLabel) || "";
        var slideObj = {
          stateKey: sk,
          stateLabel: s.stateLabel || (isTitle ? "Title Slide" : ""),
          roundBadge: s.title || roundBadge,
          category: s.categoryName || s.category || block.categoryName || (isTitle ? showDate : ""),
          question: s.prompt || s.question || (isTitle ? showTitle : ""),
          options: normalizeOptionsRaw(s.options),
          matchingPairs: Array.isArray(s.matchingPairs) ? s.matchingPairs : [],
          orderingItems: Array.isArray(s.orderingItems) ? s.orderingItems : [],
          feudAnswers: Array.isArray(s.feudAnswers)
            ? s.feudAnswers
            : Array.isArray(block.feudAnswers)
              ? block.feudAnswers
              : [],
          answer: s.answer || "",
          notes: s.notes || "",
          alwaysReveal: !!(s.answerVisibleByDefault || s.kind === "summary" || s.kind === "answers-summary"),
          kind: s.kind || s.type || (block.type === "title" ? "title" : "question"),
          blockType: block.type || "",
          questionType: s.questionType || block.questionType || "",
        };
        if (!slideObj.options.length && s.options && typeof s.options === "object" && !Array.isArray(s.options)) {
          slideObj.options = normalizeOptionsRaw(s.options);
        }
        slides.push(slideObj);
      });
    });
    return slides;
  }

  function stripHtml(html) {
    if (!html) return "";
    var d = typeof document !== "undefined" ? document.createElement("div") : null;
    if (!d) return String(html).replace(/<[^>]+>/g, " ").trim();
    d.innerHTML = String(html);
    return (d.textContent || d.innerText || "").trim();
  }

  function isFeudSlide(slide) {
    return String(slide.questionType || "").toLowerCase() === "feud-question";
  }

  function sanitizeFilename(name) {
    var s = String(name || "show").replace(/[\\/:*?"<>|]+/g, "-").trim();
    return s.slice(0, 120) || "show";
  }

  function getPptxCtor() {
    return global.PptxGenJS || global.pptxgen;
  }

  // ── Design tokens (mirrors preview-stage.css) ────────────────────────────────

  var C = {
    bg:              "0d1a2f",
    accent:          "0ea5e9",

    badge_bg:        "1e3566",
    badge_text:      "dbeafe",
    badge_line:      "2563eb",

    cat:             "93c5fd",
    q:               "f8fafc",
    meta:            "64748b",

    opt_bg:          "141e30",
    opt_line:        "2a3a56",
    opt_text:        "e2e8f0",
    key_bg:          "1e3a68",
    key_text:        "dbeafe",

    ok_bg:           "0a2018",
    ok_line:         "10b981",
    ok_text:         "d1fae5",
    ok_key:          "10b981",
    ok_key_txt:      "ffffff",
    ok_tick:         "10b981",

    ans_bg:          "0a2018",
    ans_line:        "10b981",
    ans_lbl:         "86efac",
    ans_val:         "f0fdf4",

    feud_row_bg:     "18243e",
    feud_row_line:   "3d4e6a",
    feud_rev_bg:     "1a3a6a",
    feud_rev_line:   "4a7cbf",
    feud_vacant_bg:  "0e1724",
    feud_vacant_line:"252f42",
    feud_rank:       "94a3b8",
    feud_text:       "e2e8f0",
    feud_pts:        "7dd3fc",

    disp_bg:         "0e1f38",
    disp_line:       "2a4a72",
    disp_text:       "e0f2fe",
  };

  // Slide geometry (LAYOUT_WIDE: 13.333" × 7.5")
  var SW = 13.333;
  var SH = 7.5;
  var ML = 0.4;
  var CW = SW - ML * 2;

  // ── Low-level drawing helpers ────────────────────────────────────────────────

  function fillBg(s) {
    // Dark-to-darker gradient matching preview-stage.css linear-gradient(180deg,#13203b,#081120)
    s.addShape("rect", {
      x: 0, y: 0, w: SW, h: SH,
      fill: { type: "gradient", color: [
        { color: "13203b", position: 0 },
        { color: "081120", position: 100 },
      ]},
      line: { color: "081120", width: 0 },
    });
  }

  function addTopStripe(s) {
    s.addShape("rect", {
      x: 0, y: 0, w: SW, h: 0.05,
      fill: { color: C.badge_line },
      line: { color: C.badge_line, width: 0 },
    });
  }

  function badgeW(text) {
    return Math.min(5.5, Math.max(1.8, String(text).length * 0.092 + 0.5));
  }

  function addBadge(s, text, x, y) {
    if (!text) return x;
    var t = String(text).toUpperCase().trim();
    var w = badgeW(t);
    s.addText(t, {
      x: x, y: y, w: w, h: 0.32,
      shape: "roundRect", rectRadius: 0.5,
      fill: { color: C.badge_bg },
      line: { color: C.badge_line, width: 0.75 },
      fontSize: 9, bold: true, color: C.badge_text,
      align: "center", valign: "middle",
      charSpacing: 1,
    });
    return x + w + 0.15;
  }

  function autoQFontSize(text, blockType) {
    if (blockType === "round-start" || blockType === "category-slide") return 52;
    var n = String(text || "").length;
    if (n > 160) return 20;
    if (n > 120) return 24;
    if (n > 90)  return 28;
    if (n > 60)  return 31;
    return 34;
  }

  // ── Title slide ──────────────────────────────────────────────────────────────

  function paintTitleSlide(s, slide, showMeta) {
    fillBg(s);
    addTopStripe(s);

    // Top accent stripe (thicker, branded)
    s.addShape("rect", {
      x: 0, y: 0, w: SW, h: 0.06,
      fill: { color: C.accent },
      line: { color: C.accent, width: 0 },
    });

    // Eyebrow
    s.addText("BEACH TRIVIA PRESENTS", {
      x: ML, y: 1.0, w: CW, h: 0.38,
      fontSize: 10, bold: true, color: C.accent,
      align: "center", valign: "middle",
      charSpacing: 5,
    });

    // Divider line beneath eyebrow
    s.addShape("rect", {
      x: SW / 2 - 1.8, y: 1.48, w: 3.6, h: 0.025,
      fill: { color: C.accent },
      line: { color: C.accent, width: 0 },
    });

    // Show title
    var title = stripHtml(slide.question) || showMeta.title || "Trivia Night";
    s.addText(title, {
      x: ML, y: 1.6, w: CW, h: 2.8,
      fontSize: 52, bold: true, color: C.q,
      align: "center", valign: "middle",
    });

    // Date / subtitle
    var dateLabel = stripHtml(slide.category || showMeta.dateLabel || "");
    if (dateLabel) {
      s.addText(dateLabel, {
        x: ML, y: 4.55, w: CW, h: 0.52,
        fontSize: 18, color: C.cat,
        align: "center", valign: "middle",
      });
    }

    // Bottom accent stripe
    s.addShape("rect", {
      x: 0, y: SH - 0.06, w: SW, h: 0.06,
      fill: { color: C.badge_line },
      line: { color: C.badge_line, width: 0 },
    });
  }

  // ── Multiple-choice options ──────────────────────────────────────────────────

  function paintOptions(s, slide, startY, showAnswer) {
    var opts = Array.isArray(slide.options) ? slide.options.filter(Boolean) : [];
    if (!opts.length) return startY;

    var isDense = opts.length >= 5;
    var optH    = isDense ? 0.50 : 0.65;
    var optGap  = isDense ? 0.07 : 0.10;
    var oFz     = isDense ? 14   : 18;
    var keyS    = isDense ? 0.26 : 0.34;
    var keyFz   = isDense ? 9    : 11;

    var y = startY;
    opts.forEach(function (opt, i) {
      if (y + optH > SH - 0.18) return;
      var isCorrect = showAnswer && opt === slide.answer;

      s.addShape("roundRect", {
        x: ML, y: y, w: CW, h: optH,
        rectRadius: 0.1,
        fill: { color: isCorrect ? C.ok_bg   : C.opt_bg   },
        line: { color: isCorrect ? C.ok_line : C.opt_line, width: 1 },
      });

      s.addText(String.fromCharCode(65 + i), {
        x: ML + 0.10, y: y + (optH - keyS) / 2, w: keyS, h: keyS,
        shape: "ellipse",
        fill: { color: isCorrect ? C.ok_key : C.key_bg },
        line: { color: isCorrect ? C.ok_key : C.key_bg, width: 0 },
        fontSize: keyFz, bold: true,
        color: isCorrect ? C.ok_key_txt : C.key_text,
        align: "center", valign: "middle",
      });

      s.addText(stripHtml(opt), {
        x: ML + 0.10 + keyS + 0.12,
        y: y,
        w: CW - 0.10 - keyS - 0.22 - (isCorrect ? 0.45 : 0),
        h: optH,
        fontSize: oFz, color: isCorrect ? C.ok_text : C.opt_text,
        valign: "middle",
      });

      if (isCorrect) {
        s.addText("✓", {
          x: SW - ML - 0.42, y: y, w: 0.38, h: optH,
          fontSize: 16, bold: true, color: C.ok_tick,
          align: "center", valign: "middle",
        });
      }

      y += optH + optGap;
    });

    return y;
  }

  // ── Feud answer grid (2 col × 4 row) ────────────────────────────────────────

  function paintFeudGrid(s, slide, startY) {
    var answers = (slide.feudAnswers || []).slice().sort(function (a, b) {
      return (b.points || 0) - (a.points || 0);
    });
    while (answers.length < 8) answers.push({ text: "", points: 0 });
    answers = answers.slice(0, 8);

    var colGap = 0.22;
    var colW   = (CW - colGap) / 2;
    var col1X  = ML;
    var col2X  = ML + colW + colGap;

    var availH = SH - startY - 0.22;
    var rowGap = 0.08;
    var rowH   = Math.max(0.72, Math.min(1.15, (availH - 3 * rowGap) / 4));

    var rankW = 0.40;
    var ptsW  = 0.68;

    for (var i = 0; i < 8; i++) {
      var col = i < 4 ? 0 : 1;
      var row = i < 4 ? i : i - 4;
      var cx  = col === 0 ? col1X : col2X;
      var cy  = startY + row * (rowH + rowGap);
      var ans = answers[i];
      var hasText = ans && String(ans.text || "").trim().length > 0;

      s.addShape("roundRect", {
        x: cx, y: cy, w: colW, h: rowH,
        rectRadius: 0.1,
        fill: { color: hasText ? C.feud_rev_bg    : C.feud_vacant_bg   },
        line: { color: hasText ? C.feud_rev_line  : C.feud_vacant_line, width: 1 },
      });

      if (hasText) {
        // Rank
        s.addText(String(i + 1), {
          x: cx + 0.06, y: cy, w: rankW, h: rowH,
          fontSize: 12, bold: true, color: C.feud_rank,
          align: "center", valign: "middle",
        });
        // Answer text
        s.addText(String(ans.text || ""), {
          x: cx + rankW + 0.16,
          y: cy,
          w: colW - rankW - ptsW - 0.26,
          h: rowH,
          fontSize: 15, bold: true, color: C.feud_text,
          align: "left", valign: "middle",
        });
        // Points
        s.addText(String(ans.points || 0) + " pts", {
          x: cx + colW - ptsW - 0.06, y: cy, w: ptsW, h: rowH,
          fontSize: 13, bold: true, color: C.feud_pts,
          align: "center", valign: "middle",
        });
      } else {
        // Vacant slot
        s.addText(String(i + 1), {
          x: cx, y: cy, w: colW, h: rowH,
          fontSize: 15, color: C.feud_vacant_line,
          align: "center", valign: "middle",
        });
      }
    }
  }

  // ── Answer panel (non-MC, non-feud) ─────────────────────────────────────────

  function paintAnswerPanel(s, text, y) {
    var panH = Math.max(0.4, Math.min(0.9, SH - y - 0.12));
    s.addShape("roundRect", {
      x: ML, y: y, w: CW, h: panH,
      rectRadius: 0.08,
      fill: { color: C.ans_bg },
      line: { color: C.ans_line, width: 0.75 },
    });
    s.addText("ANSWER", {
      x: ML + 0.16, y: y + 0.06, w: 1.4, h: 0.20,
      fontSize: 8, bold: true, color: C.ans_lbl, charSpacing: 1.5,
    });
    s.addText(text, {
      x: ML + 0.16, y: y + 0.29, w: CW - 0.32, h: panH - 0.36,
      fontSize: 14, bold: true, color: C.ans_val, valign: "top",
    });
  }

  // ── Question / display / round-start / feud slides ───────────────────────────

  function paintQuestionSlide(s, slide, showAnswer) {
    fillBg(s);
    addTopStripe(s);

    var blockType    = String(slide.blockType || slide.kind || "").toLowerCase();
    var qType        = String(slide.questionType || "").toLowerCase();
    var isDisp       = qType === "display"
                     || blockType === "intro-slide"
                     || blockType === "info-slide";
    var isRoundStart = blockType === "round-start";
    var isCatSlide   = blockType === "category-slide";
    var isCenter     = isRoundStart || isCatSlide;
    var isMC         = qType === "multiple-choice";
    var isFeud       = isFeudSlide(slide);
    var isSummary    = slide.kind === "answers-summary" || blockType === "answers-summary";

    // — Top row: badge + state label —
    var badge = stripHtml(slide.roundBadge || "");
    var label = slide.stateLabel || "";
    var nextX = ML;
    if (badge) nextX = addBadge(s, badge, ML, 0.20);
    if (label && !isCenter) {
      s.addText(label, {
        x: nextX, y: 0.20, w: SW - nextX - ML, h: 0.32,
        fontSize: 9, color: C.meta,
        align: "right", valign: "middle",
      });
    }

    var y = 0.62;

    // — Display slides (intro-slide / info-slide): heading + content box —
    // These are handled completely separately so the content box gets full height.
    if (isDisp && !isCenter) {
      var heading = stripHtml(slide.question || "");
      if (heading) {
        s.addText(heading, {
          x: ML, y: y, w: CW, h: 0.50,
          fontSize: 20, bold: true, color: C.q,
          valign: "middle",
        });
        y += 0.56;
      }
      var dispText = stripHtml(slide.answer || "");
      if (dispText) {
        var boxH = Math.max(1.0, SH - y - 0.20);
        s.addShape("roundRect", {
          x: ML, y: y, w: CW, h: boxH,
          rectRadius: 0.08,
          fill: { color: C.disp_bg },
          line: { color: C.disp_line, width: 1 },
        });
        s.addText(dispText, {
          x: ML + 0.22, y: y + 0.18, w: CW - 0.44, h: boxH - 0.30,
          fontSize: 14, color: C.disp_text,
          valign: "top",
        });
      }
      return;
    }

    // — Answers-summary: "ANSWER REVIEW" header + centered Q list —
    if (isSummary) {
      var cat = stripHtml(slide.category || "Answer Review");
      s.addText(cat.toUpperCase(), {
        x: ML, y: y, w: CW, h: 0.42,
        fontSize: 16, bold: true, color: C.cat,
        align: "center", charSpacing: 2,
      });
      y += 0.52;

      var qText = stripHtml(slide.question || "");
      var fz    = Math.min(22, autoQFontSize(qText, blockType));
      var qH    = Math.max(1.0, SH - y - 0.25);
      s.addText(qText, {
        x: ML, y: y, w: CW, h: qH,
        fontSize: fz, bold: true, color: C.q,
        valign: "top", align: "center",
      });
      // No answer panel on summary slides — the Q list IS the answer content
      return;
    }

    // — Category (normal question slides) —
    var cat = stripHtml(slide.category || "");
    if (cat && !isDisp) {
      s.addText(cat.toUpperCase(), {
        x: ML, y: y, w: CW, h: 0.37,
        fontSize: 14, bold: true, color: C.cat,
        align: isCenter ? "center" : "left",
        charSpacing: 2,
      });
      y += 0.44;
    }

    // — Question text —
    var qText = stripHtml(slide.question || "");
    var fz    = autoQFontSize(qText, blockType);

    // Calculate available height for question box
    var reservedBelow = 0;
    if (isMC && !isCenter) {
      var optCount = (slide.options || []).length;
      var isDense  = optCount >= 5;
      reservedBelow = optCount * (isDense ? 0.50 : 0.65)
                    + Math.max(0, optCount - 1) * (isDense ? 0.07 : 0.10)
                    + 0.25;
    } else if (isFeud) {
      reservedBelow = 4 * 0.92 + 3 * 0.08 + 0.45;
    } else if (showAnswer && !isDisp && !isCenter && slide.answer) {
      reservedBelow = 0.95;
    }

    var qH = Math.max(0.7, SH - y - reservedBelow - 0.18);
    if (isCenter) {
      // Reserve bottom space for round-start CTA pill
      qH = SH - y - (isRoundStart ? 1.15 : 0.30);
    }

    s.addText(qText, {
      x: ML, y: y, w: CW, h: qH,
      fontSize: fz, bold: true, color: C.q,
      valign: isCenter ? "middle" : "top",
      align: isCenter ? "center" : "left",
    });
    y += qH + (isCenter ? 0 : 0.16);

    // — Round-start: "GET READY!" CTA pill —
    if (isRoundStart) {
      var ctaRaw = stripHtml(slide.answer || "").toUpperCase() || "GET READY!";
      // Clean up the text to make it CTA-style
      if (ctaRaw.toLowerCase() === "get ready!") ctaRaw = "GET READY!";
      var ctaW = Math.min(4.5, Math.max(2.4, ctaRaw.length * 0.16 + 1.0));
      var ctaX = (SW - ctaW) / 2;
      s.addText(ctaRaw, {
        x: ctaX, y: SH - 1.10, w: ctaW, h: 0.60,
        shape: "roundRect", rectRadius: 0.5,
        fill: { color: C.bg },
        line: { color: C.accent, width: 1.5 },
        fontSize: 14, bold: true, color: C.accent,
        align: "center", valign: "middle",
        charSpacing: 2,
      });
      return;
    }

    // — Category-slide: already rendered question as centered list; done —
    if (isDisp && isCenter) {
      return;
    }

    // — Multiple-choice options —
    if (isMC && !isCenter) {
      y = paintOptions(s, slide, y, showAnswer);
    }

    // — Feud grid (always fully revealed in host backup) —
    if (isFeud) {
      paintFeudGrid(s, slide, y);
      return;
    }

    // — Matching pairs —
    if (!isCenter && slide.matchingPairs && slide.matchingPairs.length) {
      var pairs = slide.matchingPairs.filter(function (p) { return p && (p.left || p.right); });
      if (pairs.length && y < SH - 0.5) {
        var pairH = Math.min(0.55, (SH - y - 0.2) / pairs.length);
        pairs.forEach(function (p) {
          if (y + pairH > SH - 0.1) return;
          s.addShape("roundRect", {
            x: ML, y: y, w: CW, h: pairH,
            rectRadius: 0.08,
            fill: { color: C.opt_bg },
            line: { color: C.opt_line, width: 1 },
          });
          var hw = (CW - 1.0) / 2;
          s.addText(stripHtml(p.left || ""), {
            x: ML + 0.14, y: y, w: hw, h: pairH,
            fontSize: 14, color: C.opt_text, valign: "middle", align: "right",
          });
          s.addText("→", {
            x: ML + hw + 0.14, y: y, w: 0.72, h: pairH,
            fontSize: 16, color: C.cat, valign: "middle", align: "center",
          });
          s.addText(stripHtml(p.right || ""), {
            x: ML + hw + 0.86, y: y, w: hw, h: pairH,
            fontSize: 14, color: C.opt_text, valign: "middle", align: "left",
          });
          y += pairH + 0.08;
        });
      }
    }

    // — Ordering items —
    if (!isCenter && slide.orderingItems && slide.orderingItems.length) {
      var items = slide.orderingItems.map(String).filter(Boolean);
      var itemH = Math.min(0.55, (SH - y - 0.2) / items.length);
      items.forEach(function (item, i) {
        if (y + itemH > SH - 0.1) return;
        s.addShape("roundRect", {
          x: ML, y: y, w: CW, h: itemH,
          rectRadius: 0.08,
          fill: { color: C.opt_bg },
          line: { color: C.opt_line, width: 1 },
        });
        s.addText(String(i + 1), {
          x: ML + 0.10, y: y, w: 0.32, h: itemH,
          fontSize: 12, bold: true, color: C.key_text,
          align: "center", valign: "middle",
        });
        s.addText(item, {
          x: ML + 0.54, y: y, w: CW - 0.64, h: itemH,
          fontSize: 14, color: C.opt_text, valign: "middle",
        });
        y += itemH + 0.08;
      });
    }

    // — Answer panel (non-MC, non-display, non-summary slides only) —
    var ans = stripHtml(slide.answer || "");
    if (showAnswer && ans && !isMC && !isSummary && y < SH - 0.45) {
      paintAnswerPanel(s, ans, Math.min(y, SH - 0.95));
    }
  }

  // ── Main export ──────────────────────────────────────────────────────────────

  async function downloadEmergencyDeck(rawShow, opts) {
    var PptxGen = getPptxCtor();
    if (typeof PptxGen !== "function") {
      throw new Error("PptxGenJS failed to load.");
    }

    var flat      = flattenSlidesForExport(rawShow || {});
    var showMeta  = (rawShow && rawShow.show) || {};
    var deckTitle = showMeta.title || "Untitled Show";

    var pptx = new PptxGen();
    // Define an explicit 13.333"×7.5" layout — LAYOUT_WIDE string may not be
    // recognized in all CDN builds; defineLayout is always reliable.
    pptx.defineLayout({ name: "WIDE_1333", width: 13.333, height: 7.5 });
    pptx.layout  = "WIDE_1333";
    pptx.author  = "My Beach Trivia";
    pptx.title   = deckTitle + " — host backup";
    pptx.subject = "Emergency offline slideshow backup";

    for (var idx = 0; idx < flat.length; idx++) {
      var slide = flat[idx];
      var s = pptx.addSlide();
      var isTitle = String(slide.kind || "").toLowerCase() === "title";

      if (isTitle) {
        paintTitleSlide(s, slide, showMeta);
      } else {
        // Only reveal answers on summary/answers slides — question slides stay clean
        paintQuestionSlide(s, slide, !!slide.alwaysReveal);
      }

      // Speaker notes
      var ans = stripHtml(slide.answer || "");
      var notesParts = [];
      if (stripHtml(slide.notes || "")) notesParts.push("Host notes:\n" + stripHtml(slide.notes));
      if (ans && !isFeudSlide(slide)) {
        notesParts.push("Answer:\n" + ans);
      } else if (isFeudSlide(slide) && (slide.feudAnswers || []).length) {
        notesParts.push(
          "Feud answers:\n" +
            (slide.feudAnswers || [])
              .map(function (a, i) {
                var t = String(a && a.text || "").trim();
                return t ? (i + 1) + ". " + t : "";
              })
              .filter(Boolean)
              .join("\n")
        );
      }
      notesParts.push("stateKey: " + (slide.stateKey || ""));
      try { s.addNotes(notesParts.filter(Boolean).join("\n\n")); } catch (_) {}
    }

    var fname = sanitizeFilename(deckTitle) + "-host-backup.pptx";
    return pptx.writeFile({ fileName: fname });
  }

  global.BeachTriviaExportPPTX = {
    flattenSlidesForExport: flattenSlidesForExport,
    downloadEmergencyDeck: downloadEmergencyDeck,
  };
})(typeof window !== "undefined" ? window : this);
