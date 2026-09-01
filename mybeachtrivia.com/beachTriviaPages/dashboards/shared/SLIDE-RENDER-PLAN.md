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

### Next session starts here

- Step 2: writer preview → `slide-paint.js`. In `writer/js/preview.js`, add a
  `formData → normalized slide` adapter (one block), call
  `BeachTriviaSlidePaint.paintSlide` for the visual layer, keep
  `applyPreviewInlineChrome` running after it as the edit layer. Flag-gate the
  old path (`renderFromFormData` internals) until every question type ×
  {live,reveal} is verified against the host stage.
- The writer preview stage skeleton and slide-paint's `buildSkeleton` must
  agree on element classes — diff `.preview-stage` markup in writer.html vs
  what `buildSkeleton` creates before starting.
