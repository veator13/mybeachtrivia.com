/* venues.js
   Populates #venueSelect from Firestore collection 'locations'

   ✅ Responsibilities (ONLY):
   - Populate the Venue <select> from Firestore
   - Detect Firestore reachability:
       - onSnapshot "server-backed" => ONLINE
       - onSnapshot "from cache"    => OFFLINE (real internet off / can't reach server)
       - onSnapshot error           => OFFLINE (ONLY for network/unavailable)
   - Notify state.js via window.ScoresheetState.setOffline(...)
   - Preserve previous selection on refresh where possible

   ✅ Supports ONLINE "Other":
   - Keeps option value "other" if selected (does NOT normalize to "")
   - Does NOT validate the "other" text input (meta-fields.js + submit-scores.js do that)

   ❌ Does NOT:
   - Swap #venueSelect into an <input>
   - Touch #offlineBadge / #onlineBadge
   - Manage #venueInput / #venueOtherInput (state.js + meta-fields.js own UI)
*/
(function () {
  "use strict";

  let unsubscribe = null;
  let started = false;

  function getDb() {
    if (window.FirebaseHelpers?.getDb) return window.FirebaseHelpers.getDb();
    if (window.db) return window.db;
    if (window.firebase?.firestore) return window.firebase.firestore();
    throw new Error("Firestore not available (db missing).");
  }

  function getVenueSelect() {
    return document.getElementById("venueSelect");
  }

  function setAppOffline(isOffline) {
    try {
      if (window.ScoresheetState?.setOffline) window.ScoresheetState.setOffline(!!isOffline);
    } catch (_) {}
  }

  function stopListener() {
    try {
      if (typeof unsubscribe === "function") unsubscribe();
    } catch (_) {}
    unsubscribe = null;
  }

  function normalizeValue(v) {
    return String(v || "").trim();
  }

  function setOptions(selectEl, locations) {
    const prev = normalizeValue(selectEl.value);

    const opts = [
      { value: "", label: "Choose..." },
      ...locations.map((loc) => ({ value: loc.id, label: loc.name })),
      { value: "other", label: "Other" },
    ];

    selectEl.innerHTML = "";
    for (const o of opts) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      selectEl.appendChild(opt);
    }

    // restore previous selection if still valid
    const hasPrev = opts.some((o) => o.value === prev);
    selectEl.value = hasPrev ? prev : "";

    // never leave "loading" behind
    if (selectEl.value === "loading") selectEl.value = "";
  }

  function shouldTreatAsOfflineError(err) {
    const code = String(err?.code || "").toLowerCase();

    // ✅ Not "offline": this is auth/rules, not connectivity.
    if (code === "permission-denied" || code === "unauthenticated") return false;

    // ✅ "offline": transient connectivity / backend unavailable
    if (
      code === "unavailable" ||
      code === "deadline-exceeded" ||
      code === "resource-exhausted" ||
      code === "internal"
    ) {
      return true;
    }

    // If we can't classify it, fall back to browser online signal.
    // If browser claims online, do NOT force OFFLINE badge due to unknown error.
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === true) return false;
    } catch {}

    return true;
  }

  function ensureSignedInIfPossible() {
    const ensure = window.FirebaseHelpers?.ensureSignedIn || window.ensureSignedIn || null;
    if (typeof ensure !== "function") return Promise.resolve();

    try {
      const out = ensure();
      return out && typeof out.then === "function" ? out : Promise.resolve(out);
    } catch (e) {
      return Promise.resolve(); // don't hard-fail venues; listener will report what happens
    }
  }

  function startVenuesListener() {
    const el = getVenueSelect();
    if (!el) return;

    // If DevTools forces offline, bail quickly
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      stopListener();
      setAppOffline(true);
      return;
    }

    let db;
    try {
      db = getDb();
    } catch (e) {
      console.error("[venues] getDb failed:", e);
      setAppOffline(true);
      return;
    }

    stopListener();

    try {
      unsubscribe = db
        .collection("locations")
        .orderBy("name")
        .onSnapshot(
          // ✅ Critical: Firestore can "succeed" while offline by serving cache.
          // We need metadata changes so fromCache flips are observable.
          { includeMetadataChanges: true },
          (snap) => {
            // ✅ ONLINE only when this snapshot is server-backed (not cache)
            const fromCache = !!snap?.metadata?.fromCache;
            setAppOffline(fromCache);

            const locations = [];
            snap.forEach((doc) => {
              const d = doc.data() || {};
              const active = d.active !== false; // default true
              const name = (d.name || "").trim();
              if (!active) return;
              if (!name) return;
              locations.push({ id: doc.id, name });
            });

            setOptions(el, locations);

            // 🔔 Let meta-fields.js (or other UI code) react to list refresh if desired
            try {
              window.dispatchEvent(new CustomEvent("scoresheet:venues-refreshed"));
            } catch {}
          },
          (err) => {
            console.error("[venues] listener error:", err);

            // ✅ auth/rules errors are NOT "offline"
            if (!shouldTreatAsOfflineError(err)) {
              // If browser is online, keep ONLINE badge; Firestore listener may recover after auth.
              setAppOffline(false);
              return;
            }

            // network/unavailable => OFFLINE
            stopListener();
            setAppOffline(true);
          }
        );
    } catch (e) {
      console.error("[venues] onSnapshot threw:", e);
      stopListener();
      setAppOffline(true);
    }
  }

  function restartWithAuth() {
    // ✅ when coming back online, re-auth THEN attach listener
    ensureSignedInIfPossible()
      .catch(() => {})
      .finally(() => startVenuesListener());
  }

  function bindConnectivityListeners() {
    window.addEventListener(
      "online",
      () => {
        restartWithAuth();
      },
      { passive: true }
    );

    window.addEventListener(
      "offline",
      () => {
        stopListener();
        setAppOffline(true);
      },
      { passive: true }
    );
  }

  function init() {
    if (started) return;
    started = true;

    if (!getVenueSelect()) return;

    bindConnectivityListeners();

    // Default OFFLINE until Firestore proves online
    // (prevents “fake online” due to SW caching on first load)
    setAppOffline(true);

    restartWithAuth();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();