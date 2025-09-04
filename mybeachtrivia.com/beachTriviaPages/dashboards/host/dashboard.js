/* dashboard.js — Host/Employee Dashboard (CSP-safe)
   - No inline JS required (no onclick, no inline <script>)
   - Centralizes all event wiring with addEventListener
   - Plays nice with your existing functions if they already exist
*/

(function () {
    'use strict';
  
    // ---------- Utilities ----------
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  
    function safeCall(fn, ...args) {
      try {
        if (typeof fn === 'function') return fn(...args);
      } catch (err) {
        console.error('[dashboard] safeCall error:', err);
      }
      return undefined;
    }
  
    // ---------- Auth / User Header ----------
    function initAuth() {
      if (typeof firebase === 'undefined' || !firebase.auth) {
        console.warn('[dashboard] Firebase Auth not available. Skipping auth init.');
        // Best-effort: still show remembered email if present
        const remembered = localStorage.getItem('rememberedEmail');
        if (remembered) renderUserHeader({ email: remembered });
        return;
      }
  
      firebase.auth().onAuthStateChanged((user) => {
        if (user) {
          renderUserHeader(user);
          // If you already have your own data loader, let it run.
          safeCall(window.initDashboardData, user);
        } else {
          // Not signed in → redirect to login
          try {
            window.location.href = '/login.html';
          } catch (e) {
            console.error('[dashboard] redirect failed:', e);
          }
        }
      });
    }
  
    function renderUserHeader(user) {
      const nameEl = $('.username');
      if (nameEl) {
        const label = user.displayName || user.email || 'User';
        nameEl.textContent = label;
      }
      const avatar = $('.profile-pic');
      if (avatar && user && user.photoURL) {
        avatar.src = user.photoURL;
        avatar.referrerPolicy = 'no-referrer';
        avatar.alt = (user.displayName || user.email || 'User') + ' profile image';
      }
    }
  
    // ---------- Logout ----------
    function handleLogout() {
      // Prefer an app-provided logout if present
      if (typeof window.logoutUser === 'function') return window.logoutUser();
  
      // Fallback using Firebase Auth if available
      try {
        if (typeof firebase !== 'undefined' && firebase.auth) {
          return firebase.auth().signOut().then(() => {
            sessionStorage.clear();
            localStorage.removeItem('rememberedEmail');
            window.location.href = '/login.html';
          }).catch((err) => {
            console.error('[dashboard] Error signing out:', err);
          });
        }
      } catch (e) {
        console.error('[dashboard] Logout fallback error:', e);
      }
  
      // Last resort
      sessionStorage.clear();
      localStorage.removeItem('rememberedEmail');
      window.location.href = '/login.html';
    }
  
    // ---------- Inline-text cleanup previously done inline ----------
    function removeLateText() {
      try {
        $$('#dashboard, body, html, *').forEach((el) => {
          // Match exact text as your old inline script did
          if (el && typeof el.textContent === 'string' && el.textContent === "Don't be late!") {
            el.style.display = 'none';
          }
        });
      } catch (_) {
        /* no-op */
      }
    }
  
    // ---------- Event Wiring (CSP-safe) ----------
    function setupEventListeners() {
      // Logout
      const logoutBtn = $('#logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
          e.preventDefault();
          handleLogout();
        });
      }
  
      // Navigation — use data-href attributes on buttons
      $$('.nav-btn[data-href]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const href = btn.getAttribute('data-href');
          if (href) window.location.href = href;
        });
      });
  
      // Add Task (if implemented elsewhere)
      const addTaskBtn = $('#add-task-btn');
      if (addTaskBtn) {
        addTaskBtn.addEventListener('click', (e) => {
          e.preventDefault();
          // If your app defines addTask(), this will call it.
          if (typeof window.addTask === 'function') {
            safeCall(window.addTask);
          } else {
            console.info('[dashboard] addTask() not implemented.');
          }
        });
      }
  
      // Replace prior inline timeout that hid "Don't be late!"
      setTimeout(removeLateText, 200);
    }
  
    // ---------- Optional: Load/Render Stats & Upcoming Shows ----------
    // If your project already does this elsewhere (e.g., existing functions that
    // print logs like "Month comparison", "In pay period?", etc.), you can keep those.
    // This stub simply defers to your existing functions if present.
    function initDashboardData(user) {
      // Prefer your existing loader if defined.
      if (typeof window.loadDashboardData === 'function') {
        return safeCall(window.loadDashboardData, user);
      }
  
      // Otherwise, you could implement your Firestore fetches here.
      // Leaving empty prevents conflicts with an existing implementation.
    }
  
    // Expose a minimal API if other scripts expect it
    window.handleLogout = handleLogout;
    window.initDashboardData = window.initDashboardData || initDashboardData;
  
    // ---------- Bootstrap ----------
    document.addEventListener('DOMContentLoaded', () => {
      setupEventListeners();
      initAuth();
    });
  })();
  