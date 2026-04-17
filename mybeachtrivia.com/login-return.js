// login-return.js
// Stores an optional same-origin after-login destination and selected role.
// Redirect decisions are handled by login.js / start-google.js.

(function () {
  "use strict";

  const AFTER_LOGIN_KEY = "afterLogin";
  const ROLE_STORAGE_KEY = "bt:selectedRole";

  function normalizePath(p) {
    if (!p) return "";
    try {
      const u = new URL(p, location.origin);
      if (u.origin !== location.origin) return "";
      return u.pathname + (u.search || "") + (u.hash || "");
    } catch {
      if (typeof p === "string" && p.startsWith("/")) return p;
      return "";
    }
  }

  function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
  }

  function saveAfterLogin(path) {
    sessionStorage.setItem(AFTER_LOGIN_KEY, path);
    try { localStorage.setItem(AFTER_LOGIN_KEY, path); } catch (_) {}
  }

  function clearAfterLogin() {
    sessionStorage.removeItem(AFTER_LOGIN_KEY);
    try { localStorage.removeItem(AFTER_LOGIN_KEY); } catch (_) {}
  }

  function saveSelectedRole(role) {
    const normalized = normalizeRole(role);
    if (!normalized) return;
    sessionStorage.setItem(ROLE_STORAGE_KEY, normalized);
    try { localStorage.setItem(ROLE_STORAGE_KEY, normalized); } catch (_) {}
  }

  try {
    const p = new URLSearchParams(location.search);

    const rawReturn =
      p.get("return") ||
      p.get("next") ||
      p.get("redirect") ||
      "";

    const afterLogin = normalizePath(rawReturn);

    if (afterLogin) {
      saveAfterLogin(afterLogin);
      console.log("[login-return] saved afterLogin =", afterLogin);
    } else {
      clearAfterLogin();
      console.log("[login-return] cleared afterLogin (no param)");
    }

    const role =
      p.get("role") ||
      p.get("dashboard") ||
      "";

    const normalizedRole = normalizeRole(role);
    if (normalizedRole) {
      saveSelectedRole(normalizedRole);
      console.log("[login-return] saved selected role =", normalizedRole);
    }
  } catch (e) {
    console.warn("[login-return] capture error", e);
  }
})();