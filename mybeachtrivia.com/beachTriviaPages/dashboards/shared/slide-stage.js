// Shared slide "stage" — makes a slide render at a fixed 1280x720 canvas and
// scale (transform) to fill whatever box it's dropped into, on any screen /
// aspect ratio. Same idea as Google Slides / reveal.js. Display-only; nothing
// about the size is stored.
//
// Usage: a consumer has a frame element (the old `.preview-stage` / `#host-stage`).
//   var canvas = BeachTriviaSlideStage.ensure(frameEl);   // returns the .slide-canvas
//   BeachTriviaSlidePaint.paintSlide(frameEl, slide, revealed, { scaleToFit: true });
// paintSlide, given { scaleToFit: true }, calls ensure() itself and paints into
// the canvas — so consumers just add the option.
(function (global) {
  "use strict";

  var CANVAS_W = 1280;
  var CANVAS_H = 720;

  function ensure(frameEl) {
    if (!frameEl) return null;

    var canvas = frameEl.querySelector(":scope > .slide-canvas");
    if (!canvas) {
      canvas = document.createElement("div");
      canvas.className = "slide-canvas";
      // Move any pre-existing hand-written skeleton (writer.html ships one)
      // into the canvas so paintSlide finds it there.
      var moved = [];
      for (var i = 0; i < frameEl.childNodes.length; i++) moved.push(frameEl.childNodes[i]);
      moved.forEach(function (n) { canvas.appendChild(n); });
      frameEl.appendChild(canvas);
    }

    frameEl.classList.add("slide-stage-frame");

    if (!frameEl.__btStageRO && typeof ResizeObserver !== "undefined") {
      frameEl.__btStageRO = new ResizeObserver(function () { fit(frameEl); });
      frameEl.__btStageRO.observe(frameEl);
    }
    fit(frameEl);
    return canvas;
  }

  function fit(frameEl) {
    if (!frameEl) return;
    var canvas = frameEl.querySelector(":scope > .slide-canvas");
    if (!canvas) return;

    var w = frameEl.clientWidth;
    var h = frameEl.clientHeight;
    if (!w || !h) return;

    var scale = Math.min(w / CANVAS_W, h / CANVAS_H);
    canvas.style.transform = "scale(" + scale + ")";
    canvas.style.left = Math.round((w - CANVAS_W * scale) / 2) + "px";
    canvas.style.top = Math.round((h - CANVAS_H * scale) / 2) + "px";
  }

  function teardown(frameEl) {
    if (frameEl && frameEl.__btStageRO) {
      try { frameEl.__btStageRO.disconnect(); } catch (_) {}
      frameEl.__btStageRO = null;
    }
  }

  global.BeachTriviaSlideStage = {
    CANVAS_W: CANVAS_W,
    CANVAS_H: CANVAS_H,
    ensure: ensure,
    fit: fit,
    teardown: teardown,
  };
})(typeof window !== "undefined" ? window : this);
