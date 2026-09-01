# Shared slide renderer — plan

_Started 2026-08-31. Multi-session refactor; nothing here is urgent. Goal:
**one implementation of "turn a slide into pixels"** so the writer preview and
the host playback screens can never drift apart._

---

## What's actually going on (survey done 2026-08-31)

The situation is better than the earlier review implied. There are **two**
pieces, not six.

### Piece 1 — the painter (block/slide data → DOM in a `.preview-stage`)

| Where | File | Status |
|---|---|---|
| Host live-console, `/cast-game`, host-feud, host-mixed, host-themed-trivia | `dashboards/shared/slide-paint.js` → `window.BeachTriviaSlidePaint.paintSlide(el, slide, revealed)` | ✅ **already shared** |
| Writer preview | `dashboards/writer/js/preview.js` → `WriterPreview.renderFromFormData(formData)` | ❌ its own copy |

`slide-paint.js`'s header comment literally says _"parity with writer
preview-stage"_ — it was forked from the writer renderer and has since drifted.
They target the **same CSS** (`.slide-badge`, `.slide-question`,
`.slide-category`, `.slide-option*`, `.slide-feud-row*`, the title overlay) and
the same `.preview-stage` skeleton. Diffs are small and cosmetic-ish today
(e.g. preview.js wraps MC option text in `.slide-option-body`, slide-paint.js
doesn't; category-list handling lives in different functions) — exactly the
kind of drift that turns into "looked fine in the writer, wrong on stage."

### Piece 2 — the flattener (published/draft doc → flat slide list)

`{ blocks: [{ block, formData }] }`, each `block.slides[]`, → a flat array of
normalized slide objects.

| Where | Function | Status |
|---|---|---|
| host-feud/app.js | `flattenSlides(data)` | ❌ copy |
| host-mixed/app.js | `flattenSlides(data)` | ❌ near-identical copy |
| host-themed-trivia/app.js | `flattenSlides(data)` | ❌ near-identical copy |
| live-console/app.js | `flattenSlides(data)` | ❌ near-identical copy (has extra live/reveal dedupe) |
| writer preview | implicit — renders the *currently edited* block via `normalizeFormData`, never flattens the whole show | different shape |

### The normalized slide object (what `paintSlide` consumes)

```
{
  stateKey, stateLabel, kind,           // 'title' | 'question' | 'summary' | ...
  blockType,                            // 'title' | 'single-question' | 'category-slide' | 'info-slide' | 'round-start' | 'answers-summary' | 'feud-single-question' | ...
  questionType,                         // 'multiple-choice' | 'matching' | 'ordering' | 'display' | 'feud-question' | 'short-response' | ...
  roundBadge, category,
  question, questionAlign, questionFontScale,
  options[], matchingPairs[], orderingItems[],
  feudAnswers[], feudRevealCount, feudRevealDeferIndex,
  answer, notes, theme,
  alwaysReveal
}
```

`DISPLAY_BLOCK_TYPES = ['intro-slide','info-slide','round-start','category-slide']`
(defined in both files — must stay in sync; move to the shared module).

---

## Target architecture

```
dashboards/shared/
  slide-model.js     NEW  — flattenShow(showDoc) -> slide[]   (+ the shared enums)
  slide-paint.js     KEEP — paintSlide(el, slide, revealed)   (unchanged API)

writer/js/preview.js  — keeps: inline-edit chrome, live/reveal toolbar, feud
                        step controls, thumbnail stage, mode state.
                        DELEGATES the actual pixels to BeachTriviaSlidePaint.

host/*/app.js          — drop their local flattenSlides, call
                        BeachTriviaSlideModel.flattenShow(data).
```

Writer preview stays "special" only in that it's **editable** and renders **one
block at a time** as you type. Everything visual goes through `slide-paint.js`.

---

## Migration order (safest first, each independently shippable)

1. **Extract `slide-model.js`.** Take live-console's `flattenSlides` (the most
   evolved — it has the live/reveal dedupe), lift the shared enums out of
   `slide-paint.js`, expose `window.BeachTriviaSlideModel.flattenShow`.
   Migrate the 4 host players to it one at a time; diff the rendered slide list
   against the old output per show. No visual change expected.

