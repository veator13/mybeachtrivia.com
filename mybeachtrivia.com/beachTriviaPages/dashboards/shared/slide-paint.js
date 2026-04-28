// Shared slide painter — host live-console + /cast-game (parity with writer preview-stage)
(function (global) {
  'use strict';

  var WRITER_ASSETS = '/beachTriviaPages/dashboards/writer/assets/images/';
  var DISPLAY_BLOCK_TYPES = ['intro-slide', 'info-slide', 'round-start', 'category-slide'];

  function isTitleSlide(slide) {
    if (!slide) return false;
    const kind = String(slide.kind || '').toLowerCase();
    const stateLabel = String(slide.stateLabel || '').toLowerCase();
    return kind === 'title' || stateLabel.includes('title slide');
  }

  // ── Slide painter ──────────────────────────────────────────────────────────

  function paintSlide(el, slide, revealed) {
    if (!el || !slide) return;

    var isTitle   = isTitleSlide(slide);
    var blockType = slide.blockType || slide.kind || '';
    var isDisplay = DISPLAY_BLOCK_TYPES.indexOf(blockType) !== -1
      || String(slide.questionType || '').toLowerCase() === 'display';
    var effectiveType = isDisplay ? 'display' : String(slide.questionType || 'multiple-choice').toLowerCase();

    el.setAttribute('data-block-type', blockType);

    // Title slide — show full overlay, nothing else needed
    var overlay = ensureTitleOverlay(el);
    if (isTitle) {
      overlay.style.display = 'flex';
      return;
    }
    overlay.style.display = 'none';

    // Ensure skeleton elements exist
    buildSkeleton(el);

    // Badge
    var badge = el.querySelector('.slide-badge');
    if (badge) badge.textContent = slide.roundBadge || '';

    // Meta stack (state label + theme)
    var meta = el.querySelector('.slide-meta-stack');
    if (meta) {
      meta.innerHTML = '';
      var stateEl = document.createElement('span');
      stateEl.textContent = slide.stateLabel || '';
      var themeEl = document.createElement('span');
      themeEl.textContent = slide.theme || '';
      meta.appendChild(stateEl);
      meta.appendChild(themeEl);
    }

    // Category (hidden on display-type slides)
    var cat = el.querySelector('.slide-category');
    if (cat) {
      cat.textContent = slide.category || '';
      cat.style.display = isDisplay ? 'none' : '';
    }

    // Question text
    var q = el.querySelector('.slide-question');
    if (q) {
      q.textContent = slide.question || '';
      q.style.textAlign = slide.questionAlign === 'center'
        ? 'center'
        : (slide.questionAlign === 'right' ? 'right' : '');
      q.style.fontSize = '';
      q.style.lineHeight = '';
      q.style.whiteSpace = '';
      if (typeof slide.questionFontScale === 'number' && slide.questionFontScale !== 1.0) {
        var basePx = parseFloat(q.getAttribute('data-preview-base-px'));
        if (!basePx || !isFinite(basePx)) {
          basePx = parseFloat(window.getComputedStyle(q).fontSize) || 38;
        }
        q.setAttribute('data-preview-base-px', String(basePx));
        q.style.fontSize = String(basePx * slide.questionFontScale) + 'px';
      } else {
        q.setAttribute('data-preview-base-px', String(parseFloat(window.getComputedStyle(q).fontSize) || 38));
      }
      if (blockType === 'answers-summary') {
        q.setAttribute('data-font-mode', 'summary');
        q.style.whiteSpace = 'pre-wrap';
      } else if (isDisplay) {
        q.setAttribute('data-font-mode', 'display');
        q.style.whiteSpace = '';
      } else {
        q.removeAttribute('data-font-mode');
        q.style.whiteSpace = '';
      }
    }

    // Options
    paintOptions(el, effectiveType, slide, revealed);

    // Answer panel (hidden for MC and display types; shown on reveal for others)
    var ansWrap  = el.querySelector('.slide-answer-preview');
    var ansValue = el.querySelector('.slide-answer-preview .value');
    if (ansWrap && ansValue) {
      var isMC = effectiveType === 'multiple-choice';
      var showAns = revealed && !isMC && !isDisplay && slide.answer;
      ansValue.textContent = slide.answer || '';
      ansWrap.style.display = showAns ? '' : 'none';
    }

    enforceInfoSlideTopClearance(el, blockType);

    // Keep host/cast preview readable when the viewport card is short.
    autoFitStageText(el);
  }

  function enforceInfoSlideTopClearance(stageEl, blockType) {
    if (!stageEl) return;
    var question = stageEl.querySelector('.slide-question');
    if (!question) return;
    question.style.marginTop = '';

    if (String(blockType || '').toLowerCase() !== 'info-slide') return;

    var topRow = stageEl.querySelector('.slide-top');
    if (!topRow) return;

    var topRect = topRow.getBoundingClientRect();
    var qRect = question.getBoundingClientRect();
    var minGap = Math.max(12, Math.round((stageEl.clientWidth || 0) * 0.012));
    var overlapPx = (topRect.bottom + minGap) - qRect.top;
    if (overlapPx > 0) {
      question.style.marginTop = overlapPx.toFixed(2) + 'px';
    }
  }

  function autoFitStageText(stageEl) {
    if (!stageEl) return;
    // Keep this disabled for parity with writer preview rendering.
    resetStageAutoFit(stageEl);
  }

  function applyFontScale(nodes, scale) {
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var basePx = parseFloat(node.getAttribute('data-fit-base-px'));
      if (!basePx || !isFinite(basePx)) {
        basePx = parseFloat(window.getComputedStyle(node).fontSize);
        if (!basePx || !isFinite(basePx)) continue;
        node.setAttribute('data-fit-base-px', String(basePx));
      }
      node.style.fontSize = (basePx * scale).toFixed(2) + 'px';
    }
  }

  function resetStageAutoFit(stageEl) {
    if (!stageEl) return;
    var fitted = stageEl.querySelectorAll('[data-fit-base-px]');
    for (var i = 0; i < fitted.length; i++) {
      fitted[i].style.fontSize = '';
      fitted[i].removeAttribute('data-fit-base-px');
    }
  }

  function buildSkeleton(el) {
    if (el.querySelector('.slide-top')) return; // already built
    el.innerHTML = [
      '<div class="slide-top">',
      '  <span class="slide-badge"></span>',
      '  <div class="slide-meta-stack"></div>',
      '</div>',
      '<div class="slide-middle">',
      '  <div class="slide-category"></div>',
      '  <div class="slide-question"></div>',
      '  <div class="slide-options"></div>',
      '  <div class="slide-answer-preview" style="display:none">',
      '    <div class="label">Answer</div>',
      '    <div class="value"></div>',
      '  </div>',
      '</div>',
      '<div class="slide-bottom"></div>',
    ].join('');
  }

  function ensureTitleOverlay(el) {
    var overlay = el.querySelector('.slide-title-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'slide-title-overlay';
    overlay.style.display = 'none';

    var inner = document.createElement('div');
    inner.className = 'title-slide-inner';

    var eyebrowRow = document.createElement('div');
    eyebrowRow.className = 'title-slide-eyebrow-row';
    var lineL = document.createElement('div');
    lineL.className = 'title-slide-eyebrow-line';
    var eyebrow = document.createElement('div');
    eyebrow.className = 'title-slide-eyebrow';
    eyebrow.textContent = 'Beach Trivia Presents';
    var lineR = document.createElement('div');
    lineR.className = 'title-slide-eyebrow-line';
    eyebrowRow.appendChild(lineL);
    eyebrowRow.appendChild(eyebrow);
    eyebrowRow.appendChild(lineR);

    var heading = document.createElement('div');
    heading.className = 'title-slide-heading';
    heading.textContent = 'Trivia Night';

    var centerRow = document.createElement('div');
    centerRow.className = 'title-slide-center-row';

    var logoWrap = document.createElement('div');
    logoWrap.className = 'title-slide-logo';
    var logoImg = document.createElement('img');
    logoImg.src = WRITER_ASSETS + 'BTlogo-Round-Border.png';
    logoImg.alt = 'Beach Trivia';
    logoWrap.appendChild(logoImg);

    centerRow.appendChild(buildQRCard(WRITER_ASSETS + 'qr-virginia.jpg', 'Virginia'));
    centerRow.appendChild(logoWrap);
    centerRow.appendChild(buildQRCard(WRITER_ASSETS + 'qr-new-york.jpg', 'New York'));

    inner.appendChild(eyebrowRow);
    inner.appendChild(heading);
    inner.appendChild(centerRow);
    overlay.appendChild(inner);

    el.appendChild(overlay);
    return overlay;
  }

  function buildQRCard(src, label) {
    var card = document.createElement('div');
    card.className = 'title-slide-qr-card';
    var img = document.createElement('img');
    img.src = src;
    img.alt = label + ' QR Code';
    var lbl = document.createElement('div');
    lbl.className = 'title-slide-qr-label';
    lbl.textContent = label;
    var hint = document.createElement('div');
    hint.className = 'title-slide-qr-hint';
    hint.textContent = 'Scan to play';
    card.appendChild(img);
    card.appendChild(lbl);
    card.appendChild(hint);
    return card;
  }

  function paintOptions(el, effectiveType, slide, revealed) {
    var optEl = el.querySelector('.slide-options');
    if (!optEl) return;
    optEl.innerHTML = '';
    optEl.classList.remove('slide-options-matching', 'slide-options-display', 'slide-options--dense');

    if (effectiveType === 'multiple-choice') {
      var opts = Array.isArray(slide.options) ? slide.options.filter(Boolean) : [];
      if (!opts.length) { optEl.style.display = 'none'; return; }
      optEl.style.display = '';
      optEl.classList.toggle('slide-options--dense', opts.length >= 5);
      opts.forEach(function (opt, i) {
        var row = document.createElement('div');
        var isCorrect = revealed && opt === slide.answer;
        row.className = 'slide-option' + (revealed ? (isCorrect ? ' correct' : ' incorrect') : '');
        var key = document.createElement('span');
        key.className = 'slide-option-key';
        key.textContent = String.fromCharCode(65 + i);
        var txt = document.createElement('span');
        txt.textContent = opt;
        row.appendChild(key);
        row.appendChild(txt);
        if (isCorrect) {
          var tick = document.createElement('span');
          tick.className = 'slide-option-tick';
          tick.textContent = '✓';
          row.appendChild(tick);
        }
        optEl.appendChild(row);
      });

    } else if (effectiveType === 'matching') {
      var pairs = Array.isArray(slide.matchingPairs)
        ? slide.matchingPairs.filter(function (p) { return p.left || p.right; })
        : [];
      if (!pairs.length) { optEl.style.display = 'none'; return; }
      optEl.style.display = '';
      optEl.classList.add('slide-options-matching');
      pairs.forEach(function (pair) {
        var row = document.createElement('div');
        row.className = 'slide-option slide-option-pair';
        var left = document.createElement('span');
        left.className = 'slide-option-pair-left';
        left.textContent = pair.left || '';
        var arrow = document.createElement('span');
        arrow.className = 'slide-option-pair-arrow';
        arrow.textContent = '→';
        var right = document.createElement('span');
        right.className = 'slide-option-pair-right';
        right.textContent = pair.right || '';
        row.appendChild(left);
        row.appendChild(arrow);
        row.appendChild(right);
        optEl.appendChild(row);
      });

    } else if (effectiveType === 'ordering') {
      var items = Array.isArray(slide.orderingItems) ? slide.orderingItems.filter(Boolean) : [];
      if (!items.length) { optEl.style.display = 'none'; return; }
      optEl.style.display = '';
      items.forEach(function (item, i) {
        var row = document.createElement('div');
        row.className = 'slide-option';
        var key = document.createElement('span');
        key.className = 'slide-option-key';
        key.textContent = String(i + 1);
        var txt = document.createElement('span');
        txt.textContent = item;
        row.appendChild(key);
        row.appendChild(txt);
        optEl.appendChild(row);
      });

    } else if (effectiveType === 'display') {
      var text = String(slide.answer || '').trim();
      if (!text) { optEl.style.display = 'none'; return; }
      optEl.style.display = '';
      optEl.classList.add('slide-options-display');
      var body = document.createElement('div');
      body.className = 'slide-display-content';

      function stripLeadingBullet(line) {
        var c = line.charAt(0);
        if (c === '\u2022' || c === '\u2023' || c === '•' || c === '*') {
          return line.substring(1).trim();
        }
        return line;
      }

      function appendBulletRow(target, line, scoringClass) {
        var item = document.createElement('div');
        var lineText = stripLeadingBullet(line);
        item.className = 'slide-rules-item' + (scoringClass ? ' ' + scoringClass : '');
        var c0 = line.charAt(0);
        var hasBullet = c0 === '\u2022' || c0 === '\u2023' || c0 === '•' || c0 === '*';
        if (hasBullet) {
          var bullet = document.createElement('span');
          bullet.className = 'slide-rules-bullet';
          bullet.textContent = '\u2022';
          var span = document.createElement('span');
          span.className = 'slide-rules-text';
          span.textContent = lineText;
          item.appendChild(bullet);
          item.appendChild(span);
        } else {
          item.textContent = line;
        }
        target.appendChild(item);
      }

      var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (lines.length > 1) {
        var bodyLines = [];
        var scoringLines = [];
        lines.forEach(function (line) {
          var plain = stripLeadingBullet(line);
          if (/^\s*Scoring\s*:/i.test(plain)) {
            scoringLines.push(line);
          } else {
            bodyLines.push(line);
          }
        });

        var grid = document.createElement('div');
        grid.className = 'slide-rules-grid';
        bodyLines.forEach(function (line) {
          appendBulletRow(grid, line, '');
        });
        if (bodyLines.length) {
          body.appendChild(grid);
        }

        if (scoringLines.length) {
          var footer = document.createElement('div');
          footer.className = 'slide-rules-scoring';
          scoringLines.forEach(function (line) {
            appendBulletRow(footer, line, 'slide-rules-item--scoring');
          });
          body.appendChild(footer);
        }
      } else {
        body.textContent = text;
      }
      optEl.appendChild(body);

    } else {
      optEl.style.display = 'none';
    }
  }

  global.BeachTriviaSlidePaint = {
    paintSlide: paintSlide,
  };
})(typeof window !== 'undefined' ? window : this);
