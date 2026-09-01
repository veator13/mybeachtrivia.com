// mybeachtrivia.com/beachTriviaPages/3-Locations/script.js
//
// Public Locations page: an interactive Google Map of the venues that have Beach
// Trivia events in a chosen window, plus a venue-grouped event list. Data comes
// from the publicGetScheduledVenues Cloud Function (same-origin via
// /api/scheduled-venues); coordinates are geocoded + cached server-side, so the
// browser normally does zero geocoding.

document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const datePresetSelect = document.getElementById("datePresetSelect");
  const eventTypeSelect = document.getElementById("eventTypeSelect");
  const dayOfWeekSelect = document.getElementById("dayOfWeekSelect");
  const customDatesRow = document.getElementById("customDatesRow");
  const startDateInput = document.getElementById("startDateInput");
  const endDateInput = document.getElementById("endDateInput");

  const venueInput = document.getElementById("venueSearchInput");
  const venueList = document.getElementById("venueSearchList");

  const overlayStatus = document.getElementById("locationsOverlayStatus");
  const overlayBody = document.getElementById("locationsOverlayBody");
  const legendBox = document.getElementById("locationsLegend");

  const FUNCTION_URL = "/api/scheduled-venues";
  const FUNCTION_URL_FALLBACK =
    "https://us-central1-beach-trivia-website.cloudfunctions.net/publicGetScheduledVenues";

  const HAMPTON_ROADS_CENTER = { lat: 36.9, lng: -76.3 };
  const GEO_CACHE_KEY = "bt_geocode_cache_v2";
  const GEO_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  // Marker colour per event type.
  const TYPE_COLORS = {
    "classic-trivia": "#2563eb",
    "themed-trivia": "#7c3aed",
    "music-bingo": "#16a34a",
    "beach-feud": "#ea580c",
    "game-show": "#db2777",
  };
  const DEFAULT_COLOR = "#64748b";

  // ── tiny utils ─────────────────────────────────────────────────────────────
  const pad2 = (n) => String(n).padStart(2, "0");
  const safeText = (v) => String(v == null ? "" : v).trim();

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ymdTodayNY() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function addDaysYmd(ymd, days) {
    const [y, m, d] = String(ymd).split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
  }

  function monthRangeFromYmd(ymd) {
    const [y, m] = String(ymd).split("-").map(Number);
    const fmt = (dt) =>
      `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
    return {
      startStr: fmt(new Date(Date.UTC(y, m - 1, 1))),
      endExclusiveStr: fmt(new Date(Date.UTC(y, m, 1))),
    };
  }

  function computeRangeFromPreset(preset) {
    const today = ymdTodayNY();
    if (preset === "today") return { startStr: today, endExclusiveStr: addDaysYmd(today, 1) };
    if (preset === "next7") return { startStr: today, endExclusiveStr: addDaysYmd(today, 7) };
    if (preset === "next30") return { startStr: today, endExclusiveStr: addDaysYmd(today, 30) };
    if (preset === "next90") return { startStr: today, endExclusiveStr: addDaysYmd(today, 90) };
    if (preset === "thisMonth") return monthRangeFromYmd(today);

    const startStr = startDateInput?.value || today;
    let endStr = endDateInput?.value || addDaysYmd(startStr, 30);
    if (endStr <= startStr) endStr = addDaysYmd(startStr, 1);
    return { startStr, endExclusiveStr: endStr };
  }

  function formatEventDate(dateStr) {
    const raw = safeText(dateStr);
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(raw);
    if (Number.isNaN(dt.getTime())) return raw;
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function formatEventType(typeStr) {
    const raw = safeText(typeStr);
    if (!raw) return "";
    return raw
      .replace(/[-_]+/g, " ")
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  function timeRange(startTime, endTime) {
    return [safeText(startTime), safeText(endTime)].filter(Boolean).join("–");
  }

  function parseTimeToMinutes(t) {
    const m = safeText(t).toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (!m) return 24 * 60;
    let h = Number(m[1]);
    const min = Number(m[2] || 0);
    if (m[3] === "pm" && h !== 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    return h * 60 + min;
  }

  function shiftDayNumber(dateStr) {
    const m = safeText(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  }

  function venueKey(name) {
    return safeText(name).toLowerCase();
  }

  function setStatus(msg) {
    if (!overlayStatus) return;
    overlayStatus.textContent = msg || "";
    overlayStatus.style.display = msg ? "block" : "none";
  }

  // ── state ──────────────────────────────────────────────────────────────────
  let allVenues = []; // last API response (already type-filtered server-side)
  let selectedVenue = ""; // "" = all venues
  let lastRange = null;

  // ── data fetch ─────────────────────────────────────────────────────────────
  async function fetchVenues(base, qs) {
    const resp = await fetch(`${base}?${qs.toString()}`, { method: "GET" });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || json.ok !== true) {
      const err = new Error(json?.error || json?.message || `HTTP ${resp.status}`);
      err.status = resp.status;
      throw err;
    }
    return json;
  }

  async function refreshLocations() {
    const preset = datePresetSelect ? String(datePresetSelect.value || "next30") : "next30";
    const range = computeRangeFromPreset(preset);
    lastRange = range;
    const type = eventTypeSelect ? String(eventTypeSelect.value || "all") : "all";

    setStatus("Loading events…");
    if (overlayBody) overlayBody.innerHTML = "";
    showMapLoading(true);

    const qs = new URLSearchParams();
    qs.set("start", range.startStr);
    qs.set("end", range.endExclusiveStr);
    qs.set("type", type && type !== "all" ? type : "all");

    let data = null;
    try {
      data = await fetchVenues(FUNCTION_URL, qs);
    } catch (e) {
      if (e.status === 404) {
        try {
          data = await fetchVenues(FUNCTION_URL_FALLBACK, qs);
        } catch (e2) {
          console.warn("[locations] fetch failed (fallback):", e2);
        }
      } else {
        console.warn("[locations] fetch failed:", e);
      }
    }

    if (!data) {
      showMapLoading(false);
      setStatus("Could not load events right now. Please try again.");
      return;
    }

    allVenues = Array.isArray(data.venues) ? data.venues : [];
    if (Array.isArray(data.eventTypes) && data.eventTypes.length) {
      setEventTypeOptions(data.eventTypes);
    }
    buildVenueOptions(allVenues);
    applyClientFilters();
  }

  // ── client-side filtering (venue + day of week) ────────────────────────────
  function applyClientFilters() {
    const day = dayOfWeekSelect ? String(dayOfWeekSelect.value || "all") : "all";

    let venues = allVenues.map((v) => ({ ...v, shifts: [...(v.shifts || [])] }));

    if (selectedVenue) {
      venues = venues.filter((v) => venueKey(v.name) === venueKey(selectedVenue));
    }

    if (day !== "all") {
      venues = venues
        .map((v) => ({
          ...v,
          shifts: v.shifts.filter((s) => String(shiftDayNumber(s.date)) === day),
        }))
        .filter((v) => v.shifts.length);
    }

    renderLegend(venues);
    renderList(venues);
    renderJsonLd(venues);
    updateMapPins(venues);
  }

  // ── color key for event types (only the ones currently shown) ──────────────
  function renderLegend(venues) {
    if (!legendBox) return;
    const present = new Set();
    venues.forEach((v) => (v.shifts || []).forEach((s) => s.type && present.add(s.type)));
    const ordered = Object.keys(TYPE_COLORS).filter((t) => present.has(t));
    present.forEach((t) => { if (!TYPE_COLORS[t]) ordered.push(t); });
    legendBox.innerHTML = ordered
      .map(
        (t) =>
          '<span class="legend-item"><span class="legend-swatch" style="background:' +
          (TYPE_COLORS[t] || DEFAULT_COLOR) +
          '"></span>' +
          escapeHtml(formatEventType(t)) +
          "</span>"
      )
      .join("");
  }

  // ── venue combobox ─────────────────────────────────────────────────────────
  function buildVenueOptions(venues) {
    if (!venueList) return;
    const names = Array.from(new Set(venues.map((v) => safeText(v.name)).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    venueList.__names = names;
    // keep current selection if it still exists
    if (selectedVenue && !names.some((n) => venueKey(n) === venueKey(selectedVenue))) {
      selectedVenue = "";
      if (venueInput) venueInput.value = "";
    }
    renderVenueOptions(venueInput ? venueInput.value : "");
  }

  // forgiving match: exact-substring first, then a loose subsequence match so a
  // couple of typos / missing letters still find the venue.
  function looseMatch(needle, haystack) {
    const n = needle.toLowerCase().trim();
    const h = haystack.toLowerCase();
    if (!n) return { hit: true, score: 0 };
    if (h.includes(n)) return { hit: true, score: h.indexOf(n) };
    let i = 0;
    let gaps = 0;
    for (let c = 0; c < h.length && i < n.length; c++) {
      if (h[c] === n[i]) i++;
      else if (i > 0) gaps++;
    }
    // allow all chars matched in order with a small number of gaps
    if (i === n.length && gaps <= Math.max(2, Math.floor(n.length / 3))) {
      return { hit: true, score: 1000 + gaps };
    }
    return { hit: false, score: Infinity };
  }

  function renderVenueOptions(query) {
    if (!venueList) return;
    const names = venueList.__names || [];
    const q = safeText(query);

    const matches = (q
      ? names
          .map((name) => ({ name, ...looseMatch(q, name) }))
          .filter((m) => m.hit)
          .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
          .map((m) => m.name)
      : names
    ).slice(0, 60);

    const frag = document.createDocumentFragment();

    const allOpt = document.createElement("div");
    allOpt.className = "venue-option" + (!selectedVenue ? " is-selected" : "");
    allOpt.setAttribute("role", "option");
    allOpt.dataset.value = "";
    allOpt.textContent = "All venues";
    frag.appendChild(allOpt);

    if (!matches.length && q) {
      const none = document.createElement("div");
      none.className = "venue-option venue-option--empty";
      none.textContent = `No venue matches “${q}”`;
      frag.appendChild(none);
    }

    matches.forEach((name) => {
      const opt = document.createElement("div");
      opt.className =
        "venue-option" + (venueKey(name) === venueKey(selectedVenue) ? " is-selected" : "");
      opt.setAttribute("role", "option");
      opt.dataset.value = name;
      opt.textContent = name;
      frag.appendChild(opt);
    });

    venueList.innerHTML = "";
    venueList.appendChild(frag);
  }

  function openVenueList() {
    if (!venueList) return;
    renderVenueOptions(venueInput ? venueInput.value : "");
    venueList.hidden = false;
    if (venueInput) venueInput.setAttribute("aria-expanded", "true");
  }
  function closeVenueList() {
    if (!venueList) return;
    venueList.hidden = true;
    if (venueInput) venueInput.setAttribute("aria-expanded", "false");
  }

  function chooseVenue(name) {
    selectedVenue = safeText(name);
    if (venueInput) venueInput.value = selectedVenue;
    closeVenueList();
    applyClientFilters();
  }

  if (venueInput && venueList) {
    venueInput.addEventListener("focus", openVenueList);
    venueInput.addEventListener("click", openVenueList);
    venueInput.addEventListener("input", () => {
      openVenueList();
      // typing invalidates a previously locked selection until they pick again
      selectedVenue = "";
    });
    venueInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeVenueList();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const first = venueList.querySelector(".venue-option:not(.venue-option--empty)");
        if (first) chooseVenue(first.dataset.value);
      }
    });
    venueList.addEventListener("mousedown", (e) => {
      const opt = e.target.closest(".venue-option");
      if (!opt || opt.classList.contains("venue-option--empty")) return;
      e.preventDefault();
      chooseVenue(opt.dataset.value);
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#venueSearchField")) closeVenueList();
    });
  }

  // ── event-type <select> options (from API) ─────────────────────────────────
  function setEventTypeOptions(eventTypes) {
    if (!eventTypeSelect) return;
    const current = String(eventTypeSelect.value || "all");
    eventTypeSelect.innerHTML = '<option value="all">All</option>';
    eventTypes.forEach((t) => {
      const tt = safeText(t);
      if (!tt) return;
      const opt = document.createElement("option");
      opt.value = tt;
      opt.textContent = formatEventType(tt);
      eventTypeSelect.appendChild(opt);
    });
    eventTypeSelect.value = Array.from(eventTypeSelect.options).some((o) => o.value === current)
      ? current
      : "all";
  }

  // ── event list (grouped by venue) ─────────────────────────────────────────
  function renderList(venues) {
    if (!overlayBody) return;
    overlayBody.innerHTML = "";

    const totalEvents = venues.reduce((n, v) => n + (v.shifts?.length || 0), 0);
    if (!totalEvents) {
      setStatus(
        selectedVenue
          ? `No upcoming events for ${selectedVenue} in this window.`
          : "No events found for this filter."
      );
      return;
    }
    setStatus(
      `${venues.length} venue${venues.length === 1 ? "" : "s"} · ` +
        `${totalEvents} event${totalEvents === 1 ? "" : "s"}`
    );

    const frag = document.createDocumentFragment();

    venues.forEach((v) => {
      const card = document.createElement("div");
      card.className = "venue-card";
      card.tabIndex = 0;
      card.dataset.venue = venueKey(v.name);

      const h4 = document.createElement("h4");
      h4.textContent = safeText(v.name) || "Venue";
      card.appendChild(h4);

      if (safeText(v.address)) {
        const addr = document.createElement("p");
        addr.className = "venue-card-addr";
        addr.textContent = v.address;
        card.appendChild(addr);
      }

      const shifts = [...(v.shifts || [])].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime);
      });

      const ul = document.createElement("ul");
      ul.className = "venue-card-events";
      shifts.slice(0, 4).forEach((s) => {
        const li = document.createElement("li");
        const dot = document.createElement("span");
        dot.className = "evt-dot";
        dot.style.background = TYPE_COLORS[s.type] || DEFAULT_COLOR;
        li.appendChild(dot);
        const label = [
          formatEventType(s.type) + (s.theme ? `: ${s.theme}` : ""),
          formatEventDate(s.date),
          timeRange(s.startTime, s.endTime),
        ]
          .filter(Boolean)
          .join(" · ");
        li.appendChild(document.createTextNode(label));
        ul.appendChild(li);
      });
      if (shifts.length > 4) {
        const li = document.createElement("li");
        li.className = "venue-card-more";
        li.textContent = `+ ${shifts.length - 4} more`;
        ul.appendChild(li);
      }
      card.appendChild(ul);

      if (safeText(v.address) || safeText(v.name)) {
        const dir = document.createElement("a");
        dir.className = "venue-card-dir";
        dir.href =
          "https://www.google.com/maps/dir/?api=1&destination=" +
          encodeURIComponent(
            safeText(v.address) ? `${v.name}, ${v.address}` : `${v.name} Virginia Beach VA`
          );
        dir.target = "_blank";
        dir.rel = "noopener";
        dir.textContent = "Get directions ↗";
        card.appendChild(dir);
      }

      const key = venueKey(v.name);
      card.addEventListener("mouseenter", () => highlightVenue(key, true));
      card.addEventListener("mouseleave", () => highlightVenue(key, false));
      card.addEventListener("focus", () => highlightVenue(key, true));
      card.addEventListener("blur", () => highlightVenue(key, false));
      card.addEventListener("click", () => focusVenueOnMap(key));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          focusVenueOnMap(key);
        }
      });

      frag.appendChild(card);
    });

    overlayBody.appendChild(frag);
  }

  // ── SEO: JSON-LD Event structured data ────────────────────────────────────
  function renderJsonLd(venues) {
    let el = document.getElementById("bt-events-jsonld");
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = "bt-events-jsonld";
      document.head.appendChild(el);
    }
    const items = [];
    venues.forEach((v) => {
      (v.shifts || []).slice(0, 8).forEach((s) => {
        items.push({
          "@context": "https://schema.org",
          "@type": "Event",
          name: `${formatEventType(s.type)}${s.theme ? `: ${s.theme}` : ""} at ${v.name}`,
          startDate: s.date,
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          eventStatus: "https://schema.org/EventScheduled",
          location: {
            "@type": "Place",
            name: v.name,
            address: v.address || undefined,
          },
          organizer: { "@type": "Organization", name: "Beach Trivia", url: "https://mybeachtrivia.com" },
        });
      });
    });
    el.textContent = JSON.stringify(items.slice(0, 50));
  }

  // ── Google Maps ───────────────────────────────────────────────────────────
  let gMap = null;
  let gInfoWindow = null;
  let gGeocoder = null;
  let gClusterer = null;
  let gMarkers = [];
  let gMarkerByVenue = new Map();
  let gBouncing = null;

  function showMapLoading(on) {
    const wrap = document.getElementById("map-wrapper");
    if (!wrap) return;
    let sp = document.getElementById("map-loading");
    if (on) {
      if (!sp) {
        sp = document.createElement("div");
        sp.id = "map-loading";
        sp.innerHTML = '<div class="map-spinner"></div><span>Loading map…</span>';
        wrap.appendChild(sp);
      }
      sp.style.display = "flex";
    } else if (sp) {
      sp.style.display = "none";
    }
  }

  function showMapError(msg) {
    const mapDiv = document.getElementById("map");
    if (!mapDiv) return;
    mapDiv.innerHTML =
      '<div class="map-msg">' + escapeHtml(msg) + "</div>";
  }

  function loadGoogleMapsJs(apiKey) {
    if (window.__btGmapsPromise) return window.__btGmapsPromise;
    window.__btGmapsPromise = new Promise((resolve, reject) => {
      if (window.google?.maps?.importLibrary || window.google?.maps?.Map) return resolve(true);
      const k = String(apiKey || "").trim();
      if (!k) return reject(new Error("missing api key"));
      const cb = "__btMapsReady";
      window[cb] = () => {
        try { delete window[cb]; } catch (_) {}
        resolve(true);
      };
      const s = document.createElement("script");
      s.async = true;
      s.defer = true;
      s.onerror = () => reject(new Error("gmaps script load failed"));
      s.src =
        "https://maps.googleapis.com/maps/api/js?key=" +
        encodeURIComponent(k) +
        "&v=weekly&loading=async&callback=" + cb;
      document.head.appendChild(s);
    });
    return window.__btGmapsPromise;
  }

  async function initMap() {
    if (gMap) return true;
    try {
      await loadGoogleMapsJs(window.__GMAPS_API_KEY__);
      const mapDiv = document.getElementById("map");
      if (!mapDiv) throw new Error("no #map");

      let MapCtor = null;
      if (typeof google.maps.importLibrary === "function") {
        ({ Map: MapCtor } = await google.maps.importLibrary("maps"));
      } else {
        MapCtor = google.maps.Map;
      }

      gGeocoder = new google.maps.Geocoder();
      gInfoWindow = new google.maps.InfoWindow({ disableAutoPan: false });
      gMap = new MapCtor(mapDiv, {
        center: HAMPTON_ROADS_CENTER,
        zoom: 10,
        gestureHandling: "greedy",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });

      const nudge = () => {
        try {
          google.maps.event.trigger(gMap, "resize");
        } catch (_) {}
      };
      setTimeout(nudge, 300);
      setTimeout(nudge, 1200);
      if (typeof ResizeObserver !== "undefined") {
        new ResizeObserver(nudge).observe(mapDiv);
      }
      return true;
    } catch (e) {
      console.warn("[locations] map init failed:", e?.message || e);
      showMapError("Map unavailable right now — the event list still works.");
      return false;
    }
  }

  // The venue's most-common event type — drives the pin colour.
  function primaryType(venue) {
    const counts = {};
    (venue.shifts || []).forEach((s) => {
      if (s.type) counts[s.type] = (counts[s.type] || 0) + 1;
    });
    let best = "";
    let n = 0;
    Object.keys(counts).forEach((t) => {
      if (counts[t] > n) {
        n = counts[t];
        best = t;
      }
    });
    return best;
  }

  function pinIcon(color) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">` +
      `<path d="M14 0C6.3 0 0 6.1 0 13.7 0 24 14 40 14 40s14-16 14-26.3C28 6.1 21.7 0 14 0z" fill="${color}"/>` +
      `<circle cx="14" cy="14" r="5" fill="#fff"/></svg>`;
    return {
      url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(28, 40),
      anchor: new google.maps.Point(14, 40),
    };
  }

  // localStorage fallback geocode cache (only used when the API gave no coords)
  function getGeoCache() {
    try {
      const o = JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || "{}");
      return o && typeof o === "object" ? o : {};
    } catch (_) {
      return {};
    }
  }
  function setGeoCache(c) {
    try {
      localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(c || {}));
    } catch (_) {}
  }

  async function clientGeocode(venue, cache) {
    if (!gGeocoder) return null;
    const q = safeText(venue.address) || `${safeText(venue.name)} Virginia Beach VA`;
    const key = q.toLowerCase();
    const hit = cache[key];
    const now = Date.now();
    if (hit && hit.lat && hit.lng && now - (hit.ts || 0) < GEO_CACHE_TTL_MS) {
      return { lat: hit.lat, lng: hit.lng, cached: true };
    }
    const r = await new Promise((res) => {
      gGeocoder.geocode({ address: q }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          const loc = results[0].geometry.location;
          res({ lat: loc.lat(), lng: loc.lng(), cached: false });
        } else res(null);
      });
    });
    if (r) cache[key] = { lat: r.lat, lng: r.lng, ts: now };
    return r;
  }

  function clearMarkers() {
    if (gClusterer) {
      try { gClusterer.clearMarkers(); } catch (_) {}
    }
    gMarkers.forEach((m) => {
      try { m.setMap(null); } catch (_) {}
    });
    gMarkers = [];
    gMarkerByVenue = new Map();
    gBouncing = null;
  }

  async function updateMapPins(venues) {
    const ok = await initMap();
    if (!ok || !gMap) {
      showMapLoading(false);
      return;
    }
    clearMarkers();

    const cache = getGeoCache();
    const bounds = new google.maps.LatLngBounds();
    let pinned = 0;
    let cacheDirty = false;

    for (const v of venues) {
      let lat = typeof v.lat === "number" ? v.lat : null;
      let lng = typeof v.lng === "number" ? v.lng : null;

      if (lat == null || lng == null) {
        const g = await clientGeocode(v, cache);
        if (g) {
          lat = g.lat;
          lng = g.lng;
          if (!g.cached) {
            cacheDirty = true;
            await new Promise((r) => setTimeout(r, 120));
          }
        }
      }
      if (lat == null || lng == null) continue;

      const pos = { lat, lng };
      const color = TYPE_COLORS[primaryType(v)] || DEFAULT_COLOR;
      const marker = new google.maps.Marker({
        position: pos,
        title: safeText(v.name),
        icon: pinIcon(color),
      });
      marker.__venue = v;
      marker.__key = venueKey(v.name);
      marker.addListener("click", () => openVenueInfo(marker));
      marker.addListener("mouseover", () => openVenueInfo(marker));

      gMarkers.push(marker);
      gMarkerByVenue.set(marker.__key, marker);
      bounds.extend(pos);
      pinned++;
    }

    if (cacheDirty) setGeoCache(cache);

    // cluster (graceful if the lib didn't load)
    if (window.markerClusterer?.MarkerClusterer) {
      gClusterer = new window.markerClusterer.MarkerClusterer({ map: gMap, markers: gMarkers });
    } else {
      gMarkers.forEach((m) => m.setMap(gMap));
    }

    showMapLoading(false);

    if (pinned > 1) {
      gMap.fitBounds(bounds, 48);
    } else if (pinned === 1) {
      gMap.setCenter(bounds.getCenter());
      gMap.setZoom(14);
    } else {
      gMap.setCenter(HAMPTON_ROADS_CENTER);
      gMap.setZoom(10);
    }
  }

  function buildInfoHtml(v) {
    const shifts = [...(v.shifts || [])].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime);
    });
    const rows = shifts
      .slice(0, 5)
      .map((s) => {
        const c = TYPE_COLORS[s.type] || DEFAULT_COLOR;
        const label = [
          formatEventType(s.type) + (s.theme ? `: ${escapeHtml(s.theme)}` : ""),
          formatEventDate(s.date),
          timeRange(s.startTime, s.endTime),
        ]
          .filter(Boolean)
          .join(" &middot; ");
        return `<div style="margin:3px 0;color:#333;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:6px;"></span>${label}</div>`;
      })
      .join("");
    const more =
      shifts.length > 5
        ? `<div style="opacity:.7;margin-top:3px;color:#333;">+ ${shifts.length - 5} more</div>`
        : "";
    const dir =
      "https://www.google.com/maps/dir/?api=1&destination=" +
      encodeURIComponent(
        safeText(v.address) ? `${v.name}, ${v.address}` : `${v.name} Virginia Beach VA`
      );
    return (
      `<div style="font-family:sans-serif;width:250px;color:#222;line-height:1.45;">` +
      `<div style="font-weight:700;color:#111;">${escapeHtml(v.name)}</div>` +
      (safeText(v.address)
        ? `<div style="color:#666;margin:2px 0 6px;">${escapeHtml(v.address)}</div>`
        : `<div style="height:4px;"></div>`) +
      rows +
      more +
      `<a href="${dir}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;color:#2563eb;font-weight:600;">Get directions ↗</a>` +
      `</div>`
    );
  }

  function openVenueInfo(marker) {
    if (!gInfoWindow || !marker) return;
    try {
      gInfoWindow.setContent(buildInfoHtml(marker.__venue));
      gInfoWindow.open({ map: gMap, anchor: marker });
    } catch (_) {}
  }

  function highlightVenue(key, on) {
    const marker = gMarkerByVenue.get(key);
    if (!marker) return;
    try {
      if (on) {
        if (gBouncing && gBouncing !== marker) gBouncing.setAnimation(null);
        marker.setAnimation(google.maps.Animation.BOUNCE);
        marker.setZIndex(google.maps.Marker.MAX_ZINDEX + 1);
        gBouncing = marker;
      } else {
        marker.setAnimation(null);
        marker.setZIndex(null);
        if (gBouncing === marker) gBouncing = null;
      }
    } catch (_) {}
    document
      .querySelectorAll(".venue-card")
      .forEach((c) => c.classList.toggle("is-hover", on && c.dataset.venue === key));
  }

  function focusVenueOnMap(key) {
    const marker = gMarkerByVenue.get(key);
    if (!marker || !gMap) return;
    highlightVenue(key, true);
    setTimeout(() => highlightVenue(key, false), 1400);
    const pos = marker.getPosition();
    if (pos) {
      gMap.panTo(pos);
      if (gMap.getZoom() < 13) gMap.setZoom(13);
    }
    openVenueInfo(marker);
  }

  // ── filter wiring ──────────────────────────────────────────────────────────
  function applyPresetUI() {
    const preset = datePresetSelect ? String(datePresetSelect.value || "next30") : "next30";
    if (customDatesRow) customDatesRow.style.display = preset === "custom" ? "flex" : "none";
    if (preset === "custom") {
      const today = ymdTodayNY();
      if (startDateInput && !startDateInput.value) startDateInput.value = today;
      if (endDateInput && !endDateInput.value) endDateInput.value = addDaysYmd(today, 30);
    }
  }

  datePresetSelect?.addEventListener("change", () => {
    applyPresetUI();
    refreshLocations();
  });
  eventTypeSelect?.addEventListener("change", refreshLocations);
  startDateInput?.addEventListener("change", refreshLocations);
  endDateInput?.addEventListener("change", refreshLocations);
  dayOfWeekSelect?.addEventListener("change", applyClientFilters);

  applyPresetUI();
  refreshLocations();
});
