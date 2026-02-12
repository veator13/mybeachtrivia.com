// auth-guard.js — Protect Employees Admin page (Firebase compat SDK)

document.addEventListener("DOMContentLoaded", () => {
    // --- Lightweight page-hide until verified ---
    const style = document.createElement("style");
    style.textContent = `
      html.auth-locked { visibility: hidden; }
      .auth-overlay {
        position: fixed; inset: 0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; background:rgba(0,0,0,.8);
        color:#fff; z-index: 9999; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      .auth-overlay .spinner {
        width:40px; height:40px; border-radius:50%;
        border:4px solid rgba(255,255,255,.3); border-top-color:#3699ff;
        animation: spin 1s linear infinite; margin-bottom:12px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
    document.documentElement.classList.add("auth-locked");
  
    // Loading overlay
    let overlay = document.getElementById("auth-loading");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "auth-loading";
      overlay.className = "auth-overlay";
      overlay.innerHTML = `<div class="spinner"></div><p>Verifying access…</p>`;
      document.body.appendChild(overlay);
    }
  
    // Wait for Firebase to exist (compat build)
    const startTime = Date.now();
    const wait = setInterval(() => {
      if (typeof firebase !== "undefined" && firebase.auth && firebase.firestore) {
        clearInterval(wait);
        runGuard();
      } else if (Date.now() - startTime > 10000) {
        clearInterval(wait);
        console.error("Firebase failed to initialize for auth-guard.");
        alert("Error loading authentication. Please refresh and try again.");
        location.href = "/login.html";
      }
    }, 100);
  
    async function runGuard() {
      firebase.auth().onAuthStateChanged(async (user) => {
        try {
          if (!user) {
            console.warn("No user; redirecting to login.");
            location.href = "/login.html";
            return;
          }
  
          // Fetch employees/{uid}
          const db = firebase.firestore();
          const snap = await db.collection("employees").doc(user.uid).get();
  
          if (!snap.exists) {
            console.warn("No employee profile; redirecting.");
            location.href = "/login.html";
            return;
          }
  
          const d = snap.data() || {};
          const roles = Array.isArray(d.roles)
            ? d.roles
            : (typeof d.role === "string" ? [d.role] : []);
          const isAdmin = d.active === true && roles.includes("admin");
  
          if (!isAdmin) {
            console.warn("User is not an active admin; redirecting.");
            location.href = "/login.html";
            return;
          }
  
          // Success: show page
          document.documentElement.classList.remove("auth-locked");
          if (overlay) overlay.remove();
          console.log("Admin access verified for:", user.email);
        } catch (err) {
          console.error("Auth guard error:", err);
          alert("Authentication error. Please sign in again.");
          location.href = "/login.html";
        }
      }, (err) => {
        console.error("onAuthStateChanged error:", err);
        location.href = "/login.html";
      });
    }
  });
  