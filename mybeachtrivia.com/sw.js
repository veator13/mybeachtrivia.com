/* sw.js - Beach Trivia offline cache (scoresheet-first)
   Goal: make /beachTriviaPages/dashboards/host/scoresheet/ usable offline

   Fixes:
   - Prevent “stuck old CSS” by using stale-while-revalidate for assets
   - Bump VERSION to force a new cache on deploy
   - Keep precache list aligned with index.html (incl querystrings)

   Updated 2026-03-05:
   - ✅ DO NOT hijack site-wide navigations. Only handle NAVIGATE requests under SCORESHEET_PREFIX.
     (Fixes "Unexpected token '<'" on other pages when SW serves scoresheet index.html as fallback)
*/

(() => {
  "use strict";

  // ✅ MUST MATCH the cache-busting version used in index.html assets.
  // Bumping this forces a brand-new cache name below, which wipes out any
  // stale "canonical" (no-?v=) entries left over from a previous deploy.
  const ASSET_V = "20260831-bthead";

  // ✅ Bump this whenever you deploy changes to scoresheet assets (CSS/JS/HTML)
  const VERSION = `scoresheet-offline-v4-${ASSET_V}`;
  const CACHE = `bt-${VERSION}`;

  const SCORESHEET_PREFIX = "/beachTriviaPages/dashboards/host/scoresheet/";
  const SHARED_PREFIX = "/beachTriviaPages/js/";

  // Always let these hit the network — never cache them. bt-head.js is the
  // shared <head> include on every page and carries the cache-busting version
  // for bt-nav.*; if the SW served it stale, a nav/CSS change would lag a
  // reload for anyone who'd visited the scoresheet.
  const ALWAYS_FRESH = [
    "/beachTriviaPages/js/bt-head.js",
    "/beachTriviaPages/js/bt-nav.js",
    "/beachTriviaPages/js/bt-nav.css",
  ];
  function isAlwaysFresh(url) {
    return ALWAYS_FRESH.indexOf(url.pathname || "") !== -1;
  }

  // NOTE: these must match the exact hrefs/srcs (incl. querystrings) in
  // index.html — each file has its own independent ?v=, not a shared one.
  const PRECACHE_URLS = [
    // Scoresheet route + local assets
    "/beachTriviaPages/dashboards/host/scoresheet/index.html",
    "/beachTriviaPages/dashboards/host/scoresheet/style.css?v=20260831-bthead",
    "/beachTriviaPages/dashboards/host/scoresheet/final-neg-guard.js?v=20251025163459",

    "/beachTriviaPages/dashboards/host/scoresheet/js/dom-utils.js?v=20260218-04",
    "/beachTriviaPages/dashboards/host/scoresheet/js/state.js?v=20260218-04",
    "/beachTriviaPages/dashboards/host/scoresheet/js/firebase.js?v=20260218-04",
    "/beachTriviaPages/dashboards/host/scoresheet/js/venues.js?v=20260501-01",
    "/beachTriviaPages/dashboards/host/scoresheet/js/meta-fields.js?v=20260218-04",
    "/beachTriviaPages/dashboards/host/scoresheet/js/venue-combobox.js?v=20260504-event-combo1",
    "/beachTriviaPages/dashboards/host/scoresheet/js/ui-sticky-bonus.js?v=20260821-zebra-rows",
    "/beachTriviaPages/dashboards/host/scoresheet/js/table-build.js?v=20260821-feud-cap",
    "/beachTriviaPages/dashboards/host/scoresheet/js/sort-teams.js?v=20260403-01",
    "/beachTriviaPages/dashboards/host/scoresheet/js/scoring.js?v=20260821-feud-cap",
    "/beachTriviaPages/dashboards/host/scoresheet/js/search.js?v=20260218-04",
    "/beachTriviaPages/dashboards/host/scoresheet/js/standings-modal.js?v=20260828-popout5",
    "/beachTriviaPages/dashboards/host/scoresheet/js/team-number-modal.js?v=20260302-01",
    "/beachTriviaPages/dashboards/host/scoresheet/js/submit-scores.js?v=20260218-04",
    "/beachTriviaPages/dashboards/host/scoresheet/js/grid-enforcer.js?v=20260218-04",
    "/beachTriviaPages/dashboards/host/scoresheet/js/main.js?v=20260512-full-table",
    "/beachTriviaPages/dashboards/host/scoresheet/js/mobile-scoring.js?v=20260831-bthead",

    // Shared auth/firebase bootstrap used by scoresheet
    "/beachTriviaPages/js/firebase-init-compat.js",
    "/beachTriviaPages/js/auth-route-guard.v2.js?v=2025-10-14a",

    // Nice-to-have
    "/favicon.ico",
  ];

  // ✅ event-scoped keepalive hook (set inside fetch handler)
  let eventWaitUntilSafe = (_p) => {};

  self.addEventListener("install", (event) => {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);

        // Force bypass of the browser HTTP cache during install
        await Promise.all(
          PRECACHE_URLS.map((u) =>
            cache.add(
              new Request(u, {
                cache: "reload",
                credentials: "same-origin",
              })
            )
          )
        );

        await self.skipWaiting();
      })()
    );
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
        await self.clients.claim();
      })()
    );
  });

  // Optional: allow page to request immediate activation
  self.addEventListener("message", (event) => {
    if (event?.data === "SKIP_WAITING") self.skipWaiting();
  });

  // -----------------------------
  // Helpers
  // -----------------------------
  function isSameOrigin(url) {
    try {
      return url.origin === self.location.origin;
    } catch {
      return false;
    }
  }

  function isScoresheetAsset(url) {
    const p = url.pathname || "";
    return p.startsWith(SCORESHEET_PREFIX) || p.startsWith(SHARED_PREFIX);
  }

  function stripVParam(urlString) {
    try {
      const u = new URL(urlString);
      u.searchParams.delete("v");
      return u.toString();
    } catch {
      return urlString;
    }
  }

  async function cachePutBothKeys(cache, request, response) {
    // Cache under the exact request (with ?v=...) AND also a canonical form without ?v=
    // so accidental unversioned requests still hit cache.
    try {
      await cache.put(request, response.clone());
    } catch (_) {}

    try {
      const canonUrl = stripVParam(request.url);
      if (canonUrl !== request.url) {
        await cache.put(new Request(canonUrl, { credentials: "same-origin" }), response.clone());
      }
    } catch (_) {}
  }

  async function cacheMatchEither(cache, request) {
    const exact = await cache.match(request, { ignoreVary: true });
    if (exact) return exact;

    try {
      const canonUrl = stripVParam(request.url);
      if (canonUrl !== request.url) {
        const canon = await cache.match(new Request(canonUrl), { ignoreVary: true });
        if (canon) return canon;
      }
    } catch (_) {}

    return null;
  }

  // ✅ Stale-While-Revalidate for assets:
  // - Return cached immediately (fast + stable offline)
  // - If online, fetch in background and update cache
  async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE);
    const cached = await cacheMatchEither(cache, request);

    const fetchPromise = (async () => {
      try {
        const fresh = await fetch(request, {
          cache: "no-store",
          credentials: "same-origin",
        });

        if (fresh && fresh.ok) {
          await cachePutBothKeys(cache, request, fresh);
        }

        return fresh;
      } catch {
        return null;
      }
    })();

    if (cached) {
      // refresh in background (best effort)
      eventWaitUntilSafe(fetchPromise);
      return cached;
    }

    const fresh = await fetchPromise;
    if (fresh) return fresh;

    return new Response("Offline and not cached: " + request.url, {
      status: 504,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Navigation: network-first with short timeout, fallback to cached index.html
  async function networkFirstNavigate(request, { timeoutMs = 2500 } = {}) {
    const cache = await caches.open(CACHE);

    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);

      const fresh = await fetch(request, {
        signal: controller.signal,
        cache: "no-store",
        credentials: "same-origin",
      });

      clearTimeout(t);

      if (fresh && fresh.ok) {
        await cachePutBothKeys(cache, request, fresh);
        return fresh;
      }
    } catch {
      // fall through
    }

    const fallback =
      (await cacheMatchEither(cache, request)) ||
      (await cache.match("/beachTriviaPages/dashboards/host/scoresheet/index.html"));

    return (
      fallback ||
      new Response("Offline and scoresheet not cached yet.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    );
  }

  // -----------------------------
  // Fetch handler
  // -----------------------------
  self.addEventListener("fetch", (event) => {
    const req = event.request;

    // Only handle GET
    if (req.method !== "GET") return;

    const url = new URL(req.url);

    // Only same-origin
    if (!isSameOrigin(url)) return;

    // Shared nav/head files: bypass the SW entirely so they're never stale.
    if (isAlwaysFresh(url)) return;

    const isNav = req.mode === "navigate";
    const path = url.pathname || "";
    const inScoresheet = path.startsWith(SCORESHEET_PREFIX);
    const isAsset = isScoresheetAsset(url);

    // ✅ Only control the scoresheet area:
    // - Navigations ONLY under /beachTriviaPages/dashboards/host/scoresheet/
    // - Assets only for scoresheet + shared deps
    if (isNav) {
      if (!inScoresheet) return;
    } else {
      if (!isAsset) return;
    }

    // Bind safe waitUntil for THIS fetch event (used by SWR background refresh)
    eventWaitUntilSafe = (p) => {
      try {
        event.waitUntil(Promise.resolve(p));
      } catch (_) {}
    };

    if (isNav) {
      event.respondWith(networkFirstNavigate(req));
      return;
    }

    event.respondWith(staleWhileRevalidate(req));
  });
})();