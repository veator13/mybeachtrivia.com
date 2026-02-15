/* venues.js
   Populates the #venueSelect dropdown from Firestore collection 'locations'
   (same source as admin locations-management).

   - Uses compat Firestore (window.db or firebase.firestore()).
   - Filters out inactive locations (active === false).
   - Keeps "Other" option.
*/
(function () {
    "use strict";
  
    function getDb() {
      if (window.FirebaseHelpers?.getDb) return window.FirebaseHelpers.getDb();
      if (window.db) return window.db;
      if (window.firebase?.firestore) return window.firebase.firestore();
      throw new Error("Firestore not available (db missing).");
    }
  
    function setOptions(selectEl, locations) {
      // Preserve current selection if possible
      const prev = selectEl.value;
  
      // Build options
      const opts = [];
  
      opts.push({ value: "", label: "Choose..." });
      locations.forEach((loc) => {
        opts.push({ value: loc.id, label: loc.name });
      });
      opts.push({ value: "other", label: "Other" });
  
      // Replace DOM options
      selectEl.innerHTML = "";
      for (const o of opts) {
        const opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.label;
  
        // Default select behavior:
        // - If previous value exists in new set, keep it
        // - else keep "Choose..."
        selectEl.appendChild(opt);
      }
  
      // Restore selection if still valid
      const hasPrev = opts.some((o) => o.value === prev);
      selectEl.value = hasPrev ? prev : "";
  
      // If the HTML had a "loading" value selected, this makes it sane
      if (selectEl.value === "loading") selectEl.value = "";
    }
  
    function startVenuesListener() {
      const selectEl = document.getElementById("venueSelect");
      if (!selectEl) return;
  
      const db = getDb();
  
      // Listen to locations; filter active in JS (avoids where+orderBy index needs)
      db.collection("locations")
        .orderBy("name")
        .onSnapshot(
          (snap) => {
            const locations = [];
            snap.forEach((doc) => {
              const d = doc.data() || {};
              const active = d.active !== false; // default true
              const name = (d.name || "").trim();
              if (!active) return;
              if (!name) return;
  
              locations.push({ id: doc.id, name });
            });
  
            setOptions(selectEl, locations);
          },
          (err) => {
            console.error("Venue listener error:", err);
  
            // Fallback: remove the "loading" placeholder so user can pick Other
            try {
              const hasOther = Array.from(selectEl.options).some((o) => o.value === "other");
              selectEl.innerHTML = "";
              const optChoose = document.createElement("option");
              optChoose.value = "";
              optChoose.textContent = "Choose...";
              selectEl.appendChild(optChoose);
  
              if (hasOther) {
                const optOther = document.createElement("option");
                optOther.value = "other";
                optOther.textContent = "Other";
                selectEl.appendChild(optOther);
              }
            } catch (_) {}
          }
        );
    }
  
    function init() {
      // If auth is required for reads, sign in anonymously first (if available)
      if (typeof window.ensureSignedIn === "function") {
        window.ensureSignedIn()
          .then(startVenuesListener)
          .catch((e) => {
            console.warn("Anonymous sign-in failed; trying venues listener anyway:", e);
            startVenuesListener();
          });
      } else {
        startVenuesListener();
      }
    }
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }
  })();