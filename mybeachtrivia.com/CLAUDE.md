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
      detail modal with pipeline editor); nav link in `bt-nav.js` + admin dashboard
- [ ] Scheduled Claude task itself — not started
- [ ] First real research batch — not run

All leads work is on branch `leads-feature` (not merged to main yet).

## Firestore schema (locked)

### `venues/{venueId}` — durable identity, rarely changes
name, normalizedName, address, city/neighborhood, phone, website, socialLinks,
normalizedWebsiteDomain, placeId, venueClassification, ownershipType, hours, kitchenHours,
barAlcoholModel, sizeLayoutSignals, openingStatus, openingDate, openingDateConfidence,
decisionMaker, plainEnglishProfile, basicInfoLastVerified, currentEntertainment.

`currentEntertainment`: array of `{ format, host, schedule, note, isCompetitor }` — every
recurring trivia / music bingo / game night the venue runs. Set `host` to the running
company (or "In-house"); `isCompetitor` defaults true when `host` is set and isn't an
in-house label. The admin Leads tab shows a red **"⚔️ Competitor on site"** banner naming
the host(s) whenever any entry is a competitor. Populate this on every research run so the
banner is accurate that day.

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
