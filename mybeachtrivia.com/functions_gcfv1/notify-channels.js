// mybeachtrivia.com/functions_gcfv1/notify-channels.js
//
// Phase 8 — the two "extra" notification channels layered on top of the in-app
// bell (`notifications` collection, see notifications.js):
//
//   sendEmail({ to, subject, text, html })      — Resend HTTP API. Key from
//                                                 RESEND_API_KEY (functions_gcfv1/.env)
//                                                 or functions.config().resend.key.
//                                                 No-ops if no key is configured.
//   sendPushToUsers(uids, { title, body, link }) — FCM web push to every token in
//                                                 employees/{uid}.fcmTokens.
//                                                 Prunes dead tokens.
//   emailForUids(uids)                           — resolve employee emails.
//
// All three are best-effort: failures are logged, never thrown, so a flaky
// Resend / FCM call can't roll back the Firestore write that triggered it.

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const SITE = "https://mybeachtrivia.com";

// Sender. `onboarding@resend.dev` works with zero DNS setup; switch
// BT_NOTIFY_EMAIL_FROM to noreply@mybeachtrivia.com once the domain is verified
// in the Resend dashboard.
function fromAddr() {
  const addr = String(process.env.BT_NOTIFY_EMAIL_FROM || "onboarding@resend.dev").trim();
  return `Beach Trivia <${addr}>`;
}

function db() {
  return admin.firestore();
}

/* ── Resend ────────────────────────────────────────────────────────────── */

function resendKey() {
  return String(
    process.env.RESEND_API_KEY ||
    (functions.config().resend && functions.config().resend.key) ||
    ""
  ).trim();
}

