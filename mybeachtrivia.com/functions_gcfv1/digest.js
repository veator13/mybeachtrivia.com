// mybeachtrivia.com/functions_gcfv1/digest.js
//
// Phase 8 — scheduled jobs for the shift-swap / time-off feature.
//
//   shiftOfferDigest  — Sunday & Monday 07:00 America/New_York.
//     • Sunday: any shift offer still `status:"open"` for a shift in the week
//       that locks tomorrow morning → one digest notification + email to every
//       admin ("these shifts still aren't covered").
//     • Monday: same, for the week that just locked.
//     • Both runs also sweep: `open` offers whose shift date is already past
//       get marked `expired` (nobody took them; the original host still works
//       the shift).
//
// Uses the in-app bell (`notifications` via writeOne) + email/push
// (notify-channels) — same channels as notifications.js.

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const channels = require("./notify-channels");

const REGION = "us-central1";
const TZ = "America/New_York";
const ADMIN_CALENDAR = "/beachTriviaPages/dashboards/admin/calendar/";

function db() {
  return admin.firestore();
}

/* ── date helpers (all in America/New_York) ────────────────────────────── */

function nyParts(d = new Date()) {
  // en-CA gives YYYY-MM-DD; weekday short gives Mon/Tue/…
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return { ymd, dow };
}

function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function prettyDate(ymd) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  if (!y) return String(ymd);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

/* ── recipients ────────────────────────────────────────────────────────── */

function rolesOf(emp) {
  const r = emp && emp.roles;
  if (Array.isArray(r)) return r.map((x) => String(x).toLowerCase());
  if (r && typeof r === "object") return Object.keys(r).filter((k) => r[k]).map((x) => x.toLowerCase());
  return [];
}

async function adminUids() {
  const snap = await db().collection("employees").where("active", "==", true).get();
  return snap.docs
    .filter((doc) => {
      const r = rolesOf(doc.data());
      return r.includes("admin") || r.includes("superadmin");
    })
    .map((doc) => doc.id);
}

/* ── bell writer (idempotent per digest date) ──────────────────────────── */

async function writeBell(recipientId, srcTag, payload) {
  if (!recipientId) return false;
  const id = `${srcTag}__${recipientId}`.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 480);
  const ref = db().collection("notifications").doc(id);
  if ((await ref.get()).exists) return false;
  // Matches notifications.js: self-delete 60 days out via the Firestore TTL
  // policy on `expiresAt`.
  const expiresAt = admin.firestore.Timestamp.fromMillis(
    Date.now() + 60 * 24 * 60 * 60 * 1000
  );
  await ref.set({
    recipientId,
    type: payload.type,
    title: payload.title || "",
    body: payload.body || "",
    link: payload.link || "",
    data: payload.data || {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    readAt: null,
    expiresAt,
  });
  return true;
}

/* ── the job ───────────────────────────────────────────────────────────── */

async function runDigest(now) {
  const { ymd: today, dow } = nyParts(now);

  // Window of shifts to check — always today-or-later, ending Saturday.
  //   Sunday run  → the week that locks tomorrow: Mon..Sat.
  //   Monday run  → the week that just locked: today (Mon)..Sat.
  //   (any other day, via runShiftOfferDigestNow) → today..Sat.
  let weekStart, weekEnd;
  if (dow === 0) {
    weekStart = addDays(today, 1);
    weekEnd = addDays(weekStart, 5);
  } else {
    weekStart = today;
    weekEnd = addDays(today, 6 - dow); // dow 6 (Sat) → today
  }

  const openSnap = await db()
    .collection("shiftCoverageRequests")
    .where("status", "==", "open")
    .get();

  // 1) expire open offers whose shift is already in the past
  const expired = [];
  const batch = db().batch();
  openSnap.docs.forEach((doc) => {
    const x = doc.data() || {};
    if (x.shiftDate && x.shiftDate < today) {
      batch.update(doc.ref, {
        status: "expired",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      expired.push(doc.id);
    }
  });
  if (expired.length) await batch.commit();

  // 2) still-open offers for this week's shifts
  const uncovered = openSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((x) => x.shiftDate && x.shiftDate >= weekStart && x.shiftDate <= weekEnd)
    .sort((a, b) => String(a.shiftDate).localeCompare(String(b.shiftDate)));

  if (!uncovered.length) {
    functions.logger.info(`shiftOfferDigest ${today}: nothing uncovered (${expired.length} expired)`);
    return { uncovered: 0, expired: expired.length };
  }

  const lines = uncovered.map((x) => {
    const who = x.requestingHostName || "a host";
    const loc = x.location || "";
    return `• ${prettyDate(x.shiftDate)} — ${loc} (offered by ${who})`;
  });

  const when = dow === 0 ? "the week starting tomorrow" : "this week";
  const title =
    uncovered.length === 1
      ? "1 shift still needs a host"
      : `${uncovered.length} shifts still need a host`;
  const body = `Still uncovered ${when}: ` +
    uncovered.map((x) => `${x.location || "?"} ${prettyDate(x.shiftDate)}`).join(", ");

  const admins = await adminUids();
  const srcTag = `digest_${today}`;
  const wrote = await Promise.all(
    admins.map((uid) =>
      writeBell(uid, srcTag, {
        type: "offer_digest",
        title,
        body,
        link: ADMIN_CALENDAR,
        data: { requestIds: uncovered.map((x) => x.id), weekStart, weekEnd },
      })
    )
  );
  const freshAdmins = admins.filter((_, i) => wrote[i]);

  if (freshAdmins.length) {
    const emails = await channels.emailForUids(freshAdmins);
    if (emails.length) {
      await channels.sendEmail({
        to: emails,
        subject: `Beach Trivia: ${title.toLowerCase()}`,
        text:
          `These offered shifts still have no one to cover them ${when}:\n\n` +
          lines.join("\n") +
          `\n\nAssign someone or reach out to the hosts from the admin calendar:\n` +
          channels.SITE + ADMIN_CALENDAR,
        html: channels.emailShell({
          heading: title,
          lines: [`These offered shifts still have no one to cover them ${when}:`, ...lines],
          ctaText: "Open the admin calendar",
          ctaHref: channels.SITE + ADMIN_CALENDAR,
        }),
      });
    }
    await channels.sendPushToUsers(freshAdmins, { title, body, link: ADMIN_CALENDAR });
  }

  functions.logger.info(
    `shiftOfferDigest ${today}: ${uncovered.length} uncovered, ${expired.length} expired, ${freshAdmins.length} admins notified`
  );
  return { uncovered: uncovered.length, expired: expired.length, admins: freshAdmins.length };
}

exports.shiftOfferDigest = functions
  .region(REGION)
  .pubsub.schedule("0 7 * * 0,1") // Sunday & Monday 07:00
  .timeZone(TZ)
  .onRun(async () => {
    try {
      return await runDigest(new Date());
    } catch (err) {
      functions.logger.error("shiftOfferDigest failed:", err);
      return null;
    }
  });

// Manual trigger for testing (admin-only callable).
exports.runShiftOfferDigestNow = functions
  .region(REGION)
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in required");
    }
    const snap = await db().collection("employees").doc(context.auth.uid).get();
    const roles = rolesOf(snap.exists ? snap.data() : {});
    if (!(snap.exists && snap.data().active === true && roles.includes("admin"))) {
      throw new functions.https.HttpsError("permission-denied", "Admin only");
    }
    return await runDigest(new Date());
  });