2. **Writer preview → `slide-paint.js`, read-only first.**
   Add a `formData → normalized slide` adapter in `preview.js` (single block).
   Have `renderFromFormData` call `BeachTriviaSlidePaint.paintSlide` for the
   visual layer, then re-apply the inline-edit chrome on top (it already runs
   as a separate pass — `applyPreviewInlineChrome`). Keep the old code path
   behind a flag until it's proven on every slide type.

3. **Reconcile the drift found in step 2.** Whatever `paintSlide` does that the
   writer needs (or vice versa) gets fixed in `slide-paint.js` once. Delete the
   dead `renderOptions` / `renderFeudAnswerGrid` / `renderQuestion` etc. from
   `preview.js`.

4. **Thumbnails.** `app.js` `_buildThumbPreview` / `mergeFormDataForFilmstripThumb`
   → also `paintSlide` into a scaled-down stage. Lower priority, purely
   cosmetic if it lags.

5. **PPTX export** (`host/js/export-show-pptx.js`) — leave alone. Different
   output target (pptxgenjs objects, not DOM). It should read the same
   normalized model from `slide-model.js` so at least the *data* is shared, but
   its rendering stays separate. Last, optional.

---

## Risks / watch-items

- `preview.js` inline editing writes back to the form on blur
  (`schedulePreviewSyncFromDom`). The chrome pass must run *after* `paintSlide`
  rebuilds the DOM, and the sync selectors must still match. This is the
  fiddliest part.
- Feud reveal: writer uses `_feudRevealCount` module state; host passes
  `slide.feudRevealCount`. Adapter must map writer state → the field.
- `autoFitStageText` / font-scale base-px caching differs between the two —
  pick one behavior.
- Each host player has slightly different `flattenSlides` (badges, title
  fallbacks). Diff carefully before collapsing.
- Test matrix: every `questionType` × {live, reveal} × {main preview, thumb,
  host-stage, cast-stage}. The e2e `writer` smoke test should grow a
  "render every slide type" check.

## Progress log

- 2026-08-31 — survey complete, plan written.
- 2026-08-31 — **Step 1 done.** `slide-model.js` created; the 4 host players
  (live-console, host-feud, host-mixed, host-themed-trivia) now call
  `BeachTriviaSlideModel.flattenShow(data, { defaultTheme })` instead of their
  own `flattenSlides`. Verified 0 diffs vs old output on both real published
  shows (36 + 31 slides). live-console load/navigate/reveal tested green.
  `DISPLAY_BLOCK_TYPES` / `slideRevealApplicable` still have local copies in
  each host app + in slide-paint.js — converge in a later pass.
  **Not yet done:** steps 2–5 (writer preview → slide-paint.js is the big one).

