// mybeachtrivia.com/functions_gcfv1/publicLocations.js
//
// Public, unauthenticated endpoint for the marketing site's Locations page
// (beachTriviaPages/3-Locations). Returns the venues that have scheduled events
// in a date window, each with its address, coordinates, and a stripped-down
// list of shifts (event type / date / time only — no employee names, notes or
// internal fields).
//
// Coordinates: geocoded once, server-side, via OpenStreetMap Nominatim (no API
// key needed) and cached back onto the `locations` doc as `geo: {lat,lng}`.
// After the first warm-up the browser never geocodes anything.
//
// Exposed to the browser same-origin via a hosting rewrite:
//   GET /api/scheduled-venues?start=YYYY-MM-DD&end=YYYY-MM-DD&type=<eventType|all>
// (the raw function URL /publicGetScheduledVenues also works, CORS-open.)

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

function db() {
  return admin.firestore();
}

const REGION = "us-central1";
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 120;

// Geocoding (Nominatim usage policy: <= 1 req/sec, identify yourself).
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_UA = "mybeachtrivia.com locations map (contact: joshuaveator@gmail.com)";
const GEOCODE_GAP_MS = 1100;
const HAMPTON_ROADS_VIEWBOX = "-76.7,37.3,-75.9,36.5"; // bias results to the region

// ── date helpers (all YYYY-MM-DD strings, America/New_York calendar) ──────────
function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayNY() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isYmd(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function addDays(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000
  );
}

function str(v) {
  return String(v == null ? "" : v).trim();
}

// Corrected addresses for venues whose `locations` doc has a missing / mall- or
// plaza-style address that won't geocode. Keyed by lowercased venue name.
// (Verified online 2026-09; update the doc in the admin calendar to retire an
// entry here.)
const ADDRESS_OVERRIDES = {
  "aj gators fairfield": "5218 Providence Rd, Virginia Beach, VA 23464",
  "dave & busters": "701 Lynnhaven Pkwy, Virginia Beach, VA 23452",
  "dave and busters": "701 Lynnhaven Pkwy, Virginia Beach, VA 23452",
  "wasserhund vb": "1805 Laskin Rd, Virginia Beach, VA 23454",
};

function overrideAddress(name, current) {
  return ADDRESS_OVERRIDES[str(name).toLowerCase()] || current;
}

// Some `locations` docs have junk in the address field (an email, a phone, a
// note). Only pass through something that plausibly geocodes.
function cleanAddress(v) {
  const s = str(v);
  if (!s || s.length < 6) return "";
  if (s.includes("@")) return "";
  if (!/\d/.test(s) || !/[a-z]/i.test(s)) return "";
  return s;
}

