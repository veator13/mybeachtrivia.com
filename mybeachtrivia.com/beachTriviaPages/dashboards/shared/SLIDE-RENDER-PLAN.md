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

- 2026-08-31 — **Writer main preview → the shared canvas DONE.** Commit
  `4f62054`. `preview.js` shared-paint branch passes `{ scaleToFit: true }`
  for the main Slide Preview; filmstrip thumbnails stay on the flat stage
  (gated on `.thumb-preview-stage` via `stageWantsScale()`). Title overlay +
  slide skeleton now build inside `.slide-canvas`
  (`previewCanvasHost()` helper); `ensurePreviewSlideSkeleton` writes into the
  canvas when present so it can't clobber it. `writer.html` now loads
  `slide-stage.js/.css` and the `20260831-scalefit` `slide-paint.js` build
  (was the stale May `cat-vertical` one). `slide-stage*` bumped to `stage2`
  everywhere; `.slide-stage-frame` gets `border:0; box-shadow:none` and keeps
  the writer's scrolling `.preview-stage` clipped.
  Staging-verified on 2 published shows across title / short-response /
  MC (live+reveal) / answers-summary / intro / round-start / category / feud
  board — all scale, no overflow; inline editing still round-trips; thumbs
  unaffected; no console errors. **The writer preview and the host stage are
  now the same renderer end to end.**
  Writer filmstrip thumbs deliberately left flat — a 1280px canvas scaled into
  a ~120px thumb is wasteful; revisit only if the thumbs visibly drift.

- 2026-08-31 — **`/cast-game` (audience TV) → the shared canvas DONE.** Commit
  `a441246`. Dropped the `--cast-scale` scheme (700×393.75 `.preview-stage`
  transform-scaled off `window.innerWidth`); `#cast-stage` now fills the
  viewport as the frame and slide-stage.js scales the 1280×720 canvas into it.
  All 4 `paintSlide(castStage, …)` calls (incl. feud reveal/hide animation)
  pass `{ scaleToFit: true }`; `updateCastScale()` gutted to a no-op.
  Staging-verified on a live session: full-screen fit + letterbox, feud board
  live + reveal, live host→cast updates, no overflow, scales up past 1280.
  **All 4 renderer surfaces — writer preview, host consoles, `/cast-game` —
  now run the one shared painter + stage. Piece 1 of the plan is complete.**

- 2026-08-31 — **Cleanup DONE.** Commits `ba2c43b`, `3935e38`.
  - `preview.js`: dropped the `USE_SHARED_PAINT` flag + the whole pre-painter
    fallback branch in `renderFromFormData`; deleted `renderBlock` (exported,
    never called), `renderRoundBadge`, `renderCategory`, `renderQuestion`,
    `renderOptions`, `renderAnswer`, `renderMeta`, `enforceInfoSlideTopClearance`,
    `_basePreviewPx`. ~360 lines gone (1558 → 1199). Title blocks now delegate
    to `renderTitleSlide`; a missing painter shows an error, not a half-render.
    **Kept** `renderFeudAnswerGrid` + `getFeudSlots8` / `getFeudFilledRevealOrder`
    — they're the writer's *live* feud step-reveal / hide-flip path
    (`feudRevealNext` / `feudHidePrev`), never part of the dead set.
  - 4 host apps: `slideRevealApplicable` now delegates to
    `BeachTriviaSlideModel.slideRevealApplicable`; local `DISPLAY_BLOCK_TYPES`
    removed. host-feud keeps its `&& !isFeudSlide(s)` carve-out.
  - `preview.js` `DISPLAY_BLOCK_TYPES` also comes from the model now (local
    literal kept as a load-order fallback).
  - **Not converged:** `slide-paint.js`'s own local `DISPLAY_BLOCK_TYPES` — it's
    a leaf loaded by `/cast-game` without slide-model.js; a 4-item literal isn't
    worth adding a dependency for.

