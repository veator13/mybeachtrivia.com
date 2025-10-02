// employees-management/boot.js
if (window.__btEmpBootInit) { try{console.warn("[employees-boot] already initialized");}catch(_){ } }
window.__btEmpBootInit = true;
(function () {
    if (typeof firebase === "undefined" || !firebase.apps || !firebase.apps.length) {
      console.error("[boot] Firebase not initialized. Make sure /firebase-init.js loads first.");
      return;
    }
  
    const auth = firebase.auth();
  
    auth.onAuthStateChanged(async (user) => {
      if (!user) return; // auth-guard.js should be handling redirects/denials
  
      // Give auth-guard a tick to finish any checks it does.
      try { await new Promise(r => setTimeout(r, 50)); } catch {}
  
      const overlay = document.getElementById("auth-loading");
      const container = document.querySelector(".container");
      if (overlay) overlay.style.display = "none";
      if (container) container.style.display = "block";
    });
  })();
  