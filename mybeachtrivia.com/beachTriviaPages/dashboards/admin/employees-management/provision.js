// employees-management/provision.js
(function () {
    // --- Firebase helpers ------------------------------------------------------
    function getFns() {
      const app = firebase.app();
      return app.functions("us-central1"); // callable region
    }
  
    async function waitForUser() {
      const cur = firebase.auth().currentUser;
      if (cur) return cur;
      return await new Promise((resolve) => {
        const off = firebase.auth().onAuthStateChanged((u) => { off(); resolve(u || null); });
      });
    }
  
    // --- UI action -------------------------------------------------------------
    async function createAndSend() {
      const emailEl = document.getElementById("email-input");
      const roleEl  = document.getElementById("role-input");
      const btn     = document.getElementById("provision-btn");
      const status  = document.getElementById("provision-status");
  
      const email = (emailEl?.value || "").trim().toLowerCase();
      const role  = (roleEl?.value || "host");
  
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert("Please enter a valid email.");
        return;
      }
  
      const setBusy = (busy, text) => {
        if (!btn) return;
        btn.disabled = !!busy;
        if (typeof text === "string") btn.textContent = text;
      };
  
      const oldText = btn?.textContent || "Create & Send";
      setBusy(true, "Working…");
      if (status) status.textContent = "Creating user and generating password setup link…";
  
      try {
        // Ensure we are signed in and get a *fresh* ID token
        const user = await waitForUser();
        if (!user) throw new Error("Sign in required");
        const idToken = await user.getIdToken(true);
  
        // Optional: quick visual confirmation in console
        console.log("[provision] sending idToken:", idToken.slice(0, 12), "...");
  
        // Call the function WITH idToken
        const callable = getFns().httpsCallable("adminCreateEmployee");
        const res = await callable({ email, role, idToken });
  
        const { uid, resetLink } = res.data || {};
const DEST_AFTER_RESET = "https://mybeachtrivia.com/beachTriviaPages/onboarding/account-setup/";
let finalLink = resetLink;
try {
  const u = new URL(resetLink);
  // Only set if not already provided
  if (!u.searchParams.get("continueUrl")) u.searchParams.set("continueUrl", DEST_AFTER_RESET);
  finalLink = u.toString();
} catch {}

        if (!uid || !resetLink) throw new Error("Unexpected response from server.");
  
        if (status) {
          status.innerHTML = `
            ✅ Created/updated <code>employees/${uid}</code> as <b>${role}</b>.
            <br/>Password setup link:
            <a href="${finalLink}" target="_blank" rel="noopener">Open link</a>
            <br/><small>(Link copied to your clipboard.)</small>
          `;
        }
        try { await navigator.clipboard.writeText(finalLink); } catch {}
  
        // Reset form
        if (emailEl) emailEl.value = "";
        if (roleEl)  roleEl.value  = "host";
      } catch (err) {
        console.error("[provision] error:", err);
        const msg = `${err?.code ? err.code + ": " : ""}${err?.message || String(err)}`;
        if (status) status.innerHTML = `❌ ${msg}`;
        alert("Error: " + msg);
      } finally {
        setBusy(false, oldText);
      }
    }
  
    // --- Wire up ---------------------------------------------------------------
    document.addEventListener("DOMContentLoaded", () => {
      const btn = document.getElementById("provision-btn");
      if (btn) btn.addEventListener("click", createAndSend);
      console.log("provision.js v4");
    });
  })();
  

