// Join Our Team — application form.
//
// Posts to the submitTeamApplication Cloud Function (same-origin via
// /api/team-application). The function does the spam checks + Firestore write +
// the "new application" email, so this file only validates and submits.

(function () {
  "use strict";

  const ENDPOINT = "/api/team-application";
  const ENDPOINT_FALLBACK =
    "https://us-central1-beach-trivia-website.cloudfunctions.net/submitTeamApplication";

  // When the page finished loading — used server-side as a bot signal
  // (a form filled + submitted in under a few seconds isn't a person).
  const startedAt = Date.now();

  document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("teamApplicationForm");
    if (!form) return;

    const loadingIndicator = document.getElementById("formLoading");
    const successBox = document.getElementById("formSuccess");
    const submitButton = form.querySelector(".submit-button");

    // ── inline field errors ────────────────────────────────────────────────
    function clearErrors() {
      form.querySelectorAll(".error-field").forEach((el) => el.classList.remove("error-field"));
      form.querySelectorAll(".field-error").forEach((el) => el.remove());
    }

    function markError(el, message) {
      if (!el) return;
      el.classList.add("error-field");
      const field = el.closest(".form-field") || el.parentElement;
      if (field && message && !field.querySelector(".field-error")) {
        const note = document.createElement("p");
        note.className = "field-error";
        note.textContent = message;
        field.appendChild(note);
      }
    }

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function validate() {
      clearErrors();
      let firstBad = null;

      form.querySelectorAll("[required]").forEach((field) => {
        const val = (field.value || "").trim();
        if (!val) {
          markError(field, "This field is required.");
          firstBad = firstBad || field;
        }
      });

      const email = document.getElementById("email");
      if (email && email.value && !EMAIL_RE.test(email.value.trim())) {
        markError(email, "Enter a valid email address.");
        firstBad = firstBad || email;
      }

      const phone = document.getElementById("phone");
      if (phone && phone.value && !/\d/.test(phone.value)) {
        markError(phone, "Enter a valid phone number.");
        firstBad = firstBad || phone;
      }

      const availability = form.querySelectorAll('input[name="availability"]:checked');
      if (!availability.length) {
        const group = form.querySelector(".checkbox-group");
        markError(group, "Pick at least one day.");
        if (group) firstBad = firstBad || group;
      }

      if (firstBad) {
        firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
        if (typeof firstBad.focus === "function") {
          try { firstBad.focus({ preventScroll: true }); } catch (_) { firstBad.focus(); }
        }
      }
      return !firstBad;
    }

    // ── collect ────────────────────────────────────────────────────────────
    function collect() {
      const data = {};
      new FormData(form).forEach((value, key) => {
        if (key === "availability") return; // handled as an array below
        data[key] = value;
      });
      data.availability = Array.from(
        form.querySelectorAll('input[name="availability"]:checked')
      ).map((cb) => cb.value);
      data.elapsedMs = Date.now() - startedAt;
      return data;
    }

    async function post(url, payload) {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => null);
      return { status: resp.status, json };
    }

    // ── submit ─────────────────────────────────────────────────────────────
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!validate()) return;

      if (loadingIndicator) loadingIndicator.style.display = "block";
      if (submitButton) submitButton.disabled = true;

      const payload = collect();

      let result = null;
      try {
        result = await post(ENDPOINT, payload);
        if (result.status === 404) result = await post(ENDPOINT_FALLBACK, payload);
      } catch (err) {
        console.error("[apply] network error:", err);
      }

      if (loadingIndicator) loadingIndicator.style.display = "none";

      if (result && result.json && result.json.ok) {
        form.style.display = "none";
        if (successBox) {
          successBox.style.display = "block";
          successBox.scrollIntoView({ behavior: "smooth" });
        }
        return;
      }

      if (submitButton) submitButton.disabled = false;

      if (result && result.status === 429) {
        alert("You've submitted a few times already. Please wait a bit and try again, or email jobs@beachtrivia.com.");
      } else if (result && result.json && result.json.error === "missing_fields") {
        (result.json.fields || []).forEach((name) => {
          markError(document.getElementById(name) || form.querySelector(`[name="${name}"]`), "Please complete this field.");
        });
        alert("Please complete all required fields correctly.");
      } else {
        alert("Something went wrong submitting your application. Please try again, or email jobs@beachtrivia.com.");
      }
    });

    // ── phone formatting as you type ───────────────────────────────────────
    const phoneInput = document.getElementById("phone");
    if (phoneInput) {
      phoneInput.addEventListener("input", function (e) {
        let v = e.target.value.replace(/\D/g, "").slice(0, 10);
        if (v.length > 6) v = v.slice(0, 3) + "-" + v.slice(3, 6) + "-" + v.slice(6);
        else if (v.length > 3) v = v.slice(0, 3) + "-" + v.slice(3);
        e.target.value = v;
      });
    }
  });
})();