// Delivery gate. Staging shares the real `employees` emails, so a broadcast
// fired while testing would spam real hosts.
//   BT_NOTIFY_EMAIL = "live"  → send to everyone (production)
//                   = "test"  → send only to BT_NOTIFY_EMAIL_ALLOWLIST
//                   = other / unset → don't send, just log (default, safe)
//
// Note: the resend.dev sandbox sender can ONLY deliver to the Resend account
// owner's address until a domain is verified — keep BT_NOTIFY_EMAIL=test with
// joshuaveator@gmail.com on the allowlist until then.
function emailMode() {
  return String(process.env.BT_NOTIFY_EMAIL || "").trim().toLowerCase();
}
function emailAllowlist() {
  return String(process.env.BT_NOTIFY_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {{to: string|string[], subject: string, text: string, html?: string,
 *          force?: boolean}} msg
 *   force: bypass the BT_NOTIFY_EMAIL test/live gate. Only for mail to a fixed
 *   internal address (not a broadcast to employee inboxes) — e.g. the
 *   "new job application" heads-up. A Resend key is still required.
 */
async function sendEmail(msg) {
  const mode = emailMode();
  let to = (Array.isArray(msg.to) ? msg.to : [msg.to])
    .map((e) => String(e || "").trim().toLowerCase())
    .filter((e) => e && e.includes("@"));
  if (!to.length) return { ok: false, skipped: "no-recipients" };

  if (msg.force) {
    // skip the delivery gate entirely
  } else if (mode === "test") {
    const allow = emailAllowlist();
    to = to.filter((e) => allow.includes(e));
    if (!to.length) {
      console.log("[notify-channels] email(test): no recipients on allowlist, skipping");
      return { ok: false, skipped: "not-on-allowlist" };
    }
  } else if (mode !== "live") {
    console.log(
      `[notify-channels] email disabled (BT_NOTIFY_EMAIL="${process.env.BT_NOTIFY_EMAIL || ""}") — ` +
      `would have sent "${msg.subject}" to ${to.length} recipient(s)`
    );
    return { ok: false, skipped: "disabled" };
  }

  const key = resendKey();
  if (!key) {
    console.warn("[notify-channels] no Resend key (RESEND_API_KEY) — email disabled");
    return { ok: false, skipped: "no-key" };
  }

  const subject = msg.subject || "Beach Trivia";
  const html = msg.html || textToHtml(msg.text || "");
  const from = fromAddr();

  // One message per recipient (no shared To: header) via Resend's batch endpoint.
  const payload = to.map((addr) => ({
    from,
    to: [addr],
    subject,
    text: msg.text || "",
    html,
  }));

  try {
    const resp = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error(`[notify-channels] sendEmail failed: HTTP ${resp.status} ${detail}`.trim());
      return { ok: false, error: `HTTP ${resp.status} ${detail}`.trim() };
    }
    console.log(`[notify-channels] email sent (${mode}): "${subject}" → ${to.join(", ")}`);
    return { ok: true, count: to.length };
  } catch (err) {
    console.error("[notify-channels] sendEmail failed:", err && err.message ? err.message : err);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

function textToHtml(text) {
  return (
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937">' +
    esc(text).replace(/\n/g, "<br>") +
    "</div>"
  );
}

/** Small helper: build a standard BT email body with an optional CTA button. */
function emailShell({ heading, lines, ctaText, ctaHref }) {
  const safeLines = (lines || []).map((l) => `<p style="margin:0 0 10px">${esc(l)}</p>`).join("");
  const cta =
    ctaText && ctaHref
      ? `<p style="margin:18px 0 4px"><a href="${esc(ctaHref)}" ` +
        `style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;` +
        `padding:10px 18px;border-radius:8px;font-weight:600">${esc(ctaText)}</a></p>`
      : "";
  return (
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;' +
    'max-width:520px;margin:0 auto;padding:8px 4px;color:#1f2937">' +
    (heading ? `<h2 style="font-size:18px;margin:0 0 12px">${esc(heading)}</h2>` : "") +
    safeLines +
    cta +
    '<hr style="border:0;border-top:1px solid #e5e7eb;margin:22px 0 10px">' +
    '<p style="font-size:12px;color:#6b7280;margin:0">Beach Trivia · mybeachtrivia.com</p>' +
    "</div>"
  );
}

/* ── employee lookups ──────────────────────────────────────────────────── */

async function emailForUids(uids) {
  const ids = [...new Set((uids || []).filter(Boolean))];
  const out = [];
  await Promise.all(
    ids.map(async (uid) => {
      try {
        const snap = await db().collection("employees").doc(uid).get();
        const e = snap.exists ? (snap.data() || {}).email : null;
        if (e) out.push(String(e).trim().toLowerCase());
        else {
          // fall back to the Auth record
          const u = await admin.auth().getUser(uid).catch(() => null);
          if (u && u.email) out.push(u.email.toLowerCase());
        }
      } catch (_) {}
    })
  );
  return [...new Set(out)];
}

/* ── FCM web push ──────────────────────────────────────────────────────── */

async function tokensForUids(uids) {
  const ids = [...new Set((uids || []).filter(Boolean))];
  const map = {}; // token -> uid
  await Promise.all(
    ids.map(async (uid) => {
      try {
        const snap = await db().collection("employees").doc(uid).get();
        const arr = snap.exists ? (snap.data() || {}).fcmTokens : null;
        if (Array.isArray(arr)) arr.forEach((t) => { if (t) map[t] = uid; });
      } catch (_) {}
    })
  );
  return map;
}

async function pruneTokens(byUid) {
  // byUid: { [uid]: [tokensToRemove] }
  await Promise.all(
    Object.keys(byUid).map(async (uid) => {
      const bad = byUid[uid];
      if (!bad || !bad.length) return;
      try {
        await db().collection("employees").doc(uid).update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(...bad),
        });
      } catch (err) {
        console.error("[notify-channels] token prune failed for", uid, err);
      }
    })
  );
}

/**
 * @param {string[]} uids
 * @param {{title: string, body: string, link?: string}} payload
 */
async function sendPushToUsers(uids, payload) {
  const tokenMap = await tokensForUids(uids);
  const tokens = Object.keys(tokenMap);
  if (!tokens.length) return { ok: true, sent: 0 };

  const link = payload.link
    ? (payload.link.startsWith("http") ? payload.link : SITE + payload.link)
    : SITE;

  const message = {
    tokens,
    notification: { title: payload.title || "Beach Trivia", body: payload.body || "" },
    webpush: {
      notification: {
        title: payload.title || "Beach Trivia",
        body: payload.body || "",
        icon: SITE + "/beachTriviaPages/images/BTlogo.png",
        badge: SITE + "/favicon-48x48.png",
      },
      fcmOptions: { link },
    },
    data: { link },
  };

  try {
    const res = await admin.messaging().sendEachForMulticast(message);
    const prune = {};
    res.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error && r.error.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        const tok = tokens[i];
        const uid = tokenMap[tok];
        (prune[uid] = prune[uid] || []).push(tok);
      } else {
        console.warn("[notify-channels] push error:", code, r.error && r.error.message);
      }
    });
    if (Object.keys(prune).length) await pruneTokens(prune);
    return { ok: true, sent: res.successCount, failed: res.failureCount };
  } catch (err) {
    console.error("[notify-channels] sendPushToUsers failed:", err && err.message ? err.message : err);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

module.exports = {
  SITE,
  sendEmail,
  emailShell,
  emailForUids,
  sendPushToUsers,
};
