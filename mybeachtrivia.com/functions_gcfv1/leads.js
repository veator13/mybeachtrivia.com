// mybeachtrivia.com/functions_gcfv1/leads.js
// Ingestion endpoint for the automated Leads feature.
// Called by the scheduled Claude research task (server-to-server, via a shared
// secret) — writes/updates venues + leads + leadObservations in Firestore.
// See project doc "leads-firestore-schema.md" for the full schema this implements.

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

function db() {
  return admin.firestore();
}

/** -----------------------------
 * Normalization helpers (used for de-dup matching)
 * ----------------------------*/
function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits || null;
}

/** -----------------------------
 * researchPriority auto-rule: HIGH within +/-30 days of openingDate
 * ----------------------------*/
function computeAutoResearchPriority(openingDateStr) {
  if (!openingDateStr) return null;
  const opening = new Date(openingDateStr);
  if (Number.isNaN(opening.getTime())) return null;
  const diffDays = Math.abs((opening.getTime() - Date.now()) / 86400000);
  return diffDays <= 30 ? "high" : null;
}

/** -----------------------------
 * Exclude current Beach Trivia clients.
 * Cross-references the real `locations` collection (publicLocations does not
 * exist in this codebase - see leads-firestore-schema.md).
 * ----------------------------*/
async function isCurrentClient(firestore, venue) {
  const targetName = normalizeName(venue.name);
  if (!targetName) return false;
  const snap = await firestore.collection("locations").get();
  return snap.docs.some((doc) => {
    const d = doc.data() || {};
    if (d.isActive === false) return false;
    return normalizeName(d.name) === targetName;
  });
}

/** -----------------------------
 * De-dup: normalizedName+address first, then placeId, then
 * domain+phone together (never match on name alone - chains are real).
 * ----------------------------*/
async function findExistingVenue(firestore, venue, normalized) {
  if (venue.address) {
    const snap = await firestore
      .collection("venues")
      .where("normalizedName", "==", normalized.name)
      .where("address", "==", venue.address)
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0];
  }

  if (venue.placeId) {
    const snap = await firestore
      .collection("venues")
      .where("placeId", "==", venue.placeId)
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0];
  }

  if (normalized.domain && normalized.phone) {
    const snap = await firestore
      .collection("venues")
      .where("normalizedWebsiteDomain", "==", normalized.domain)
      .where("normalizedPhone", "==", normalized.phone)
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0];
  }

  return null;
}

/** -----------------------------
 * POST /ingestLeadResearch
 * Headers: x-leads-api-key: <LEADS_API_KEY secret>
 * Body: { venue: {...}, lead: {...}, observation: {...} }
 * ----------------------------*/
exports.ingestLeadResearch = functions
  .region("us-central1")
  .runWith({ secrets: ["LEADS_API_KEY"] })
  .https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" });
      return;
    }

    const apiKey = req.get("x-leads-api-key");
    if (!apiKey || apiKey !== process.env.LEADS_API_KEY) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const body = req.body || {};
    const venue = body.venue || {};
    const leadFields = body.lead || {};
    const observation = body.observation || {};

    if (!venue.name) {
      res.status(400).json({ error: "venue.name is required" });
      return;
    }

    const firestore = db();
    const now = admin.firestore.FieldValue.serverTimestamp();

    try {
      if (await isCurrentClient(firestore, venue)) {
        res.status(200).json({ ok: true, skipped: "current-client", venueName: venue.name });
        return;
      }

      const normalized = {
        name: normalizeName(venue.name),
        domain: normalizeDomain(venue.website),
        phone: normalizePhone(venue.phone),
      };

      const existing = await findExistingVenue(firestore, venue, normalized);

      let venueRef;
      if (existing) {
        venueRef = existing.ref;
        await venueRef.set(
          {
            ...venue,
            normalizedName: normalized.name,
            normalizedWebsiteDomain: normalized.domain,
            normalizedPhone: normalized.phone,
            updatedAt: now,
          },
          { merge: true }
        );
      } else {
        venueRef = firestore.collection("venues").doc();
        await venueRef.set({
          ...venue,
          normalizedName: normalized.name,
          normalizedWebsiteDomain: normalized.domain,
          normalizedPhone: normalized.phone,
          basicInfoLastVerified: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      const leadSnap = await firestore
        .collection("leads")
        .where("venueId", "==", venueRef.id)
        .limit(1)
        .get();

      const autoPriority = computeAutoResearchPriority(venue.openingDate);
      let leadRef;

      if (!leadSnap.empty) {
        leadRef = leadSnap.docs[0].ref;
        const patch = { ...leadFields, updatedAt: now };
        if (autoPriority) patch.researchPriority = autoPriority;
        await leadRef.set(patch, { merge: true });
      } else {
        leadRef = firestore.collection("leads").doc();
        await leadRef.set({
          venueId: venueRef.id,
          statusBucket: leadFields.statusBucket || "Worth Investigating",
          leadScore: leadFields.leadScore ?? null,
          researchPriority: autoPriority || leadFields.researchPriority || "medium",
          nextResearchDate: leadFields.nextResearchDate || null,
          pipelineStage: "Unreviewed",
          reviewed: false,
          recommendedOpportunity: leadFields.recommendedOpportunity || null,
          pitchAngle: leadFields.pitchAngle || null,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (observation.finding) {
        await firestore.collection("leadObservations").add({
          leadId: leadRef.id,
          venueId: venueRef.id,
          observationType: observation.observationType || "other",
          finding: observation.finding,
          sources: observation.sources || [],
          date: now,
        });
      }

      res.status(200).json({ ok: true, venueId: venueRef.id, leadId: leadRef.id });
    } catch (err) {
      console.error("[ingestLeadResearch] failed:", err);
      res.status(500).json({ error: "internal", message: err.message });
    }
  });
