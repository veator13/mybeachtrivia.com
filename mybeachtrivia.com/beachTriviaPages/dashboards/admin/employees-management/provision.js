// beachTriviaPages/dashboards/admin/employees-management/provision.js

function collectSelectedRoles() {
  const boxes = Array.from(document.querySelectorAll('input[name="roles"]:checked'));
  let roles = boxes.map((b) => (b.value || "").toLowerCase().trim());
  if (!roles.length) roles = ["host"];
  return roles;
}

(function () {
  // --- Firebase helpers ------------------------------------------------------
  function getFns() {
    const app = firebase.app();
    return app.functions("us-central1"); // must match your callable region
  }

  async function waitForUser() {
    const cur = firebase.auth().currentUser;
    if (cur) return cur;
    return await new Promise((resolve) => {
      const off = firebase.auth().onAuthStateChanged((u) => {
        off();
        resolve(u || null);
      });
    });
  }

  // --- Inline status (near email row) ---------------------------------------
  function ensureInlineStatusEl() {
    const existing = document.getElementById("provision-inline-status");
    if (existing) return existing;

    const emailEl = document.getElementById("email-input");
    if (!emailEl) return null;

    const el = document.createElement("div");
    el.id = "provision-inline-status";
    el.className = "provision-inline-status"; // optional CSS hook
    el.setAttribute("role", "alert");
    el.setAttribute("aria-live", "polite");
    el.style.display = "none";

    // Insert directly above the email input row
    const row = emailEl.closest(".row, .form-row, .field-row, .input-row") || emailEl.parentElement;
    if (row && row.parentNode) row.parentNode.insertBefore(el, row);
    else emailEl.parentNode?.insertBefore(el, emailEl);

    return el;
  }

  function clearInlineStatus() {
    const el = document.getElementById("provision-inline-status");
    if (!el) return;
    el.textContent = "";
    el.classList.remove("success", "error");
    el.style.display = "none";
  }

  function setInlineStatus(message, type /* 'success'|'error' */) {
    const el = ensureInlineStatusEl();
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("success", "error");
    el.classList.add(type === "success" ? "success" : "error");
    el.style.display = message ? "block" : "none";
  }

  // --- UI helpers ------------------------------------------------------------
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // fallback for older browsers / permissions
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return !!ok;
      } catch {
        return false;
      }
    }
  }

  function setStatusHTML(statusEl, html) {
    if (!statusEl) return;
    statusEl.innerHTML = html;
  }

  function setStatusText(statusEl, text) {
    if (!statusEl) return;
    statusEl.textContent = text;
  }

  // --- Main action -----------------------------------------------------------
  async function createAndSend() {
    const emailEl = document.getElementById("email-input");
    const btn = document.getElementById("provision-btn");
    const status = document.getElementById("provision-status");

    clearInlineStatus();

    const email = (emailEl?.value || "").trim().toLowerCase();
    const roles = collectSelectedRoles();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInlineStatus("Please enter a valid email address.", "error");
      emailEl?.focus?.();
      return;
    }

    const setBusy = (busy, text) => {
      if (!btn) return;
      btn.disabled = !!busy;
      if (typeof text === "string") btn.textContent = text;
    };

    const oldText = btn?.textContent || "Create Employee";
    setBusy(true, "Working…");
    setStatusText(status, "Creating employee and generating password setup link…");

    try {
      // Ensure we are signed in and get a *fresh* ID token
      const user = await waitForUser();
      if (!user) throw new Error("Sign in required");
      const idToken = await user.getIdToken(true);

      // Call the callable WITH idToken and roles[]
      const callable = getFns().httpsCallable("adminCreateEmployee");
      const res = await callable({ email, roles, idToken });

      const data = res?.data || {};
      const uid = data.uid;

      // ✅ Your function returns { uid, resetLink, emailSent }
      // (tolerate other variants too)
      const resetLink = data.resetLink || data.passwordSetupLink || data.link;

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
      } catch {
        /* leave finalLink as-is */
      }

      // Build status UI + buttons (still in the normal status area)
      setStatusHTML(
        status,
        `
        <div class="provision-result">
          <div class="provision-result-title">✅ Employee created. Setup link generated.</div>
          <div class="provision-result-meta">
            <div><b>Employee:</b> <code>employees/${uid}</code></div>
            <div><b>Assigned roles:</b> ${roles.map((r) => String(r)).join(", ")}</div>
          </div>

          <div class="provision-result-actions">
            <a class="btn btn-sm btn-ghost" id="open-setup-link" href="${finalLink}" target="_blank" rel="noopener">Open setup link</a>
            <button type="button" class="btn btn-sm btn-primary" id="copy-setup-link">Copy setup link</button>
          </div>

          <div id="copy-setup-hint" class="muted provision-result-hint" aria-live="polite"></div>
        </div>
      `
      );

      // Wire the copy button now that it exists
      const copyBtn = document.getElementById("copy-setup-link");
      const hintEl = document.getElementById("copy-setup-hint");

      const doCopy = async () => {
        const ok = await copyToClipboard(finalLink);
        if (hintEl) {
          hintEl.textContent = ok
            ? "Copied to clipboard."
            : "Couldn’t auto-copy — open the link and copy it from the address bar.";
        }
        if (copyBtn) {
          const prev = copyBtn.textContent;
          copyBtn.textContent = ok ? "Copied!" : "Copy failed";
          setTimeout(() => {
            if (copyBtn) copyBtn.textContent = prev;
          }, 1500);
        }
      };

      copyBtn?.addEventListener("click", doCopy);

      // Auto-copy once
      await doCopy();

      // Reset form & default Host checked
      if (emailEl) emailEl.value = "";
      document.querySelectorAll('input[name="roles"]:checked').forEach((cb) => (cb.checked = false));
      const host = document.querySelector('input[name="roles"][value="host"]');
      if (host) host.checked = true;

      // Clear any inline error
      clearInlineStatus();
    } catch (err) {
      console.error("[provision] error:", err);

      // Nicer messages for common callable error codes
      const code = err?.code || "";
      const msgRaw = err?.message || String(err);

      let msg = msgRaw;
      if (code === "already-exists" || /already exists|email already in use/i.test(msgRaw)) {
        msg = "That email is already in use. Choose the existing employee instead of creating a new one.";
      } else if (code === "permission-denied") {
        msg = "You do not have permission to create employees (admin only).";
      } else if (code === "unauthenticated") {
        msg = "You must be signed in to create employees.";
      }

      // ✅ Put the error where the user will see it immediately
      setInlineStatus(msg, "error");
      emailEl?.focus?.();

      // Keep existing behavior too (optional)
      if (status) status.innerHTML = `❌ ${msg}`;
      alert("Error: " + msg);
    } finally {
      setBusy(false, oldText);
    }
  }

  // --- Wire up ---------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("provision-btn")?.addEventListener("click", createAndSend);
    console.log("provision.js (inline error above email row)");
  });
})();