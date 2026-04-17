// mybeachtrivia.com/beachTriviaPages/3-Locations/script.js
// Drop-in replacement (CSP-safe + Locations overlay + REAL Google Maps pins)

document.addEventListener("DOMContentLoaded", function () {
  // -----------------------------
  // Fade effect (optimized)
  // -----------------------------
  const headerHeight = 80;
  const barrierTop = 95;

  const headerMask = document.getElementById("header-mask");
  const jsBarrier = document.getElementById("js-barrier");
  const services = Array.from(document.querySelectorAll(".service"));
  const fadeOverlays = Array.from(document.querySelectorAll(".fade-overlay"));

  if (headerMask) {
    headerMask.style.height = headerHeight + "px";
    headerMask.style.background = "url(../images/BGimage2.jpeg) no-repeat fixed";
    headerMask.style.backgroundSize = "cover";
  }
  if (jsBarrier) jsBarrier.style.top = barrierTop + "px";

  let rafPending = false;
  function updateFadeEffects() {
    services.forEach((service, index) => {
      const rect = service.getBoundingClientRect();
      const serviceTop = rect.top;
      const serviceHeight = rect.height;
      const fadeOverlay = fadeOverlays[index];

      const distanceToBarrier = serviceTop - barrierTop;

      if (distanceToBarrier <= 0) {
        const pixelsAboveBarrier = Math.abs(distanceToBarrier);
        const fadeHeight = Math.min(serviceHeight, pixelsAboveBarrier);

        if (fadeOverlay) fadeOverlay.style.height = `${fadeHeight}px`;

        const gradientStart = fadeHeight;
        const gradientEnd = Math.min(serviceHeight, fadeHeight + 30);

        const gradientPercentages = [0, 0.1, 0.3, 0.5, 0.7, 0.9];
        let maskGradient = "linear-gradient(to bottom, transparent 0, ";

        gradientPercentages.forEach((percent, i) => {
          const position =
            gradientStart + (gradientEnd - gradientStart) * (i / (gradientPercentages.length - 1));
          maskGradient += `rgba(0,0,0,${percent}) ${position}px, `;
        });

        maskGradient += `black ${gradientEnd}px, black 100%)`;

        service.style.maskImage = maskGradient;
        service.style.webkitMaskImage = maskGradient;

        service.style.pointerEvents = fadeHeight > serviceHeight * 0.9 ? "none" : "auto";
      } else {
        if (fadeOverlay) fadeOverlay.style.height = "0px";
        service.style.maskImage = "none";
        service.style.webkitMaskImage = "none";
        service.style.pointerEvents = "auto";
      }
    });

    rafPending = false;
  }

  function requestUpdate() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(updateFadeEffects);
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  requestUpdate();

  // -----------------------------
  // Locations overlay + filters
  // -----------------------------
  const datePresetSelect = document.getElementById("datePresetSelect");
  const eventTypeSelect = document.getElementById("eventTypeSelect");
  const dayOfWeekSelect = document.getElementById("dayOfWeekSelect");
  const customDatesRow = document.getElementById("customDatesRow");
  const startDateInput = document.getElementById("startDateInput");
  const endDateInput = document.getElementById("endDateInput");

  const overlayStatus = document.getElementById("locationsOverlayStatus");
  const overlayBody = document.getElementById("locationsOverlayBody");

  const FUNCTION_URL =
    "https://us-central1-beach-trivia-website.cloudfunctions.net/publicGetScheduledVenues";

  function pad2(n) {
    return String(n).padStart(2, "0");
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
    const [y, m, d] = String(ymd).split("-").map((x) => Number(x));
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
  }

  function monthRangeFromYmd(ymd) {
    const [y, m] = String(ymd).split("-").map((x) => Number(x));
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    const fmt = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    return { startStr: fmt(start), endExclusiveStr: fmt(end) };
  }

  function computeRangeFromPreset(preset) {
    const today = ymdTodayNY();

    if (preset === "next7") return { startStr: today, endExclusiveStr: addDaysYmd(today, 7) };
    if (preset === "next30") return { startStr: today, endExclusiveStr: addDaysYmd(today, 30) };
    if (preset === "next90") return { startStr: today, endExclusiveStr: addDaysYmd(today, 90) };
    if (preset === "thisMonth") return monthRangeFromYmd(today);

    const startStr = startDateInput?.value || today;
    const endStr = endDateInput?.value || addDaysYmd(startStr, 30);

    const endExclusiveStr = endStr <= startStr ? addDaysYmd(startStr, 1) : endStr;
    return { startStr, endExclusiveStr };
  }

  function setStatus(msg) {
    if (!overlayStatus) return;
    overlayStatus.textContent = msg || "";
    overlayStatus.style.display = msg ? "block" : "none";
  }

  function clearOverlay() {
    if (overlayBody) overlayBody.innerHTML = "";
  }

  function safeText(v) {
    const s = String(v || "").trim();
    return s.length ? s : "";
  }

  function formatEventDate(dateStr) {
    const raw = safeText(dateStr);
    if (!raw) return "";

    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);

      const dt = new Date(year, month - 1, day);
      return dt.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      });
    }

    const fallback = new Date(raw);
    if (!Number.isNaN(fallback.getTime())) {
      return fallback.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      });
    }

    return raw;
  }

  function formatEventType(typeStr) {
    const raw = safeText(typeStr);
    if (!raw) return "";

    return raw
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  function parseTimeToMinutes(timeStr) {
    const raw = safeText(timeStr).toLowerCase();
    if (!raw) return 0;

    const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!match) return 0;

    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = (match[3] || "").toLowerCase();

    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;

    return hour * 60 + minute;
  }

  function parseShiftDateToDayNumber(dateStr) {
    const raw = safeText(dateStr);
    if (!raw) return null;

    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const y = Number(isoMatch[1]);
      const m = Number(isoMatch[2]);
      const d = Number(isoMatch[3]);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.getUTCDay();
    }

    const fallback = new Date(raw);
    if (!Number.isNaN(fallback.getTime())) {
      return fallback.getDay();
    }

    return null;
  }

  function parseShiftDateTimeMs(shift) {
    const rawDate = safeText(shift?.date);
    if (!rawDate) return Number.POSITIVE_INFINITY;

    const isoMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let y, m, d;

    if (isoMatch) {
      y = Number(isoMatch[1]);
      m = Number(isoMatch[2]);
      d = Number(isoMatch[3]);
    } else {
      const fallback = new Date(rawDate);
      if (Number.isNaN(fallback.getTime())) return Number.POSITIVE_INFINITY;
      y = fallback.getFullYear();
      m = fallback.getMonth() + 1;
      d = fallback.getDate();
    }

    const minutes = parseTimeToMinutes(shift?.startTime);
    const hoursPart = Math.floor(minutes / 60);
    const minutesPart = minutes % 60;

    return Date.UTC(y, m - 1, d, hoursPart, minutesPart, 0, 0);
  }

  function sortShiftsByDateTime(shifts) {
    return [...(Array.isArray(shifts) ? shifts : [])].sort((a, b) => {
      const aTime = parseShiftDateTimeMs(a);
      const bTime = parseShiftDateTimeMs(b);
      if (aTime !== bTime) return aTime - bTime;

      const aVenue = safeText(a?.venueName).toLowerCase();
      const bVenue = safeText(b?.venueName).toLowerCase();
      if (aVenue !== bVenue) return aVenue.localeCompare(bVenue);

      const aType = safeText(a?.type).toLowerCase();
      const bType = safeText(b?.type).toLowerCase();
      if (aType !== bType) return aType.localeCompare(bType);

      return safeText(a?.startTime).localeCompare(safeText(b?.startTime));
    });
  }

  function filterVenuesByDayOfWeek(venues, selectedDay) {
    if (!Array.isArray(venues)) return [];
    if (!selectedDay || selectedDay === "all") return venues;

    return venues
      .map((venue) => {
        const shifts = Array.isArray(venue?.shifts) ? venue.shifts : [];
        const filteredShifts = shifts.filter((shift) => {
          const dayNum = parseShiftDateToDayNumber(shift?.date);
          return dayNum !== null && String(dayNum) === String(selectedDay);
        });

        if (!filteredShifts.length) return null;

        return {
          ...venue,
          shifts: filteredShifts,
        };
      })
      .filter(Boolean);
  }

  function setEventTypeOptions(eventTypes, keepCurrentValue) {
    if (!eventTypeSelect) return;

    const current = keepCurrentValue ? String(eventTypeSelect.value || "all") : "all";
    eventTypeSelect.innerHTML = `<option value="all">All</option>`;

    (eventTypes || []).forEach((t) => {
      const tt = String(t || "").trim();
      if (!tt) return;
      const opt = document.createElement("option");
      opt.value = tt;
      opt.textContent = formatEventType(tt);
      eventTypeSelect.appendChild(opt);
    });

    const canKeep =
      current !== "all" && Array.from(eventTypeSelect.options).some((o) => String(o.value) === current);

    eventTypeSelect.value = canKeep ? current : "all";
  }

  function flattenVenuesToEvents(venues) {
    const events = [];

    (venues || []).forEach((venue) => {
      const venueName = safeText(venue?.name) || "Unnamed Venue";
      const venueAddress = safeText(venue?.address) || "Address not set";
      const venueKey = getVenueKey(venueName, venueAddress);
      const shifts = Array.isArray(venue?.shifts) ? venue.shifts : [];

      shifts.forEach((shift) => {
        events.push({
          venueKey,
          venueName,
          venueAddress,
          type: safeText(shift?.type),
          date: safeText(shift?.date),
          startTime: safeText(shift?.startTime),
          endTime: safeText(shift?.endTime),
          sortTime: parseShiftDateTimeMs(shift),
          venueRef: venue,
          rawShift: shift,
        });
      });
    });

    return sortShiftsByDateTime(events);
  }

  // -----------------------------
  // Google Maps state + helpers
  // -----------------------------
  const HAMPTON_ROADS_CENTER = { lat: 36.9, lng: -76.3 };
  const GEO_CACHE_KEY = "bt_geocode_cache_v1";
  const GEO_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  let gMap = null;
  let gGeocoder = null;
  let gInfoWindow = null;
  let gMarkers = [];
  let gMapClass = null;
  let gAdvancedMarkerElement = null;
  let gMarkerByVenueKey = new Map();
  let gHighlightedMarker = null;

  function getVenueKey(name, address) {
    return `${safeText(name).toLowerCase()}|||${safeText(address).toLowerCase()}`;
  }

  function getGeoCache() {
    try {
      const raw = localStorage.getItem(GEO_CACHE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  }

  function setGeoCache(cache) {
    try {
      localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache || {}));
    } catch {}
  }

  function normalizeQueryForGeocode(name, address) {
    const a = safeText(address);
    const n = safeText(name);
    if (a) return a;
    if (n) return `${n} Hampton Roads VA`;
    return "Hampton Roads VA";
  }

  function ensureMapDivExists() {
    const mapDiv = document.getElementById("map");
    if (mapDiv) return mapDiv;

    const wrapper = document.getElementById("map-wrapper");
    if (!wrapper) return null;

    const fallback = document.createElement("div");
    fallback.id = "map";
    fallback.style.width = "100%";
    fallback.style.height = "550px";
    fallback.style.borderRadius = "10px";
    wrapper.insertBefore(fallback, wrapper.firstChild);
    return fallback;
  }

  function loadGoogleMapsJs(apiKey) {
    if (window.__btGmapsPromise) return window.__btGmapsPromise;

    window.__btGmapsPromise = new Promise((resolve, reject) => {
      if (window.google?.maps?.Map || window.google?.maps?.importLibrary) {
        resolve(true);
        return;
      }

      const k = String(apiKey || "").trim();
      if (!k) {
        reject(new Error("missing api key"));
        return;
      }

      const existing = document.querySelector('script[data-bt-gmaps="1"]');
      if (existing) {
        const t0 = Date.now();
        const iv = setInterval(() => {
          if (window.google?.maps?.Map || window.google?.maps?.importLibrary) {
            clearInterval(iv);
            resolve(true);
          } else if (Date.now() - t0 > 15000) {
            clearInterval(iv);
            reject(new Error("gmaps load timeout"));
          }
        }, 100);
        return;
      }

      const cbName = "__btMapsReady";
      window[cbName] = () => {
        try {
          delete window[cbName];
        } catch {}
        resolve(true);
      };

      const s = document.createElement("script");
      s.setAttribute("data-bt-gmaps", "1");
      s.async = true;
      s.defer = true;
      s.onerror = () => reject(new Error("gmaps script load failed"));
      s.src =
        `https://maps.googleapis.com/maps/api/js` +
        `?key=${encodeURIComponent(k)}` +
        `&v=weekly` +
        `&loading=async` +
        `&libraries=marker` +
        `&callback=${cbName}`;

      document.head.appendChild(s);
    });

    return window.__btGmapsPromise;
  }

  function openVenueInfo(marker, venue) {
    if (!gInfoWindow || !marker || !venue) return;
    try {
      gInfoWindow.setContent(buildInfoHtml(venue));
      gInfoWindow.open({ map: gMap, anchor: marker });
    } catch {}
  }

  function highlightMarker(marker) {
    if (!marker || !window.google?.maps?.Animation) return;
    if (gHighlightedMarker === marker) return;

    clearMarkerHighlight();

    gHighlightedMarker = marker;

    try {
      if (typeof marker.setAnimation === "function") {
        marker.setAnimation(google.maps.Animation.BOUNCE);
      }
      if (typeof marker.setZIndex === "function") {
        marker.setZIndex(google.maps.Marker.MAX_ZINDEX + 1);
      }
    } catch {}
  }

  function clearMarkerHighlight() {
    if (!gHighlightedMarker) return;

    try {
      if (typeof gHighlightedMarker.setAnimation === "function") {
        gHighlightedMarker.setAnimation(null);
      }
      if (typeof gHighlightedMarker.setZIndex === "function") {
        gHighlightedMarker.setZIndex(undefined);
      }
    } catch {}

    gHighlightedMarker = null;
  }

  function highlightMarkerForVenueKey(venueKey) {
    const marker = gMarkerByVenueKey.get(venueKey);
    if (!marker) return;
    highlightMarker(marker);
  }

  function focusMarkerForVenueKey(venueKey) {
    const marker = gMarkerByVenueKey.get(venueKey);
    if (!marker || !gMap) return;

    highlightMarker(marker);

    try {
      const pos =
        typeof marker.getPosition === "function"
          ? marker.getPosition()
          : marker.position || null;

      if (pos) {
        gMap.panTo(pos);
        if (typeof gMap.getZoom === "function" && gMap.getZoom() < 12) {
          gMap.setZoom(12);
        }
      }
    } catch {}

    if (marker.__btVenueRef) {
      openVenueInfo(marker, marker.__btVenueRef);
    }
  }

  function renderOverlay(venues, range) {
    clearOverlay();
    if (!overlayBody) return;

    const events = flattenVenuesToEvents(venues);

    if (!events.length) {
      const rangeText =
        range && range.startStr && range.endExclusiveStr
          ? ` (${range.startStr} → ${range.endExclusiveStr})`
          : "";
      setStatus(`No scheduled venues found for this filter.${rangeText}`);
      return;
    }

    setStatus("");
    const frag = document.createDocumentFragment();

    events.forEach((event) => {
      const badge = document.createElement("div");
      badge.className = "location-badge";
      badge.tabIndex = 0;
      badge.style.cursor = "pointer";

      const info = document.createElement("div");
      info.className = "location-info";

      const h4 = document.createElement("h4");
      h4.textContent = event.venueName;

      const pAddr = document.createElement("p");
      pAddr.textContent = event.venueAddress;

      const formattedType = formatEventType(event.type);
      const formattedDate = formatEventDate(event.date);
      const timePart = [event.startTime, event.endTime].filter(Boolean).join("–");
      const pieces = [formattedType, formattedDate, timePart].filter(Boolean);

      const pEvent = document.createElement("p");
      pEvent.className = "event-time";
      pEvent.textContent = pieces.join(" • ");

      info.appendChild(h4);
      info.appendChild(pAddr);
      info.appendChild(pEvent);

      badge.appendChild(info);

      badge.addEventListener("mouseenter", () => {
        highlightMarkerForVenueKey(event.venueKey);
      });

      badge.addEventListener("mouseleave", () => {
        clearMarkerHighlight();
      });

      badge.addEventListener("focus", () => {
        highlightMarkerForVenueKey(event.venueKey);
      });

      badge.addEventListener("blur", () => {
        clearMarkerHighlight();
      });

      badge.addEventListener("click", () => {
        focusMarkerForVenueKey(event.venueKey);
      });

      badge.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          focusMarkerForVenueKey(event.venueKey);
        }
      });

      frag.appendChild(badge);
    });

    overlayBody.appendChild(frag);
  }

  function clearMarkers() {
    gMarkers.forEach((m) => {
      try {
        if (typeof m.setAnimation === "function") m.setAnimation(null);
      } catch {}

      try {
        if (typeof m.setMap === "function") m.setMap(null);
        else m.map = null;
      } catch {}
    });
    gMarkers = [];
    gMarkerByVenueKey = new Map();
    gHighlightedMarker = null;
  }

  async function initMapIfPossible() {
    const finalKey = window.__GMAPS_API_KEY__;

    try {
      await loadGoogleMapsJs(finalKey);

      const mapDiv = ensureMapDivExists();
      if (!mapDiv) throw new Error("missing map wrapper");

      gGeocoder = gGeocoder || new google.maps.Geocoder();
      gInfoWindow = gInfoWindow || new google.maps.InfoWindow({ disableAutoPan: true });

      if (typeof google.maps.importLibrary === "function") {
        const { Map } = await google.maps.importLibrary("maps");

        gMapClass = Map;
        gAdvancedMarkerElement = null;

        gMap = gMap || new gMapClass(mapDiv, {
          center: HAMPTON_ROADS_CENTER,
          zoom: 10,
          zoomControl: true,
          gestureHandling: "greedy",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });

        return true;
      }

      if (typeof google.maps.Map === "function") {
        gMapClass = google.maps.Map;
        gAdvancedMarkerElement = null;

        gMap = gMap || new gMapClass(mapDiv, {
          center: HAMPTON_ROADS_CENTER,
          zoom: 10,
          zoomControl: true,
          gestureHandling: "greedy",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });

        return true;
      }

      throw new Error("Maps API loaded but no usable map constructor found");
    } catch (e) {
      console.warn("[locations] maps init skipped:", e?.message || e);
      return false;
    }
  }

  function buildInfoHtml(venue) {
    const name = safeText(venue?.name) || "Venue";
    const address = safeText(venue?.address);
    const shifts = sortShiftsByDateTime(Array.isArray(venue?.shifts) ? venue.shifts : []);

    const lines = [];
    lines.push(`<div style="font-family:sans-serif;width:240px;min-width:240px;color:#222;line-height:1.4;">`);
    lines.push(`<div style="font-weight:700;margin-bottom:6px;color:#111;">${escapeHtml(name)}</div>`);
    if (address) lines.push(`<div style="margin-bottom:6px;color:#555;">${escapeHtml(address)}</div>`);
    if (shifts.length) {
      lines.push(`<div style="font-weight:700;margin:8px 0 4px 0;color:#111;">Upcoming</div>`);
      shifts.slice(0, 5).forEach((s) => {
        const type = formatEventType(s.type);
        const date = formatEventDate(s.date);
        const start = safeText(s.startTime);
        const end = safeText(s.endTime);
        const timePart = [start, end].filter(Boolean).join("–");
        const pieces = [type, date, timePart].filter(Boolean);
        lines.push(`<div style="margin:2px 0;color:#333;">• ${escapeHtml(pieces.join(" • "))}</div>`);
      });
      if (shifts.length > 5) {
        lines.push(`<div style="opacity:0.75;margin-top:4px;color:#333;">+ ${shifts.length - 5} more…</div>`);
      }
    }
    lines.push(`</div>`);
    return lines.join("");
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function geocodeVenue(venue, cache) {
    if (!gGeocoder) return null;

    const query = normalizeQueryForGeocode(venue?.name, venue?.address);
    const cacheKey = query.toLowerCase();

    const now = Date.now();
    const cached = cache[cacheKey];
    if (cached && cached.lat && cached.lng && cached.ts && now - cached.ts < GEO_CACHE_TTL_MS) {
      return { lat: cached.lat, lng: cached.lng, query, fromCache: true };
    }

    const result = await new Promise((resolve) => {
      gGeocoder.geocode({ address: query }, (results, status) => {
        if (status === "OK" && results && results[0] && results[0].geometry) {
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng(), query, fromCache: false });
        } else {
          resolve(null);
        }
      });
    });

    if (result) {
      cache[cacheKey] = { lat: result.lat, lng: result.lng, ts: now };
    }

    return result;
  }

  async function updateMapPins(venues) {
    const ok = await initMapIfPossible();
    if (!ok || !gMap) return;

    clearMarkers();

    const cache = getGeoCache();
    const bounds = new google.maps.LatLngBounds();
    let pinned = 0;

    for (const v of venues || []) {
      const geo = await geocodeVenue(v, cache);
      if (!geo) continue;

      const pos = { lat: geo.lat, lng: geo.lng };
      let marker;
      const isAdvanced = !!gAdvancedMarkerElement;

      if (isAdvanced) {
        marker = new gAdvancedMarkerElement({
          position: pos,
          map: gMap,
          title: safeText(v?.name) || "Venue",
        });
      } else {
        marker = new google.maps.Marker({
          position: pos,
          map: gMap,
          title: safeText(v?.name) || "Venue",
        });
      }

      marker.__btVenueRef = v;
      marker.__btVenueKey = getVenueKey(v?.name, v?.address);

      if (isAdvanced && typeof marker.addEventListener === "function") {
        marker.gmpClickable = true;
        marker.addEventListener("gmp-click", () => {
          openVenueInfo(marker, v);
        });
      } else if (typeof marker.addListener === "function") {
        marker.addListener("mouseover", () => {
          openVenueInfo(marker, v);
        });
        marker.addListener("mouseout", () => {
          try {
            gInfoWindow.close();
          } catch {}
        });
        marker.addListener("click", () => {
          openVenueInfo(marker, v);
        });
      }

      gMarkers.push(marker);
      gMarkerByVenueKey.set(marker.__btVenueKey, marker);
      bounds.extend(pos);
      pinned++;

      if (!geo.fromCache) await new Promise((r) => setTimeout(r, 120));
    }

    setGeoCache(cache);

    if (pinned > 0) {
      gMap.fitBounds(bounds, 60);
    } else {
      gMap.setCenter(HAMPTON_ROADS_CENTER);
      gMap.setZoom(10);
    }
  }

  // -----------------------------
  // Fetch + render + map pins
  // -----------------------------
  async function refreshLocations() {
    if (!overlayBody && !overlayStatus) return;

    const preset = datePresetSelect ? String(datePresetSelect.value || "next30") : "next30";
    const { startStr, endExclusiveStr } = computeRangeFromPreset(preset);
    const type = eventTypeSelect ? String(eventTypeSelect.value || "all") : "all";
    const selectedDay = dayOfWeekSelect ? String(dayOfWeekSelect.value || "all") : "all";

    setStatus("Loading venues…");
    clearOverlay();

    const qs = new URLSearchParams();
    qs.set("start", startStr);
    qs.set("end", endExclusiveStr);
    qs.set("type", type && type !== "all" ? type : "all");

    let data;
    try {
      const url = `${FUNCTION_URL}?${qs.toString()}`;
      const resp = await fetch(url, { method: "GET" });
      data = await resp.json().catch(() => null);

      if (!resp.ok || !data || data.ok !== true) {
        const msg = data?.error || data?.message || "bad response";
        throw new Error(String(msg));
      }
    } catch (e) {
      console.warn("[locations] fetch failed:", e);
      setStatus("Could not load venues right now. Please try again.");
      return;
    }

    let venues = Array.isArray(data.venues) ? data.venues : [];
    const eventTypes = Array.isArray(data.eventTypes) ? data.eventTypes : [];

    if (eventTypes.length) setEventTypeOptions(eventTypes, true);

    venues = filterVenuesByDayOfWeek(venues, selectedDay);

    renderOverlay(venues, data.range || null);
    updateMapPins(venues).catch((e) => console.warn("[locations] updateMapPins failed:", e));
  }

  function applyPresetUI() {
    const preset = datePresetSelect ? String(datePresetSelect.value || "next30") : "next30";
    const isCustom = preset === "custom";

    if (customDatesRow) customDatesRow.style.display = isCustom ? "flex" : "none";

    if (isCustom) {
      const today = ymdTodayNY();
      if (startDateInput && !startDateInput.value) startDateInput.value = today;
      if (endDateInput && !endDateInput.value) endDateInput.value = addDaysYmd(today, 30);
    }
  }

  if (datePresetSelect) {
    datePresetSelect.addEventListener("change", () => {
      applyPresetUI();
      refreshLocations();
    });
  }
  if (eventTypeSelect) eventTypeSelect.addEventListener("change", refreshLocations);
  if (dayOfWeekSelect) dayOfWeekSelect.addEventListener("change", refreshLocations);
  if (startDateInput) startDateInput.addEventListener("change", refreshLocations);
  if (endDateInput) endDateInput.addEventListener("change", refreshLocations);

  applyPresetUI();
  refreshLocations();
});