// mybeachtrivia.com/functions_gcfv1/team-application.js
//
// Public "Join Our Team" application intake.
//
//   POST /api/team-application   (hosting rewrite → submitTeamApplication)
//
// The browser form posts JSON here instead of writing Firestore directly, so:
//   • the `Applications` collection is closed to client writes (rules deny
//     create) — nothing can spam it directly;
//   • every submission runs through server-side spam checks (honeypot, fill
//     time, per-IP rate limit, field caps) before it is stored;
//   • a heads-up email goes to the team inbox the moment one lands.
//
// Stored shape (Applications/{id}):
//   { ...sanitised form fields,
//     availability: string[], stage: "new",
//     stageHistory: [{ stage, at, by }], adminNotes: "",
//     reviewed: false, source: "website-form",
//     submittedAt: <serverTimestamp>, ipHash, userAgent }

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const crypto = require("crypto");
const channels = require("./notify-channels");

const REGION = "us-central1";
const COLLECTION = "Applications";
const RATE_COLLECTION = "applicationRateLimits";

// Where the "new application" heads-up email goes. Comma-separated; override
// with the APPLICATIONS_ALERT_TO env var (functions_gcfv1/.env).
const ALERT_TO = String(
  process.env.APPLICATIONS_ALERT_TO || "mybeachtrivia@gmail.com"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Spam gates.
const MIN_FILL_MS = 3000;              // faster than this = bot
const MAX_FILL_MS = 6 * 60 * 60 * 1000; // stale / replayed page
const RATE_MAX = 4;                    // submissions per IP …
const RATE_WINDOW_MS = 60 * 60 * 1000; // … per rolling hour

// Field length caps (defensive — the form already limits, bots don't).
const CAP_SHORT = 200;
const CAP_MED = 400;
const CAP_LONG = 4000;

function db() {
  return admin.firestore();
}

function str(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

// Trim, strip angle brackets (kills HTML/script injection into the admin view
// and the alert email), collapse whitespace runs, enforce a length cap.
function clean(v, cap) {
  return str(v)
    .replace(/[<>]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, cap || CAP_MED);
}

function cleanEmail(v) {
  return clean(v, CAP_SHORT).toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientIp(req) {
  const xff = str(req.headers["x-forwarded-for"]).split(",")[0].trim();
  return xff || req.ip || str(req.connection && req.connection.remoteAddress) || "unknown";
}

function hashIp(ip) {
  return crypto.createHash("sha256").update("bt-apps:" + ip).digest("hex").slice(0, 32);
}

// Rolling-window per-IP limiter. Best-effort: a transaction failure never
// blocks a real applicant.
async function rateLimited(ipHash) {
  const ref = db().collection(RATE_COLLECTION).doc(ipHash);
  try {
    return await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const data = snap.exists ? snap.data() || {} : {};
      const windowStart = Number(data.windowStart || 0);
      let count = Number(data.count || 0);

      if (now - windowStart > RATE_WINDOW_MS) {
        tx.set(ref, { windowStart: now, count: 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return false;
      }
      if (count >= RATE_MAX) return true;
      tx.set(
        ref,
        { count: count + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      return false;
    });
  } catch (err) {
    console.warn("[team-application] rate check failed (allowing):", err && err.message);
    return false;
  }
}

function fmtList(arr) {
  return Array.isArray(arr) && arr.length ? arr.join(", ") : "—";
}

function alertEmail(app, id) {
  const site = channels.SITE || "https://mybeachtrivia.com";
  const adminUrl = site + "/beachTriviaPages/dashboards/admin/applications/";
  const lines = [
    `${app.fullName} just applied to host for Beach Trivia.`,
    "",
    `Email:        ${app.email}`,
    `Phone:        ${app.phone}`,
    `Availability: ${fmtList(app.availability)}`,
    `Shift pref:   ${app.shiftPreference || "—"}`,
    `Will travel:  ${app.travelDistance || "—"}`,
    `Heard via:    ${app.referralSource || "—"}`,
    "",
    `Review it in the admin dashboard:`,
    adminUrl,
  ];
  return {
    to: ALERT_TO,
    subject: `New host application — ${app.fullName}`,
    text: lines.join("\n"),
    html: channels.emailShell({
      heading: "New host application",
      lines: [
        `${app.fullName} just applied to host for Beach Trivia.`,
        `Email: ${app.email}`,
        `Phone: ${app.phone}`,
        `Availability: ${fmtList(app.availability)}`,
        `Shift preference: ${app.shiftPreference || "—"}`,
        `Willing to travel: ${app.travelDistance || "—"}`,
        `Heard about us via: ${app.referralSource || "—"}`,
      ],
      ctaText: "Open the applications dashboard",
      ctaHref: adminUrl,
    }),
    force: true, // internal address — bypass the staging broadcast gate
  };
}

exports.submitTeamApplication = functions
  .region(REGION)
  .runWith({ memory: "128MB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "POST only" });
      return;
    }

    const body = (req.body && typeof req.body === "object") ? req.body : {};

    // ── Spam gate 1: honeypot. A real browser never fills #companyWebsite. ──
    if (str(body.companyWebsite).trim() || str(body.website2).trim()) {
      console.log("[team-application] honeypot tripped — silently dropped");
      res.status(200).json({ ok: true }); // look successful to the bot
      return;
    }

    // ── Spam gate 2: fill time. ──
    const elapsed = Number(body.elapsedMs);
    if (Number.isFinite(elapsed) && (elapsed < MIN_FILL_MS || elapsed > MAX_FILL_MS)) {
      console.log(`[team-application] fill time ${elapsed}ms out of range — dropped`);
      res.status(200).json({ ok: true });
      return;
    }

    // ── Normalise + validate ──
    const app = {
      fullName: clean(body.fullName, CAP_SHORT),
      email: cleanEmail(body.email),
      phone: clean(body.phone, 40),
      address: clean(body.address, CAP_MED),
      availability: Array.isArray(body.availability)
        ? body.availability.map((d) => clean(d, 20)).filter(Boolean).slice(0, 7)
        : [],
      shiftPreference: clean(body.shiftPreference, CAP_SHORT),
      travelDistance: clean(body.travelDistance, 40),
      experience: clean(body.experience, CAP_LONG),
      transportation: clean(body.transportation, 20),
      knowledgeAreas: clean(body.knowledgeAreas, CAP_LONG),
      disputeHandling: clean(body.disputeHandling, CAP_LONG),
      techIssues: clean(body.techIssues, CAP_LONG),
      favoriteCategory: clean(body.favoriteCategory, CAP_MED),
      triviaEngagement: clean(body.triviaEngagement, CAP_LONG),
      referralSource: clean(body.referralSource, CAP_SHORT),
      additionalInfo: clean(body.additionalInfo, CAP_LONG),
    };

    const missing = [];
    if (!app.fullName) missing.push("fullName");
    if (!EMAIL_RE.test(app.email)) missing.push("email");
    if (!app.phone || !/\d/.test(app.phone)) missing.push("phone");
    if (!app.availability.length) missing.push("availability");
    if (!app.shiftPreference) missing.push("shiftPreference");
    if (!app.travelDistance) missing.push("travelDistance");
    if (!app.disputeHandling) missing.push("disputeHandling");
    if (!app.techIssues) missing.push("techIssues");
    if (!app.favoriteCategory) missing.push("favoriteCategory");
    if (!app.triviaEngagement) missing.push("triviaEngagement");
    if (!app.referralSource) missing.push("referralSource");

    if (missing.length) {
      res.status(400).json({ ok: false, error: "missing_fields", fields: missing });
      return;
    }

    // ── Spam gate 3: per-IP rate limit ──
    const ip = clientIp(req);
    const ipHash = hashIp(ip);
    if (await rateLimited(ipHash)) {
      console.log(`[team-application] rate limited ${ipHash}`);
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const nowIso = new Date().toISOString();
    const doc = {
      ...app,
      stage: "new",
      stageHistory: [{ stage: "new", at: nowIso, by: "system" }],
      adminNotes: "",
      reviewed: false,
      source: "website-form",
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      ipHash,
      userAgent: clean(req.headers["user-agent"], CAP_MED),
    };

    let id;
    try {
      const ref = await db().collection(COLLECTION).add(doc);
      id = ref.id;
    } catch (err) {
      console.error("[team-application] Firestore write failed:", err);
      res.status(500).json({ ok: false, error: "write_failed" });
      return;
    }

    // Heads-up email — best effort, never blocks the response. One request per
    // recipient so a single un-deliverable address (e.g. before the Resend
    // domain is verified) can't suppress the others.
    const mail = alertEmail(app, id);
    ALERT_TO.forEach((addr) => {
      channels
        .sendEmail(Object.assign({}, mail, { to: addr }))
        .then((r) => {
          if (r && r.ok) console.log(`[team-application] alert emailed ${addr}`);
          else console.warn(`[team-application] alert to ${addr} not sent:`, r && (r.error || r.skipped));
        })
        .catch((err) => console.error(`[team-application] alert to ${addr} failed:`, err && err.message));
    });

    res.status(200).json({ ok: true, id });
  });
