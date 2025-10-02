// beachTriviaPages/dashboards/admin/employees-management/provision.js
// v8 – Adds safe clipboard helper; keeps Gen 2 callable; refreshes table after success

(() => {
  const auth = firebase.auth();
  const db = firebase.firestore();
  const functions = firebase.app().functions("us-central1");

  // --- Safe clipboard helper (prevents NotAllowedError when tab not focused) ---
  async function copyToClipboardSafe(text) {
    try {
      if (document.hasFocus() && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Support both current and legacy element IDs
  const emailInput =
    document.getElementById("newEmployeeEmail") ||
    document.getElementById("email-input");

  const roleSelect =
    document.getElementById("newEmployeeRole") ||
    document.getElementById("role-input");

  const createAndSendBtn =
    document.getElementById("createAndSendBtn") ||
    document.getElementById("provision-btn");

  const statusEl =
    document.getElementById("createStatus") ||
    document.getElementById("provision-status");

  const linkEl = document.getElementById("setupLink");
  const linkRow = document.getElementById("linkRow");

  function setBusy(b) {
    if (!createAndSendBtn) return;
    createAndSendBtn.disabled = b;
    createAndSendBtn.textContent = b ? "Working..." : "Create & Send";
  }

  function showStatus(msg, type = "info") {
    if (!statusEl) {
      if (msg) console.log(`[provision] (${type})`, msg);
      return;
    }
    statusEl.textContent = msg || "";
    statusEl.className = "";
    if (msg) statusEl.classList.add(type === "error" ? "error" : "info");
  }

  function showLink(url) {
    if (linkEl) {
      linkEl.href = url;
      linkEl.textContent = url; // show the actual URL for easy copy
      linkEl.target = "_blank";
      linkEl.rel = "noopener";
    }
    if (linkRow) linkRow.style.display = "block";
  }

  function hideLink() {
    if (linkRow) linkRow.style.display = "none";
    if (linkEl) {
      linkEl.removeAttribute("href");
      linkEl.textContent = "";
    }
  }

  async function ensureAdminOrThrow() {
    const user = auth.currentUser;
    if (!user) throw new Error("Not signed in");

    const snap = await db.collection("employees").doc(user.uid).get();
    const d = snap.exists ? (snap.data() || {}) : {};
    const roles = Array.isArray(d.roles) ? d.roles : (d.role ? [d.role] : []);
    const isAdmin = d.active === true && roles.includes("admin");
    if (!isAdmin) throw new Error("Admin access required");
  }

  async function onCreateAndSend() {
    hideLink();
    showStatus("");
    setBusy(true);

    try {
      await ensureAdminOrThrow();

      const email = (emailInput?.value || "").trim().toLowerCase();
      const role = (roleSelect?.value || "host").trim().toLowerCase();
      if (!email) throw new Error("Email required");

      // Gen 2 callable
      const callCreate = functions.httpsCallable("adminCreateEmployee");
      const res = await callCreate({ email, role });
      const { uid, resetLink } = res.data || {};
      if (!resetLink) throw new Error("No link returned");

      // Show the link and attempt to copy (safe)
      showLink(resetLink);
      const copied = await copyToClipboardSafe(resetLink);

      showStatus(
        `Created/updated employees/${uid} as ${role}. ` +
          (copied
            ? "Password setup link copied to clipboard."
            : "Link shown below — click or copy it."),
        "info"
      );

      // 🔄 Refresh the employees table if the page exposes a helper
      try {
        if (typeof window.fetchEmployees === "function") {
          window.fetchEmployees();
        } else {
          document.dispatchEvent(new CustomEvent("employees:refresh"));
        }
      } catch (e) {
        console.warn("[provision] refresh hook failed:", e);
      }

      // Reset inputs for the next invite (optional)
      if (emailInput) emailInput.value = "";
      if (roleSelect) roleSelect.value = "host";
    } catch (err) {
      console.error("create+send failed:", err);
      const msg =
        err?.message || err?.data?.message || err?.code || "Create & send failed";
      showStatus(msg, "error");
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  // Wire up button
  if (createAndSendBtn) {
    createAndSendBtn.addEventListener("click", (e) => {
      e.preventDefault();
      onCreateAndSend();
    });
  } else {
    console.warn("[provision] createAndSendBtn not found in DOM");
  }

  // Init
  hideLink();
  showStatus("");
})();
