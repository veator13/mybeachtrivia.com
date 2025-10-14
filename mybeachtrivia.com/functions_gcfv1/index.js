// functions_gcfv1/index.js
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

/** --------------------------------
 * Optional: SendGrid (only used if a key is configured)
 * --------------------------------*/
let sgMail = null;
const SENDGRID_API_KEY =
  process.env.SENDGRID_API_KEY ||
  (functions.config().sendgrid && functions.config().sendgrid.key) ||
  "";
if (SENDGRID_API_KEY) {
  sgMail = require("@sendgrid/mail");
  sgMail.setApiKey(SENDGRID_API_KEY);
}

/** --------------------------------
 * Roles: canonicalization & sanitize
 * --------------------------------*/
const ALLOWED_ROLES = new Set(["host", "admin", "regional", "supply", "writer", "social"]);
const ROLE_ALIASES = {
  regional_manager: "regional",
  supply_manager: "supply",
  social_media_manager: "social",
  host: "host",
  admin: "admin",
  regional: "regional",
  supply: "supply",
  writer: "writer",
  social: "social",
};
const canonicalizeRole = (r) =>
  ROLE_ALIASES[String(r || "").toLowerCase().trim()] || String(r || "").toLowerCase().trim();

function sanitizeRoles(input) {
  let arr = Array.isArray(input) ? input : input ? [input] : [];
  arr = arr.map(canonicalizeRole).filter(Boolean);
  const out = [];
  for (const r of arr) if (ALLOWED_ROLES.has(r) && !out.includes(r)) out.push(r);
  if (out.length === 0) out.push("host");
  return out;
}

/** -----------------------------
 * Helpers
 * ----------------------------*/
async function resolveAuth(data, context) {
  if (context?.auth?.uid) {
    return {
      uid: context.auth.uid,
      email: context.auth.token?.email || null,
      tokenClaims: context.auth.token || {},
    };
  }
  const idTok = typeof data?.idToken === "string" ? data.idToken.trim() : "";
  if (!idTok) throw new functions.https.HttpsError("unauthenticated", "Sign in required");
  try {
    const decoded = await admin.auth().verifyIdToken(idTok, false);
    return { uid: decoded.uid, email: decoded.email || null, tokenClaims: decoded };
  } catch {
    throw new functions.https.HttpsError("unauthenticated", "Invalid ID token");
  }
}

async function assertAdminFromCaller(caller) {
  if (caller.tokenClaims?.admin === true) return;
  const snap = await db.collection("employees").doc(caller.uid).get();
  if (!snap.exists) throw new functions.https.HttpsError("permission-denied", "No employee record");
  const d = snap.data() || {};
  const roles = Array.isArray(d.roles) ? d.roles : d.role ? [d.role] : [];
  if (!(d.active === true && roles.includes("admin"))) {
    throw new functions.https.HttpsError("permission-denied", "Admin only");
  }
}

function desiredClaimsFromEmployeeDoc(d) {
  const roles = Array.isArray(d?.roles) ? d.roles : d?.role ? [d.role] : [];
  const active = d?.active === true;
  return { admin: active && roles.includes("admin") ? true : undefined };
}

