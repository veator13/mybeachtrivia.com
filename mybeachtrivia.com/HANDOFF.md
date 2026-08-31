# HANDOFF — branch `shift-swap-timeoff`

_Last updated: 2026-08-31. Written to continue this work in a fresh chat._

---

## 0. TL;DR

Three things live on this branch, all **deployed to the staging preview channel only, never to production**:

1. **Host shift-swap + time-off feature** (Phases 0–8) — built, staging-tested green. Spec: [`SHIFT-SWAP-TIMEOFF-SPEC.md`](SHIFT-SWAP-TIMEOFF-SPEC.md).
2. **Mobile nav** — the hamburger was broken site-wide; replaced with a working "waffle" (3×3) menu + drawer.
3. **Mobile rework of the host calendar and the scoresheet** — both were unusable on a phone; now have dedicated mobile layouts.

**Nothing has been merged to `main`. Do not deploy to the live site until Josh explicitly says so.**

---

## 1. The preview (staging) website

| | |
|---|---|
| **URL** | `https://beach-trivia-website--staging-dhujjmqc.web.app` |
| **What it is** | A Firebase Hosting *preview channel*. Code is sandboxed to this URL. |
| **Data** | Shares the **real production** Firestore, Cloud Functions, Auth, and Resend. Code is isolated; data is not. Be careful with writes. |
| **Deploy command** | From `mybeachtrivia.com/`: `firebase hosting:channel:deploy staging --expires 30d` |
| **Channel expiry** | ~30 days from the last deploy; every deploy re-extends it. If it expires, just deploy again. |
| **Login** | Same accounts as production (see §6). |

### Deploy rules (hard constraints)

