// mybeachtrivia.com/functions_gcfv1/shift-swap.js
//
// Admin approval of a host shift-swap. Phase 3 of the shift-swap feature.
//
// A host offers a shift (shiftCoverageRequests, offerType open|direct); another
// host accepts it → the request moves to status "pending_admin" and the shift is
// NOT reassigned. These callables let an admin finalise it:
//
//   approveShiftSwap({ requestId })  — moves shifts/{shiftId}.employeeId to the
//     accepting host and sets the request "approved". Runs in a transaction and
//     refuses if the shift vanished or was already reassigned. Then supersedes
//     any other still-active requests for the same shift.
//   rejectShiftSwap({ requestId, reason? }) — sets the request "rejected"; the
//     shift is untouched (it was never moved).
//
// onCoverageRequestWrite (notifications.js) fires swap_approved / swap_rejected
// to both hosts on these transitions.

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const REGION = "us-central1";
const COL = "shiftCoverageRequests";

function db() {
  return admin.firestore();
}

async function assertAdmin(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required");
  }
  if (context.auth.token && context.auth.token.admin === true) {
    return context.auth.uid;
  }
  const snap = await db().collection("employees").doc(context.auth.uid).get();
  const d = snap.exists ? snap.data() || {} : {};
  const roles = Array.isArray(d.roles) ? d.roles : d.role ? [d.role] : [];
  if (!(d.active === true && (roles.includes("admin") || roles.includes("superadmin")))) {
    throw new functions.https.HttpsError("permission-denied", "Admin only");
  }
  return context.auth.uid;
}

async function adminName(uid) {
  try {
    const s = await db().collection("employees").doc(uid).get();
    const d = s.exists ? s.data() || {} : {};
    return (
      [d.firstName, d.lastName].filter(Boolean).join(" ") ||
      d.nickname ||
      d.email ||
      "Admin"
    );
  } catch (_) {
    return "Admin";
  }
}

/* ── approveShiftSwap ──────────────────────────────────────────────────── */

exports.approveShiftSwap = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    const adminUid = await assertAdmin(context);
    const requestId = String((data && data.requestId) || "").trim();
    if (!requestId) {
      throw new functions.https.HttpsError("invalid-argument", "requestId is required");
    }

    const reqRef = db().collection(COL).doc(requestId);
    const reviewer = await adminName(adminUid);

    // The transaction never throws for a "close the request" outcome — throwing
    // inside runTransaction rolls back the very update that closes it. Instead it
    // returns an outcome; the caller does the follow-up write + throws after.
    const result = await db().runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) {
        throw new functions.https.HttpsError("not-found", "That request no longer exists.");
      }
      const req = reqSnap.data();

      if (req.status !== "pending_admin") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `This request is "${req.status}", not awaiting approval.`
        );
      }
      if (!req.acceptingHostId) {
        throw new functions.https.HttpsError("failed-precondition", "No host has accepted this offer.");
      }
      if (!req.shiftId) {
        throw new functions.https.HttpsError("failed-precondition", "Request has no shift attached.");
      }

      const shiftRef = db().collection("shifts").doc(req.shiftId);
      const shiftSnap = await tx.get(shiftRef);
      const now = admin.firestore.FieldValue.serverTimestamp();

      if (!shiftSnap.exists) {
        return { outcome: "shift_missing" };
      }
      if (String(shiftSnap.data().employeeId || "") !== String(req.requestingHostId || "")) {
        return { outcome: "reassigned" };
      }

      // The one write that matters: move the shift.
      tx.update(shiftRef, { employeeId: req.acceptingHostId, updatedAt: now });
      tx.update(reqRef, {
        status: "approved",
        adminReviewedAt: now,
        adminReviewedBy: adminUid,
        adminReviewedByName: reviewer,
        updatedAt: now,
      });

      return { outcome: "approved", shiftId: req.shiftId, movedTo: req.acceptingHostId };
    });

    if (result.outcome === "shift_missing") {
      const now = admin.firestore.FieldValue.serverTimestamp();
      await reqRef.update({
        status: "shift_deleted",
        adminReviewedAt: now,
        adminReviewedBy: adminUid,
        adminReviewedByName: reviewer,
        resolutionNote: "The shift no longer exists.",
        updatedAt: now,
      });
      throw new functions.https.HttpsError(
        "failed-precondition",
        "That shift no longer exists — the request has been closed."
      );
    }
    if (result.outcome === "reassigned") {
      const now = admin.firestore.FieldValue.serverTimestamp();
      await reqRef.update({
        status: "rejected",
        adminReviewedAt: now,
        adminReviewedBy: adminUid,
        adminReviewedByName: reviewer,
        rejectionReason: "The shift was reassigned before this swap was approved.",
        updatedAt: now,
      });
      throw new functions.https.HttpsError(
        "failed-precondition",
        "That shift was already reassigned — the request has been closed."
      );
    }

    // Supersede any other still-active requests for the same shift.
    try {
      const siblings = await db().collection(COL).where("shiftId", "==", result.shiftId).get();
      const batch = db().batch();
      let n = 0;
      const now = admin.firestore.FieldValue.serverTimestamp();
      siblings.docs.forEach((d) => {
        if (d.id === requestId) return;
        const s = d.data().status;
        if (s === "open" || s === "pending_admin") {
          batch.update(d.ref, {
            status: "cancelled",
            resolutionNote: "Another swap for this shift was approved.",
            updatedAt: now,
          });
          n++;
        }
      });
      if (n) await batch.commit();
    } catch (e) {
      console.error("[approveShiftSwap] sibling cleanup failed:", e);
    }

    return result;
  });

/* ── rejectShiftSwap ───────────────────────────────────────────────────── */

exports.rejectShiftSwap = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    const adminUid = await assertAdmin(context);
    const requestId = String((data && data.requestId) || "").trim();
    const reason = String((data && data.reason) || "").trim().slice(0, 500);
    if (!requestId) {
      throw new functions.https.HttpsError("invalid-argument", "requestId is required");
    }

    const ref = db().collection(COL).doc(requestId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError("not-found", "That request no longer exists.");
    }
    if (snap.data().status !== "pending_admin") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `This request is "${snap.data().status}", not awaiting approval.`
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.update({
      status: "rejected",
      rejectionReason: reason || null,
      adminReviewedAt: now,
      adminReviewedBy: adminUid,
      adminReviewedByName: await adminName(adminUid),
      updatedAt: now,
    });

    return { ok: true };
  });
