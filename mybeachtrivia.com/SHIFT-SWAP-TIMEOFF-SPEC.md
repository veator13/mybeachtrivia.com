# Shift Swaps & Time Off — Spec

Working reference for the host shift-swap + time-off feature. Built on the
`leads-feature` branch work is separate; this feature has its own branch.
Deploy to the **staging** Firebase Hosting channel only until signed off
(`firebase hosting:channel:deploy staging --expires 30d`).

Status: **design agreed 2026-08-30. Phase 0 (bell rebuild) built, deployed, and
live-tested on staging 2026-08-30 — all notification paths verified end to end
(open-offer fan-out, offer-claimed, swap-pending-admin, swap-rejected; badge +
dropdown render; readAt persistence).** Branch: `shift-swap-timeoff` (off
`leads-feature`).

**Phase 1 done 2026-08-30** — data model, rules, and indexes for the swap +
time-off collections deployed (additive; nothing broke).

**Phase 2 done 2026-08-30** — host swap UI (open/direct picker, Mon–Sat week
lock, accept → pending_admin without moving the shift). Deployed + tested on
staging.

**Phase 3 done 2026-08-30** — admin approve/reject. `functions_gcfv1/shift-swap.js`
(`approveShiftSwap` / `rejectShiftSwap`), rewritten `shift-swap-admin.js`,
`shifts` host self-update rule removed. Staging-tested green (see below). The old
`shiftSwapNotifications` collection + `onSwapNotificationWrite` function are now
dead (nothing writes them) — left deployed, harmless; `admin-dashboard.js` and
`shift-trade-requests.js` no longer reference them.

