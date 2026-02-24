// sw-register.js
(function () {
    "use strict";
  
    if (!("serviceWorker" in navigator)) return;
  
    window.addEventListener("load", async () => {
      try {
        // Root scope so it can cache pages under /beachTriviaPages/ too
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        console.log("[SW] registered:", reg.scope);
      } catch (err) {
        console.warn("[SW] register failed:", err);
      }
    });
  })();