- 2026-08-31 — **Step 2 done (flag-gated).** `writer/js/preview.js`:
  `USE_SHARED_PAINT = true`; `renderFromFormData` builds a `formDataToSlide()`
  adapter object and calls `BeachTriviaSlidePaint.paintSlide` for the visual
  layer, then re-applies the writer-only passes (theme class, media, inline
  chrome, mode toolbar). Title slides still use the writer's own overlay
  (guarded — the branch pre-builds the writer's `.slide-title-overlay` so the
  painter doesn't lazily create a host-flavoured one). `slide-model.js` +
  `slide-paint.js` now loaded in `writer.html`.
  Staging-tested: MC / feud / short-response / ordering / display / title all
  render, inline editing still works, live↔reveal works, no console errors.
  Skeletons were already class-compatible.

### Known drift found in step 2 (fix in step 3)

- **Category label overlaps the round badge** on question slides
  (`.slide-category` sits on top of `.slide-badge`). Pre-existing bug in
  `slide-paint.js` / its CSS — **it's on the live host today too**
  (live-console shows it). Now visible in the writer preview because it's the
  same painter. CSS fix in the shared layer helps both.
- The writer's old `renderMeta` prefixed "Slide State: " / "Theme: ";
  `formDataToSlide` bakes those prefixes into `stateLabel` / `theme` so the
  writer keeps its labels while the host stays bare. Decide later whether the
  host should show them too (then move the prefix into `slide-paint`).
- `formDataToSlide` feud reveal maps writer `_feudRevealCount` → `feudRevealCount`;
  the deferred-flip animation field (`feudRevealDeferIndex`) isn't wired — the
  writer's step-reveal buttons animate via preview.js's own feud fns still.

- 2026-08-31 — **overlap fixed.** `.slide-middle { align-content: safe center }`
  (both stylesheet copies) — a tall slide's content was overflowing UPWARD past
  the round badge. Verified on host live-console + writer preview: badge / meta /
  category / question now stack cleanly. Commit `133ad19`.
  Also: firebase.json `**/` → no-cache (directory URLs weren't covered by
  `**/*.html`, so stale index.html kept pointing at old `?v=` for ~1h).

### Still open — "slide content runs off the box"

Separate, pre-existing issue (NOT a regression). The live-console **HOST VIEW**
mini-preview card is only ~240px tall; a full MC slide (question + 4 options +
answer panel) needs ~330px at the *minimum* clamp font sizes, so options C/D get
clipped. Font sizes use `cqw` (container **width**) units — a wide-but-short
stage doesn't shrink them. `autoFitStageText` in slide-paint.js is deliberately
disabled ("for parity with writer preview").
The CAST preview + real TV cast are fine (full-size). The writer preview is fine
(taller area).
**Fix options:** (a) scale the whole `.preview-stage` with `transform: scale()`
to fit its container — a true proportional thumbnail, shared by writer thumbs /
host preview / cast; (b) switch the slide font `clamp()`s from `cqw` to `cqmin`
so short stages shrink text; (c) re-enable a working `autoFitStageText`.
Recommend (a) — cleanest, and it belongs in the shared layer.

- 2026-08-31 — **"scale slide to fit its box" fix DONE (option a).** New shared
  module `slide-stage.js` + `slide-stage.css` (`window.BeachTriviaSlideStage`):
  paints a slide into a fixed **1280×720 `.slide-canvas`** and `transform:
  scale(min(w/1280, h/720))` + centres it inside whatever frame the consumer
  gives it (letterboxed on non-16:9). Same trick as Google Slides / reveal.js.
  Display-only — nothing about size is stored (confirmed with Josh).
  `paintSlide(el, slide, revealed, { scaleToFit: true })` opts in — it calls
  `BeachTriviaSlideStage.ensure(el)` itself, so consumers just add the flag +
  the two `<script>`/`<link>` tags.
  **Rolled out & staging-verified:** live-console (host+cast stages, MC live +
  reveal), host-mixed (MC + feud grid), host-feud (feud step-reveal / hide flip
  animations still work — `stage.querySelector` reaches into the canvas),
  host-themed-trivia (same edit pattern, not separately clicked).
  Commits `1ec9048`, `0330f69`. `slide-paint.js?v=20260831-scalefit`,
  `slide-stage*?v=20260831-stage1`, host `app.js?v=20260831-scalefit`.
  **Not yet migrated:** `/cast-game` (has its own bespoke `--cast-scale`
  700×394 scheme — works, converging it is a behaviour change on the live
  audience TV view, do carefully); writer preview + writer filmstrip thumbs
  (see step 3.1 below).

### Next session — step 3

1. **Writer preview + thumbnails → the shared stage.** `preview.js` already
   goes through `paintSlide` (flag `USE_SHARED_PAINT`) but WITHOUT
   `{ scaleToFit: true }`. Adding it is fiddly here: `preview.js` pokes
   `dom.previewStage` directly a lot (`_buildTitleOverlay` appendChild, inline
   chrome, `ensurePreviewSlideSkeleton`, `autoFitStageText`, the
   `thumb-preview-stage` path). `ensure()` reparents the frame's children into
   `.slide-canvas`, so `appendChild` targets and `.slide-canvas > x` CSS need a
   re-check. Also decide whether thumb stages want the full canvas or stay as-is.
   Then `/cast-game`.
2. Once step 2 has been exercised on real shows for a bit: delete the now-dead
   writer-only renderers from `preview.js` — `renderRoundBadge`,
   `renderCategory`, `renderQuestion`, `renderOptions`, `renderAnswer`,
   `renderFeudAnswerGrid`, `renderMeta` — and drop the `USE_SHARED_PAINT` flag
   (keep the old code in git history).
3. Converge the leftover local `DISPLAY_BLOCK_TYPES` / `slideRevealApplicable`
   copies (4 host apps + slide-paint.js + preview.js) onto
   `BeachTriviaSlideModel`.
4. Then steps 4–5 (thumbnails, PPTX) per the migration list above.