**Phase 0–2 regression sweep done 2026-08-30 — GREEN.** Verified on staging:
- Rules boundary (as a pure host): cannot read others' notifications, cannot
  create/delete notifications, cannot `pending_admin → approved`/`rejected`
  (the Phase 3 gate holds), cannot self-accept an offer, cannot write arbitrary
  `shifts` fields, cannot create time-off for another host / pre-approved /
  bad-range / self-approve. Legit paths (own cancel, own time-off create+cancel,
  accepting another host's open offer) all pass.
- Week-lock math: correct for all 9 boundary dates (Sun today → everything
  ≤ today locked, next Mon onward open).
- Bell: badge live-updates without reload; opening pins the unread set (dots
  stay) and clears the badge; outside-click / Escape close; state now driven by
  an `_ntfOpen` boolean so a stray click can't desync the toggle. bt-nav.js
  cache-bust normalised to `?v=hostnav-20260830-bell` on all 25 pages.
- `onHostNotificationCreate` still mirrors admin assign/remove/reassign to the
  bell. Admin calendar loads clean (117 shifts, no errors), `ShiftSwapAdmin`
  present.
- Rule tightened: `open → pending_admin` now also needs
  `requestingHostId != auth.uid`.

Known, non-blocking for Phase 3:
- Orphan coverage-request cleanup (`filterOrphans` setting `shift_deleted`) only
  works when an **admin** views — a host lacks the rule for that status write.
  Phase 3's approve CF should handle a missing shift server-side.
- `notifications` still has no TTL; test + real docs accumulate.
- Bell listener still pauses on a foreground→background transition and catches
  up on refocus.

**Phase 3 staging test 2026-08-30 — GREEN:**
- Approve (from the admin panel) → shift `employeeId` moves to the accepting host,
  request `approved`, both hosts notified, admin calendar reloads.
- Reject (inline reason form) → request `rejected` + `rejectionReason`, shift
  untouched, both hosts notified.
- Orphan (shift deleted) → hidden from the panel; CF refuses and closes the
  request as `shift_deleted`.
- Sibling supersede → approving one offer auto-`cancelled`s the other open/
  pending offers for the same shift; CF then refuses to approve the superseded one.
- Already-reassigned guard → CF refuses, closes the request `rejected`, does NOT
  clobber the shift's current `employeeId`.
- CF only acts on `pending_admin`; rejects everything else.
- **Bug found + fixed:** `approveShiftSwap` threw from inside the Firestore
  transaction for the "shift missing / reassigned" cases, which rolled back the
  very write that closes the request (left it stuck at `pending_admin`). The
  transaction now returns an outcome; the close-out write + `HttpsError` happen
  after commit.

**Phases 0–4 full test pass 2026-08-30 — GREEN (one security fix).**
- **Security fix (deployed):** Firestore `changedKeys()` does NOT include
  newly-added keys, so `changedKeys().hasOnly([...])` let a caller sneak extra
  fields into an update. The `shiftCoverageRequests` accept branch had no key
  restriction at all → a host accepting an open offer could re-point
  `shiftId` + `requestingHostId` and get an admin to approve a stolen shift.
  Fixed: accept/cancel branches now `affectedKeys().hasOnly([...])` + pin
  `requestingHostId`/`shiftId`; create requires the shift to exist and belong to
  the requester; `notifications` + `timeOffRequests` + `employees` self-update
  switched to `affectedKeys()`. Re-verified: the re-point attack, junk-field
  injection, cancel-with-extra-field, notification-field injection all denied;
  legit accept/cancel/mark-read/self-edit still pass.
- Full swap lifecycle via the real UI: open offer → 2nd host Accept →
  admin Approve → shift moves; direct offer → target Accept → admin Approve →
  shift moves back; admin Reject with reason; locked-week open offer blocked
  (radio disabled + message), direct switch allowed; cancel at open stage.
- Time off via the real UI: submit (>2wk and <2wk with warning), cancel a
  pending request, cancel an admin-approved request (no approval needed),
  cross-host privacy (a host cannot read another host's requests),
  `subscribeMine` returns only your own.
- Regression: admin calendar shift create/edit/delete still work; admin +
  host calendars render with no console errors; bell opens/closes and lists on
  the host dashboard, scoresheet, admin calendar; "Time Off" nav item present
  on every host page.

Phases 6 & 7 done 2026-08-30 (host amber time-off days + admin host-picker
grey/sink/warn; admin "Requests" audit page). Next: Phase 8 (Sun/Mon digest,
FCM push, email backup) — the last phase.

Phase 0 follow-ups (not blockers):
- `notifications` has no TTL/cleanup yet — an open offer fans out ~1 doc per host.
  Add `expiresAt` + a Firestore TTL policy (or a scheduled prune) before this sees
  heavy use. Spec §0 already lists `expiresAt`.
- Bell listener pauses while the tab is `hidden` (inherited read-cost
  optimization); it catches up on focus. Fine for now.
- Node 20 / `firebase-functions@4` are past EOL — upgrade the functions codebase
  (repo-wide, separate task).

---

## 0. Phase 0 — notification / bell rebuild (do first)

The current bell is glitchy and must be rebuilt before the swap/time-off work,
because those features add many new notification types.

### Current state (why it's broken)
- `beachTriviaPages/js/shift-bell-refresh.js` — **dead code**, not loaded by any
  page. Delete it.
- `beachTriviaPages/js/bt-nav.js` — the live bell (~800 lines, loaded on ~25
  pages). Reads **three** collections directly from the client
  (`shiftCoverageRequests`, `shiftSwapNotifications`, `hostNotifications`),
  filters client-side, and runs orphan-cleanup **writes during reads**.
- Seen-state tracked **three ways**: `userBellState.lastSeenAt` (Timestamp),
  `userBellState.lastSeenAtMs` (number), `localStorage['bt:bellSeenAtMs']`,
  reconciled with `Math.max` → phantom / sticky counts.
- Consumers of `window.BtNavBell`: `shift-trade-requests.js`
  (`.refresh`/`.setOffersData`/`.claimOffersListener`), `shift-swap-admin.js`
  (`.refresh`), `shift-service.js` (writes `hostNotifications` +
  `userBellState.unreadCount`).

### New model
**One collection, per-recipient, written server-side.**

`notifications/{id}`:
| field | notes |
|---|---|
| `recipientId` | uid this notification is for (one doc per recipient — fan-out happens server-side) |
| `type` | enum — `shift_offer_open`, `shift_offer_direct`, `shift_offer_claimed`, `shift_offer_cancelled`, `shift_offer_uncovered`, `swap_pending_admin`, `swap_approved`, `swap_rejected`, `shift_assigned`, `shift_removed`, `shift_reassigned`, `timeoff_submitted`, `timeoff_approved`, `timeoff_denied`, `timeoff_conflict` |
| `title`, `body` | rendered text, built server-side |
| `link` | in-app URL the card opens |
| `data` | payload — `{ shiftId, requestId, shiftDate, startTime, endTime, location, eventType, fromHostName, toHostName, ... }` |
| `createdAt` | serverTimestamp |
| `readAt` | `null` until the recipient opens the bell (per-doc, no global cutoff) |
| `expiresAt` | optional TTL for auto-cleanup (Firestore TTL policy on this field) |

- **Badge count** = `notifications where recipientId == uid && readAt == null`.
- **Open bell** → live-listen the recipient's latest ~30, newest first. On open,
  batch-set `readAt` on the unread ones.
- No client ever reads `shiftCoverageRequests` / `shiftSwapNotifications` /
  `hostNotifications` for the bell again.

### Server side (`functions_gcfv1/`, gen 1, Node 20)
New file `notifications.js`. Firestore triggers materialise `notifications` docs:
- **`onWrite shiftCoverageRequests/{id}`** —
  - created, `status:"open"`, `offerType:"open"` → one doc per **other active
    host** (needs Admin SDK to list `employees`).
  - created, `offerType:"direct"` → one doc for `targetHostId`.
  - → `pending_admin` → one doc per **admin**.
  - → `approved` / `rejected` → docs for requester + accepter.
  - → `cancelled` → doc for accepter (if any).
- **`onCreate hostNotifications/{id}`** → mirror to `notifications` for
  `targetHostId` (keeps the existing admin-calendar assign/remove/reassign flow
  working with zero changes to `shift-service.js`). *Later:* move that logic here
  and drop `hostNotifications`.
- Digest + time-off + FCM/email sends are added in Phase 8; the collection and
  bell are built to carry them now.

### Client side
- New `beachTriviaPages/js/bt-notifications.js` — the single bell module:
  renders the bell button + dropdown, one live listener on
  `notifications` (own `recipientId`), badge = unread count, "Mark all read".
  Exposes a thin `window.BtNavBell` shim (`refresh` = no-op/re-render;
  `setOffersData`/`claimOffersListener` = no-ops) so existing callers don't break
  during migration.
- Strip the bell code out of `bt-nav.js`; it just mounts the button element and
  calls `BtNav.mountBell()`.
- Delete `shift-bell-refresh.js`.
- `shift-trade-requests.js` / `shift-swap-admin.js`: drop the `setOffersData` /
  `claimOffersListener` plumbing; they keep their own in-page panels but no
  longer feed the bell.

### Rules + indexes
- `notifications`: `allow read, update(readAt only): if recipientId == uid`;
  `allow create, delete: if false` (server-only; Admin SDK bypasses).
- Index: `notifications` (`recipientId` ASC, `createdAt` DESC).
- Keep `userBellState` for now (unread mirror) but the bell no longer depends on
  it; retire once `shift-service.js` is migrated.

---

## 1. What already exists (as of 2026-08-30)

- `beachTriviaPages/dashboards/host/employee-calendar/js/shift-trade-requests.js`
  — host "Request Coverage" → creates `shiftCoverageRequests` doc (`status: "open"`);
  "Shift Offers" panel; **Accept** button.
- `beachTriviaPages/dashboards/admin/calendar/js/shift-swap-admin.js`
  — admin bell + "Shift Swap Notifications" modal.
- Collections in use: `shiftCoverageRequests`, `shiftSwapNotifications`.
- Firestore rules: `shifts`, `shiftCoverageRequests`, `shiftSwapNotifications`
  (rules lines ~401–450); composite indexes on both request collections
  (`status` + `createdAt`).
- **Behaviour today that must change:** host **Accept** *immediately* reassigns
  the shift (`shifts.employeeId`) and admin can only **Reject** after the fact.
  New model: Accept only *proposes*; the shift does not move until an admin
  **Approves**.

---

## 2. Core rules (agreed)

### Week model
- Schedule week = **Monday–Saturday**. Sunday = no shifts, schedule-confirm day.
- A shift is **locked** when its date is before the *next* Monday.
  - On **Sunday**, the week starting the next day is still **open** (being confirmed).
  - **Monday morning** that week is **locked**.
- Precise: `firstUnlockedMonday` =
  - if today is Sunday → tomorrow (Monday);
  - else → Monday of the current Mon–Sat week **+ 7 days**.
  - Shift date `D` is **locked** iff `D < firstUnlockedMonday`.

### Shift offers — two types (host chooses)
| Type | Who can accept | Allowed in a locked week? |
|---|---|---|
| **Open offer** | Any host (pool) | **No** — blocked |
| **Direct switch** | One named host only | **Yes** |

- Both types are **give-aways** — the offering host gets **no shift in return**.
- A host may offer a direct switch to **anyone**; no event-type / location
  qualification check. Admin catches a bad match at approval.
- **Every** accepted offer (open or direct, any week) requires **admin approval**
  before the shift actually moves. The original host stays scheduled until then.

### Locked-week blocked message (open offer)
> **Shifts for this week are locked in.** To give up this shift, set up a direct
> switch with a specific host, or contact an admin.

### Direct switch with no response
- Stays open indefinitely; original host stays scheduled.
- The offer simply **expires at the shift's start time** if never accepted.
- No auto-nag. It is on the hosts to resolve.

### Open offer left uncovered
- Never auto-cancels; stays live.
- **Sunday morning:** admin gets a digest of open offers for the week *about to
  lock* that are still uncovered — handled during Sunday lock-in.
- **After lock:** any still-uncovered open offer whose shift is now in the locked
  week generates an admin notification ("submitted before lock, still uncovered").

---

## 3. Time off (agreed)

### Host request
- Host submits a **date range** (`startDate`–`endDate`, inclusive). **Full days only.**
- **> 2 weeks out** → submit → pending admin approval.
- **≤ 2 weeks out** → host sees a warning but may still submit:
  > **Time-off requests must be submitted at least two weeks in advance.** This
  > request falls inside that window, so approval is not guaranteed and it may be
  > denied. You may still submit it for admin review.
- The "inside 2 weeks" status is recorded on the request (for the admin badge and
  history), computed from `submittedAt` vs `startDate`.

### Host cancel
- Host can cancel their **own** time off — **pending or approved** — with **no
  admin approval**.
- Entry points:
  - **"Manage Time Off" modal** on the calendar page.
  - **"Time Off"** item in the host top-bar header (`bt-nav.js`, alongside
    Dashboard / Calendar / Scoresheet / Host Event) → dedicated page titled
    **"Manage Time Off"** (fuller view: upcoming + history of their own requests
    + statuses).

### Admin approval
- Admin queue shows all pending requests; those inside 2 weeks carry a visible
  **"Inside 2 weeks"** flag.
- **On approve**, the system checks that host's **assigned shifts overlapping the
  range**. If any exist, a popup lists them and the admin chooses per popup:
  - **Reassign** each shift to another host right there, **or**
  - **Resolve later**.
- **Resolve later** → each of those shifts is flagged; on the **admin calendar
  only** they render **red** ("scheduled host has approved time off then").
- The red flag clears when the shift is **reassigned** *or* the **time off is
  cancelled**.

### Admin scheduling against approved time off
- If an admin assigns a host to a new shift that overlaps that host's **approved**
  time off → **warn the admin** (allow override).
- In the admin host-picker dropdown, hosts with overlapping approved time off are
  **greyed out and sorted to the bottom** of the list.

### Calendar visuals
- **Host calendar:** a host sees **their own** approved time off only — never
  other hosts'. Rendered by making the **day-number background yellow** on those
  days (distinct from the grey default and from shift-type colours).
- **Admin calendar:** time-off-conflict shifts render **red** (see above). Admin
  time-off history lives on its own page, not the calendar.

### Admin "Requests" history page
- One admin page with two tabs: **Time Off** and **Shift Swaps**.
- **Time Off tab:** host, date range, date requested, inside-2-weeks flag, status
  (pending / approved / denied / cancelled), date reviewed, reviewed by (name),
  denial reason if any.
- **Shift Swaps tab:** offer type (open / direct), shift (date / location / type),
  from host, to host, date requested, date accepted, status (open / pending /
  approved / rejected / expired / cancelled), date reviewed, reviewed by (name).
- Both are read-only audit logs. Pending rows may carry the same approve/deny
  actions as the bell/modal (nice-to-have, not required v1).

---

## 4. Data model

### `shiftCoverageRequests/{id}` — extend existing
| field | notes |
|---|---|
| `shiftId`, `shiftDate`, `startTime`, `endTime`, `location`, `eventType` | existing snapshot fields |
| `requestingHostId`, `requestingHostName` | existing |
| `offerType` | **new** — `"open"` \| `"direct"` |
| `targetHostId`, `targetHostName` | **new** — set only when `offerType === "direct"` |
| `note` | existing |
| `status` | **new flow** — `open` → `pending_admin` → `approved` \| `rejected`; plus `cancelled`, `expired`, `shift_deleted` |
| `acceptingHostId`, `acceptingHostName` | set when a host accepts (status → `pending_admin`) |
| `acceptedAt` | **new** |
| `adminReviewedAt`, `adminReviewedBy`, `adminReviewedByName` | **new** |
| `createdAt`, `updatedAt` | existing |

**Key change:** the host Accept transitions `open → pending_admin` and **does not
touch `shifts`**. Only an admin approval (via Cloud Function) sets `approved` and
moves `shifts.employeeId`.

`shiftSwapNotifications` — keep as the admin-facing feed; a doc is created when a
request enters `pending_admin`. (Optional later cleanup: fold it into the request
doc and drop the collection.)

### `timeOffRequests/{id}` — new
| field | notes |
|---|---|
| `hostId`, `hostName` | |
| `startDate`, `endDate` | `YYYY-MM-DD`, inclusive, full days |
| `note` | optional host reason |
| `status` | `pending` → `approved` \| `denied`; plus `cancelled` |
| `submittedAt` | |
| `insideTwoWeeks` | bool, computed at submit (`startDate − submittedAt < 14d`) |
| `reviewedAt`, `reviewedBy`, `reviewedByName` | |
| `denialReason` | optional |
| `conflictResolution` | `null` \| `"resolved"` \| `"deferred"` — set at approval |
| `deferredShiftIds` | array of shift ids flagged "resolve later" |

### `employees/{uid}` — add
| field | notes |
|---|---|
| `fcmTokens` | **new** — array of web-push tokens, one per device. Added on permission grant, pruned on send failure. Host-writable on own doc (add to `selfAllowedKeys()`). |

### `shifts/{id}` — add
| field | notes |
|---|---|
| `timeOffConflict` | bool — true when the assigned host has approved time off overlapping this shift and the admin chose "resolve later". Drives red styling on the admin calendar. Cleared on reassign or time-off cancel. |
| `timeOffRequestId` | id of the request that caused the flag (so cancel can clear it) |

---

## 5. Security rules (changes)

- **`shifts`** — remove the host self-update of `employeeId`. Shift reassignment
  happens only via admin or Cloud Function. Admin may also set
  `timeOffConflict` / `timeOffRequestId`.
- **`shiftCoverageRequests`**
  - create: host = `requestingHostId`; `status == "open"`; if `offerType ==
    "direct"` then `targetHostId` required.
  - update `open → pending_admin`: caller is `targetHostId` (direct) or any
    host/admin (open); must set themselves as `acceptingHostId`.
  - update to `approved` / `rejected`: **admin only** (Cloud Function).
  - update to `cancelled`: the `requestingHostId` only, and only from
    `open` / `pending_admin`.
- **`timeOffRequests`**
  - create: host = `hostId`; `status == "pending"`.
  - update to `cancelled`: the `hostId` only (any non-terminal status).
  - update to `approved` / `denied` and all conflict fields: **admin only**.
  - read: the owning host, or admin. (Hosts never read other hosts' time off —
    the host calendar's yellow days come only from the caller's own requests.)

Composite indexes: `timeOffRequests` on (`status`,`startDate`),
(`hostId`,`startDate`); `shiftCoverageRequests` add (`status`,`offerType`,`shiftDate`).

---

## 6. Cloud Functions (`functions_gcfv1/`)

`onCall` with the existing admin-check helper:

- **`approveShiftSwap({ requestId })`** — admin only. Validates request is
  `pending_admin` and the shift still exists / still belongs to the original host;
  moves `shifts.employeeId` → accepting host; sets request `approved`; resolves
  the `shiftSwapNotifications` doc.
- **`rejectShiftSwap({ requestId, reason? })`** — admin only. Sets `rejected`,
  leaves the shift untouched.
- **`approveTimeOff({ requestId, resolution, reassignments? })`** — admin only.
  `resolution: "resolved" | "deferred"`. For `"resolved"` apply the
  `reassignments` map (shiftId → newHostId). For `"deferred"` set
  `shifts.timeOffConflict = true` + `timeOffRequestId` on each overlapping shift.
  Sets request `approved`.
- **`denyTimeOff({ requestId, reason? })`** — admin only.
- **`cancelTimeOff`** — can be a client write (rules allow owner), but a function
  is cleaner because it must also clear `timeOffConflict` on any flagged shifts.

Scheduled (pub/sub — works on Blaze, unrelated to the Claude-routine limitation):

- **`shiftOfferDigest`** — runs **Sunday ~07:00** and **Monday ~07:00**
  America/New_York.
  - Sunday: collect open offers whose shift is in the week about to lock and still
    `status == "open"`; write one admin notification / digest.
  - Monday: same for offers whose shift is now inside the locked week.
  - Also fires the FCM + email sends (§7).

Each approve/deny/accept function also fans out notifications (bell doc + FCM +
email) to the affected host(s).

---

## 7. Notifications

Three channels, layered. Build 1, then 2, then 3.

### 7.1 In-app bell (primary, already exists)
Existing `BtNavBell` / `shiftSwapNotifications` pattern. Extend to carry time-off
events and the Sunday/Monday digest. Works with no host setup.

### 7.2 Web push via FCM (Firebase Cloud Messaging) — free, "feels like a text"
- Free, no message quota, standard Firebase feature. Delivered by Google; a
  service worker shows the notification even when the site/browser is closed.
- **Pieces to build:**
  - `firebase-messaging-sw.js` service worker + `manifest.json` (PWA installable —
    icon, name, theme colour).
  - Client: request notification permission on a user gesture, get the FCM token,
    save to `employees/{uid}.fcmTokens` (**array** — multiple devices per host).
  - Cloud Function sends to a host's tokens on each event (§6).
  - Stale-token pruning: on an FCM `messaging/registration-token-not-registered`
    error, remove that token from the array.
- **Host setup (one time):**
  - Android / desktop: open calendar → "Allow" on the prompt.
  - **iOS 16.4+ only, and only after "Add to Home Screen"** → open from the icon
    → "Allow". A plain Safari tab will not prompt. Deleting the home-screen icon
    stops push until re-added.
- Notifications land in the notification shade / lock screen (not the Messages
  app). Tap → deep-link into the calendar.

### 7.3 Plain email (backup, catches everyone)
- Covers hosts who never set up push (esp. iOS hosts who skip the home-screen
  step). Every host already has email with phone alerts.
- Free tier sender: Resend (100/day), Brevo, or MailerSend; or the Firebase
  "Trigger Email" extension. Send from a Cloud Function alongside the FCM send.

### Dropped: carrier email-to-SMS gateways
AT&T shut down `@txt.att.net` in mid-2025; Verizon/T-Mobile gateways filter free
senders into the void. Not worth building around. If true SMS is ever wanted,
Twilio at this volume is ~$1–2/month.

---

## 8. Build phases

0. **Notification / bell rebuild** — ✅ DONE (see §0). `notifications` collection,
   bell rewritten in `bt-nav.js`, `functions_gcfv1/notifications.js` triggers,
   `shift-bell-refresh.js` deleted.
1. **Data model + rules + indexes** — ✅ DONE 2026-08-30. Deployed to the shared
   backend (additive, non-breaking — legacy `open → approved` accept still
   allowed until Phase 3):
   - `firestore.rules`: `shiftCoverageRequests` — `offerType` (open/direct) +
     `targetHostId` validated on create; new `open → pending_admin` accept
     transition (target-gated for direct offers); requester self-cancel. New
     `timeOffRequests` collection (host reads/creates/cancels own; admin
     approves/denies). `employees.fcmTokens` added to `selfAllowedKeys()`.
   - `firestore.indexes.json`: +6 — `shiftCoverageRequests` (requestingHostId,
     createdAt) & (targetHostId, status, createdAt); `timeOffRequests`
     (status,startDate) & (status,endDate) & (hostId,submittedAt).
   - `functions_gcfv1/notifications.js`: `onCoverageRequestWrite` now also fires
     on `open → pending_admin` (notifies requester + all admins) and
     `pending_admin → approved|rejected` (notifies both hosts).
   - `shifts` rules unchanged this phase — admin already has full write for the
     `timeOffConflict` / `timeOffRequestId` fields; the host `employeeId`
     self-update is removed in Phase 3.
2. **Shift swap v2 — host side** — ✅ DONE 2026-08-30, deployed + tested on
   staging. All in `employee-calendar/` (`index.html`, `style.css`,
   `js/shift-trade-requests.js`; cache-bust `?v=20260830-swap` / `swap3`).
   - Coverage-request modal: "Open offer / Direct switch" picker; direct shows a
     host `<select>` from `window.employees` minus self. Mon–Sat week lock via
     `isDateLocked()` (`firstUnlockedMonday`): locked shift → Open disabled,
     Direct preselected, amber "locked in" message; direct switches allowed.
   - `submitRequest` writes `offerType` / `targetHostId` / `targetHostName`;
     blocks a locked-week open offer client-side too.
   - Shift Offers panel: direct offers shown only to requester + target; Open /
     "Direct: <name>" badge; PENDING ADMIN APPROVAL badge; `pending_admin` is an
     active status.
   - **`acceptOffer` no longer moves the shift** — it only sets
     `status: "pending_admin"` + `acceptingHost*` + `acceptedAt`. No
     `shiftSwapNotifications` doc. Direct offers reject accept from non-targets.
   - Verified end to end: open + direct create; lock enforced; fan-out
     notifications; accept → pending_admin with shift untouched; requester +
     admins notified.
   - **Gap until Phase 3:** no admin approve/reject UI, so a `pending_admin`
     swap can't complete on staging yet. `shift-swap-admin.js` still queries the
     now-unused `shiftSwapNotifications` / `status=="open"` and shows nothing
     actionable for these.
   - **Repo note:** `hostGetCalendarMonth` is deployed but its source is NOT in
     this repo (`functions_gcfv1/` drift). Always deploy functions with
     `--only functions:<name>` — a bare `--only functions` would delete it.
3. **Shift swap v2 — admin side** — ✅ DONE 2026-08-30, deployed to staging.
   `functions_gcfv1/shift-swap.js`: `approveShiftSwap` (admin onCall, txn —
   request must be `pending_admin`, shift must still exist + still belong to the
   requester, then moves `shifts.employeeId` → accepting host + sets `approved`;
   refuses/closes if the shift vanished or was reassigned; supersedes sibling
   requests). `rejectShiftSwap` (sets `rejected` + `rejectionReason`, shift
   untouched). Rules: `shifts` host self-update removed; legacy `open→approved`
   dropped. `shift-swap-admin.js` rewritten — reads `shiftCoverageRequests`
   directly (`pending_admin` → Approve/Reject, `open` → cancel), calls the CFs,
   reloads calendar on approve, no longer touches `shiftSwapNotifications` or the
   bell dropdown. `onCoverageRequestWrite` fires swap_approved/rejected to both
   hosts.
4. **Time off — host side** — ✅ DONE 2026-08-30, deployed + staging-tested green.
   - `beachTriviaPages/js/bt-time-off.js` + `.css` (new, shared): `BtTimeOff`
     module — `submit` (date range, full days, past/reversed/overlap guards,
     `insideTwoWeeks` computed at submit), `cancel` (own request, pending OR
     approved, no admin approval), `subscribeMine` live listener, `renderList`
     cards, `wireForm` (the 2-week lead-time warning text from §3).
   - New page `dashboards/host/time-off/` ("Manage Time Off") — form + your-
     requests list, guarded by `guard-host.js`.
   - "Time Off" nav item added to the host nav (`bt-nav.js`, between Calendar
     and Scoresheet). bt-nav cache-bust → `?v=hostnav-20260830-timeoff`.
   - `employee-calendar`: "Manage Time Off" button + `#timeoff-modal` (same form
     + list, links to the full page); `js/time-off-modal.js` wires it.
   - Tested: 2-week warning toggles on date change; `insideTwoWeeks` stored +
     shown as an "inside 2 weeks" flag on pending cards; submit → pending + live
     list; cancel → `cancelled`; overlap / past-date / reversed-range all
     blocked. Fixed a `formatRange` bug (Chrome renders `{day, year}` as
     "YYYY (day: N)").
   - No notifications yet — `timeoff_submitted` to admins comes with Phase 5/8.
5. **Time off — admin side** — ✅ DONE 2026-08-30, deployed to staging.
   - `functions_gcfv1/time-off.js` (new): `approveTimeOff({requestId,
     reassignments})` — finds the host's shifts overlapping the range; those in
     the `reassignments` map ({shiftId: newHostId}) are moved, the rest get
     `shifts.timeOffConflict=true` + `timeOffRequestId`; request → `approved`
     with `conflictResolution` (none|resolved|deferred|partial) +
     `deferredShiftIds`. `denyTimeOff({requestId, reason})` → `denied` +
     `denialReason`. Exported in `index.js`.
   - `notifications.js`: `onTimeOffRequestWrite` — new pending →
     `timeoff_submitted` to all admins; approved/denied → the host; a cancelled
     *previously-approved* request clears the `timeOffConflict` flags off its
     shifts and notifies admins (`timeoff_conflict`). This is the "cancelTimeOff"
     cleanup — the host still cancels via the plain client write.
   - `shift-swap-admin.js`: the admin calendar modal ("Shift Swaps & Offers")
     gains a "Time off — needs review" section. Approve → client conflict check
     → none: straight through; conflicts: inline panel, a host `<select>` per
     shift (reassign) or leave flagged. Deny → inline reason form. Inside-2-weeks
     requests show a "⚠ Inside 2 weeks" badge.
   - `calendar-ui.js`: `shift.timeOffConflict` → red tile + "TIME OFF" tag,
     **admin calendar only** (`!window.__CALENDAR_READONLY__`).
   - Indexes: `shifts` (employeeId, date); `timeOffRequests` (hostId, status,
     endDate). Rules unchanged — the CFs use the Admin SDK.
   - Cache-bust `?v=20260830-timeoff5`.
   Not in this phase (→ Phase 6): host yellow time-off days; admin host-picker
   greying + assign-time overlap warning.

**Phase 5 staging test 2026-08-30 — GREEN:**
- Admin "Time off — needs review" section renders pending requests (host, range,
  N days, "⚠ Inside 2 weeks" badge, note, Approve / Deny).
- Approve, no conflicts → straight through, `conflictResolution: "none"`.
- Approve, 2 conflicting shifts → inline panel (host `<select>` per shift);
  reassigned one to another host + left one flagged → shift moved,
  `shifts.timeOffConflict=true` on the other, request approved
  `conflictResolution: "partial"`, `deferredShiftIds: [that shift]`.
- Flagged shift renders **red** + "TIME OFF" tag on the admin calendar; the
  reassigned one shows normal.
- Deny with reason → `denied` + `denialReason`.
- Notifications: `timeoff_submitted` ×3 to the admin, `timeoff_approved` ×2 and
  `timeoff_denied` (with the reason) to the host.
- Host cancels the approved-partial request → `onTimeOffRequestWrite` clears
  `timeOffConflict`/`timeOffRequestId` off the shift and notifies the admin
  (`timeoff_conflict`, "1 shift flag(s) cleared"). Calendar red flag gone.
- Note: the new `shifts (employeeId, date)` index takes ~2 min to build; approve
  fails with `INTERNAL` until it's `READY`.

**Phases 0–5 full regression 2026-08-30 — GREEN.**
- 17/17 rules + Cloud-Function-auth checks pass as a pure host: can't read
  others' notifications/time-off, can't create/edit-beyond-`readAt` a
  notification, can't write `shifts` (incl. `timeOffConflict`), can't create an
  offer for a shift it doesn't own, can't create time-off for another host or
  self-approve, can't call `approveShiftSwap` / `rejectShiftSwap` /
  `approveTimeOff` / `denyTimeOff`. Legit paths all pass.
- Bell: 30 mixed notifications render with correct labels (Time Off — Needs
  Review, Time Off Conflict, Shift Offer, Swap Approved, Swap — Needs Approval,
  …), badge accurate, open/close, live updates.
- Admin dashboard: "Open Shift Offers" + "Pending Swaps" stats load; bell works.
- Admin + host calendars load with no console errors; shift CRUD works; the
  admin "Shift Swaps & Offers" modal opens clean with the empty-state naming all
  three categories.
- `totalShifts` 351 = the real Aug+Sep schedule (per-month renders show ~117);
  no runaway creation.
6. **Calendar visuals** — ✅ DONE 2026-08-30, deployed + staging-tested green.
   - Host calendar: the host's own **approved** time off renders with an amber
     day-number header + "TIME OFF" tag. `host-calendar.js` — `timeOffRequests`
     `where hostId == uid` listener (status filtered client-side, no index),
     expands ranges to a `Set` of YMD, `decorateTimeOffDays()` toggles
     `td.host-timeoff-day`; `window.renderCalendar` is wrapped once so the
     highlight survives every re-render. CSS in `style.css`
     (`html body .calendar td.host-timeoff-day .date`, high-specificity + a
     `::after` tag). Admin red `timeOffConflict` tiles = Phase 5, unchanged.
   - Admin host-picker: new `admin/calendar/js/timeoff-picker.js` (no-ops when
     `__CALENDAR_READONLY__`) — subscribes to `timeOffRequests` `where status ==
     "approved"`, exposes `window.TimeOffPicker`. On shift-modal open / date
     change it flags `#shift-employee` `<option>`s whose host is off that date
     (`data-timeoff="1"` + `data-timeoffLabel`); `combobox.js` `buildList` sinks
     those to the bottom (write-in row still last) and greys them
     (`.ss-item--timeoff`, 🌴 + "· off <range>"). `event-crud.js` `saveShift`
     calls `TimeOffPicker.confirmAssignment(hostId, date)` before booking —
     `confirm()` "…has approved time off (<range>). Assign anyway?"; skipped on
     the conflict "Proceed Anyway" re-entry (`forceBooking`) and when editing a
     shift without changing host/date.
   - Cache-bust `?v=20260830-timeoff6` (host-calendar.js + combobox.js
     `timeoff6b`).

**Phase 6 staging test 2026-08-30 — GREEN.** Burner "Ja Vtr" given approved
time off Sep 22–24: host calendar shows those 3 days amber + tagged, 21/25
clean, highlight persists across month nav. Admin picker for Sep 23 — "Ja Vtr"
greyed, "· off Sep 22 – Sep 24", sunk to just above the write-in row. Save with
that host → single `confirm()` (no double-prompt); Cancel → shift not created;
OK → shift created. Editing an existing shift's notes (same host/date) → no
prompt. `TimeOffPicker.confirmAssignment` paths (off→false, off→true,
not-off→true/no-prompt) all correct.
NOTE: the Sep 22–24 approved `timeOffRequest` for the burner
(`K02SrLUrihoNyhUoh08x`) was left in place so Josh can see it live — cancel it
via host "Manage Time Off" or delete it when done.
7. **Admin "Requests" page** — ✅ DONE 2026-08-30, deployed + staging-tested green.
   New `beachTriviaPages/dashboards/admin/requests/` (`index.html` + `style.css` +
   `requests.js`; `auth-guard.js` / `boot.js` copied from `leads/`). Self-
   contained page in the shared admin token palette, own dark-mode block. Two
   `.seg` tabs:
   - **Time Off** — live `timeOffRequests` `orderBy(submittedAt desc)`: host,
     dates off (+ day count), requested (+ "inside 2 wks" flag), status pill
     (+ conflictResolution), reviewed date, reviewer name ("host" for
     self-cancels), notes / denial reason.
   - **Shift Swaps** — live `shiftCoverageRequests` `orderBy(createdAt desc)`:
     Open/Direct tag, shift (date · location · event), from host, to host
     (accepting, or "<target> (target)" for un-answered directs), requested,
     accepted, status pill, admin-reviewed date, reviewer + rejection reason.
   Status `<select>` (options per tab) + debounced text search (host / location
   / reason) + live tab-count badges + context-aware empty states. Read-only —
   no inline actions (deferred; §9). Nav link "Requests" added to
   `NAV_LINKS.admin` in `bt-nav.js` (between Calendar and Employees) + a
   "📋 Requests" dashboard button; bt-nav cache-bust bumped site-wide to
   `?v=hostnav-20260830-requests` (27 pages).

**Phase 7 staging test 2026-08-30 — GREEN.** Seeded 3 time-off (approved /
denied+reason / cancelled) and 3 swaps (open / direct-rejected+reason /
open-approved); both tables rendered with correct sort, names, pills, reasons,
day counts, and the inside-2-weeks flag; status filter + search + tab badges +
empty states all correct; no console errors; admin nav shows "Requests". Swap
test data cleaned up; the 3 time-off rows (incl. the Phase 6 approved demo) left
for Josh to see the page populated.
KNOWN ISSUE (pre-existing, not Phase 7): `sw.js` (scoresheet offline SW) treats
everything under `/beachTriviaPages/js/` — including `bt-nav.js` — as a
stale-while-revalidate asset, so a bt-nav change (new nav link) only appears on
the *second* navigation after deploy for anyone who has visited the scoresheet.
Self-heals; worth fixing by excluding `bt-nav.*` from the SW.
8. **Notifications** —
   a. `shiftOfferDigest` scheduled function (Sun/Mon) + bell integration for
      time-off events.
   b. FCM web push: service worker, `manifest.json`, token capture/prune, send
      from the event functions.
   c. Plain-email backup send from the same functions.

---

## 9. Open items

- Email sender service pick for §7.3 (Resend / Brevo / MailerSend / Trigger Email
  extension).
- PWA assets: app icon set + `manifest.json` name / theme colour.
- Whether the admin "Requests" page pending rows should be actionable
  (approve/deny inline) in v1 or just display.
