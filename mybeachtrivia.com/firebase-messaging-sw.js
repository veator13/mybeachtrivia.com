/* mybeachtrivia.com/firebase-messaging-sw.js
 *
 * Background handler for FCM web push (Phase 8 of the shift-swap / time-off
 * feature). Served from the site root so its scope covers the whole site.
 *
 * Foreground messages are handled by beachTriviaPages/js/bt-push.js; this file
 * only runs when the page/browser is closed or backgrounded.
 */
/* eslint-disable no-undef */

importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
  authDomain: "mybeachtrivia.com",
  projectId: "beach-trivia-website",
  storageBucket: "beach-trivia-website.appspot.com",
  messagingSenderId: "459479368322",
  appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const n = payload.notification || {};
  const data = payload.data || {};
  const title = n.title || "Beach Trivia";
  const options = {
    body: n.body || "",
    icon: "/beachTriviaPages/images/BTlogo.png",
    badge: "/favicon-48x48.png",
    data: { link: data.link || n.click_action || "/" },
    tag: data.tag || undefined,
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  const url = link.startsWith("http") ? link : "https://mybeachtrivia.com" + link;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (const c of list) {
        if (c.url.indexOf(url) !== -1 && "focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
