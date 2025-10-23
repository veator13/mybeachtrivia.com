// beachTriviaPages/dashboards/admin/employees-management/provision.js

function collectSelectedRoles() {
  const boxes = Array.from(document.querySelectorAll('input[name="roles"]:checked'));
  let roles = boxes.map(b => (b.value || '').toLowerCase().trim());
  if (!roles.length) roles = ['host'];
  return roles;
}

(function () {
  // --- Firebase helpers ------------------------------------------------------
  function getFns() {
    const app = firebase.app();
    return app.functions("us-central1"); // callable region MUST match your function region
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
    const btn     = document.getElementById("provision-btn");
    const status  = document.getElementById("provision-status");

    const email = (emailEl?.value || "").trim().toLowerCase();
    const roles = collectSelectedRoles();

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

      // Call the callable WITH idToken and roles[]
      const callable = getFns().httpsCallable("adminCreateEmployee");
      const res = await callable({ email, roles, idToken });

      const { uid, resetLink } = res.data || {};
      if (!uid || !resetLink) throw new Error("Unexpected response from server.");

      // Add return path so login bounces to account-setup
      const afterLogin = new URL("https://mybeachtrivia.com/login.html");
      afterLogin.searchParams.set("return", "/beachTriviaPages/onboarding/account-setup/");
      let finalLink = resetLink;
      try {
        const u = new URL(resetLink);
        if (!u.searchParams.get("continueUrl")) {
          u.searchParams.set("continueUrl", afterLogin.toString());
        }
        finalLink = u.toString();
      } catch { /* leave finalLink as-is */ }

      if (status) {
        status.innerHTML = `
          ✅ Created/updated <code>employees/${uid}</code>.<br/>
          <b>Assigned roles:</b> ${roles.join(", ")}<br/>
          Password setup link:
          <a href="${finalLink}" target="_blank" rel="noopener">Open link</a>
          <br/><small>(Link copied to your clipboard.)</small>
        `;
      }

      try { await navigator.clipboard.writeText(finalLink); } catch {}

      // Reset form & default Host checked
      if (emailEl) emailEl.value = "";
      document.querySelectorAll('input[name="roles"]:checked').forEach(cb => cb.checked = false);
      document.querySelector('input[name="roles"][value="host"]')?.click();
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
    document.getElementById("provision-btn")?.addEventListener("click", createAndSend);
    console.log("provision.js v5 (roles array fix)");
  });
})();