// functions/index.js
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();
function sanitizeRoles(input) {
  let arr = Array.isArray(input) ? input : (input ? [input] : []);
  arr = arr.map(r => String(r).toLowerCase().trim());
  const allowed = new Set(['host','admin','regional','supply','writer','social']);
  const out = [];
  for (const r of arr) if (allowed.has(r) && !out.includes(r)) out.push(r);
  if (out.length === 0) out.push('host');
  return out;
}


/** -----------------------------
 * Helpers
 * ----------------------------*/
async function resolveAuth(data, context) {
  if (context && context.auth && context.auth.uid) {
    return {
      uid: context.auth.uid,
      email: context.auth.token?.email || null,
      tokenClaims: context.auth.token || {} };
  }
  const idTok = typeof data?.idToken === "string" ? data.idToken.trim() : "";
  if (!idTok) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required");
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idTok, false);
  } catch (_e) {
    throw new functions.https.HttpsError("unauthenticated", "Invalid ID token");
  }
  return { uid: decoded.uid, email: decoded.email || null, tokenClaims: decoded };
}

async function assertAdminFromCaller(caller) {
  if (caller.tokenClaims?.admin === true) return;
  const snap = await db.collection("employees").doc(caller.uid).get();
  if (!snap.exists) {
    throw new functions.https.HttpsError("permission-denied", "No employee record");
  }
  const d = snap.data() || {};
  const roles = Array.isArray(d.roles) ? d.roles : (d.role ? [d.role] : []);
  if (!(d.active === true && roles.includes("admin"))) {
    throw new functions.https.HttpsError("permission-denied", "Admin only");
  }
}

/** Convert employee doc → desired claims */
function desiredClaimsFromEmployeeDoc(d) {
  const roles = Array.isArray(d?.roles) ? d.roles : (d?.role ? [d.role] : []);
  const active = d?.active === true;
  return {
    admin: active && roles.includes("admin") ? true : undefined, // omit when false
  };
}

/** Merge/strip claim keys cleanly */
function mergeClaims(current, desired) {
  const next = { ...(current || {}) };
  for (const k of Object.keys(desired)) {
    const v = desired[k];
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return next;
}

/** Set custom claims for a user based on an employee doc (id == uid) */
async function syncClaimsFromDoc(uid) {
  const snap = await db.collection("employees").doc(uid).get();
  const d = snap.exists ? (snap.data() || {}) : {};
  const desired = desiredClaimsFromEmployeeDoc(d);

  const user = await admin.auth().getUser(uid).catch(() => null);
  if (!user) return { changed: false, reason: "user-not-found" };

  const current = user.customClaims || {};
  const next = mergeClaims(current, desired);

  // Only write if changed
  const changed =
    JSON.stringify({ ...current }) !== JSON.stringify({ ...next });

  if (changed) {
    await admin.auth().setCustomUserClaims(uid, next);
  }
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
    if (!email) {
      throw new functions.https.HttpsError("invalid-argument", "email required");
    }

    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
    } catch (e) {
      if (e.code === "auth/user-not-found") {
        user = await admin.auth().createUser({ email, emailVerified: false, disabled: false });
      } else {
        throw new functions.https.HttpsError("internal", "get/create user failed", e);
      }
    }
    const uid = user.uid;

    await db.collection("employees").doc(uid).set(
      {
                role: admin.firestore.FieldValue.delete(),
uid,
        email,
        role,                // single role kept for back-compat
        roles: roles,       // normalized array
        active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    // Sync claims from the doc (source of truth)
    await syncClaimsFromDoc(uid);

    const actionCodeSettings = {
      url: "https://mybeachtrivia.com/login.html",
      handleCodeInApp: false };
    const resetLink = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);

    return { uid, resetLink };
  });

/** whoami (callable) */
exports.whoami = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    const hasAuth = !!(context && context.auth);
    return {
      hasAuth,
      uid: hasAuth ? context.auth.uid : null,
      aud: hasAuth ? context.auth.token?.aud : null,
      iss: hasAuth ? context.auth.token?.iss : null,
      email: hasAuth ? context.auth.token?.email : null,
      claims: hasAuth ? context.auth.token : null };
  });

/** -----------------------------
 * Automatic claims sync on employee doc changes
 * ----------------------------*/
exports.onEmployeeWrite = functions
  .region("us-central1")
  .firestore.document("employees/{uid}")
  .onWrite(async (change, context) => {
    const { uid } = context.params;
    // Always try to sync (create/update/delete)
    const res = await syncClaimsFromDoc(uid);
    return res;
  });

/** -----------------------------
 * Self-repair callable (any signed-in user)
 * Reads caller's employee doc and reasserts claims
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
