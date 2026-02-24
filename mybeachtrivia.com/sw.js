/* sw.js - Beach Trivia offline cache (scoresheet-first)
   Goal: make /beachTriviaPages/dashboards/host/scoresheet/ usable offline

   Fixes:
   - Prevent “stuck old CSS” by using stale-while-revalidate for assets
   - Bump VERSION to force a new cache on deploy
   - Keep precache list aligned with index.html (incl querystrings)
*/

(() => {
  "use strict";

  // ✅ MUST MATCH the cache-busting version used in index.html assets
  // (ex: style.css?v=20260218-02, js/*?v=20260218-02)
  const ASSET_V = "20260218-04";

  // ✅ Bump this whenever you deploy changes to scoresheet assets (CSS/JS/HTML)
  const VERSION = `scoresheet-offline-v3-${ASSET_V}`;
  const CACHE = `bt-${VERSION}`;

  const SCORESHEET_PREFIX = "/beachTriviaPages/dashboards/host/scoresheet/";
  const SHARED_PREFIX = "/beachTriviaPages/js/";

  // NOTE: include querystring versions exactly as requested in index.html
  const PRECACHE_URLS = [
    // Scoresheet route + local assets
    "/beachTriviaPages/dashboards/host/scoresheet/index.html",
    `/beachTriviaPages/dashboards/host/scoresheet/style.css?v=${ASSET_V}`,
    "/beachTriviaPages/dashboards/host/scoresheet/final-neg-guard.js?v=20251025163459",

    `/beachTriviaPages/dashboards/host/scoresheet/js/dom-utils.js?v=${ASSET_V}`,
    `/beachTriviaPages/dashboards/host/scoresheet/js/state.js?v=${ASSET_V}`,
    `/beachTriviaPages/dashboards/host/scoresheet/js/firebase.js?v=${ASSET_V}`,
    `/beachTriviaPages/dashboards/host/scoresheet/js/venues.js?v=${ASSET_V}`,
    `/beachTriviaPages/dashboards/host/scoresheet/js/meta-fields.js?v=${ASSET_V}`,
    `/beachTriviaPages/dashboards/host/scoresheet/js/ui-sticky-bonus.js?v=${ASSET_V}`,
    `/beachTriviaPages/dashboards/host/scoresheet/js/table-build.js?v=${ASSET_V}`,
    `/beachTriviaPages/dashboards/host/scoresheet/js/scoring.js?v=${ASSET_V}`,
    `/beachTriviaPages/dashboards/host/scoresheet/js/search.js?v=${ASSET_V}`,
    `/beachTriviaPages/dashboards/host/scoresheet/js/standings-modal.js?v=${ASSET_V}`,
    `/beachTriviaPages/dashboards/host/scoresheet/js/submit-scores.js?v=${ASSET_V}`,
    `/beachTriviaPages/dashboards/host/scoresheet/js/grid-enforcer.js?v=${ASSET_V}`,
    `/beachTriviaPages/dashboards/host/scoresheet/js/main.js?v=${ASSET_V}`,

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
        await cache.put(
          new Request(canonUrl, { credentials: "same-origin" }),
          response.clone()
        );
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

    // Only handle scoresheet + its shared deps (avoid caching whole site)
    if (!isScoresheetAsset(url) && req.mode !== "navigate") return;

    // Bind safe waitUntil for THIS fetch event (used by SWR background refresh)
    eventWaitUntilSafe = (p) => {
      try {
        event.waitUntil(Promise.resolve(p));
      } catch (_) {}
    };

    if (req.mode === "navigate") {
      event.respondWith(networkFirstNavigate(req));
      return;
    }

    event.respondWith(staleWhileRevalidate(req));
  });
})();