// mybeachtrivia.com/functions_gcfv1/time-off.js
//
// Admin review of host time-off requests (Phase 5 of the shift-swap/time-off
// feature). Host-side request + cancel is plain client Firestore (rules).
//
//   approveTimeOff({ requestId, reassignments? }) — admin onCall. Approves a
//     pending request. `reassignments` is { [shiftId]: newHostId } for the
//     host's shifts that overlap the time-off range; any overlapping shift NOT
//     reassigned is flagged shifts.timeOffConflict = true (resolve-later). The
//     admin calendar renders flagged shifts red; onTimeOffRequestWrite clears
//     the flags if the request is later cancelled/denied.
//   denyTimeOff({ requestId, reason? }) — admin onCall. status -> "denied".
//
// onTimeOffRequestWrite (notifications.js) handles the bell fan-out
// (timeoff_submitted / timeoff_approved / timeoff_denied) and the flag cleanup.

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const REGION = "us-central1";
const COL = "timeOffRequests";

function db() {
  return admin.firestore();
}

async function assertAdmin(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required");
  }
  if (context.auth.token && context.auth.token.admin === true) return context.auth.uid;
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
    return [d.firstName, d.lastName].filter(Boolean).join(" ") || d.nickname || d.email || "Admin";
  } catch (_) {
    return "Admin";
  }
}

async function overlappingShifts(hostId, startDate, endDate) {
  const snap = await db()
    .collection("shifts")
    .where("employeeId", "==", hostId)
    .where("date", ">=", startDate)
    .where("date", "<=", endDate)
    .get();
  return snap.docs;
}

/* ── approveTimeOff ────────────────────────────────────────────────────── */

exports.approveTimeOff = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    const adminUid = await assertAdmin(context);
    const requestId = String((data && data.requestId) || "").trim();
    if (!requestId) {
      throw new functions.https.HttpsError("invalid-argument", "requestId is required");
    }
    const reassignments =
      data && data.reassignments && typeof data.reassignments === "object"
        ? data.reassignments
        : {};

    const reqRef = db().collection(COL).doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) {
      throw new functions.https.HttpsError("not-found", "That request no longer exists.");
    }
    const req = reqSnap.data();
    if (req.status !== "pending") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `This request is "${req.status}", not awaiting review.`
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const reviewer = await adminName(adminUid);

    const conflicts = await overlappingShifts(req.hostId, req.startDate, req.endDate);
    const conflictIds = conflicts.map((d) => d.id);

    // Validate any requested reassignments are actually in the conflict set.
    for (const shiftId of Object.keys(reassignments)) {
      if (!conflictIds.includes(shiftId)) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "A shift in the reassignment list is no longer a conflict — reopen the popup and try again."
        );
      }
      if (typeof reassignments[shiftId] !== "string" || !reassignments[shiftId]) {
        throw new functions.https.HttpsError("invalid-argument", "Every reassigned shift needs a host.");
      }
    }

    const batch = db().batch();
    const deferredShiftIds = [];

    conflicts.forEach((doc) => {
      const newHost = reassignments[doc.id];
      if (newHost) {
        batch.update(doc.ref, {
          employeeId: newHost,
          timeOffConflict: admin.firestore.FieldValue.delete(),
          timeOffRequestId: admin.firestore.FieldValue.delete(),
          updatedAt: now,
        });
      } else {
        batch.update(doc.ref, {
          timeOffConflict: true,
          timeOffRequestId: requestId,
          updatedAt: now,
        });
        deferredShiftIds.push(doc.id);
      }
    });

    const resolution =
      conflictIds.length === 0
        ? "none"
        : deferredShiftIds.length === 0
          ? "resolved"
          : deferredShiftIds.length === conflictIds.length
            ? "deferred"
            : "partial";

    batch.update(reqRef, {
      status: "approved",
      reviewedAt: now,
      reviewedBy: adminUid,
      reviewedByName: reviewer,
      conflictResolution: resolution,
      deferredShiftIds: deferredShiftIds,
      updatedAt: now,
    });

    await batch.commit();

    return {
      ok: true,
      conflicts: conflictIds.length,
      reassigned: Object.keys(reassignments).length,
      deferred: deferredShiftIds.length,
      resolution,
    };
  });

/* ── denyTimeOff ───────────────────────────────────────────────────────── */

exports.denyTimeOff = functions
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
    if (snap.data().status !== "pending") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `This request is "${snap.data().status}", not awaiting review.`
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.update({
      status: "denied",
      denialReason: reason || null,
      reviewedAt: now,
      reviewedBy: adminUid,
      reviewedByName: await adminName(adminUid),
      updatedAt: now,
    });

    return { ok: true };
  });
