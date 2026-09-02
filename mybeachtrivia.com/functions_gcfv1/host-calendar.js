// mybeachtrivia.com/functions_gcfv1/host-calendar.js
//
// hostGetCalendarMonth (callable) — one round trip for the host calendar.
// Returns every shift in a given year/month plus an id→name map of active
// employees and the locations list. Any signed-in employee may call it.
//
// Used by:
//   beachTriviaPages/dashboards/host/dashboard.js            (Today / Upcoming)
//   beachTriviaPages/dashboards/host/employee-calendar/js/host-calendar.js
//
// NOTE (2026-09-01): recovered verbatim from the deployed artifact
// (gs://gcf-sources-459479368322-us-central1/hostGetCalendarMonth-…/version-3)
// after the definition was dropped from index.js in an earlier refactor while
// the function stayed live. See CLAUDE.md "sourceless functions".
// `resolveAuth` is duplicated here (a trimmed copy of the index.js helper) so
// this module is self-contained.

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

try {
  admin.app();
} catch (e) {
  admin.initializeApp();
}
const db = admin.firestore();

// Accept either the callable's own auth context or an explicit idToken in the
// payload (some callers pass it through for reliability).
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

exports.hostGetCalendarMonth = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    await resolveAuth(data, context);

    const year = Number(data?.year);
    const month = Number(data?.month); // 0-based (JS convention)

    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 0 || month > 11) {
      throw new functions.https.HttpsError("invalid-argument", "Provide valid year and month (0-based)");
    }

    const pad = (n) => String(n).padStart(2, "0");
    const startDate = `${year}-${pad(month + 1)}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${pad(month + 1)}-${pad(lastDay)}`;

    const [shiftsSnap, employeesSnap, locationsSnap] = await Promise.all([
      db.collection("shifts").where("date", ">=", startDate).where("date", "<=", endDate).get(),
      db.collection("employees").where("active", "==", true).get(),
      db.collection("locations").get().catch(() => null),
    ]);

    const shifts = [];
    shiftsSnap.forEach((doc) => {
      const d = doc.data() || {};
      shifts.push({
        id: doc.id,
        date: d.date || "",
        startTime: d.startTime || "",
        endTime: d.endTime || "",
        type: d.type || "",
        theme: d.theme || "",
        notes: d.notes || "",
        employeeId: d.employeeId || null,
        location: d.location || "",
        locationId: d.locationId || "",
        venueName: d.venueName || d.locationName || d.location || "",
        locationName: d.locationName || d.venueName || d.location || "",
        address: d.address || "",
        street: d.street || "",
        city: d.city || "",
        state: d.state || "",
        zip: d.zip || d.zipCode || "",
      });
    });

    const employees = {};
    employeesSnap.forEach((doc) => {
      const d = doc.data() || {};
      const firstName = d.firstName || "";
      const lastName = d.lastName || "";
      const fullName = (firstName + (lastName ? " " + lastName : "")).trim();
      employees[doc.id] = d.nickname || fullName || d.displayName || d.email || doc.id;
    });

    const locations = [];
    if (locationsSnap) {
      locationsSnap.forEach((doc) => {
        const d = doc.data() || {};
        locations.push({
          id: doc.id,
          name: d.name || d.locationName || d.venueName || doc.id,
          locationName: d.locationName || d.name || "",
          venueName: d.venueName || d.name || "",
          address: d.address || "",
          street: d.street || "",
          city: d.city || "",
          state: d.state || "",
          zip: d.zip || d.zipCode || "",
          active: d.active !== false,
        });
      });
    }

    return { shifts, employees, locations };
  });
