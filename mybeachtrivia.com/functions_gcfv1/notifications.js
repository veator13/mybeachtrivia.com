// mybeachtrivia.com/functions_gcfv1/notifications.js
//
// Materialises the `notifications` collection — the single source of truth for
// the nav bell (beachTriviaPages/js/bt-nav.js). One doc per recipient, written
// here with the Admin SDK. Clients only ever read their own notifications and
// flip `readAt`; they never write the collection.
//
//   notifications/{id}: {
//     recipientId, type, title, body, link, data,
//     createdAt, readAt (null until the recipient opens the bell)
//   }
//
// Phase 0: triggers mirror the EXISTING event model
//   - shiftCoverageRequests  (host offers a shift, another host accepts)
//   - shiftSwapNotifications (admin approval queue for accepted swaps)
//   - hostNotifications      (admin assigns / removes / reassigns a shift)
// The richer swap + time-off events are layered on in later phases.

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const REGION = "us-central1";
const COL = "notifications";

const HOST_CALENDAR = "/beachTriviaPages/dashboards/host/employee-calendar/";
const ADMIN_CALENDAR = "/beachTriviaPages/dashboards/admin/calendar/";

function db() {
  return admin.firestore();
}

/* ── formatting ─────────────────────────────────────────────────────────── */

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return String(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

function fmtTime(t) {
  if (!t) return "";
  if (/[ap]m/i.test(t)) return t;
  const [hStr, mStr] = String(t).split(":");
  let h = parseInt(hStr, 10);
  const min = mStr || "00";
  if (isNaN(h)) return String(t);
  const suffix = h >= 12 ? "PM" : "AM";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${suffix}`;
}

function shiftLine(d) {
  const loc = d.location || d.locationName || d.venueName || "";
  const when = fmtDate(d.shiftDate || d.date);
  const time = d.startTime || d.endTime
    ? `${fmtTime(d.startTime)}${d.endTime ? "–" + fmtTime(d.endTime) : ""}`
    : "";
  return [loc, [when, time].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
}

/* ── recipients ─────────────────────────────────────────────────────────── */

function rolesOf(emp) {
  const r = emp && emp.roles;
  if (Array.isArray(r)) return r.map((x) => String(x).toLowerCase());
  if (r && typeof r === "object") return Object.keys(r).filter((k) => r[k]).map((x) => x.toLowerCase());
  return [];
}

async function activeEmployees() {
  const snap = await db().collection("employees").where("active", "==", true).get();
  return snap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
}

async function hostUids(excludeUid) {
  const emps = await activeEmployees();
  return emps
    .filter((e) => rolesOf(e).includes("host"))
    .map((e) => e.uid)
    .filter((uid) => uid && uid !== excludeUid);
}

async function adminUids() {
  const emps = await activeEmployees();
  return emps
    .filter((e) => {
      const r = rolesOf(e);
      return r.includes("admin") || r.includes("superadmin");
    })
    .map((e) => e.uid)
    .filter(Boolean);
}

/* ── writer (idempotent) ───────────────────────────────────────────────── */

// Deterministic id => a retried trigger overwrites instead of duplicating.
function notifId(srcTag, recipientId) {
  return `${srcTag}__${recipientId}`.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 480);
}

async function writeOne(recipientId, srcTag, payload) {
  if (!recipientId) return;
  const ref = db().collection(COL).doc(notifId(srcTag, recipientId));
  const existing = await ref.get();
  if (existing.exists) return; // already delivered
  await ref.set({
    recipientId,
    type: payload.type,
    title: payload.title || "",
    body: payload.body || "",
    link: payload.link || "",
    data: payload.data || {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    readAt: null,
  });
}

async function fanOut(recipientIds, srcTag, payload) {
  await Promise.all(
    [...new Set(recipientIds)].map((uid) => writeOne(uid, `${srcTag}_${uid}`, payload))
  );
}

/* ── trigger: shiftCoverageRequests ────────────────────────────────────── */

exports.onCoverageRequestWrite = functions
  .region(REGION)
  .firestore.document("shiftCoverageRequests/{reqId}")
  .onWrite(async (change, context) => {
    const { reqId } = context.params;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return null;

    const prevStatus = before ? before.status : null;
    const status = after.status;
    const line = shiftLine(after);
    const data = {
      requestId: reqId,
      shiftId: after.shiftId || "",
      shiftDate: after.shiftDate || "",
      startTime: after.startTime || "",
      endTime: after.endTime || "",
      location: after.location || "",
      eventType: after.eventType || "",
    };

    try {
      // New open offer → tell every other host.
      if (!before && status === "open") {
        const direct = after.offerType === "direct" && after.targetHostId;
        if (direct) {
          await writeOne(after.targetHostId, `cov_${reqId}_direct`, {
            type: "shift_offer_direct",
            title: `${after.requestingHostName || "A host"} offered you a shift`,
            body: line,
            link: HOST_CALENDAR,
            data,
          });
        } else {
          const hosts = await hostUids(after.requestingHostId);
          await fanOut(hosts, `cov_${reqId}_open`, {
            type: "shift_offer_open",
            title: "A shift is up for grabs",
            body: `${line} — offered by ${after.requestingHostName || "a host"}`,
            link: HOST_CALENDAR,
            data,
          });
        }
        return null;
      }

      // A host accepted the offer (current model: "approved").
      if (prevStatus === "open" && status === "approved") {
        await writeOne(after.requestingHostId, `cov_${reqId}_claimed`, {
          type: "shift_offer_claimed",
          title: `${after.acceptingHostName || "A host"} took your shift`,
          body: `${line} — pending admin approval`,
          link: HOST_CALENDAR,
          data: { ...data, acceptingHostName: after.acceptingHostName || "" },
        });
        return null;
      }

      return null;
    } catch (err) {
      console.error("[notifications] onCoverageRequestWrite failed:", err);
      return null;
    }
  });

/* ── trigger: shiftSwapNotifications (admin approval queue) ─────────────── */

exports.onSwapNotificationWrite = functions
  .region(REGION)
  .firestore.document("shiftSwapNotifications/{notifDocId}")
  .onWrite(async (change, context) => {
    const { notifDocId } = context.params;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return null;

    const prevStatus = before ? before.status : null;
    const status = after.status;
    const line = shiftLine(after);
    const data = {
      swapNotificationId: notifDocId,
      coverageRequestId: after.coverageRequestId || "",
      shiftId: after.shiftId || "",
      shiftDate: after.shiftDate || "",
      startTime: after.startTime || "",
      endTime: after.endTime || "",
      location: after.location || "",
      eventType: after.eventType || "",
      fromHostName: after.originalEmployeeName || "",
      toHostName: after.acceptingHostName || "",
    };

    try {
      // New pending swap → tell every admin.
      if (!before && status === "pending_review") {
        const admins = await adminUids();
        await fanOut(admins, `swap_${notifDocId}_pending`, {
          type: "swap_pending_admin",
          title: "Shift swap needs approval",
          body: `${data.fromHostName || "Host"} → ${data.toHostName || "Host"} · ${line}`,
          link: ADMIN_CALENDAR,
          data,
        });
        return null;
      }

      // Admin resolved it → tell both hosts.
      if (prevStatus === "pending_review" && (status === "rejected" || status === "approved")) {
        const approved = status === "approved";
        const recipients = [after.originalEmployeeId, after.acceptingHostId].filter(Boolean);
        await Promise.all(
          recipients.map((uid) =>
            writeOne(uid, `swap_${notifDocId}_${status}_${uid}`, {
              type: approved ? "swap_approved" : "swap_rejected",
              title: approved ? "Shift swap approved" : "Shift swap rejected",
              body: `${data.fromHostName || "Host"} → ${data.toHostName || "Host"} · ${line}`,
              link: HOST_CALENDAR,
              data,
            })
          )
        );
        return null;
      }

      return null;
    } catch (err) {
      console.error("[notifications] onSwapNotificationWrite failed:", err);
      return null;
    }
  });

/* ── trigger: hostNotifications (admin assign / remove / reassign) ──────── */

const HOST_NOTIF_TYPES = {
  shift_assigned: { type: "shift_assigned", title: "You were assigned a shift" },
  shift_removed: { type: "shift_removed", title: "A shift was removed from you" },
  shift_reassigned: { type: "shift_reassigned", title: "A shift was reassigned" },
};

exports.onHostNotificationCreate = functions
  .region(REGION)
  .firestore.document("hostNotifications/{hnId}")
  .onCreate(async (snap, context) => {
    const { hnId } = context.params;
    const d = snap.data() || {};
    const kind = String(d.type || d._notifType || "shift_assigned").toLowerCase();
    const meta = HOST_NOTIF_TYPES[kind] || HOST_NOTIF_TYPES.shift_assigned;

    try {
      await writeOne(d.targetHostId, `hn_${hnId}`, {
        type: meta.type,
        title: meta.title,
        body: shiftLine(d),
        link: HOST_CALENDAR,
        data: {
          hostNotificationId: hnId,
          shiftId: d.shiftId || "",
          shiftDate: d.shiftDate || d.date || "",
          startTime: d.startTime || "",
          endTime: d.endTime || "",
          location: d.location || d.locationName || d.venueName || "",
          eventType: d.eventType || d.shiftType || "",
          assignedByName: d.assignedByName || "",
        },
      });
    } catch (err) {
      console.error("[notifications] onHostNotificationCreate failed:", err);
    }
    return null;
  });