function mergeClaims(current, desired) {
  const next = { ...(current || {}) };
  for (const k of Object.keys(desired)) {
    const v = desired[k];
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return next;
}

async function syncClaimsFromDoc(uid) {
  const snap = await db.collection("employees").doc(uid).get();
  const d = snap.exists ? snap.data() || {} : {};
  const desired = desiredClaimsFromEmployeeDoc(d);

  const user = await admin.auth().getUser(uid).catch(() => null);
  if (!user) return { changed: false, reason: "user-not-found" };

  const current = user.customClaims || {};
  const next = mergeClaims(current, desired);
  const changed = JSON.stringify(current) !== JSON.stringify(next);
  if (changed) await admin.auth().setCustomUserClaims(uid, next);
  return { changed, claims: next };
}

/** -----------------------------
 * Admin create employee (callable)
 * ----------------------------*/
exports.adminCreateEmployee = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    const caller = await resolveAuth(data, context);
    await assertAdminFromCaller(caller);

    const email = String(data?.email || "").trim().toLowerCase();
    const roles = sanitizeRoles(data?.roles || data?.role);
    if (!email) throw new functions.https.HttpsError("invalid-argument", "email required");

    // Get or create Auth user
    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
    } catch (e) {
      if (e.code === "auth/user-not-found") {
        user = await admin.auth().createUser({ email, emailVerified: false, disabled: false });
      } else {
        console.error("[adminCreateEmployee] getUserByEmail failed:", e);
        throw new functions.https.HttpsError("internal", "get/create user failed");
      }
    }
    const uid = user.uid;

    // Write employees doc (array-only roles) and remove legacy 'role'
    try {
      await db.collection("employees").doc(uid).set(
        {
          uid,
          email,
          roles,
          active: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          role: admin.firestore.FieldValue.delete(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error("[adminCreateEmployee] Firestore write failed:", e);
      throw new functions.https.HttpsError("internal", "failed to write employee doc");
    }

    // Best-effort claims sync
    try {
      await syncClaimsFromDoc(uid);
    } catch (e) {
      console.error("[adminCreateEmployee] syncClaimsFromDoc failed:", e);
    }

    // Build continue URL (login will redirect to onboarding)
    // NOTE: Use the domain that serves your login.html (web.app or custom domain).
    const continueUrl = new URL("https://mybeachtrivia.com/login.html");
    continueUrl.searchParams.set("return", "/beachTriviaPages/onboarding/account-setup/");

    // Generate password reset link (absolute, complete URL)
    let resetLink;
    try {
      resetLink = await admin.auth().generatePasswordResetLink(email, {
        url: continueUrl.toString(),
        handleCodeInApp: false,
      });
    } catch (e) {
      console.error("[adminCreateEmployee] resetLink failed:", e);
      throw new functions.https.HttpsError(
        "failed-precondition",
        `Password link failed: ${e?.message || e?.code || "unknown"}`
      );
    }

    // Optionally send the email via SendGrid
    let emailSent = false;
    if (sgMail) {
      try {
        await sgMail.send({
          to: email,
          from: { email: "mybeachtrivia@gmail.com", name: "Beach Trivia" },
          subject: "Set up your Beach Trivia account",
          text: `Welcome!\n\nClick this link to set your password:\n${resetLink}\n\nIf you didn’t expect this, ignore this email.`,
          html: `
            <p>Welcome!</p>
            <p>Click this link to set your password:</p>
            <p><a href="${resetLink}" target="_blank" rel="noopener">${resetLink}</a></p>
            <p>If you didn’t expect this, ignore this email.</p>
          `,
          // Prevent SendGrid from mangling the long querystring
          trackingSettings: { clickTracking: { enable: false, enableText: false } },
          tracking_settings: { click_tracking: { enable: false, enable_text: false } },
        });
        emailSent = true;
      } catch (e) {
        console.error("[adminCreateEmployee] SendGrid send failed:", e);
        // Non-fatal: we still return the link
      }
    }

    return { uid, resetLink, emailSent };
  });

/** -----------------------------
 * Admin delete employee (callable)
 * Deletes both Firestore employees/{uid} and Auth user
 * ----------------------------*/
exports.adminDeleteEmployee = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    const caller = await resolveAuth(data, context);
    await assertAdminFromCaller(caller);

    const uidIn = (data?.uid && String(data.uid).trim()) || "";
    const emailIn = (data?.email && String(data.email).trim().toLowerCase()) || "";
    if (!uidIn && !emailIn) {
      throw new functions.https.HttpsError("invalid-argument", "Provide uid or email");
    }

    // Resolve UID if only email provided
    let targetUid = uidIn;
    if (!targetUid) {
      const u = await admin.auth().getUserByEmail(emailIn).catch(() => null);
      if (!u) throw new functions.https.HttpsError("not-found", "User not found for email");
      targetUid = u.uid;
    }

    // Delete Firestore (ignore if missing)
    await db.doc(`employees/${targetUid}`).delete().catch(() => {});

    // Delete Auth user; ignore not-found
    try {
      await admin.auth().deleteUser(targetUid);
    } catch (e) {
      if (e.code !== "auth/user-not-found") {
        console.error("[adminDeleteEmployee] deleteUser failed:", e);
        throw new functions.https.HttpsError("internal", "Failed to delete auth user");
      }
    }
    return { ok: true, uid: targetUid };
  });

/** whoami (callable) */
exports.whoami = functions
  .region("us-central1")
  .https.onCall(async (_data, context) => {
    const hasAuth = !!context?.auth;
    return {
      hasAuth,
      uid: hasAuth ? context.auth.uid : null,
      aud: hasAuth ? context.auth.token?.aud : null,
      iss: hasAuth ? context.auth.token?.iss : null,
      email: hasAuth ? context.auth.token?.email : null,
      claims: hasAuth ? context.auth.token : null,
    };
  });

/** -----------------------------
 * Firestore trigger: keep claims in sync and
 * delete Auth user if employees/{uid} doc is deleted.
 * ----------------------------*/
exports.onEmployeeWrite = functions
  .region("us-central1")
  .firestore.document("employees/{uid}")
  .onWrite(async (change, context) => {
    const { uid } = context.params;

    // If the document was deleted, delete the Auth user (idempotent)
    if (!change.after.exists) {
      try {
        await admin.auth().deleteUser(uid);
        return { deletedAuth: true, uid };
      } catch (e) {
        if (e.code === "auth/user-not-found") return { deletedAuth: false, reason: "user-not-found" };
        console.error("[onEmployeeWrite] deleteUser failed:", e);
        return null;
      }
    }

    // Else, sync claims from doc
    try {
      return await syncClaimsFromDoc(uid);
    } catch (e) {
      console.error("[onEmployeeWrite] sync failed:", e);
      return null;
    }
  });

/** -----------------------------
 * Self-repair callable (any signed-in user)
 * ----------------------------*/
exports.reassertMyClaims = functions
  .region("us-central1")
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in required");
    }
    const uid = context.auth.uid;
    const res = await syncClaimsFromDoc(uid);
    return { ok: true, changed: res.changed, claims: res.claims };
  });