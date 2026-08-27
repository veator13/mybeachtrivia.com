# Beach Trivia — Leads Automation (context for Claude Code)

This repo is the live source for mybeachtrivia.com (Firebase project `beach-trivia-website`,
Blaze plan, account joshuaveator@gmail.com). This file carries context from planning work
done in Claude Cowork so Claude Code doesn't start from zero.

## Goal
Add a permanent, automated "Leads" feature to the admin area: an AI research task finds
Hampton Roads venue sales prospects (trivia/music bingo/Beach Feud), writes them into
Firestore, and they show up as an accruing "unreviewed queue" on a new admin Leads tab.

## Architecture (decided, do not re-litigate without reason)
- A scheduled Claude task (runs on the owner's Claude Pro subscription, NOT a metered API
  call — cost constraint is hard: keep this free) does the research: venue sites, social
  media, reviews, local news, plus structured sources (VA ABC license search, city
  open-data feeds).
- It calls a Cloud Function HTTP endpoint to write results into Firestore — no manual
  copy/paste, no direct Anthropic API billing.
- Cadence: 3 venues/day, chosen as a light starting load (owner also codes with Claude
  frequently on the same Pro plan — easy to drop to 2/day if usage becomes a concern).
- Admin UI: plain HTML/vanilla JS, matching the existing site (no framework) — new
  `leads/` folder + nav link, same pattern as `calendar/`, `scoresheet/`,
  `employees-management/`.

## Status as of 2026-08-27
- [x] Schema designed (see below)
- [x] Cloud Function endpoint written: `functions_gcfv1/leads.js`, exported as
      `ingestLeadResearch` in `functions_gcfv1/index.js`
- [x] `LEADS_API_KEY` secret set via `firebase functions:secrets:set`
- [x] **Endpoint deployed** (us-central1, Node 20):
      `https://us-central1-beach-trivia-website.cloudfunctions.net/ingestLeadResearch`
- [x] Firestore rules for `venues` / `leads` / `leadObservations` (admin-only) +
      venue dedup composite indexes — deployed
- [x] Admin Leads tab UI — `beachTriviaPages/dashboards/admin/leads/` (queue table +
      detail modal with pipeline editor, competitor banner, Copy details, Recommended Pitch);
      nav link in `bt-nav.js` + admin dashboard
- [x] `leadsResearchQueue` GET endpoint (deployed) — feeds the task currentClients /
      knownVenues / dueForRecheck
- [x] First real research batch — 4 leads (Wasserhund Norfolk, Lucky Penny, Garage
      Brewery, Elation) done manually on 2026-08-27
- [~] Scheduled task — **cloud routines don't work on Pro** (sandbox egress allowlist
      blocks the Cloud Function; can't add custom domains without Team/Enterprise). Two
      cloud routines were created then disabled (`trig_016XKEZyCdKFLwF9F6SrfDpM`,
      `trig_01DMjDfgGrnK8d8DkPbksoRF`). Replacement: **local `launchd` job on Josh's Mac**
      — `~/beachtrivia-leads-agent/` (task.md + run.sh + .claude/settings.json) and
      `~/Library/LaunchAgents/com.beachtrivia.leads-research.plist`. Fires 7/10/13/16/19,
      once-per-day guard, runs on wake if asleep. `leads-research-task.md` in repo root is
      the instructions. Pending: Josh tests headless `claude -p` auth + first run, then
      `launchctl load`.

All leads work is on branch `leads-feature` (not merged to main yet).

## Firestore schema (locked)

### `venues/{venueId}` — durable identity, rarely changes
name, normalizedName, address, city/neighborhood, phone, phoneNote, email, emailNote,
website, socialLinks, normalizedWebsiteDomain, placeId, venueClassification, ownershipType,
hours, kitchenHours, barAlcoholModel, sizeLayoutSignals, openingStatus, openingDate,
openingDateConfidence, decisionMaker, plainEnglishProfile, basicInfoLastVerified,
currentEntertainment.

`phoneNote`: what the listed phone actually reaches — e.g. "taproom / front-of-house bar
line", "owner Christine Holley's cell", "general voicemail, no staff during day",
"reservations line (Toast)". Always try to characterise it, don't just store a number.
`email`: best booking/GM email; hunt for it every run if missing (venue site contact page,
Facebook About tab, "contact us", domain-pattern guesses verified against the site, ABC
license filings). `emailNote`: whose inbox it is ("general info@", "GM direct", "owner").

`currentEntertainment`: array of `{ format, host, schedule, note, isCompetitor }` — every
recurring trivia / music bingo / game night the venue runs. Set `host` to the running
company (or "In-house"); `isCompetitor` defaults true when `host` is set and isn't an
in-house label. The admin Leads tab shows a red **"⚔️ Competitor on site"** banner naming
the host(s) whenever any entry is a competitor. Populate this on every research run so the
banner is accurate that day.

`quickSummary`: `{ openNights, competitors, serviceHistory }` — three short strings shown
in a "Quick Summary" card at the very top of the lead panel. `openNights` = which nights
have no programming / are the realistic pitch targets ("Mon–Wed open; live bands Thu–Sat").
`competitors` = one line naming current host(s) + night, or "None found". `serviceHistory`
= dated history of any trivia/bingo/Feud the venue has run (who, when it started/stopped) —
"Beach Feud via Challenge Ent. 2022–Oct 2023; nothing since", or "None on record". Fill all
three every run; the panel falls back to deriving them from currentEntertainment +
observations when a field is blank.