function shiftDateYmd(raw) {
  if (isYmd(raw)) return raw;
  if (raw && typeof raw.toDate === "function") {
    const d = raw.toDate();
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  const s = str(raw);
  return isYmd(s) ? s : "";
}

function timeToMinutes(t) {
  const m = str(t).toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return 24 * 60;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const mer = m[3];
  if (mer === "pm" && h !== 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  return h * 60 + min;
}

function num(v) {
  return typeof v === "number" && isFinite(v) ? v : null;
}

// A stored geo is usable if it has finite lat/lng. (No TTL — venues don't move.)
function readGeo(d) {
  const g = d && d.geo;
  if (g && num(g.lat) != null && num(g.lng) != null) {
    return { lat: g.lat, lng: g.lng };
  }
  // tolerate flat lat/lng fields too
  if (num(d && d.lat) != null && num(d && d.lng) != null) {
    return { lat: d.lat, lng: d.lng };
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Suite / unit / floor tokens break Nominatim more often than they help.
function simplifyAddress(addr) {
  return str(addr)
    .replace(/,?\s*(#|ste\.?|suite|unit|apt\.?|floor|fl\.?|building|bldg\.?)\s*[\w-]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*,\s*,/g, ",")
    .trim();
}

async function geocodeQuery(query) {
  const url =
    `${NOMINATIM_URL}?format=jsonv2&limit=1&countrycodes=us` +
    `&viewbox=${encodeURIComponent(HAMPTON_ROADS_VIEWBOX)}&bounded=0` +
    `&q=${encodeURIComponent(query)}`;
  try {
    const resp = await fetch(url, { headers: { "User-Agent": NOMINATIM_UA } });
    if (!resp.ok) return null;
    const arr = await resp.json();
    const hit = Array.isArray(arr) ? arr[0] : null;
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng };
  } catch (e) {
    console.warn("[publicGetScheduledVenues] geocode error:", query, e.message);
    return null;
  }
}

// Try a few phrasings, oldest-and-most-specific first.
async function geocodeVenue(name, address) {
  const tries = [];
  if (address) {
    tries.push(address);
    const simple = simplifyAddress(address);
    if (simple && simple !== address) tries.push(simple);
  }
  if (name) tries.push(`${name}, Virginia Beach, VA`);

  for (let i = 0; i < tries.length; i++) {
    const hit = await geocodeQuery(tries[i]);
    if (hit) return { ...hit, query: tries[i] };
    if (i < tries.length - 1) await sleep(GEOCODE_GAP_MS);
  }
  return null;
}

// ── the endpoint ────────────────────────────────────────────────────────────
exports.publicGetScheduledVenues = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    // Event schedules don't change intra-day. Browser holds 5 min; the CDN
    // holds 30 min and may serve stale for a day while it refreshes in the
    // background — keeps this ~135-doc query off Firestore on public traffic.
    res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "GET only" });
      return;
    }

    try {
      const today = todayNY();

      let startStr = isYmd(req.query.start) ? req.query.start : today;
      let endExclusiveStr = isYmd(req.query.end)
        ? req.query.end
        : addDays(startStr, DEFAULT_WINDOW_DAYS);

      if (daysBetween(startStr, endExclusiveStr) <= 0) {
        endExclusiveStr = addDays(startStr, DEFAULT_WINDOW_DAYS);
      }
      if (daysBetween(startStr, endExclusiveStr) > MAX_WINDOW_DAYS) {
        endExclusiveStr = addDays(startStr, MAX_WINDOW_DAYS);
      }

      const wantType = str(req.query.type).toLowerCase();
      const filterType = wantType && wantType !== "all" ? wantType : null;

      const firestore = db();

      const [shiftsSnap, locationsSnap] = await Promise.all([
        firestore
          .collection("shifts")
          .where("date", ">=", startStr)
          .where("date", "<", endExclusiveStr)
          .get(),
        firestore.collection("locations").get(),
      ]);

      // location name -> { name, address, geo, ref, needsGeocode }
      const locByName = new Map();
      locationsSnap.forEach((doc) => {
        const d = doc.data() || {};
        const name = str(d.name);
        if (!name) return;
        const address = overrideAddress(name, cleanAddress(d.address));
        locByName.set(name.toLowerCase(), {
          name,
          address,
          geo: readGeo(d),
          ref: doc.ref,
          hadAddress: !!address,
        });
      });

      // group shifts by venue
      const venueMap = new Map(); // key: lowercased venue name
      const eventTypeSet = new Set();

      shiftsSnap.forEach((doc) => {
        const s = doc.data() || {};
        const date = shiftDateYmd(s.date);
        if (!date || date < startStr || date >= endExclusiveStr) return;

        const type = str(s.type).toLowerCase();
        if (type) eventTypeSet.add(type);
        if (filterType && type !== filterType) return;

        const venueName = str(s.location);
        if (!venueName) return;

        const key = venueName.toLowerCase();
        const loc = locByName.get(key);

        if (!venueMap.has(key)) {
          venueMap.set(key, {
            name: loc ? loc.name : venueName,
            address: loc ? loc.address : "",
            geo: loc ? loc.geo : null,
            _loc: loc || null,
            shifts: [],
          });
        }

        venueMap.get(key).shifts.push({
          type,
          theme: str(s.theme) || null,
          date,
          startTime: str(s.startTime),
          endTime: str(s.endTime),
        });
      });

      const venues = Array.from(venueMap.values());

      // Coordinates come from the `geo` cache on each `locations` doc, warmed by
      // the geocodeVenuesCron job below. Anything still missing is geocoded in
      // the browser (Google) and cached there — the response stays instant.

      const out = venues
        .map((v) => {
          v.shifts.sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
          });
          return {
            name: v.name,
            address: v.address,
            lat: v.geo ? v.geo.lat : null,
            lng: v.geo ? v.geo.lng : null,
            shifts: v.shifts,
          };
        })
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );

      res.status(200).json({
        ok: true,
        range: { startStr, endExclusiveStr },
        eventTypes: Array.from(eventTypeSet).sort(),
        venues: out,
      });
    } catch (err) {
      console.error("[publicGetScheduledVenues] failed:", err);
      res.status(500).json({ ok: false, error: "internal", message: err.message });
    }
  });

