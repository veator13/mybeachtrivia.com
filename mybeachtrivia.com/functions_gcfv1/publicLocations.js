// mybeachtrivia.com/functions_gcfv1/publicLocations.js
//
// Public, unauthenticated endpoint for the marketing site's Locations page
// (beachTriviaPages/3-Locations). Returns the venues that have scheduled events
// in a date window, each with its address and a stripped-down list of shifts
// (event type / date / time only — no employee names, notes or internal fields).
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

// A shift's `date` is normally a "YYYY-MM-DD" string; be lenient about Timestamps.
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

// ── the endpoint ────────────────────────────────────────────────────────────
exports.publicGetScheduledVenues = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Cache-Control", "public, max-age=300, s-maxage=300");

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

      // sanity: end after start, window capped
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

      // location name -> { address, active, isTemp }
      const locByName = new Map();
      locationsSnap.forEach((doc) => {
        const d = doc.data() || {};
        const name = str(d.name);
        if (!name) return;
        locByName.set(name.toLowerCase(), {
          name,
          address: str(d.address),
          active: d.active !== false && d.isActive !== false,
          isTemp: d.isTemp === true,
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

      const venues = Array.from(venueMap.values())
        .map((v) => {
          v.shifts.sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
          });
          return v;
        })
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );

      res.status(200).json({
        ok: true,
        range: { startStr, endExclusiveStr },
        eventTypes: Array.from(eventTypeSet).sort(),
        venues,
      });
    } catch (err) {
      console.error("[publicGetScheduledVenues] failed:", err);
      res.status(500).json({ ok: false, error: "internal", message: err.message });
    }
  });