Dedup: normalizedName+address first; placeId, normalizedWebsiteDomain+phone as secondary
signals. **Never auto-merge on name similarity alone** — chains (AJ Gator's, Voodoo
Brewing) have multiple real Hampton Roads locations. Cross-reference the existing
`locations` collection to exclude current Beach Trivia clients (`publicLocations` does
NOT exist in this codebase — an earlier assumption was wrong, don't recreate it).

### `leads/{leadId}` — current sales opportunity, 1:1 with a venue
venueId, statusBucket (Pitch Now / Worth Investigating / New-Coming Soon / Former-Lapsed
Service / Current Competitor / Poor Fit), leadScore, researchPriority (independent of
leadScore — auto-set HIGH when openingDate is within ±30 days of today), nextResearchDate,
pipelineStage (Unreviewed → Approved → Packet Dropped Off → Contacted → Follow-Up →
Interested → Trial Scheduled → Won/Lost), lostReason, reviewed (bool, drives the
unreviewed-queue UI), recommendedOpportunity, pitchAngle.

Recheck cadence starting point: Coming Soon/New ~2 weeks · Current Competitor ~60-90 days
· Poor Fit ~yearly · other active opportunities shorter. Don't over-optimize before real
data.

### `leadObservations/{observationId}` — dated research history, many per lead
leadId, venueId, date, observationType (enum: trivia_detected, trivia_started,
trivia_stopped, music_bingo_detected, entertainment_schedule_change, competitor_detected,
grand_opening, coming_soon_update, ownership_change, management_change, contact_found,
hours_change, kitchen_hours_change, other), finding, sources ([{url, dateAccessed}]).

## Daily research allocation (3/day)
Pull leads whose nextResearchDate is due, ranked by researchPriority. Reserve at least 1
of the 3 slots for non-new-venue due leads so a wave of grand openings can't starve
rechecks on existing strong prospects.

## Existing site patterns to match
- Admin nav: plain link list in `beachTriviaPages/dashboards/admin/index.html`
  (`<a href="leads/index.html">Leads</a>` — matches existing links, `#locations` is an
  unbuilt placeholder already there).
- Admin gating: checks `userData.roles.includes('admin')` on the Firestore user doc.
- `locations` collection real fields (confirmed from code): name, address, contact,
  phone, email, isActive, createdAt, updatedAt.
- Cloud Functions source: `functions_gcfv1/` (NOT the top-level `functions/` folder,
  which only has 2 playlist-snapshot functions — `firebase.json` points
  `functions.source` at `functions_gcfv1`). Existing endpoints use
  `functions.https.onCall` with an admin-role check helper (`assertAdminFromCaller`);
  the new `ingestLeadResearch` uses `onRequest` + a shared-secret header instead, since
  it's called by the scheduled task, not a logged-in browser user.

## Research methodology (for the scheduled task — learned from the first real batch)

Venue websites only list events the **venue itself runs**. Recurring trivia / music
bingo hosted by an outside company is routinely absent from the venue's own calendar,
and the host companies' own websites are often stale. The current truth lives in the
**host companies' Facebook feeds** (last 1–14 days of posts).

So, for every venue, the task must:
1. **Rebuild the competitor list fresh each run.** Search that day for active Hampton
   Roads trivia / music bingo / game-show operators — don't rely on a hardcoded list;
   companies start, merge, and fold. Seed the search with the ones seen so far
   (Bar Trivia LIVE, Challenge Entertainment / "Virginia Trivia" / DJ Bobby D,
   River City Trivia, King Trivia) but always look for new names.
2. **Search each competitor's pages for THIS venue** — their website location list AND
   their recent Facebook/Instagram posts — by venue name and by street address.
3. Also check aggregators (trivianearme.net, vabrewguide.com, visit<city>.com event
   calendars, Eventbrite) and a plain `"<venue name>" trivia OR "music bingo"` web +
   Facebook search.
4. Only call a venue "no entertainment / Pitch Now" after steps 1–3 come back empty.
   If a competitor is found, it's `Current Competitor` — record the host company, night,
   and where it was confirmed (with the post URL + date accessed) in a `leadObservation`.
5. **Contact hunt, every run:** find a booking/GM `email` if one isn't already stored
   (venue contact page, Facebook About tab, ABC filings). For the `phone`, work out what
   it actually reaches and put it in `phoneNote` (taproom bar line vs. owner cell vs.
   dead general voicemail vs. Toast reservations) — a number with no context wastes the
   salesperson's first call.
6. **Client double-check, every run:** the `locations` collection / `currentClients` list
   is NOT reliably current. Before submitting a venue, also search Beach Trivia's own
   Facebook (facebook.com/BeachTrivia) + Instagram (@beachtrivia) recent posts and
   `site:mybeachtrivia.com` / `"Beach Trivia" "<venue>"` for the venue. If BT already
   hosts there, drop it and log `skipped: appears to already be a Beach Trivia venue`.

Example miss: The Garage Brewery (Chesapeake) was first logged as "Worth Investigating —
no weekly trivia" off its own calendar. It actually runs Bar Trivia LIVE trivia every
Wednesday — only visible in Bar Trivia LIVE's Facebook posts. Corrected to
`Current Competitor` on re-run.

## Suggested admin venue-detail layout
Basic Venue Info → Current Entertainment → Historical Entertainment → Recommended
Opportunity → Evidence/Research History → Sales Pipeline.

## Next steps
1. Deploy `ingestLeadResearch` (see Status above).
2. Build the admin Leads tab (`beachTriviaPages/dashboards/admin/leads/`).
3. Set up the scheduled Claude task (3/day) that calls the endpoint.
4. Run the first real Virginia Beach research batch through the live system.