- **Hosting:** `firebase hosting:channel:deploy staging --expires 30d` **only**. Never `firebase deploy` (that hits live).
- **Cloud Functions:** `firebase deploy --only functions:<name>` **only**. **NEVER** bare `firebase deploy --only functions` — it will **delete `hostGetCalendarMonth`**, which is deployed but has no source in the repo.
- **Firestore rules / indexes:** `firebase deploy --only firestore:rules` / `firebase deploy --only firestore:indexes` — these DO affect production immediately (rules aren't channel-scoped). Only deploy rules when a rules change is actually needed and reviewed.
- `firebase firestore:delete` is blocked for the assistant. Ask Josh to run those.

### Firebase project

- Project: `beach-trivia-website` (Blaze plan), account `joshuaveator@gmail.com`.
- Functions source: `functions_gcfv1/` (NOT the top-level `functions/`).
- Git repo root is **one level above** `mybeachtrivia.com/` (`.../mybeachtriviaREPO/`). Run `git add` from there.
- **Do not stage** these pre-existing/unrelated changes: `beachTriviaPages/dashboards/host/js/export-show-pptx.js`, `.fuse_hidden0000000c00000001`, any `.claude/` directory.

---

## 2. Branch state

- Branch: `shift-swap-timeoff` (branched off `leads-feature`, which was off `main`).
- **~102 commits ahead of `main`.** This includes the **entire Leads admin feature** and older scoresheet work (standings pop-out, zebra striping, Feud score caps) inherited from `leads-feature` — not just this session's work.
- **Merge implication:** merging `shift-swap-timeoff` → `main` ships Leads + shift-swap/time-off + all the mobile work in one go. When Josh is ready, discuss whether to merge the whole thing or cherry-pick. He is **not ready yet.**
- Working tree is clean except the 3 do-not-touch items above.

---

## 3. Work stream status

### 3a. Shift-swap + time-off feature — Phases 0–8

Full design + phase-by-phase status is in [`SHIFT-SWAP-TIMEOFF-SPEC.md`](SHIFT-SWAP-TIMEOFF-SPEC.md). Summary:

| Phase | What | Status |
|---|---|---|
| 0 | Nav notification bell rebuilt on a server-written `notifications` collection | ✅ done, staging-tested |
| 1 | Data model + Firestore rules + indexes (`timeOffRequests`, extended `shiftCoverageRequests`, `employees.fcmTokens`) | ✅ deployed (rules + indexes ARE live) |
| 2 | Host shift-swap UI (open pool vs direct-to-host, Mon–Sat week lock) | ✅ done |
| 3 | Admin approve/reject swap (`approveShiftSwap` / `rejectShiftSwap` — shift moves only on approval) | ✅ done |
| 4 | Host time-off request UI (`bt-time-off.js`, new `host/time-off/` page) | ✅ done. **Fixed a real rules security hole** — see spec §Phase-4. |
| 5 | Admin time-off review (`approveTimeOff` / `denyTimeOff`, shift-conflict popup) | ✅ done |
| 6 | Calendar visuals — host sees own approved time off (amber day), admin picker greys hosts with overlapping time off | ✅ done |
| 7 | Admin "Requests" audit page (`admin/requests/`) — read-only Time Off + Shift Swaps tabs | ✅ done |
| 8 | Sun/Mon uncovered-shift digest + FCM web push + email backup | ✅ **built + staging-tested**, two follow-ups below |

**Deployed functions** (verified present 2026-08-31): `approveShiftSwap`, `approveTimeOff`, `denyTimeOff`, `hostGetCalendarMonth`, `ingestLeadResearch`, `onCoverageRequestWrite`, `onHostNotificationCreate`, `onSwapNotificationWrite`, `onTimeOffRequestWrite`, `rejectShiftSwap`, `runShiftOfferDigestNow`, `shiftOfferDigest`.

#### Phase 8 — remaining follow-ups

**Email backup (Resend) — working, verified delivered.**
- `functions_gcfv1/notify-channels.js` `sendEmail()` POSTs `https://api.resend.com/emails/batch` (Bearer `RESEND_API_KEY`). Node 20 global `fetch`, no new dependency.
- `functions_gcfv1/.env` (gitignored, ships with the functions deploy) holds the
  real values — **do not paste secrets into this file, it is committed.** Keys:
  ```
  RESEND_API_KEY=<in functions_gcfv1/.env>
  BT_NOTIFY_EMAIL_FROM=onboarding@resend.dev
  BT_NOTIFY_EMAIL=test
  BT_NOTIFY_EMAIL_ALLOWLIST=joshuaveator@gmail.com,13berner13@gmail.com
  ```
- Delivery gate: `test` = only allowlisted addresses get mail; `live` = everyone; anything else = log only.
- **`onboarding@resend.dev` (the Resend sandbox sender) only delivers to the Resend account owner (joshuaveator@gmail.com).**
- **TODO (Josh):** verify the `mybeachtrivia.com` domain in the Resend dashboard (add SPF/DKIM/DMARC DNS records) → then set `BT_NOTIFY_EMAIL_FROM=noreply@mybeachtrivia.com`. Until then only Josh's address can receive.
- **TODO (on sign-off):** set `BT_NOTIFY_EMAIL=live` in `.env` + `firebase deploy --only functions:onCoverageRequestWrite,functions:onHostNotificationCreate,functions:onTimeOffRequestWrite,functions:shiftOfferDigest,functions:runShiftOfferDigestNow`.
- Note: `adminCreateEmployee`'s welcome email in `functions_gcfv1/index.js` still uses the **dead** old SendGrid key. Separate path, not migrated. Easy follow-up: route it through `notify-channels.sendEmail`.

**FCM web push — plumbed, VAPID key set, not device-tested.**
- VAPID key is set in `beachTriviaPages/js/bt-push-config.js` (`window.BT_VAPID_KEY = "BH1tYhBcwy7X..."`). It's a public key, safe to commit.
- `firebase-messaging-sw.js` at site root, registered at scope `/firebase-cloud-messaging-push-scope` (deliberately narrow so it never collides with the scoresheet `/sw.js` at scope `/`).
- `bt-push.js` = the "🔔 Turn on notifications" toggle (host calendar, time-off page, admin calendar). It's a real on/off toggle: grey "Turn on notifications" ↔ green "Turn off notifications", persisted per-device in `localStorage['bt:pushOn']`. `BtPush.disable()` deletes the token + `arrayRemove`s it.
- **Push is per-device, per-browser.** Turning it on in Chrome-on-Mac does not affect the phone.
- **TODO (Josh):** real device test. Desktop Chrome + Android just tap "Allow". **iOS: Add the site to the Home Screen first, open from that icon (iOS 16.4+), then enable.** Then confirm a server-side event (e.g. a time-off submission) actually produces a push. The test burner account is host+writer (not admin), so to trigger a push aimed at it you need an admin action on one of its requests.

**Phase 9 — discussed, NOT built.** Sunday-noon "here's your week" email to every host + one-tap confirm (link → login → confirm page) + admin "who confirmed" view. Needs its own data model, tokenised confirm flow, and admin view.

#### Firestore cost — checked, fine

All client listeners are scoped (bell `limit(30)` + pauses on hidden tab; host calendar month-bounded; coverage offers 7-day window; notif fan-out ≈ 1 write per recipient per event). Estimate ~15–25k reads/day, ~200–300 writes/day — well inside the 50k / 20k free tier. **Cheap improvement still open:** the admin **Requests** page runs two *unbounded* collection listeners (`timeOffRequests` + `shiftCoverageRequests`, no `.limit()`) — add `.limit(150)` + a "show older" control before those collections grow. Also recommend Josh set a ~$1/mo Google Cloud billing budget alert.

### 3b. Mobile nav — done, site-wide

- Root cause of "can't navigate on a phone": the `@media (max-width:768px)` rule in `beachTriviaPages/js/bt-nav.css` set `.bt-nav__hamburger { display:flex }` at a lower specificity than the base `#bt-nav .bt-nav__hamburger { display:none }`, so the menu button was invisible on every page. Fixed by scoping the responsive rules under `#bt-nav`.
- The button is now a **waffle / 3×3 app-grid SVG** (shows an X while the drawer is open). Both icons are inline SVG so page-level `button{background}` CSS can't bleed in. The notification bell stays visible on mobile (only the desktop link row + user chrome are hidden).
- Drawer closes on outside tap / Escape.
- **Cache-bust (changed 2026-08-31):** the 27 pages no longer hand-write the
  `bt-nav.css` / `bt-nav.js` tags. Each page has one line —
  `<script src="/beachTriviaPages/js/bt-head.js"></script>` — and
  **`beachTriviaPages/js/bt-head.js`** `document.write`s the shared tags with a
  content-hash `?v=`. bt-head.js is served `no-cache` (firebase.json) so a
  bt-nav change reaches every page on the next load. **After editing
  `bt-nav.js` or `bt-nav.css`, run `node tools/cachebust.mjs`** (re-stamps the
  hash into bt-head.js) before deploying — no more site-wide `sed`.
  `node tools/cachebust.mjs --check` is a pre-deploy/CI guard.
  `sw.js` bypasses `bt-head.js` / `bt-nav.*` entirely, so the scoresheet SW
  can't serve them stale.

### 3c. Host calendar — mobile agenda — done

- `beachTriviaPages/dashboards/host/employee-calendar/js/mobile-agenda.js` (new). At `<= 768px`, `style.css` hides `table#calendar` + `.calendar-container` + `#calendar-loading` and shows `#calendar-agenda` (a div the JS creates after `.calendar-container`).
- One `.agenda-day` card per day-that-has-shifts, for the month in `window.state`. Shifts rendered via `window.createShiftElement()` so tapping one opens the same read-only detail modal (there's a document-level `.shift[data-id]` click delegate).
- Re-renders by wrapping `window.renderCalendar` (guard `window.__HOST_AGENDA_HOOK__`) + on `resize` / `orientationchange`.
- Sticky **week jump-bar** (Today chip + one chip per week), **past days auto-collapse** (header only, dimmed, tap to expand), and it **auto-scrolls to today** on landing.
- Mobile control stack compacted: month nav one row, 3 selectors side-by-side, Expand/Collapse-All hidden, action buttons 2-up.
- Only the **host** calendar. The admin calendar is unchanged (desktop tool).
- Verified with real data: 23 day cards, 117 shift tiles, 22 past days collapsed, no errors.

### 3d. Scoresheet — mobile rework — done, regression passed

Files: `beachTriviaPages/dashboards/host/scoresheet/js/mobile-scoring.js` (new), `style.css` (`@media (max-width: 820px)` block near the bottom), `index.html`, and `sw.js` (cache versioning).

- **Root cause of "can't scroll / can't enter scores":** `main { zoom: 0.8 }` (a desktop table-fit trick) breaks tap hit-testing and scroll containers on iOS Safari. Fixed with `main { zoom: 1 !important }` at `<=820px`.
- **View dropdown** (custom combobox reusing the `.venue-combo*` classes so it matches the Venue picker): **Team Names & Like 👍🏼 / Round 1–4 / Half Time / Final Question / Results — Bonus & Final**. Selecting a view sets `#teamTable[data-mview="..."]`; CSS then hides every column except the frozen team column + that view's columns, using `:has()` selectors on the input classes `table-build.js` already emits (`.round1-input`, `span[id^="r2Total"]`, `.halftime-input`, `.fq-cell-td`, `.bonus-col-right`, `.sticky-col-right`, …). **No change to `table-build.js` or the scoring model.** Choice persisted in `localStorage['bt:scoresheetMView']`.
- Score inputs enlarged to ~44×42px (were 30×25); FQ / Half Time inputs and the team-name display field tuned per Josh's feedback (currently: team-name 130px, FQ input ~74px, total column trimmed, all fits with no horizontal scroll).
- Second **"+ Add Team"** button below the list (calls `window.addTeam()`, scrolls the new row into view).
- Button row tidied: `[Add Team | Standings]`, then full-width search + Search, then full-width Submit Scores.
- Standings modal on mobile: 96vw × 90vh; **fullscreen + pop-out hidden** (projector features); **auto-scroll ⏸ kept** so a host can cast the phone to a TV.
- **Desktop is untouched** — every rule is inside `@media (max-width: 820px)` and the view-bar JS only injects when `matchMedia("(max-width: 820px)")` matches. Josh confirmed desktop still works.
- **Regression (2026-08-31, staging, mobile viewport, logged in):** all 8 views show correct columns; scoring math correct; grid-enforcer blur-fill-with-zero works; venue combo (24 venues) + event-type combo populate on focus; bottom Add Team works; view combobox opens/selects/updates; standings modal opens/closes; search matches + highlights; sort A→Z reorders; no console errors; `main` zoom = 1.

#### Scoresheet service-worker gotcha (important)

`/sw.js` caches all `/beachTriviaPages/js/` + all scoresheet assets **stale-while-revalidate**, keyed to `ASSET_V`. It also stores a canonical no-`?v=` cache key, so a fresh `?v=` still hits the stale entry on the first load.

**To make any scoresheet CSS/JS change actually reach users:**
1. Bump `ASSET_V` in **both** `sw.js` (const near the top, currently `"20260831-mobile23"`) **and** `beachTriviaPages/dashboards/host/scoresheet/index.html` (`window.__SCORESHEET_ASSET_V__`, line ~10). Keep them identical.
2. Update the `?v=` on the changed file(s) in `index.html`.
3. If you add a **new** scoresheet file, also add it to `PRECACHE_URLS` in `sw.js`.
4. Deploy. First reload after deploy may still be stale (SWR); a second reload or a hard-refresh gets it. For testing, unregister the SW + clear caches.

**Another gotcha:** the scoresheet has a `beforeunload` "unsaved changes" guard (`js/main.js` + `js/grid-enforcer.js`). If there are unsaved edits, programmatic navigation is blocked. To reload during testing: clear `window.dataModified`, `window.ScoresheetState.isDirty`, override `window.ScoresheetState.isModified = () => false`, then navigate — or just open a fresh tab.

---

## 4. Key gotchas / conventions (all streams)

- **Firestore rules:** use `affectedKeys()` not `changedKeys()` for any `.hasOnly()` — `changedKeys()` excludes newly-added keys, which was an exploitable hole (fixed in Phase 4).
- **Cloud Functions:** never bare `--only functions` (deletes `hostGetCalendarMonth`).
- **Service workers:** `/sw.js` (scoresheet offline) owns scope `/`. Registering anything else at `/` replaces it. The FCM SW uses a deliberately narrow scope.
- **`bt-nav.css` / `bt-nav.js`:** now included on every page via
  `beachTriviaPages/js/bt-head.js` (one `<script>` line per page). After editing
  either, run `node tools/cachebust.mjs` before deploying — do **not** hand-edit
  `?v=` on the pages any more. (See §3b.)
- **Smoke tests:** `e2e/` (Playwright). `cd e2e && npm install && npx playwright
  install chromium`, then `npm test` (public checks) or with
  `BT_HOST_EMAIL`/`BT_HOST_PASSWORD` set for the authed host checks. Targets
  staging by default.
- **Chrome date quirk:** `date.toLocaleDateString({ day, year })` renders as `"YYYY (day: N)"` — build date-range strings manually.
- **`:has()` in CSS:** used in the scoresheet mobile block. Fine for current browsers (Safari 15.4+, Chrome 105+).
- **CSP** (`firebase.json`): allows `https://www.gstatic.com` (scripts), `https://*.googleapis.com` / `https://*.gstatic.com` (connect) — enough for FCM. Also carries an unrelated pre-existing `https://accounts.spotify.com` frame-src addition.
- Auto-commit + auto-deploy-to-staging after each change is the working rhythm for this branch. Keep replies concise.

---

## 5. What's left, in rough priority order

1. **Josh test pass on his phone** across the mobile scoresheet + mobile calendar + waffle nav.
2. **Phase 8 email:** verify `mybeachtrivia.com` in Resend (DNS), switch `BT_NOTIFY_EMAIL_FROM`.
3. **Phase 8 push:** real device test (iOS = Add to Home Screen first).
4. **Phase 8 go-live prep:** `BT_NOTIFY_EMAIL=live` + redeploy the 5 functions — only on Josh's sign-off.
5. **Cheap cleanup:** ~~`.limit(150)` on the admin Requests page listeners~~ (done
   2026-08-31, commit `eb27c59`); migrate `adminCreateEmployee` welcome email to Resend.
6. **Merge decision:** how to get this to `main` / production (whole branch vs cherry-pick — it also carries the Leads feature). **Not yet.**
7. **Phase 9** (Sunday weekly-schedule + confirm email) — separate build.
8. Optional: PWA polish (`manifest.json`) for a nicer iOS Add-to-Home-Screen.
9. **Rotate the `RESEND_API_KEY`** — it was pasted into `HANDOFF.md` (commit
   `e900ac0`) while that file was being served publicly at
   `https://<site>/HANDOFF.md`. The public exposure is fixed (repo `.md` docs are
   now in the hosting `ignore` list → 404, commit `f4850da`) and the key is
   redacted from HANDOFF, but it still sits in git history. Low urgency — the
   site is obscure and staging-only — but do it before this branch reaches
   production. New key → `functions_gcfv1/.env` → `firebase deploy --only
   functions:<the 5 notify fns>`.
10. **Node 20 / firebase-functions@4 EOL:** functions runtime Node 20 is
    decommissioned **2026-10-30**; `firebase-functions` 4.9 is past EOL. Upgrade
    the `functions_gcfv1` codebase (own task, repo-wide) before end of October.

---

## 6. Test accounts

| Who | Email | Roles | Notes |
|---|---|---|---|
| Josh | `joshuaveator@gmail.com` | all roles + `admin` custom claim | uid `XLFAp4q2XaYuLD7dxcgxAB5efFO2` |
| Burner | `13berner13@gmail.com` | `host`, `writer` (NOT admin) | uid `BT6rthbMrCSiwVkwZvJogh9MU7A3`, display name "Ja Vtr" |

Both are on `BT_NOTIFY_EMAIL_ALLOWLIST`.

Scoresheet / calendar pages allow **anonymous** auth as a fallback — if the real session drops, the page loads but role-gated reads (e.g. `locations` for the venue list) return "Missing or insufficient permissions". Fix = sign out / sign back in.

---

## 7. Reference docs in the repo

- [`SHIFT-SWAP-TIMEOFF-SPEC.md`](SHIFT-SWAP-TIMEOFF-SPEC.md) — full feature design, data model, rules, phase notes, test results.
- [`CLAUDE.md`](CLAUDE.md) — repo context (mostly the Leads automation).
- `firestore.rules` — `isAdmin()` / `isHostOrAdmin()` helpers; `locations` = host-or-admin read, admin write.