- 2026-09-01 — **Auto-fit + thumbnails DONE.** Commits `9a0f845`, `d297739`.
  - `slide-paint.js`: `autoFitStageText` re-enabled (was a no-op). After paint
    it measures `.slide-middle`; if content overflows the band it sets
    `--fit-scale` + `.slide-middle--fitted` (floor 0.55), zooming the band to
    fit instead of letting the canvas clip. Fixes the tall ordering /
    long-feud-board / dense-rules cases on every surface at once. Rule added to
    both stylesheet copies. `?v=20260831-autofit`.
  - Writer filmstrip thumbs now render the constant **1280×720** canvas (was
    synced from the ~490–870px frame), scaled by the existing
    `.filmstrip-preview-inner` transform → exact miniatures of the host output,
    autofit included. `syncFilmstripCanvasVars` sets the fixed size.

- 2026-09-01 — **PPTX + model convergence DONE.** Commits `7ae1912`, `7109674`.
  - `flattenSlidesForExport` now delegates to `flattenShow(data,
    { keepRevealPairs: true })` + a thin PPTX-only overlay. `flattenShow`
    gained `normalizeOptions` (array **or** `{A,B,…}` object) and a
    slide→block→`entry.formData.block` fallback for options / matchingPairs /
    orderingItems / feudAnswers — some shows only stored the ordering/matching
    payload under `formData.block`, so those questions were blank on host /
    cast / PPTX. Now render everywhere.
  - Type sizes bumped for legibility (question 46→52, MC option 28→32); the
    "dense" compact MC layout now triggers at 6+ options (was 5) so 4- and
    5-option slides look consistent, with `autoFitStageText` catching any that
    still run tall. Title-slide logo/QR enlarged.

### Still open

0. **PPTX slide order for manual presentation** (Josh, 2026-09-01 — not now).
   The backup `.pptx` currently emits slides in raw show order (with live +
   reveal pairs). For actually running a show off the deck manually, the slide
   sequence needs reorganizing — figure out the desired presentation order
   (e.g. round intro → all Qs → all reveals? / per-question live then reveal?
   / drop the answers-summary?) and reorder in `downloadEmergencyDeck` /
   `flattenSlidesForExport`. Get the target ordering from Josh first.

0b. **Image questions — insertion + placement controls** (Josh, 2026-09-01).
   - Test the existing image-question path end to end: upload → stored URL →
     renders in writer preview / host stage / cast / PPTX. `renderMedia` in
     slide-paint.js handles `questionType === "image-question"` with
     `slide.imageUrl` (slide-model carries `imageUrl`? verify — it may need
     adding to `flattenShow`). Check the writer upload UI actually persists.
   - Add Google-Slides-style **resize + move** controls for the image on the
     slide (drag to reposition, corner handles to scale), persisted per slide
     (new fields e.g. `imageRect: {x,y,w,h}` or scale/offset). Both the writer
     preview (interactive) and the read-only surfaces (host/cast/PPTX) must
     honour the stored geometry. This is real feature work, not a tweak.
1. **The two stylesheet copies** — `shared/preview-stage.css` and
   `writer/style.css` carry the same `.slide-*` rules and every change now has
   to be mirrored by hand (done 3× on 2026-09-01 alone). Make `writer.html`
   load `preview-stage.css` and delete the dupes from `style.css` (keep only
   the writer-only `.preview-stage-wrap` / inline-edit / filmstrip rules).
2. **Writer serialization** — `serializeShowForSave` doesn't copy the form's
   `orderingItems` / `matchingPairs` onto `block` / `block.slides`, so the data
   only survives under `formData.block`. `flattenShow` now compensates, but the
   serializer should be fixed so the published `block` is self-contained.
3. **`slide-paint.js` local `DISPLAY_BLOCK_TYPES`** — still a 4-item literal
   (leaf file, `/cast-game` loads it without slide-model.js). Low value.
4. **Writer mobile override** — `@media` block sets
   `.preview-stage-wrap .slide-question { font-size: clamp(18px, 8vw, 36px) }`
   which fights the fixed-canvas sizing on phones. Revisit once the canvas
   approach is settled.