// ── geocode cache warmer ────────────────────────────────────────────────────
// Fills the `geo` field on `locations` docs that have an address but no coords
// yet. Runs off the request path so page loads stay instant. A handful per run
// keeps it well inside Nominatim's usage policy; over a few hours every
// resolvable venue is cached. (Venues Nominatim can't place stay client-side.)
async function warmGeocodes(limit) {
  const snap = await db().collection("locations").get();
  const pending = [];
  snap.forEach((doc) => {
    const d = doc.data() || {};
    const name = str(d.name);
    if (!name) return;
    if (readGeo(d)) return;
    const address = overrideAddress(name, cleanAddress(d.address));
    if (!address) return;
    // Retry a previously-failed venue at most weekly — unless we now have a
    // different address to try (a correction, or an ADDRESS_OVERRIDES entry).
    if (d.geoFailedAt && d.geoFailedQuery === address) {
      const failedMs = d.geoFailedAt.toMillis ? d.geoFailedAt.toMillis() : 0;
      if (Date.now() - failedMs < 7 * 24 * 3600 * 1000) return;
    }
    pending.push({ ref: doc.ref, name, address });
  });

  let done = 0;
  for (const v of pending) {
    if (done >= limit) break;
    const hit = await geocodeVenue(v.name, v.address);
    if (hit) {
      await v.ref.set(
        {
          geo: {
            lat: hit.lat,
            lng: hit.lng,
            source: "nominatim",
            query: hit.query,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          geoFailedAt: admin.firestore.FieldValue.delete(),
          geoFailedQuery: admin.firestore.FieldValue.delete(),
        },
        { merge: true }
      );
    } else {
      await v.ref.set(
        {
          geoFailedAt: admin.firestore.FieldValue.serverTimestamp(),
          geoFailedQuery: v.address,
        },
        { merge: true }
      );
    }
    done++;
    if (done < pending.length) await sleep(GEOCODE_GAP_MS);
  }
  return { pending: pending.length, processed: done };
}

exports.geocodeVenuesCron = functions
  .region(REGION)
  .runWith({ timeoutSeconds: 120 })
  .pubsub.schedule("every 30 minutes")
  .timeZone("America/New_York")
  .onRun(async () => {
    try {
      const r = await warmGeocodes(8);
      console.log("[geocodeVenuesCron]", JSON.stringify(r));
    } catch (e) {
      console.error("[geocodeVenuesCron] failed:", e);
    }
    return null;
  });

// Manual trigger (admin) for backfills: GET /publicGetScheduledVenues is public,
// this one takes the LEADS_API_KEY so we don't add another secret.
exports.geocodeVenuesNow = functions
  .region(REGION)
  .runWith({ timeoutSeconds: 300, secrets: ["LEADS_API_KEY"] })
  .https.onRequest(async (req, res) => {
    if (req.get("x-leads-api-key") !== process.env.LEADS_API_KEY) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    try {
      const limit = Math.min(50, Number(req.query.limit) || 30);
      const r = await warmGeocodes(limit);
      res.status(200).json({ ok: true, ...r });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
